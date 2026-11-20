import type { CompiledTrack, MotorCommands, Pose, SimRobotSpec, TrackDef, TrackPiece } from "@/lib/sim/types";
import { compileTrack } from "@/lib/track/compile";
import { SimWorld } from "@/lib/sim/world";

/** 12 V geared motor, 300 rpm, 0.2 N·m stall (JGA25-370-class). */
export const GEAR_MOTOR_12V = { nominalVoltage: 12, noLoadRpm: 300, stallTorqueNm: 0.2, stallCurrentA: 1.2, noLoadCurrentA: 0.1, invert: false };

/**
 * Simple 4WD skid-steer test robot: 1.2 kg, 24 × 16 cm, four Ø66 mm wheels at the corners (one motor per
 * wheel: FL, FR, RL, RR), 20 mm ground clearance, 3S LiPo.
 */
export function make4wd(o: { mu?: number; clearance?: number; massKg?: number } = {}): SimRobotSpec {
  const r = 0.033;
  const wx = 0.08;
  const wy = 0.09;
  const mu = o.mu ?? 0.9;
  return {
    id: "rover",
    name: "4WD rover",
    massKg: o.massKg ?? 1.2,
    length: 0.24,
    width: 0.16,
    height: 0.08,
    com: { x: 0, y: 0 },
    wheels: [
      { id: "fl", x: wx, y: wy, radius: r, width: 0.025, mu, motorId: "FL" },
      { id: "fr", x: wx, y: -wy, radius: r, width: 0.025, mu, motorId: "FR" },
      { id: "rl", x: -wx, y: wy, radius: r, width: 0.025, mu, motorId: "RL" },
      { id: "rr", x: -wx, y: -wy, radius: r, width: 0.025, mu, motorId: "RR" },
    ],
    casters: [],
    motors: ["FL", "FR", "RL", "RR"].map((id) => ({ id, ...GEAR_MOTOR_12V })),
    battery: { nominalVoltage: 11.1, maxVoltage: 12.6, minVoltage: 9.9, capacity_mAh: 1500, internalResistance: 0.05 },
    sensors: [{ id: "us", kind: "distance", x: 0.12, y: 0, angle: 0, fovDeg: 15, minRange: 0.02, maxRange: 2 }],
    groundClearance: o.clearance ?? 0.02,
  };
}

export const drive = (left: number, right: number): MotorCommands => ({ FL: left, RL: left, FR: right, RR: right });

/** Race floor (10 × 10 m by default) with the given terrain pieces. */
export function terrainTrack(pieces: TrackPiece[], size = 10, mu = 1): CompiledTrack {
  const def: TrackDef = {
    id: "terrain-test",
    name: "terrain test",
    kind: "race",
    difficulty: "beginner",
    ownerId: null,
    size: { w: size, h: size },
    surface: { color: "#7a5c3e", mu, lineColor: "#a08560" },
    pieces,
    start: { x: 0, y: 0, heading: 0 },
  };
  return compileTrack(def);
}

export const piece = (id: string, type: TrackPiece["type"], x: number, y: number, params: TrackPiece["params"] = {}, rotation = 0): TrackPiece => ({
  id,
  type,
  x,
  y,
  rotation,
  params,
});

export interface Sample {
  t: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  z: number;
  pitch: number;
  roll: number;
  slip: number;
  surface: string;
}

/** Run one robot with constant commands, sampling telemetry every `every` seconds. */
export function run(track: CompiledTrack, pose: Pose, seconds: number, cmds: MotorCommands, every = 0.01, spec = make4wd()): { world: SimWorld; samples: Sample[] } {
  const world = new SimWorld(track, [{ spec, pose }]);
  const samples: Sample[] = [];
  const steps = Math.round(seconds / world.dt);
  const k = Math.max(1, Math.round(every / world.dt));
  for (let i = 1; i <= steps; i++) {
    world.step([cmds]);
    if (i % k === 0) {
      const t = world.telemetry(0);
      const slips = Object.values(t.wheelSlip ?? {});
      samples.push({
        t: world.time,
        x: t.pose.x,
        y: t.pose.y,
        heading: t.pose.heading,
        speed: t.speed,
        z: t.z ?? 0,
        pitch: t.pitch ?? 0,
        roll: t.roll ?? 0,
        slip: slips.reduce((a, b) => a + Math.abs(b), 0) / Math.max(1, slips.length),
        surface: t.surface ?? "ground",
      });
    }
  }
  return { world, samples };
}
