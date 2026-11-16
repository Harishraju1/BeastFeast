/** Project creation and smart placement of parts on the chassis (students can move everything afterwards). */
import { getComponent } from "@/lib/catalogue";
import type { ChassisConfig, CompetitionId, ComponentRecord, PartInstance, Project, Vec3 } from "@/lib/types";
import { partBox, partDims } from "@/lib/mech/geometry";

export const uid = (prefix = "p") => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

const DEFAULT_CHASSIS: Record<CompetitionId, string> = { race: "racing-robot-chassis", line: "line-follower-chassis", sumo: "mini-sumo-robot-chassis" };

export function chassisFrom(componentId: string): ChassisConfig {
  const c = getComponent(componentId);
  const ch = c?.chassis ?? { length_mm: 200, width_mm: 140, thickness_mm: 3, material: "Acrylic", density_g_cm3: 1.18 };
  return { componentId, length_mm: ch.length_mm, width_mm: ch.width_mm, thickness_mm: ch.thickness_mm, material: ch.material, groundClearance_mm: 10, mountingHoles: [] };
}

export function newProject(competition: CompetitionId, name: string, ownerId: string): Project {
  const now = new Date().toISOString();
  return {
    id: uid("prj"), ownerId, name, competition, createdAt: now, updatedAt: now,
    chassis: chassisFrom(DEFAULT_CHASSIS[competition]), parts: [], wires: [], code: "", codeVersions: [], trackId: null,
    validation: null, codeCheck: null, simulations: [], versions: [], thumbnail: null,
  };
}

function defaultConfig(c: ComponentRecord): PartInstance["config"] {
  const cfg: PartInstance["config"] = {};
  for (const o of c.options) cfg[o.key] = o.default;
  return cfg;
}

function nextLabel(project: Project, c: ComponentRecord, pos: Vec3): string {
  if (c.kind === "dc-motor") return pos.y >= 0 ? (project.parts.some((p) => p.label.startsWith("Left Motor")) ? `Left Motor ${pos.x >= 0 ? "Front" : "Rear"}` : "Left Motor") : project.parts.some((p) => p.label.startsWith("Right Motor")) ? `Right Motor ${pos.x >= 0 ? "Front" : "Rear"}` : "Right Motor";
  if (c.kind === "wheel") {
    const base = pos.y >= 0 ? "Left Wheel" : "Right Wheel";
    let label = base;
    for (let n = 2; project.parts.some((p) => p.label === label); n++) label = `${base} ${n}`;
    return label;
  }
  const prefix: Partial<Record<ComponentRecord["kind"], string>> = { controller: "U", "motor-driver": "DRV", sensor: "S", battery: "BAT", regulator: "REG", resistor: "R", capacitor: "C", led: "LED", switch: "SW", wireless: "RF", caster: "CASTER", servo: "SERVO", diode: "D", transistor: "Q", mosfet: "Q", display: "DISP" };
  const pre = prefix[c.kind] ?? "X";
  let n = 1;
  while (project.parts.some((p) => p.label === `${pre}${n}`)) n++;
  return `${pre}${n}`;
}

