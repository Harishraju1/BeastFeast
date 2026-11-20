/**
 * SimWorld – owns the robots on a compiled track and advances them with a fixed timestep.
 *
 * Per step (dt, default 1 ms):
 *   1. each robot: battery → motors → wheels/tyres/casters → body velocities (physics.ts)
 *   2. positions integrated (semi-implicit Euler)
 *   3. contacts (walls, obstacles, robot–robot) detected and resolved with impulses + positional
 *      correction (collision.ts); sumo wedge lift evaluated for the next step
 *   4. competition logic: on-track / off-track, checkpoints (strict order), laps, ring-out, battery-low
 *
 * Competition rules implemented here:
 *  • Race / line: the robot's COM path between two steps is tested against checkpoint and start/finish
 *    segments. Checkpoints count only in index order. Crossing the finish line (or the start line when
 *    there is no finish piece; or a virtual 30 cm line through the start pose when neither exists) after
 *    all checkpoints completes a lap. Tracks without checkpoints require the robot to have travelled at
 *    least half of the total road/line length since the previous lap. `laps` in the TrackDef → "finish".
 *  • on-track: race = COM inside any road (|d| ≤ width/2); line = COM within 5 cm of a line centre.
 *  • Sumo: arena centred at the origin; a robot is `out` once its COM leaves the arena (border
 *    included) → one "ring-out" event. The time limit is enforced by the caller.
 *  • Wedge: if robot A (wedge > 0) touches robot B with its front face, B's tyre loads are multiplied by
 *    (1 − wedge_A) and the removed weight is added to A's loads, while the contact lasts.
 *  • Collision events: one per contact start; a new event needs ≥ 50 ms without contact.
 *  • Battery-low: once, when terminal voltage < 1.1 × minVoltage.
 *
 * Off-road terrain (only when track.terrain.active; flat tracks take the unchanged fast path):
 *  • Per robot, features that are solid for it (terrain.ts: isSolidFor, step limit = min(ground
 *    clearance, 0.6 × smallest driven wheel radius)) become collision obstacles, resolved with the same
 *    impulse code as track obstacles against a box enclosing the chassis AND the wheels, and are visible
 *    to that robot's distance sensors and bumpers. They are removed from that robot's height map.
 *  • Every step, for each wheel and caster contact point (world coords): ground height h and gradient
 *    ∇h (central differences over ±½ wheel radius, ±1 cm for casters: a wheel cannot feel features much
 *    smaller than itself, and this is what makes a step edge resist a wheel). With tan θ = |∇h|:
 *        slope force at the contact   F_i = −N_i·sin θ_i · ∇h/|∇h|   (N_i = static vertical load share)
 *        normal load                  N_i ← N_i·cos θ_i
 *    The forces (and their yaw torque about the COM) go to DriveEnv.extraForce / extraTorque; on a
 *    uniform slope they sum to m·g·sin θ downhill with zero torque. Mud under a contact sets its μ
 *    multiplier and extra rolling resistance (DriveEnv.wheelMu / wheelCrr / casterCrr).
 *  • Attitude: least-squares plane h = z + X·tan(pitch) + Y·tan(roll) through all contact heights
 *    (body frame, X forward, Y left; virtual points at the body ends / sides are added when the contacts
 *    are collinear). z = plane height at the body origin (the renderer adds the wheel radius).
 *  Limitations: no suspension (a rigid body resting on a plane fitted through its wheel contacts); no
 *  tipping or rollover; wheels never leave the ground (no jumps, no airtime); dynamic load transfer is
 *  ignored (static load shares); the chassis underside never touches the terrain (only features solid
 *  for the robot collide, in plan view); motion stays planar (along-slope distance is treated as
 *  horizontal distance, error 1 − cos θ); standing still on a slope with zero voltage creeps slowly
 *  (velocity-based tyre model, ≈ sin θ / 40 m/s), exactly as on the legacy ramps.
 */
