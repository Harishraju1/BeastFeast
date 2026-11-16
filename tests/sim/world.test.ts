import { describe, expect, it } from "vitest";
import { SimWorld } from "@/lib/sim/world";
import { makeDiffDriveRobot, reflectanceArray } from "@/lib/sim/presets";
import { compileTrack } from "@/lib/track/compile";
import { EXAMPLE_TRACKS } from "@/lib/track/examples";
import { buildFloor } from "@/lib/sim/sensors";
import type { MotorCommands, SensorReading, TrackPiece, Vec2 } from "@/lib/sim/types";
import { projectOnPolyline } from "@/lib/sim/geom";
import { flatTrack } from "./helpers";

const byId = (id: string) => EXAMPLE_TRACKS.find((t) => t.id === id)!;

/**
 * A plain proportional(-derivative) line follower written like student code: it ONLY looks at its
 * reflectance array and outputs motor voltages.
 */
function makeLineFollower(spacing: number) {
  let lastErr = 0;
  return (r: SensorReading): MotorCommands => {
    if (r.kind !== "reflectance") throw new Error("expected reflectance");
    const d = r.darkness;
    const n = d.length;
    let sum = 0;
    let wsum = 0;
    for (let i = 0; i < n; i++) {
      const y = ((n - 1) / 2 - i) * spacing; // + = left
      sum += d[i];
      wsum += d[i] * y;
    }
    let err: number;
    if (sum < 0.2) err = Math.sign(lastErr) * spacing * 2.5; // lost: keep turning towards last seen side
    else err = wsum / sum;
    const dErr = err - lastErr;
    lastErr = err;
    const base = 3.0;
    const turn = 70 * err + 4000 * dErr;
    return { L: base - turn, R: base + turn };
  };
}

describe("closed-loop line following (sensors ⇄ physics)", () => {
  it("a P-controller completes a lap of the beginner line oval using only its sensors", () => {
    const def = byId("example-line-beginner-oval");
    const track = compileTrack(def);
    const spacing = 0.012;
    const spec = makeDiffDriveRobot({ sensors: [reflectanceArray("line", 0.07, 5, spacing)] });
    const world = new SimWorld(track, [{ spec, pose: def.start }]);
    const follower = makeLineFollower(spacing);
    const line = track.lines.map((l) => l.points);
    const nearestLine = (p: Vec2) => Math.min(...line.map((pl) => projectOnPolyline(p, pl).d));

    let samples = 0;
    let within = 0;
    let lapAt = -1;
    let cmd: MotorCommands = { L: 0, R: 0 };
    for (let k = 0; k < 30000 && lapAt < 0; k++) {
      // controller runs at 500 Hz, physics at 1 kHz
      if (k % 2 === 0) cmd = follower(world.readSensors(0).line);
      world.step([cmd]);
      if (k % 10 === 0) {
        samples++;
        if (nearestLine(world.telemetry(0).pose) < 0.03) within++;
      }
      const lap = world.events.find((e) => e.type === "lap");
      if (lap) lapAt = lap.t;
    }
    expect(lapAt).toBeGreaterThan(0);
    expect(within / samples).toBeGreaterThan(0.95);
    const t = world.telemetry(0);
    expect(t.race.lap).toBe(1);
    expect(t.distance).toBeGreaterThan(5.5); // lap length ≈ 2 + 2π·0.6 = 5.77 m
    expect(world.events.some((e) => e.type === "finish")).toBe(true); // def.laps = 1
  });

  it("the same controller without sensors (blind) does NOT follow the line", () => {
    const def = byId("example-line-beginner-oval");
    const world = new SimWorld(compileTrack(def), [{ spec: makeDiffDriveRobot(), pose: def.start }]);
    world.stepFor(8, () => [{ L: 3, R: 3 }]);
    expect(world.events.some((e) => e.type === "lap")).toBe(false);
    expect(world.telemetry(0).onTrack).toBe(false);
    expect(world.events.some((e) => e.type === "off-track")).toBe(true);
  });
});

/** Scripted pure-pursuit driver on ground truth (test harness only – not robot code). */
function purePursuit(world: SimWorld, path: Vec2[], lookahead: number, baseV: number) {
  const total = path.length;
  return (): MotorCommands => {
    const p = world.telemetry(0).pose;
    const pr = projectOnPolyline(p, path);
    let i = pr.seg;
    let acc = 0;
    while (acc < lookahead) {
      const a = path[i % total];
      const b = path[(i + 1) % total];
      acc += Math.hypot(b.x - a.x, b.y - a.y);
      i++;
    }
    const target = path[i % total];
    const ang = Math.atan2(target.y - p.y, target.x - p.x) - p.heading;
    const e = Math.atan2(Math.sin(ang), Math.cos(ang));
    const turn = 4 * e;
    return { L: baseV - turn, R: baseV + turn };
  };
}

