/** Turns a ProjectTemplate into a normal Project using the existing assembly + wiring systems. */
import type { Project } from "@/lib/types";
import { addPart, chassisFrom, newProject, uid } from "@/lib/robot/assembly";
import { wire } from "@/lib/robot/reference";
import type { ProjectTemplate } from "./types";

export function buildFromTemplate(t: ProjectTemplate, ownerId: string, mode: "original" | "copy"): Project {
  let p = newProject(t.metadata.competition, mode === "original" ? `${t.metadata.id} · ${t.metadata.name}` : `${t.metadata.name} (my copy)`, ownerId, { drivetrain: "none" });
  const base = chassisFrom(t.chassis.componentId);
  p = {
    ...p,
    chassis: {
      ...base,
      length_mm: t.chassis.length_mm ?? base.length_mm,
      width_mm: t.chassis.width_mm ?? base.width_mm,
      thickness_mm: t.chassis.thickness_mm ?? base.thickness_mm,
      material: t.chassis.material ?? base.material,
      groundClearance_mm: t.chassis.groundClearance_mm ?? base.groundClearance_mm,
    },
  };
  for (const tp of t.parts) {
    const overrides: Record<string, unknown> = { label: tp.label };
    if (tp.config) overrides.config = tp.config;
    if (tp.position) overrides.position = tp.position;
    if (tp.yawDeg !== undefined) overrides.rotation = { x: 0, y: 0, z: (tp.yawDeg * Math.PI) / 180 };
    if (tp.role) overrides.role = tp.role;
    const r = addPart(p, tp.componentId, overrides as never);
    p = r.project;
    if (tp.attachedTo) {
      const target = p.parts.find((x) => x.label === tp.attachedTo);
      if (!target) throw new Error(`${t.metadata.id}: ${tp.label} attaches to unknown part ${tp.attachedTo}`);
      p = { ...p, parts: p.parts.map((x) => (x.uid === r.part.uid ? { ...x, attachedTo: target.uid } : x)) };
    }
  }
  for (const [a, b, c] of t.wiring) p = wire(p, a, b, c);
  // every wire endpoint must be a real pin of a real part
  for (const w of p.wires) {
    for (const end of [w.from, w.to]) {
      const part = p.parts.find((x) => x.uid === end.part);
      if (!part) throw new Error(`${t.metadata.id}: wire to missing part`);
    }
  }
  return {
    ...p,
    id: uid("prj"),
    code: t.firmware.source,
    trackId: t.simulation.defaultTrackId,
    simConfig: {
      controlMode: t.simulation.controlMode,
      keyboardViaSerial: t.simulation.keyboardViaSerial,
      opponent: t.simulation.opponent,
      dt: t.simulation.dt,
      difficulty: t.simulation.difficulty,
      tunables: t.simulation.tunables,
      telemetryPrefix: t.simulation.telemetryPrefix,
      telemetryFields: t.simulation.telemetryFields,
    },
    origin: { templateId: t.metadata.id, templateVersion: t.metadata.version, mode, loadedAt: new Date().toISOString() },
  };
}

/** Fields a read-only reference instance may change (running simulations, choosing a track). */
export const REFERENCE_MUTABLE_FIELDS = ["trackId", "simulations", "validation", "codeCheck", "updatedAt", "simConfig"] as const;
