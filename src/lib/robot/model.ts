/** Convert a student's project (chassis + placed parts) into the physics engine's robot description. */
import { getComponent } from "@/lib/catalogue";
import type { ComponentRecord, PartInstance, Project } from "@/lib/types";
import type { SimRobotSpec, SimSensorSpec } from "@/lib/sim/types";
import { batteryPack } from "@/lib/circuit/nets";
import { massSummary, partDims } from "@/lib/mech/geometry";

export interface ModelNotes {
  estimated: string[];
  problems: string[];
  /** sensor part uid -> sim sensor id (same), with channel count */
  sensors: Record<string, { kind: SimSensorSpec["kind"]; channels: number }>;
  motorMirrored: Record<string, boolean>;
}

const KG_CM_TO_NM = 0.0980665;

export function motorParams(part: PartInstance, comp: ComponentRecord) {
  if (part.config.customParams) {
    return {
      nominalVoltage: Number(part.config.nominalVoltage),
      noLoadRpm: Number(part.config.noLoadRpm),
      stallTorqueNm: Number(part.config.stallTorqueKgCm) * KG_CM_TO_NM,
      stallCurrentA: Number(part.config.stallCurrentA),
      noLoadCurrentA: Number(part.config.stallCurrentA) * 0.08,
      estimated: false,
      studentEntered: true,
    };
  }
  return comp.motor ? { ...comp.motor, studentEntered: false } : null;
}

