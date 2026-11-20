import { describe, expect, it } from "vitest";
import { GARAGE_TEMPLATES, buildFromTemplate, getTemplate } from "@/lib/garage";
import { runReadiness } from "@/lib/garage/readiness";
import { allScenarios } from "@/lib/garage/scenarios";
import { getComponent } from "@/lib/catalogue";
import { LIPO_3S_2100_ID } from "@/lib/catalogue/platform";
import { find4WD, motorDriverChannel } from "@/lib/robot/drivetrain4wd";

const NEW = ["RR-04", "RR-05", "RR-06", "RW-04"];

describe("4WD Garage reference robots", () => {
  it("adds four 4WD robots built only from catalogue parts", () => {
    for (const id of NEW) {
      const t = getTemplate(id)!;
      expect(t, id).toBeTruthy();
      expect(t.metadata.drivetrain).toBe("4WD");
      expect(t.metadata.legacy).toBeFalsy();
      for (const p of t.parts) expect(getComponent(p.componentId), `${id} ${p.componentId}`).toBeTruthy();
      const p = buildFromTemplate(t, "x", "original");
      expect(find4WD(p), id).not.toBeNull();
      expect(p.parts.filter((x) => getComponent(x.componentId)?.kind === "caster")).toHaveLength(0);
    }
  });

  it("race robots use the 11.1 V 3S pack and 12 V motors; every motor has its own driver channel", () => {
    for (const id of ["RR-04", "RR-05", "RR-06"]) {
      const p = buildFromTemplate(getTemplate(id)!, "x", "original");
      expect(p.parts.find((x) => x.label === "BAT1")!.componentId).toBe(LIPO_3S_2100_ID);
      const dt = find4WD(p)!;
      const channels = (["FL", "FR", "RL", "RR"] as const).map((c) => motorDriverChannel(p, dt.motors[c].uid));
      expect(channels).toEqual(["DRV1 channel A", "DRV1 channel B", "DRV2 channel A", "DRV2 channel B"]);
      for (const c of ["FL", "FR", "RL", "RR"] as const) {
        const m = dt.motors[c];
        const nominal = m.config.customParams ? Number(m.config.nominalVoltage) : getComponent(m.componentId)!.motor!.nominalVoltage;
        expect(nominal).toBe(12);
      }
    }
  });

  it("the rover has more ground clearance and larger wheels than the race car", () => {
    const race = buildFromTemplate(getTemplate("RR-04")!, "x", "original");
    const rover = buildFromTemplate(getTemplate("RR-05")!, "x", "original");
    expect(rover.chassis!.groundClearance_mm).toBeGreaterThanOrEqual(25);
    expect(rover.chassis!.groundClearance_mm).toBeLessThanOrEqual(30);
    expect(rover.chassis!.groundClearance_mm).toBeGreaterThan(race.chassis!.groundClearance_mm);
    expect(Number(find4WD(rover)!.wheels.FL.config.diameter)).toBeGreaterThan(Number(find4WD(race)!.wheels.FL.config.diameter));
    expect(rover.parts.some((x) => getComponent(x.componentId)?.sensor?.kind === "ultrasonic")).toBe(true);
  });

  it("the sumo robot is compact, low and has a wedge", () => {
    const p = buildFromTemplate(getTemplate("RW-04")!, "x", "original");
    expect(p.chassis!.length_mm).toBeLessThanOrEqual(100);
    expect(p.chassis!.width_mm).toBeLessThanOrEqual(100);
    expect(p.chassis!.groundClearance_mm).toBeLessThanOrEqual(10);
    expect(p.parts.some((x) => x.componentId === "front-wedge")).toBe(true);
  });

  it("keeps the legacy 2WD robots (marked); the line followers are 4WD (v2.0.0) and not legacy", () => {
    for (const id of ["RR-01", "RR-03", "RW-01", "RW-02", "RW-03"]) {
      const t = getTemplate(id)!;
      expect(t, id).toBeTruthy();
      expect(t.metadata.legacy).toBe(true);
      expect(t.metadata.drivetrain).toBe("2WD");
      expect(t.metadata.version).toBe("1.1.0");
    }
    expect(getTemplate("RR-02")!.metadata.legacy).toBeFalsy();
    for (const id of ["LF-01", "LF-02", "LF-03"]) {
      expect(getTemplate(id)!.metadata.legacy).toBeUndefined();
      expect(getTemplate(id)!.metadata.drivetrain).toBe("4WD");
      expect(getTemplate(id)!.metadata.version).toMatch(/^2./);
    }
  });

  it("lists the 4WD robots first in each section, legacy robots last", () => {
    const ids = (c: string) => GARAGE_TEMPLATES.filter((t) => t.metadata.competition === c).map((t) => t.metadata.id);
    expect(ids("race")).toEqual(["RR-04", "RR-05", "RR-06", "RR-02", "RR-01", "RR-03"]);
    expect(ids("sumo")).toEqual(["RW-04", "RW-01", "RW-02", "RW-03"]);
    expect(ids("line")).toEqual(["LF-01", "LF-02", "LF-03"]);
  });

  for (const id of NEW) {
    it(`${id} is READY TO SIMULATE`, () => {
      const r = runReadiness(getTemplate(id)!, { simSeconds: 1.5 });
      expect(r.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`)).toEqual([]);
      expect(r.status).toBe("READY TO SIMULATE");
    }, 60_000);
  }

  it("has the required 4WD behaviour scenarios", () => {
    const ids = allScenarios().filter((s) => s.mustPass).map((s) => s.id);
    for (const id of ["RR-04", "RR-05", "RR-06"]) for (const k of ["forward-reverse", "turns", "pivot", "single-motor", "geometry"]) expect(ids).toContain(`${id}-4wd-${k}`);
    for (const k of ["RR-05-obstacle-avoidance", "RW-04-4wd-geometry", "RW-04-push", "RW-04-match-beginner", "RW-04-edge", "RW-04-recovery"]) expect(ids).toContain(k);
  });
});
