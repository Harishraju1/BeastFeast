/**
 * Planar rigid-body vehicle dynamics for student robots.
 *
 * The engine only ever receives motor terminal voltages. Everything else – wheel spin, tyre slip,
 * body motion, battery sag – emerges from the models below. Nothing here knows about tracks, lines
 * or the robot's goal.
 *
 * ── Model summary ──────────────────────────────────────────────────────────────────────────────
 * DC motor (per motor, referred to the gearbox output shaft, linear brushed-DC model):
 *   R   = V_nom / I_stall                         armature resistance
 *   ω_f = noLoadRpm·2π/60                         free speed at V_nom
 *   k_e = (V_nom − I_noload·R) / ω_f              back-EMF constant (V·s/rad, output shaft)
 *   k_t = τ_stall / I_stall                       torque constant (N·m/A, output shaft)
 *   b   = k_t·I_noload / ω_f                      viscous gearbox/bearing loss
 *   I   = (V − k_e·ω) / R
 *   τ   = k_t·I − b·ω  ≡  τ_stall·(V/V_nom) − (τ_stall/ω_f)·ω       (identical, by construction)
 *   A motor command that is missing / NaN means "coast" (open H-bridge): I = 0, τ = −b·ω.
 *   A command of 0 V means the terminals are driven to 0 V (dynamic braking through back-EMF).
 *   `invert` flips the sign between motor and wheel rotation.
 *
 * Wheel (own angular velocity state ω_w, inertia J_w):
 *   J_w = ½·m_w·r² + τ_mech·(τ_stall/ω_f)      (rim + rotor inertia reflected through the gearbox;
 *                                                m_w estimated from wheel size, τ_mech = 15 ms)
 *   J_w·dω/dt = τ_motor/n − r·F_long            (n = number of wheels sharing that motor)
 *
 * Tyre (velocity-slip model with friction circle, μ = wheel.mu × surface.mu, N = normal load):
 *   F_long = C_s·(ω_w·r − v_long),   C_s = 40·N  [N per m/s of slip velocity]
 *   F_lat  = −C_α·v_lat,             C_α = 40·N
 *   |F| ≤ μN (both components scaled down together when saturated).
 *   The wheel update is solved implicitly for the unsaturated case (stable at dt = 1 ms for any mass),
 *   and the lateral force is additionally limited so it can at most cancel the wheel's share of the
 *   lateral momentum in one step (prevents explicit-Euler overshoot on very light robots).
 *   Rolling resistance: F_rr = −0.01·N·tanh(v_long/0.01) on every wheel.
 *
 * Casters: carry static load, swivel freely → produce only rolling resistance opposite to their
 *   contact-point velocity: F = −crr·N·v/max(|v|, 0.02). No lateral friction (documented choice).
 *
 * Static load distribution: weighted least-norm solution of ΣN = m·g and zero roll/pitch moment about
 *   the COM (exact for 3 contacts). Casters get 1/4 the "stiffness" weight of wheels for 4+ contacts.
 *   Negative loads are clamped and re-solved. Dynamic load transfer is ignored.
 *
 * Body drag: F = −0.05·m·v (viscous, N per m/s), yaw damping M = −0.5·I_z·ω. Robots coast to a stop.
 *
 * Battery: V_oc = V_max − (V_max − V_min)·(used/capacity); V_term = V_oc − I_batt·R_int (≥ 0),
 *   I_batt = 0.05 A (electronics) + max(0, Σ V_i·I_i)/V_term (H-bridge/PWM power balance),
 *   computed from the previous step (1-step lag). Commanded voltages are clamped to ±V_term.
 *
 * Ramps: inside a ramp polygon a force m·g·sin(slope) acts downhill and loads scale by cos(slope).
 *
 * Integration: fixed dt (default 1 ms), semi-implicit (symplectic) Euler: forces → velocities →
 *   (collision impulses, done by the world) → positions. Fully deterministic (no randomness, fixed
 *   iteration order).
 */
import type { MotorCommands, Pose, SimMotorSpec, SimRobotSpec, Vec2 } from "./types";
import type { OBB } from "./geom";