import type { CompiledTrack, MotorCommands, Obstacle, Pose, RobotTelemetry, Segment, SensorReading, SimEvent, SimRobotSpec, TerrainSurfaceKind, Vec2 } from "./types";
import { GRAVITY, RobotDynamics, type DriveEnv } from "./physics";
import { obstacleContacts, robotContacts, resolveContacts, staticContacts, type Contact, type ContactKind } from "./collision";
import { buildFloor, insideArena, readSensor, type FloorModel, type PolylineIndex, type RayScene } from "./sensors";
import { hyp, invert3, pointInPolygon, segmentIntersect, type OBB } from "./geom";
import { isSolidFor, terrainStepLimit, TerrainSampler } from "../track/terrain";

export interface SimWorldOptions {
  dt?: number;
}

export const LINE_ON_TRACK_TOLERANCE = 0.05;
const COLLISION_DEBOUNCE_S = 0.05;

export interface RobotSnapshot {
  id: string;
  pose: Pose;
  /** height of the chassis reference above the flat floor (m) – ramps and terrain */
  z: number;
  /** body attitude from the terrain (rad): pitch + = nose up, roll + = left side up */
  pitch: number;
  roll: number;
  /** wheel rotation angles (rad) for spinning wheel meshes, keyed by wheel id */
  wheelAngles: Record<string, number>;
  speed: number;
  colliding: boolean;
  onTrack: boolean;
  out: boolean;
}

export interface WorldSnapshot {
  t: number;
  robots: RobotSnapshot[];
}

export interface RaceStatus {
  lap: number;
  lapTimes: number[];
  nextCheckpoint: number;
  checkpointCount: number;
  /** fraction (0..1) of the path from the start pose, by projection onto the centre-line */
  progress: number;
  finished: boolean;
}

export interface SimRobotTelemetry extends RobotTelemetry {
  race: RaceStatus;
  /** body-frame acceleration */
  ax: number;
  ay: number;
}

interface Runtime {
  spec: SimRobotSpec;
  initialPose: Pose;
  body: RobotDynamics;
  colliding: boolean;
  lastContactT: number;
  onTrack: boolean;
  out: boolean;
  lap: number;
  lapTimes: number[];
  lapStartT: number;
  lapStartDist: number;
  nextCp: number;
  finished: boolean;
  batteryLow: boolean;
  loadFactor: number;
  extraLoad: number;
  z: number;
  pitch: number;
  roll: number;
  /** off-road terrain state (null on flat tracks) */
  terrain: RobotTerrain | null;
}

/** Per-robot terrain data (precomputed from the spec) and per-step buffers. */
interface RobotTerrain {
  /** skip[i] = 1: feature i is solid for this robot (collision obstacle, not part of its height map) */
  skip: Uint8Array | null;
  solids: Obstacle[];
  /** track obstacles + this robot's terrain solids (sensor ray scene) */
  sceneObstacles: Obstacle[];
  stepLimit: number;
  /** body-frame box enclosing chassis and wheels (collides with terrain solids) */
  hull: { ox: number; oy: number; hx: number; hy: number };
  /** radius around the body origin covering every contact sample */
  reach: number;
  nW: number;
  nC: number;
  /** contact points (wheels, then casters) in the body frame, relative to the body origin */
  px: Float64Array;
  py: Float64Array;
  /** gradient half-step per contact (m) */
  delta: Float64Array;
  /** static vertical load per contact (N) */
  load: Float64Array;
  /** extra plane-fit points (body frame) for degenerate (collinear) contact layouts */
  vx: number[];
  vy: number[];
  fitInv: number[] | null;
  hs: Float64Array;
  wheelMu: Float64Array;
  wheelCrr: Float64Array;
  wheelLoad: Float64Array;
  casterLoad: Float64Array;
  casterCrr: Float64Array;
}

