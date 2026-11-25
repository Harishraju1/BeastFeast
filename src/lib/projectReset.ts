import { compile, getBoard } from "@/lib/arduino";
import { validateProject } from "@/lib/circuit/validate";
import { checkCodeAgainstCircuit } from "@/lib/code/check";
import { designFingerprint } from "@/lib/fingerprint";
import { buildFromTemplate, getTemplate } from "@/lib/garage";
import type { Project } from "@/lib/types";

/**
 * A Garage copy rebuilt from its original template: design, wiring, code and sim config come fresh from the
 * template, while the copy keeps its id, name, owner, creation date, saved versions and past simulation
 * results (student data is never thrown away). Like loading a template, the real circuit validation and
 * code check are stored so every module starts unlocked and up to date.
 * Returns null when the project is not a template copy.
 */
export function resetToTemplate(p: Project, studentName = "Engineer"): Project | null {
  if (p.origin?.mode !== "copy") return null;
  const t = getTemplate(p.origin.templateId);
  if (!t) return null;
  const fresh: Project = { ...buildFromTemplate(t, p.ownerId, "copy"), id: p.id, ownerId: p.ownerId, name: p.name, createdAt: p.createdAt, versions: p.versions, simulations: p.simulations };
  const validation = { ...validateProject(fresh, studentName), fingerprint: designFingerprint(fresh) };
  const compiled = compile(fresh.code, { board: getBoard(t.firmware.board) });
  const issues = compiled.ok ? checkCodeAgainstCircuit(fresh, compiled, studentName) : [];
  return { ...fresh, validation, codeCheck: { at: new Date().toISOString(), ok: compiled.ok && !issues.some((i) => i.severity === "critical"), issues, fingerprint: designFingerprint(fresh) } };
}
