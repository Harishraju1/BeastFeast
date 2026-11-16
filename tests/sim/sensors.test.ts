import { describe, expect, it } from "vitest";
import { SimWorld } from "@/lib/sim/world";
import { makeDiffDriveRobot, reflectanceArray } from "@/lib/sim/presets";
import { buildFloor, bumperPressed, castRay, distanceReading, floorDarknessAt, PolylineIndex, reflectanceAt } from "@/lib/sim/sensors";
import { compileTrack } from "@/lib/track/compile";
import { EXAMPLE_TRACKS } from "@/lib/track/examples";
import type { SensorReading } from "@/lib/sim/types";
import { flatTrack } from "./helpers";

const lineTrack = () => flatTrack([{ id: "l", type: "line-straight", x: -2, y: 0, rotation: 0, params: { length: 4 } }], 6);

function darkness(r: SensorReading): number[] {
  if (r.kind !== "reflectance") throw new Error("not reflectance");
  return r.darkness;
}

describe("PolylineIndex", () => {
  const idx = new PolylineIndex([{ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], width: 0.02 }]);
  it("covered / nearest", () => {
    expect(idx.covered(0.5, 0.005)).toBe(true);
    expect(idx.covered(0.5, 0.02)).toBe(false);
    const h = idx.nearest(1.1, 0.5, 0.3)!;
    expect(h.d).toBeCloseTo(0.1, 6);
    expect(h.s).toBeCloseTo(1.5, 6);
    expect(idx.nearest(3, 3, 0.2)).toBeNull();
    expect(idx.nearest(3, 3)!.d).toBeGreaterThan(2);
    expect(idx.totalLength).toBeCloseTo(2, 9);
  });
});

describe("reflectance", () => {
  const floor = buildFloor(lineTrack());
  it("reads ~1 centred on a line and 0 on white", () => {
    expect(reflectanceAt(floor, 0, 0, 0.004)).toBeCloseTo(1, 6);
    expect(reflectanceAt(floor, 0, 0.1, 0.004)).toBe(0);
  });
  it("reads partial coverage on the line edge", () => {
    const edge = reflectanceAt(floor, 0, 0.0095, 0.004);
    expect(edge).toBeGreaterThan(0.3);
    expect(edge).toBeLessThan(0.7);
  });
  it("sumo floor: black ring, white border, outside = 1", () => {
    const sumo = buildFloor(compileTrack(EXAMPLE_TRACKS.find((t) => t.kind === "sumo" && t.arena?.shape === "circle")!));
    expect(floorDarknessAt(sumo, 0, 0)).toBe(1);
    expect(floorDarknessAt(sumo, 0.375, 0)).toBe(0);
    expect(floorDarknessAt(sumo, 0, -0.37)).toBe(0);
    expect(floorDarknessAt(sumo, 0.5, 0)).toBe(1);
  });
  it("race floor: road 0.85, off-road 0.15", () => {
    const race = buildFloor(compileTrack(EXAMPLE_TRACKS.find((t) => t.kind === "race")!));
    expect(floorDarknessAt(race, -0.5, -0.55)).toBe(0.85);
    expect(floorDarknessAt(race, 0, 0)).toBe(0.15);
  });
  it("array readings shift as the robot moves sideways", () => {
    const spec = makeDiffDriveRobot({ sensors: [reflectanceArray("line", 0.07, 5, 0.012)] });
    const w = new SimWorld(lineTrack(), [{ spec, pose: { x: 0, y: 0, heading: 0 } }]);
    const centred = darkness(w.readSensors(0).line);
    expect(centred[2]).toBeCloseTo(1, 6);
    expect(centred[0]).toBe(0);
    expect(centred[4]).toBe(0);
    // robot 12 mm to the left of the line → line appears under the right-hand sensor (index 3)
    w.setPose(0, { x: 0, y: 0.012, heading: 0 });
    const left = darkness(w.readSensors(0).line);
    expect(left[3]).toBeCloseTo(1, 6);
    expect(left[2]).toBeLessThan(0.5);
    w.setPose(0, { x: 0, y: -0.024, heading: 0 });
    const right = darkness(w.readSensors(0).line);
    expect(right[0]).toBeCloseTo(1, 6);
    expect(right[2]).toBe(0);
  });
});