export class SimWorld {
  readonly track: CompiledTrack;
  readonly dt: number;
  time = 0;
  /** append-only event log (see drainEvents for incremental consumption) */
  events: SimEvent[] = [];
  private drained = 0;
  private stepCount = 0;
  private robots: Runtime[] = [];
  private readonly floor: FloorModel;
  private readonly finishSeg: Segment | null;
  private readonly startSeg: Segment | null;
  private readonly pathIndex: PolylineIndex;
  private readonly pathOffsets: number[];
  private readonly pathTotal: number;
  private readonly startS: number;
  private readonly robotDefs: { spec: SimRobotSpec; pose: Pose }[];
  /** terrain sampler (null on flat tracks → unchanged fast path) */
  private readonly sampler: TerrainSampler | null;
  /** contacts of the most recent step */
  lastContacts: Contact[] = [];

  constructor(track: CompiledTrack, robots: { spec: SimRobotSpec; pose: Pose }[], opts: SimWorldOptions = {}) {
    this.track = track;
    this.dt = opts.dt ?? 0.001;
    this.robotDefs = robots.map((r) => ({ spec: r.spec, pose: { ...r.pose } }));
    this.floor = buildFloor(track);
    this.sampler = track.terrain && track.terrain.active ? new TerrainSampler(track.terrain) : null;
    const kind = track.def.kind;
    this.pathIndex = kind === "race" ? this.floor.roads : this.floor.lines;
    this.pathOffsets = [];
    let acc = 0;
    for (const l of this.pathIndex.lengths) {
      this.pathOffsets.push(acc);
      acc += l;
    }
    this.pathTotal = acc;
    let start = track.startLine;
    if (!start && kind !== "sumo") {
      const p = track.def.start;
      const nx = -Math.sin(p.heading) * 0.15;
      const ny = Math.cos(p.heading) * 0.15;
      start = { a: { x: p.x - nx, y: p.y - ny }, b: { x: p.x + nx, y: p.y + ny } };
    }
    this.startSeg = start;
    this.finishSeg = track.finishLine ?? start;
    this.startS = this.pathS(track.def.start.x, track.def.start.y);
    this.reset();
  }

  get robotCount(): number {
    return this.robots.length;
  }

  /** Direct access to a robot's dynamics state (advanced use / debugging). */
  body(i: number): RobotDynamics {
    return this.robots[i].body;
  }

  reset(): void {
    this.time = 0;
    this.stepCount = 0;
    this.events = [];
    this.drained = 0;
    this.robots = this.robotDefs.map((d) => this.makeRuntime(d.spec, d.pose));
    this.robots.forEach((r) => {
      this.updateSurfaceState(r);
      if (r.terrain) this.applyTerrain(r, null);
    });
  }

  private makeRuntime(spec: SimRobotSpec, pose: Pose): Runtime {
    const body = new RobotDynamics(spec, pose);
    return {
      spec,
      initialPose: { ...pose },
      body,
      colliding: false,
      lastContactT: -Infinity,
      onTrack: true,
      out: false,
      lap: 0,
      lapTimes: [],
      lapStartT: 0,
      lapStartDist: 0,
      nextCp: 0,
      finished: false,
      batteryLow: false,
      loadFactor: 1,
      extraLoad: 0,
      z: 0,
      pitch: 0,
      roll: 0,
      terrain: this.sampler ? this.makeRobotTerrain(spec, body) : null,
    };
  }

