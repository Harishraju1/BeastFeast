import { describe, expect, it } from "vitest";
import { getComponent } from "@/lib/catalogue";
import { newProject } from "@/lib/robot/assembly";
import { reference2WD, wire } from "@/lib/robot/reference";
import { CORNERS, DEFAULT_4WD_PARAMS, apply4WDParams, check4WD, convertTo4WD, find4WD, mountingFor, read4WDParams, setup4WD } from "@/lib/robot/drivetrain4wd";
import { validateMechanics } from "@/lib/mech/validate";
import { buildRobotSpec } from "@/lib/robot/model";
import type { Project } from "@/lib/types";

const kinds = (p: Project, k: string) => p.parts.filter((x) => getComponent(x.componentId)?.kind === k);
const empty = () => newProject("race", "t", "me", { drivetrain: "none" });

describe("4WD drivetrain helper", () => {
  const p = setup4WD(empty(), { chassisId: "4wd-robot-chassis" });
  const dt = find4WD(p)!;

  it("places four motors and four wheels, no caster", () => {
    expect(kinds(p, "dc-motor")).toHaveLength(4);
    expect(kinds(p, "wheel")).toHaveLength(4);
    expect(kinds(p, "caster")).toHaveLength(0);
    expect(dt).not.toBeNull();
    expect(CORNERS.map((c) => dt.motors[c.key].label)).toEqual(["FL Motor", "FR Motor", "RL Motor", "RR Motor"]);
    expect(CORNERS.map((c) => dt.wheels[c.key].role)).toEqual(["front-left", "front-right", "rear-left", "rear-right"]);
  });

  it("mounts each wheel on its own motor", () => {
    const motorUids = CORNERS.map((c) => dt.wheels[c.key].attachedTo);
    expect(new Set(motorUids).size).toBe(4);
    for (const c of CORNERS) expect(dt.wheels[c.key].attachedTo).toBe(dt.motors[c.key].uid);
  });

  it("is symmetric about both axes with the default parameters", () => {
    const w = dt.wheels;
    expect(w.FL.position.y).toBeCloseTo(-w.FR.position.y, 6);
    expect(w.RL.position.y).toBeCloseTo(-w.RR.position.y, 6);
    expect(w.FL.position.x).toBeCloseTo(-w.RL.position.x, 6);
    expect(w.FL.position.x).toBeCloseTo(w.FR.position.x, 6);
    expect(w.FL.position.x - w.RL.position.x).toBeCloseTo(DEFAULT_4WD_PARAMS.wheelbase_mm, 6);
    expect(w.FL.position.y - w.FR.position.y).toBeCloseTo(DEFAULT_4WD_PARAMS.trackWidth_mm, 6);
    expect(check4WD(p)).toEqual([]);
  });

  it("mirrors the right motors so forward = all wheels forward", () => {
    expect(dt.motors.FL.rotation.z).toBe(0);
    expect(dt.motors.RL.rotation.z).toBe(0);
    expect(dt.motors.FR.rotation.z).toBeCloseTo(Math.PI, 6);
    expect(dt.motors.RR.rotation.z).toBeCloseTo(Math.PI, 6);
    const { spec, notes } = buildRobotSpec(p);
    expect(notes.motorMirrored[dt.motors.FR.uid]).toBe(true);
    expect(notes.motorMirrored[dt.motors.FL.uid]).toBe(false);
    expect(spec.wheels.filter((w) => w.motorId)).toHaveLength(4);
    expect(spec.casters).toHaveLength(0);
  });

  it("reads its parameters back and passes mechanical validation without a caster", () => {
    expect(read4WDParams(p)).toEqual(DEFAULT_4WD_PARAMS);
    const mech = validateMechanics(p, "T");
    expect(mech.issues.filter((i) => i.severity === "critical")).toEqual([]);
    expect(mech.issues.map((i) => i.code)).not.toContain("M_NO_THIRD_SUPPORT");
  });

  it("parameter changes reposition the same parts and keep uids, wires and config", () => {
    // wire the FL motor and give the RR motor a custom setting first
    let q = wire(p, "FL Motor.M+", "RR Motor.M-", "orange");
    q = { ...q, parts: q.parts.map((x) => (x.uid === dt.motors.RR.uid ? { ...x, config: { ...x.config, invert: true } } : x)) };
    const r = apply4WDParams(q, { wheelbase_mm: 120, trackWidth_mm: 200, wheelDiameter_mm: 85, wheelWidth_mm: 30, chassisLength_mm: 240, groundClearance_mm: 25 });
    expect(r.parts.map((x) => x.uid)).toEqual(q.parts.map((x) => x.uid));
    expect(r.wires).toEqual(q.wires);
    expect(r.parts.find((x) => x.uid === dt.motors.RR.uid)!.config.invert).toBe(true);
    const params = read4WDParams(r)!;
    expect(params.wheelbase_mm).toBe(120);
    expect(params.trackWidth_mm).toBe(200);
    expect(params.wheelDiameter_mm).toBe(85);
    expect(params.wheelWidth_mm).toBe(30);
    expect(params.chassisLength_mm).toBe(240);
    expect(params.groundClearance_mm).toBe(25);
    expect(r.chassis!.length_mm).toBe(240);
    expect(r.chassis!.groundClearance_mm).toBe(25);
    const w = find4WD(r)!.wheels;
    expect(w.FL.position.x).toBe(60);
    expect(w.FR.position.y).toBe(-100);
    expect(w.FL.config.diameter).toBe(85);
    // every wheel still sits on its own motor's axle
    for (const c of CORNERS) {
      const m = find4WD(r)!.motors[c.key];
      expect(w[c.key].attachedTo).toBe(m.uid);
      expect(w[c.key].position.x).toBe(m.position.x);
      expect(w[c.key].position.z).toBe(m.position.z);
    }
  });

  it("ground clearance picks a real mounting: motors on top of a low plate, or hanging under it", () => {
    const top = mountingFor(8, 40, 10, 3);
    expect(top.style).toBe("top");
    expect(top.clearance_mm).toBe(8);
    const under = mountingFor(30, 85, 25, 3);
    expect(under.style).toBe("under");
    expect(under.clearance_mm).toBe(30); // Ø85 wheel, 25 mm motor: housing bottom 42.5 − 12.5
    const limited = mountingFor(60, 65, 25, 3);
    expect(limited.clearance_mm).toBe(20);
    expect(limited.note).toMatch(/Limited to 20 mm/);
  });

  it("refuses to add a second drivetrain", () => {
    expect(() => setup4WD(p)).toThrow();
  });
});

