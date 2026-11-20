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
  /**
   * Gap between the floor and the underside of the chassis (m) when standing on flat ground.
   * Used by the terrain model: obstacles taller than this (or than a wheel can climb) are solid.
   * Defaults to 0.01 when omitted.
   */
  groundClearance?: number;
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
  /** wheel speed (rpm, signed, + = rolling forward), keyed by wheel id */
  wheelRpm?: Record<string, number>;
  /**
   * Longitudinal slip per wheel: (ω·r − v)/max(|ω·r|, |v|, 0.05) in −1…1. 0 = full grip, ±1 = spinning
   * in place / locked and sliding. Keyed by wheel id.
   */
  wheelSlip?: Record<string, number>;
  /** what is under the robot's centre (terrain model); "ground" on a flat floor */
  surface?: TerrainSurfaceKind;
  /** body attitude from the terrain under the wheels (rad): pitch + = nose up, roll + = left side up */
  pitch?: number;
  roll?: number;
  /** height of the chassis reference above the flat floor (m) */
  z?: number;
}

// ───────────────────────────── Track ─────────────────────────────

export type TrackKind = "race" | "line" | "sumo";

export type TrackPieceType =
  // ── off-road terrain (race tracks; real height + collision, see TerrainModel) ──
  | "rock" // one irregular rock
  | "rock-field" // scattered rocks inside an area
  | "mud" // low-grip, high-drag patch (flat)
  | "bumps" // uneven ground: smooth bumps and dips inside an area
  | "zigzag" // raised zigzag pathway that rises and falls along its length
  | "hill" // up-slope, flat top, down-slope
  | "block" // small rectangular hurdle / block / step
  | "hurdles" // a row of low hurdles across the path
  | "platform" // raised flat platform with sloped or stepped edges
  // ── classic pieces ──
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
    // ── off-road terrain parameters (all metres / degrees) ──
    /** peak height (rock, block, platform, hill, zigzag max height) */
    height?: number;
    /** deterministic shape seed for rocks / bumps (same seed = same terrain) */
    seed?: number;
    /** rock-field: number of rocks; hurdles: number of hurdles */
    count?: number;
    /** hurdles: gap between hurdles (m) */
    spacing?: number;
    /** bumps: amplitude (m) of the bumps; negative parts make dips */
    amplitude?: number;
    /** mud: friction multiplier on tyre grip (0.2–0.9) */
    grip?: number;
    /** mud: extra rolling resistance coefficient (sinkage drag) */
    drag?: number;
    /** zigzag: number of straight legs; hill/platform: width of the sloped edge (m) */
    segments?: number;
    edge?: number;
    /** zigzag: lowest height along the path (m) */
    minHeight?: number;
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

// ───────────────────────────── Terrain ─────────────────────────────

export type TerrainSurfaceKind = "ground" | "mud" | "rock" | "bumps" | "slope" | "zigzag" | "block" | "platform";

/** One compiled terrain feature (built from an off-road TrackPiece). */
export interface TerrainFeature {
  pieceId: string;
  kind: "rock" | "mud" | "bumps" | "zigzag" | "hill" | "block" | "platform";
  /** world-space bounding box of the footprint (m) */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** highest point of the feature above the floor (m) */
  maxHeight: number;
  /**
   * Collision outline used when the feature is too tall for a robot to drive over
   * (rocks, blocks, hurdles, platform faces). Undefined = always drivable (mud, gentle slopes, bumps).
   */
  solid?: Obstacle;
  /** mud: grip multiplier and extra rolling resistance */
  surface?: { mu: number; crr: number };
}

/**
 * Terrain of a compiled track. The SAME functions drive the physics and the 3D renderer, so what the
 * student sees is what the robot drives on.
 */
export interface TerrainModel {
  /** false for flat tracks (fast path: physics behaves exactly as before) */
  active: boolean;
  features: TerrainFeature[];
  /** ground height (m) at a world point; 0 = flat floor; negative inside dips */
  height(x: number, y: number): number;
  /** height of a single feature at a world point (renderer builds one mesh per feature from this) */
  featureHeight(index: number, x: number, y: number): number;
  /** surface under a world point: grip multiplier, extra rolling resistance, label for telemetry */
  surface(x: number, y: number): { kind: TerrainSurfaceKind; mu: number; crr: number };
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
  /** off-road terrain (height map, mud, solid rocks) — inactive on flat tracks */
  terrain: TerrainModel;
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
