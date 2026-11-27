/**
 * Circuit bench simulator — the "live circuit" inside Circuit Studio.
 *
 * Runs the student's code (BEAST interpreter) against the SAME electrical bridge the arena uses, but with the
 * robot on a test bench: no chassis physics, motors spin freely. Each step it computes
 *   - motor terminal voltage → speed (first-order DC motor model from the part's own data), current, direction;
 *   - battery terminal voltage (open-circuit voltage from state of charge − I·R), current, power, charge drain;
 *   - LED / resistor currents and power through the DC solver;
 *   - which wires carry current and in which direction (conventional current, + → load → −).
 *
 * Sensor values are supplied by the student (sliders) because there is no world on the bench. Nothing is
 * faked: if a part is not modelled it is listed in `notSimulated`, and a short circuit stops the bench.
 */
import { ArduinoRuntime, compile, getBoard } from "@/lib/arduino";
import type { DeviceObj } from "@/lib/arduino/interpreter";
import type { CompileResult, RuntimeStatus } from "@/lib/arduino";
import { RobotElectrical } from "@/lib/robot/bridge";
import { motorParams } from "@/lib/robot/model";
import { batteryPack, type CircuitGraph, type Net, pinKey } from "@/lib/circuit/nets";
import { solveDc, type DcElementResult } from "./dc";
import { supportOf } from "@/lib/components/support";
import type { Project, Wire } from "@/lib/types";
import type { RobotTelemetry, SensorReading } from "./types";

export interface BenchMotor {
  volts: number | null; // null = terminals floating (coasting)
  rpm: number;
  currentA: number;
  noLoadRpm: number;
  trace: string;
}

export interface WireFlow {
  kind: "power" | "ground" | "motor" | "signal";
  /** +1: conventional current flows from wire.from to wire.to; −1 the other way */
  dir: 1 | -1;
  /** 0…1 animation intensity (current or duty) */
  level: number;
  amps?: number;
}

export interface BenchServo {
  angle: number;
  target: number;
  pin: number | null;
  powered: boolean;
  moving: boolean;
}

export interface BenchDisplay {
  partUid: string | null;
  kind: DeviceObj["kind"];
  lines: string[];
  runs: DeviceObj["runs"];
  backlight: boolean;
  on: boolean;
  /** why nothing is shown (not wired, not powered …) */
  reason?: string;
}

export interface BenchRegulator {
  vin: number;
  vout: number;
  ioutA: number;
  iinA: number;
  efficiency: number;
  heatW: number;
  limitA: number | null;
  warning?: string;
}

/** What the bench "environment" feeds each sensor (set by the student). */
export interface BenchEnv {
  temperature?: number;
  humidity?: number;
  lux?: number;
}

export interface BenchState {
  t: number;
  motors: Record<string, BenchMotor>;
  battery: {
    uid: string; volts: number; soc: number; currentA: number; powerW: number; nominal: number; full: number; empty: number;
    capacity_mAh: number; maxA: number; rint: number; cells: number; parallel: number; energyWh: number;
    /** estimated cell temperature (°C): 25 °C + I²R heating through ≈15 K/W, 2-minute time constant */
    tempC: number;
    /** remaining minutes at the present current (null = no load) */
    runtimeMin: number | null;
    warnings: string[];
  } | null;
  servos: Record<string, BenchServo>;
  displays: BenchDisplay[];
  regulators: Record<string, BenchRegulator>;
  dc: DcElementResult[];
  flows: Record<string, WireFlow>;
  netVolts: Record<number, number>;
  servo: Record<number, number>;
  runtime: RuntimeStatus | null;
  serial: string;
  warnings: string[];
}

export interface BenchFault {
  code: "short-circuit" | "no-controller" | "compile";
  message: string;
  wireIds: string[];
  partUid?: string;
}

const TAU_DRIVE = 0.12; // s, mechanical time constant of a small gearmotor on the bench (estimate)
const TAU_COAST = 0.45;
const LOGIC_A = 0.03; // A per powered module (logic, LEDs on boards) — estimate
const CONTROLLER_A = 0.05;

