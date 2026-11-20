/**
 * 4WD (four-wheel drive, skid-steer) drivetrain helper.
 *
 * Places four DC gearmotors and four wheels symmetrically at the corners of the chassis — Front Left (FL),
 * Front Right (FR), Rear Left (RL), Rear Right (RR) — each wheel mounted (`attachedTo`) on its own motor.
 * Left motors use yaw 0 and right motors yaw π (mirrored), the same convention as the rest of the designer:
 * `buildRobotSpec` inverts mirrored motors, and the right motors' leads are swapped in the wiring, so the
 * same "forward" command turns all four wheels forward.
 *
 * Geometry (robot frame, mm): origin = centre of the chassis TOP surface, +x forward, +y left, +z up.
 * Changing a parameter repositions the existing eight parts: their uid, wires and config are kept.
 */
import { getComponent } from "@/lib/catalogue";
import type { ComponentRecord, PartInstance, Project, Vec3 } from "@/lib/types";
import { partDims } from "@/lib/mech/geometry";
import { DRIVER_WIRING } from "./drivers";
import { chassisFrom, createPart } from "./assembly";

export type Corner = "FL" | "FR" | "RL" | "RR";

export interface CornerInfo {
  key: Corner;
  name: string; // "Front Left"
  role: string; // PartInstance.role
  /** +1 front / −1 rear */
  sx: 1 | -1;
  /** +1 left / −1 right */
  sy: 1 | -1;
}

export const CORNERS: CornerInfo[] = [
  { key: "FL", name: "Front Left", role: "front-left", sx: 1, sy: 1 },
  { key: "FR", name: "Front Right", role: "front-right", sx: 1, sy: -1 },
  { key: "RL", name: "Rear Left", role: "rear-left", sx: -1, sy: 1 },
  { key: "RR", name: "Rear Right", role: "rear-right", sx: -1, sy: -1 },
];

export interface Drivetrain4WDParams {
  /** wheel outer diameter (mm) */
  wheelDiameter_mm: number;
  /** tyre width (mm) */
  wheelWidth_mm: number;
  /** front axle to rear axle (mm) */
  wheelbase_mm: number;
  /** left wheel centre to right wheel centre (mm) */
  trackWidth_mm: number;
  chassisLength_mm: number;
  chassisWidth_mm: number;
  /**
   * Requested ground clearance (mm) = gap between the floor and the LOWEST point of the chassis plate or
   * motor housings. The real value depends on the wheel and motor size; see `mountingFor`.
   */
  groundClearance_mm: number;
}

export interface Drivetrain4WDOptions {
  motorId?: string;
  wheelId?: string;
  chassisId?: string;
  params?: Partial<Drivetrain4WDParams>;
}

export const DEFAULT_4WD_MOTOR = "25ga370-gear-motor";
export const DEFAULT_4WD_WHEEL = "rubber-robot-wheels";
export const DEFAULT_4WD_CHASSIS = "4wd-robot-chassis";

/** Gap between a motor's shaft face and the wheel (shaft coupler / hub), mm — same as the designer's wheel snap. */
export const HUB_GAP_MM = 6;
/** Minimum gap between the tyre and the chassis edge, mm. */
export const TYRE_GAP_MM = 4;

/** Defaults for the standard Robo Race 4WD: 220 × 150 mm 4WD chassis, Ø65 × 26 mm wheels, 25GA370 motors. */
export const DEFAULT_4WD_PARAMS: Drivetrain4WDParams = {
  wheelDiameter_mm: 65,
  wheelWidth_mm: 26,
  wheelbase_mm: 150,
  trackWidth_mm: 150 + 26 + 2 * TYRE_GAP_MM, // 184: tyres clear the 150 mm plate by 4 mm
  chassisLength_mm: 220,
  chassisWidth_mm: 150,
  groundClearance_mm: 20, // motors hang under the plate: lowest point = motor housing, 32.5 − 12.5 = 20 mm
};

