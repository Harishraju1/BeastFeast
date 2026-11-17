/**
 * Is this the student's own code, or mostly a copy of a starter template / Garage firmware?
 * XP for code and for simulation results is only awarded for original code.
 *
 * Method: strip comments, whitespace and case, then compare the set of meaningful lines with every
 * known template. If most of the student's lines appear verbatim in one template, it counts as that
 * template. Renaming a few variables or tweaking numbers does not make copied code "original".
 */
import { CODE_TEMPLATES } from "./templates";
import { GARAGE_TEMPLATES } from "@/lib/garage";

export interface OriginalityResult {
  original: boolean;
  /** share of the student's meaningful lines found in the closest template (0..1) */
  similarity: number;
  closest: string | null;
  meaningfulLines: number;
  reason: string;
}

/** Above this share of copied lines the code counts as template-based. */
export const COPY_THRESHOLD = 0.6;
/** Fewer meaningful lines than this is not enough to count as a program. */
export const MIN_LINES = 8;

function stripComments(src: string) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, "");
}

/** Lines that carry logic — blank lines, lone braces and preprocessor includes are ignored. */
export function meaningfulLines(src: string): string[] {
  return stripComments(src)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, "").toLowerCase())
    .filter((l) => l.length > 2 && !/^[{}();]+$/.test(l) && !l.startsWith("#include"));
}

/** Like meaningfulLines, but with numbers masked so retuned constants still match the template. */
function shape(lines: string[]) {
  return lines.map((l) => l.replace(/-?\d+(\.\d+)?/g, "#"));
}

let LIBRARY: { name: string; lines: Set<string> }[] | null = null;
function library() {
  if (!LIBRARY) {
    LIBRARY = [
      ...CODE_TEMPLATES.map((t) => ({ name: `template “${t.title}”`, lines: new Set(shape(meaningfulLines(t.code))) })),
      ...GARAGE_TEMPLATES.map((t) => ({ name: `Garage project ${t.metadata.id}`, lines: new Set(shape(meaningfulLines(t.firmware.source))) })),
    ];
  }
  return LIBRARY;
}

export function checkOriginality(code: string): OriginalityResult {
  const own = shape(meaningfulLines(code ?? ""));
  if (own.length < MIN_LINES)
    return { original: false, similarity: 0, closest: null, meaningfulLines: own.length, reason: `Too short to count as a program (${own.length} meaningful lines, at least ${MIN_LINES} needed).` };
  let best = 0;
  let closest: string | null = null;
  for (const t of library()) {
    const hits = own.filter((l) => t.lines.has(l)).length / own.length;
    if (hits > best) {
      best = hits;
      closest = t.name;
    }
  }
  const original = best < COPY_THRESHOLD;
  return {
    original,
    similarity: best,
    closest,
    meaningfulLines: own.length,
    reason: original ? "Your own code." : `${Math.round(best * 100)}% of the lines match the ${closest} — write your own logic to earn XP.`,
  };
}
