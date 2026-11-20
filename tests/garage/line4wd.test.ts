/**
 * The line followers are 4WD skid-steer robots (v2.0.0): four motors, four wheels, no caster, each wheel on
 * its own motor, symmetrical; the left pair in parallel on one driver channel and the right pair on the other.
 * New line projects start with a 4WD drivetrain too.
 */
import { describe, expect, it } from "vitest";
import { buildFromTemplate, getTemplate } from "@/lib/garage";
import { getComponent } from "@/lib/catalogue";
import { validateProject } from "@/lib/circuit/validate";
import { CORNERS, check4WD, find4WD, motorDriverChannel, read4WDParams } from "@/lib/robot/drivetrain4wd";
import { LINE_4WD_SETUP, newProject } from "@/lib/robot/assembly";
import { validateMechanics } from "@/lib/mech/validate";
import { RobotElectrical } from "@/lib/robot/bridge";
import type { Project } from "@/lib/types";
import { studentLineFollower4WD } from "./line-robots";

const LF = ["LF-01", "LF-02", "LF-03"];
const ofKind = (p: Project, kind: string) => p.parts.filter((x) => getComponent(x.componentId)?.kind === kind);

describe("LF-01 / LF-02 / LF-03 are 4WD", () => {
  for (const id of LF) {
    it(`${id}: 4 wheels, 4 motors, no caster, each wheel on its own motor, symmetrical`, () => {
      const t = getTemplate(id)!;
      expect(t.metadata.version).toBe("2.0.0");
      expect(t.metadata.drivetrain).toBe("4WD");
      expect(t.metadata.legacy).toBeFalsy();
      expect(t.metadata.description).toMatch(/4WD/);
      expect(t.metadata.description).not.toMatch(/2WD|caster/i);
      // the texts only mention 2WD / casters as the comparison ("than a 2WD robot on/with a caster")
      for (const text of [t.metadata.workingPrinciple, ...t.metadata.limitations]) expect(text.replace(/2WD robot (on|with) a caster/g, "")).not.toMatch(/2WD|caster/i);
      const p = buildFromTemplate(t, "x", "original");
      expect(ofKind(p, "dc-motor")).toHaveLength(4);
      expect(ofKind(p, "wheel")).toHaveLength(4);
      expect(ofKind(p, "caster")).toHaveLength(0);
      const motors = new Set(ofKind(p, "dc-motor").map((m) => m.uid));
      const mounts = ofKind(p, "wheel").map((w) => w.attachedTo);
      expect(new Set(mounts).size).toBe(4);
      for (const m of mounts) expect(motors.has(m!)).toBe(true);
      const dt = find4WD(p)!;
      expect(dt).not.toBeNull();
      expect(check4WD(p)).toEqual([]);
      for (const c of CORNERS) {
        expect(dt.wheels[c.key].role).toBe(c.role);
        expect(dt.motors[c.key].role).toBe(c.role);
      }
      // mirror symmetry: FL ↔ FR and RL ↔ RR
      const w = dt.wheels;
      for (const [a, b] of [["FL", "FR"], ["RL", "RR"]] as const) {
        expect(w[a].position.x).toBeCloseTo(w[b].position.x, 5);
        expect(w[a].position.y).toBeCloseTo(-w[b].position.y, 5);
        expect(w[a].position.z).toBeCloseTo(w[b].position.z, 5);
      }
      expect(w.FL.position.x).toBeCloseTo(-w.RL.position.x, 5);
      const params = read4WDParams(p)!;
      expect(params.wheelbase_mm).toBeGreaterThan(params.wheelDiameter_mm);
      expect(params.trackWidth_mm).toBeGreaterThan(params.wheelbase_mm);
      // the sensor array is still at the front, ahead of the front axle
      const sensors = p.parts.filter((x) => getComponent(x.componentId)?.sensor?.kind?.startsWith("reflectance"));
      expect(sensors.length).toBeGreaterThan(0);
      for (const s of sensors) expect(s.position.x).toBeGreaterThan(w.FL.position.x + 20);
    });

    it(`${id}: left pair in parallel on channel A, right pair on channel B; circuit and mechanics validate cleanly`, () => {
      const p = buildFromTemplate(getTemplate(id)!, "x", "original");
      const dt = find4WD(p)!;
      const ch = (c: "FL" | "FR" | "RL" | "RR") => motorDriverChannel(p, dt.motors[c].uid);
      expect([ch("FL"), ch("RL")]).toEqual(["DRV1 channel A", "DRV1 channel A"]);
      expect([ch("FR"), ch("RR")]).toEqual(["DRV1 channel B", "DRV1 channel B"]);
      const r = validateProject(p, "x");
      expect(r.issues.filter((i) => i.severity !== "suggestion").map((i) => `${i.code}: ${i.incorrect ?? i.title}`)).toEqual([]);
    });
  }
});