/** Project defaults by competition (all competitions start as 4WD; line following uses LINE_4WD_SETUP in assembly.ts). */
export const DEFAULT_4WD_SETUP: Record<"race" | "sumo", Required<Omit<Drivetrain4WDOptions, "params">> & { params: Drivetrain4WDParams }> = {
  race: { motorId: DEFAULT_4WD_MOTOR, wheelId: DEFAULT_4WD_WHEEL, chassisId: DEFAULT_4WD_CHASSIS, params: DEFAULT_4WD_PARAMS },
  // Mini-sumo: the 10 × 10 cm / 500 g class used by the arena. Four N20 micro gearmotors fit at the corners;
  // the plate sits low (motors on top of it) for a low centre of gravity.
  sumo: {
    motorId: "n20-micro-metal-gear-motor",
    wheelId: "sumo-robot-wheels",
    chassisId: "mini-sumo-robot-chassis",
    params: { wheelDiameter_mm: 40, wheelWidth_mm: 20, wheelbase_mm: 60, trackWidth_mm: 100 + 20 + 2 * TYRE_GAP_MM, chassisLength_mm: 100, chassisWidth_mm: 100, groundClearance_mm: 8 },
  },
};

export type MountingStyle = "top" | "under";

export interface Mounting {
  style: MountingStyle;
  /** height of the plate underside above the floor (mm) */
  plateBottom_mm: number;
  /** real ground clearance: lowest point of plate or motor housings (mm) */
  clearance_mm: number;
  /** motor housing bottom above the floor (mm) */
  motorBottom_mm: number;
  /** largest clearance possible with these wheels and motors (motors hanging under the plate) */
  maxClearance_mm: number;
  note: string;
}

/**
 * Where the plate sits for a requested clearance. The wheel axle is always one radius above the floor and the
 * motor shaft is on the axle, so the motor housing bottom is at r − h/2. Two mountings are possible:
 *  - "top": motors on top of the plate (low plate, low centre of gravity): needs plate top ≤ motor bottom;
 *  - "under": motors hang under the plate on brackets; the motor housings are the lowest point.
 */
export function mountingFor(requested_mm: number, wheelDiameter_mm: number, motorHeight_mm: number, plateThickness_mm: number): Mounting {
  const r = wheelDiameter_mm / 2;
  const motorBottom = r - motorHeight_mm / 2;
  const topMax = motorBottom - plateThickness_mm - 1; // 1 mm bracket gap between plate top and motor
  const req = Math.max(1, requested_mm);
  if (req <= topMax) {
    return { style: "top", plateBottom_mm: req, clearance_mm: req, motorBottom_mm: motorBottom, maxClearance_mm: motorBottom, note: `Motors sit on top of the plate on brackets; the plate underside is the lowest point (${round1(req)} mm).` };
  }
  const plateBottom = r + motorHeight_mm / 2 + 1;
  const note =
    req > motorBottom + 0.5
      ? `Limited to ${round1(motorBottom)} mm: the motor housings hang ${round1(motorBottom)} mm above the floor with Ø${round1(wheelDiameter_mm)} mm wheels. Use larger wheels for more clearance.`
      : `Motors hang under the plate on brackets; the motor housings are the lowest point (${round1(motorBottom)} mm).`;
  return { style: "under", plateBottom_mm: plateBottom, clearance_mm: motorBottom, motorBottom_mm: motorBottom, maxClearance_mm: motorBottom, note };
}

export interface CornerLayout {
  motor: { position: Vec3; yaw: number };
  wheel: { position: Vec3 };
}

