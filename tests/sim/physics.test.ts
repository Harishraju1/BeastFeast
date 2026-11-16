import { describe, expect, it } from "vitest";
import { SimWorld } from "@/lib/sim/world";
import { makeDiffDriveRobot, TT_MOTOR } from "@/lib/sim/presets";
import { GRAVITY, motorCurrent, motorModel, motorTorque, staticNormalLoads } from "@/lib/sim/physics";
import { flatTrack } from "./helpers";

const theoreticalSpeed = ((200 * 2 * Math.PI) / 60) * 0.0325; // ω_free · r ≈ 0.681 m/s

describe("motor model", () => {
  const m = motorModel({ id: "m", ...TT_MOTOR });
  it("matches stall torque at ω = 0 and zero torque at free speed", () => {
    expect(motorTorque(m, 6, 0)).toBeCloseTo(0.08, 6);
    expect(motorTorque(m, 6, m.omegaFree)).toBeCloseTo(0, 6);
    expect(motorCurrent(m, 6, 0)).toBeCloseTo(1.5, 6);
    expect(motorCurrent(m, 6, m.omegaFree)).toBeCloseTo(0.12, 6);
  });
  it("is linear in V and ω: τ = τs·V/Vn − (τs/ωf)·ω", () => {
    const w = 7.3;
    expect(motorTorque(m, 3.3, w)).toBeCloseTo(0.08 * (3.3 / 6) - (0.08 / m.omegaFree) * w, 9);
  });
});

describe("static loads", () => {
  it("sum to m·g and balance moments", () => {
    const spec = makeDiffDriveRobot({ casters: [0.06, -0.06] });
    const l = staticNormalLoads(spec);
    const all = [...l.wheels, ...l.casters];
    expect(all.reduce((a, b) => a + b, 0)).toBeCloseTo(spec.massKg * GRAVITY, 6);
    const pts = [...spec.wheels, ...spec.casters];
    const mx = pts.reduce((a, p, i) => a + all[i] * (p.x - spec.com.x), 0);
    expect(Math.abs(mx)).toBeLessThan(1e-9);
    expect(all.every((v) => v >= 0)).toBe(true);
  });
});