function telemetry(volts: number, motors: Record<string, BenchMotor>): RobotTelemetry {
  return {
    pose: { x: 0, y: 0, heading: 0 }, speed: 0, vx: 0, vy: 0, yawRate: 0,
    motorRpm: Object.fromEntries(Object.entries(motors).map(([k, m]) => [k, m.rpm])),
    motorCurrentA: Object.fromEntries(Object.entries(motors).map(([k, m]) => [k, m.currentA])),
    motorVoltage: Object.fromEntries(Object.entries(motors).map(([k, m]) => [k, m.volts ?? 0])),
    batteryVoltage: volts, batteryUsed_mAh: 0, distance: 0, colliding: false, onTrack: true, out: false,
  };
}

/** Default readings for every sensor on the bench (white floor, nothing in range, not pressed). */
export function defaultReadings(g: CircuitGraph): Record<string, SensorReading> {
  const r: Record<string, SensorReading> = {};
  for (const p of g.parts) {
    const s = g.comps.get(p.uid)!.sensor;
    if (!s) continue;
    if (s.kind.startsWith("reflectance")) r[p.uid] = { kind: "reflectance", darkness: Array.from({ length: s.channels ?? 1 }, () => 0) };
    else if (s.kind === "ultrasonic" || s.kind === "ir-distance-analog" || s.kind === "ir-obstacle-digital" || s.kind === "tof") r[p.uid] = { kind: "distance", distance: null };
    else if (s.kind === "bumper") r[p.uid] = { kind: "bumper", pressed: false };
    else if (s.kind === "encoder") r[p.uid] = { kind: "encoder", count: 0, rpm: 0 };
  }
  return r;
}

/** Faults that make running the bench meaningless or dangerous. */
export function benchFaults(project: Project, g: CircuitGraph): BenchFault[] {
  const faults: BenchFault[] = [];
  for (const n of g.nets) {
    const real = n.sources.filter((s) => !s.label.includes("IOREF"));
    if (n.isGround && real.length) faults.push({ code: "short-circuit", message: `SHORT CIRCUIT: ${real[0].label} is connected straight to ground. The bench is stopped — a real battery would push tens of amps through these wires.`, wireIds: n.wires.map((w) => w.id), partUid: real[0].key.split(".")[0] });
  }
  void project;
  return faults;
}

export class BenchSim {
  readonly bridge: RobotElectrical;
  readonly graph: CircuitGraph;
  readonly compileResult: CompileResult | null;
  readonly faults: BenchFault[];
  readonly notSimulated: { uid: string; label: string; reason: string }[];
  private runtime: ArduinoRuntime | null = null;
  readings: Record<string, SensorReading>;
  state: BenchState;
  private soc = -1; // set from the pack's starting charge on the first battery update
  private cellTemp = 25;
  private capV = new Map<string, number>();
  private staticLoad = 0;
  private lastSolveT = 0;
  env: Record<string, BenchEnv> = {};
  /**
   * Manual pin control, used only while no firmware runs (no code, a compile error, or a board whose code is not
   * executed): each listed controller pin is driven as set here, so the hardware can still be tried out.
   */
  manualPins = new Map<number, { level: 0 | 1 } | { duty: number }>();