/** Pure geometry: positions of the four motors and wheels for the given parameters. */
export function layout4WD(params: Drivetrain4WDParams, motorDims: { x: number; y: number; z: number }, plateThickness_mm: number): { corners: Record<Corner, CornerLayout>; mounting: Mounting } {
  const m = mountingFor(params.groundClearance_mm, params.wheelDiameter_mm, motorDims.z, plateThickness_mm);
  const groundZ = -plateThickness_mm - m.plateBottom_mm;
  const axleZ = groundZ + params.wheelDiameter_mm / 2;
  const corners = {} as Record<Corner, CornerLayout>;
  for (const c of CORNERS) {
    const wy = (c.sy * params.trackWidth_mm) / 2;
    const x = (c.sx * params.wheelbase_mm) / 2;
    const my = wy - c.sy * (motorDims.y / 2 + params.wheelWidth_mm / 2 + HUB_GAP_MM);
    corners[c.key] = {
      motor: { position: { x: round1(x), y: round1(my), z: round1(axleZ) }, yaw: c.sy > 0 ? 0 : Math.PI },
      wheel: { position: { x: round1(x), y: round1(wy), z: round1(axleZ) } },
    };
  }
  return { corners, mounting: m };
}

export interface Drivetrain4WD {
  motors: Record<Corner, PartInstance>;
  wheels: Record<Corner, PartInstance>;
  casters: PartInstance[];
}

/** Finds a 4WD drivetrain: exactly four motors that each carry a wheel, two on each side. */
export function find4WD(project: Pick<Project, "parts">): Drivetrain4WD | null {
  const parts = project.parts.map((p) => ({ p, c: getComponent(p.componentId) })).filter((x): x is { p: PartInstance; c: ComponentRecord } => !!x.c);
  const motors = parts.filter((x) => x.c.kind === "dc-motor").map((x) => x.p);
  const wheels = parts.filter((x) => x.c.kind === "wheel").map((x) => x.p);
  const driven = motors.map((m) => ({ m, w: wheels.find((w) => w.attachedTo === m.uid) })).filter((x): x is { m: PartInstance; w: PartInstance } => !!x.w);
  if (driven.length !== 4 || motors.length !== 4) return null;
  const byRole = new Map(CORNERS.map((c) => [c.key, driven.find((d) => d.m.role === c.role)]));
  let assign: Record<Corner, { m: PartInstance; w: PartInstance }> | null = null;
  if (CORNERS.every((c) => byRole.get(c.key)) && new Set(CORNERS.map((c) => byRole.get(c.key)!.m.uid)).size === 4) {
    assign = Object.fromEntries(CORNERS.map((c) => [c.key, byRole.get(c.key)!])) as Record<Corner, { m: PartInstance; w: PartInstance }>;
  } else {
    // fall back to geometry: wheel y > 0 is the left side, larger x is the front
    const left = driven.filter((d) => d.w.position.y > 0).sort((a, b) => b.w.position.x - a.w.position.x);
    const right = driven.filter((d) => d.w.position.y < 0).sort((a, b) => b.w.position.x - a.w.position.x);
    if (left.length !== 2 || right.length !== 2) return null;
    assign = { FL: left[0], RL: left[1], FR: right[0], RR: right[1] };
  }
  const casters = parts.filter((x) => x.c.kind === "caster").map((x) => x.p);
  return {
    motors: Object.fromEntries(CORNERS.map((c) => [c.key, assign![c.key].m])) as Record<Corner, PartInstance>,
    wheels: Object.fromEntries(CORNERS.map((c) => [c.key, assign![c.key].w])) as Record<Corner, PartInstance>,
    casters,
  };
}

export const is4WD = (project: Pick<Project, "parts">) => find4WD(project) !== null;

const dimsOf = (p: PartInstance) => partDims(p, getComponent(p.componentId)!);

/** Reads the current parameters back from the placed parts (works for helper-built and hand-built 4WD robots). */
export function read4WDParams(project: Project): Drivetrain4WDParams | null {
  const dt = find4WD(project);
  if (!dt || !project.chassis) return null;
  const w = dt.wheels;
  const wd = dimsOf(w.FL);
  const avg = (a: number, b: number) => (a + b) / 2;
  const groundZ = Math.min(...CORNERS.map((c) => w[c.key].position.z - dimsOf(w[c.key]).x / 2));
  const motorBottom = Math.min(...CORNERS.map((c) => dt.motors[c.key].position.z - dimsOf(dt.motors[c.key]).z / 2));
  const lowest = Math.min(-project.chassis.thickness_mm, motorBottom);
  return {
    wheelDiameter_mm: round1(wd.x),
    wheelWidth_mm: round1(wd.y),
    wheelbase_mm: round1(avg(w.FL.position.x, w.FR.position.x) - avg(w.RL.position.x, w.RR.position.x)),
    trackWidth_mm: round1(avg(w.FL.position.y, w.RL.position.y) - avg(w.FR.position.y, w.RR.position.y)),
    chassisLength_mm: project.chassis.length_mm,
    chassisWidth_mm: project.chassis.width_mm,
    groundClearance_mm: round1(lowest - groundZ),
  };
}

