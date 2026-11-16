import { describe, expect, it } from "vitest";
import { SimWorld } from "@/lib/sim/world";
import { makeDiffDriveRobot, reflectanceArray } from "@/lib/sim/presets";
import { createOpponent } from "@/lib/sim/opponent";
import { compileTrack } from "@/lib/track/compile";
import { EXAMPLE_TRACKS, sumoOpponentPose } from "@/lib/track/examples";
import type { MotorCommands } from "@/lib/sim/types";

function realtimeFactor(run: () => number): number {
  const t0 = performance.now();
  const simSeconds = run();
  const wall = (performance.now() - t0) / 1000;
  return simSeconds / wall;
}

describe("performance (dt = 1 ms)", () => {
  it("1 robot on a line track with a 5-sensor array read at 500 Hz runs ≥ 20× real time", () => {
    const def = EXAMPLE_TRACKS.find((t) => t.id === "example-line-beginner-oval")!;
    const track = compileTrack(def);
    const spec = makeDiffDriveRobot({ sensors: [reflectanceArray("line", 0.07, 5, 0.012)], withOdometry: true });
    const w = new SimWorld(track, [{ spec, pose: def.start }]);
    const physicsOnly = realtimeFactor(() => {
      w.stepFor(20, () => [{ L: 3, R: 3.2 }]);
      return 20;
    });
    w.reset();
    const withSensors = realtimeFactor(() => {
      for (let k = 0; k < 20000; k++) {
        if (k % 2 === 0) w.readSensors(0);
        w.step([{ L: 3, R: 3.2 }]);
      }
      return 20;
    });
    console.log(`[perf] 1 robot: physics only ${physicsOnly.toFixed(0)}× real time, with sensors @500 Hz ${withSensors.toFixed(0)}×`);
    expect(physicsOnly).toBeGreaterThan(20);
    expect(withSensors).toBeGreaterThan(20);
  });

  it("2 robots (sumo, opponent AI + sensors) runs ≥ 10× real time", () => {
    const def = EXAMPLE_TRACKS.find((t) => t.id === "example-sumo-standard-dohyo")!;
    const a = createOpponent("advanced", { id: "a" });
    const b = createOpponent("beast", { id: "b" });
    const w = new SimWorld(compileTrack(def), [
      { spec: a.spec, pose: { x: -0.25, y: 0.1, heading: 2 } },
      { spec: b.spec, pose: sumoOpponentPose(def) },
    ]);
    let ca: MotorCommands = {};
    let cb: MotorCommands = {};
    const physicsOnly = realtimeFactor(() => {
      w.stepFor(20, () => [{ L: 2, R: -2 }, { L: -2, R: 2 }]);
      return 20;
    });
    w.reset();
    const withAi = realtimeFactor(() => {
      for (let k = 0; k < 20000; k++) {
        if (k % 2 === 0) {
          ca = a.controller(w.readSensors(0), w.telemetry(0), { t: w.time });
          cb = b.controller(w.readSensors(1), w.telemetry(1), { t: w.time });
        }
        w.step([ca, cb]);
      }
      return 20;
    });
    console.log(`[perf] 2 robots: physics only ${physicsOnly.toFixed(0)}× real time, with sensors + AI @500 Hz ${withAi.toFixed(0)}×`);
    expect(physicsOnly).toBeGreaterThan(10);
    expect(withAi).toBeGreaterThan(10);
  });

  it("two-robot runs are deterministic", () => {
    const run = () => {
      const def = EXAMPLE_TRACKS.find((t) => t.id === "example-sumo-standard-dohyo")!;
      const a = createOpponent("intermediate", { id: "a" });
      const b = createOpponent("advanced", { id: "b" });
      const w = new SimWorld(compileTrack(def), [
        { spec: a.spec, pose: def.start },
        { spec: b.spec, pose: sumoOpponentPose(def) },
      ]);
      let ca: MotorCommands = {};
      let cb: MotorCommands = {};
      for (let k = 0; k < 5000; k++) {
        if (k % 2 === 0) {
          ca = a.controller(w.readSensors(0), w.telemetry(0), { t: w.time });
          cb = b.controller(w.readSensors(1), w.telemetry(1), { t: w.time });
        }
        w.step([ca, cb]);
      }
      return [w.telemetry(0).pose, w.telemetry(1).pose, w.events.length];
    };
    expect(run()).toEqual(run());
  });
});