  constructor(readonly project: Project) {
    this.bridge = new RobotElectrical(project);
    this.graph = this.bridge.graph;
    for (const p of this.graph.parts) {
      const c = this.graph.comps.get(p.uid)!;
      if (/^DHT/i.test(c.name)) this.env[p.uid] = { temperature: 25, humidity: 55 };
      if (/\bLDR\b|photoresistor/i.test(c.name)) this.env[p.uid] = { lux: 300 };
    }
    // DHT11/22: a powered sensor whose DATA line is on the requested pin answers with the bench environment
    this.bridge.dhtSource = (pin, type) => {
      const ctrl = this.bridge.controller;
      if (!ctrl) return null;
      const cp = ctrl.comp.pins.find((x) => x.fn === "gpio" && x.arduinoPin === pin);
      const net = cp && this.graph.netOf.get(`${ctrl.part.uid}.${cp.id}`);
      const dht = net?.members.find((m) => /^DHT/i.test(m.comp.name) && m.pin.fn === "out-digital");
      if (!dht || !this.graph.powered.has(dht.part.uid)) return null;
      const e = this.env[dht.part.uid] ?? {};
      const is11 = type === 11 || /DHT11/i.test(dht.comp.name);
      // DHT11: 0–50 °C / 20–90 % in 1-unit steps; DHT22: −40–80 °C / 0–100 % in 0.1 steps
      const t = Math.max(is11 ? 0 : -40, Math.min(is11 ? 50 : 80, e.temperature ?? 25));
      const h = Math.max(is11 ? 20 : 0, Math.min(is11 ? 90 : 100, e.humidity ?? 55));
      return is11 ? { temperature: Math.round(t), humidity: Math.round(h) } : { temperature: Math.round(t * 10) / 10, humidity: Math.round(h * 10) / 10 };
    };
    this.faults = benchFaults(project, this.graph);
    this.readings = defaultReadings(this.graph);
    this.notSimulated = this.graph.parts
      .map((p) => ({ p, s: supportOf(this.graph.comps.get(p.uid)!) }))
      .filter(({ s }) => s.level !== "full")
      .map(({ p, s }) => ({ uid: p.uid, label: p.label, reason: s.limits[0] ?? s.summary }));
    const ctrl = this.bridge.controller;
    let compiled: CompileResult | null = null;
    if (ctrl && supportOf(ctrl.comp).level === "full") {
      const board = getBoard(ctrl.comp.board ?? "uno");
      compiled = compile(project.code ?? "", { board });
      if (compiled.ok && compiled.program) this.runtime = new ArduinoRuntime(compiled.program, this.bridge, { board });
    }
    this.compileResult = compiled;
    const motors: Record<string, BenchMotor> = {};
    for (const p of this.graph.parts) {
      const c = this.graph.comps.get(p.uid)!;
      if (c.kind !== "dc-motor") continue;
      const mp = motorParams(p, c);
      motors[p.uid] = { volts: null, rpm: 0, currentA: 0, noLoadRpm: mp?.noLoadRpm ?? 0, trace: mp ? "not driven" : "no motor data — cannot spin" };
    }
    const servos: Record<string, BenchServo> = {};
    for (const p of this.graph.parts) if (this.graph.comps.get(p.uid)!.kind === "servo") servos[p.uid] = { angle: 90, target: 90, pin: null, powered: false, moving: false };
    this.state = { t: 0, motors, battery: null, servos, displays: [], regulators: {}, dc: [], flows: {}, netVolts: {}, servo: {}, runtime: null, serial: "", warnings: [] };
    this.computeBattery(0, 0);
    this.computeFlows();
  }

  get hasProgram() {
    return !!this.runtime;
  }

  setReading(uid: string, r: SensorReading) {
    // a distance beyond the sensor's own range is "nothing detected" — that is the detection threshold
    const sp = this.graph.comps.get(uid)?.sensor;
    if (r.kind === "distance" && r.distance !== null && sp?.maxRange_mm && r.distance * 1000 > sp.maxRange_mm) r = { kind: "distance", distance: null };
    this.readings[uid] = r;
  }

  setManualPin(pin: number, v: "input" | 0 | 1 | { duty: number }) {
    if (v === "input") this.manualPins.delete(pin);
    else this.manualPins.set(pin, typeof v === "number" ? { level: v } : v);
  }

  setEnv(uid: string, e: BenchEnv) {
    this.env[uid] = { ...this.env[uid], ...e };
  }

  private batteryPart() {
    return this.graph.parts.find((p) => this.graph.comps.get(p.uid)!.battery);
  }