  private makeRobotTerrain(spec: SimRobotSpec, body: RobotDynamics): RobotTerrain {
    const feats = this.track.terrain.features;
    const stepLimit = terrainStepLimit(spec);
    const skip = new Uint8Array(feats.length);
    const solids: Obstacle[] = [];
    feats.forEach((f, i) => {
      if (isSolidFor(f, stepLimit)) {
        skip[i] = 1;
        solids.push(f.solid!);
      }
    });
    let minX = -spec.length / 2;
    let maxX = spec.length / 2;
    let minY = -spec.width / 2;
    let maxY = spec.width / 2;
    for (const w of spec.wheels) {
      minX = Math.min(minX, w.x - w.radius);
      maxX = Math.max(maxX, w.x + w.radius);
      minY = Math.min(minY, w.y - w.width / 2);
      maxY = Math.max(maxY, w.y + w.width / 2);
    }
    const nW = spec.wheels.length;
    const nC = spec.casters.length;
    const pts = [
      ...spec.wheels.map((w) => ({ x: w.x, y: w.y, d: Math.max(0.004, 0.5 * w.radius) })),
      ...spec.casters.map((c) => ({ x: c.x, y: c.y, d: 0.01 })),
    ];
    const vx: number[] = [];
    const vy: number[] = [];
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const xRange = pts.length ? Math.max(...xs) - Math.min(...xs) : 0;
    const yRange = pts.length ? Math.max(...ys) - Math.min(...ys) : 0;
    if (xRange < 0.01) {
      vx.push(-spec.length / 2, spec.length / 2);
      vy.push(0, 0);
    }
    if (yRange < 0.01) {
      vx.push(0, 0);
      vy.push(-spec.width / 2, spec.width / 2);
    }
    const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const addFit = (X: number, Y: number) => {
      const row = [1, X, Y];
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[a * 3 + b] += row[a] * row[b];
    };
    pts.forEach((q) => addFit(q.x, q.y));
    vx.forEach((x, k) => addFit(x, vy[k]));
    const reach = Math.max(0.01, ...pts.map((q) => hyp(q.x, q.y) + q.d), ...vx.map((x, k) => hyp(x, vy[k]))) + 0.005;
    return {
      skip: solids.length ? skip : null,
      solids,
      sceneObstacles: [...this.track.obstacles, ...solids],
      stepLimit,
      hull: { ox: (minX + maxX) / 2, oy: (minY + maxY) / 2, hx: (maxX - minX) / 2, hy: (maxY - minY) / 2 },
      reach,
      nW,
      nC,
      px: Float64Array.from(pts.map((q) => q.x)),
      py: Float64Array.from(pts.map((q) => q.y)),
      delta: Float64Array.from(pts.map((q) => q.d)),
      load: Float64Array.from([...body.staticWheelLoad, ...body.staticCasterLoad]),
      vx,
      vy,
      fitInv: invert3(M),
      hs: new Float64Array(pts.length + vx.length),
      wheelMu: new Float64Array(nW).fill(1),
      wheelCrr: new Float64Array(nW),
      wheelLoad: new Float64Array(nW).fill(1),
      casterLoad: new Float64Array(nC).fill(1),
      casterCrr: new Float64Array(nC),
    };
  }

