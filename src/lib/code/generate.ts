/**
 * Firmware generator: writes an Arduino sketch from a Project's ACTUAL configuration.
 *
 * Nothing is assumed from a template: the generator reads the controller part, then follows the circuit
 * graph to find which controller pins drive which motor-driver inputs, which driver channel feeds which motor
 * (and on which side of the robot it sits, and whether its leads are swapped), which sensors are wired to
 * which pins, and whether an HC-05 reaches a hardware UART. If something the requested behaviour needs is
 * missing, it returns `ok: false` with the missing items and NO code — it never writes code for pins that
 * are not wired.
 *
 * Boards: Arduino Uno-class AVR boards (analogWrite PWM, 10-bit ADC, HC-05 on Serial/D0) and the
 * ESP32 DevKit V1 (GPIO numbers, LEDC PWM through ledcAttach/ledcWrite of the ESP32 Arduino core 3.x,
 * 12-bit ADC, ADC1 only while Wi-Fi is on, HC-05 on Serial2/GPIO16, optional Wi-Fi WebServer control).
 */
import type { ComponentRecord, PartInstance, PinDef, Project } from "@/lib/types";
import { type CircuitGraph, type Net, buildGraph, optionValue } from "@/lib/circuit/nets";
import { DRIVER_WIRING, type DriverChannel } from "@/lib/robot/drivers";
import { type Corner, find4WD } from "@/lib/robot/drivetrain4wd";
import { boardArch, getBoard } from "@/lib/arduino/boards";
import type { BoardProfile } from "@/lib/arduino/types";

// ───────────────────────────── public API ─────────────────────────────

export type Behaviour = "manual" | "line" | "sumo" | "obstacle" | "motor-test";
export type ControlMethod = "none" | "hc05" | "wifi";

export interface GeneratedFirmware {
  ok: boolean;
  missing: string[];
  warnings: string[];
  board: { key: string; name: string; fqbn: string };
  code: string;
  libraries: string[];
  pinTable: { pin: string; function: string; connectedTo: string }[];
  wiring: { from: string; to: string; type: "power" | "ground" | "signal" | "pwm" | "motor" | "serial" | "analog"; note?: string }[];
  setup: string[];
  upload: string[];
  expected: string[];
  troubleshooting: string[];
  simulated: boolean;
  simulationNote?: string;
}

export interface GenerateOptions {
  behaviour?: Behaviour;
  control?: ControlMethod;
  /** overrides for the sketch's adjustable parameters, by variable name (e.g. { baseSpeed: 130, Kp: 0.1 }) */
  tunables?: Record<string, number>;
}

// ───────────────────────────── circuit analysis ─────────────────────────────

type Side = "L" | "R";

interface CtrlPin {
  /** controller header pin id, e.g. "D5", "A0", "D25", "RX2" */
  pinId: string;
  gpio: number;
  /** how the pin is written in code: "5", "A0" (AVR analog header) or "25" (ESP32 GPIO) */
  ref: string;
  label: string;
}

interface ChanPin {
  role: "inA" | "inB" | "en" | "stby" | "enable";
  driverPin: string;
  ctrl: CtrlPin | null;
  tie: "gpio" | "high" | "low" | "float";
  /** carries the speed (PWM) */
  speed: boolean;
  /** #define name in the sketch */
  name: string;
}

interface MotorInfo {
  uid: string;
  label: string;
  corner: Corner | null;
  side: Side;
  /** +1: the channel's "A" direction (inA HIGH / RPWM) turns this wheel forward; −1: reversed */
  sign: 1 | -1;
  /** motor-test number (1 = FL, 2 = FR, 3 = RL, 4 = RR on a 4WD robot) */
  num: number;
}

interface Channel {
  driverLabel: string;
  driverId: string;
  driverName: string;
  scheme: string;
  ch: DriverChannel;
  motors: MotorInfo[];
  side: Side;
  sign: 1 | -1;
  prefix: string;
  fn: string;
  pins: ChanPin[];
  pwmFreq: number;
}

interface LineCh {
  ctrl: CtrlPin;
  mode: "analog" | "digital";
  blackHigh: boolean;
  source: string;
  y: number;
}

interface EdgeSensor {
  label: string;
  side: Side | "C";
  ctrl: CtrlPin;
  mode: "analog" | "digital";
  /** digital: level read over the white border */
  whiteHigh: boolean;
  name: string;
}

interface DistSensor {
  kind: "ultrasonic" | "ir-digital" | "ir-analog";
  label: string;
  compName: string;
  trig?: CtrlPin;
  echo?: CtrlPin;
  out?: CtrlPin;
  activeHigh?: boolean;
  longRange?: boolean;
}

interface SerialLink {
  label: string;
  compName: string;
  port: string;
  rx: CtrlPin;
}

interface Analysis {
  board: BoardProfile;
  arch: "avr" | "esp32";
  controller: { part: PartInstance; comp: ComponentRecord } | null;
  channels: Channel[];
  motors: MotorInfo[];
  line: LineCh[];
  edges: EdgeSensor[];
  distance: DistSensor | null;
  serial: SerialLink | null;
  missing: string[];
  warnings: string[];
  graph: CircuitGraph;
}

const FQBN: Record<string, string> = {
  uno: "arduino:avr:uno",
  nano: "arduino:avr:nano",
  "pro-mini": "arduino:avr:pro",
  mega: "arduino:avr:mega",
  generic: "arduino:avr:uno",
  "esp32-devkit-v1": "esp32:esp32:esp32doit-devkit-v1",
};

/** PWM frequency per driver (Hz): bipolar drivers switch slowly, MOSFET drivers are quiet above 20 kHz. */
const PWM_FREQ: Record<string, number> = { l298n: 1000, l293d: 1000, tb6612fng: 20000, bts7960: 20000, "ibt-2": 20000, drv8833: 20000, drv8835: 20000, drv8871: 20000, mx1508: 1000, "cytron-md10c": 20000, "cytron-mdd10a": 20000 };

const CORNER_NUM: Record<Corner, number> = { FL: 1, FR: 2, RL: 3, RR: 4 };
const sanitize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

function controllerOf(g: CircuitGraph) {
  const parts = g.parts.filter((p) => g.comps.get(p.uid)?.kind === "controller");
  return { first: parts[0] ? { part: parts[0], comp: g.comps.get(parts[0].uid)! } : null, count: parts.length };
}

function ctrlPinOnNet(net: Net | undefined, arch: "avr" | "esp32"): CtrlPin | null {
  const m = net?.members.find((x) => x.comp.kind === "controller" && x.pin.fn === "gpio" && x.pin.arduinoPin !== undefined && !/^(SDA|SCL)$/.test(x.pin.id));
  const any = m ?? net?.members.find((x) => x.comp.kind === "controller" && x.pin.fn === "gpio" && x.pin.arduinoPin !== undefined);
  if (!any) return null;
  return toCtrl(any.pin, arch);
}

function toCtrl(pin: PinDef, arch: "avr" | "esp32"): CtrlPin {
  const ref = arch === "avr" && /^A\d+$/.test(pin.id) ? pin.id : String(pin.arduinoPin);
  return { pinId: pin.id, gpio: pin.arduinoPin!, ref, label: pin.label };
}

/** Index of a sensor channel from its pin id (same rule as the electrical bridge). */
function channelIndex(pinId: string): number {
  const m = /(\d+)$/.exec(pinId);
  if (!m || /^(D0|A0)$/.test(pinId)) return 0;
  return Math.max(0, Number(m[1]) - 1);
}

