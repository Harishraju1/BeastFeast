/**
 * Every component the platform calls "fully supported" must pass its functional self-test (a real circuit is
 * built and simulated); nothing is reported as pending; the committed dashboard data matches the code.
 */
import { describe, expect, it } from "vitest";
import { coverageTable } from "@/lib/components/coverage";
import data from "@/data/sim-coverage.generated.json";

describe("simulation coverage", () => {
  const rows = coverageTable();
  it("every fully supported electrical component passes its functional self-test", () => {
    const failing = rows.filter((r) => r.level === "full" && r.electrical && r.selftest !== "pass").map((r) => `${r.id}: ${r.selftestDetail}`);
    expect(failing).toEqual([]);
  });
  it("no self-test fails anywhere in the library", () => {
    expect(rows.filter((r) => r.selftest === "fail").map((r) => `${r.id}: ${r.selftestDetail}`)).toEqual([]);
  });
  it("every component has a definite level and an explanation — no pending state", () => {
    for (const r of rows) {
      expect(["full", "limited", "unsupported"]).toContain(r.level);
      expect(r.summary.length).toBeGreaterThan(10);
      if (r.level !== "full") expect(r.limits.length + (r.alternative ? 1 : 0)).toBeGreaterThan(0);
    }
  });
  it("the committed dashboard data is up to date (run npm run sim:coverage)", () => {
    const committed = new Map((data as { rows: { id: string; level: string; selftest: string }[] }).rows.map((r) => [r.id, `${r.level}/${r.selftest}`]));
    const stale = rows.filter((r) => committed.get(r.id) !== `${r.level}/${r.selftest}`).map((r) => r.id);
    expect(stale).toEqual([]);
  });
});