describe("new projects", () => {
  for (const c of ["race", "sumo"] as const) {
    it(`${c} starts with a 4WD chassis and drivetrain (4 motors + 4 wheels, no caster)`, () => {
      const p = newProject(c, "x", "me");
      expect(find4WD(p)).not.toBeNull();
      expect(kinds(p, "dc-motor")).toHaveLength(4);
      expect(kinds(p, "wheel")).toHaveLength(4);
      expect(kinds(p, "caster")).toHaveLength(0);
      expect(p.chassis!.componentId).toBe(c === "race" ? "4wd-robot-chassis" : "mini-sumo-robot-chassis");
      expect(validateMechanics(p, "x").issues.filter((i) => i.severity === "critical")).toEqual([]);
    });
  }
  it("sumo default fits the mini-sumo plate size", () => {
    const p = newProject("sumo", "x", "me");
    expect(p.chassis!.length_mm).toBeLessThanOrEqual(100);
    expect(p.chassis!.width_mm).toBeLessThanOrEqual(100);
    expect(validateMechanics(p, "x").issues.map((i) => i.code)).not.toContain("M_SUMO_SIZE");
  });
  it("line following starts with a light 4WD drivetrain (4 motors + 4 wheels, no caster) on the line chassis", () => {
    const p = newProject("line", "x", "me");
    expect(find4WD(p)).not.toBeNull();
    expect(kinds(p, "dc-motor")).toHaveLength(4);
    expect(kinds(p, "wheel")).toHaveLength(4);
    expect(kinds(p, "caster")).toHaveLength(0);
    expect(p.chassis!.componentId).toBe("line-follower-chassis");
    const d = Number(find4WD(p)!.wheels.FL.config.diameter);
    expect(d).toBeGreaterThanOrEqual(42);
    expect(d).toBeLessThanOrEqual(65);
    expect(validateMechanics(p, "x").issues.filter((i) => i.severity === "critical")).toEqual([]);
  });
  it("drivetrain: none still gives an empty line project", () => {
    expect(newProject("line", "x", "me", { drivetrain: "none" }).parts).toEqual([]);
  });
});

describe("explicit 2WD → 4WD conversion", () => {
  it("keeps the existing motors, wheels and wires as the rear pair and removes the caster", () => {
    const two = reference2WD();
    const four = convertTo4WD(two);
    const dt = find4WD(four)!;
    expect(dt).not.toBeNull();
    const oldMotors = kinds(two, "dc-motor").map((m) => m.uid).sort();
    expect([dt.motors.RL.uid, dt.motors.RR.uid].sort()).toEqual(oldMotors);
    expect(four.wires).toEqual(two.wires);
    expect(kinds(four, "caster")).toHaveLength(0);
    expect(kinds(four, "dc-motor")).toHaveLength(4);
    expect(check4WD(four)).toEqual([]);
    // the original project object is untouched (undo restores it)
    expect(kinds(two, "caster")).toHaveLength(1);
    expect(kinds(two, "dc-motor")).toHaveLength(2);
  });
});

describe("4WD mechanical validation", () => {
  it("flags a 4WD robot whose wheels are not front and rear", () => {
    const p = setup4WD(empty(), { chassisId: "4wd-robot-chassis" });
    const dt = find4WD(p)!;
    const fl = dt.wheels.FL, flm = dt.motors.FL;
    // move the front-left corner back onto the rear axle
    const bad = { ...p, parts: p.parts.map((x) => (x.uid === fl.uid ? { ...x, position: { ...x.position, x: -75 } } : x.uid === flm.uid ? { ...x, position: { ...x.position, x: -75 } } : x)) };
    const codes = validateMechanics(bad, "x").issues.map((i) => i.code);
    expect(codes).toContain("M_4WD_AXLES");
  });
  it("flags three wheels on one side", () => {
    const p = setup4WD(empty(), { chassisId: "4wd-robot-chassis" });
    const dt = find4WD(p)!;
    const mv = (uid: string) => (x: Project["parts"][number]) => (x.uid === uid ? { ...x, role: undefined, position: { ...x.position, y: -x.position.y } } : { ...x, role: undefined });
    let bad = { ...p, parts: p.parts.map(mv(dt.wheels.FL.uid)) };
    bad = { ...bad, parts: bad.parts.map(mv(dt.motors.FL.uid)) };
    expect(validateMechanics(bad, "x").issues.map((i) => i.code)).toContain("M_4WD_SIDES");
  });
  it("warns when the wheels are not symmetrical", () => {
    const p = setup4WD(empty(), { chassisId: "4wd-robot-chassis" });
    const dt = find4WD(p)!;
    const bad = { ...p, parts: p.parts.map((x) => (x.uid === dt.wheels.FR.uid ? { ...x, position: { ...x.position, y: x.position.y - 12 } } : x)) };
    expect(validateMechanics(bad, "x").issues.find((i) => i.code === "M_4WD_SYMMETRY")?.severity).toBe("warning");
  });
});