  private computeBattery(loadA: number, dt: number) {
    const bp = this.batteryPart();
    if (!bp) {
      this.state.battery = null;
      return;
    }
    const pack = batteryPack(this.graph.comps.get(bp.uid)!, bp)!;
    if (this.soc < 0) this.soc = pack.initialSoc;
    if (dt > 0 && pack.capacity > 0) this.soc = Math.max(0, this.soc - (loadA * dt) / 3600 / (pack.capacity / 1000));
    // open-circuit voltage: full at 100 %, nominal around 50 %, cut-off at 0 % (piecewise linear)
    const ocv = this.soc >= 0.5 ? pack.nominal + (pack.max - pack.nominal) * ((this.soc - 0.5) / 0.5) : pack.min + (pack.nominal - pack.min) * (this.soc / 0.5);
    const volts = Math.max(0, ocv - loadA * pack.rint);
    if (dt > 0) this.cellTemp += ((25 + loadA * loadA * pack.rint * 15) - this.cellTemp) * Math.min(1, dt / 120);
    const remainingAh = (pack.capacity / 1000) * this.soc;
    const warnings: string[] = [];
    if (volts < pack.min * 1.06) warnings.push(`Low voltage: ${volts.toFixed(2)} V is close to the ${pack.min.toFixed(1)} V cut-off — recharge the pack.`);
    if (Number.isFinite(pack.maxA) && loadA > pack.maxA) warnings.push(`Over-current: ${loadA.toFixed(1)} A is above the pack's ${pack.maxA.toFixed(1)} A continuous rating.`);
    if (this.soc <= 0.001) warnings.push("The pack is empty: in a real robot the BMS cuts the power here (or, without one, the cells are damaged).");
    if (this.cellTemp > 60) warnings.push(`Cells ≈${this.cellTemp.toFixed(0)} °C (estimate) — too hot.`);
    this.state.battery = {
      uid: bp.uid, volts, soc: this.soc, currentA: loadA, powerW: volts * loadA, nominal: pack.nominal, full: pack.max, empty: pack.min,
      capacity_mAh: pack.capacity, maxA: pack.maxA, rint: pack.rint, cells: pack.cells, parallel: pack.parallel ?? 1, energyWh: (pack.nominal * pack.capacity) / 1000,
      tempC: this.cellTemp, runtimeMin: loadA > 0.005 ? (remainingAh / loadA) * 60 : null, warnings,
    };
  }

  /** Advance the bench by `seconds` of simulated time (1 ms steps for the code, motors integrated per step). */
  advance(seconds: number) {
    if (this.faults.length) return;
    const dt = 0.001;
    const n = Math.min(400, Math.round(seconds / dt));
    for (let i = 0; i < n; i++) this.step(dt);
    this.updateServos(n * dt);
    this.solvePassives();
    this.updateDisplays();
    this.computeFlows();
    if (this.runtime) {
      this.state.serial = this.runtime.serialLog.slice(-4000);
      this.state.warnings = this.runtime.warnings.slice(-5);
    }
    this.state.servo = { ...this.bridge.servoAngles };
  }

  private step(dt: number) {
    const volts = this.state.battery?.volts ?? 0;
    this.bridge.update(this.readings, telemetry(volts, this.state.motors));
    if (this.runtime) this.state.runtime = this.runtime.runUntil((this.state.t + dt) * 1e6);
    else
      for (const [pin, v] of this.manualPins) {
        this.bridge.pinMode(pin, "OUTPUT");
        if ("duty" in v) this.bridge.analogWrite(pin, Math.round(Math.max(0, Math.min(1, v.duty)) * 255));
        else this.bridge.digitalWrite(pin, v.level);
      }
    const cmds = this.bridge.motorCommands();
    let load = 0;
    for (const [uid, m] of Object.entries(this.state.motors)) {
      const part = this.graph.parts.find((p) => p.uid === uid)!;
      const mp = motorParams(part, this.graph.comps.get(uid)!);
      const v = cmds[uid];
      if (!mp) continue;
      if (v === undefined) {
        m.volts = null;
        m.rpm += (0 - m.rpm) * Math.min(1, dt / TAU_COAST);
        m.currentA = 0;
        m.trace = this.bridge.motorTrace[uid] ?? "coasting";
        continue;
      }
      const target = (v / mp.nominalVoltage) * mp.noLoadRpm;
      m.rpm += (target - m.rpm) * Math.min(1, dt / TAU_DRIVE);
      const R = mp.nominalVoltage / Math.max(0.01, mp.stallCurrentA);
      const ke = mp.nominalVoltage / Math.max(1, mp.noLoadRpm);
      const i = (v - ke * m.rpm) / R + Math.sign(m.rpm) * mp.noLoadCurrentA * Math.min(1, Math.abs(m.rpm) / Math.max(1, mp.noLoadRpm));
      m.currentA = i;
      m.volts = v;
      m.trace = this.bridge.motorTrace[uid] ?? "";
      load += Math.abs(i);
    }
    load += this.staticLoad;
    this.computeBattery(load, dt);
    this.state.t += dt;
  }