  /**
   * Terrain under robot r: per-contact heights, slope forces, load factors and mud; body attitude and z
   * from the least-squares plane (added to r.z, which already holds the legacy ramp height). With
   * env = null only z / pitch / roll are refreshed.
   */
  private applyTerrain(r: Runtime, env: DriveEnv | null): void {
    const T = r.terrain!;
    const sam = this.sampler!;
    const b = r.body;
    const p = b.pose;
    if (!sam.near(p.x, p.y, T.reach)) return; // nothing near: flat ground, no terrain inputs
    const c = Math.cos(p.heading);
    const s = Math.sin(p.heading);
    const skip = T.skip;
    const terrain = this.track.terrain;
    const mud = sam.hasMud;
    const nW = T.nW;
    const nP = T.nW + T.nC;
    let fx = 0;
    let fy = 0;
    let tz = 0;
    for (let k = 0; k < nP; k++) {
      const bx = T.px[k];
      const by = T.py[k];
      const wx = p.x + bx * c - by * s;
      const wy = p.y + bx * s + by * c;
      const d = T.delta[k];
      T.hs[k] = sam.height(wx, wy, skip);
      const gx = (sam.height(wx + d, wy, skip) - sam.height(wx - d, wy, skip)) / (2 * d);
      const gy = (sam.height(wx, wy + d, skip) - sam.height(wx, wy - d, skip)) / (2 * d);
      let cosT = 1;
      if (gx !== 0 || gy !== 0) {
        cosT = 1 / Math.sqrt(1 + gx * gx + gy * gy);
        const Fx = -T.load[k] * gx * cosT;
        const Fy = -T.load[k] * gy * cosT;
        fx += Fx;
        fy += Fy;
        tz += (wx - b.cx) * Fy - (wy - b.cy) * Fx;
      }
      let mu = 1;
      let crr = 0;
      if (mud) {
        const m = sam.mudAt(wx, wy);
        if (m && m.length) {
          const sf = terrain.surface(wx, wy);
          mu = sf.mu;
          crr = sf.crr;
        }
      }
      if (k < nW) {
        T.wheelLoad[k] = cosT;
        T.wheelMu[k] = mu;
        T.wheelCrr[k] = crr;
      } else {
        T.casterLoad[k - nW] = cosT;
        T.casterCrr[k - nW] = crr;
      }
    }
    for (let v = 0; v < T.vx.length; v++) {
      const bx = T.vx[v];
      const by = T.vy[v];
      T.hs[nP + v] = sam.height(p.x + bx * c - by * s, p.y + bx * s + by * c, skip);
    }
    // least-squares plane h = a + X·tan(pitch) + Y·tan(roll)
    let r0 = 0;
    let r1 = 0;
    let r2 = 0;
    for (let k = 0; k < nP; k++) {
      r0 += T.hs[k];
      r1 += T.px[k] * T.hs[k];
      r2 += T.py[k] * T.hs[k];
    }
    for (let v = 0; v < T.vx.length; v++) {
      const h = T.hs[nP + v];
      r0 += h;
      r1 += T.vx[v] * h;
      r2 += T.vy[v] * h;
    }
    const Mi = T.fitInv;
    if (Mi) {
      r.z += Mi[0] * r0 + Mi[1] * r1 + Mi[2] * r2;
      r.pitch = Math.atan(Mi[3] * r0 + Mi[4] * r1 + Mi[5] * r2);
      r.roll = Math.atan(Mi[6] * r0 + Mi[7] * r1 + Mi[8] * r2);
    } else {
      r.z += sam.height(p.x, p.y, skip);
    }
    if (env) {
      env.extraForce.x += fx;
      env.extraForce.y += fy;
      env.extraTorque = (env.extraTorque ?? 0) + tz;
      env.wheelLoad = T.wheelLoad;
      env.casterLoad = T.casterLoad;
      if (mud) {
        env.wheelMu = T.wheelMu;
        env.wheelCrr = T.wheelCrr;
        env.casterCrr = T.casterCrr;
      }
    }
  }

  /** Box enclosing chassis + wheels (world) – the shape that collides with terrain solids. */
  private hullOBB(r: Runtime): OBB {
    const h = r.terrain!.hull;
    const p = r.body.pose;
    const c = Math.cos(p.heading);
    const s = Math.sin(p.heading);
    return { cx: p.x + h.ox * c - h.oy * s, cy: p.y + h.ox * s + h.oy * c, hx: h.hx, hy: h.hy, rot: p.heading };
  }

  /** Teleport robot i (velocities zeroed). On-track state and events update on the next step. */
  setPose(i: number, pose: Pose): void {
    const r = this.robots[i];
    r.body.setPose(pose);
    if (r.terrain) {
      r.z = 0;
      r.pitch = 0;
      r.roll = 0;
      this.applyTerrain(r, null);
    }
  }

  /** New events since the last drain. */
  drainEvents(): SimEvent[] {
    const out = this.events.slice(this.drained);
    this.drained = this.events.length;
    return out;
  }

  private emit(robot: number, type: SimEvent["type"], detail?: string, value?: number): void {
    this.events.push({ t: this.time, robot, type, detail, value });
  }

