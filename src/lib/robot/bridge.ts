/**
 * Electrical bridge between the student's code (ArduinoHost calls) and the physics world.
 * Everything goes through the real circuit graph: a pin only affects a motor if it is wired
 * to a driver input, that driver is powered and shares ground, and its outputs reach the motor.
 */
import type { ArduinoHost, PinModeValue } from "@/lib/arduino/types";
import type { ComponentRecord, PartInstance, PinDef, Project } from "@/lib/types";
import type { MotorCommands, RobotTelemetry, SensorReading } from "@/lib/sim/types";
import { type CircuitGraph, type Net, buildGraph, optionValue } from "@/lib/circuit/nets";
import { DRIVER_WIRING } from "./drivers";

interface PinState {
  mode: PinModeValue;
  level: 0 | 1;
  duty: number | null; // 0..1 when analogWrite was used
}

export interface BridgeOptions {
  /** ADC full scale for analogRead */
  adcMax: number;
  vRef: number;
}

export class RobotElectrical implements ArduinoHost {
  readonly graph: CircuitGraph;
  readonly controller: { part: PartInstance; comp: ComponentRecord } | null;
  private pins = new Map<number, PinState>();
  private pinNet = new Map<number, Net>();
  private readings: Record<string, SensorReading> = {};
  private telem: RobotTelemetry | null = null;
  private serialIn: number[] = [];
  serialOut = "";
  servoAngles: Record<number, number> = {};
  private lastEncoder: Record<string, number> = {};
  /** queued pin edges (encoders), drained by the session and matched against attachInterrupt modes */
  pendingInterrupts: { pin: number; rising: boolean; sensor: string; count: number }[] = [];
  /** encoder count to present on its pins while an ISR for one specific edge runs */
  encoderOverride = new Map<string, number>();
  /** human-readable explanation of why each motor got its voltage */
  motorTrace: Record<string, string> = {};
  /** voltages of passive networks (dividers, LDRs, RC) solved by the circuit bench, keyed by net id */
  passiveVolts: Map<number, number> | null = null;
  /** DHT sensors: who answers on a pin (set by the circuit bench; in the arena no DHT answers → NaN) */
  dhtSource: ((pin: number, type: number) => { temperature: number; humidity: number } | null) | null = null;

  constructor(project: Project, private opts: BridgeOptions = { adcMax: 1023, vRef: 5 }) {
    this.graph = buildGraph(project);
    const cp = this.graph.parts.find((p) => this.graph.comps.get(p.uid)?.kind === "controller");
    this.controller = cp ? { part: cp, comp: this.graph.comps.get(cp.uid)! } : null;
    if (this.controller) {
      for (const pin of this.controller.comp.pins) {
        if (pin.fn !== "gpio" || pin.arduinoPin === undefined) continue;
        const net = this.graph.netOf.get(`${cp!.uid}.${pin.id}`);
        if (net && !this.pinNet.has(pin.arduinoPin)) this.pinNet.set(pin.arduinoPin, net);
      }
    }
  }

  // ───────── world → bridge ─────────
  update(readings: Record<string, SensorReading>, telemetry: RobotTelemetry) {
    this.readings = readings;
    this.telem = telemetry;
    // encoder quadrature → real per-pin edges (A and B channels change on alternate counts)
    for (const [id, r] of Object.entries(readings)) {
      if (r.kind !== "encoder") continue;
      const prev = this.lastEncoder[id] ?? r.count;
      this.lastEncoder[id] = r.count;
      if (prev === r.count) continue;
      const part = this.graph.parts.find((p) => p.uid === id);
      const comp = part && this.graph.comps.get(part.uid);
      if (!comp) continue;
      const outs = comp.pins
        .filter((p) => p.fn === "out-digital")
        .map((p) => ({ isB: /B|C2/.test(p.id), gp: this.gpioOf(`${id}.${p.id}`) }))
        .filter((o): o is { isB: boolean; gp: number } => o.gp !== undefined);
      const step = r.count > prev ? 1 : -1;
      for (let c = prev, n = 0; c !== r.count && n < 400; c += step, n++) {
        for (const o of outs) {
          const before = quadLevel(c, o.isB),
            after = quadLevel(c + step, o.isB);
          if (before !== after) this.pendingInterrupts.push({ pin: o.gp, rising: after === 1, sensor: id, count: c + step });
        }
      }
    }
  }