describe("drive dynamics", () => {
  it("straight run at 6 V reaches ~no-load speed and keeps heading", () => {
    const w = new SimWorld(flatTrack(), [{ spec: makeDiffDriveRobot(), pose: { x: -3, y: 0, heading: 0 } }]);
    w.stepFor(2, () => [{ L: 6, R: 6 }]);
    const t = w.telemetry(0);
    expect(t.speed).toBeGreaterThan(0.95 * theoreticalSpeed);
    expect(t.speed).toBeLessThan(theoreticalSpeed);
    expect(Math.abs(t.pose.heading)).toBeLessThan(1e-3);
    expect(Math.abs(t.pose.y)).toBeLessThan(1e-3);
    // acceleration is not instant: after 50 ms the robot is well below top speed
    const w2 = new SimWorld(flatTrack(), [{ spec: makeDiffDriveRobot(), pose: { x: -3, y: 0, heading: 0 } }]);
    w2.stepFor(0.05, () => [{ L: 6, R: 6 }]);
    expect(w2.telemetry(0).speed).toBeLessThan(0.8 * theoreticalSpeed);
  });

  it("opposite voltages rotate in place", () => {
    const w = new SimWorld(flatTrack(), [{ spec: makeDiffDriveRobot(), pose: { x: 0, y: 0, heading: 0 } }]);
    w.stepFor(2, () => [{ L: -6, R: 6 }]);
    const t = w.telemetry(0);
    // ideal yaw rate = 2·v/track = 2·0.68/0.14 ≈ 9.7 rad/s
    expect(t.yawRate).toBeGreaterThan(8.5);
    expect(t.yawRate).toBeLessThan(9.8);
    expect(Math.hypot(t.pose.x, t.pose.y)).toBeLessThan(0.02);
  });

  it("stronger left side curves towards the weaker (right) side", () => {
    const w = new SimWorld(flatTrack(), [{ spec: makeDiffDriveRobot(), pose: { x: 0, y: 0, heading: 0 } }]);
    w.stepFor(1.5, () => [{ L: 6, R: 4 }]);
    const t = w.telemetry(0);
    expect(t.pose.heading).toBeLessThan(-0.3);
    expect(t.pose.y).toBeLessThan(-0.05);
    expect(t.yawRate).toBeLessThan(0);
  });

  it("inverted motor reverses the wheel", () => {
    const spec = makeDiffDriveRobot();
    spec.motors[1].invert = true;
    const w = new SimWorld(flatTrack(), [{ spec, pose: { x: 0, y: 0, heading: 0 } }]);
    w.stepFor(1, () => [{ L: 6, R: 6 }]);
    expect(w.telemetry(0).yawRate).toBeLessThan(-5); // spins clockwise
  });

  it("coasting robot rolls to a stop", () => {
    const w = new SimWorld(flatTrack(), [{ spec: makeDiffDriveRobot(), pose: { x: -3, y: 0, heading: 0 } }]);
    w.stepFor(1, () => [{ L: 6, R: 6 }]);
    w.stepFor(4, () => [{}]); // no commands = open H-bridge
    expect(Math.abs(w.telemetry(0).speed)).toBeLessThan(0.01);
  });

  it("stalls against a wall: current → stall current, no penetration", () => {
    // floor 2 m wide: wall capsule surface at x = 0.99
    const w = new SimWorld(flatTrack([], 2), [{ spec: makeDiffDriveRobot(), pose: { x: 0.5, y: 0, heading: 0 } }]);
    let maxFront = -Infinity;
    w.stepFor(3, () => {
      if (w.time > 0) maxFront = Math.max(maxFront, w.telemetry(0).pose.x + 0.075);
      return [{ L: 6, R: 6 }];
    });
    const t = w.telemetry(0);
    expect(t.colliding).toBe(true);
    expect(Math.abs(t.speed)).toBeLessThan(0.005);
    expect(t.motorCurrentA.L).toBeGreaterThan(0.85 * 1.5);
    expect(t.motorCurrentA.R).toBeGreaterThan(0.85 * 1.5);
    expect(maxFront).toBeLessThan(0.99 + 0.003);
    expect(w.events.filter((e) => e.type === "collision").length).toBe(1);
  });

  it("battery sags under load and drains", () => {
    const spec = makeDiffDriveRobot({ battery: { capacity_mAh: 10 } });
    const w = new SimWorld(flatTrack([], 2), [{ spec, pose: { x: 0.8, y: 0, heading: 0 } }]);
    w.step([{ L: 0, R: 0 }]);
    const idle = w.telemetry(0).batteryVoltage;
    w.stepFor(2, () => [{ L: 6, R: 6 }]); // pushing the wall: stall
    const t1 = w.telemetry(0);
    const ocv1 = w.body(0).battery.openV;
    expect(t1.batteryVoltage).toBeLessThan(ocv1 - 0.2); // I·R sag
    expect(t1.batteryVoltage).toBeLessThan(idle - 0.2);
    w.stepFor(10, () => [{ L: 6, R: 6 }]);
    const t2 = w.telemetry(0);
    expect(t2.batteryUsed_mAh).toBeGreaterThan(t1.batteryUsed_mAh + 3);
    expect(w.body(0).battery.openV).toBeLessThan(ocv1 - 0.4);
    expect(w.events.some((e) => e.type === "battery-low")).toBe(true);
  });

  it("commanded voltage is clamped to the battery terminal voltage", () => {
    const w = new SimWorld(flatTrack(), [{ spec: makeDiffDriveRobot(), pose: { x: 0, y: 0, heading: 0 } }]);
    w.stepFor(0.1, () => [{ L: 24, R: -24 }]);
    const t = w.telemetry(0);
    expect(t.motorVoltage.L).toBeLessThanOrEqual(8.4);
    expect(t.motorVoltage.L).toBeCloseTo(t.batteryVoltage, 1);
    expect(t.motorVoltage.R).toBeCloseTo(-t.batteryVoltage, 1);
  });

  it("rolls downhill on a ramp when coasting", () => {
    const track = flatTrack([{ id: "r", type: "ramp", x: -0.5, y: 0, rotation: 0, params: { length: 1, width: 0.6, slopeDeg: 15 } }]);
    const w = new SimWorld(track, [{ spec: makeDiffDriveRobot(), pose: { x: 0, y: 0, heading: 0 } }]);
    w.step([{}]);
    expect(w.getSnapshot().robots[0].z).toBeCloseTo(0.5 * Math.tan((15 * Math.PI) / 180), 2);
    w.stepFor(0.3, () => [{}]);
    const t = w.telemetry(0);
    expect(t.pose.x).toBeLessThan(-0.05); // uphill is +x → rolled back
  });

  it("is deterministic", () => {
    const run = () => {
      const w = new SimWorld(flatTrack([], 3), [{ spec: makeDiffDriveRobot(), pose: { x: 0, y: 0, heading: 0.3 } }]);
      w.stepFor(4, (t) => [{ L: 6 * Math.sin(t * 3), R: 5 }]);
      return w.telemetry(0).pose;
    };
    expect(run()).toEqual(run());
  });
});