  /** Servos move towards the angle the code commands, at their rated speed — only if wired to that pin and powered. */
  private updateServos(dt: number) {
    const ctrl = this.bridge.controller;
    for (const [uid, sv] of Object.entries(this.state.servos)) {
      const c = this.graph.comps.get(uid)!;
      const sig = c.pins.find((x) => x.fn === "in-pwm") ?? c.pins.find((x) => /SIG|PWM|S\b/i.test(x.id));
      const net = sig && this.graph.netOf.get(`${uid}.${sig.id}`);
      const gp = net?.members.find((m) => ctrl && m.part.uid === ctrl.part.uid && m.pin.fn === "gpio");
      sv.pin = gp?.pin.arduinoPin ?? null;
      sv.powered = this.graph.powered.has(uid);
      const cmd = sv.pin !== null ? this.bridge.servoAngles[sv.pin] : undefined;
      if (cmd !== undefined && sv.powered) sv.target = cmd;
      // SG90 ≈ 0.1 s / 60° (600 °/s), metal-gear MG99x ≈ 0.17 s / 60° (≈350 °/s)
      const rate = /MG9|metal/i.test(c.name) ? 350 : 600;
      const d = sv.target - sv.angle;
      sv.moving = sv.powered && Math.abs(d) > 0.5;
      if (sv.powered) sv.angle += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    }
  }

  /** Text shown on each wired, powered display, matched from the display objects the code declared. */
  private updateDisplays() {
    const devs = (this.runtime?.devices ?? []).filter((d) => d.kind !== "dht");
    const ctrl = this.bridge.controller;
    const used = new Set<string>();
    const onCtrlPin = (uid: string, pinId: string, cap?: string, arduinoPin?: number) =>
      !!this.graph.netOf.get(`${uid}.${pinId}`)?.members.some((m) => ctrl && m.part.uid === ctrl.part.uid && m.pin.fn === "gpio" && (cap ? (m.pin.caps ?? []).includes(cap as never) : m.pin.arduinoPin === arduinoPin));
    this.state.displays = devs.map((d) => {
      const want = d.kind === "oled" ? /OLED/i : /LCD/i;
      const cands = this.graph.parts.filter((p) => {
        const c = this.graph.comps.get(p.uid)!;
        if (c.kind !== "display" || !want.test(c.name) || used.has(p.uid)) return false;
        const hasI2c = c.pins.some((x) => x.fn === "i2c-sda");
        return d.kind === "lcd" ? !hasI2c : hasI2c;
      });
      const wired = cands.find((p) => {
        const c = this.graph.comps.get(p.uid)!;
        if (d.kind === "lcd") return ["RS", "E", "D4", "D5", "D6", "D7"].every((id, i) => c.pins.some((x) => x.id === id) && onCtrlPin(p.uid, id, undefined, d.args[i]));
        const sda = c.pins.find((x) => x.fn === "i2c-sda")!, scl = c.pins.find((x) => x.fn === "i2c-scl")!;
        return onCtrlPin(p.uid, sda.id, "i2c-sda") && onCtrlPin(p.uid, scl.id, "i2c-scl");
      });
      const base = { kind: d.kind, lines: d.lines, runs: d.runs, backlight: d.backlight, on: d.on };
      if (!wired) return { ...base, partUid: cands[0]?.uid ?? null, lines: [], runs: [], reason: cands.length ? (d.kind === "lcd" ? "RS, E and D4–D7 are not wired to the pins given in the LiquidCrystal(…) declaration." : "SDA and SCL are not on the controller's SDA/SCL pins.") : `Your code uses a ${d.kind === "oled" ? "OLED" : "LCD"}, but there is no matching display in the circuit.` };
      used.add(wired.uid);
      if (!this.graph.powered.has(wired.uid)) return { ...base, partUid: wired.uid, lines: [], runs: [], reason: "The display has no power (VCC/GND)." };
      return { ...base, partUid: wired.uid };
    });
  }