  pushSerial(text: string) {
    for (const ch of text) this.serialIn.push(ch.charCodeAt(0) & 0xff);
  }

  /** True if a Bluetooth/serial module's TX reaches the controller RX (keyboard → Serial in BT mode). */
  hasSerialModule(): boolean {
    return this.graph.parts.some((p) => {
      const c = this.graph.comps.get(p.uid)!;
      const tx = c.pins.find((x) => x.fn === "uart-tx");
      if (!tx || c.kind === "controller") return false;
      const net = this.graph.netOf.get(`${p.uid}.${tx.id}`);
      return !!net?.members.some((m) => m.comp.kind === "controller" && (m.pin.caps ?? []).includes("uart-rx"));
    });
  }

  // ───────── ArduinoHost ─────────
  private st(pin: number): PinState {
    let s = this.pins.get(pin);
    if (!s) {
      s = { mode: "INPUT", level: 0, duty: null };
      this.pins.set(pin, s);
    }
    return s;
  }
  pinMode(pin: number, mode: PinModeValue) {
    this.st(pin).mode = mode;
  }
  digitalWrite(pin: number, value: 0 | 1) {
    const s = this.st(pin);
    if (s.mode !== "OUTPUT" && value === 1 && s.mode === "INPUT") s.mode = "INPUT_PULLUP"; // Arduino quirk: write HIGH to input enables pull-up
    s.level = value;
    s.duty = null;
  }
  analogWrite(pin: number, duty: number) {
    const s = this.st(pin);
    s.mode = "OUTPUT";
    const d = Math.max(0, Math.min(255, duty)) / 255;
    s.duty = d;
    s.level = d >= 0.5 ? 1 : 0;
  }
  digitalRead(pin: number): 0 | 1 {
    const s = this.st(pin);
    if (s.mode === "OUTPUT") return s.level;
    const v = this.netLevel(this.pinNet.get(pin));
    if (v === null) return s.mode === "INPUT_PULLUP" ? 1 : 0;
    return v >= 0.5 ? 1 : 0;
  }
  analogRead(pin: number): number {
    const net = this.pinNet.get(pin);
    const volts = this.netVolts(net);
    if (volts === null) return this.st(pin).mode === "INPUT_PULLUP" ? this.opts.adcMax : 0;
    return Math.max(0, Math.min(this.opts.adcMax, Math.round((volts / this.opts.vRef) * this.opts.adcMax)));
  }
  pulseIn(pin: number, level: 0 | 1, timeoutMicros: number): number {
    const net = this.pinNet.get(pin);
    if (!net || level !== 1) return 0;
    for (const m of net.members) {
      if (m.pin.id !== "ECHO") continue;
      if (!this.graph.powered.has(m.part.uid) || !this.sharesGround(m.part)) return 0;
      // TRIG must be wired to a controller pin that has been driven HIGH at least once (pulse emitted)
      const trigNet = this.graph.netOf.get(`${m.part.uid}.TRIG`);
      const trigGpio = trigNet?.members.find((x) => x.comp.kind === "controller" && x.pin.fn === "gpio");
      if (!trigGpio || this.st(trigGpio.pin.arduinoPin!).mode !== "OUTPUT") return 0;
      const r = this.readings[m.part.uid];
      const d = r?.kind === "distance" ? r.distance : null;
      const us = d === null ? 38000 : Math.round(((2 * d) / 343) * 1e6);
      return us > timeoutMicros ? 0 : us;
    }
    return 0;
  }
  readDht(pin: number, type: number) {
    return this.dhtSource?.(pin, type) ?? null;
  }
  servoWrite(pin: number, angle: number) {
    this.servoAngles[pin] = angle;
  }
  serialWrite(text: string) {
    this.serialOut += text;
    if (this.serialOut.length > 20000) this.serialOut = this.serialOut.slice(-15000);
  }
  serialAvailable() {
    return this.serialIn.length;
  }
  serialRead() {
    return this.serialIn.length ? this.serialIn.shift()! : -1;
  }