export const GRAVITY = 9.81;

/** Tunable physical constants (documented in the module header). */
export const PHYS = {
  /** longitudinal slip stiffness per newton of normal load [1/(m/s)] */
  tyreCsPerN: 40,
  /** lateral slip stiffness per newton of normal load [1/(m/s)] */
  tyreCaPerN: 40,
  /** wheel rolling resistance coefficient */
  wheelCrr: 0.01,
  /** velocity scale of the smoothed Coulomb rolling resistance (m/s) */
  rrSmoothing: 0.01,
  casterSmoothing: 0.02,
  /** viscous body drag per kg [N/(m/s)/kg] */
  linearDragPerKg: 0.05,
  /** yaw damping as multiple of yaw inertia [1/s] */
  yawDamping: 0.5,
  /** mechanical time constant used to estimate reflected rotor inertia (s) */
  motorTauMech: 0.015,
  /** bearing drag of free (unpowered) wheels [N·m/(rad/s)] */
  freeWheelDrag: 1e-5,
  /** electronics quiescent current (A) */
  quiescentCurrent: 0.05,
  /** caster weight in the static load least-norm solve (wheels = 1) */
  casterLoadWeight: 0.25,
};

// ───────────────────────────── Motor ─────────────────────────────

export interface MotorModel {
  spec: SimMotorSpec;
  R: number;
  ke: number;
  kt: number;
  b: number;
  omegaFree: number;
  tauStall: number;
  /** -1 when inverted */
  sign: number;
  /** wheel indices driven by this motor */
  wheels: number[];
  /** reflected rotor inertia at the output shaft */
  Jreflected: number;
}

export function motorModel(spec: SimMotorSpec): MotorModel {
  const Vn = Math.max(1e-6, spec.nominalVoltage);
  const Is = Math.max(1e-6, spec.stallCurrentA);
  const Inl = Math.min(Math.max(0, spec.noLoadCurrentA), Is * 0.9);
  const R = Vn / Is;
  const omegaFree = Math.max(1e-6, (spec.noLoadRpm * 2 * Math.PI) / 60);
  const ke = (Vn - Inl * R) / omegaFree;
  const tauStall = Math.max(1e-9, spec.stallTorqueNm);
  const kt = tauStall / Is;
  const b = (kt * Inl) / omegaFree;
  return {
    spec,
    R,
    ke,
    kt,
    b,
    omegaFree,
    tauStall,
    sign: spec.invert ? -1 : 1,
    wheels: [],
    Jreflected: PHYS.motorTauMech * (tauStall / omegaFree),
  };
}

/** Output-shaft torque for applied voltage V at shaft speed ω (rad/s). */
export function motorTorque(m: MotorModel, V: number, omega: number): number {
  return (m.kt * (V - m.ke * omega)) / m.R - m.b * omega;
}

/** Armature current for applied voltage V at shaft speed ω. */
export function motorCurrent(m: MotorModel, V: number, omega: number): number {
  return (V - m.ke * omega) / m.R;
}

// ───────────────────────────── Battery ─────────────────────────────

export function batteryOpenCircuit(b: SimRobotSpec["battery"], used_mAh: number): number {
  const frac = Math.min(1, Math.max(0, used_mAh / Math.max(1e-9, b.capacity_mAh)));
  return b.maxVoltage - (b.maxVoltage - b.minVoltage) * frac;
}

export function batteryTerminal(b: SimRobotSpec["battery"], used_mAh: number, currentA: number): number {
  return Math.max(0, batteryOpenCircuit(b, used_mAh) - currentA * b.internalResistance);
}

// ───────────────────────────── Loads ─────────────────────────────

