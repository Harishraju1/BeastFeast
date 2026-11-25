/**
 * Spec-driven Garage templates: ONE configuration → parts (3D robot), wiring, pin map, firmware and simulation.
 *
 *   TemplateSpec ──► 4WD layout (layout4WD) ──► parts + placement
 *                ──► pin allocator (pins.ts) + driver channel maps (drivers.ts) ──► wiring
 *                ──► buildFromTemplate ──► generateFirmware(project) ──► code + pin map (derived from the wiring)
 *
 * Nothing is hand-typed twice: the pin map is the generator's pin table of the built project, and the firmware
 * is generated from that same project, so code, wiring and documentation cannot disagree.
 */
import { getComponent } from "@/lib/catalogue";
import { LIPO_3S_2100_ID } from "@/lib/catalogue/platform";
import { CORNERS, type Drivetrain4WDParams, TYRE_GAP_MM, layout4WD } from "@/lib/robot/drivetrain4wd";
import { partBox, partDims } from "@/lib/mech/geometry";
import { allocatePins, type PinNeed } from "@/lib/code/pins";
import { type Behaviour, type ControlMethod, adjustableParameters, generateCheckTwin, generateFirmware } from "@/lib/code/generate";
import type { CompetitionId, LiveTunable, PartInstance, WireColor } from "@/lib/types";
import type { GarageDifficulty, ProjectTemplate, TemplatePart } from "./types";
import { buildFromTemplate } from "./build";

export type SpecController = "uno" | "esp32";
export type SpecDriver = "l298n" | "bts7960" | "tb6612";

export interface TemplateSpec {
  id: string;
  /** family name shown in the Garage, e.g. "Robo Race Car" */
  family: string;
  variantLabel: string;
  name: string;
  version: string;
  competition: CompetitionId;
  difficulty: GarageDifficulty;
  controller: SpecController;
  driver: SpecDriver;
  motorId: string;
  wheelId: string;
  chassis: { componentId: string; material?: string; plateT: number };
  /** 4WD geometry (chassis plate size, wheels, wheelbase, track, requested clearance) */
  params: Drivetrain4WDParams;
  battery: { id: string; config?: Record<string, number> };
  sensors: {
    /** front reflectance array for line following */
    line?: string;
    /** forward distance sensor (opponent / obstacle) */
    distance?: string;
    /** sumo edge sensors (two, front left / front right) */
    edges?: string;
  };
  wedge?: boolean;
  control: ControlMethod;
  behaviour: Behaviour;
  tunables?: Record<string, number>;
  text: {
    learningLevel: string;
    description: string;
    workingPrinciple: string;
    learningObjectives: string[];
    limitations: string[];
    sensorSummary: string;
  };
  simulation: { defaultTrackId: string; alternativeTrackIds: string[]; opponent?: "beginner" | "intermediate" | "advanced" | "beast"; difficulty: "beginner" | "intermediate" | "advanced" | "beast"; dt?: number };
  author?: string;
}

const CONTROLLER_ID: Record<SpecController, string> = { uno: "arduino-uno-r3", esp32: "esp32-devkit-v1" };
const DRIVER_ID: Record<SpecDriver, string> = { l298n: "l298n", bts7960: "bts7960", tb6612: "tb6612fng" };
const BOARD_KEY: Record<SpecController, string> = { uno: "uno", esp32: "esp32-devkit-v1" };

// ───────────────────────────── geometry & placement ─────────────────────────────

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

function fakePart(tp: TemplatePart): PartInstance {
  return {
    uid: tp.label,
    componentId: tp.componentId,
    label: tp.label,
    position: tp.position ?? { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: ((tp.yawDeg ?? 0) * Math.PI) / 180 },
    config: (tp.config ?? {}) as PartInstance["config"],
    schematic: { x: 0, y: 0 },
    attachedTo: null,
    inCircuit: true,
  } as PartInstance;
}