  // ───────── helpers ─────────
  private gpioOf(key: string): number | undefined {
    const net = this.graph.netOf.get(key);
    return net?.members.find((m) => m.comp.kind === "controller" && m.pin.fn === "gpio")?.pin.arduinoPin;
  }

  private sharesGround(part: PartInstance): boolean {
    const c = this.graph.comps.get(part.uid)!;
    const gnds = c.pins.filter((p) => p.fn === "gnd");
    if (!gnds.length) return true;
    const myGround = gnds.some((g) => this.graph.netOf.get(`${part.uid}.${g.id}`)?.isGround);
    const ctrl = this.controller;
    if (!ctrl) return myGround;
    const ctrlGround = ctrl.comp.pins.filter((p) => p.fn === "gnd").some((g) => this.graph.netOf.get(`${ctrl.part.uid}.${g.id}`)?.isGround);
    return myGround && ctrlGround;
  }

  /** Logic level (0..1 duty) a module input sees, or null if floating. */
  private inputLevel(part: PartInstance, pinId: string): number | null {
    const net = this.graph.netOf.get(`${part.uid}.${pinId}`);
    if (!net) return null;
    const gp = net.members.find((m) => m.comp.kind === "controller" && m.pin.fn === "gpio");
    if (gp) {
      if (!this.sharesGround(part)) return null; // no common reference: signal meaningless
      const s = this.st(gp.pin.arduinoPin!);
      if (s.mode !== "OUTPUT") return null;
      return s.duty ?? s.level;
    }
    if (net.isGround) return 0;
    if (net.voltage !== null) return 1;
    return null;
  }

  private sensorPart(m: { part: PartInstance; comp: ComponentRecord; pin: PinDef }) {
    return m.comp.kind === "sensor" || m.comp.kind === "rc-input" || m.comp.kind === "wireless" || m.comp.sensor?.kind === "bumper";
  }

  /** Voltage driven onto a net by a sensor output, or by a supply; null = floating. */
  private netVolts(net: Net | undefined): number | null {
    if (!net) return null;
    if (net.isGround) return 0;
    if (net.voltage !== null) return net.voltage;
    for (const m of net.members) {
      if (!this.sensorPart(m)) continue;
      if (m.pin.fn === "switch") {
        const v = this.switchLevel(m.part, m.pin.id);
        if (v !== null) return v;
        continue;
      }
      if (m.pin.fn !== "out-digital" && m.pin.fn !== "out-analog") continue;
      if (!this.graph.powered.has(m.part.uid) || !this.sharesGround(m.part)) return null;
      const supply = this.supplyV(m.part);
      const r = this.readings[m.part.uid];
      const s = m.comp.sensor;
      if (!s || !r) continue;
      const channelIdx = channelIndex(m.pin.id);
      if (r.kind === "reflectance") {
        const dark = r.darkness[Math.min(channelIdx, r.darkness.length - 1)] ?? 0;
        if (m.pin.fn === "out-analog") return supply * (0.05 + 0.9 * dark);
        const black = dark > 0.5;
        const bl = s.blackLevel ?? 1;
        return (black ? bl : 1 - bl) * supply;
      }
      if (r.kind === "distance") {
        if (s.kind === "ir-distance-analog") return sharpVolts(r.distance, (s.maxRange_mm ?? 800) > 1000);
        if (s.kind === "ir-obstacle-digital") return (r.distance !== null ? (s.activeLevel ?? 0) : 1 - (s.activeLevel ?? 0)) * supply;
        if (m.pin.id === "ECHO") return 0;
      }
      if (r.kind === "encoder") return quadLevel(this.encoderOverride.get(m.part.uid) ?? r.count, /B|C2/.test(m.pin.id)) * supply;
    }
    // a passive network (voltage divider, LDR, RC) solved by the bench
    const pv = this.passiveVolts?.get(net.id);
    if (pv !== undefined) return pv;
    return null;
  }