describe("race logic", () => {
  it("detects laps on the beginner oval with checkpoints in order", () => {
    const def = byId("example-race-beginner-oval");
    const track = compileTrack(def);
    const path = track.roads.flatMap((r) => r.points);
    const world = new SimWorld(track, [{ spec: makeDiffDriveRobot(), pose: def.start }]);
    const drive = purePursuit(world, path, 0.15, 4.5);
    world.stepFor(40, () => [drive()]);
    const ev = world.events;
    const laps = ev.filter((e) => e.type === "lap");
    expect(laps.length).toBeGreaterThanOrEqual(2);
    const cps = ev.filter((e) => e.type === "checkpoint").map((e) => e.value);
    expect(cps.slice(0, 4)).toEqual([0, 1, 0, 1]);
    // lap time ≈ length / speed
    const len = track.roads.reduce((s, r) => s + r.points.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - r.points[i].x, p.y - r.points[i].y), 0), 0);
    expect(laps[1].value!).toBeGreaterThan(len / 0.7);
    expect(laps[1].value!).toBeLessThan(len / 0.3);
    expect(world.events.filter((e) => e.type === "off-track")).toHaveLength(0);
    const st = world.raceStatus(0);
    expect(st.progress).toBeGreaterThanOrEqual(0);
    expect(st.progress).toBeLessThan(1);
  });

  const straightRace = (cpXs: number[]): ReturnType<typeof compileTrack> => {
    const pieces: TrackPiece[] = [
      { id: "s", type: "straight", x: -1.5, y: 0, rotation: 0, params: { length: 3 } },
      ...cpXs.map((x, i) => ({ id: `c${i}`, type: "checkpoint" as const, x, y: 0, rotation: 0, params: {} })),
      { id: "f", type: "finish", x: 1.2, y: 0, rotation: 0, params: {} },
    ];
    return flatTrack(pieces, 4, "race");
  };

  it("enforces checkpoint order", () => {
    // checkpoint 0 at x=0.8, checkpoint 1 at x=-0.2 → robot meets #1 first: ignored, so no lap at the finish
    const w = new SimWorld(straightRace([0.8, -0.2]), [{ spec: makeDiffDriveRobot(), pose: { x: -1.2, y: 0, heading: 0 } }]);
    w.stepFor(4.5, () => [{ L: 6, R: 6 }]);
    expect(w.events.filter((e) => e.type === "checkpoint").map((e) => e.value)).toEqual([0]);
    expect(w.events.some((e) => e.type === "lap")).toBe(false);
    // in order → lap counted
    const w2 = new SimWorld(straightRace([-0.2, 0.8]), [{ spec: makeDiffDriveRobot(), pose: { x: -1.2, y: 0, heading: 0 } }]);
    w2.stepFor(4.5, () => [{ L: 6, R: 6 }]);
    expect(w2.events.filter((e) => e.type === "checkpoint").map((e) => e.value)).toEqual([0, 1]);
    expect(w2.events.filter((e) => e.type === "lap")).toHaveLength(1);
  });

  it("reports off-track / back-on-track", () => {
    const w = new SimWorld(straightRace([]), [{ spec: makeDiffDriveRobot(), pose: { x: -1, y: 0, heading: 0.6 } }]);
    w.stepFor(1, () => [{ L: 4, R: 4 }]);
    expect(w.events.some((e) => e.type === "off-track")).toBe(true);
    w.setPose(0, { x: 0, y: 0, heading: 0 });
    w.step([{}]);
    expect(w.events.some((e) => e.type === "back-on-track")).toBe(true);
  });
});

describe("world API", () => {
  it("snapshot, reset, drainEvents", () => {
    const w = new SimWorld(flatTrack([], 2), [{ spec: makeDiffDriveRobot(), pose: { x: 0, y: 0, heading: 0 } }]);
    w.stepFor(3, () => [{ L: 6, R: 6 }]);
    const snap = w.getSnapshot();
    expect(snap.robots[0].wheelAngles.wl).toBeGreaterThan(1);
    expect(snap.t).toBeCloseTo(3, 9);
    const ev = w.drainEvents();
    expect(ev.some((e) => e.type === "collision")).toBe(true);
    expect(w.drainEvents()).toHaveLength(0);
    w.reset();
    expect(w.time).toBe(0);
    expect(w.telemetry(0).pose).toEqual({ x: 0, y: 0, heading: 0 });
    expect(w.events).toHaveLength(0);
  });

  it("floor model is cached per compiled track", () => {
    const t = flatTrack();
    expect(buildFloor(t)).toBe(buildFloor(t));
  });

  it("obstacle collision stops the robot", () => {
    const track = flatTrack([{ id: "o", type: "obstacle", x: 0.4, y: 0, rotation: 0, params: { width: 0.06, shape: "cylinder" } }], 3);
    const w = new SimWorld(track, [{ spec: makeDiffDriveRobot(), pose: { x: 0, y: 0, heading: 0 } }]);
    w.stepFor(2, () => [{ L: 5, R: 5 }]);
    const t = w.telemetry(0);
    expect(t.pose.x + 0.075).toBeLessThan(0.4 - 0.03 + 0.003);
    expect(w.events.filter((e) => e.type === "collision")[0].detail).toBe("obstacle");
  });
});