function solve3(M: number[][], r: number[]): number[] | null {
  const [a, b, c] = M;
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (!isFinite(det) || Math.abs(det) < 1e-18) return null;
  const inv = 1 / det;
  const x = (r[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (r[1] * c[2] - b[2] * r[2]) + a[2] * (r[1] * c[1] - b[1] * r[2])) * inv;
  const y = (a[0] * (r[1] * c[2] - b[2] * r[2]) - r[0] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * r[2] - r[1] * c[0])) * inv;
  const z = (a[0] * (b[1] * r[2] - r[1] * c[1]) - a[1] * (b[0] * r[2] - r[1] * c[0]) + r[0] * (b[0] * c[1] - b[1] * c[0])) * inv;
  return [x, y, z];
}

/**
 * Static normal load on each contact (wheels first, then casters), in newtons.
 * Weighted least-norm solution of force + moment balance about the COM; negatives clamped.
 */
export function staticNormalLoads(spec: SimRobotSpec, g = GRAVITY): { wheels: number[]; casters: number[] } {
  const pts: { x: number; y: number; k: number }[] = [
    ...spec.wheels.map((w) => ({ x: w.x - spec.com.x, y: w.y - spec.com.y, k: 1 })),
    ...spec.casters.map((c) => ({ x: c.x - spec.com.x, y: c.y - spec.com.y, k: PHYS.casterLoadWeight })),
  ];
  const W = spec.massKg * g;
  const n = pts.length;
  const loads = new Array<number>(n).fill(0);
  if (n === 0) return { wheels: [], casters: [] };
  const active = pts.map(() => true);
  for (let iter = 0; iter < n + 1; iter++) {
    // M = A K Aᵀ for rows [1, x, y]
    const M = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      const row = [1, pts[i].x, pts[i].y];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) M[r][c] += pts[i].k * row[r] * row[c];
    }
    let lam = solve3(M, [W, 0, 0]);
    if (!lam) {
      // Degenerate geometry (collinear contacts): satisfy force + the solvable moment only.
      const eps = 1e-9 * (M[0][0] + 1);
      const Mr = M.map((row, i) => row.map((v, j) => v + (i === j ? eps : 0)));
      lam = solve3(Mr, [W, 0, 0]);
    }
    let ok = !!lam;
    if (lam) {
      for (let i = 0; i < n; i++) {
        loads[i] = active[i] ? pts[i].k * (lam[0] + lam[1] * pts[i].x + lam[2] * pts[i].y) : 0;
        if (!isFinite(loads[i])) ok = false;
      }
    }
    const sum = loads.reduce((s, v) => s + v, 0);
    if (!ok || Math.abs(sum - W) > 0.02 * W) {
      // fallback: share by weight
      const kSum = pts.reduce((s, p, i) => s + (active[i] ? p.k : 0), 0) || 1;
      for (let i = 0; i < n; i++) loads[i] = active[i] ? (W * pts[i].k) / kSum : 0;
      break;
    }
    let neg = false;
    for (let i = 0; i < n; i++) {
      if (active[i] && loads[i] < 0) {
        active[i] = false;
        neg = true;
      }
    }
    if (!neg) break;
    if (!active.some((a) => a)) {
      active.fill(true);
      for (let i = 0; i < n; i++) loads[i] = W / n;
      break;
    }
  }
  for (let i = 0; i < n; i++) loads[i] = Math.max(0, loads[i]);
  return { wheels: loads.slice(0, spec.wheels.length), casters: loads.slice(spec.wheels.length) };
}

/** Yaw inertia: spec value or a uniform box about the COM. */
export function yawInertia(spec: SimRobotSpec): number {
  if (spec.inertia && spec.inertia > 0) return spec.inertia;
  const box = (spec.massKg * (spec.length * spec.length + spec.width * spec.width)) / 12;
  return box + spec.massKg * (spec.com.x * spec.com.x + spec.com.y * spec.com.y);
}

// ───────────────────────────── Robot dynamics ─────────────────────────────

/** Per-step environment the world supplies to each robot. */
export interface DriveEnv {
  surfaceMu: number;
  /** extra world-frame force (e.g. ramp gravity component), N */
  extraForce: Vec2;
  /** multiplier on own normal loads (wedge lift by an opponent, ramp cos) */
  loadFactor: number;
  /** additional normal load (N) pressed onto this robot (opponent lifted onto our wedge) */
  extraLoad: number;
}