  /** Current drawn on each supply net by everything except the motors; regulators pass it on to their input. */
  private supplyLoads(sourced: Map<number, number>) {
    const g = this.graph;
    const perNet = new Map<number, number>();
    const addTo = (netId: number | undefined, a: number) => netId !== undefined && perNet.set(netId, (perNet.get(netId) ?? 0) + a);
    for (const p of g.parts) {
      if (!g.powered.has(p.uid)) continue;
      const c = g.comps.get(p.uid)!;
      if (c.kind === "regulator" || c.battery) continue;
      const sp = c.pins.find((x) => (x.fn === "vin" || (x.fn === "vout" && x.vRange)) && g.netOf.get(`${p.uid}.${x.id}`)?.voltage != null && !g.netOf.get(`${p.uid}.${x.id}`)!.sources.some((s0) => s0.key === `${p.uid}.${x.id}`));
      const sv = this.state.servos[p.uid];
      const a = c.kind === "controller" ? CONTROLLER_A : c.kind === "motor-driver" ? LOGIC_A : c.kind === "servo" ? (sv?.moving ? (/MG9/i.test(c.name) ? 0.8 : 0.25) : 0.01) : c.kind === "display" ? 0.03 : 0.015;
      addTo(sp && g.netOf.get(`${p.uid}.${sp.id}`)?.id, a);
    }
    for (const [nid, a] of sourced) {
      const n = g.nets.find((x) => x.id === nid);
      if (n && n.voltage !== null && !n.isGround && a > 0) addTo(nid, a);
    }
    // regulators: output current → input current (buck: power balance with efficiency; linear: same current, heat = ΔV·I)
    const regs: Record<string, BenchRegulator> = {};
    for (let pass = 0; pass < 3; pass++) {
      for (const p of g.parts) {
        const c = g.comps.get(p.uid)!;
        if (c.kind !== "regulator" || !g.powered.has(p.uid)) continue;
        const outPin = c.pins.find((x) => x.fn === "vout"), inPin = c.pins.find((x) => x.fn === "vin");
        const outNet = outPin && g.netOf.get(`${p.uid}.${outPin.id}`), inNet = inPin && g.netOf.get(`${p.uid}.${inPin.id}`);
        if (!outNet || !inNet || inNet.voltage == null) continue;
        const iout = perNet.get(outNet.id) ?? 0;
        const vin = inNet.voltage, vout = outNet.voltage ?? 0;
        const buck = /buck|LM2596|XL40|MP1584|MP2307|TPS5430|switching/i.test(c.name);
        const eff = buck ? 0.88 : vin > 0 ? Math.min(1, vout / vin) : 1;
        const iin = buck ? (vout * iout) / Math.max(0.1, eff * vin) + 0.005 : iout + 0.005;
        const heat = buck ? vout * iout * (1 / eff - 1) : (vin - vout) * iout;
        const lim = Number(/([\d.]+)\s*A/.exec(c.specs.current ?? "")?.[1] ?? NaN);
        const prev = regs[p.uid];
        if (prev) addTo(inNet.id, -prev.iinA);
        addTo(inNet.id, iin);
        let warning: string | undefined;
        if (Number.isFinite(lim) && iout > lim) warning = `${iout.toFixed(2)} A drawn, above its ${lim} A rating.`;
        else if (!buck && heat > 1.5) warning = `≈${heat.toFixed(1)} W of heat in a linear regulator — it needs a heatsink or a buck converter.`;
        regs[p.uid] = { vin, vout, ioutA: iout, iinA: iin, efficiency: eff, heatW: heat, limitA: Number.isFinite(lim) ? lim : null, warning };
      }
    }
    this.state.regulators = regs;
    // what the battery supplies directly
    let fromBattery = 0;
    for (const [nid, a] of perNet) {
      const n = g.nets.find((x) => x.id === nid);
      if (n?.sources.some((s0) => g.comps.get(s0.key.split(".")[0])?.battery)) fromBattery += a;
    }
    this.staticLoad = fromBattery;
  }