/**
 * Applies parameters to an existing 4WD drivetrain: repositions the four motors and wheels (uids, wires and
 * config kept; wheel diameter/width written to the wheel config) and resizes the chassis.
 */
export function apply4WDParams(project: Project, patch: Partial<Drivetrain4WDParams>): Project {
  const dt = find4WD(project);
  const current = read4WDParams(project);
  if (!dt || !current || !project.chassis) return project;
  const params: Drivetrain4WDParams = sanitise({ ...current, ...patch });
  const md = dimsOf(dt.motors.FL);
  const { corners, mounting } = layout4WD(params, md, project.chassis.thickness_mm);
  const byUid = new Map<string, Partial<PartInstance>>();
  for (const c of CORNERS) {
    const m = dt.motors[c.key];
    const w = dt.wheels[c.key];
    byUid.set(m.uid, { position: corners[c.key].motor.position, rotation: { ...m.rotation, z: corners[c.key].motor.yaw }, role: c.role });
    byUid.set(w.uid, { position: corners[c.key].wheel.position, rotation: { ...w.rotation, z: 0 }, attachedTo: m.uid, role: c.role, config: { ...w.config, diameter: params.wheelDiameter_mm, width: params.wheelWidth_mm } });
  }
  return {
    ...project,
    chassis: { ...project.chassis, length_mm: params.chassisLength_mm, width_mm: params.chassisWidth_mm, groundClearance_mm: round1(mounting.clearance_mm) },
    parts: project.parts.map((p) => (byUid.has(p.uid) ? { ...p, ...byUid.get(p.uid) } : p)),
    updatedAt: new Date().toISOString(),
  };
}

function uniqueLabel(project: Project, base: string): string {
  let label = base;
  for (let n = 2; project.parts.some((p) => p.label === label); n++) label = `${base} ${n}`;
  return label;
}

/**
 * Adds a complete 4WD drivetrain (4 motors + 4 wheels, no caster) to a project that has no drive motors yet.
 * Labels: "FL Motor" / "FL Wheel", "FR …", "RL …", "RR …".
 */
export function setup4WD(project: Project, opts: Drivetrain4WDOptions = {}): Project {
  const hasMotors = project.parts.some((p) => getComponent(p.componentId)?.kind === "dc-motor");
  if (hasMotors) throw new Error("This project already has drive motors — use convertTo4WD for a 2WD robot.");
  const motorId = opts.motorId ?? DEFAULT_4WD_MOTOR;
  const wheelId = opts.wheelId ?? DEFAULT_4WD_WHEEL;
  const motorComp = getComponent(motorId);
  const wheelComp = getComponent(wheelId);
  if (motorComp?.kind !== "dc-motor") throw new Error(`${motorId} is not a DC motor`);
  if (wheelComp?.kind !== "wheel") throw new Error(`${wheelId} is not a wheel`);
  let p = project;
  if (opts.chassisId) p = { ...p, chassis: { ...chassisFrom(opts.chassisId), mountingHoles: p.chassis?.mountingHoles ?? [] } };
  if (!p.chassis) p = { ...p, chassis: chassisFrom(DEFAULT_4WD_CHASSIS) };
  const ch = p.chassis!;
  const base = defaultParamsFor(ch.length_mm, ch.width_mm, wheelComp, motorComp);
  const params = sanitise({ ...base, ...(opts.params ?? {}) });
  // casters are not part of a 4WD drivetrain
  p = removeCasters(p);
  for (const c of CORNERS) {
    const motor = createPart(p, motorId, { label: uniqueLabel(p, `${c.key} Motor`), role: c.role });
    p = { ...p, parts: [...p.parts, motor] };
    const wheel = createPart(p, wheelId, { label: uniqueLabel(p, `${c.key} Wheel`), role: c.role, attachedTo: motor.uid, config: { diameter: params.wheelDiameter_mm, width: params.wheelWidth_mm } });
    p = { ...p, parts: [...p.parts, wheel] };
  }
  return apply4WDParams(p, params);
}