const boxOf = (tp: TemplatePart): Box => partBox(fakePart(tp), getComponent(tp.componentId)!);
const dimsOf = (tp: TemplatePart) => partDims(fakePart(tp), getComponent(tp.componentId)!);
const overlaps = (a: Box, b: Box, gap = 1) => Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > -gap && Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > -gap && Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > -gap;
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Puts a part on the chassis top (z = 0 is the top surface) as close as possible to its target point, without
 * touching anything already placed; if the deck is full it goes onto a second level (standoffs).
 */
function placeOnDeck(tp: TemplatePart, target: { x: number; y: number }, plate: { L: number; W: number }, placed: Box[]): TemplatePart {
  const d = dimsOf(tp);
  const yaw = ((tp.yawDeg ?? 0) * Math.PI) / 180;
  const hx = (d.x * Math.abs(Math.cos(yaw)) + d.y * Math.abs(Math.sin(yaw))) / 2;
  const hy = (d.x * Math.abs(Math.sin(yaw)) + d.y * Math.abs(Math.cos(yaw))) / 2;
  const cands: { x: number; y: number; cost: number }[] = [];
  for (let x = plate.L / 2 - hx - 2; x >= -plate.L / 2 + hx + 2; x -= 2)
    for (let y = -(plate.W / 2 - hy - 2); y <= plate.W / 2 - hy - 2 + 1e-9; y += 2) cands.push({ x, y, cost: Math.hypot(x - target.x, (y - target.y) * 1.3) });
  cands.sort((a, b) => a.cost - b.cost);
  let level = 0;
  for (let tries = 0; tries < 4; tries++) {
    for (const c of cands) {
      const t: TemplatePart = { ...tp, position: { x: r1(c.x), y: r1(c.y), z: r1(level + d.z / 2) } };
      const b = boxOf(t);
      if (!placed.some((p) => overlaps(p, b))) {
        placed.push(b);
        return t;
      }
    }
    level = Math.max(level, ...placed.filter((p) => p.maxZ > level - 0.1).map((p) => p.maxZ)) + 4;
  }
  throw new Error(`${tp.label}: no room on the chassis`);
}

// ───────────────────────────── the builder ─────────────────────────────

type W = [string, string, WireColor];

interface Built {
  parts: TemplatePart[];
  wiring: W[];
  sensorSummary: string;
}

