import type { Project } from "@/lib/types";

/** Cheap stable hash of everything validation depends on. */
export function designFingerprint(p: Pick<Project, "chassis" | "parts" | "wires">): string {
  const s = JSON.stringify([p.chassis, p.parts.map((x) => [x.uid, x.componentId, x.position, x.rotation, x.config, x.attachedTo, x.inCircuit]), p.wires.map((w) => [w.from, w.to])]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function validationState(p: Project): "none" | "passed" | "failed" | "stale" {
  if (!p.validation) return "none";
  if (p.validation.fingerprint && p.validation.fingerprint !== designFingerprint(p)) return "stale";
  return p.validation.passed ? "passed" : "failed";
}