/**
 * Explicit conversion of a 2WD robot (two driven motors, usually plus a caster) to 4WD: the existing motors and
 * wheels become the rear pair (uids, wires, labels and config kept), two identical front motors + wheels are
 * added (not yet wired) and the casters are removed. Undo restores the 2WD robot.
 */
export function convertTo4WD(project: Project, params: Partial<Drivetrain4WDParams> = {}): Project {
  const parts = project.parts.map((p) => ({ p, c: getComponent(p.componentId) })).filter((x): x is { p: PartInstance; c: ComponentRecord } => !!x.c);
  const motors = parts.filter((x) => x.c.kind === "dc-motor");
  const driven = motors.map((m) => ({ m: m.p, w: parts.find((x) => x.c.kind === "wheel" && x.p.attachedTo === m.p.uid)?.p })).filter((x): x is { m: PartInstance; w: PartInstance } => !!x.w);
  if (motors.length !== 2 || driven.length !== 2) throw new Error("Convert to 4WD needs a 2WD robot: exactly two motors, each with a wheel.");
  const left = driven.find((d) => d.w.position.y > 0);
  const right = driven.find((d) => d.w.position.y < 0);
  if (!left || !right) throw new Error("The two driven wheels must be on opposite sides.");
  if (!project.chassis) throw new Error("Choose a chassis first.");
  const wd = dimsOf(left.w);
  const md = dimsOf(left.m);
  let p = removeCasters(project);
  p = { ...p, parts: p.parts.map((x) => (x.uid === left.m.uid || x.uid === left.w.uid ? { ...x, role: "rear-left" } : x.uid === right.m.uid || x.uid === right.w.uid ? { ...x, role: "rear-right" } : x)) };
  for (const c of CORNERS.filter((k) => k.sx > 0)) {
    const src = c.sy > 0 ? left : right;
    const motor = createPart(p, src.m.componentId, { label: uniqueLabel(p, `${c.key} Motor`), role: c.role, config: { ...src.m.config } });
    p = { ...p, parts: [...p.parts, motor] };
    const wheel = createPart(p, src.w.componentId, { label: uniqueLabel(p, `${c.key} Wheel`), role: c.role, attachedTo: motor.uid, config: { ...src.w.config } });
    p = { ...p, parts: [...p.parts, wheel] };
  }
  const track = Math.max(left.w.position.y - right.w.position.y, project.chassis.width_mm + wd.y + 2 * TYRE_GAP_MM);
  const wheelbase = Math.max(md.x + 10, Math.min(project.chassis.length_mm * 0.65, project.chassis.length_mm - wd.x * 0.5));
  // keep the existing ride height where possible
  const lowest = Math.min(-project.chassis.thickness_mm, left.m.position.z - md.z / 2);
  const ground = left.w.position.z - wd.x / 2;
  return apply4WDParams(p, { wheelDiameter_mm: wd.x, wheelWidth_mm: wd.y, trackWidth_mm: round1(track), wheelbase_mm: round1(wheelbase), groundClearance_mm: round1(lowest - ground), ...params });
}

function removeCasters(project: Project): Project {
  const casterUids = new Set(project.parts.filter((p) => getComponent(p.componentId)?.kind === "caster").map((p) => p.uid));
  if (!casterUids.size) return project;
  return { ...project, parts: project.parts.filter((p) => !casterUids.has(p.uid)), wires: project.wires.filter((w) => !casterUids.has(w.from.part) && !casterUids.has(w.to.part)) };
}