  private netLevel(net: Net | undefined): number | null {
    const v = this.netVolts(net);
    if (v === null) return null;
    const logic = this.controller?.comp.specs.logicVoltage ?? 5;
    return v > logic * 0.6 ? 1 : v < logic * 0.3 ? 0 : 0.5;
  }

  /** Bumper / limit switch: when pressed COM connects to NO. Returns the voltage the other contact carries. */
  private switchLevel(part: PartInstance, pinId: string): number | null {
    const r = this.readings[part.uid];
    const pressed = r?.kind === "bumper" ? r.pressed : false;
    const pair = pinId === "COM" ? (pressed ? "NO" : "NC") : pinId === "NO" ? (pressed ? "COM" : null) : pinId === "NC" ? (pressed ? null : "COM") : null;
    if (!pair) return null;
    const other = this.graph.netOf.get(`${part.uid}.${pair}`);
    if (!other) return null;
    if (other.isGround) return 0;
    if (other.voltage !== null) return other.voltage;
    return null;
  }

  private supplyV(part: PartInstance): number {
    const c = this.graph.comps.get(part.uid)!;
    const vin = c.pins.find((p) => p.fn === "vin");
    return (vin && this.graph.netOf.get(`${part.uid}.${vin.id}`)?.voltage) || 5;
  }

  /** Live voltage on a supply net: batteries sag with load, regulators hold their set point. */
  private liveSupply(net: Net | undefined): number {
    if (!net || net.voltage === null) return 0;
    const fromBattery = net.sources.some((s) => this.graph.comps.get(s.key.split(".")[0])?.battery);
    if (fromBattery && this.telem) return this.telem.batteryVoltage;
    return net.voltage;
  }

  /** Terminal potentials for every driver output, then the voltage across each motor. */
  motorCommands(): MotorCommands {
    const potential = new Map<string, number>(); // pinKey -> volts (relative), absent = floating
    for (const d of this.graph.parts) {
      const c = this.graph.comps.get(d.uid)!;
      const wiring = DRIVER_WIRING[c.id];
      if (!wiring || !c.driver) continue;
      // logic must be powered too: L298N +5V (on-board regulator or fed externally), TB6612/L293D VCC
      const logicPin = c.id === "l298n" ? "5V" : wiring.logicSupply;
      const logicOk = !logicPin || (this.graph.netOf.get(`${d.uid}.${logicPin}`)?.voltage ?? null) !== null;
      const powered = this.graph.powered.has(d.uid) && logicOk;
      const vs = this.liveSupply(this.graph.netOf.get(`${d.uid}.${wiring.motorSupply}`));
      const veff = Math.max(0, vs - c.driver.dropV);
      for (const ch of wiring.channels) {
        let v = 0;
        let active = powered && veff > 0;
        const lvl = (pin: string) => this.inputLevel(d, pin) ?? 0;
        if (active) {
          switch (wiring.scheme) {
            case "in-in-en": {
              const jumper = ch.enJumperOption ? Boolean(optionValue(c, d, ch.enJumperOption)) : false;
              const en = jumper ? 1 : lvl(ch.en!);
              v = en * veff * (dig(lvl(ch.inA)) - dig(lvl(ch.inB)));
              if (en <= 0) active = false; // EN low = outputs off (coast)
              break;
            }
            case "in-in-pwm-standby":
              v = dig(lvl(ch.stby!)) ? lvl(ch.en!) * veff * (dig(lvl(ch.inA)) - dig(lvl(ch.inB))) : 0;
              if (!dig(lvl(ch.stby!))) active = false;
              break;
            case "in-in":
              v = veff * (lvl(ch.inA) - lvl(ch.inB));
              break;
            case "pwm-dir":
              v = lvl(ch.inA) * veff * (dig(lvl(ch.inB)) ? -1 : 1);
              break;
            case "rpwm-lpwm":
              v = (ch.enables ?? []).every((e) => dig(lvl(e))) ? veff * (lvl(ch.inA) - lvl(ch.inB)) : 0;
              break;
          }
        }
        if (!active) continue; // floating outputs → motor coasts
        potential.set(`${d.uid}.${ch.outs[0]}`, v / 2);
        potential.set(`${d.uid}.${ch.outs[1]}`, -v / 2);
      }
    }
    const cmds: MotorCommands = {};
    for (const m of this.graph.parts) {
      const c = this.graph.comps.get(m.uid)!;
      if (c.kind !== "dc-motor") continue;
      const terms = c.pins.filter((p) => p.fn === "motor-term");
      if (terms.length < 2) continue;
      const pot = terms.map((t) => {
        const net = this.graph.netOf.get(`${m.uid}.${t.id}`);
        if (!net) return null;
        const out = net.members.find((x) => x.pin.fn === "motor-out");
        if (out) return potential.get(out.key) ?? null;
        if (net.isGround) return 0;
        if (net.voltage !== null) return this.liveSupply(net);
        return null;
      });
      if (pot[0] === null || pot[1] === null) {
        // omitted command = open H-bridge (coast) in the physics engine
        this.motorTrace[m.uid] = "terminal floating (not driven)";
      } else {
        cmds[m.uid] = pot[0] - pot[1];
        this.motorTrace[m.uid] = `${cmds[m.uid].toFixed(2)} V across terminals`;
      }
    }
    return cmds;
  }