export class RobotDynamics {
  readonly spec: SimRobotSpec;
  readonly mass: number;
  readonly inertia: number;
  readonly invMass: number;
  readonly invInertia: number;
  readonly motors: MotorModel[];
  /** wheel index -> motor index or -1 */
  readonly wheelMotor: number[];
  readonly wheelJ: number[];
  readonly staticWheelLoad: number[];
  readonly staticCasterLoad: number[];

  // ── state (COM based) ──
  cx = 0;
  cy = 0;
  heading = 0;
  vx = 0;
  vy = 0;
  omega = 0;
  wheelOmega: number[];
  wheelAngle: number[];
  motorV: number[];
  motorI: number[];
  motorOmega: number[];
  wheelLoad: number[];
  battery = { used_mAh: 0, current: 0, terminalV: 0, openV: 0 };
  distance = 0;
  /** body-frame acceleration (m/s²) from the last step */
  ax = 0;
  ay = 0;
  private pvx = 0;
  private pvy = 0;

  constructor(spec: SimRobotSpec, pose: Pose) {
    this.spec = spec;
    this.mass = Math.max(1e-3, spec.massKg);
    this.inertia = Math.max(1e-7, yawInertia(spec));
    this.invMass = 1 / this.mass;
    this.invInertia = 1 / this.inertia;
    this.motors = spec.motors.map(motorModel);
    this.wheelMotor = spec.wheels.map((w) => (w.motorId ? spec.motors.findIndex((m) => m.id === w.motorId) : -1));
    this.wheelMotor.forEach((mi, wi) => {
      if (mi >= 0) this.motors[mi].wheels.push(wi);
    });
    this.wheelJ = spec.wheels.map((w, i) => {
      const r = Math.max(1e-3, w.radius);
      const vol = Math.PI * r * r * Math.max(0.005, w.width);
      const mWheel = Math.min(0.5, 1200 * vol * 0.5);
      let J = 0.5 * mWheel * r * r;
      const mi = this.wheelMotor[i];
      if (mi >= 0) J += this.motors[mi].Jreflected / Math.max(1, this.motors[mi].wheels.length);
      return Math.max(J, 1e-7);
    });
    const loads = staticNormalLoads(spec);
    this.staticWheelLoad = loads.wheels;
    this.staticCasterLoad = loads.casters;
    this.wheelOmega = spec.wheels.map(() => 0);
    this.wheelAngle = spec.wheels.map(() => 0);
    this.wheelLoad = [...loads.wheels];
    this.motorV = this.motors.map(() => 0);
    this.motorI = this.motors.map(() => 0);
    this.motorOmega = this.motors.map(() => 0);
    this.setPose(pose);
    this.battery.openV = batteryOpenCircuit(spec.battery, 0);
    this.battery.terminalV = this.battery.openV;
  }

  /** Pose of the body origin (rectangle centre). */
  get pose(): Pose {
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    const { x, y } = this.spec.com;
    return { x: this.cx - (x * c - y * s), y: this.cy - (x * s + y * c), heading: this.heading };
  }

  /** Teleport (velocities and wheel speeds reset to zero). */
  setPose(p: Pose): void {
    const c = Math.cos(p.heading);
    const s = Math.sin(p.heading);
    const { x, y } = this.spec.com;
    this.cx = p.x + x * c - y * s;
    this.cy = p.y + x * s + y * c;
    this.heading = p.heading;
    this.vx = this.vy = this.omega = 0;
    this.pvx = this.pvy = 0;
    this.ax = this.ay = 0;
    this.wheelOmega.fill(0);
  }

  /** Signed forward speed of the COM (m/s). */
  get forwardSpeed(): number {
    return this.vx * Math.cos(this.heading) + this.vy * Math.sin(this.heading);
  }

  bodyOBB(): OBB {
    const p = this.pose;
    return { cx: p.x, cy: p.y, hx: this.spec.length / 2, hy: this.spec.width / 2, rot: p.heading };
  }

