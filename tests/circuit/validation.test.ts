import { describe, expect, it } from "vitest";
import { reference2WD, referenceLineFollower, referenceSumo, wire } from "@/lib/robot/reference";
import { validateProject } from "@/lib/circuit/validate";
import { buildGraph } from "@/lib/circuit/nets";
import { buildRobotSpec } from "@/lib/robot/model";
import type { Project } from "@/lib/types";

const crit = (p: Project) => validateProject(p, "Asha").issues.filter((i) => i.severity === "critical");
const codes = (p: Project) => validateProject(p, "Asha").issues.map((i) => i.code);
const without = (p: Project, a: string, b: string) => {
  const uidOf = (l: string) => p.parts.find((x) => x.label === l)!.uid;
  const [ap, apin] = a.split("."), [bp, bpin] = b.split(".");
  return { ...p, wires: p.wires.filter((w) => !((w.from.part === uidOf(ap) && w.from.pin === apin && w.to.part === uidOf(bp) && w.to.pin === bpin) || (w.to.part === uidOf(ap) && w.to.pin === apin && w.from.part === uidOf(bp) && w.from.pin === bpin))) };
};

describe("TEST 1 — 2WD robot with Uno, L298N, two DC motors, wheels and battery", () => {
  const p = reference2WD();
  it("has a powered, grounded circuit", () => {
    const g = buildGraph(p);
    const ctrl = p.parts.find((x) => x.label === "U1")!;
    const drv = p.parts.find((x) => x.label === "DRV1")!;
    expect(g.powered.has(ctrl.uid)).toBe(true);
    expect(g.powered.has(drv.uid)).toBe(true);
    expect(g.netOf.get(`${drv.uid}.VS`)!.voltage).toBeCloseTo(7.4, 1);
  });
  it("passes validation with no critical errors and real scores", () => {
    const r = validateProject(p, "Asha");
    expect(r.issues.filter((i) => i.severity === "critical")).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.scores.electrical).toBeGreaterThan(80);
    expect(r.checksRun).toBeGreaterThan(20);
    // the L298N voltage-drop suggestion is a real, expected engineering note
    expect(r.issues.some((i) => i.code === "S_L298N_DROP")).toBe(true);
  });
  it("produces a physics model with two driven wheels and a caster", () => {
    const { spec, notes } = buildRobotSpec(p);
    expect(spec.motors.length).toBe(2);
    expect(spec.wheels.filter((w) => w.motorId).length).toBe(2);
    expect(spec.casters.length).toBe(1);
    expect(spec.battery.nominalVoltage).toBeCloseTo(7.4, 1);
    expect(notes.problems).toEqual([]);
  });
});

describe("TEST 2 — line-following circuit with an IR array", () => {
  it("validates cleanly", () => {
    const p = referenceLineFollower();
    expect(crit(p)).toEqual([]);
    const { spec } = buildRobotSpec(p);
    const s = spec.sensors.find((x) => x.kind === "reflectance");
    expect(s && s.kind === "reflectance" && s.points.length).toBe(5);
  });
  it("detects an unwired sensor output", () => {
    const p = without(referenceLineFollower(), "S1.S3", "U1.A2");
    const w = validateProject(p, "Asha").issues.find((i) => i.code === "W_SENSOR_OUTPUT_UNCONNECTED");
    expect(w).toBeTruthy();
    expect(w!.incorrect).toContain("S3");
  });
});

describe("TEST 3 — incorrect motor driver wiring is identified", () => {
  it("missing common ground", () => {
    const p = without(reference2WD(), "DRV1.GND", "U1.GND1");
    const c = crit(p);
    const e = c.find((i) => i.code === "E_NO_COMMON_GROUND" || i.code === "E_MISSING_GROUND");
    expect(e).toBeTruthy();
    expect(e!.title).toContain("HEY ASHA!");
  });
  it("ENA on a non-PWM pin", () => {
    let p = without(reference2WD(), "U1.D5", "DRV1.ENA");
    p = wire(p, "U1.D4", "DRV1.ENA");
    const e = crit(p).find((i) => i.code === "E_PWM_ASSIGNMENT");
    expect(e).toBeTruthy();
    expect(e!.pinId).toBe("ENA");
  });
  it("IN1 not connected", () => {
    const p = without(reference2WD(), "U1.D7", "DRV1.IN1");
    expect(crit(p).map((i) => i.code)).toContain("E_DRIVER_INPUT_UNCONNECTED");
  });
  it("motor wired straight to a GPIO", () => {
    let p = without(reference2WD(), "DRV1.OUT1", "Left Motor.M+");
    p = wire(p, "U1.D3", "Left Motor.M+");
    expect(crit(p).map((i) => i.code)).toContain("E_MOTOR_ON_GPIO");
  });
  it("battery reversed into the driver", () => {
    let p = without(without(reference2WD(), "SW1.2", "DRV1.VS"), "BAT1.-", "DRV1.GND");
    p = wire(wire(p, "SW1.2", "DRV1.GND", "red"), "BAT1.-", "DRV1.VS", "black");
    const c = crit(p).map((i) => i.code);
    expect(c.some((x) => x === "E_REVERSE_POLARITY" || x === "E_SHORT_CIRCUIT")).toBe(true);
  });
  it("short circuit across the battery", () => {
    const p = wire(reference2WD(), "SW1.2", "DRV1.GND", "red");
    expect(crit(p).map((i) => i.code)).toContain("E_SHORT_CIRCUIT");
  });
  it("12 V into an L298N with the 5 V jumper is still fine, but 3S LiPo full charge is flagged", () => {
    let p = reference2WD();
    const bat = p.parts.find((x) => x.label === "BAT1")!;
    p = { ...p, parts: p.parts.map((x) => (x.uid === bat.uid ? { ...x, config: { ...x.config, series: 4 } } : x)) };
    const c = codes(p);
    expect(c).toContain("E_L298N_JUMPER_OVERVOLT");
    expect(c).toContain("E_OVERVOLTAGE"); // 16.8 V into Uno VIN (max 12)
  });
  it("scores drop with critical errors (computed, not random)", () => {
    const good = validateProject(reference2WD(), "a");
    const bad = validateProject(without(reference2WD(), "DRV1.GND", "U1.GND1"), "a");
    expect(bad.scores.overall).toBeLessThan(good.scores.overall);
    expect(validateProject(reference2WD(), "a").scores).toEqual(good.scores);
  });
});

describe("Sumo reference", () => {
  it("validates with no critical errors", () => {
    expect(crit(referenceSumo())).toEqual([]);
  });
});