  /** Fixed potentials for the DC solver: ground, live supplies, controller pins driven as OUTPUT (PWM = average). */
  private fixedPotentials(): Map<number, number> {
    const fixed = new Map<number, number>();
    const batV = this.state.battery?.volts ?? 0;
    for (const n of this.graph.nets) {
      if (n.isGround) fixed.set(n.id, 0);
      else if (n.voltage !== null) fixed.set(n.id, n.sources.some((s) => this.graph.comps.get(s.key.split(".")[0])?.battery) ? batV : n.voltage);
    }
    for (const s of this.bridge.pinSnapshot()) {
      if (s.mode !== "OUTPUT") continue;
      const ctrl = this.bridge.controller!;
      const pin = ctrl.comp.pins.find((p) => p.arduinoPin === s.pin && p.fn === "gpio");
      const net = pin && this.graph.netOf.get(`${ctrl.part.uid}.${pin.id}`);
      if (net && !fixed.has(net.id)) fixed.set(net.id, (s.duty ?? s.level) * (ctrl.comp.specs.logicVoltage ?? 5));
    }
    return fixed;
  }

  private solvePassives() {
    const fixed = this.fixedPotentials();
    const dt = Math.max(1e-4, this.state.t - this.lastSolveT);
    this.lastSolveT = this.state.t;
    const lux = new Map(Object.entries(this.env).filter(([, e]) => e.lux !== undefined).map(([k, e]) => [k, e.lux!]));
    const res = solveDc(this.graph, fixed, { dt, capV: this.capV, lux });
    this.state.dc = res.elements;
    this.supplyLoads(res.sourced);
    this.state.netVolts = Object.fromEntries(res.potential);
    // analogRead/digitalRead on a divider or LDR see these voltages
    const passive = new Map<number, number>();
    for (const [nid, v] of res.potential) if (!fixed.has(nid)) passive.set(nid, v);
    this.bridge.passiveVolts = passive;
  }