function buildHardware(spec: TemplateSpec): Built {
  const ctrlId = CONTROLLER_ID[spec.controller];
  const drvId = DRIVER_ID[spec.driver];
  const esp = spec.controller === "esp32";
  const motor = getComponent(spec.motorId);
  const wheel = getComponent(spec.wheelId);
  const bat = getComponent(spec.battery.id);
  if (!motor || motor.kind !== "dc-motor") throw new Error(`${spec.id}: ${spec.motorId} is not a DC motor`);
  if (!wheel || wheel.kind !== "wheel") throw new Error(`${spec.id}: ${spec.wheelId} is not a wheel`);
  if (!bat?.battery) throw new Error(`${spec.id}: ${spec.battery.id} is not a battery`);
  const batMax = bat.battery.maxVoltage * (bat.battery.perCell ? Number(spec.battery.config?.series ?? 1) : 1);

  // ── drivetrain: four motors + wheels at the corners (same geometry as the designer's 4WD helper) ──
  const mDims = motor.specs.dimensions ?? partDims(fakePart({ componentId: spec.motorId, label: "m" }), motor);
  const { corners, mounting } = layout4WD(spec.params, mDims, spec.chassis.plateT);
  const parts: TemplatePart[] = [];
  for (const c of CORNERS) {
    parts.push({ componentId: spec.motorId, label: `${c.key} Motor`, role: c.role, position: corners[c.key].motor.position, yawDeg: c.sy > 0 ? 0 : 180 });
    parts.push({ componentId: spec.wheelId, label: `${c.key} Wheel`, role: c.role, position: corners[c.key].wheel.position, yawDeg: 0, attachedTo: `${c.key} Motor`, config: { diameter: spec.params.wheelDiameter_mm, width: spec.params.wheelWidth_mm } });
  }
  const L = spec.params.chassisLength_mm;
  const Wd = spec.params.chassisWidth_mm;
  const groundZ = -spec.chassis.plateT - mounting.plateBottom_mm;
  const placed: Box[] = parts.filter((p) => p.componentId === spec.motorId).map(boxOf);

  // ── sensors (placed first: their position is functional) ──
  let sensorSummary = "None (driver-controlled)";
  const front: TemplatePart[] = [];
  if (spec.sensors.line) {
    const lc = getComponent(spec.sensors.line)!;
    const h = partDims(fakePart({ componentId: spec.sensors.line, label: "s" }), lc).z;
    // on a boom in front of the plate, 4 mm above the floor, long axis across the robot (channel 1 = left)
    const x = Math.max(L / 2 + 12, Math.max(...placed.map((b) => b.maxX)) + 12);
    front.push({ componentId: spec.sensors.line, label: "LINE1", position: { x: r1(x), y: 0, z: r1(groundZ + 4 + h / 2) }, yawDeg: 90 });
    sensorSummary = `${lc.sensor?.channels ?? 1}-channel ${lc.sensor?.kind.includes("analog") ? "analog" : "digital"} reflectance array (${lc.name})`;
  }
  if (spec.wedge) front.push({ componentId: "front-wedge", label: "WEDGE", position: { x: r1(L / 2 + 5), y: 0, z: r1(groundZ + 6) } });
  if (spec.sensors.edges) {
    const ec = getComponent(spec.sensors.edges)!;
    const h = partDims(fakePart({ componentId: spec.sensors.edges, label: "e" }), ec).z;
    for (const [label, sy] of [["EDGE_L", 1], ["EDGE_R", -1]] as const) front.push({ componentId: spec.sensors.edges, label, position: { x: r1(L / 2 - 7), y: r1(sy * (Wd / 2 - 12)), z: r1(groundZ + 3 + h / 2) }, yawDeg: 90 });
  }
  for (const f of front) placed.push(boxOf(f));
  parts.push(...front);
  if (spec.sensors.distance) {
    const dc = getComponent(spec.sensors.distance)!;
    const tp: TemplatePart = { componentId: spec.sensors.distance, label: "US1", yawDeg: 0 };
    const d = dimsOf(tp);
    // on the front edge of the deck, facing forward, centred
    const t = placeOnDeck(tp, { x: L / 2 - d.x / 2 - 2, y: 0 }, { L, W: Wd }, placed);
    parts.push(t);
    const what = spec.competition === "sumo" ? "opponent" : "obstacle";
    sensorSummary = spec.sensors.line ? sensorSummary : `${dc.name} ultrasonic (${what})${spec.sensors.edges ? " + 2 front edge sensors" : ""}`;
  }

  // ── electronics on the deck ──
  const needReg = esp && batMax > 12; // ESP32 VIN accepts 4.5–12 V: a 3S pack needs a 5 V buck converter
  const deck: { tp: TemplatePart; target: { x: number; y: number } }[] = [];
  deck.push({ tp: { componentId: spec.battery.id, label: "BAT1", ...(spec.battery.config ? { config: spec.battery.config } : {}) }, target: { x: -L * 0.12, y: 0 } });
  deck.push({ tp: { componentId: ctrlId, label: "U1" }, target: { x: L * 0.12, y: 0 } });
  // above 12 V the L298N's on-board 78M05 must not be used: jumper removed, +5V fed from the 5 V rail
  if (spec.driver === "l298n") deck.push({ tp: { componentId: drvId, label: "DRV1", ...(batMax > 12.05 ? { config: { regJumper: false } } : {}) }, target: { x: -L * 0.3, y: 0 } });
  else {
    deck.push({ tp: { componentId: drvId, label: "DRV1" }, target: { x: spec.driver === "bts7960" ? -L * 0.25 : L * 0.25, y: Wd * 0.25 } });
    deck.push({ tp: { componentId: drvId, label: "DRV2" }, target: { x: -L * 0.25, y: -Wd * 0.25 } });
  }
  if (needReg) deck.push({ tp: { componentId: "lm2596-buck-converter", label: "REG1", config: { vout: 5 } }, target: { x: -L * 0.3, y: Wd * 0.3 } });
  deck.push({ tp: { componentId: "toggle-switch", label: "SW1" }, target: { x: -L * 0.45, y: Wd * 0.3 } });
  if (spec.control === "hc05") deck.push({ tp: { componentId: "hc-05-bluetooth-module", label: "BT1" }, target: { x: L * 0.3, y: -Wd * 0.3 } });
  // big parts first so they get the spots nearest their targets
  deck.sort((a, b) => dimsOf(b.tp).x * dimsOf(b.tp).y - dimsOf(a.tp).x * dimsOf(a.tp).y);
  for (const d of deck) parts.push(placeOnDeck(d.tp, d.target, { L, W: Wd }, placed));

  // ── pins ──
  const needs: PinNeed[] = [];
  if (spec.driver === "l298n") {
    needs.push({ id: "L.EN", kind: "pwm" }, { id: "R.EN", kind: "pwm" }, { id: "L.IN1", kind: "digital-out" }, { id: "L.IN2", kind: "digital-out" }, { id: "R.IN3", kind: "digital-out" }, { id: "R.IN4", kind: "digital-out" });
  } else if (spec.driver === "bts7960") {
    needs.push({ id: "L.RPWM", kind: "pwm" }, { id: "L.LPWM", kind: "pwm" }, { id: "R.RPWM", kind: "pwm" }, { id: "R.LPWM", kind: "pwm" });
  } else {
    for (const c of ["FL", "FR", "RL", "RR"]) needs.push({ id: `${c}.PWM`, kind: "pwm" });
    for (const c of ["FL", "FR", "RL", "RR"]) needs.push({ id: `${c}.IN1`, kind: "digital-out" }, { id: `${c}.IN2`, kind: "digital-out" });
    if (spec.behaviour === "sumo") needs.push({ id: "DRV1.STBY", kind: "digital-out" }, { id: "DRV2.STBY", kind: "digital-out" });
  }
  if (spec.control === "hc05") needs.push({ id: "BT.RX", kind: "uart-rx" });
  if (spec.sensors.distance) needs.push({ id: "US.TRIG", kind: "digital-out" }, { id: "US.ECHO", kind: "digital-in" });
  if (spec.sensors.edges) needs.push({ id: "EDGE_L", kind: "digital-in" }, { id: "EDGE_R", kind: "digital-in" });
  const lineComp = spec.sensors.line ? getComponent(spec.sensors.line)! : null;
  const lineOuts = lineComp ? lineComp.pins.filter((p) => p.fn === "out-analog" || p.fn === "out-digital") : [];
  for (const o of lineOuts) needs.push({ id: `LINE.${o.id}`, kind: o.fn === "out-analog" ? "analog-in" : "digital-in" });
  const alloc = allocatePins(ctrlId, needs, { wifi: spec.control === "wifi" });
  if (!alloc.ok) throw new Error(`${spec.id}: ${alloc.errors.join("; ")}`);
  const P = (id: string) => `U1.${alloc.pins[id].pin}`;

  // ── wiring ──
  const w: W[] = [];
  const logic = esp ? "U1.3V3" : "U1.5V"; // logic rail for sensors and driver logic
  const five = esp ? (needReg ? "REG1.OUT+" : null) : "U1.5V"; // 5 V rail
  const supply = "SW1.2";
  w.push(["BAT1.+", "SW1.1", "red"]);
  // controller supply
  if (esp) {
    if (needReg) w.push([supply, "REG1.IN+", "red"], ["BAT1.-", "REG1.IN-", "black"], ["REG1.OUT+", "U1.VIN", "red"]);
    else w.push([supply, "U1.VIN", "red"]);
  } else w.push([supply, "U1.VIN", "red"]);
  w.push(["BAT1.-", "U1.GND1", "black"]);
  // drivers
  if (spec.driver === "l298n") {
    if (batMax > 12.05 && !five) throw new Error(`${spec.id}: the L298N needs a 5 V logic rail above 12 V`);
    w.push([supply, "DRV1.VS", "red"], ["BAT1.-", "DRV1.GND", "black"]);
    if (batMax > 12.05) w.push([five!, "DRV1.5V", "red"]);
    w.push([P("L.EN"), "DRV1.ENA", "yellow"], [P("L.IN1"), "DRV1.IN1", "yellow"], [P("L.IN2"), "DRV1.IN2", "yellow"]);
    w.push([P("R.EN"), "DRV1.ENB", "yellow"], [P("R.IN3"), "DRV1.IN3", "yellow"], [P("R.IN4"), "DRV1.IN4", "yellow"]);
    // left pair in parallel on OUT1/OUT2, right pair (mirrored mounting, leads swapped) on OUT3/OUT4
    w.push(["DRV1.OUT1", "FL Motor.M+", "orange"], ["DRV1.OUT2", "FL Motor.M-", "orange"], ["DRV1.OUT1", "RL Motor.M+", "orange"], ["DRV1.OUT2", "RL Motor.M-", "orange"]);
    w.push(["DRV1.OUT3", "FR Motor.M-", "orange"], ["DRV1.OUT4", "FR Motor.M+", "orange"], ["DRV1.OUT3", "RR Motor.M-", "orange"], ["DRV1.OUT4", "RR Motor.M+", "orange"]);
  } else if (spec.driver === "bts7960") {
    if (!five) throw new Error(`${spec.id}: the BTS7960 needs a 5 V logic supply`);
    for (const [drv, side] of [["DRV1", "L"], ["DRV2", "R"]] as const) {
      w.push([supply, `${drv}.B+`, "red"], ["BAT1.-", `${drv}.B-`, "black"], [five, `${drv}.VCC`, "red"], [five, `${drv}.R_EN`, "red"], [five, `${drv}.L_EN`, "red"]);
      w.push([P(`${side}.RPWM`), `${drv}.RPWM`, "yellow"], [P(`${side}.LPWM`), `${drv}.LPWM`, "yellow"]);
    }
    w.push(["DRV1.M+", "FL Motor.M+", "orange"], ["DRV1.M-", "FL Motor.M-", "orange"], ["DRV1.M+", "RL Motor.M+", "orange"], ["DRV1.M-", "RL Motor.M-", "orange"]);
    w.push(["DRV2.M+", "FR Motor.M-", "orange"], ["DRV2.M-", "FR Motor.M+", "orange"], ["DRV2.M+", "RR Motor.M-", "orange"], ["DRV2.M-", "RR Motor.M+", "orange"]);
  } else {
    // DRV1 = front axle (A = FL, B = FR), DRV2 = rear axle (A = RL, B = RR); one motor per channel
    for (const drv of ["DRV1", "DRV2"]) {
      w.push([supply, `${drv}.VM`, "red"], ["BAT1.-", `${drv}.GND`, "black"], [logic, `${drv}.VCC`, "red"]);
      if (spec.behaviour === "sumo") w.push([P(`${drv}.STBY`), `${drv}.STBY`, "yellow"]);
      else w.push([logic, `${drv}.STBY`, "red"]);
    }
    const map: [string, string, string][] = [["FL", "DRV1", "A"], ["FR", "DRV1", "B"], ["RL", "DRV2", "A"], ["RR", "DRV2", "B"]];
    for (const [c, drv, ch] of map) {
      w.push([P(`${c}.PWM`), `${drv}.PWM${ch}`, "yellow"], [P(`${c}.IN1`), `${drv}.${ch}IN1`, "yellow"], [P(`${c}.IN2`), `${drv}.${ch}IN2`, "yellow"]);
      const left = c === "FL" || c === "RL";
      w.push([`${drv}.${ch}O1`, `${c} Motor.${left ? "M+" : "M-"}`, "orange"], [`${drv}.${ch}O2`, `${c} Motor.${left ? "M-" : "M+"}`, "orange"]);
    }
  }
  // Bluetooth
  if (spec.control === "hc05") {
    if (!five) throw new Error(`${spec.id}: the HC-05 needs 3.6–6 V`);
    w.push([five, "BT1.VCC", "red"], ["U1.GND2", "BT1.GND", "black"], ["BT1.TXD", P("BT.RX"), "blue"]);
  }
  // distance sensor: HC-SR04 needs 5 V (and its 5 V ECHO is only safe on a 5 V board); US-100 runs on 3.3 V
  if (spec.sensors.distance) {
    const dc = getComponent(spec.sensors.distance)!;
    const vcc = dc.pins.find((p) => p.fn === "vin")!;
    const gnd = dc.pins.find((p) => p.fn === "gnd")!;
    const rail = (vcc.vRange?.[0] ?? 5) > 3.6 ? five : logic;
    if (!rail) throw new Error(`${spec.id}: ${dc.name} needs a 5 V supply`);
    w.push([rail, `US1.${vcc.id}`, "red"], ["U1.GND2", `US1.${gnd.id}`, "black"], [P("US.TRIG"), "US1.TRIG", "yellow"], ["US1.ECHO", P("US.ECHO"), "green"]);
  }
  if (spec.sensors.edges) {
    for (const lab of ["EDGE_L", "EDGE_R"]) w.push([logic, `${lab}.VCC`, "red"], ["U1.GND2", `${lab}.GND`, "black"], [`${lab}.D0`, P(lab), "green"]);
  }
  if (lineComp) {
    const vcc = lineComp.pins.find((p) => p.fn === "vin")!;
    w.push([logic, `LINE1.${vcc.id}`, "red"], ["U1.GND2", "LINE1.GND", "black"]);
    for (const o of lineOuts) w.push([`LINE1.${o.id}`, P(`LINE.${o.id}`), "green"]);
  }
  return { parts, wiring: w, sensorSummary };
}