describe("two motors on one driver output", () => {
  it("the bridge drives both motors of a pair with the same voltage", () => {
    const p = buildFromTemplate(getTemplate("LF-02")!, "x", "original");
    const dt = find4WD(p)!;
    const el = new RobotElectrical(p);
    // TB6612: STBY tied to 5 V; left forward at full PWM, right backwards at half
    el.pinMode(5, "OUTPUT"); el.pinMode(7, "OUTPUT"); el.pinMode(8, "OUTPUT");
    el.pinMode(6, "OUTPUT"); el.pinMode(9, "OUTPUT"); el.pinMode(10, "OUTPUT");
    el.digitalWrite(7, 1); el.digitalWrite(8, 0); el.analogWrite(5, 255);
    el.digitalWrite(9, 0); el.digitalWrite(10, 1); el.analogWrite(6, 128);
    const v = el.motorCommands();
    const fl = v[dt.motors.FL.uid], rl = v[dt.motors.RL.uid], fr = v[dt.motors.FR.uid], rr = v[dt.motors.RR.uid];
    expect(Math.abs(fl)).toBeGreaterThan(5);
    expect(rl).toBeCloseTo(fl, 9);
    expect(rr).toBeCloseTo(fr, 9);
    // right motors are mirrored with swapped leads: a backwards command gives a positive terminal voltage
    expect(fr).toBeGreaterThan(0);
    expect(Math.abs(fr)).toBeCloseTo(Math.abs(fl) * (128 / 255), 1);
  });

  it("warns when motors in parallel can together draw more than the channel's peak current", () => {
    const p = studentLineFollower4WD();
    expect(validateProject(p, "x").issues.map((i) => i.code)).not.toContain("W_DRIVER_CURRENT");
    // swap the four TT motors (1.5 A stall) for 25GA370s (2 A): 2 × 2 A > the L298N's 3 A peak per channel
    const big: Project = { ...p, parts: p.parts.map((x) => (getComponent(x.componentId)?.kind === "dc-motor" ? { ...x, componentId: "25ga370-gear-motor" } : x)) };
    const issues = validateProject(big, "x").issues.filter((i) => i.code === "W_DRIVER_CURRENT");
    expect(issues).toHaveLength(2); // channel A and channel B
    expect(issues[0].incorrect).toMatch(/FL Motor \+ RL Motor|FR Motor \+ RR Motor/);
  });
});

describe("new line projects", () => {
  it("start with a 4WD drivetrain on the light line chassis (4 motors + 4 wheels, no caster)", () => {
    const p = newProject("line", "x", "me");
    expect(find4WD(p)).not.toBeNull();
    expect(ofKind(p, "dc-motor")).toHaveLength(4);
    expect(ofKind(p, "wheel")).toHaveLength(4);
    expect(ofKind(p, "caster")).toHaveLength(0);
    expect(p.chassis!.componentId).toBe("line-follower-chassis");
    const params = read4WDParams(p)!;
    expect(params.wheelDiameter_mm).toBeGreaterThanOrEqual(42);
    expect(params.wheelDiameter_mm).toBeLessThanOrEqual(65);
    expect(params).toMatchObject({ wheelbase_mm: LINE_4WD_SETUP.params!.wheelbase_mm, trackWidth_mm: LINE_4WD_SETUP.params!.trackWidth_mm });
    expect(check4WD(p)).toEqual([]);
    expect(validateMechanics(p, "x").issues.filter((i) => i.severity === "critical")).toEqual([]);
  });

  it("Garage templates and reference robots still start empty with drivetrain: none", () => {
    expect(newProject("line", "x", "me", { drivetrain: "none" }).parts).toEqual([]);
  });

  it("a student 4WD line robot with the line-basic pins validates without errors", () => {
    const r = validateProject(studentLineFollower4WD(), "x");
    expect(r.issues.filter((i) => i.severity === "critical").map((i) => i.code)).toEqual([]);
  });
});
