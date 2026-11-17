/**
 * BEAST FEAST 5.0 — core domain contracts.
 *
 * Every module (catalogue, robot designer, circuit studio, code studio,
 * simulation, learning, persistence) builds on these types. Keep them stable.
 */

// ───────────────────────────── Competitions ─────────────────────────────

export type CompetitionId = "race" | "line" | "sumo";

export const COMPETITIONS: Record<CompetitionId, { name: string; short: string }> = {
  race: { name: "Robo Race", short: "RACE" },
  line: { name: "Line Following", short: "LINE" },
  sumo: { name: "Robo War / Sumo", short: "SUMO" },
};

/** Value taken from section 17 of the master list. */
export type CompetitionNeed = "required" | "optional" | "rule-dependent" | "not-listed";

// ───────────────────────────── Catalogue ─────────────────────────────

/** A = electronically simulatable, B = mechanically simulatable, C = workshop/fabrication equipment. */
export type FunctionalityClass = "A" | "B" | "C";

/** green = fully simulated, blue = design & connection supported, yellow = visual/mechanical only, grey = under development / unverified. */
export type SimStatus = "green" | "blue" | "yellow" | "grey";

/**
 * datasheet-referenced: values entered from the referenced datasheet/product page, awaiting admin sign-off.
 * admin-verified: an administrator has checked the values.
 * unverified: no trustworthy data entered yet.
 */
export type VerificationStatus = "admin-verified" | "datasheet-referenced" | "generic-convention" | "unverified";

/** Where an entry came from in the master list. */
export interface SourceRef {
  sectionNumber: number; // 1..16
  sectionTitle: string;
  subcategory: string | null; // bold sub-heading, if any
  itemNumber: number; // the number printed in the source list
  sourceName: string; // exact text from the source list
  line: number; // 1-based line in the source file
}

export type PinFunction =
  | "vin" // supply input to this component
  | "vout" // supply output from this component (regulator output, controller 5V/3V3 pin, BEC)
  | "gnd"
  | "bat+"
  | "bat-"
  | "gpio" // controller I/O pin
  | "in-digital"
  | "in-pwm"
  | "in-analog"
  | "out-digital"
  | "out-analog"
  | "out-pwm"
  | "motor-out" // driver output to a motor terminal
  | "motor-term" // motor terminal
  | "i2c-sda"
  | "i2c-scl"
  | "spi-mosi"
  | "spi-miso"
  | "spi-sck"
  | "spi-cs"
  | "uart-tx"
  | "uart-rx"
  | "switch" // switch contact
  | "passive" // resistor/capacitor/etc terminal
  | "anode"
  | "cathode"
  | "reset"
  | "nc";

export type GpioCapability =
  | "digital"
  | "analog" // ADC input
  | "analog-only" // ADC input that cannot be used as digital I/O (e.g. Nano A6/A7, ESP32 GPIO34-39 are input-only)
  | "input-only"
  | "pwm"
  | "interrupt"
  | "i2c-sda"
  | "i2c-scl"
  | "spi-mosi"
  | "spi-miso"
  | "spi-sck"
  | "spi-ss"
  | "uart-tx"
  | "uart-rx"
  | "dac"
  | "boot-strap"; // strapping pin – usable but with caveats

export type PinSide = "L" | "R" | "T" | "B";

export interface PinDef {
  id: string; // unique within the component, e.g. "D5", "ENA", "VCC"
  label: string; // printed label
  fn: PinFunction;
  side: PinSide;
  /** Controller I/O capabilities (fn === "gpio"). */
  caps?: GpioCapability[];
  /** Number used in Arduino code (e.g. 5 for D5, 14 for A0 on Uno, GPIO number on ESP32). */
  arduinoPin?: number;
  /** Alternative names usable in code (e.g. "A0"). */
  codeNames?: string[];
  /** For vin pins: acceptable supply range in volts. */
  vRange?: [number, number];
  /** For vout / bat+ pins: nominal output voltage. */
  vOut?: number;
  /** Max current this pin can source/sink in mA. */
  iMax_mA?: number;
  /** Logic level for signal pins. */
  logicV?: number;
  /** Signal inputs that tolerate 5V even on 3.3V parts. */
  tolerant5V?: boolean;
  /** Free-text note shown in the inspector. */
  note?: string;
}

/** Pins that are electrically the same node inside the part (e.g. the multiple GND pins of an Uno). */
export type InternalBridge = string[];

export interface ComponentOption {
  key: string;
  label: string;
  type: "number" | "boolean" | "select";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  choices?: { value: string; label: string }[];
  help?: string;
}

export interface Dimensions {
  /** millimetres; x = length (forward), y = width, z = height */
  x: number;
  y: number;
  z: number;
}