export function buildRobotSpec(project: Project, name = project.name): { spec: SimRobotSpec; notes: ModelNotes } {
  const notes: ModelNotes = { estimated: [], problems: [], sensors: {}, motorMirrored: {} };
  const ch = project.chassis;
  const L = (ch?.length_mm ?? 150) / 1000;
  const W = (ch?.width_mm ?? 120) / 1000;
  const parts = project.parts.map((p) => ({ p, c: getComponent(p.componentId)! })).filter((x) => x.c);
  const ms = massSummary(project);
  if (ms.estimatedParts.length) notes.estimated.push(`Mass estimated for: ${ms.estimatedParts.join(", ")}`);

  const motors: SimRobotSpec["motors"] = [];
  for (const { p, c } of parts.filter((x) => x.c.kind === "dc-motor")) {
    const mp = motorParams(p, c);
    if (!mp) {
      notes.problems.push(`${p.label} (${c.name}) has no simulation parameters — enable "Use my own motor parameters" in the inspector.`);
      continue;
    }
    if (mp.estimated) notes.estimated.push(`${p.label}: motor parameters are typical estimates (${c.name})`);
    const yaw = ((p.rotation.z % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const mirrored = Math.abs(yaw - Math.PI) < 0.3;
    notes.motorMirrored[p.uid] = mirrored;
    motors.push({ id: p.uid, nominalVoltage: mp.nominalVoltage, noLoadRpm: mp.noLoadRpm, stallTorqueNm: mp.stallTorqueNm, stallCurrentA: mp.stallCurrentA, noLoadCurrentA: mp.noLoadCurrentA, invert: mirrored !== Boolean(p.config.invert) });
  }

  const wheels: SimRobotSpec["wheels"] = [];
  for (const { p, c } of parts.filter((x) => x.c.kind === "wheel")) {
    const d = partDims(p, c);
    const motor = motors.find((m) => m.id === p.attachedTo);
    wheels.push({ id: p.uid, x: p.position.x / 1000, y: p.position.y / 1000, radius: d.x / 2000, width: d.y / 1000, mu: c.wheel?.mu ?? 0.8, motorId: motor?.id });
    if (c.wheel?.estimated) notes.estimated.push(`${p.label}: tyre friction estimated (μ=${c.wheel.mu})`);
  }
  const casters = parts.filter((x) => x.c.kind === "caster").map(({ p }) => ({ x: p.position.x / 1000, y: p.position.y / 1000, crr: 0.02 }));

  const sensors: SimSensorSpec[] = [];
  for (const { p, c } of parts.filter((x) => x.c.sensor)) {
    const s = c.sensor!;
    const x = p.position.x / 1000,
      y = p.position.y / 1000;
    if (s.kind.startsWith("reflectance")) {
      const n = s.channels ?? 1;
      const pitch = (s.pitch_mm ?? 10) / 1000;
      // sensor's long axis follows its yaw; channel 1 sits on the +local-x end
      const yaw = p.rotation.z;
      const points = Array.from({ length: n }, (_, i) => {
        const off = ((n - 1) / 2 - i) * pitch;
        return { x: x + Math.cos(yaw) * off, y: y + Math.sin(yaw) * off };
      });
      sensors.push({ id: p.uid, kind: "reflectance", points, footprint: 0.003 });
      notes.sensors[p.uid] = { kind: "reflectance", channels: n };
    } else if (["ultrasonic", "ir-distance-analog", "tof", "ir-obstacle-digital"].includes(s.kind)) {
      sensors.push({ id: p.uid, kind: "distance", x, y, angle: p.rotation.z, fovDeg: s.fovDeg ?? 15, minRange: (s.minRange_mm ?? 20) / 1000, maxRange: (s.maxRange_mm ?? 2000) / 1000 });
      notes.sensors[p.uid] = { kind: "distance", channels: 1 };
    } else if (s.kind === "bumper") {
      const half = Math.min(W / 3, 0.03);
      sensors.push({ id: p.uid, kind: "bumper", a: { x: Math.max(x, L / 2 - 0.002), y: y - half }, b: { x: Math.max(x, L / 2 - 0.002), y: y + half } });
      notes.sensors[p.uid] = { kind: "bumper", channels: 1 };
    } else if (s.kind === "encoder") {
      const target = parts.find((m) => m.p.uid === p.attachedTo) ?? parts.filter((m) => m.c.kind === "dc-motor").sort((a, b) => dist(a.p, p) - dist(b.p, p))[0];
      const wheel = target && parts.find((w) => w.c.kind === "wheel" && w.p.attachedTo === target.p.uid);
      if (wheel) {
        sensors.push({ id: p.uid, kind: "encoder", wheelId: wheel.p.uid, countsPerRev: Number(p.config.cpr ?? 341) });
        notes.sensors[p.uid] = { kind: "encoder", channels: 1 };
      }
    } else if (s.kind === "imu") {
      sensors.push({ id: p.uid, kind: "imu" });
      notes.sensors[p.uid] = { kind: "imu", channels: 1 };
    }
  }

  const batPart = parts.find((x) => x.c.battery);
  const pack = batPart ? batteryPack(batPart.c, batPart.p)! : null;
  if (!pack) notes.problems.push("No battery — motors receive no power.");
  const wedge = parts.some((x) => /Front Wedge|Sumo Blade/.test(x.c.name)) ? 0.35 : undefined;

  const massKg = Math.max(0.05, ms.totalG / 1000);
  const spec: SimRobotSpec = {
    id: project.id,
    name,
    massKg,
    length: L,
    width: W,
    height: 0.06,
    com: { x: ms.com.x / 1000, y: ms.com.y / 1000 },
    inertia: (massKg * (L * L + W * W)) / 12,
    wheels,
    casters,
    motors,
    battery: pack
      ? { nominalVoltage: pack.nominal, maxVoltage: pack.max, minVoltage: pack.min, capacity_mAh: pack.capacity, internalResistance: pack.rint }
      : { nominalVoltage: 0, maxVoltage: 0, minVoltage: 0, capacity_mAh: 1, internalResistance: 1 },
    sensors,
    wedge,
  };
  if (!wheels.some((w) => w.motorId)) notes.problems.push("No wheel is attached to a motor — the robot cannot move.");
  return { spec, notes };
}

const dist = (a: PartInstance, b: PartInstance) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
