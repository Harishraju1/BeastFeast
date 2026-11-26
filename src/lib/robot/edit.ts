/**
 * Component editing operations shared by the Robot Designer and Circuit Studio.
 *
 * Every operation returns a new project in which the parts, wires and mechanical attachments are consistent:
 * no wire ever references a deleted part, no wheel stays attached to a deleted motor. The circuit graph,
 * validator and simulator are rebuilt from the project, so a deleted part stops existing for them at once.
 */
import type { PartInstance, Project, Wire } from "@/lib/types";
import { uid } from "./assembly";

/** Parts plus every wire and attachment that references them. */
export function removeParts(project: Project, uids: Iterable<string>): Project {
  const gone = new Set(uids);
  if (!gone.size) return project;
  return {
    ...project,
    parts: project.parts.filter((p) => !gone.has(p.uid)).map((p) => (p.attachedTo && gone.has(p.attachedTo) ? { ...p, attachedTo: null } : p)),
    wires: project.wires.filter((w) => !gone.has(w.from.part) && !gone.has(w.to.part)),
    codeCheck: project.codeCheck ? { ...project.codeCheck, ok: false } : null,
    updatedAt: new Date().toISOString(),
  };
}

/** Wires that would be removed together with these parts. */
export function wiresTouching(project: Project, uids: Iterable<string>): Wire[] {
  const s = new Set(uids);
  return project.wires.filter((w) => s.has(w.from.part) || s.has(w.to.part));
}

/** "DRV1" → "DRV2", "Left Motor" → "Left Motor 2" — never a label already in use. */
export function nextFreeLabel(project: Pick<Project, "parts">, label: string): string {
  const used = new Set(project.parts.map((p) => p.label));
  const m = /^(.*?)(\d+)$/.exec(label);
  const base = m ? m[1] : `${label} `;
  for (let n = m ? Number(m[2]) + 1 : 2; n < 10000; n++) {
    const c = `${base}${n}`;
    if (!used.has(c)) return c;
  }
  return `${label} copy`;
}

/**
 * Copies of the parts, offset on the schematic and in 3D. Wires BETWEEN two copied parts are copied too,
 * so a duplicated sub-circuit stays wired; wires to parts outside the selection are not.
 */
export function duplicateParts(project: Project, uids: string[]): { project: Project; created: string[] } {
  const map = new Map<string, string>();
  let next: Project = project;
  const copies: PartInstance[] = [];
  for (const id of uids) {
    const src = project.parts.find((p) => p.uid === id);
    if (!src) continue;
    const nu = uid();
    map.set(id, nu);
    const copy: PartInstance = {
      ...structuredClone(src),
      uid: nu,
      label: nextFreeLabel({ parts: [...next.parts, ...copies] }, src.label),
      position: { ...src.position, y: src.position.y - 20 },
      attachedTo: null, // re-linked below when the motor it sits on is copied as well
      schematic: { ...src.schematic, x: src.schematic.x + 40, y: src.schematic.y + 40 },
    };
    copies.push(copy);
  }
  // keep a duplicated wheel on its duplicated motor
  for (const c of copies) {
    const src = project.parts.find((p) => map.get(p.uid) === c.uid)!;
    if (src.attachedTo && map.has(src.attachedTo)) c.attachedTo = map.get(src.attachedTo)!;
  }
  const wires: Wire[] = project.wires
    .filter((w) => map.has(w.from.part) && map.has(w.to.part))
    .map((w) => ({ ...w, id: uid("w"), from: { ...w.from, part: map.get(w.from.part)! }, to: { ...w.to, part: map.get(w.to.part)! } }));
  next = { ...project, parts: [...project.parts, ...copies], wires: [...project.wires, ...wires], updatedAt: new Date().toISOString() };
  return { project: next, created: copies.map((c) => c.uid) };
}

const ROTS = [0, 90, 180, 270] as const;
/** Rotate schematic symbols by ±90°. Wires stay attached to the same pins (the canvas re-routes them). */
export function rotateSchematic(project: Project, uids: Iterable<string>, dir: 1 | -1): Project {
  const s = new Set(uids);
  return {
    ...project,
    parts: project.parts.map((p) => {
      if (!s.has(p.uid)) return p;
      const i = ROTS.indexOf((p.schematic.rot ?? 0) as (typeof ROTS)[number]);
      return { ...p, schematic: { ...p.schematic, rot: ROTS[(i + (dir > 0 ? 1 : 3)) % 4] } };
    }),
  };
}

/** Move schematic symbols by a delta (grid snapped by the caller). */
export function moveSchematic(project: Project, uids: Iterable<string>, dx: number, dy: number): Project {
  const s = new Set(uids);
  return { ...project, parts: project.parts.map((p) => (s.has(p.uid) ? { ...p, schematic: { ...p.schematic, x: p.schematic.x + dx, y: p.schematic.y + dy } } : p)) };
}