/** Electrical / physical spec block. Undefined field = not known (shown as "unverified"). */
export interface ComponentSpecs {
  voltage?: string; // human readable, e.g. "7–12 V (VIN)"
  logicVoltage?: number;
  current?: string;
  power?: string;
  protocols?: string[];
  dimensions?: Dimensions;
  weight_g?: number;
  extra?: Record<string, string>;
}

/** Parameters the physics engine uses. `estimated` must be shown to students. */
export interface MotorSimParams {
  nominalVoltage: number;
  noLoadRpm: number; // output shaft at nominal voltage
  stallTorqueNm: number; // output shaft at nominal voltage
  stallCurrentA: number;
  noLoadCurrentA: number;
  estimated: boolean;
  source?: string;
}

export interface DriverSimParams {
  channels: number;
  /** Voltage lost across the driver at typical load (L298N bipolar ~2 V, MOSFET drivers ~0.2 V). */
  dropV: number;
  contCurrentA: number;
  peakCurrentA: number;
  /** How the control inputs map to a channel. */
  scheme: "in-in-en" | "in-in-pwm-standby" | "in-in" | "pwm-dir" | "rpwm-lpwm";
  estimated: boolean;
}

export interface BatterySimParams {
  nominalVoltage: number;
  maxVoltage: number;
  minVoltage: number;
  capacity_mAh: number;
  internalResistance_ohm: number;
  maxContinuousA: number;
  /** Cell-based entries let the student choose how many cells are in series. */
  perCell?: boolean;
  estimated: boolean;
}

export interface SensorSimParams {
  kind:
    | "reflectance-digital"
    | "reflectance-analog"
    | "reflectance-array-digital"
    | "reflectance-array-analog"
    | "reflectance-array-rc"
    | "ultrasonic"
    | "ir-distance-analog"
    | "ir-obstacle-digital"
    | "tof"
    | "bumper"
    | "encoder"
    | "imu";
  channels?: number;
  /** spacing between array channels in mm */
  pitch_mm?: number;
  minRange_mm?: number;
  maxRange_mm?: number;
  fovDeg?: number;
  /** For digital reflectance modules: output level when the sensor sees a black line. */
  blackLevel?: 0 | 1;
  /** For digital obstacle sensors: output level when something is detected. */
  activeLevel?: 0 | 1;
  estimated: boolean;
}

export interface ComponentRecord {
  id: string; // stable unique id, e.g. "mcu-arduino-uno-r3"
  name: string; // exact name from the master list
  category: string; // section title
  categoryNumber: number;
  subcategory: string | null;
  manufacturer: string | null;
  model: string | null;
  description: string;
  functionalityClass: FunctionalityClass;
  /** Detailed kind used by editors, e.g. "controller", "motor-driver", "dc-motor", "wheel", "chassis", "tool". */
  kind: ComponentKind;
  simStatus: SimStatus;
  verification: VerificationStatus;
  sources: SourceRef[];
  /** Other records whose name appears in more than one section of the master list. */
  crossListedWith: string[];
  image: string | null; // URL of a verified image; null = labelled placeholder
  model3d: string | null; // URL of an accurate 3D model; null = procedural representation
  footprint2d: string | null;
  pins: PinDef[];
  bridges: InternalBridge[];
  pinoutStatus: "datasheet-referenced" | "generic-convention" | "not-available";
  options: ComponentOption[];
  specs: ComponentSpecs;
  mountingPoints: { id: string; x: number; y: number; z: number; type: string }[];
  compatibleWith: string[]; // ids
  compatibleControllers: string[];
  compatibleDrivers: string[];
  competitions: Record<CompetitionId, CompetitionNeed>;
  datasheetUrl: string | null;
  motor?: MotorSimParams;
  driver?: DriverSimParams;
  battery?: BatterySimParams;
  sensor?: SensorSimParams;
  wheel?: { diameter_mm: number; width_mm: number; mu: number; estimated: boolean };
  chassis?: { length_mm: number; width_mm: number; thickness_mm: number; density_g_cm3: number; material: string; wheelCount?: number };
  /** Board profile key for controllers (pin numbering / code constants). */
  board?: string;
  tags: string[];
}

export type ComponentKind =
  | "controller"
  | "motor-driver"
  | "stepper-driver"
  | "esc"
  | "dc-motor"
  | "servo"
  | "stepper-motor"
  | "sensor"
  | "battery"
  | "battery-accessory"
  | "regulator"
  | "wheel"
  | "caster"
  | "chassis"
  | "mechanical"
  | "wireless"
  | "rc-input"
  | "resistor"
  | "capacitor"
  | "diode"
  | "led"
  | "transistor"
  | "mosfet"
  | "switch"
  | "display"
  | "connector"
  | "pcb"
  | "fastener"
  | "material"
  | "tool";

