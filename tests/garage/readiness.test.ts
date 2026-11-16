import { describe, expect, it } from "vitest";
import { GARAGE_TEMPLATES, buildFromTemplate, getTemplate } from "@/lib/garage";
import { runReadiness } from "@/lib/garage/readiness";
import { getComponent } from "@/lib/catalogue";

describe("BEAST PROJECT GARAGE catalogue of reference projects", () => {
  it("has at least three projects per competition with unique ids", () => {
    for (const c of ["line", "race", "sumo"] as const) expect(GARAGE_TEMPLATES.filter((t) => t.metadata.competition === c).length).toBeGreaterThanOrEqual(3);
    expect(new Set(GARAGE_TEMPLATES.map((t) => t.metadata.id)).size).toBe(GARAGE_TEMPLATES.length);
  });

  it("uses only real catalogue components", () => {
    for (const t of GARAGE_TEMPLATES) {
      expect(getComponent(t.chassis.componentId), `${t.metadata.id} chassis`).toBeTruthy();
      for (const p of t.parts) expect(getComponent(p.componentId), `${t.metadata.id} ${p.componentId}`).toBeTruthy();
    }
  });

  for (const t of GARAGE_TEMPLATES) {
    it(`${t.metadata.id} passes the automated readiness test`, () => {
      const r = runReadiness(t, { simSeconds: 1.5 });
      const failed = r.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
      expect(failed).toEqual([]);
      expect(r.checks.length).toBe(14);
      expect(r.status).toBe("READY TO SIMULATE");
    }, 60_000);
  }
});

describe("loading and forking", () => {
  it("a student copy gets a new id, an owner and the full configuration — the original definition is untouched", () => {
    const t = getTemplate("LF-02")!;
    const before = JSON.stringify(t);
    const original = buildFromTemplate(t, "student-1", "original");
    const copy = buildFromTemplate(t, "student-1", "copy");
    expect(copy.id).not.toBe(original.id);
    expect(copy.ownerId).toBe("student-1");
    expect(copy.origin).toMatchObject({ templateId: "LF-02", mode: "copy" });
    expect(original.origin?.mode).toBe("original");
    expect(copy.parts.length).toBe(original.parts.length);
    expect(copy.wires.length).toBe(original.wires.length);
    expect(copy.code).toBe(t.firmware.source);
    expect(copy.trackId).toBe(t.simulation.defaultTrackId);
    // mutate the copy like a student would
    copy.parts[0].position.x += 10;
    copy.code += "\n// my change";
    expect(JSON.stringify(t)).toBe(before);
    expect(buildFromTemplate(t, "x", "original").code).toBe(t.firmware.source);
  });
});
