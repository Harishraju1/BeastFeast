/**
 * Mechanical geometry shared by the 3D designer, mechanical validation and the robot model.
 * Robot frame (mm): origin = centre of the chassis TOP surface, +x forward, +y left, +z up.
 */
import { getComponent } from "@/lib/catalogue";
import type { ComponentRecord, Dimensions, PartInstance, Project } from "@/lib/types";
import { batteryPack } from "@/lib/circuit/nets";

const DEFAULT_DIMS: Partial<Record<ComponentRecord["kind"], Dimensions>> = {
  controller: { x: 68, y: 53, z: 15 },
  "motor-driver": { x: 40, y: 40, z: 20 },
  "dc-motor": { x: 65, y: 22, z: 19 },
  servo: { x: 23, y: 12, z: 29 },
  sensor: { x: 30, y: 15, z: 10 },
  battery: { x: 75, y: 40, z: 20 },
  regulator: { x: 43, y: 21, z: 14 },
  wheel: { x: 65, y: 26, z: 65 },
  caster: { x: 20, y: 20, z: 15 },
  wireless: { x: 37, y: 16, z: 6 },
  switch: { x: 20, y: 12, z: 12 },
  display: { x: 27, y: 27, z: 4 },
};
const DEFAULT_MASS: Partial<Record<ComponentRecord["kind"], number>> = {
  controller: 25, "motor-driver": 30, "dc-motor": 30, servo: 20, sensor: 5, battery: 100, regulator: 10, wheel: 20, caster: 10, wireless: 5, switch: 5, display: 8, mechanical: 5,
};

export function partDims(part: PartInstance, comp: ComponentRecord): Dimensions & { estimated: boolean } {
  if (comp.kind === "wheel") {
    const d = Number(part.config.diameter ?? comp.wheel?.diameter_mm ?? 65);
    const w = Number(part.config.width ?? comp.wheel?.width_mm ?? 26);
    return { x: d, y: w, z: d, estimated: false };
  }
  if (comp.kind === "battery" && comp.battery?.perCell && /18650|21700|26650/.test(comp.name)) {
    const n = Number(part.config.series ?? 1);
    const dia = /21700/.test(comp.name) ? 21 : /26650/.test(comp.name) ? 26 : 18;
    const len = /21700/.test(comp.name) ? 70 : 65;
    return { x: len + 12, y: dia * n + 4, z: dia + 2, estimated: false };
  }
  const d = comp.specs.dimensions;
  // distance sensors face along their local +x: the board's long side (dims.x) runs across
  if (d && ["ultrasonic", "ir-distance-analog"].includes(comp.sensor?.kind ?? "")) return { x: d.y, y: d.x, z: d.z, estimated: false };
  if (d) return { ...d, estimated: false };
  return { ...(DEFAULT_DIMS[comp.kind] ?? { x: 20, y: 20, z: 10 }), estimated: true };
}

export function partMass(part: PartInstance, comp: ComponentRecord): { g: number; estimated: boolean } {
  if (comp.kind === "battery" && comp.battery) {
    const pack = batteryPack(comp, part)!;
    if (/18650/.test(comp.name)) return { g: 46 * pack.cells, estimated: true };
    if (/21700/.test(comp.name)) return { g: 68 * pack.cells, estimated: true };
    if (/LiPo/.test(comp.name)) return { g: 30 + 25 * Math.round(pack.nominal / 3.7), estimated: true };
    if (/AA /.test(comp.name) || /AA Battery Pack/.test(comp.name)) return { g: 24 * (pack.cells > 1 ? pack.cells : /6 ×/.test(comp.name) ? 6 : 4) + 10, estimated: true };
  }
  if (comp.specs.weight_g) return { g: comp.specs.weight_g, estimated: false };
  return { g: DEFAULT_MASS[comp.kind] ?? 5, estimated: true };
}

export interface ChassisGeom {
  length: number;
  width: number;
  thickness: number;
  massG: number;
  material: string;
}

export function chassisGeom(project: Project): ChassisGeom | null {
  const ch = project.chassis;
  if (!ch) return null;
  const comp = getComponent(ch.componentId);
  const density = comp?.chassis?.density_g_cm3 ?? 1.18;
  const massG = ((ch.length_mm * ch.width_mm * ch.thickness_mm) / 1000) * density * 0.85; // 15% removed for holes/cut-outs
  return { length: ch.length_mm, width: ch.width_mm, thickness: ch.thickness_mm, massG, material: ch.material };
}

export interface MassSummary {
  totalG: number;
  com: { x: number; y: number; z: number };
  estimatedParts: string[];
}

export function massSummary(project: Project): MassSummary {
  let m = 0,
    mx = 0,
    my = 0,
    mz = 0;
  const estimatedParts: string[] = [];
  const ch = chassisGeom(project);
  if (ch) {
    m += ch.massG;
    mz += ch.massG * (-ch.thickness / 2);
  }
  for (const p of project.parts) {
    const c = getComponent(p.componentId);
    if (!c || c.functionalityClass === "C") continue;
    const pm = partMass(p, c);
    if (pm.estimated) estimatedParts.push(p.label);
    m += pm.g;
    mx += pm.g * p.position.x;
    my += pm.g * p.position.y;
    mz += pm.g * p.position.z;
  }
  return { totalG: m, com: m ? { x: mx / m, y: my / m, z: mz / m } : { x: 0, y: 0, z: 0 }, estimatedParts };
}

/** Axis-aligned footprint (after yaw rotation) in the robot frame. */
export function partBox(part: PartInstance, comp: ComponentRecord) {
  const d = partDims(part, comp);
  const yaw = part.rotation.z;
  const c = Math.abs(Math.cos(yaw)),
    s = Math.abs(Math.sin(yaw));
  const hx = (d.x * c + d.y * s) / 2,
    hy = (d.x * s + d.y * c) / 2;
  return { minX: part.position.x - hx, maxX: part.position.x + hx, minY: part.position.y - hy, maxY: part.position.y + hy, minZ: part.position.z - d.z / 2, maxZ: part.position.z + d.z / 2 };
}