// ───────────────────────────── Projects ─────────────────────────────

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A placed component in a project (shared by the 3D designer and circuit studio). */
export interface PartInstance {
  uid: string; // unique inside project, e.g. "p_ab12"
  componentId: string;
  label: string; // e.g. "Left Motor", "U1"
  /** 3D placement in millimetres, chassis-relative. x forward, y left, z up. */
  position: Vec3;
  rotation: Vec3; // radians
  scale?: Vec3;
  /** Instance configuration (option key -> value). */
  config: Record<string, number | boolean | string>;
  /** Where this part sits on the circuit canvas (px). */
  schematic: { x: number; y: number; rot?: 0 | 90 | 180 | 270 };
  /** For wheels: uid of the motor whose shaft it is mounted on. */
  attachedTo?: string | null;
  /** Mounting role, e.g. "left", "right", "front-left". */
  role?: string;
  inCircuit: boolean;
}

export type WireColor = "red" | "black" | "yellow" | "blue" | "green" | "orange" | "white" | "purple";

export interface Wire {
  id: string;
  from: { part: string; pin: string };
  to: { part: string; pin: string };
  color: WireColor;
  label?: string;
  /** Optional manual routing waypoints on the schematic canvas. */
  waypoints?: { x: number; y: number }[];
}

export interface ChassisConfig {
  componentId: string; // a chassis record
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  material: string;
  groundClearance_mm: number;
  mountingHoles: { x: number; y: number }[];
}

export interface ValidationIssue {
  id: string;
  severity: "critical" | "warning" | "suggestion";
  area: "electrical" | "mechanical" | "power" | "compatibility" | "code";
  code: string; // rule id, e.g. "E_NO_COMMON_GROUND"
  title: string; // shouting headline, e.g. "YOUR MOTOR DRIVER HAS NO COMMON GROUND!"
  partUid?: string;
  pinId?: string;
  wireId?: string;
  incorrect?: string;
  explanation: string;
  fix: string;
}

export interface ValidationReport {
  at: string; // ISO time
  issues: ValidationIssue[];
  scores: { electrical: number; mechanical: number; power: number; compatibility: number; overall: number };
  passed: boolean; // no critical issues
  checksRun: number;
  /** fingerprint of chassis+parts+wires at validation time (stale if the design changes) */
  fingerprint?: string;
}

export interface CodeVersion {
  id: string;
  at: string;
  source: string;
  note?: string;
}

export interface SimulationResult {
  id: string;
  at: string;
  mode: CompetitionId | "free";
  trackId: string | null;
  lapTimeS?: number;
  bestLapS?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  distanceM?: number;
  collisions?: number;
  completion?: number; // 0..1
  outcome?: "win" | "loss" | "draw" | "completed" | "aborted";
  controlMode: "code" | "manual";
  ghost?: { t: number; x: number; y: number; h: number }[];
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  competition: CompetitionId;
  createdAt: string;
  updatedAt: string;
  chassis: ChassisConfig | null;
  parts: PartInstance[];
  wires: Wire[];
  code: string;
  codeVersions: CodeVersion[];
  trackId: string | null;
  validation: ValidationReport | null;
  codeCheck: { at: string; ok: boolean; issues: ValidationIssue[]; fingerprint?: string } | null;
  simulations: SimulationResult[];
  versions: { id: string; at: string; note: string; snapshot: string }[];
  thumbnail?: string | null;
  /** Set when the project was loaded from the BEAST Project Garage. */
  origin?: ProjectOrigin;
  /** Simulation defaults (control mode, opponent, live-tunable parameters …). */
  simConfig?: ProjectSimConfig;
}

export interface ProjectOrigin {
  templateId: string;
  templateVersion: string;
  /** "original" = read-only reference instance, "copy" = student-owned fork */
  mode: "original" | "copy";
  loadedAt: string;
}

/** A parameter the running firmware accepts over Serial (e.g. "P0.08\n" sets Kp). */
export interface LiveTunable {
  key: string; // e.g. "kp"
  label: string; // "Kp"
  command: string; // serial prefix, e.g. "P"
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface ProjectSimConfig {
  controlMode: "code" | "manual";
  /** keyboard drives the robot through its own firmware via the Bluetooth serial link */
  keyboardViaSerial?: boolean;
  opponent?: "beginner" | "intermediate" | "advanced" | "beast";
  /** physics timestep in seconds (the engine default is 0.001) */
  dt?: number;
  difficulty?: "beginner" | "intermediate" | "advanced" | "beast";
  tunables?: LiveTunable[];
  /** firmware prints lines like "PID,err,prev,int,der,out,l,r" that the arena turns into a live panel */
  telemetryPrefix?: string;
  telemetryFields?: string[];
}

// ───────────────────────────── People ─────────────────────────────

export type Role = "student" | "admin" | "super_admin";

export interface Profile {
  id: string;
  name: string;
  campus: string;
  studentId: string;
  avatar: string | null;
  role: Role;
  xp: number;
  createdAt: string;
}