  /** Snapshot of controller pin states for telemetry / debugging. */
  pinSnapshot(): { pin: number; mode: PinModeValue; level: 0 | 1; duty: number | null; connectedTo: string[] }[] {
    return [...this.pins.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pin, s]) => ({ pin, ...s, connectedTo: (this.pinNet.get(pin)?.members ?? []).filter((m) => m.comp.kind !== "controller").map((m) => `${m.part.label}.${m.pin.label}`) }));
  }

  /** Which motors are actually reachable from a driver with power (for manual mode). */
  drivableMotors(): Record<string, { maxV: number }> {
    const res: Record<string, { maxV: number }> = {};
    for (const m of this.graph.parts) {
      const c = this.graph.comps.get(m.uid)!;
      if (c.kind !== "dc-motor") continue;
      const nets = c.pins.filter((p) => p.fn === "motor-term").map((t) => this.graph.netOf.get(`${m.uid}.${t.id}`));
      const outs = nets.map((n) => n?.members.find((x) => x.pin.fn === "motor-out"));
      if (!outs[0] || !outs[1] || outs[0].part.uid !== outs[1].part.uid) continue;
      const d = outs[0].part;
      const dc = this.graph.comps.get(d.uid)!;
      const wiring = DRIVER_WIRING[dc.id];
      if (!wiring || !dc.driver || !this.graph.powered.has(d.uid)) continue;
      const vs = this.liveSupply(this.graph.netOf.get(`${d.uid}.${wiring.motorSupply}`));
      if (vs > 0) res[m.uid] = { maxV: Math.max(0, vs - dc.driver.dropV) };
    }
    return res;
  }
}

const dig = (x: number) => (x >= 0.5 ? 1 : 0);

/** Quadrature level of channel A or B at an encoder count (A leads B by a quarter cycle). */
export function quadLevel(count: number, isB: boolean): 0 | 1 {
  const q = ((count % 4) + 4) % 4;
  return (isB ? [0, 0, 1, 1][q] : [0, 1, 1, 0][q]) as 0 | 1;
}

function channelIndex(pinId: string): number {
  const m = /(\d+)$/.exec(pinId);
  if (!m || /^(D0|A0)$/.test(pinId)) return 0;
  const n = Number(m[1]);
  return Math.max(0, n - 1);
}

/** Approximation of the Sharp datasheet curves (V vs distance); beyond range ≈0.3–0.4 V. */
export function sharpVolts(d: number | null, longRange: boolean): number {
  if (d === null) return 0.35;
  const cm = d * 100;
  if (longRange) {
    if (cm < 20) return 2.5 * (cm / 20); // fold-back below the minimum range
    return Math.min(2.8, Math.pow(60.374 / cm, 1 / 1.16));
  }
  if (cm < 10) return 2.3 * (cm / 10); // fold-back below 10 cm
  return Math.min(3.1, Math.pow(27.86 / cm, 1 / 1.15));
}
