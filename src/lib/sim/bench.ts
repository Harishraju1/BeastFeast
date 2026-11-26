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

export interface BenchState {
  t: number;
  motors: Record<string, BenchMotor>;
  battery: { uid: string; volts: number; soc: number; currentA: number; powerW: number; nominal: number; full: number; empty: number } | null;
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
  private soc = 0.95;

  constructor(private project: Project) {
    this.bridge = new RobotElectrical(project);
    this.graph = this.bridge.graph;
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
    this.state = { t: 0, motors, battery: null, dc: [], flows: {}, netVolts: {}, servo: {}, runtime: null, serial: "", warnings: [] };
    this.computeBattery(0, 0);
    this.computeFlows();
  }

  get hasProgram() {
    return !!this.runtime;
  }

  setReading(uid: string, r: SensorReading) {
    this.readings[uid] = r;
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
    if (dt > 0 && pack.capacity > 0) this.soc = Math.max(0, this.soc - (loadA * dt) / 3600 / (pack.capacity / 1000));
    // open-circuit voltage: full at 100 %, nominal around 50 %, cut-off at 0 % (piecewise linear)
    const ocv = this.soc >= 0.5 ? pack.nominal + (pack.max - pack.nominal) * ((this.soc - 0.5) / 0.5) : pack.min + (pack.nominal - pack.min) * (this.soc / 0.5);
    const volts = Math.max(0, ocv - loadA * pack.rint);
    this.state.battery = { uid: bp.uid, volts, soc: this.soc, currentA: loadA, powerW: volts * loadA, nominal: pack.nominal, full: pack.max, empty: pack.min };
  }

  /** Advance the bench by `seconds` of simulated time (1 ms steps for the code, motors integrated per step). */
  advance(seconds: number) {
    if (this.faults.length) return;
    const dt = 0.001;
    const n = Math.min(400, Math.round(seconds / dt));
    for (let i = 0; i < n; i++) this.step(dt);
    this.solvePassives();
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
    const powered = this.graph.parts.filter((p) => this.graph.powered.has(p.uid));
    load += powered.reduce((a, p) => a + (this.graph.comps.get(p.uid)!.kind === "controller" ? CONTROLLER_A : this.graph.comps.get(p.uid)!.kind === "motor-driver" ? LOGIC_A : 0.01), 0);
    load += this.passiveLoad;
    this.computeBattery(load, dt);
    this.state.t += dt;
  }

  private passiveLoad = 0;

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
    const res = solveDc(this.graph, fixed);
    this.state.dc = res.elements;
    let drawn = 0;
    for (const [nid, a] of res.sourced) {
      const n = this.graph.nets[nid] ?? this.graph.nets.find((x) => x.id === nid);
      if (n && n.voltage !== null && !n.isGround && a > 0) drawn += a;
    }
    this.passiveLoad = drawn;
    this.state.netVolts = Object.fromEntries(res.potential);
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