/** Choose a sensible starting position for a new part. */
export function suggestPlacement(project: Project, c: ComponentRecord, cfg: PartInstance["config"]): { position: Vec3; rotation: Vec3; attachedTo?: string | null; role?: string } {
  const ch = project.chassis ?? chassisFrom("2wd-robot-chassis");
  const L = ch.length_mm,
    W = ch.width_mm,
    T = ch.thickness_mm;
  const parts = project.parts.map((p) => ({ p, c: getComponent(p.componentId)! })).filter((x) => x.c);
  const motors = parts.filter((x) => x.c.kind === "dc-motor");
  const wheels = parts.filter((x) => x.c.kind === "wheel");
  const zero = { x: 0, y: 0, z: 0 };
  const probe: PartInstance = { uid: "probe", componentId: c.id, label: "", position: zero, rotation: zero, config: cfg, schematic: { x: 0, y: 0 }, inCircuit: true };
  const dims = partDims(probe, c);

  if (c.kind === "dc-motor") {
    const leftN = motors.filter((m) => m.p.position.y > 0).length;
    const rightN = motors.filter((m) => m.p.position.y <= 0).length;
    const s = { y: leftN <= rightN ? 1 : -1 };
    const pairIndex = Math.min(leftN, rightN); // 0 = main axle, 1 = second axle (4WD), 2 = middle (6WD)
    const axleX = project.competition === "sumo" ? 0 : -L * 0.22;
    const x = [axleX, L * 0.25, project.competition === "sumo" ? -L * 0.25 : 0][Math.min(pairIndex, 2)];
    return { position: { x, y: s.y * (W / 2 - dims.y / 2 - 2), z: -T - dims.z / 2 - 1 }, rotation: { x: 0, y: 0, z: s.y > 0 ? 0 : Math.PI }, role: s.y > 0 ? "left" : "right" };
  }
  if (c.kind === "wheel") {
    const free = motors.find((m) => !wheels.some((w) => w.p.attachedTo === m.p.uid));
    const m = free ?? motors[0];
    if (m) {
      const md = partDims(m.p, m.c);
      const side = Math.sign(m.p.position.y) || 1;
      return { position: { x: m.p.position.x, y: m.p.position.y + side * (md.y / 2 + dims.y / 2 + 6), z: m.p.position.z }, rotation: { x: 0, y: 0, z: 0 }, attachedTo: free ? m.p.uid : null, role: side > 0 ? "left" : "right" };
    }
    return { position: { x: -L * 0.22, y: W / 2 + dims.y / 2 + 4, z: -T - 20 }, rotation: zero, attachedTo: null };
  }
  if (c.kind === "caster") {
    const groundZ = wheels.length ? Math.min(...wheels.map((w) => w.p.position.z - partDims(w.p, w.c).x / 2)) : -T - 32;
    const axle = motors.length ? motors.reduce((a, m) => a + m.p.position.x, 0) / motors.length : -L * 0.22;
    // put the caster on the opposite side of the axle; with a centred axle (sumo) the front carries the wedge/sensors, so support the front
    const x = axle <= L * 0.05 ? L * 0.38 : -L * 0.38;
    return { position: { x, y: 0, z: groundZ + dims.z / 2 }, rotation: zero };
  }
  if (c.kind === "sensor" && c.sensor) {
    const groundZ = wheels.length ? Math.min(...wheels.map((w) => w.p.position.z - partDims(w.p, w.c).x / 2)) : -T - 32;
    const k = c.sensor.kind;
    if (k.startsWith("reflectance")) {
      if (project.competition === "sumo") {
        const n = parts.filter((x) => x.c.sensor?.kind?.startsWith("reflectance")).length;
        const corner = [{ x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }][n % 4];
        return { position: { x: corner.x * (L / 2 - 12), y: corner.y * (W / 2 - 12), z: groundZ + 5 + dims.z / 2 }, rotation: { x: 0, y: 0, z: Math.PI / 2 }, role: "edge" };
      }
      return { position: { x: L / 2 + 15, y: 0, z: groundZ + 4 + dims.z / 2 }, rotation: { x: 0, y: 0, z: Math.PI / 2 }, role: "line" };
    }
    if (["ultrasonic", "ir-distance-analog", "tof", "ir-obstacle-digital"].includes(k)) {
      const n = parts.filter((x) => ["ultrasonic", "ir-distance-analog", "tof", "ir-obstacle-digital"].includes(x.c.sensor?.kind ?? "")).length;
      const ys = [0, W / 4, -W / 4, W / 2.5, -W / 2.5];
      return { position: { x: L / 2 - dims.x / 2, y: ys[n % ys.length], z: dims.z / 2 + 1 }, rotation: zero, role: "front" };
    }
    if (k === "bumper") return { position: { x: L / 2 - 5, y: 0, z: 6 }, rotation: zero, role: "front" };
  }
  // generic: first free spot on the top plate
  const solids = parts.filter((x) => !["wheel", "caster", "dc-motor"].includes(x.c.kind) && x.c.functionalityClass !== "C").map((x) => partBox(x.p, x.c));
  const step = 8;
  for (let gx = 0; gx <= L / 2; gx += step)
    for (const sx of [1, -1])
      for (let gy = 0; gy <= W / 2; gy += step)
        for (const sy of [1, -1]) {
          const x = sx * gx,
            y = sy * gy;
          const box = { minX: x - dims.x / 2, maxX: x + dims.x / 2, minY: y - dims.y / 2, maxY: y + dims.y / 2 };
          if (box.minX < -L / 2 || box.maxX > L / 2 || box.minY < -W / 2 || box.maxY > W / 2) continue;
          if (solids.some((b) => b.maxZ > 0 && box.minX < b.maxX - 1 && box.maxX > b.minX + 1 && box.minY < b.maxY - 1 && box.maxY > b.minY + 1)) continue;
          return { position: { x, y, z: dims.z / 2 + 0.5 }, rotation: zero };
        }
  // stack if the plate is full
  const top = Math.max(0, ...solids.map((b) => b.maxZ));
  return { position: { x: 0, y: 0, z: top + 10 + dims.z / 2 }, rotation: zero };
}

const SCHEMATIC_COL: Partial<Record<ComponentRecord["kind"], number>> = { battery: 0, switch: 0, regulator: 0, controller: 1, sensor: 2, wireless: 2, "motor-driver": 3, "dc-motor": 4, servo: 4 };

export function createPart(project: Project, componentId: string, overrides: Partial<PartInstance> = {}): PartInstance {
  const c = getComponent(componentId);
  if (!c) throw new Error(`Unknown component ${componentId}`);
  const config = { ...defaultConfig(c), ...(overrides.config ?? {}) };
  const place = suggestPlacement(project, c, config);
  const col = SCHEMATIC_COL[c.kind] ?? 2;
  const sameCol = project.parts.filter((p) => (SCHEMATIC_COL[getComponent(p.componentId)?.kind ?? "mechanical"] ?? 2) === col && p.inCircuit).length;
  const inCircuit = c.functionalityClass === "A" && c.pins.length > 0;
  const part: PartInstance = {
    uid: uid(),
    componentId,
    label: nextLabel(project, c, place.position),
    position: place.position,
    rotation: place.rotation,
    config,
    schematic: { x: 80 + col * 300, y: 60 + sameCol * 230 },
    attachedTo: place.attachedTo ?? null,
    role: place.role,
    inCircuit,
    ...overrides,
  };
  if (overrides.config) part.config = config;
  return part;
}

export function addPart(project: Project, componentId: string, overrides: Partial<PartInstance> = {}): { project: Project; part: PartInstance } {
  const c = getComponent(componentId);
  if (c?.kind === "chassis") {
    return { project: { ...project, chassis: chassisFrom(componentId), updatedAt: new Date().toISOString() }, part: null as unknown as PartInstance };
  }
  const part = createPart(project, componentId, overrides);
  return { project: { ...project, parts: [...project.parts, part], updatedAt: new Date().toISOString() }, part };
}
