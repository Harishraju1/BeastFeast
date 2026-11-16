/**
 * Simulation engine contracts.
 *
 * Coordinate system (world): metres, x right, y up (top-down view of the floor), heading in radians,
 * 0 = facing +x, counter-clockwise positive. Body frame: +x forward, +y left.
 * The 3D renderer maps world (x, y) -> three.js (x, z = -y) with y-up.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Pose {
  x: number;
  y: number;
  heading: number;
}

// ───────────────────────────── Robot ─────────────────────────────

export interface SimWheelSpec {
  id: string;
  /** body frame position of the contact patch centre (m) */
  x: number;
  y: number;
  radius: number; // m
  width: number; // m
  /** Coulomb friction coefficient tyre/floor (multiplied by surface mu). */
  mu: number;
  /** Motor driving this wheel; undefined = free-rolling wheel. */
  motorId?: string;
}

export interface SimCasterSpec {
  x: number;
  y: number;
  /** rolling resistance coefficient */
  crr: number;
}

export interface SimMotorSpec {
  id: string;
  nominalVoltage: number;
  noLoadRpm: number; // output shaft, nominal V
  stallTorqueNm: number; // output shaft, nominal V
  stallCurrentA: number;
  noLoadCurrentA: number;
  /** Reverse the motor's sense of rotation (wired backwards / mounted mirrored). */
  invert: boolean;
}

export type SimSensorSpec =
  | {
      id: string;
      kind: "reflectance";
      /** one or more sensing points (body frame, m) – an array sensor has several */
      points: Vec2[];
      /** radius of the optical footprint on the floor (m) */
      footprint: number;
    }
  | {
      id: string;
      kind: "distance";
      x: number;
      y: number;
      /** sensor facing direction relative to body +x (rad) */
      angle: number;
      fovDeg: number;
      minRange: number; // m
      maxRange: number; // m
    }
  | {
      id: string;
      kind: "bumper";
      /** segment on the body outline (body frame) that closes the switch on contact */
      a: Vec2;
      b: Vec2;
    }
  | { id: string; kind: "encoder"; wheelId: string; countsPerRev: number }
  | { id: string; kind: "imu" };

export interface SimRobotSpec {
  id: string;
  name: string;
  massKg: number;
  /** body outline rectangle (centred on the body origin) */
  length: number; // m (x)
  width: number; // m (y)
  height: number; // m (render only)
  /** centre of mass offset in body frame (m) */
  com: Vec2;
  /** yaw moment of inertia (kg·m²); compute from box if omitted */
  inertia?: number;
  wheels: SimWheelSpec[];
  casters: SimCasterSpec[];
  motors: SimMotorSpec[];
  battery: {
    nominalVoltage: number;
    maxVoltage: number;
    minVoltage: number;
    capacity_mAh: number;
    internalResistance: number; // ohm
  };
  sensors: SimSensorSpec[];
  /** front wedge: fraction (0..1) of opponent normal load transferred to our wedge on frontal contact */
  wedge?: number;
  color?: string;
}

/** Per-step reading for a sensor. */
export type SensorReading =
  | { kind: "reflectance"; /** 0 = perfectly white/reflective … 1 = fully black, per point */ darkness: number[] }
  | { kind: "distance"; /** metres to nearest target in FOV, or null if nothing within maxRange */ distance: number | null }
  | { kind: "bumper"; pressed: boolean }
  | { kind: "encoder"; count: number; rpm: number }
  | { kind: "imu"; yawRate: number; ax: number; ay: number; heading: number };

export interface RobotTelemetry {
  pose: Pose;
  speed: number; // m/s (signed, forward)
  vx: number;
  vy: number;
  yawRate: number;
  motorRpm: Record<string, number>;
  motorCurrentA: Record<string, number>;
  motorVoltage: Record<string, number>;
  batteryVoltage: number;
  batteryUsed_mAh: number;
  distance: number; // m travelled
  colliding: boolean;
  onTrack: boolean;
  /** true when the robot has fallen out of a sumo ring / off the table */
  out: boolean;
}

// ───────────────────────────── Track ─────────────────────────────

export type TrackKind = "race" | "line" | "sumo";

export type TrackPieceType =
  | "straight"
  | "curve"
  | "s-curve"
  | "sharp-turn"
  | "ramp"
  | "obstacle"
  | "checkpoint"
  | "start"
  | "finish"
  | "line-straight"
  | "line-curve"
  | "line-sharp"
  | "intersection"
  | "loop"
  | "branch"
  | "line-free";

export interface TrackPiece {
  id: string;
  type: TrackPieceType;
  /** world position of the piece origin (m) and rotation (rad) */
  x: number;
  y: number;
  rotation: number;
  params: {
    length?: number; // m
    radius?: number; // m (curves / loops)
    angle?: number; // rad (curve sweep, positive = left turn)
    width?: number; // m road width (race) or obstacle width
    depth?: number; // m obstacle depth
    lineWidth?: number; // m (line following)
    slopeDeg?: number; // ramps
    points?: Vec2[]; // free-drawn line, piece-local
    color?: string;
    shape?: "box" | "cylinder";
  };
}

export interface TrackDef {
  id: string;
  name: string;
  kind: TrackKind;
  difficulty: "beginner" | "intermediate" | "advanced" | "beast";
  ownerId: string | null; // null = built-in example
  size: { w: number; h: number }; // m, floor extents centred at origin
  surface: { color: string; mu: number; lineColor: string };
  pieces: TrackPiece[];
  start: Pose;
  laps?: number;
  /** sumo arena */
  arena?: { shape: "circle" | "rect"; radius?: number; w?: number; h?: number; border: number; timeLimitS: number };
  createdAt?: string;
  updatedAt?: string;
}

export interface Segment {
  a: Vec2;
  b: Vec2;
}

export type Obstacle =
  | { kind: "box"; cx: number; cy: number; w: number; h: number; rotation: number }
  | { kind: "circle"; cx: number; cy: number; r: number };

/** Geometry produced from a TrackDef, consumed by physics, sensors and the renderer. */
export interface CompiledTrack {
  def: TrackDef;
  /** race: drivable road centre-lines (polyline, world) with width */
  roads: { points: Vec2[]; width: number }[];
  /** line following: black lines on the floor */
  lines: { points: Vec2[]; width: number }[];
  obstacles: Obstacle[];
  /** solid walls (e.g. floor bounds) */
  walls: Segment[];
  checkpoints: { index: number; seg: Segment }[];
  startLine: Segment | null;
  finishLine: Segment | null;
  ramps: { polygon: Vec2[]; slopeDeg: number; uphill: Vec2 }[];
  arena: TrackDef["arena"] | null;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

// ───────────────────────────── World ─────────────────────────────

export interface SimEvent {
  t: number;
  robot: number;
  type: "collision" | "off-track" | "back-on-track" | "checkpoint" | "lap" | "ring-out" | "finish" | "battery-low";
  detail?: string;
  value?: number;
}

/** Commands for one robot for one physics step: motor id -> applied terminal voltage (signed). */
export type MotorCommands = Record<string, number>;