  /** Arc-length position along the concatenated path polylines. */
  private pathS(x: number, y: number): number {
    if (this.pathTotal <= 0) return 0;
    const h = this.pathIndex.nearest(x, y, 0.3) ?? this.pathIndex.nearest(x, y);
    if (!h) return 0;
    return this.pathOffsets[h.poly] + h.s;
  }

  private updateSurfaceState(r: Runtime): void {
    const b = r.body;
    const kind = this.track.def.kind;
    if (kind === "race") r.onTrack = this.floor.roads.covered(b.cx, b.cy);
    else if (kind === "line") r.onTrack = this.floor.lines.nearest(b.cx, b.cy, LINE_ON_TRACK_TOLERANCE) !== null;
    else r.onTrack = !r.out;
  }

  /** One fixed physics step for all robots. commands[i] = motor voltages for robot i. */
  step(commands: (MotorCommands | undefined)[]): void {
    const dt = this.dt;
    const mu = this.track.def.surface.mu;
    const n = this.robots.length;

    // 1. drive forces → velocities
    for (let i = 0; i < n; i++) {
      const r = this.robots[i];
      const b = r.body;
      const env: DriveEnv = { surfaceMu: mu, extraForce: { x: 0, y: 0 }, loadFactor: r.loadFactor, extraLoad: r.extraLoad };
      r.z = 0;
      r.pitch = 0;
      r.roll = 0;
      for (const ramp of this.track.ramps) {
        if (pointInPolygon({ x: b.cx, y: b.cy }, ramp.polygon)) {
          const th = (ramp.slopeDeg * Math.PI) / 180;
          const f = b.mass * GRAVITY * Math.sin(th);
          env.extraForce.x -= ramp.uphill.x * f;
          env.extraForce.y -= ramp.uphill.y * f;
          env.loadFactor *= Math.cos(th);
          const p0 = ramp.polygon[0];
          r.z = Math.max(0, ((b.cx - p0.x) * ramp.uphill.x + (b.cy - p0.y) * ramp.uphill.y) * Math.tan(th));
          // attitude for telemetry / rendering only (does not change the ramp dynamics)
          const rel = b.heading - Math.atan2(ramp.uphill.y, ramp.uphill.x);
          r.pitch = Math.atan(Math.tan(th) * Math.cos(rel));
          r.roll = Math.atan(-Math.tan(th) * Math.sin(rel));
          break;
        }
      }
      if (r.terrain) this.applyTerrain(r, env);
      b.stepDrive(commands[i], env, dt);
    }

    // 2. positions
    const prev: Vec2[] = this.robots.map((r) => ({ x: r.body.cx, y: r.body.cy }));
    for (const r of this.robots) r.body.stepPosition(dt);

    // 3. contacts
    const contacts: Contact[] = [];
    const obbs: OBB[] = this.robots.map((r) => r.body.bodyOBB());
    for (let i = 0; i < n; i++) {
      staticContacts(i, obbs[i], this.track, contacts);
      const T = this.robots[i].terrain;
      if (T && T.solids.length) obstacleContacts(i, this.hullOBB(this.robots[i]), T.solids, this.track.obstacles.length, contacts);
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) robotContacts(i, obbs[i], j, obbs[j], contacts);
    const touching: (ContactKind | null)[] = this.robots.map(() => null);
    for (const c of contacts) {
      touching[c.a] = touching[c.a] ?? c.kind;
      if (c.b >= 0) touching[c.b] = touching[c.b] ?? c.kind;
    }
    resolveContacts(contacts, this.robots.map((r) => r.body));
    this.lastContacts = contacts;
    for (const r of this.robots) r.body.updateImu(dt);

    // wedge lift for the next step
    for (const r of this.robots) {
      r.loadFactor = 1;
      r.extraLoad = 0;
    }
    for (const c of contacts) {
      if (c.b < 0) continue;
      this.applyWedge(c.a, c.b, c, 1);
      this.applyWedge(c.b, c.a, c, -1);
    }

    this.time = ++this.stepCount * dt; // no floating-point drift

    // 4. events + competition logic
    for (let i = 0; i < n; i++) {
      const r = this.robots[i];
      const b = r.body;
      const kind = touching[i];
      if (kind) {
        if (!r.colliding && this.time - r.lastContactT > COLLISION_DEBOUNCE_S) this.emit(i, "collision", kind, Math.abs(b.forwardSpeed));
        r.colliding = true;
        r.lastContactT = this.time;
      } else r.colliding = false;

      const wasOn = r.onTrack;
      this.updateSurfaceState(r);
      if (this.track.def.kind === "sumo") {
        if (!r.out && this.track.arena && !insideArena(this.track.arena, b.cx, b.cy)) {
          r.out = true;
          r.onTrack = false;
          this.emit(i, "ring-out");
        }
      } else {
        if (wasOn && !r.onTrack) this.emit(i, "off-track");
        else if (!wasOn && r.onTrack) this.emit(i, "back-on-track");
        this.raceLogic(i, r, prev[i], { x: b.cx, y: b.cy });
      }

      if (!r.batteryLow && b.battery.terminalV < r.spec.battery.minVoltage * 1.1) {
        r.batteryLow = true;
        this.emit(i, "battery-low", undefined, b.battery.terminalV);
      }
    }
  }