  /** Orientation and intensity of current on every wire. */
  private computeFlows() {
    const flows: Record<string, WireFlow> = {};
    const g = this.graph;
    const orient = (net: Net, starts: string[]) => {
      // BFS over the wires of a net from the source pins; a wire is oriented from the end reached first
      const seen = new Set<string>(starts);
      const queue = [...starts];
      const dirOf = new Map<string, 1 | -1>();
      const samePart = (k: string) => net.members.filter((m) => m.part.uid === k.split(".")[0]).map((m) => m.key);
      while (queue.length) {
        const k = queue.shift()!;
        for (const x of samePart(k)) if (!seen.has(x)) { seen.add(x); queue.push(x); }
        for (const w of net.wires) {
          if (dirOf.has(w.id)) continue;
          const a = pinKey(w.from), b = pinKey(w.to);
          if (a === k && !seen.has(b)) { dirOf.set(w.id, 1); seen.add(b); queue.push(b); }
          else if (b === k && !seen.has(a)) { dirOf.set(w.id, -1); seen.add(a); queue.push(a); }
          else if ((a === k || b === k) && !dirOf.has(w.id)) dirOf.set(w.id, a === k ? 1 : -1);
        }
      }
      return dirOf;
    };
    const motorTerms = new Map<string, number>(); // pin key → motor volts (positive terminal gets +)
    for (const [uid, m] of Object.entries(this.state.motors)) {
      if (m.volts === null || Math.abs(m.currentA) < 1e-3) continue;
      const c = g.comps.get(uid)!;
      const t = c.pins.filter((p) => p.fn === "motor-term");
      if (t.length < 2) continue;
      motorTerms.set(`${uid}.${t[0].id}`, m.currentA);
      motorTerms.set(`${uid}.${t[1].id}`, -m.currentA);
    }
    const totalA = this.state.battery?.currentA ?? 0;
    const level = (a: number) => Math.max(0.15, Math.min(1, Math.abs(a) / 2));
    for (const net of g.nets) {
      if (!net.wires.length) continue;
      if (net.isGround) {
        const starts = net.members.filter((m) => m.pin.fn === "bat-").map((m) => m.key);
        const d = orient(net, starts);
        // current flows INTO the battery's negative terminal: reverse the BFS orientation
        for (const w of net.wires) flows[w.id] = { kind: "ground", dir: ((d.get(w.id) ?? 1) * -1) as 1 | -1, level: level(totalA), amps: totalA };
        continue;
      }
      if (net.voltage !== null) {
        const loads = net.members.some((m) => (m.pin.fn === "vin" || (m.pin.fn === "vout" && m.pin.vRange)) && g.powered.has(m.part.uid) && !net.sources.some((s) => s.key === m.key));
        if (!loads) continue;
        const d = orient(net, net.sources.map((s) => s.key));
        for (const w of net.wires) flows[w.id] = { kind: "power", dir: d.get(w.id) ?? 1, level: level(totalA), amps: totalA };
        continue;
      }
      // motor nets: current leaves the driver output on the terminal where the motor current enters
      const term = net.members.find((m) => motorTerms.has(m.key));
      if (term) {
        const into = (motorTerms.get(term.key) ?? 0) > 0;
        const out = net.members.find((m) => m.pin.fn === "motor-out");
        const d = orient(net, [out?.key ?? term.key]);
        const a = motorTerms.get(term.key)!;
        for (const w of net.wires) flows[w.id] = { kind: "motor", dir: ((d.get(w.id) ?? 1) * (out ? (into ? 1 : -1) : 1)) as 1 | -1, level: level(a), amps: Math.abs(a) };
        continue;
      }
      // signals: a controller output that is HIGH (or PWM)
      const gp = net.members.find((m) => m.comp.kind === "controller" && m.pin.fn === "gpio" && m.pin.arduinoPin !== undefined);
      if (gp) {
        const s = this.bridge.pinSnapshot().find((x) => x.pin === gp.pin.arduinoPin);
        if (s && s.mode === "OUTPUT" && (s.duty ?? s.level) > 0) {
          const d = orient(net, [gp.key]);
          for (const w of net.wires) flows[w.id] = { kind: "signal", dir: d.get(w.id) ?? 1, level: s.duty ?? s.level };
        } else if ((!s || s.mode !== "OUTPUT") && net.members.some((m) => m.comp.kind !== "controller" && (m.pin.fn === "out-digital" || m.pin.fn === "out-analog"))) {
          // a sensor output that is HIGH flows towards the controller
          if (this.bridge.analogRead(gp.pin.arduinoPin!) > 400) {
            const d = orient(net, net.members.filter((m) => m.comp.kind !== "controller").map((m) => m.key));
            for (const w of net.wires) flows[w.id] = { kind: "signal", dir: d.get(w.id) ?? 1, level: 1 };
          }
        }
      }
    }
    this.state.flows = flows;
  }

  /** Voltage a controller input reads right now (for the sensor panel): uses the bridge's own logic. */
  readPin(arduinoPin: number): { digital: 0 | 1; analog: number } {
    return { digital: this.bridge.digitalRead(arduinoPin), analog: this.bridge.analogRead(arduinoPin) };
  }

  wiresOf(): Wire[] {
    return this.project.wires;
  }
}
