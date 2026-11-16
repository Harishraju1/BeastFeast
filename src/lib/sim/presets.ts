/**
 * Ready-made robot specs (useful for tests, demos and as opponents).
 */
import type { SimMotorSpec, SimRobotSpec, SimSensorSpec } from "./types";

export interface DiffDriveOptions {
  id?: string;
  name?: string;
  massKg?: number;
  length?: number;
  width?: number;
  height?: number;
  /** COM x offset (body frame). Default −5 mm (slightly behind the axle, towards the caster). */
  comX?: number;
  /** wheel axle x position */
  axleX?: number;
  /** wheel track (centre-to-centre) */
  track?: number;
  wheelRadius?: number;
  wheelWidth?: number;
  wheelMu?: number;
  /** caster positions (body x); default one rear caster */
  casters?: number[];
  casterCrr?: number;
  motor?: Partial<Omit<SimMotorSpec, "id">>;
  battery?: Partial<SimRobotSpec["battery"]>;
  sensors?: SimSensorSpec[];
  wedge?: number;
  color?: string;
  /** add one encoder per wheel ("encL"/"encR") and an IMU ("imu") */
  withOdometry?: boolean;
}

/** TT-style 6 V 200 rpm gearmotor, 0.08 N·m stall. */
export const TT_MOTOR: Omit<SimMotorSpec, "id"> = {
  nominalVoltage: 6,
  noLoadRpm: 200,
  stallTorqueNm: 0.08,
  stallCurrentA: 1.5,
  noLoadCurrentA: 0.12,
  invert: false,
};

/** 2S LiPo, 500 mAh. */
export const LIPO_2S = { nominalVoltage: 7.4, maxVoltage: 8.4, minVoltage: 6.4, capacity_mAh: 500, internalResistance: 0.15 };

/**
 * Two-wheel differential drive robot with caster(s). Motors "L" and "R", wheels "wl" and "wr".
 * Defaults: 0.6 kg, 15 × 12 cm body, Ø65 mm wheels, track 14 cm, rear caster.
 */
export function makeDiffDriveRobot(o: DiffDriveOptions = {}): SimRobotSpec {
  const length = o.length ?? 0.15;
  const width = o.width ?? 0.12;
  const track = o.track ?? 0.14;
  const r = o.wheelRadius ?? 0.0325;
  const axleX = o.axleX ?? 0;
  const motor = { ...TT_MOTOR, ...(o.motor ?? {}) };
  const sensors: SimSensorSpec[] = [...(o.sensors ?? [])];
  if (o.withOdometry) {
    sensors.push({ id: "encL", kind: "encoder", wheelId: "wl", countsPerRev: 360 });
    sensors.push({ id: "encR", kind: "encoder", wheelId: "wr", countsPerRev: 360 });
    sensors.push({ id: "imu", kind: "imu" });
  }
  return {
    id: o.id ?? "robot",
    name: o.name ?? "Diff-drive robot",
    massKg: o.massKg ?? 0.6,
    length,
    width,
    height: o.height ?? 0.07,
    com: { x: o.comX ?? -0.005, y: 0 },
    wheels: [
      { id: "wl", x: axleX, y: track / 2, radius: r, width: o.wheelWidth ?? 0.026, mu: o.wheelMu ?? 1.1, motorId: "L" },
      { id: "wr", x: axleX, y: -track / 2, radius: r, width: o.wheelWidth ?? 0.026, mu: o.wheelMu ?? 1.1, motorId: "R" },
    ],
    casters: (o.casters ?? [-0.06]).map((x) => ({ x, y: 0, crr: o.casterCrr ?? 0.02 })),
    motors: [
      { id: "L", ...motor },
      { id: "R", ...motor },
    ],
    battery: { ...LIPO_2S, ...(o.battery ?? {}) },
    sensors,
    wedge: o.wedge,
    color: o.color,
  };
}

/** Reflectance array helper: n points across y at body x, spacing s. */
export function reflectanceArray(id: string, x: number, n: number, spacing: number, footprint = 0.004): SimSensorSpec {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push({ x, y: ((n - 1) / 2 - i) * spacing });
  return { id, kind: "reflectance", points: pts, footprint };
}