/** Sensible starting parameters for a chassis, wheel and motor. */
export function defaultParamsFor(chassisLength_mm: number, chassisWidth_mm: number, wheel?: ComponentRecord, motor?: ComponentRecord): Drivetrain4WDParams {
  const d = wheel?.wheel?.diameter_mm ?? DEFAULT_4WD_PARAMS.wheelDiameter_mm;
  const w = wheel?.wheel?.width_mm ?? DEFAULT_4WD_PARAMS.wheelWidth_mm;
  const ml = motor?.specs.dimensions?.x ?? 65;
  const mh = motor?.specs.dimensions?.z ?? 19;
  return {
    wheelDiameter_mm: d,
    wheelWidth_mm: w,
    wheelbase_mm: Math.round(Math.max(ml + 10, Math.min(chassisLength_mm * 0.68, chassisLength_mm - d * 0.5))),
    trackWidth_mm: chassisWidth_mm + w + 2 * TYRE_GAP_MM,
    chassisLength_mm,
    chassisWidth_mm,
    groundClearance_mm: round1(d / 2 - mh / 2),
  };
}

const LIMITS: Record<keyof Drivetrain4WDParams, [number, number]> = {
  wheelDiameter_mm: [20, 200],
  wheelWidth_mm: [5, 80],
  wheelbase_mm: [20, 600],
  trackWidth_mm: [40, 600],
  chassisLength_mm: [40, 600],
  chassisWidth_mm: [40, 600],
  groundClearance_mm: [1, 120],
};

function sanitise(p: Drivetrain4WDParams): Drivetrain4WDParams {
  const out = { ...p };
  for (const k of Object.keys(LIMITS) as (keyof Drivetrain4WDParams)[]) {
    const v = Number(out[k]);
    const [lo, hi] = LIMITS[k];
    out[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : DEFAULT_4WD_PARAMS[k];
  }
  return out;
}

export const minTrackWidth = (params: Pick<Drivetrain4WDParams, "chassisWidth_mm" | "wheelWidth_mm">) => params.chassisWidth_mm + params.wheelWidth_mm + 2;

/** Driver channel that feeds a motor, e.g. "DRV1 channel A", from the wiring (for the FL/FR/RL/RR mapping table). */
export function motorDriverChannel(project: Project, motorUid: string): string | null {
  for (const w of project.wires) {
    const ends = [w.from, w.to];
    const mine = ends.find((e) => e.part === motorUid);
    const other = ends.find((e) => e !== mine);
    if (!mine || !other || other.part === motorUid) continue;
    const drv = project.parts.find((p) => p.uid === other.part);
    const wiring = drv ? DRIVER_WIRING[drv.componentId] : undefined;
    const ch = wiring?.channels.find((c) => c.outs.includes(other.pin));
    if (drv && ch) return `${drv.label} channel ${ch.name}`;
  }
  return null;
}

/** Problems with a 4WD layout (used by mechanical validation and the designer panel). */
export function check4WD(project: Project): { code: string; message: string }[] {
  const dt = find4WD(project);
  if (!dt) return [];
  const out: { code: string; message: string }[] = [];
  const w = dt.wheels;
  if (!(w.FL.position.y > 0 && w.RL.position.y > 0 && w.FR.position.y < 0 && w.RR.position.y < 0)) out.push({ code: "SIDES", message: "A 4WD robot needs two driven wheels on the left side and two on the right side." });
  if (!(w.FL.position.x > w.RL.position.x + 5 && w.FR.position.x > w.RR.position.x + 5)) out.push({ code: "AXLES", message: "Each side needs a front wheel and a rear wheel on separate axles." });
  const yTol = 5;
  if (Math.abs(w.FL.position.y + w.FR.position.y) > yTol || Math.abs(w.RL.position.y + w.RR.position.y) > yTol) out.push({ code: "SYMMETRY", message: "The left and right wheels are not the same distance from the centre-line." });
  return out;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
