/**
 * Regression: the Code Studio line-following templates must survive sharp corners on the reference
 * 5-sensor robot. Before the fix, the basic template drove straight off the track after overshooting a
 * corner, and the PID template always searched to the LEFT when the line vanished while centred.
 */
import { describe, expect, it } from "vitest";
import { referenceLineFollower } from "@/lib/robot/reference";
import { CODE_TEMPLATES } from "@/lib/code/templates";
import { checkCodeAgainstCircuit } from "@/lib/code/check";
import { compile, getBoard } from "@/lib/arduino";
import { SimSession } from "@/lib/sim/session";
import { getExampleTrack } from "@/lib/track/examples";
import { compileTrack } from "@/lib/track/compile";
import { studentCourse } from "@/lib/garage/scenarios";
import type { TrackDef } from "@/lib/sim/types";

const tpl = (id: string) => CODE_TEMPLATES.find((t) => t.id === id)!.code;

function distToLines(x: number, y: number, lines: { points: { x: number; y: number }[] }[]) {
  let best = Infinity;
  for (const l of lines)
    for (let i = 0; i + 1 < l.points.length; i++) {
      const a = l.points[i];
      const b = l.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = dx * dx + dy * dy || 1e-9;
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L));
      best = Math.min(best, Math.hypot(a.x + u * dx - x, a.y + u * dy - y));
    }
  return best;
}

function run(templateId: string, track: TrackDef, maxS = 70) {
  const s = new SimSession({ project: { ...referenceLineFollower("t"), code: tpl(templateId) }, track, mode: "code" });
  const lines = compileTrack(track).lines;
  let worst = 0;
  let laps = 0;
  for (let t = 0; t < maxS && laps < 2; t += 0.25) {
    s.advance(0.25, 1000);
    const p = s.telemetry().pose;
    if (s.time > 2) worst = Math.max(worst, distToLines(p.x, p.y, lines));
    laps = s.events.filter((e) => e.type === "lap" && e.robot === 0).length;
  }
  return { laps, worst, state: s.runtimeStatus?.state };
}

const SHARP_TRACKS: [string, () => TrackDef][] = [
  ["Line · Sharp Corners", () => getExampleTrack("example-line-intermediate-sharp")!],
  ["Line · Beast Zig-Zag", () => getExampleTrack("example-line-beast-zigzag")!],
  ["student course with a 90° corner and 18 cm curves", studentCourse],
];

describe("line templates follow sharp turns instead of wandering off", () => {
  for (const id of ["line-basic", "line-pid"]) {
    it(`${id} matches the reference robot's wiring`, () => {
      const p = { ...referenceLineFollower("t"), code: tpl(id) };
      const issues = checkCodeAgainstCircuit(p, compile(tpl(id), { board: getBoard("uno") }));
      expect(issues.filter((i) => i.severity === "critical")).toEqual([]);
    });
    for (const [name, make] of SHARP_TRACKS) {
      it(`${id} completes two laps of ${name} and never strays more than 10 cm from the line`, () => {
        const r = run(id, make());
        expect(r.state).not.toBe("error");
        expect(r.laps).toBeGreaterThanOrEqual(2);
        expect(r.worst).toBeLessThan(0.1);
      }, 180_000);
    }
  }
});
