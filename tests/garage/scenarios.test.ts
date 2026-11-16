import { describe, expect, it } from "vitest";
import { allScenarios, runScenario } from "@/lib/garage/scenarios";

// Each scenario drives the full stack (firmware → interpreter → circuit → physics → sensors).
describe("BEAST PROJECT GARAGE behaviour scenarios", () => {
  for (const sc of allScenarios()) {
    it(`${sc.id} — ${sc.name}`, () => {
      const r = runScenario(sc);
      if (sc.mustPass) expect(r.pass, `${r.actual}`).toBe(true);
      else expect(r.actual.startsWith("Error:"), r.actual).toBe(false);
    }, 240_000);
  }
});