  private applyWedge(a: number, other: number, c: Contact, sign: number): void {
    const A = this.robots[a];
    const w = A.spec.wedge ?? 0;
    if (w <= 0) return;
    const h = A.body.heading;
    const fx = Math.cos(h);
    const fy = Math.sin(h);
    // normal from A towards the other robot
    const nx = c.nx * sign;
    const ny = c.ny * sign;
    if (nx * fx + ny * fy < 0.7) return;
    const pose = A.body.pose;
    const lx = (c.px - pose.x) * fx + (c.py - pose.y) * fy;
    if (lx < A.spec.length / 2 - 0.015) return;
    const B = this.robots[other];
    const wl = Math.min(1, w);
    if (B.loadFactor > 1 - wl) {
      B.loadFactor = 1 - wl;
      A.extraLoad = wl * B.body.mass * GRAVITY;
    }
  }

  private raceLogic(i: number, r: Runtime, p0: Vec2, p1: Vec2): void {
    if (p0.x === p1.x && p0.y === p1.y) return;
    const cps = this.track.checkpoints;
    if (r.nextCp < cps.length) {
      const cp = cps[r.nextCp];
      if (segmentIntersect(p0, p1, cp.seg.a, cp.seg.b)) {
        this.emit(i, "checkpoint", `checkpoint ${cp.index}`, cp.index);
        r.nextCp++;
      }
    }
    const fin = this.finishSeg;
    if (fin && segmentIntersect(p0, p1, fin.a, fin.b)) {
      const travelled = r.body.distance - r.lapStartDist;
      const ok = cps.length > 0 ? r.nextCp >= cps.length : travelled >= 0.5 * Math.max(this.pathTotal, 0.5);
      if (ok) {
        const lapTime = this.time - r.lapStartT;
        r.lap++;
        r.lapTimes.push(lapTime);
        this.emit(i, "lap", `lap ${r.lap}`, lapTime);
        r.lapStartT = this.time;
        r.lapStartDist = r.body.distance;
        r.nextCp = 0;
        const target = this.track.def.laps;
        if (target && r.lap >= target && !r.finished) {
          r.finished = true;
          this.emit(i, "finish", undefined, this.time);
        }
      }
    }
  }

  /** Run for `seconds` of simulated time, asking the provider for commands before every step. */
  stepFor(seconds: number, commandsProvider: (t: number) => (MotorCommands | undefined)[]): void {
    const steps = Math.round(seconds / this.dt);
    for (let k = 0; k < steps; k++) this.step(commandsProvider(this.time));
  }