/** Builds a complete ProjectTemplate from a spec. Throws if the configuration cannot work (never a half template). */
export function templateFromSpec(spec: TemplateSpec): ProjectTemplate {
  const hw = buildHardware(spec);
  const motor = getComponent(spec.motorId)!;
  const mDims = motor.specs.dimensions ?? partDims(fakePart({ componentId: spec.motorId, label: "m" }), motor);
  const { mounting } = layout4WD(spec.params, mDims, spec.chassis.plateT);
  const drvName = getComponent(DRIVER_ID[spec.driver])!.name;
  const options = {
    controller: getComponent(CONTROLLER_ID[spec.controller])!.name,
    driver: spec.driver === "l298n" ? "1 × L298N" : `2 × ${drvName}`,
    motors: `4 × ${motor.name}`,
    sensors: hw.sensorSummary,
    control: spec.control === "hc05" ? `HC-05 Bluetooth (${spec.controller === "esp32" ? "Serial2" : "Serial"})` : spec.control === "wifi" ? "ESP32 Wi-Fi (web page)" : "None (autonomous)",
  };
  const simulatedCode = spec.control !== "wifi";
  const liveTunables: LiveTunable[] =
    spec.behaviour === "manual" && spec.control === "hc05"
      ? [{ key: "cruise", label: "Cruise speed (PWM)", command: "V", default: spec.tunables?.cruiseSpeed ?? 200, min: 60, max: 255, step: 5 }]
      : spec.behaviour === "line"
        ? [
            { key: "base", label: "Base speed", command: "B", default: spec.tunables?.baseSpeed ?? 120, min: 60, max: 255, step: 5 },
            { key: "kp", label: "Kp", command: "P", default: spec.tunables?.Kp ?? 0.12, min: 0, max: 0.5, step: 0.005 },
            { key: "kd", label: "Kd", command: "D", default: spec.tunables?.Kd ?? 0.8, min: 0, max: 4, step: 0.05 },
          ]
        : [];
  const t: ProjectTemplate = {
    metadata: {
      id: spec.id,
      name: spec.name,
      version: spec.version,
      competition: spec.competition,
      difficulty: spec.difficulty,
      learningLevel: spec.text.learningLevel,
      description: spec.text.description,
      workingPrinciple: spec.text.workingPrinciple,
      learningObjectives: spec.text.learningObjectives,
      limitations: spec.text.limitations,
      author: spec.author ?? "Robotics Club KKH · BEAST FEAST",
      sensorSummary: spec.text.sensorSummary || hw.sensorSummary,
      drivetrain: "4WD",
      ...(spec.behaviour === "manual" ? { controlProtocol: "F forward · B reverse · L / R pivot · Q / E forward arcs · Z / C reverse arcs · S stop · + / - boost · V<0-255> cruise speed · 1-4 single-motor test (FL/FR/RL/RR) · 0 end test · stops after 1 s without a command" } : {}),
      family: spec.family,
      variantLabel: spec.variantLabel,
      options,
    },
    chassis: { componentId: spec.chassis.componentId, length_mm: spec.params.chassisLength_mm, width_mm: spec.params.chassisWidth_mm, thickness_mm: spec.chassis.plateT, ...(spec.chassis.material ? { material: spec.chassis.material } : {}), groundClearance_mm: r1(mounting.clearance_mm) },
    parts: hw.parts,
    wiring: hw.wiring,
    pinMap: [],
    firmware: { board: BOARD_KEY[spec.controller], source: "", libraries: [], adjustable: [], behaviour: spec.behaviour, control: spec.control, runsInSimulator: simulatedCode },
    simulation: {
      controlMode: simulatedCode ? "code" : "manual",
      ...(spec.control === "hc05" ? { keyboardViaSerial: true } : {}),
      ...(spec.simulation.opponent ? { opponent: spec.simulation.opponent } : {}),
      dt: spec.simulation.dt ?? 0.001,
      difficulty: spec.simulation.difficulty,
      defaultTrackId: spec.simulation.defaultTrackId,
      alternativeTrackIds: spec.simulation.alternativeTrackIds,
      ...(liveTunables.length ? { tunables: liveTunables } : {}),
    },
  };
  // generate the firmware from the BUILT project, so it matches the real circuit graph
  const project = buildFromTemplate(t, "spec", "original");
  const gen = generateFirmware(project, { behaviour: spec.behaviour, control: spec.control, tunables: spec.tunables });
  if (!gen.ok) throw new Error(`${spec.id}: firmware cannot be generated — ${gen.missing.join("; ")}`);
  t.firmware.source = gen.code;
  t.firmware.libraries = gen.libraries;
  t.firmware.adjustable = adjustableParameters(spec.behaviour, { distance: !!spec.sensors.distance, analogLine: !!spec.sensors.line && /analog/.test(getComponent(spec.sensors.line)?.sensor?.kind ?? "") });
  if (!gen.simulated) {
    t.firmware.simulationNote = gen.simulationNote;
    t.firmware.checkSource = generateCheckTwin(project, { behaviour: spec.behaviour, control: spec.control, tunables: spec.tunables }) ?? undefined;
  } else if (gen.simulationNote) t.firmware.simulationNote = gen.simulationNote;
  // pin map = the generator's pin table of the built project (derived from the wiring, never hand-typed)
  t.pinMap = gen.pinTable.map((r) => ({ pin: r.pin, connectedTo: r.connectedTo, purpose: r.function }));
  return t;
}

/** Default 3S LiPo id used by the families. */
export const LIPO_3S = LIPO_3S_2100_ID;
export { TYRE_GAP_MM };
