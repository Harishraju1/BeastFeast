/**
 * Originality check for XP that also treats the code generator's output for THIS robot as a template:
 * a student who presses "Generate code for my robot" gets working code, but not "own code" XP for it.
 */
import type { Project } from "@/lib/types";
import { checkOriginality, type OriginalityResult } from "./originality";
import { generateFirmware, type Behaviour, type ControlMethod } from "./generate";

const BEHAVIOURS: Behaviour[] = ["manual", "line", "sumo", "obstacle", "motor-test"];
const CONTROLS: ControlMethod[] = ["none", "hc05", "wifi"];

export function generatedSources(project: Project): { name: string; source: string }[] {
  const out: { name: string; source: string }[] = [];
  for (const behaviour of BEHAVIOURS)
    for (const control of CONTROLS) {
      try {
        const fw = generateFirmware(project, { behaviour, control });
        if (fw.ok) out.push({ name: `code generator (${behaviour}, ${control})`, source: fw.code });
      } catch {
        /* a combination the robot can't support — nothing to compare against */
      }
    }
  return out;
}

export function checkOwnCode(code: string, project: Project): OriginalityResult {
  return checkOriginality(code, generatedSources(project));
}
