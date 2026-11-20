/** Mechanical assembly validation using real part dimensions where available. */
import { getComponent } from "@/lib/catalogue";
import type { PartInstance, Project, ValidationIssue } from "@/lib/types";
import { chassisGeom, massSummary, partBox, partDims } from "./geometry";
import { check4WD, find4WD } from "@/lib/robot/drivetrain4wd";

type Issue = Omit<ValidationIssue, "id">;

export interface SumoLimits {
  maxLength_mm: number;
  maxWidth_mm: number;
  maxMass_g: number;
}
export const DEFAULT_SUMO_LIMITS: SumoLimits = { maxLength_mm: 100, maxWidth_mm: 100, maxMass_g: 500 };

export function validateMechanics(project: Project, NAME: string, limits: SumoLimits = DEFAULT_SUMO_LIMITS): { issues: Issue[]; checks: number } {
  const issues: Issue[] = [];
  let checks = 0;
  const add = (i: Omit<Issue, "area">) => issues.push({ ...i, area: "mechanical" });
  const ch = chassisGeom(project);
  const parts = project.parts.map((p) => ({ p, c: getComponent(p.componentId)! })).filter((x) => x.c);
  const motors = parts.filter((x) => x.c.kind === "dc-motor");
  const wheels = parts.filter((x) => x.c.kind === "wheel");
  const casters = parts.filter((x) => x.c.kind === "caster");

  checks++;
  if (!ch) return { issues, checks };

  // wheel ↔ motor attachment
  for (const w of wheels) {
    checks++;
    const m = motors.find((x) => x.p.uid === w.p.attachedTo);
    if (!m)
      add({ severity: "critical", code: "M_WHEEL_UNATTACHED", title: `MECHANICAL ASSEMBLY ERROR! ${w.p.label.toUpperCase()} IS NOT ON A MOTOR SHAFT!`, partUid: w.p.uid, explanation: "A drive wheel must be mounted on a motor's output shaft, otherwise it just rolls freely.", fix: "Select the wheel and choose a motor in 'Attach to motor shaft', or drag it onto the motor." });
  }
  for (const m of motors) {
    checks++;
    if (!wheels.some((w) => w.p.attachedTo === m.p.uid))
      add({ severity: "critical", code: "M_MOTOR_NO_WHEEL", title: `MECHANICAL ASSEMBLY ERROR! ${m.p.label.toUpperCase()} HAS NO WHEEL!`, partUid: m.p.uid, explanation: "The motor turns, but nothing transfers that rotation to the floor.", fix: "Add a wheel and attach it to this motor's shaft." });
    // orientation: shaft must point sideways (along ±y): motor yaw ≈ 0 or π (motor body along x, shaft along y)
    const yaw = ((m.p.rotation.z % Math.PI) + Math.PI) % Math.PI;
    if (Math.min(yaw, Math.PI - yaw) > 0.2)
      add({ severity: "critical", code: "M_MOTOR_ORIENTATION", title: "MECHANICAL ASSEMBLY ERROR! MOTOR IS MOUNTED SIDEWAYS!", partUid: m.p.uid, explanation: "The motor shaft must point out to the side of the robot so the wheel rolls forward. Rotated, the wheel would push the robot sideways.", fix: "Rotate the motor back to 0° or 180°." });
  }

  // left/right pairing & axle alignment
  const driven = wheels.filter((w) => w.p.attachedTo);
  const left = driven.filter((w) => w.p.position.y > 0);
  const right = driven.filter((w) => w.p.position.y < 0);
  checks++;
  if (driven.length >= 2 && (!left.length || !right.length))
    add({ severity: "critical", code: "M_ONE_SIDED", title: "MECHANICAL ASSEMBLY ERROR! ALL DRIVE WHEELS ARE ON ONE SIDE!", partUid: driven[0].p.uid, explanation: "Differential steering needs driven wheels on both the left and right side.", fix: "Move one motor/wheel pair to the other side of the chassis." });
  // 4WD skid-steer: four driven wheels (no caster needed) — two per side, each side with a front and a rear wheel
  if (driven.length === 4 && motors.length === 4) {
    checks++;
    const dt = find4WD(project);
    if (!dt)
      add({ severity: "critical", code: "M_4WD_SIDES", title: "MECHANICAL ASSEMBLY ERROR! A 4WD ROBOT NEEDS TWO WHEELS ON EACH SIDE!", partUid: driven[0].p.uid, incorrect: `${left.length} driven wheel(s) on the left, ${right.length} on the right.`, explanation: "Skid steering turns by driving the left pair and the right pair at different speeds, so each side needs two driven wheels.", fix: "Use 'Set up 4WD drivetrain' in the 4WD panel, or move the wheels so there are two on each side." });
    else
      for (const pr of check4WD(project)) {
        const crit = pr.code !== "SYMMETRY";
        add({ severity: crit ? "critical" : "warning", code: `M_4WD_${pr.code}`, title: crit ? `MECHANICAL ASSEMBLY ERROR! 4WD LAYOUT: ${pr.code === "AXLES" ? "FRONT AND REAR WHEELS ARE ON THE SAME AXLE" : "WHEELS ON THE WRONG SIDE"}!` : "4WD WHEELS ARE NOT SYMMETRICAL", partUid: dt.wheels.FL.uid, explanation: pr.message, fix: "Open the 4WD drivetrain panel and set the wheelbase and track width — it places all four corners symmetrically." });
      }
  }
  for (const l of left) {
    const r = right.slice().sort((a, b) => Math.abs(a.p.position.x - l.p.position.x) - Math.abs(b.p.position.x - l.p.position.x))[0];
    if (!r) continue;
    checks++;
    if (Math.abs(r.p.position.x - l.p.position.x) > 8)
      add({ severity: "warning", code: "M_WHEEL_MISALIGNED", title: "WHEELS ARE NOT ALIGNED", partUid: l.p.uid, incorrect: `${l.p.label} x = ${l.p.position.x.toFixed(0)} mm, ${r.p.label} x = ${r.p.position.x.toFixed(0)} mm.`, explanation: "Left and right drive wheels on different axles make the robot pivot around an unexpected point and scrub its tyres when turning.", fix: "Line the wheels up on the same axle position." });
    const dz = Math.abs(partDims(l.p, l.c).x - partDims(r.p, r.c).x);
    if (dz > 1)
      add({ severity: "warning", code: "M_WHEEL_SIZE_MISMATCH", title: "LEFT AND RIGHT WHEELS HAVE DIFFERENT DIAMETERS", partUid: l.p.uid, explanation: "The robot will curve towards the smaller wheel at equal motor speed.", fix: "Use identical wheels on both sides." });
  }

  // overlaps
  const solid = parts.filter((x) => !["wheel", "caster"].includes(x.c.kind) && x.c.functionalityClass !== "C" && !["connector", "fastener", "material"].includes(x.c.kind));
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++) {
      checks++;
      const a = partBox(solid[i].p, solid[i].c),
        b = partBox(solid[j].p, solid[j].c);
      const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      if (ox > 2 && oy > 2 && oz > 2)
        add({ severity: "warning", code: "M_OVERLAP", title: "COMPONENTS ARE INSIDE EACH OTHER", partUid: solid[j].p.uid, incorrect: `${solid[i].p.label} overlaps ${solid[j].p.label} by ${ox.toFixed(0)}×${oy.toFixed(0)}×${oz.toFixed(0)} mm.`, explanation: "Two solid parts cannot occupy the same space.", fix: "Move one of them (use a standoff to stack boards)." });
    }

  // interference with chassis wheels
  for (const w of wheels) {
    checks++;
    const d = partDims(w.p, w.c);
    const inner = Math.abs(w.p.position.y) - d.y / 2;
    const r = d.x / 2;
    const plateBottom = -ch.thickness;
    if (inner < ch.width / 2 - 1 && w.p.position.z + r > plateBottom && Math.abs(w.p.position.x) < ch.length / 2)
      add({ severity: "critical", code: "M_WHEEL_INTERFERENCE", title: "MECHANICAL ASSEMBLY ERROR! WHEEL RUBS ON THE CHASSIS!", partUid: w.p.uid, explanation: "The wheel overlaps the chassis plate, so it cannot spin.", fix: "Move the wheel outward (beyond the chassis edge) or use a narrower chassis / longer shaft." });
  }

  // ground clearance & support
  checks++;
  const groundZ = Math.min(...[...wheels.map((w) => w.p.position.z - partDims(w.p, w.c).x / 2), ...casters.map((c) => c.p.position.z - partDims(c.p, c.c).z / 2)], Infinity);
  if (Number.isFinite(groundZ)) {
    const clearance = -ch.thickness - groundZ;
    const lowest = Math.min(-ch.thickness, ...solid.map((x) => partBox(x.p, x.c).minZ));
    const realClear = lowest - groundZ;
    if (realClear < 0)
      add({ severity: "critical", code: "M_GROUND_CLEARANCE", title: "MECHANICAL ASSEMBLY ERROR! ROBOT SCRAPES THE FLOOR!", partUid: solid.find((x) => partBox(x.p, x.c).minZ === lowest)?.p.uid, incorrect: `Lowest point is ${(-realClear).toFixed(1)} mm below the wheels' contact.`, explanation: "Part of the robot hangs lower than the wheels touch the floor.", fix: "Use larger wheels, raise the part, or mount motors lower." });
    else if (realClear < 2 && project.competition !== "sumo")
      add({ severity: "warning", code: "M_LOW_CLEARANCE", title: "VERY LOW GROUND CLEARANCE", explanation: `Only ${realClear.toFixed(1)} mm between the robot and the floor — track joints or ramps will catch it.`, fix: "Raise the chassis or use larger wheels." });
    void clearance;
  }

  // centre of mass & support polygon
  const ms = massSummary(project);
  checks++;
  const supports = [...wheels.map((w) => ({ x: w.p.position.x, y: w.p.position.y })), ...casters.map((c) => ({ x: c.p.position.x, y: c.p.position.y }))];
  if (wheels.length && supports.length < 3 && wheels.length + casters.length < 3)
    add({ severity: "critical", code: "M_NO_THIRD_SUPPORT", title: "MECHANICAL ASSEMBLY ERROR! THE ROBOT WILL TIP OVER!", partUid: wheels[0]?.p.uid, explanation: "Two wheels on one axle only support the robot along a line. It needs a third contact point (a caster or a second axle).", fix: "Add a ball caster at the front or back." });
  else if (supports.length >= 3 && !pointInHull({ x: ms.com.x, y: ms.com.y }, supports))
    add({ severity: "critical", code: "M_COM_OUTSIDE", title: "MECHANICAL ASSEMBLY ERROR! CENTRE OF MASS IS OUTSIDE THE WHEELBASE!", incorrect: `Centre of mass at x=${ms.com.x.toFixed(0)} mm, y=${ms.com.y.toFixed(0)} mm.`, explanation: "If the centre of mass lies outside the polygon formed by the wheels and casters, the robot tips over.", fix: "Move heavy parts (battery, motors) towards the middle, or move the caster." });
  if (Math.abs(ms.com.y) > ch.width * 0.15)
    add({ severity: "warning", code: "M_COM_OFFSET", title: "ROBOT IS HEAVIER ON ONE SIDE", incorrect: `Centre of mass ${ms.com.y.toFixed(0)} mm off the centre-line.`, explanation: "Uneven load gives one wheel more traction than the other: the robot drifts and turns unevenly.", fix: "Centre the battery and heavy parts." });

  // sensor placement
  for (const s of parts.filter((x) => x.c.sensor?.kind?.startsWith("reflectance"))) {
    checks++;
    const axleX = driven.length ? driven.reduce((a, w) => a + w.p.position.x, 0) / driven.length : 0;
    const height = s.p.position.z - (Number.isFinite(groundZ) ? groundZ : -30);
    if (project.competition === "line" && s.p.position.x < axleX + 20)
      add({ severity: "warning", code: "M_SENSOR_BEHIND", title: "LINE SENSOR IS NOT AHEAD OF THE WHEELS", partUid: s.p.uid, explanation: "Line sensors work best well in front of the drive axle: the further ahead, the earlier the robot sees a curve.", fix: "Move the sensor to the front edge of the chassis (a boom helps)." });
    if (height > 15)
      add({ severity: "warning", code: "M_SENSOR_HIGH", title: "REFLECTANCE SENSOR IS TOO HIGH ABOVE THE FLOOR", partUid: s.p.uid, incorrect: `${height.toFixed(0)} mm above the floor.`, explanation: "IR reflectance sensors only work a few millimetres from the surface (TCRT5000 peak ≈2.5 mm; QTR ≈3 mm optimal).", fix: "Lower the sensor with a bracket to 3–10 mm above the floor." });
  }
  if (project.competition === "sumo") {
    for (const s of parts.filter((x) => ["ultrasonic", "ir-distance-analog", "tof", "ir-obstacle-digital"].includes(x.c.sensor?.kind ?? ""))) {
      checks++;
      const yaw = s.p.rotation.z;
      if (Math.cos(yaw) < 0.5 && Math.abs(s.p.position.y) < ch.width / 4)
        add({ severity: "suggestion", code: "M_SUMO_SENSOR_DIR", title: "OPPONENT SENSOR IS NOT FACING FORWARD", partUid: s.p.uid, explanation: "Your attack direction is forward — at least one opponent sensor should look forward.", fix: "Rotate it to face +x." });
    }
    checks++;
    if (ch.length > limits.maxLength_mm + 0.5 || ch.width > limits.maxWidth_mm + 0.5)
      add({ severity: "warning", code: "M_SUMO_SIZE", title: "ROBOT IS LARGER THAN THE SUMO SIZE LIMIT", incorrect: `${ch.length}×${ch.width} mm vs ${limits.maxLength_mm}×${limits.maxWidth_mm} mm.`, explanation: "Check your competition rules (administrators can set the limits).", fix: "Reduce the chassis size." });
    if (ms.totalG > limits.maxMass_g)
      add({ severity: "warning", code: "M_SUMO_MASS", title: "ROBOT IS OVER THE MASS LIMIT", incorrect: `${ms.totalG.toFixed(0)} g vs ${limits.maxMass_g} g.`, explanation: "Overweight robots are disqualified at inspection.", fix: "Use a lighter battery, motors or chassis material." });
  }
  // parts beyond chassis
  for (const x of solid) {
    checks++;
    const b = partBox(x.p, x.c);
    const over = Math.max(b.maxX - ch.length / 2, -ch.length / 2 - b.minX, b.maxY - ch.width / 2, -ch.width / 2 - b.minY);
    if (over > 25 && x.c.kind !== "sensor" && x.c.kind !== "dc-motor")
      add({ severity: "warning", code: "M_OUTSIDE_CHASSIS", title: `${x.p.label.toUpperCase()} HANGS OFF THE CHASSIS`, partUid: x.p.uid, incorrect: `${over.toFixed(0)} mm outside the plate.`, explanation: "Unsupported parts break off in collisions.", fix: "Move it onto the chassis or enlarge the chassis." });
  }
  return { issues, checks };
}

function pointInHull(p: { x: number; y: number }, pts: { x: number; y: number }[]): boolean {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: typeof p, a: typeof p, b: typeof p) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof pts = [];
  for (const q of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: typeof pts = [];
  for (const q of s.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 3) return false;
  for (let i = 0; i < hull.length; i++) if (cross(hull[i], hull[(i + 1) % hull.length], p) < -1e-6) return false;
  return true;
}

export type { PartInstance };