  /** World velocity of a world point rigidly attached to the body. */
  pointVelocity(px: number, py: number): Vec2 {
    const rx = px - this.cx;
    const ry = py - this.cy;
    return { x: this.vx - this.omega * ry, y: this.vy + this.omega * rx };
  }

  applyImpulse(px: number, py: number, jx: number, jy: number): void {
    this.vx += jx * this.invMass;
    this.vy += jy * this.invMass;
    const rx = px - this.cx;
    const ry = py - this.cy;
    this.omega += (rx * jy - ry * jx) * this.invInertia;
  }

  /**
   * Motor + tyre + battery update: computes all forces from the commanded voltages and advances the
   * body velocities and wheel speeds by dt. Positions are advanced separately (stepPosition) so the
   * world can resolve contacts in between.
   */
  stepDrive(cmds: MotorCommands | undefined, env: DriveEnv, dt: number): void {
    const spec = this.spec;
    this.pvx = this.vx;
    this.pvy = this.vy;

    // ── battery terminal voltage (previous-step current) ──
    const bat = this.battery;
    bat.openV = batteryOpenCircuit(spec.battery, bat.used_mAh);
    bat.terminalV = Math.max(0, bat.openV - bat.current * spec.battery.internalResistance);
    const Vt = bat.terminalV;

    // ── motor linearisation τ = a − k·ω_m ──
    const nM = this.motors.length;
    const motorA = new Array<number>(nM);
    const motorK = new Array<number>(nM);
    const coast = new Array<boolean>(nM);
    for (let m = 0; m < nM; m++) {
      const mm = this.motors[m];
      const raw = cmds ? cmds[mm.spec.id] : undefined;
      if (raw === undefined || raw === null || !isFinite(raw)) {
        coast[m] = true;
        this.motorV[m] = 0;
        motorA[m] = 0;
        motorK[m] = mm.b;
      } else {
        coast[m] = false;
        const V = raw > Vt ? Vt : raw < -Vt ? -Vt : raw;
        this.motorV[m] = V;
        motorA[m] = (mm.kt * V) / mm.R;
        motorK[m] = (mm.kt * mm.ke) / mm.R + mm.b;
      }
    }

    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    const comx = spec.com.x;
    const comy = spec.com.y;
    const mu0 = env.surfaceMu;

    // total contact load for share computations
    const nW = spec.wheels.length;
    const nC = spec.casters.length;
    let staticTotal = 0;
    for (let i = 0; i < nW; i++) staticTotal += this.staticWheelLoad[i];
    for (let i = 0; i < nC; i++) staticTotal += this.staticCasterLoad[i];
    const extraPerN = staticTotal > 0 ? env.extraLoad / staticTotal : 0;
    const lf = env.loadFactor;

    let fx = env.extraForce.x;
    let fy = env.extraForce.y;
    let tz = 0;
    const m = this.mass;
    const totalLoadNow = staticTotal * lf + env.extraLoad || 1;

    // ── wheels ──
    for (let i = 0; i < nW; i++) {
      const w = spec.wheels[i];
      const N = this.staticWheelLoad[i] * (lf + extraPerN);
      this.wheelLoad[i] = N;
      const rbx = w.x - comx;
      const rby = w.y - comy;
      const rx = rbx * c - rby * s; // world lever arm
      const ry = rbx * s + rby * c;
      const pvx = this.vx - this.omega * ry;
      const pvy = this.vy + this.omega * rx;
      const vLong = pvx * c + pvy * s;
      const vLat = -pvx * s + pvy * c;
      const r = Math.max(1e-3, w.radius);
      const J = this.wheelJ[i];
      const mi = this.wheelMotor[i];
      let tA = 0; // drive torque constant part on this wheel
      let tK = PHYS.freeWheelDrag; // damping on this wheel
      if (mi >= 0) {
        const mm = this.motors[mi];
        const share = 1 / mm.wheels.length;
        tA = mm.sign * motorA[mi] * share;
        tK = motorK[mi] * share;
      }
      const om0 = this.wheelOmega[i];
      const mu = Math.max(0, w.mu * mu0);
      const Fmax = mu * N;
      const Cs = PHYS.tyreCsPerN * N;
      const Ca = PHYS.tyreCaPerN * N;
      // implicit unsaturated wheel update
      let om = (J * om0 + dt * (tA + Cs * r * vLong)) / (J + dt * tK + dt * Cs * r * r);
      let FL = Cs * (om * r - vLong);
      let FT = -Ca * vLat;
      const mShare = (m * N) / totalLoadNow;
      const ftCap = (mShare * Math.abs(vLat)) / dt;
      if (Math.abs(FT) > ftCap) FT = Math.sign(FT) * ftCap;
      const Fmag = Math.sqrt(FL * FL + FT * FT);
      if (Fmag > Fmax) {
        const k = Fmax / Fmag;
        FL *= k;
        FT *= k;
        om = (J * om0 + dt * (tA - r * FL)) / (J + dt * tK);
      }
      // rolling resistance (on body)
      const Frr = -PHYS.wheelCrr * N * Math.tanh(vLong / PHYS.rrSmoothing);
      this.wheelOmega[i] = om;
      this.wheelAngle[i] += om * dt;
      const fl = FL + Frr;
      const wfx = fl * c - FT * s;
      const wfy = fl * s + FT * c;
      fx += wfx;
      fy += wfy;
      tz += rx * wfy - ry * wfx;
    }

    // ── casters ──
    for (let i = 0; i < nC; i++) {
      const cs = spec.casters[i];
      const N = this.staticCasterLoad[i] * (lf + extraPerN);
      const rbx = cs.x - comx;
      const rby = cs.y - comy;
      const rx = rbx * c - rby * s;
      const ry = rbx * s + rby * c;
      const pvx = this.vx - this.omega * ry;
      const pvy = this.vy + this.omega * rx;
      const sp = Math.sqrt(pvx * pvx + pvy * pvy);
      const f = (Math.max(0, cs.crr) * N) / Math.max(sp, PHYS.casterSmoothing);
      const cfx = -f * pvx;
      const cfy = -f * pvy;
      fx += cfx;
      fy += cfy;
      tz += rx * cfy - ry * cfx;
    }

    // ── drag ──
    fx -= PHYS.linearDragPerKg * m * this.vx;
    fy -= PHYS.linearDragPerKg * m * this.vy;
    tz -= PHYS.yawDamping * this.inertia * this.omega;

    // ── integrate velocities ──
    this.vx += fx * this.invMass * dt;
    this.vy += fy * this.invMass * dt;
    this.omega += tz * this.invInertia * dt;

    // ── motor electrical state + battery ──
    let pElec = 0;
    for (let mI = 0; mI < nM; mI++) {
      const mm = this.motors[mI];
      let wsum = 0;
      for (const wi of mm.wheels) wsum += this.wheelOmega[wi];
      const omM = mm.wheels.length ? (mm.sign * wsum) / mm.wheels.length : 0;
      this.motorOmega[mI] = omM;
      const I = coast[mI] ? 0 : motorCurrent(mm, this.motorV[mI], omM);
      this.motorI[mI] = I;
      pElec += this.motorV[mI] * I;
    }
    bat.current = PHYS.quiescentCurrent + (Vt > 0.1 ? Math.max(0, pElec) / Vt : 0);
    bat.used_mAh += (bat.current * dt * 1000) / 3600;
  }

  /** Advance pose by the current velocities. */
  stepPosition(dt: number): void {
    const dx = this.vx * dt;
    const dy = this.vy * dt;
    this.cx += dx;
    this.cy += dy;
    this.heading += this.omega * dt;
    this.distance += Math.sqrt(dx * dx + dy * dy);
  }

  /** Update IMU body-frame accelerations once all velocity changes of the step are applied. */
  updateImu(dt: number): void {
    const awx = (this.vx - this.pvx) / dt;
    const awy = (this.vy - this.pvy) / dt;
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    this.ax = awx * c + awy * s;
    this.ay = -awx * s + awy * c;
  }
}