describe("distance raycast", () => {
  const track = flatTrack([{ id: "o", type: "obstacle", x: 0.6, y: 0, rotation: 0, params: { width: 0.1, depth: 0.1, shape: "box" } }], 4);
  it("castRay hits a box at the right distance", () => {
    const scene = { walls: track.walls, obstacles: track.obstacles, robots: [] };
    expect(castRay(scene, 0, 0, 1, 0)).toBeCloseTo(0.55, 9);
    expect(distanceReading(scene, 0, 0, 0, 20, 0.02, 2)).toBeCloseTo(0.55, 9);
    expect(distanceReading(scene, 0, 0, 0, 20, 0.02, 0.5)).toBeNull();
    expect(distanceReading(scene, 0.54, 0, 0, 20, 0.03, 2)).toBe(0.03); // saturates at minRange
    // wall (capsule surface) at x = 2 - 0.01
    expect(distanceReading(scene, 0, 0, Math.PI, 0, 0.02, 3)).toBeCloseTo(1.99, 9);
  });
  it("robot-mounted ultrasonic measures an obstacle within ±1 cm", () => {
    const spec = makeDiffDriveRobot({
      sensors: [{ id: "us", kind: "distance", x: 0.075, y: 0, angle: 0, fovDeg: 15, minRange: 0.02, maxRange: 2 }],
    });
    const w = new SimWorld(track, [{ spec, pose: { x: -0.4, y: 0.01, heading: 0 } }]);
    const r = w.readSensors(0).us;
    expect(r.kind === "distance" && r.distance).toBeTruthy();
    // sensor at x = -0.325, obstacle face at 0.55 → 0.875
    if (r.kind === "distance") expect(Math.abs((r.distance ?? 0) - 0.875)).toBeLessThan(0.01);
  });
  it("sees other robots", () => {
    const spec = makeDiffDriveRobot({
      sensors: [{ id: "us", kind: "distance", x: 0.075, y: 0, angle: 0, fovDeg: 15, minRange: 0.02, maxRange: 2 }],
    });
    const w = new SimWorld(flatTrack([], 4), [
      { spec, pose: { x: 0, y: 0, heading: 0 } },
      { spec: makeDiffDriveRobot({ id: "b" }), pose: { x: 0.5, y: 0, heading: Math.PI / 2 } },
    ]);
    const r = w.readSensors(0).us;
    // other robot is 12 cm wide along x when rotated 90° → near face at 0.44; sensor at 0.075
    if (r.kind === "distance") expect(r.distance).toBeCloseTo(0.365, 6);
  });
});

describe("bumper, encoder, imu", () => {
  it("bumper presses on contact with a wall", () => {
    const spec = makeDiffDriveRobot({ sensors: [{ id: "bump", kind: "bumper", a: { x: 0.075, y: 0.05 }, b: { x: 0.075, y: -0.05 } }] });
    const w = new SimWorld(flatTrack([], 2), [{ spec, pose: { x: 0.5, y: 0, heading: 0 } }]);
    const pressed = () => {
      const r = w.readSensors(0).bump;
      return r.kind === "bumper" && r.pressed;
    };
    expect(pressed()).toBe(false);
    w.stepFor(2, () => [{ L: 4, R: 4 }]);
    expect(pressed()).toBe(true);
    const scene = { walls: [], obstacles: [{ kind: "circle" as const, cx: 0, cy: 0, r: 0.1 }], robots: [] };
    expect(bumperPressed(scene, { x: 0.101, y: -1 }, { x: 0.101, y: 1 })).toBe(true);
    expect(bumperPressed(scene, { x: 0.11, y: -1 }, { x: 0.11, y: 1 })).toBe(false);
  });
  it("encoder counts follow wheel rotation; IMU reports yaw rate", () => {
    const spec = makeDiffDriveRobot({ withOdometry: true });
    const w = new SimWorld(flatTrack(), [{ spec, pose: { x: -3, y: 0, heading: 0 } }]);
    w.stepFor(1, () => [{ L: 5, R: 5 }]);
    const s = w.readSensors(0);
    const t = w.telemetry(0);
    if (s.encL.kind !== "encoder" || s.imu.kind !== "imu") throw new Error();
    const expected = (t.distance / (2 * Math.PI * 0.0325)) * 360;
    expect(Math.abs(s.encL.count - expected)).toBeLessThan(0.03 * expected);
    expect(Number.isInteger(s.encL.count)).toBe(true);
    expect(s.encL.rpm).toBeGreaterThan(150);
    w.stepFor(1, () => [{ L: -5, R: 5 }]);
    const s2 = w.readSensors(0);
    if (s2.imu.kind !== "imu" || s2.encL.kind !== "encoder") throw new Error();
    expect(s2.imu.yawRate).toBeGreaterThan(5);
    expect(s2.imu.heading).toBeLessThanOrEqual(Math.PI);
    expect(s2.encL.rpm).toBeLessThan(-100);
  });
});