function analyse(project: Project, behaviour: Behaviour): Analysis {
  const g = buildGraph(project);
  const missing: string[] = [];
  const warnings: string[] = [];
  const ctrl = controllerOf(g);
  const board = getBoard(ctrl.first?.comp.board ?? "generic");
  const archRaw = boardArch(board);
  const arch: "avr" | "esp32" = archRaw === "esp32" ? "esp32" : "avr";
  const empty: Analysis = { board, arch, controller: ctrl.first, channels: [], motors: [], line: [], edges: [], distance: null, serial: null, missing, warnings, graph: g };
  if (!ctrl.first) {
    missing.push("A controller (Arduino Uno or ESP32 DevKit V1) — there is no microcontroller in the circuit.");
    return empty;
  }
  if (ctrl.count > 1) warnings.push(`The circuit has ${ctrl.count} controllers; code is generated for ${ctrl.first.part.label} only.`);
  if (!ctrl.first.comp.board || !(archRaw === "avr" || archRaw === "esp32") || !FQBN[board.key]) {
    missing.push(`A supported controller: ${ctrl.first.comp.name} is not supported by the generator (use an Arduino Uno / Nano or an ESP32 DevKit V1).`);
    return empty;
  }
  const cpart = ctrl.first.part;
  if (!g.powered.has(cpart.uid)) missing.push(`Power for ${cpart.label} (${ctrl.first.comp.name}): its VIN / 5V / 3V3 supply is not connected to the battery or a regulator.`);

  // ── motors → driver channels ──
  const dt = find4WD(project);
  const cornerOf = new Map<string, Corner>();
  if (dt) for (const c of ["FL", "FR", "RL", "RR"] as Corner[]) cornerOf.set(dt.motors[c].uid, c);
  const motorParts = g.parts.filter((p) => g.comps.get(p.uid)?.kind === "dc-motor");
  if (!motorParts.length) missing.push("Drive motors — the robot has no DC motors.");
  const chanMap = new Map<string, Channel>();
  const motors: MotorInfo[] = [];
  for (const m of motorParts) {
    const comp = g.comps.get(m.uid)!;
    const terms = comp.pins.filter((p) => p.fn === "motor-term");
    const outs = terms.map((t) => g.netOf.get(`${m.uid}.${t.id}`)?.members.find((x) => x.pin.fn === "motor-out"));
    if (terms.length < 2 || !outs[0] || !outs[1] || outs[0].part.uid !== outs[1].part.uid) {
      missing.push(`${m.label}: both motor leads must go to the two outputs of one motor-driver channel (it is not reachable through a driver).`);
      continue;
    }
    const drv = outs[0].part;
    const dcomp = outs[0].comp;
    const wiring = DRIVER_WIRING[dcomp.id];
    const ch = wiring?.channels.find((c) => c.outs.includes(outs[0]!.pin.id));
    if (!wiring || !ch || !ch.outs.includes(outs[1]!.pin.id)) {
      missing.push(`${m.label}: its leads are on ${drv.label} ${outs[0].pin.label} and ${outs[1].pin.label}, which are not the two outputs of one channel.`);
      continue;
    }
    if (!g.powered.has(drv.uid)) missing.push(`Motor power for ${drv.label} (${dcomp.name}): ${wiring.motorSupply} has no supply or no ground.`);
    const mirrored = Math.abs((((m.rotation.z % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI) < 0.3;
    const invert = mirrored !== Boolean(m.config.invert);
    const plusOnOut0 = outs[0].pin.id === ch.outs[0];
    const sign = ((plusOnOut0 ? 1 : -1) * (invert ? -1 : 1)) as 1 | -1;
    const wheel = project.parts.find((w) => w.attachedTo === m.uid);
    const y = wheel ? wheel.position.y : m.position.y;
    const corner = cornerOf.get(m.uid) ?? null;
    const side: Side = corner ? (corner === "FL" || corner === "RL" ? "L" : "R") : y >= 0 ? "L" : "R";
    const info: MotorInfo = { uid: m.uid, label: m.label, corner, side, sign, num: corner ? CORNER_NUM[corner] : 0 };
    motors.push(info);
    const key = `${drv.uid}.${ch.name}`;
    let c = chanMap.get(key);
    if (!c) {
      c = { driverLabel: drv.label, driverId: dcomp.id, driverName: dcomp.name, scheme: wiring.scheme, ch, motors: [], side, sign, prefix: "", fn: "", pins: [], pwmFreq: PWM_FREQ[dcomp.id] ?? 1000 };
      chanMap.set(key, c);
      // controller pins of this channel
      const roles: [ChanPin["role"], string, boolean][] = [];
      const speedPins = new Set(ch.speedPins);
      roles.push(["inA", ch.inA, speedPins.has(ch.inA)], ["inB", ch.inB, speedPins.has(ch.inB)]);
      if (ch.en) roles.push(["en", ch.en, true]);
      if (ch.stby) roles.push(["stby", ch.stby, false]);
      for (const e of ch.enables ?? []) roles.push(["enable", e, false]);
      for (const [role, pinId, speed] of roles) {
        const net = g.netOf.get(`${drv.uid}.${pinId}`);
        const cp = ctrlPinOnNet(net, arch);
        let tie: ChanPin["tie"] = cp ? "gpio" : net?.isGround ? "low" : net?.voltage != null ? "high" : "float";
        if (role === "en" && !cp && ch.enJumperOption && Boolean(optionValue(dcomp, drv, ch.enJumperOption))) tie = "high";
        c.pins.push({ role, driverPin: pinId, ctrl: cp, tie, speed, name: "" });
      }
    }
    c.motors.push(info);
  }
  // motor-test numbers for non-4WD robots: left motors first, then right
  let next = Math.max(0, ...motors.map((m) => m.num)) + 1;
  for (const m of [...motors.filter((x) => x.side === "L"), ...motors.filter((x) => x.side === "R")]) {
    if (!m.num) m.num = next++;
  }

  const channels = [...chanMap.values()];
  for (const c of channels) {
    const sides = new Set(c.motors.map((m) => m.side));
    if (sides.size > 1) missing.push(`${c.driverLabel} channel ${c.ch.name} drives motors on BOTH sides (${c.motors.map((m) => m.label).join(", ")}) — a skid-steer robot needs the left and right motors on separate channels.`);
    const signs = new Set(c.motors.map((m) => m.sign));
    if (signs.size > 1) missing.push(`${c.driverLabel} channel ${c.ch.name}: ${c.motors.map((m) => m.label).join(" and ")} are wired with opposite polarity, so they would turn against each other — swap the leads of one of them.`);
    c.side = c.motors[0].side;
    c.sign = c.motors[0].sign;
    if (c.motors.length > 1) warnings.push(`${c.motors.map((m) => m.label).join(" + ")} share ${c.driverLabel} channel ${c.ch.name}: they always get the same command (the motor test runs them together).`);
    // required inputs
    for (const p of c.pins) {
      const what = `${c.driverLabel} ${p.driverPin} (channel ${c.ch.name}, ${c.motors.map((m) => m.label).join(" + ")})`;
      if (p.role === "inA" || p.role === "inB") {
        if (p.tie !== "gpio") missing.push(`A controller pin on ${what} — the direction/speed input is not wired to ${cpart.label}.`);
      } else if (p.role === "en") {
        if (p.tie === "float" || p.tie === "low") missing.push(`A PWM pin on ${what} — the enable input is not connected, so the channel can never run.`);
        else if (p.tie === "high") warnings.push(`${what} is tied HIGH (jumper): this channel runs at full speed only — no PWM speed control.`);
      } else if (p.tie === "float" || p.tie === "low") {
        missing.push(`${what} must be HIGH (tie it to the logic supply or wire it to a controller pin) — otherwise the driver stays disabled.`);
      }
      if (p.speed && p.tie === "gpio" && p.ctrl && !board.pwmPins.includes(p.ctrl.gpio))
        missing.push(`${what} is on ${p.ctrl.label}, which cannot generate PWM on ${board.name}. Move it to a PWM pin (${board.pwmPins.slice(0, 8).join(", ")}…).`);
      if (p.tie === "gpio" && p.ctrl && arch === "esp32" && [34, 35, 36, 39].includes(p.ctrl.gpio)) missing.push(`${what} is on GPIO ${p.ctrl.gpio}, which is input-only on the ESP32.`);
    }
  }
  if (motorParts.length && !channels.some((c) => c.side === "L")) missing.push("A driver channel for the LEFT side — no left motor is reachable through a driver.");
  if (motorParts.length && !channels.some((c) => c.side === "R")) missing.push("A driver channel for the RIGHT side — no right motor is reachable through a driver.");

  // names: FL/FR/RL/RR for one motor per channel, LEFT/RIGHT for pairs
  const used = new Set<string>();
  const ordered = [...channels].sort((a, b) => Math.min(...a.motors.map((m) => m.num)) - Math.min(...b.motors.map((m) => m.num)));
  for (const c of ordered) {
    let base = c.motors.length === 1 && c.motors[0].corner ? c.motors[0].corner : c.side === "L" ? "LEFT" : "RIGHT";
    if (c.motors.length === 1 && !c.motors[0].corner) base = sanitize(c.motors[0].label);
    let prefix = base;
    for (let k = 2; used.has(prefix); k++) prefix = `${base}${k}`;
    used.add(prefix);
    c.prefix = prefix;
    c.fn = `run${prefix}`;
    for (const p of c.pins) p.name = `${prefix}_${sanitize(p.driverPin)}`;
  }

  // ── sensors ──
  const line: LineCh[] = [];
  const edges: EdgeSensor[] = [];
  const distCands: (DistSensor & { score: number })[] = [];
  const pinIsAnalog = (cp: CtrlPin | null) => !!cp && board.analogPins.includes(cp.gpio);
  for (const p of g.parts) {
    const c = g.comps.get(p.uid)!;
    const s = c.sensor;
    if (!s || c.kind !== "sensor") continue;
    if (s.kind.startsWith("reflectance")) {
      if (s.kind.endsWith("-rc")) {
        warnings.push(`${p.label} (${c.name}) is an RC-type sensor (timed discharge) — not supported by the generator; it is ignored.`);
        continue;
      }
      const outs = c.pins.filter((x) => x.fn === "out-analog" || x.fn === "out-digital");
      const nCh = s.channels ?? 1;
      const pitch = s.pitch_mm ?? 10;
      const yaw = p.rotation.z;
      const powered = g.powered.has(p.uid);
      const chans: LineCh[] = [];
      for (let i = 0; i < nCh; i++) {
        const cands = nCh === 1 ? outs : outs.filter((x) => channelIndex(x.id) === i);
        const analogPin = cands.find((x) => x.fn === "out-analog" && pinIsAnalog(ctrlPinOnNet(g.netOf.get(`${p.uid}.${x.id}`), arch)));
        const digitalPin = cands.find((x) => x.fn === "out-digital" && ctrlPinOnNet(g.netOf.get(`${p.uid}.${x.id}`), arch));
        const analogWired = cands.find((x) => x.fn === "out-analog" && ctrlPinOnNet(g.netOf.get(`${p.uid}.${x.id}`), arch));
        const pick = analogPin ?? digitalPin;
        if (!pick) {
          if (analogWired) missing.push(`${p.label} ${analogWired.label}: an analog output is wired to ${ctrlPinOnNet(g.netOf.get(`${p.uid}.${analogWired.id}`), arch)!.label}, which has no ADC${arch === "esp32" ? " usable here (ADC1: GPIO 32–39; ADC2 pins only without Wi-Fi)" : ""}.`);
          else missing.push(`${p.label} channel ${i + 1} (${cands.map((x) => x.label).join("/") || "output"}) is not wired to the controller.`);
          continue;
        }
        const off = ((nCh - 1) / 2 - i) * pitch;
        const ctrlPin = ctrlPinOnNet(g.netOf.get(`${p.uid}.${pick.id}`), arch)!;
        chans.push({ ctrl: ctrlPin, mode: pick.fn === "out-analog" ? "analog" : "digital", blackHigh: (s.blackLevel ?? 1) === 1, source: `${p.label}.${pick.label}`, y: p.position.y + Math.sin(yaw) * off });
      }
      if (!powered) missing.push(`Power for ${p.label} (${c.name}): its VCC is not supplied or it has no ground.`);
      if (behaviour === "sumo") {
        for (const ch of chans) edges.push({ label: p.label, side: Math.abs(ch.y) < 5 ? "C" : ch.y > 0 ? "L" : "R", ctrl: ch.ctrl, mode: ch.mode, whiteHigh: !ch.blackHigh, name: "" });
      } else line.push(...chans);
      continue;
    }
    if (["ultrasonic", "ir-obstacle-digital", "ir-distance-analog"].includes(s.kind)) {
      const facing = Math.cos(p.rotation.z);
      const score = facing * 100 - Math.abs(p.position.y) / 10 + p.position.x / 100;
      if (!g.powered.has(p.uid)) missing.push(`Power for ${p.label} (${c.name}): its VCC is not supplied or it has no ground.`);
      if (s.kind === "ultrasonic") {
        const trig = ctrlPinOnNet(g.netOf.get(`${p.uid}.TRIG`), arch);
        const echo = ctrlPinOnNet(g.netOf.get(`${p.uid}.ECHO`), arch);
        if (!trig || !echo) {
          missing.push(`${p.label} (${c.name}): ${!trig ? "TRIG" : ""}${!trig && !echo ? " and " : ""}${!echo ? "ECHO" : ""} not wired to the controller.`);
          continue;
        }
        if (arch === "esp32" && [34, 35, 36, 39].includes(trig.gpio)) missing.push(`${p.label} TRIG is on input-only GPIO ${trig.gpio}.`);
        distCands.push({ kind: "ultrasonic", label: p.label, compName: c.name, trig, echo, score });
      } else {
        const outPin = c.pins.find((x) => x.fn === "out-digital" || x.fn === "out-analog")!;
        const out = ctrlPinOnNet(g.netOf.get(`${p.uid}.${outPin.id}`), arch);
        if (!out) {
          missing.push(`${p.label} (${c.name}) output ${outPin.label} is not wired to the controller.`);
          continue;
        }
        if (s.kind === "ir-distance-analog") {
          if (!pinIsAnalog(out)) {
            missing.push(`${p.label} (${c.name}) is an analog sensor on ${out.label}, which has no ADC.`);
            continue;
          }
          distCands.push({ kind: "ir-analog", label: p.label, compName: c.name, out, longRange: (s.maxRange_mm ?? 800) > 1000, score });
        } else distCands.push({ kind: "ir-digital", label: p.label, compName: c.name, out, activeHigh: (s.activeLevel ?? 0) === 1, score });
      }
    }
  }
  line.sort((a, b) => b.y - a.y); // left → right
  if (line.length) {
    const modes = new Set(line.map((l) => l.mode));
    if (modes.size > 1) missing.push("Line sensors of one kind: some line sensors are read as analog and some as digital — wire them all the same way.");
  }
  // edge sensor names
  const edgeCount: Record<string, number> = {};
  for (const e of edges.sort((a, b) => (a.side === "L" ? 0 : a.side === "C" ? 1 : 2) - (b.side === "L" ? 0 : b.side === "C" ? 1 : 2))) {
    const base = e.side === "L" ? "EDGE_LEFT" : e.side === "R" ? "EDGE_RIGHT" : "EDGE_CENTRE";
    edgeCount[base] = (edgeCount[base] ?? 0) + 1;
    e.name = edgeCount[base] > 1 ? `${base}${edgeCount[base]}` : base;
  }
  distCands.sort((a, b) => b.score - a.score);
  const distance = distCands[0] ?? null;
  if (distCands.length > 1) warnings.push(`${distCands.length} distance sensors found; the generated code uses the forward-facing ${distance!.label} only.`);

  // ── serial module (HC-05 / HC-06) ──
  let serial: SerialLink | null = null;
  for (const p of g.parts) {
    const c = g.comps.get(p.uid)!;
    if (c.kind === "controller") continue;
    const tx = c.pins.find((x) => x.fn === "uart-tx");
    if (!tx || c.kind !== "wireless") continue;
    const net = g.netOf.get(`${p.uid}.${tx.id}`);
    const gp = net?.members.find((x) => x.comp.kind === "controller" && x.pin.fn === "gpio");
    if (!gp) {
      warnings.push(`${p.label} (${c.name}) TXD is not wired to the controller — it is ignored.`);
      continue;
    }
    if (!(gp.pin.caps ?? []).includes("uart-rx")) {
      missing.push(`${p.label} (${c.name}) TXD must go to the controller's hardware RX pin (${arch === "esp32" ? "RX2 = GPIO16" : "D0"}); ${gp.pin.label} would need SoftwareSerial, which is not supported.`);
      continue;
    }
    const port = serialPortFor(board, gp.pin.arduinoPin!);
    if (!port) {
      missing.push(`${p.label} (${c.name}) TXD is on ${gp.pin.label}, a UART pin the generator cannot map to a Serial port.`);
      continue;
    }
    if (!g.powered.has(p.uid)) missing.push(`Power for ${p.label} (${c.name}): VCC (3.6–6 V) is not supplied or it has no ground.`);
    serial = { label: p.label, compName: c.name, port, rx: toCtrl(gp.pin, arch) };
    break;
  }

  return { board, arch, controller: ctrl.first, channels: ordered, motors, line, edges, distance, serial, missing, warnings, graph: g };
}

function serialPortFor(board: BoardProfile, rxGpio: number): string | null {
  if (board.key === "esp32-devkit-v1") return rxGpio === 3 ? "Serial" : rxGpio === 16 ? "Serial2" : null;
  if (board.key === "mega") return ({ 0: "Serial", 19: "Serial1", 17: "Serial2", 15: "Serial3" } as Record<number, string>)[rxGpio] ?? null;
  return rxGpio === 0 ? "Serial" : null;
}

// ───────────────────────────── detection ─────────────────────────────

export function detectBehaviour(project: Project): Behaviour {
  const a = analyse(project, project.competition === "sumo" ? "sumo" : "line");
  if (project.competition === "line" && a.line.length >= 2) return "line";
  if (project.competition === "sumo" && a.distance) return "sumo";
  if (a.serial) return "manual";
  if (a.arch === "esp32" && /#include\s*<WiFi\.h>/.test(project.code ?? "")) return "manual";
  if (a.distance) return "obstacle";
  return "motor-test";
}

export function detectControl(project: Project): ControlMethod {
  const a = analyse(project, "manual");
  if (a.serial) return "hc05";
  if (a.arch === "esp32" && /#include\s*<WiFi\.h>/.test(project.code ?? "")) return "wifi";
  return "none";
}

// ───────────────────────────── parameters ─────────────────────────────

interface Param {
  name: string;
  type: "int" | "float" | "unsigned long";
  value: number;
  comment: string;
}

const DEFAULTS: Record<Behaviour, Param[]> = {
  manual: [
    { name: "cruiseSpeed", type: "int", value: 200, comment: "normal top speed (0-255); live: V<0-255>" },
    { name: "boostSpeed", type: "int", value: 255, comment: "speed while boost ('+') is on" },
    { name: "turnSpeed", type: "int", value: 190, comment: "pivot turns: skid steering needs more torque than driving straight" },
    { name: "testSpeed", type: "int", value: 160, comment: "single-motor test (commands 1-4)" },
    { name: "accelStep", type: "int", value: 8, comment: "PWM increase per 20 ms (acceleration ramp)" },
    { name: "brakeStep", type: "int", value: 30, comment: "PWM decrease per 20 ms (braking ramp)" },
    { name: "linkTimeoutMs", type: "unsigned long", value: 1000, comment: "connection-loss stop: no command for this long while moving = stop (0 = off)" },
    { name: "safeCm", type: "int", value: 25, comment: "obstacle assist: forward driving is blocked closer than this (cm)" },
  ],
  line: [
    { name: "baseSpeed", type: "int", value: 120, comment: "straight-line speed (0-255); live: B<value>" },
    { name: "minSpeed", type: "int", value: 60, comment: "speed when the line is at the edge of the array (sharp turn)" },
    { name: "Kp", type: "float", value: 0.12, comment: "proportional gain (error range -1000 .. +1000); live: P<value>" },
    { name: "Ki", type: "float", value: 0, comment: "integral gain (keep 0 unless the robot drifts on long curves)" },
    { name: "Kd", type: "float", value: 0.8, comment: "derivative gain (damps oscillation); live: D<value>" },
    { name: "lineThreshold", type: "int", value: 300, comment: "summed sensor value below this = line lost" },
    { name: "searchSpeed", type: "int", value: 150, comment: "pivot speed while the line is lost" },
    { name: "sweepTime", type: "int", value: 700, comment: "ms of pivoting per sweep (about 135 deg); the search never turns further" },
    { name: "gapTime", type: "int", value: 150, comment: "ms to roll straight on when the line vanishes while centred (gap / line end)" },
    { name: "calSpeed", type: "int", value: 100, comment: "pivot speed of the calibration sweep (analog sensors)" },
  ],
  sumo: [
    { name: "attackSpeed", type: "int", value: 255, comment: "speed when the opponent is ahead" },
    { name: "searchSpeed", type: "int", value: 170, comment: "spin speed while searching" },
    { name: "attackRangeCm", type: "int", value: 45, comment: "charge when the opponent is closer than this (cm)" },
    { name: "startDelayMs", type: "unsigned long", value: 5000, comment: "start delay required by most sumo rules" },
    { name: "edgeReverseMs", type: "int", value: 250, comment: "back-off time after an edge sensor sees the white border" },
    { name: "edgeTurnMs", type: "int", value: 300, comment: "turn-away time after backing off" },
    { name: "spinMs", type: "unsigned long", value: 1500, comment: "search: spin this long (about one full turn) ..." },
    { name: "creepMs", type: "unsigned long", value: 350, comment: "... then creep forward this long, so the whole ring gets searched" },
    { name: "creepSpeed", type: "int", value: 150, comment: "speed of the forward creep" },
  ],
  obstacle: [
    { name: "autoSpeed", type: "int", value: 170, comment: "cruising speed" },
    { name: "turnSpeed", type: "int", value: 190, comment: "pivot speed while turning away" },
    { name: "safeCm", type: "int", value: 45, comment: "start turning away when something is closer than this (cm)" },
    { name: "stopCm", type: "int", value: 22, comment: "closer than this: stop and back up first (cm)" },
    { name: "clearMs", type: "int", value: 250, comment: "keep turning this long after the way ahead is clear" },
    { name: "reverseMs", type: "int", value: 400, comment: "back-up time when something is very close" },
    { name: "maxTurnMs", type: "unsigned long", value: 3000, comment: "turning longer than this = stuck: back up and turn the other way" },
  ],
  "motor-test": [
    { name: "testSpeed", type: "int", value: 160, comment: "PWM used for each motor test step" },
    { name: "stepMs", type: "unsigned long", value: 1000, comment: "duration of each test step" },
  ],
};

function params(behaviour: Behaviour, tunables: Record<string, number> | undefined, warnings: string[], extra: Param[] = []): Param[] {
  const list = [...DEFAULTS[behaviour].map((p) => ({ ...p })), ...extra];
  for (const [k, v] of Object.entries(tunables ?? {})) {
    const p = list.find((x) => x.name === k);
    if (!p) {
      warnings.push(`Unknown tunable "${k}" for the ${behaviour} behaviour — ignored (known: ${list.map((x) => x.name).join(", ")}).`);
      continue;
    }
    if (!Number.isFinite(v)) continue;
    p.value = p.type === "float" ? v : Math.round(v);
  }
  return list;
}

const fmtNum = (p: Param) => (p.type === "float" ? (Number.isInteger(p.value) ? p.value.toFixed(1) : String(p.value)) : String(p.value));
const paramLines = (ps: Param[]) => ps.map((p) => `${p.type} ${p.name} = ${fmtNum(p)};${" ".repeat(Math.max(1, 26 - p.type.length - p.name.length - fmtNum(p).length))}// ${p.comment}`);

// ───────────────────────────── code building blocks ─────────────────────────────

function pwmWrite(a: Analysis, pin: string, value: string) {
  return a.arch === "esp32" ? `ledcWrite(${pin}, ${value})` : `analogWrite(${pin}, ${value})`;
}

function channelFunction(a: Analysis, c: Channel): string {
  const P = (role: ChanPin["role"]) => c.pins.find((p) => p.role === role);
  const inA = P("inA")!,
    inB = P("inB")!,
    en = P("en");
  const motorsTxt = `${c.motors.map((m) => m.label).join(" + ")} (${c.side === "L" ? "left" : "right"} side)`;
  const L: string[] = [];
  L.push(`// ${c.driverLabel} (${c.driverName}) channel ${c.ch.name}, outputs ${c.ch.outs.join("/")}: ${motorsTxt}`);
  L.push(`void ${c.fn}(int speed) {`);
  L.push(`  speed = constrain(speed, -255, 255);`);
  if (c.sign < 0) L.push(`  speed = -speed;   // these motors are wired so that the channel's "reverse" turns the wheels forward`);
  const dw = (p: ChanPin, v: string) => `digitalWrite(${p.name}, ${v})`;
  switch (c.scheme) {
    case "in-in-en": {
      const speedOk = en && en.tie === "gpio";
      L.push(`  if (speed == 0) {          // stop: enable off (the speed ramp has already slowed the motors)`);
      L.push(`    ${dw(inA, "LOW")};`, `    ${dw(inB, "LOW")};`);
      if (speedOk) L.push(`    ${pwmWrite(a, en!.name, "0")};`);
      L.push(`    return;`, `  }`);
      L.push(`  ${dw(inA, "speed > 0 ? HIGH : LOW")};`, `  ${dw(inB, "speed > 0 ? LOW : HIGH")};`);
      if (speedOk) L.push(`  ${pwmWrite(a, en!.name, "abs(speed)")};`);
      break;
    }
    case "in-in-pwm-standby": {
      const speedOk = en && en.tie === "gpio";
      L.push(`  if (speed == 0) {          // TB6612 short brake: IN1 = IN2 = HIGH brakes whatever the PWM`);
      L.push(`    ${dw(inA, "HIGH")};`, `    ${dw(inB, "HIGH")};`);
      if (speedOk) L.push(`    ${pwmWrite(a, en!.name, "0")};`);
      L.push(`    return;`, `  }`);
      L.push(`  ${dw(inA, "speed > 0 ? HIGH : LOW")};`, `  ${dw(inB, "speed > 0 ? LOW : HIGH")};`);
      if (speedOk) L.push(`  ${pwmWrite(a, en!.name, "abs(speed)")};`);
      break;
    }
    case "rpwm-lpwm": {
      L.push(`  if (speed >= 0) {          // forward: PWM on RPWM, LPWM low (0 = both low = brake)`);
      L.push(`    ${pwmWrite(a, inB.name, "0")};`, `    ${pwmWrite(a, inA.name, "speed")};`);
      L.push(`  } else {                   // reverse: PWM on LPWM`);
      L.push(`    ${pwmWrite(a, inA.name, "0")};`, `    ${pwmWrite(a, inB.name, "-speed")};`, `  }`);
      break;
    }
    case "in-in": {
      L.push(`  if (speed == 0) {          // stop: both inputs LOW (coast)`);
      L.push(`    ${pwmWrite(a, inA.name, "0")};`, `    ${pwmWrite(a, inB.name, "0")};`, `    return;`, `  }`);
      L.push(`  if (speed > 0) {`, `    ${pwmWrite(a, inB.name, "0")};`, `    ${pwmWrite(a, inA.name, "speed")};`, `  } else {`, `    ${pwmWrite(a, inA.name, "0")};`, `    ${pwmWrite(a, inB.name, "-speed")};`, `  }`);
      break;
    }
    case "pwm-dir": {
      L.push(`  ${dw(inB, "speed >= 0 ? LOW : HIGH")};   // DIR`);
      L.push(`  ${pwmWrite(a, inA.name, "abs(speed)")};          // PWM (0 = coast: this driver has no brake input)`);
      break;
    }
  }
  L.push(`}`);
  return L.join("\n");
}

function pinDefines(a: Analysis): string[] {
  const L: string[] = ["// ---- motor driver pins (read from the circuit) ----"];
  for (const c of a.channels) {
    for (const p of c.pins) {
      if (p.tie !== "gpio" || !p.ctrl) continue;
      const what = p.role === "en" ? "speed (PWM)" : p.role === "stby" ? "standby (HIGH = enabled)" : p.role === "enable" ? "half-bridge enable (HIGH)" : p.speed ? "PWM" : "direction";
      L.push(`#define ${p.name} ${p.ctrl.ref}`.padEnd(26) + `// ${p.ctrl.label} -> ${c.driverLabel} ${p.driverPin}: ${what}`);
    }
  }
  return L;
}

/** Shared STBY / enable pins driven by the controller (once each). */
function enablePins(a: Analysis): ChanPin[] {
  const seen = new Set<string>();
  const out: ChanPin[] = [];
  for (const c of a.channels)
    for (const p of c.pins)
      if ((p.role === "stby" || p.role === "enable") && p.tie === "gpio" && p.ctrl && !seen.has(p.ctrl.pinId)) {
        seen.add(p.ctrl.pinId);
        out.push(p);
      }
  return out;
}

function motorPinSetup(a: Analysis, enablesHigh: boolean): string[] {
  const L: string[] = [];
  const seen = new Set<string>();
  for (const c of a.channels)
    for (const p of c.pins) {
      if (p.tie !== "gpio" || !p.ctrl || seen.has(p.ctrl.pinId)) continue;
      seen.add(p.ctrl.pinId);
      if (p.speed && a.arch === "esp32") L.push(`  ledcAttach(${p.name}, ${c.pwmFreq}, 8);   // LEDC PWM: ${c.pwmFreq} Hz, 8-bit (ESP32 core 3.x)`);
      else L.push(`  pinMode(${p.name}, OUTPUT);`);
    }
  if (enablesHigh) for (const p of enablePins(a)) L.push(`  digitalWrite(${p.name}, HIGH);   // driver enabled`);
  return L;
}

function driveFunctions(a: Analysis): string {
  const left = a.channels.filter((c) => c.side === "L");
  const right = a.channels.filter((c) => c.side === "R");
  const L: string[] = [];
  L.push(...a.channels.map((c) => channelFunction(a, c)), "");
  L.push(`// skid steering: every left channel gets "left", every right channel gets "right" (-255 .. 255)`);
  L.push(`void drive(int left, int right) {`);
  for (const c of left) L.push(`  ${c.fn}(left);`);
  for (const c of right) L.push(`  ${c.fn}(right);`);
  L.push(`}`, "");
  L.push(`void stopMotors() { drive(0, 0); }`, "");
  const order = [...a.motors].sort((x, y) => x.num - y.num);
  L.push(`// single-motor test: ${order.map((m) => `${m.num} = ${m.label}`).join(", ")}`);
  L.push(`void runTest(int m, int speed) {`);
  for (const c of a.channels) {
    const nums = c.motors.map((m) => m.num);
    L.push(`  ${c.fn}(${nums.map((x) => `m == ${x}`).join(" || ")} ? speed : 0);${c.motors.length > 1 ? `   // ${c.motors.map((m) => m.label).join(" + ")} share this channel` : ""}`);
  }
  L.push(`}`);
  return L.join("\n");
}

function distanceCode(a: Analysis): { defines: string[]; setup: string[]; fn: string } {
  const d = a.distance!;
  if (d.kind === "ultrasonic") {
    return {
      defines: [`#define US_TRIG ${d.trig!.ref}`.padEnd(26) + `// ${d.trig!.label} -> ${d.label} TRIG`, `#define US_ECHO ${d.echo!.ref}`.padEnd(26) + `// ${d.echo!.label} <- ${d.label} ECHO`],
      setup: [`  pinMode(US_TRIG, OUTPUT);`, `  pinMode(US_ECHO, INPUT);`],
      fn: `// ${d.label} (${d.compName}): distance in cm, 999 = nothing within range (echo timeout)
long distanceCm() {
  digitalWrite(US_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(US_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(US_TRIG, LOW);
  long us = pulseIn(US_ECHO, HIGH, 25000);   // 25 ms timeout = about 4 m
  if (us == 0) return 999;
  return us / 58;
}`,
    };
  }
  if (d.kind === "ir-digital") {
    return {
      defines: [`#define IR_OBSTACLE ${d.out!.ref}`.padEnd(26) + `// ${d.out!.label} <- ${d.label} OUT`],
      setup: [`  pinMode(IR_OBSTACLE, INPUT);`],
      fn: `// ${d.label} (${d.compName}) only says "something is close" (about 2-30 cm):
// it is reported as 10 cm, or 999 when nothing is seen.
long distanceCm() {
  if (digitalRead(IR_OBSTACLE) == ${d.activeHigh ? "HIGH" : "LOW"}) return 10;
  return 999;
}`,
    };
  }
  const vref = a.board.vRef;
  return {
    defines: [`#define IR_DIST ${d.out!.ref}`.padEnd(26) + `// ${d.out!.label} <- ${d.label} VO (analog)`],
    setup: [],
    fn: `// ${d.label} (${d.compName}): analog voltage -> distance (datasheet curve fit), 999 = out of range
long distanceCm() {
  float volts = analogRead(IR_DIST) * ${vref.toFixed(1)} / ${a.board.adcMax}.0;
  if (volts < 0.45) return 999;
  long cm = ${d.longRange ? "pow(60.374 / volts, 1.16)" : "pow(27.86 / volts, 1.15)"};
  if (cm > ${d.longRange ? 150 : 80}) return 999;
  return cm;
}`,
  };
}

// ───────────────────────────── behaviours ─────────────────────────────

interface Sketch {
  includes: string[];
  defines: string[];
  globals: string[];
  functions: string[];
  setup: string[];
  loop: string[];
  libraries: string[];
}

type Transport = { kind: "serial"; port: string; label: string } | { kind: "wifi" } | { kind: "none" };

function commandFunctions(a: Analysis, assist: boolean): string {
  return `// Apply one command character (same protocol over Bluetooth, Wi-Fi or USB serial).
void setTargets(char c) {
  int v = boost ? boostSpeed : cruiseSpeed;
  int t = boost ? boostSpeed : turnSpeed;
  switch (c) {
    case 'F': targetL = v;           targetR = v;           break;
    case 'B': targetL = -v * 7 / 10; targetR = -v * 7 / 10; break;
    case 'L': targetL = -t;          targetR = t;           break;   // pivot left in place
    case 'R': targetL = t;           targetR = -t;          break;   // pivot right in place
    case 'Q': targetL = v / 3;       targetR = v;           break;   // arc forward-left
    case 'E': targetL = v;           targetR = v / 3;       break;   // arc forward-right
    case 'Z': targetL = -v / 3;      targetR = -v * 7 / 10; break;   // reverse-left
    case 'C': targetL = -v * 7 / 10; targetR = -v / 3;      break;   // reverse-right
    default:  targetL = 0;           targetR = 0;           break;   // 'S' and anything unknown = stop
  }
}

void handleCommand(char c) {
  if (c == '\\n' || c == '\\r' || c == ' ') return;
  lastCommandAt = millis();
  if (c == '+') boost = true;
  else if (c == '-') boost = false;
  else if (c >= '1' && c <= '${Math.min(9, Math.max(...a.motors.map((m) => m.num), 1))}') { testMotor = c - '0'; lastCommand = 'S'; }
  else if (c == '0') { testMotor = 0; lastCommand = 'S'; }
  else { lastCommand = c; testMotor = 0; }
  setTargets(lastCommand);
}

// Move 'current' towards 'target': gentle when speeding up, hard when slowing down or reversing.
int ramp(int current, int target) {
  if (current == target) return current;
  bool slowingDown = (abs(target) < abs(current)) || (target > 0 && current < 0) || (target < 0 && current > 0);
  int step = slowingDown ? brakeStep : accelStep;
  if (target > current) return min(current + step, target);
  return max(current - step, target);
}

void manualStep() {
  if (millis() - lastRamp < 20) return;
  lastRamp = millis();
  bool moving = targetL != 0 || targetR != 0 || testMotor > 0;
  if (linkTimeoutMs > 0 && moving && millis() - lastCommandAt > linkTimeoutMs) {
    // connection lost (no command within linkTimeoutMs while moving): stop
    lastCommand = 'S';
    testMotor = 0;
    setTargets('S');
    currentL = 0;
    currentR = 0;
    stopMotors();
    Serial.println("LINK LOST - motors stopped");
    return;
  }
  if (testMotor > 0) {   // individual motor test: only the chosen motor turns
    runTest(testMotor, testSpeed);
    currentL = 0;
    currentR = 0;
    return;
  }
  int tl = targetL, tr = targetR;${
    assist
      ? `
  if (millis() - lastPing >= 60) {   // obstacle assist: never drive forward into something close
    lastPing = millis();
    lastDistance = distanceCm();
  }
  if (tl > 0 && tr > 0 && lastDistance < safeCm) { tl = 0; tr = 0; }`
      : ""
  }
  currentL = ramp(currentL, tl);
  currentR = ramp(currentR, tr);
  drive(currentL, currentR);
}`;
}

function manualSketch(a: Analysis, ps: Param[], transport: Transport): Sketch {
  const assist = !!a.distance;
  const used = ps.filter((p) => assist || p.name !== "safeCm");
  const s: Sketch = { includes: [], defines: [], globals: [], functions: [], setup: [], loop: [], libraries: [] };
  s.globals.push("// ---- adjustable parameters ----", ...paramLines(used), "");
  s.globals.push(
    "bool boost = false;",
    "char lastCommand = 'S';",
    `int testMotor = 0;              // 0 = normal driving, 1..${a.motors.length} = run one motor`,
    "int targetL = 0, targetR = 0;",
    "int currentL = 0, currentR = 0;",
    "unsigned long lastRamp = 0;",
    "unsigned long lastCommandAt = 0;",
  );
  if (assist) s.globals.push("unsigned long lastPing = 0;", "long lastDistance = 999;");
  if (assist) {
    const dc = distanceCode(a);
    s.defines.push(...dc.defines);
    s.setup.push(...dc.setup);
    s.functions.push(dc.fn);
  }
  s.functions.push(commandFunctions(a, assist));
  if (transport.kind === "serial") {
    const S = transport.port;
    s.functions.push(`// ${transport.label}: commands arrive on ${S}
void readCommands() {
  while (${S}.available() > 0) {
    char c = ${S}.read();
    if (c == 'V') {                // V<0-255>: cruise speed
      cruiseSpeed = constrain(${S}.parseInt(), 0, 255);
      lastCommandAt = millis();
      setTargets(lastCommand);
    } else handleCommand(c);
  }
}`);
    s.loop.push("  readCommands();", "  manualStep();");
  } else if (transport.kind === "wifi") {
    s.includes.push("#include <WiFi.h>", "#include <WebServer.h>");
    s.libraries.push("WiFi (ESP32 Arduino core)", "WebServer (ESP32 Arduino core)");
    s.globals.push(
      "",
      "// ---- Wi-Fi: the robot opens its own network (access point) ----",
      'const char* WIFI_SSID = "BEAST-4WD";',
      'const char* WIFI_PASSWORD = "beastfeast";   // at least 8 characters - change it!',
      "WebServer server(80);",
      "",
      "// Control page: buttons repeat their command every 150 ms while held (keep-alive for the link timeout).",
      `const char PAGE[] = R"rawliteral(<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BEAST 4WD</title><style>body{font-family:sans-serif;text-align:center;background:#111;color:#eee}
button{width:88px;height:64px;margin:6px;font-size:22px;border-radius:12px}</style></head><body>
<h2>BEAST 4WD</h2>
<div><button data-c="Q">&#8598;</button><button data-c="F">&#8593;</button><button data-c="E">&#8599;</button></div>
<div><button data-c="L">&#8634;</button><button data-c="S">STOP</button><button data-c="R">&#8635;</button></div>
<div><button data-c="Z">&#8601;</button><button data-c="B">&#8595;</button><button data-c="C">&#8600;</button></div>
<p>Speed <input type="range" min="0" max="255" value="200" id="v"></p>
<p><button data-c="1">1</button><button data-c="2">2</button><button data-c="3">3</button><button data-c="4">4</button><button data-c="0">0</button></p>
<script>
let timer=null;const send=(c)=>fetch('/cmd?c='+c).catch(()=>{});
document.querySelectorAll('button').forEach(b=>{const c=b.dataset.c;
 const down=e=>{e.preventDefault();send(c);clearInterval(timer);if('FBLRQEZC1234'.includes(c))timer=setInterval(()=>send(c),150);};
 const up=e=>{e.preventDefault();clearInterval(timer);if('FBLRQEZC'.includes(c))send('S');};
 b.addEventListener('pointerdown',down);b.addEventListener('pointerup',up);b.addEventListener('pointerleave',up);});
document.getElementById('v').addEventListener('change',e=>fetch('/cmd?c=V&v='+e.target.value));
</script></body></html>)rawliteral";`,
    );
    s.functions.push(`void handleRoot() {
  server.send(200, "text/html", PAGE);
}

// GET /cmd?c=F   (or /cmd?c=V&v=180 for the cruise speed)
void handleCmd() {
  String c = server.arg("c");
  if (c == "V") {
    cruiseSpeed = constrain(server.arg("v").toInt(), 0, 255);
    lastCommandAt = millis();
    setTargets(lastCommand);
  } else {
    for (int i = 0; i < c.length(); i++) handleCommand(c.charAt(i));
  }
  server.send(200, "text/plain", "OK");
}`);
    s.setup.push(
      "  WiFi.mode(WIFI_AP);",
      "  WiFi.softAP(WIFI_SSID, WIFI_PASSWORD);",
      '  Serial.print("Wi-Fi ready: join ");',
      "  Serial.print(WIFI_SSID);",
      '  Serial.print(" and open http://");',
      "  Serial.println(WiFi.softAPIP());",
      '  server.on("/", handleRoot);',
      '  server.on("/cmd", handleCmd);',
      "  server.begin();",
    );
    s.loop.push("  server.handleClient();", "  manualStep();");
  }
  return s;
}

function lineSketch(a: Analysis, ps: Param[]): Sketch {
  const n = a.line.length;
  const analog = a.line[0].mode === "analog";
  const used = ps.filter((p) => analog || p.name !== "calSpeed");
  const s: Sketch = { includes: [], defines: [], globals: [], functions: [], setup: [], loop: [], libraries: [] };
  s.globals.push(
    `// ---- line sensors: ${n} channels, left -> right (${a.line.map((l) => `${l.source} on ${l.ctrl.label}`).join(", ")}) ----`,
    `const int NUM_SENSORS = ${n};`,
    `const int linePins[NUM_SENSORS] = {${a.line.map((l) => l.ctrl.ref).join(", ")}};`,
    `int value[NUM_SENSORS];        // 0 (white) .. 1000 (black)`,
  );
  if (analog) s.globals.push("int minV[NUM_SENSORS];", "int maxV[NUM_SENSORS];");
  s.globals.push("", "// ---- adjustable parameters ----", ...paramLines(used), "");
  s.globals.push(
    "float error = 0;",
    "float prevError = 0;",
    "float integral = 0;",
    "int lastPosition = 0;",
    "int lastSpeed = 0;          // forward speed just before the line was lost",
    "bool lineSeen = false;",
    "int lastSide = 0;           // -1 = line last seen at the LEFT edge, +1 = RIGHT edge, 0 = centred",
    "unsigned long sideTime = 0;",
    "unsigned long edgeTime = 0;",
    "bool lost = false;",
    "unsigned long lostAt = 0;",
    "int searchDir = -1;",
    "unsigned long lastControl = 0;",
  );
  if (analog) {
    s.functions.push(`// Sweep left and right over the line, recording each sensor's darkest and brightest reading.
void calibrate() {
  for (int i = 0; i < NUM_SENSORS; i++) { minV[i] = ${a.board.adcMax}; maxV[i] = 0; }
  unsigned long start = millis();
  while (millis() - start < 2400) {
    unsigned long t = (millis() - start) % 1200;
    if (t < 300) drive(-calSpeed, calSpeed);
    else if (t < 900) drive(calSpeed, -calSpeed);
    else drive(-calSpeed, calSpeed);
    for (int i = 0; i < NUM_SENSORS; i++) {
      int v = analogRead(linePins[i]);
      if (v < minV[i]) minV[i] = v;
      if (v > maxV[i]) maxV[i] = v;
    }
  }
  stopMotors();
  Serial.print("CAL");
  for (int i = 0; i < NUM_SENSORS; i++) { Serial.print(","); Serial.print(minV[i]); Serial.print("-"); Serial.print(maxV[i]); }
  Serial.println();
}`);
  }
  const spanMin = a.arch === "esp32" ? 200 : 50;
  const noise = a.arch === "esp32" ? 80 : 80;
  s.functions.push(`// Line position: -1000 (under the far-left sensor) .. +1000 (far right); sets lineSeen.
// When the line is lost it returns the last position it saw.
int readLine() {
  long weighted = 0;
  long sum = 0;
  for (int i = 0; i < NUM_SENSORS; i++) {
${
  analog
    ? `    int span = maxV[i] - minV[i];
    if (span < ${spanMin}) span = ${spanMin};
    int v = constrain((long)(analogRead(linePins[i]) - minV[i]) * 1000 / span, 0, 1000);
    if (v < ${noise}) v = 0;            // ignore noise`
    : `    int v = digitalRead(linePins[i]) == ${a.line[0].blackHigh ? "HIGH" : "LOW"} ? 1000 : 0;   // ${a.line[0].blackHigh ? "HIGH" : "LOW"} = black line`
}
    value[i] = v;
    weighted += (long)v * (i * 1000L);
    sum += v;
  }
  lineSeen = sum >= lineThreshold;
  if (lineSeen) lastPosition = (weighted / sum - (NUM_SENSORS - 1) * 500L) * 2 / (NUM_SENSORS - 1);
  return lastPosition;
}

// Remember which side the line went to. At a sharp corner the new leg appears under an OUTER
// sensor just before the line disappears, so an outer sighting wins for 200 ms.
void rememberSide(int position) {
  unsigned long now = millis();
  bool leftEdge = value[0] > 500;
  bool rightEdge = value[NUM_SENSORS - 1] > 500;
  if (leftEdge && !rightEdge) { lastSide = -1; edgeTime = now; sideTime = now; }
  else if (rightEdge && !leftEdge) { lastSide = 1; edgeTime = now; sideTime = now; }
  else if (now - edgeTime > 200 && position < -450) { lastSide = -1; sideTime = now; }
  else if (now - edgeTime > 200 && position > 450) { lastSide = 1; sideTime = now; }
  if (abs(position) < 450 && now - sideTime > 300) lastSide = 0;   // centred for a while: forget it
}

void pivot(int dir) {  // -1 = turn left on the spot, +1 = turn right
  drive(dir * searchSpeed, -dir * searchSpeed);
}

// Bounded search: turn towards the remembered side, sweep back the other way, return to the
// heading where the line was lost, then stop. It never turns more than about 135 deg from there,
// so it cannot swing round onto the line behind it and drive the course backwards.
void searchLine() {
  if (!lost) {
    lost = true;
    lostAt = millis();
    searchDir = lastSide != 0 ? lastSide : (lastPosition > 0 ? 1 : -1);
    integral = 0;                    // anti-windup: the old integral means nothing any more
  }
  long t = millis() - lostAt;
  if (lastSide != 0) {
    int brake = lastSpeed / 2;       // the first part of the turn also stops the forward run
    if (t < brake) { pivot(searchDir); return; }
    t -= brake;
  } else {
    // no idea where it went (gap, end of the line): roll on a little, then a narrow sweep first
    if (t < gapTime) { drive(minSpeed, minSpeed); return; }
    t -= gapTime;
    int narrow = sweepTime / 3;
    if (t < narrow) { pivot(searchDir); return; }
    if (t < 3 * narrow) { pivot(-searchDir); return; }
    if (t < 4 * narrow) { pivot(searchDir); return; }
    t -= 4 * narrow;
  }
  if (t < sweepTime) pivot(searchDir);
  else if (t < 3 * sweepTime) pivot(-searchDir);
  else if (t < 4 * sweepTime) pivot(searchDir);
  else stopMotors();                 // not within reach: stop safely
}

// Live tuning over USB serial: B<base speed>, P<Kp>, D<Kd>
void readTuning() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 'B') baseSpeed = Serial.parseInt();
    else if (c == 'P') Kp = Serial.parseFloat();
    else if (c == 'D') Kd = Serial.parseFloat();
  }
}

void followLine() {
  int position = readLine();
  if (!lineSeen) {
    searchLine();
    return;
  }
  if (lost) {
    lost = false;
    prevError = position;            // no derivative kick when the line comes back
  }
  rememberSide(position);
  error = position;
  float derivative = error - prevError;
  prevError = error;
  // slow down as the line moves towards the edge of the array, so sharp turns stay on the line
  int speed = baseSpeed - (long)(baseSpeed - minSpeed) * abs(position) / 1000;
  if (speed < minSpeed) speed = minSpeed;
  lastSpeed = speed;
  float output = Kp * error + Ki * integral + Kd * derivative;
  if (abs(speed) + abs(output) < 255) integral = constrain(integral + error, -20000, 20000);
  drive(speed + output, speed - output);
}`);
  if (!analog) s.setup.push("  for (int i = 0; i < NUM_SENSORS; i++) pinMode(linePins[i], INPUT);");
  if (analog) s.setup.push("  calibrate();                     // the robot must start with the sensor bar over the line");
  s.loop.push("  readTuning();", "  if (millis() - lastControl < 4) return;   // control loop every 4 ms", "  lastControl = millis();", "  followLine();");
  return s;
}

function sumoSketch(a: Analysis, ps: Param[]): Sketch {
  const s: Sketch = { includes: [], defines: [], globals: [], functions: [], setup: [], loop: [], libraries: [] };
  const dc = distanceCode(a);
  s.defines.push(...dc.defines);
  for (const e of a.edges) s.defines.push(`#define ${e.name} ${e.ctrl.ref}`.padEnd(26) + `// ${e.ctrl.label} <- ${e.label} (${e.mode}${e.mode === "digital" ? `, ${e.whiteHigh ? "HIGH" : "LOW"} over the white border` : ""})`);
  s.globals.push("// ---- adjustable parameters ----", ...paramLines(ps), "");
  if (a.edges.some((e) => e.mode === "analog")) s.globals.push(`int edgeThreshold = ${Math.round(a.board.adcMax * 0.35)};   // analog edge sensors: below this = white border`);
  s.globals.push("bool stopped = false;", "int searchDir = 1;", "unsigned long searchStart = 0;");
  s.functions.push(dc.fn);
  const read = (e: EdgeSensor) => (e.mode === "analog" ? `analogRead(${e.name}) < edgeThreshold` : `digitalRead(${e.name}) == ${e.whiteHigh ? "HIGH" : "LOW"}`);
  const left = a.edges.filter((e) => e.side === "L");
  const right = a.edges.filter((e) => e.side === "R");
  const centre = a.edges.filter((e) => e.side === "C");
  s.functions.push(`// Edge sensors: true while the white border is under the sensor.
bool edgeLeft() { return ${[...left, ...centre].map(read).join(" || ") || "false"}; }
bool edgeRight() { return ${[...right, ...centre].map(read).join(" || ") || "false"}; }`);
  const stby = enablePins(a);
  s.setup.push(...dc.setup, ...a.edges.map((e) => `  pinMode(${e.name}, INPUT);`));
  if (stby.length) s.setup.push(...stby.map((p) => `  digitalWrite(${p.name}, LOW);   // motors held in standby during the start delay`));
  s.setup.push("  stopMotors();", '  Serial.println("SUMO armed: waiting for the start delay");', "  delay(startDelayMs);");
  if (stby.length) s.setup.push(...stby.map((p) => `  digitalWrite(${p.name}, HIGH);`));
  s.setup.push('  Serial.println("GO!");', "  searchStart = millis();");
  s.loop.push(
    "  if (Serial.available() > 0 && Serial.read() == 'X') stopped = true;   // emergency stop",
    "  if (stopped) { stopMotors(); return; }",
    "",
    "  bool eL = edgeLeft();",
    "  bool eR = edgeRight();",
    "  if (eL || eR) {                  // boundary! back off and turn away from it",
    "    drive(-230, -230);",
    "    delay(edgeReverseMs);",
    "    if (eL) drive(220, -220); else drive(-220, 220);",
    "    delay(edgeTurnMs);",
    "    return;",
    "  }",
    "",
    "  long d = distanceCm();",
    "  if (d < attackRangeCm) {",
    "    drive(attackSpeed, attackSpeed);   // opponent ahead: push with all wheels",
    "  } else {",
    "    unsigned long phase = millis() - searchStart;",
    "    if (phase >= spinMs + creepMs) {   // next search cycle: spin the other way",
    "      searchStart = millis();",
    "      searchDir = -searchDir;",
    "      phase = 0;",
    "    }",
    "    if (phase < spinMs) drive(searchSpeed * searchDir, -searchSpeed * searchDir);   // spin to scan",
    "    else drive(creepSpeed, creepSpeed);                                           // then move on a little",
    "  }",
  );
  return s;
}

function obstacleSketch(a: Analysis, ps: Param[]): Sketch {
  const s: Sketch = { includes: [], defines: [], globals: [], functions: [], setup: [], loop: [], libraries: [] };
  const dc = distanceCode(a);
  s.defines.push(...dc.defines);
  s.globals.push("// ---- adjustable parameters ----", ...paramLines(ps), "");
  s.globals.push(
    "const int FORWARD = 0;",
    "const int TURNING = 1;",
    "const int BACKING = 2;",
    "int state = FORWARD;",
    "int turnDir = 1;                // +1 = turn right, -1 = turn left",
    "unsigned long stateAt = 0;",
    "unsigned long clearSince = 0;",
    "unsigned long lastPing = 0;",
    "long dist = 999;",
  );
  s.functions.push(dc.fn);
  s.functions.push(`void setState(int st) {
  state = st;
  stateAt = millis();
  clearSince = 0;
}

// forward -> (obstacle) stop + turn -> (clear) forward; very close or stuck -> back up (recover)
void avoidObstacles() {
  if (millis() - lastPing >= 50) {
    lastPing = millis();
    dist = distanceCm();
  }
  unsigned long inState = millis() - stateAt;
  if (state == FORWARD) {
    if (dist < stopCm) { stopMotors(); setState(BACKING); return; }
    if (dist < safeCm) { stopMotors(); setState(TURNING); return; }
    drive(autoSpeed, autoSpeed);
  } else if (state == TURNING) {
    drive(turnDir * turnSpeed, -turnDir * turnSpeed);
    if (dist < stopCm) { setState(BACKING); return; }
    if (dist >= safeCm) {
      if (clearSince == 0) clearSince = millis();
      if (millis() - clearSince > clearMs) setState(FORWARD);
    } else clearSince = 0;
    if (inState > maxTurnMs) { turnDir = -turnDir; setState(BACKING); }   // stuck: recover
  } else {
    drive(-autoSpeed, -autoSpeed);
    if (inState > reverseMs) setState(TURNING);
  }
}`);
  s.setup.push(...dc.setup, "  stateAt = millis();");
  s.loop.push("  avoidObstacles();");
  return s;
}

function motorTestSketch(a: Analysis, ps: Param[]): Sketch {
  const s: Sketch = { includes: [], defines: [], globals: [], functions: [], setup: [], loop: [], libraries: [] };
  const n = Math.max(...a.motors.map((m) => m.num));
  s.globals.push("// ---- adjustable parameters ----", ...paramLines(ps), "", "int step = 0;", "unsigned long stepAt = 0;");
  s.loop.push(
    `  // steps: each motor forward, then backward, one after another; then both sides; then a pause`,
    "  if (millis() - stepAt < stepMs) return;",
    "  stepAt = millis();",
    `  int m = step / 2 + 1;`,
    `  if (m <= ${n}) {`,
    "    int dir = step % 2 == 0 ? 1 : -1;",
    "    runTest(m, dir * testSpeed);",
    '    Serial.print("Motor "); Serial.print(m); Serial.println(dir > 0 ? " forward" : " backward");',
    `  } else if (m == ${n + 1}) {`,
    "    drive(step % 2 == 0 ? testSpeed : -testSpeed, step % 2 == 0 ? testSpeed : -testSpeed);",
    '    Serial.println(step % 2 == 0 ? "All forward" : "All backward");',
    "  } else {",
    "    stopMotors();",
    `    if (m > ${n + 2}) step = -1;`,
    "  }",
    "  step++;",
  );
  return s;
}

// ───────────────────────────── assembly ─────────────────────────────

function header(project: Project, a: Analysis, behaviour: Behaviour, control: ControlMethod): string {
  const L: string[] = [];
  const bar = "// =============================================================";
  L.push(bar, `// ${project.name.toUpperCase()} - generated by BEAST FEAST from this project's circuit`);
  L.push(`// Board: ${a.board.name}`);
  const drv = [...new Set(a.channels.map((c) => `${c.driverLabel} ${c.driverName}`))];
  L.push(`// Drivers: ${drv.join(", ")}`);
  for (const c of a.channels) L.push(`//   ${c.driverLabel} ch ${c.ch.name} -> ${c.motors.map((m) => m.label).join(" + ")} (${c.side === "L" ? "left" : "right"})`);
  if (a.line.length && behaviour === "line") L.push(`// Line sensors: ${a.line.length} channels, ${a.line[0].mode}, left -> right`);
  if (a.distance && behaviour !== "line") L.push(`// Distance: ${a.distance.label} (${a.distance.compName})`);
  if (a.edges.length && behaviour === "sumo") L.push(`// Edge sensors: ${a.edges.map((e) => e.label).join(", ")}`);
  const ctl = control === "hc05" && a.serial ? `${a.serial.label} ${a.serial.compName} on ${a.serial.port} (${a.serial.rx.label})` : control === "wifi" ? "ESP32 Wi-Fi access point + web page" : "none (autonomous)";
  L.push(`// Control: ${ctl}`);
  L.push(`// Behaviour: ${BEHAVIOUR_TEXT[behaviour]}`);
  if (behaviour === "manual") L.push("// Commands: F fwd, B back, L/R pivot, Q/E arcs, Z/C reverse arcs, S stop, + / - boost,", `//           V<0-255> cruise speed, 1-${Math.max(...a.motors.map((m) => m.num))} single-motor test, 0 end test`);
  L.push("// Regenerate this sketch after changing the circuit: pins below come from the wiring.", bar);
  return L.join("\n");
}

const BEHAVIOUR_TEXT: Record<Behaviour, string> = {
  manual: "manual driving with a connection-loss stop",
  line: "PID line following with sharp-turn handling and a bounded lost-line search",
  sumo: "start delay, search, attack and edge escape",
  obstacle: "autonomous obstacle avoidance (forward / stop / turn / recover)",
  "motor-test": "motor test sequence",
};

function assemble(project: Project, a: Analysis, behaviour: Behaviour, control: ControlMethod, sk: Sketch, serialBaud: { port: string; baud: number; note?: string }[]): string {
  const parts: string[] = [header(project, a, behaviour, control), ""];
  if (sk.includes.length) parts.push(...sk.includes, "");
  parts.push(...pinDefines(a));
  if (sk.defines.length) parts.push("", "// ---- sensor pins ----", ...sk.defines);
  parts.push("");
  if (sk.globals.length) parts.push(...sk.globals, "");
  parts.push(driveFunctions(a), "");
  for (const f of sk.functions) parts.push(f, "");
  parts.push("void setup() {");
  for (const b of serialBaud) parts.push(`  ${b.port}.begin(${b.baud});${b.note ? `   // ${b.note}` : ""}`);
  parts.push(...motorPinSetup(a, behaviour !== "sumo"));
  if (a.arch === "esp32" && (a.line.some((l) => l.mode === "analog") || a.distance?.kind === "ir-analog" || a.edges.some((e) => e.mode === "analog"))) parts.push(`  analogReadResolution(12);         // ESP32 ADC: 0..4095`);
  parts.push("  stopMotors();");
  parts.push(...sk.setup);
  if (behaviour === "manual") parts.push("  lastCommandAt = millis();");
  parts.push("}", "", "void loop() {", ...sk.loop, "}", "");
  return parts.join("\n");
}

function classifyWire(g: CircuitGraph, project: Project, w: Project["wires"][number]): GeneratedFirmware["wiring"][number] {
  const part = (uid: string) => project.parts.find((p) => p.uid === uid);
  const name = (e: { part: string; pin: string }) => `${part(e.part)?.label ?? e.part}.${e.pin}`;
  const comp = (e: { part: string; pin: string }) => g.comps.get(e.part);
  const pinOf = (e: { part: string; pin: string }) => comp(e)?.pins.find((p) => p.id === e.pin);
  const a = pinOf(w.from),
    b = pinOf(w.to);
  const fns = [a?.fn, b?.fn];
  const net = g.netOf.get(`${w.from.part}.${w.from.pin}`);
  let type: GeneratedFirmware["wiring"][number]["type"] = "signal";
  let note: string | undefined;
  if (net?.isGround) type = "ground";
  else if (fns.includes("motor-out") || fns.includes("motor-term")) type = "motor";
  else if (net?.voltage != null) {
    type = "power";
    note = `${net.voltage.toFixed(1)} V${net.vMax && net.vMax > net.voltage + 0.05 ? ` (${net.vMax.toFixed(1)} V full)` : ""}`;
  } else if (fns.includes("uart-tx") || fns.includes("uart-rx")) type = "serial";
  else if (fns.includes("out-analog")) type = "analog";
  else if (fns.includes("in-pwm") || (comp(w.from)?.kind === "motor-driver" && DRIVER_WIRING[comp(w.from)!.id]?.channels.some((c) => c.speedPins.includes(w.from.pin))) || (comp(w.to)?.kind === "motor-driver" && DRIVER_WIRING[comp(w.to)!.id]?.channels.some((c) => c.speedPins.includes(w.to.pin)))) type = "pwm";
  return { from: name(w.from), to: name(w.to), type, ...(note ? { note } : {}) };
}

function pinTableOf(a: Analysis, behaviour: Behaviour, control: ControlMethod): GeneratedFirmware["pinTable"] {
  const g = a.graph;
  const ctrl = a.controller!;
  const rows: GeneratedFirmware["pinTable"] = [];
  const fnFor = new Map<string, string>();
  for (const c of a.channels)
    for (const p of c.pins) {
      if (p.tie !== "gpio" || !p.ctrl) continue;
      const who = c.motors.length > 1 ? `${c.side === "L" ? "left" : "right"} motors (${c.motors.map((m) => m.corner ?? m.label).join(" + ")})` : `${c.motors[0].corner ?? c.motors[0].label} motor`;
      const what = p.role === "en" ? "speed (PWM)" : p.role === "stby" ? "driver standby (HIGH = on)" : p.role === "enable" ? "half-bridge enable" : p.speed ? (p.role === "inA" ? "forward PWM" : "reverse PWM") : "direction";
      const prev = fnFor.get(p.ctrl.pinId);
      fnFor.set(p.ctrl.pinId, prev && p.role !== "stby" && p.role !== "enable" ? `${prev}; ${who} ${what}` : prev ?? `${who[0].toUpperCase()}${who.slice(1)} ${what}`);
    }
  if (behaviour === "line") a.line.forEach((l, i) => fnFor.set(l.ctrl.pinId, `Line sensor ${i + 1} of ${a.line.length} (${i === 0 ? "far left" : i === a.line.length - 1 ? "far right" : "left → right"}, ${l.mode})`));
  if (behaviour === "sumo") for (const e of a.edges) fnFor.set(e.ctrl.pinId, `Edge sensor (${e.side === "L" ? "front-left" : e.side === "R" ? "front-right" : "front"}, ${e.mode})`);
  const d = a.distance;
  if (d && (behaviour === "sumo" || behaviour === "obstacle" || behaviour === "manual")) {
    const role = behaviour === "sumo" ? "opponent" : "obstacle";
    if (d.trig) fnFor.set(d.trig.pinId, `Ultrasonic TRIG (${role} distance)`);
    if (d.echo) fnFor.set(d.echo.pinId, `Ultrasonic ECHO (${role} distance)`);
    if (d.out) fnFor.set(d.out.pinId, `${d.kind === "ir-analog" ? "Analog IR distance" : "IR obstacle"} (${role})`);
  }
  if (a.serial && control === "hc05") fnFor.set(a.serial.rx.pinId, `Bluetooth commands in (${a.serial.port} RX)`);
  for (const pin of ctrl.comp.pins) {
    const net = g.netOf.get(`${ctrl.part.uid}.${pin.id}`);
    if (!net) continue;
    const others = net.members.filter((m) => m.part.uid !== ctrl.part.uid);
    if (!others.length) continue;
    const connectedTo = others.map((m) => `${m.part.label} ${m.pin.label}`).join(", ");
    let fn = fnFor.get(pin.id);
    if (!fn) {
      if (pin.fn === "gnd") fn = "Ground (common with the battery and drivers)";
      else if (pin.fn === "vin") fn = `Supply in (${net.voltage != null ? `${net.voltage.toFixed(1)} V${net.vMax && net.vMax > net.voltage + 0.05 ? `, ${net.vMax.toFixed(1)} V full` : ""}` : "not powered"})`;
      else if (pin.fn === "vout") fn = `${pin.label} supply out to modules`;
      else fn = "Wired, not used by this behaviour";
    }
    rows.push({ pin: pin.label, function: fn, connectedTo });
  }
  // the same GND appears on several bridged pins: keep one row per distinct (function, connectedTo)
  return rows.filter((r, i) => rows.findIndex((x) => x.connectedTo === r.connectedTo && x.function === r.function) === i);
}

// ───────────────────────────── entry ─────────────────────────────

export function generateFirmware(project: Project, opts: GenerateOptions = {}): GeneratedFirmware {
  const behaviour = opts.behaviour ?? detectBehaviour(project);
  const a = analyse(project, behaviour);
  const missing = [...a.missing];
  const warnings = [...a.warnings];
  const boardInfo = { key: a.board.key, name: a.board.name, fqbn: FQBN[a.board.key] ?? "" };
  let control: ControlMethod = opts.control ?? (behaviour === "manual" ? detectControl(project) : "none");
  if (opts.control === undefined && behaviour === "manual" && control === "none" && a.arch === "esp32") control = "wifi";

  // behaviour / control requirements
  if (behaviour === "line") {
    if (a.line.length < 2) missing.push(`A line-sensor array wired to the controller — the line behaviour needs at least 2 reflectance channels (found ${a.line.length}).`);
  }
  if (behaviour === "sumo") {
    if (!a.distance) missing.push("An opponent sensor (HC-SR04 / US-100 ultrasonic, Sharp IR or IR obstacle sensor) wired to the controller.");
    if (!a.edges.length) missing.push("Edge sensors (reflectance sensors looking at the ring) wired to the controller — without them the robot drives out of the ring.");
  }
  if (behaviour === "obstacle" && !a.distance) missing.push("A forward distance sensor (HC-SR04 / US-100 ultrasonic, Sharp IR or IR obstacle sensor) wired to the controller.");
  if (behaviour === "manual" && control === "none") missing.push("A control link for manual driving: an HC-05 Bluetooth module on the hardware RX pin, or an ESP32 for Wi-Fi control.");
  if (control === "hc05" && !a.serial) missing.push(`An HC-05 Bluetooth module whose TXD reaches the controller's hardware RX pin (${a.arch === "esp32" ? "RX2 = GPIO16 → Serial2" : "D0 → Serial"}).`);
  if (control === "wifi" && a.arch !== "esp32") missing.push("An ESP32 for Wi-Fi control — the Arduino Uno has no Wi-Fi.");
  if (control === "wifi" && a.serial) warnings.push(`${a.serial.label} (${a.serial.compName}) is wired but Wi-Fi control was chosen: the sketch does not use it.`);
  if (behaviour !== "manual" && control !== "none") {
    warnings.push(`The ${behaviour} behaviour is autonomous: the ${control === "hc05" ? "HC-05" : "Wi-Fi"} link is not used by this sketch.`);
    control = "none";
  }
  if (control === "wifi" && behaviour === "manual" && a.distance?.kind === "ir-analog" && a.distance.out && !ESP32_ADC1.includes(a.distance.out.gpio)) missing.push(`${a.distance.label} is on GPIO ${a.distance.out.gpio} (ADC2), which cannot be read while Wi-Fi is on — move it to an ADC1 pin (GPIO 32–39).`);

  const empty = (): GeneratedFirmware => ({
    ok: false,
    missing,
    warnings,
    board: boardInfo,
    code: "",
    libraries: [],
    pinTable: a.controller ? pinTableOf(a, behaviour, control) : [],
    wiring: project.wires.map((w) => classifyWire(a.graph, project, w)),
    setup: [],
    upload: [],
    expected: [],
    troubleshooting: missing.map((m) => `Missing: ${m}`),
    simulated: false,
    simulationNote: "No code was generated because the configuration is incomplete.",
  });
  if (missing.length) return empty();

  const ps = params(behaviour, opts.tunables, warnings);
  let sk: Sketch;
  let transport: Transport = { kind: "none" };
  if (behaviour === "manual") {
    transport = control === "wifi" ? { kind: "wifi" } : { kind: "serial", port: a.serial!.port, label: `${a.serial!.label} (${a.serial!.compName}) on ${a.serial!.rx.label}` };
    sk = manualSketch(a, ps, transport);
  } else if (behaviour === "line") sk = lineSketch(a, ps);
  else if (behaviour === "sumo") sk = sumoSketch(a, ps);
  else if (behaviour === "obstacle") sk = obstacleSketch(a, ps);
  else sk = motorTestSketch(a, ps);

  const bauds: { port: string; baud: number; note?: string }[] = [];
  if (transport.kind === "serial" && transport.port === "Serial") bauds.push({ port: "Serial", baud: 9600, note: "HC-05 default data-mode baud rate (shared with USB: debug prints go to the phone too)" });
  else {
    bauds.push({ port: "Serial", baud: a.arch === "esp32" ? 115200 : behaviour === "sumo" ? 9600 : 115200, note: "USB serial: status messages and live tuning" });
    if (transport.kind === "serial") bauds.push({ port: transport.port, baud: 9600, note: transport.port === "Serial2" ? "HC-05 on UART2: RX2 = GPIO16, TX2 = GPIO17 (ESP32 core defaults), 9600 baud" : "HC-05, 9600 baud" });
  }
  const code = assemble(project, a, behaviour, control, sk, bauds);
  const simulated = control !== "wifi";
  return {
    ok: true,
    missing: [],
    warnings,
    board: boardInfo,
    code,
    libraries: sk.libraries,
    pinTable: pinTableOf(a, behaviour, control),
    wiring: project.wires.map((w) => classifyWire(a.graph, project, w)),
    setup: setupSteps(a, behaviour, control),
    upload: uploadSteps(a, control),
    expected: expectedBehaviour(a, behaviour, control, ps),
    troubleshooting: troubleshooting(a, behaviour, control),
    simulated,
    simulationNote: simulated
      ? a.arch === "esp32"
        ? "Runs in the BEAST interpreter as ESP32 code: GPIO numbers, 12-bit analogRead, LEDC PWM (ledcAttach/ledcWrite) and Serial2 are simulated. The ESP32's radio (Wi-Fi/Bluetooth) is not."
        : undefined
      : "ESP32 Wi-Fi firmware (WiFi.h / WebServer.h) is generated and statically checked — the BEAST interpreter does not simulate Wi-Fi. In the arena, drive this robot in Manual mode.",
  };
}

const ESP32_ADC1 = [32, 33, 34, 35, 36, 39];

/** The sketch's adjustable parameters for a behaviour (names as in the code, with their meaning). */
export function adjustableParameters(behaviour: Behaviour, has: { distance?: boolean; analogLine?: boolean } = {}): { name: string; meaning: string }[] {
  return DEFAULTS[behaviour]
    .filter((p) => (p.name !== "safeCm" || behaviour !== "manual" || has.distance) && (p.name !== "calSpeed" || has.analogLine))
    .map((p) => ({ name: p.name, meaning: `${p.comment[0].toUpperCase()}${p.comment.slice(1)} (default ${fmtNum(p)}).` }));
}

/**
 * A simulator-compilable twin of a Wi-Fi sketch: identical pins, motor functions and command handling, with the
 * Wi-Fi transport replaced by commands over USB Serial. Used to statically check Wi-Fi firmware in the
 * interpreter (the twin is never uploaded).
 */
export function generateCheckTwin(project: Project, opts: GenerateOptions = {}): string | null {
  const behaviour = opts.behaviour ?? detectBehaviour(project);
  if (behaviour !== "manual") return null;
  const a = analyse(project, behaviour);
  if (a.missing.length || a.arch !== "esp32") return null;
  const warnings: string[] = [];
  const ps = params("manual", opts.tunables, warnings);
  const sk = manualSketch(a, ps, { kind: "serial", port: "Serial", label: "USB serial (check twin of the Wi-Fi sketch)" });
  return assemble(project, a, behaviour, "none", sk, [{ port: "Serial", baud: 115200 }]);
}

function setupSteps(a: Analysis, behaviour: Behaviour, control: ControlMethod): string[] {
  const g = a.graph;
  const out: string[] = [];
  for (const p of g.parts) {
    const c = g.comps.get(p.uid)!;
    if (c.kind === "regulator" && c.options.some((o) => o.key === "vout")) out.push(`Set ${p.label} (${c.name}) to ${Number(optionValue(c, p, "vout")).toFixed(1)} V with its trimmer and a multimeter BEFORE connecting the electronics.`);
    if (c.id === "l298n" && !optionValue(c, p, "regJumper")) out.push(`Remove ${p.label}'s 5V-regulator jumper (the battery is above 12 V) and feed its +5V pin from the regulated 5 V rail, as wired.`);
    if (c.id === "l298n" && (optionValue(c, p, "enaJumper") || optionValue(c, p, "enbJumper"))) out.push(`Remove ${p.label}'s ENA/ENB jumpers so the PWM pins control the speed.`);
    if (c.battery) out.push(`Charge ${p.label} (${c.name}) with a balance charger; switch the robot off (power switch) between runs.`);
  }
  out.push("Check every motor's direction with the motor test before the first real run; swap the two leads of a motor that turns backwards.");
  if (control === "hc05" && a.serial) out.push(`Pair your phone/PC with ${a.serial.label} (default PIN 1234 or 0000) and send single characters at 9600 baud.`);
  if (control === "wifi") out.push('Join the robot\'s Wi-Fi "BEAST-4WD" (password "beastfeast" — change both in the sketch) and open http://192.168.4.1.');
  if (behaviour === "line") out.push(a.line[0]?.mode === "analog" ? "Put the robot on the line (sensor bar across it) before switching on: it calibrates by sweeping over the line for 2.4 s." : "Adjust each digital sensor's trimmer so its LED switches exactly at the edge of the black line.");
  if (behaviour === "sumo") out.push("Place the robot in the ring facing the opponent; the motors stay off during the 5 s start delay.");
  if (behaviour === "obstacle" || (behaviour === "manual" && a.distance)) out.push("Mount the distance sensor level, facing straight ahead, with nothing of the robot in front of it.");
  return out;
}

function uploadSteps(a: Analysis, control: ControlMethod): string[] {
  if (a.arch === "esp32")
    return [
      "Arduino IDE: install the 'esp32 by Espressif Systems' core version 3.x (Boards Manager).",
      `Select the board 'DOIT ESP32 DEVKIT V1' (FQBN ${FQBN[a.board.key]}) and the ESP32's USB serial port.`,
      "Click Upload. If it stops at 'Connecting…', hold the BOOT button until the upload starts.",
      control === "wifi" ? "Open the Serial Monitor at 115200 baud to see the robot's IP address." : "Open the Serial Monitor at 115200 baud for status messages.",
    ];
  const steps = [`Arduino IDE: select the board '${a.board.name}' (FQBN ${FQBN[a.board.key]}) and its USB port.`];
  if (control === "hc05" && a.serial?.port === "Serial") steps.push(`Disconnect ${a.serial.label}'s TXD wire from D0 while uploading (it shares the USB serial line), then reconnect it.`);
  steps.push("Click Upload, then switch the robot on from its battery.");
  return steps;
}

function expectedBehaviour(a: Analysis, behaviour: Behaviour, control: ControlMethod, ps: Param[]): string[] {
  const v = (n: string) => ps.find((p) => p.name === n)?.value;
  switch (behaviour) {
    case "manual":
      return [
        "F drives all four wheels forward; B reverses; L / R spin the robot on the spot; S stops (with a short braking ramp).",
        `V<0-255> changes the cruise speed (default ${v("cruiseSpeed")}).`,
        `1–${Math.max(...a.motors.map((m) => m.num))} run a single motor (${[...a.motors].sort((x, y) => x.num - y.num).map((m) => `${m.num} = ${m.label}`).join(", ")}); 0 ends the test.`,
        `If no command arrives for ${v("linkTimeoutMs")} ms while moving, the motors stop ("LINK LOST").`,
        ...(a.distance ? [`Obstacle assist: driving forward is blocked when ${a.distance.label} sees something closer than ${v("safeCm")} cm; turning and reversing still work.`] : []),
        ...(control === "wifi" ? ["The web page's buttons resend their command every 150 ms while held, which keeps the link alive."] : []),
      ];
    case "line":
      return [
        a.line[0].mode === "analog" ? "Sweeps left and right over the line for 2.4 s to calibrate, then follows it." : "Follows the line as soon as it is switched on.",
        `Uses all ${a.line.length} sensors for a weighted line position and PID steering; slows down in sharp turns.`,
        "If the line is lost it searches towards the side where it was last seen (never more than ≈135°), and stops if it cannot find it.",
      ];
    case "sumo":
      return [`Waits ${v("startDelayMs")} ms after power-on, then spins to search.`, `Charges at full power when the opponent is closer than ${v("attackRangeCm")} cm.`, "Whenever an edge sensor sees the white border it backs off and turns away."];
    case "obstacle":
      return [`Drives forward at speed ${v("autoSpeed")}.`, `Stops and turns away when something is closer than ${v("safeCm")} cm; backs up first when closer than ${v("stopCm")} cm.`, "If it keeps turning for too long it backs up and tries the other direction."];
    default:
      return ["Runs each motor forward and backward in turn, then all motors together, then pauses and repeats."];
  }
}

function troubleshooting(a: Analysis, behaviour: Behaviour, control: ControlMethod): string[] {
  const t = [
    "A wheel turns the wrong way: swap that motor's two leads on the driver output (or regenerate the code after fixing the wiring).",
    "Nothing moves: check the power switch, the driver's motor supply and that every GND is connected together.",
  ];
  if (a.channels.some((c) => c.driverId === "l298n")) t.push("The L298N loses about 2 V and gets hot: for 12 V Johnson motors use BTS7960 drivers.");
  if (a.channels.some((c) => c.driverId === "tb6612fng")) t.push("TB6612FNG: STBY must be HIGH or the driver stays in standby.");
  if (control === "hc05") t.push(a.arch === "esp32" ? "No reaction to Bluetooth: HC-05 TXD must go to RX2 (GPIO16) and the module needs 5 V on VCC." : "No reaction to Bluetooth: HC-05 TXD must go to D0 (RX); disconnect it only while uploading.");
  if (control === "hc05" || control === "wifi") t.push('"LINK LOST" while driving: your app must keep sending the command (repeat it at least every 0.5 s) while a button is held, or raise linkTimeoutMs.');
  if (control === "wifi") t.push("Cannot open the page: you must be connected to the robot's Wi-Fi network, and the address is printed on the Serial Monitor.");
  if (behaviour === "line") t.push("Robot oscillates on straights: lower Kp or raise Kd; it misses sharp corners: lower baseSpeed or raise Kp.");
  if (a.arch === "esp32") t.push("ESP32 resets when the motors start: the 5 V regulator must supply at least 1 A and all grounds must be common.");
  return t;
}

/** Read-only summary of how the motors are driven (for validation and the UI): channel → motors, side and pins. */
export function describeDrive(project: Project): {
  board: string;
  channels: { driver: string; driverId: string; channel: string; side: "left" | "right"; motors: string[]; corners: (Corner | null)[]; pins: { driverPin: string; controllerPin: string | null; tie: string }[] }[];
  line: { pin: string; mode: "analog" | "digital"; source: string }[];
  edges: { pin: string; side: string; source: string }[];
  distance: { kind: string; label: string; pins: string[] } | null;
  serial: { label: string; port: string; pin: string } | null;
  missing: string[];
} {
  const a = analyse(project, project.competition === "sumo" ? "sumo" : "line");
  return {
    board: a.board.key,
    channels: a.channels.map((c) => ({ driver: c.driverLabel, driverId: c.driverId, channel: c.ch.name, side: c.side === "L" ? "left" : "right", motors: c.motors.map((m) => m.label), corners: c.motors.map((m) => m.corner), pins: c.pins.map((p) => ({ driverPin: p.driverPin, controllerPin: p.ctrl?.pinId ?? null, tie: p.tie })) })),
    line: a.line.map((l) => ({ pin: l.ctrl.pinId, mode: l.mode, source: l.source })),
    edges: a.edges.map((e) => ({ pin: e.ctrl.pinId, side: e.side, source: e.label })),
    distance: a.distance ? { kind: a.distance.kind, label: a.distance.label, pins: [a.distance.trig, a.distance.echo, a.distance.out].filter((x): x is CtrlPin => !!x).map((x) => x.pinId) } : null,
    serial: a.serial ? { label: a.serial.label, port: a.serial.port, pin: a.serial.rx.pinId } : null,
    missing: a.missing,
  };
}
