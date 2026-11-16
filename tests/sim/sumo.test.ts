import { describe, expect, it } from "vitest";
import { SimWorld } from "@/lib/sim/world";
import { makeDiffDriveRobot } from "@/lib/sim/presets";
import { createOpponent, type OpponentLevel } from "@/lib/sim/opponent";
import { compileTrack } from "@/lib/track/compile";
import { EXAMPLE_TRACKS, sumoOpponentPose } from "@/lib/track/examples";
import type { MotorCommands } from "@/lib/sim/types";

const dohyoDef = EXAMPLE_TRACKS.find((t) => t.id === "example-sumo-standard-dohyo")!;
const dohyo = compileTrack(dohyoDef);

const miniSumo = (id: string, massKg: number, stallTorqueNm: number) =>
  makeDiffDriveRobot({
    id,
    massKg,
    length: 0.1,
    width: 0.1,
    track: 0.085,
    wheelRadius: 0.02,
    wheelWidth: 0.014,
    casters: [-0.04],
    motor: { stallTorqueNm, noLoadRpm: 300 },
  });

describe("sumo", () => {
  it("head-on push: heavier / higher-torque robot wins, ring-out detected", () => {
    const strong = miniSumo("strong", 0.5, 0.2);
    const weak = miniSumo("weak", 0.25, 0.08);
    const w = new SimWorld(dohyo, [
      { spec: strong, pose: { x: -0.1, y: 0, heading: 0 } },
      { spec: weak, pose: { x: 0.1, y: 0, heading: Math.PI } },
    ]);
    for (let k = 0; k < 10000 && !w.events.some((e) => e.type === "ring-out"); k++) w.step([{ L: 6, R: 6 }, { L: 6, R: 6 }]);
    const outs = w.events.filter((e) => e.type === "ring-out");
    expect(outs).toHaveLength(1);
    expect(outs[0].robot).toBe(1);
    expect(w.telemetry(1).out).toBe(true);
    expect(w.telemetry(0).out).toBe(false);
    expect(w.events.some((e) => e.type === "collision" && e.robot === 0 && e.detail === "robot")).toBe(true);
    // stays reported once
    w.stepFor(0.5, (): MotorCommands[] => [{ L: 6, R: 6 }, {}]);
    expect(w.events.filter((e) => e.type === "ring-out" && e.robot === 1)).toHaveLength(1);
  });

  it("equal robots pushing head-on reach a stalemate near the centre", () => {
    const a = miniSumo("a", 0.4, 0.15);
    const b = miniSumo("b", 0.4, 0.15);
    const w = new SimWorld(dohyo, [
      { spec: a, pose: { x: -0.1, y: 0, heading: 0 } },
      { spec: b, pose: { x: 0.1, y: 0, heading: Math.PI } },
    ]);
    w.stepFor(3, () => [{ L: 6, R: 6 }, { L: 6, R: 6 }]);
    expect(w.events.some((e) => e.type === "ring-out")).toBe(false);
    expect(Math.abs(w.telemetry(0).pose.x + w.telemetry(1).pose.x)).toBeLessThan(0.02);
  });

  it("a wedge lifts the opponent and wins an otherwise equal push", () => {
    const a = { ...miniSumo("a", 0.4, 0.15), wedge: 0.4 };
    const b = miniSumo("b", 0.4, 0.15);
    const w = new SimWorld(dohyo, [
      { spec: a, pose: { x: -0.1, y: 0, heading: 0 } },
      { spec: b, pose: { x: 0.1, y: 0, heading: Math.PI } },
    ]);
    w.stepFor(0.6, () => [{ L: 6, R: 6 }, { L: 6, R: 6 }]);
    const lifted = w.body(1).wheelLoad[0];
    expect(lifted).toBeLessThan(0.65 * w.body(1).staticWheelLoad[0]);
    for (let k = 0; k < 8000 && !w.events.some((e) => e.type === "ring-out"); k++) w.step([{ L: 6, R: 6 }, { L: 6, R: 6 }]);
    expect(w.events.find((e) => e.type === "ring-out")?.robot).toBe(1);
  });

  const fight = (level: OpponentLevel, seconds: number) => {
    const opp = createOpponent(level);
    const dummy = miniSumo("dummy", 0.4, 0.1);
    const w = new SimWorld(dohyo, [
      { spec: dummy, pose: dohyoDef.start },
      { spec: opp.spec, pose: sumoOpponentPose(dohyoDef) },
    ]);
    const states = new Set<string>();
    let cmd: MotorCommands = {};
    for (let k = 0; k < seconds * 1000; k++) {
      if (k % 2 === 0) {
        // the opponent only gets its OWN sensor readings
        cmd = opp.controller(w.readSensors(1), w.telemetry(1), { t: w.time });
        states.add(opp.getState());
      }
      w.step([{ L: 0, R: 0 }, cmd]); // dummy: passive, motors shorted (braking)
      if (w.events.some((e) => e.type === "ring-out")) break;
    }
    return { w, states };
  };

  it("intermediate opponent pushes a passive dummy out within 60 s", () => {
    const { w, states } = fight("intermediate", 60);
    const out = w.events.find((e) => e.type === "ring-out");
    expect(out).toBeTruthy();
    expect(out!.robot).toBe(0);
    expect(out!.t).toBeLessThan(60);
    expect(states.has("attack")).toBe(true);
  });

  it("opponent searches when nothing is in front, and avoids the edge on its own", () => {
    const opp = createOpponent("beginner");
    // alone in the ring, facing away from the centre near the edge
    const w = new SimWorld(dohyo, [{ spec: opp.spec, pose: { x: 0.2, y: 0, heading: 0 } }]);
    const states = new Set<string>();
    let cmd: MotorCommands = {};
    for (let k = 0; k < 20000; k++) {
      if (k % 2 === 0) {
        cmd = opp.controller(w.readSensors(0), w.telemetry(0), { t: w.time });
        states.add(opp.getState());
      }
      w.step([cmd]);
    }
    expect(states.has("search")).toBe(true);
    expect(w.events.some((e) => e.type === "ring-out")).toBe(false);
  });

  for (const level of ["beginner", "advanced", "beast"] as OpponentLevel[]) {
    it(`${level} opponent spec is a legal mini-sumo and its controller runs`, () => {
      const o = createOpponent(level);
      expect(o.spec.length).toBeLessThanOrEqual(0.1);
      expect(o.spec.width).toBeLessThanOrEqual(0.1);
      expect(o.spec.massKg).toBeLessThanOrEqual(0.5);
      const w = new SimWorld(dohyo, [{ spec: o.spec, pose: { x: 0, y: 0, heading: 0 } }]);
      const c = o.controller(w.readSensors(0), w.telemetry(0), { t: 0 });
      expect(Object.keys(c).sort()).toEqual(["L", "R"]);
    });
  }
});