  private scene(exclude: number): RayScene {
    return {
      walls: this.track.walls,
      obstacles: this.robots[exclude]?.terrain?.sceneObstacles ?? this.track.obstacles,
      robots: this.robots.filter((_, j) => j !== exclude).map((r) => r.body.bodyOBB()),
    };
  }

  /** Current readings of all sensors of robot i, keyed by sensor id. */
  readSensors(robotIndex: number): Record<string, SensorReading> {
    const r = this.robots[robotIndex];
    const scene = this.scene(robotIndex);
    const out: Record<string, SensorReading> = {};
    for (const s of r.spec.sensors) out[s.id] = readSensor(s, r.body, this.floor, scene);
    return out;
  }

  raceStatus(i: number): RaceStatus {
    const r = this.robots[i];
    let progress = 0;
    if (this.pathTotal > 0) {
      const s = this.pathS(r.body.cx, r.body.cy);
      progress = (((s - this.startS) % this.pathTotal) + this.pathTotal) % this.pathTotal / this.pathTotal;
    }
    return {
      lap: r.lap,
      lapTimes: [...r.lapTimes],
      nextCheckpoint: r.nextCp,
      checkpointCount: this.track.checkpoints.length,
      progress,
      finished: r.finished,
    };
  }

  telemetry(robotIndex: number): SimRobotTelemetry {
    const r = this.robots[robotIndex];
    const b = r.body;
    const motorRpm: Record<string, number> = {};
    const motorCurrentA: Record<string, number> = {};
    const motorVoltage: Record<string, number> = {};
    b.motors.forEach((m, k) => {
      motorRpm[m.spec.id] = (b.motorOmega[k] * 60) / (2 * Math.PI);
      motorCurrentA[m.spec.id] = b.motorI[k];
      motorVoltage[m.spec.id] = b.motorV[k];
    });
    const wheelRpm: Record<string, number> = {};
    const wheelSlip: Record<string, number> = {};
    r.spec.wheels.forEach((w, k) => {
      const om = b.wheelOmega[k];
      wheelRpm[w.id] = (om * 60) / (2 * Math.PI);
      const vw = om * Math.max(1e-3, w.radius);
      const v = b.wheelVLong[k];
      const sl = (vw - v) / Math.max(Math.abs(vw), Math.abs(v), 0.05);
      wheelSlip[w.id] = sl > 1 ? 1 : sl < -1 ? -1 : sl;
    });
    const pose = b.pose;
    const surface: TerrainSurfaceKind = this.sampler ? this.track.terrain.surface(pose.x, pose.y).kind : "ground";
    return {
      pose,
      speed: b.forwardSpeed,
      vx: b.vx,
      vy: b.vy,
      yawRate: b.omega,
      motorRpm,
      motorCurrentA,
      motorVoltage,
      batteryVoltage: b.battery.terminalV,
      batteryUsed_mAh: b.battery.used_mAh,
      distance: b.distance,
      colliding: r.colliding,
      onTrack: r.onTrack,
      out: r.out,
      race: this.raceStatus(robotIndex),
      ax: b.ax,
      ay: b.ay,
      wheelRpm,
      wheelSlip,
      surface,
      pitch: r.pitch,
      roll: r.roll,
      z: r.z,
    };
  }

  getSnapshot(): WorldSnapshot {
    return {
      t: this.time,
      robots: this.robots.map((r) => {
        const wheelAngles: Record<string, number> = {};
        r.spec.wheels.forEach((w, k) => (wheelAngles[w.id] = r.body.wheelAngle[k]));
        return {
          id: r.spec.id,
          pose: r.body.pose,
          z: r.z,
          pitch: r.pitch,
          roll: r.roll,
          wheelAngles,
          speed: r.body.forwardSpeed,
          colliding: r.colliding,
          onTrack: r.onTrack,
          out: r.out,
        };
      }),
    };
  }
}
