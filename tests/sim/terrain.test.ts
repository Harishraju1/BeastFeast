/**
 * Off-road terrain physics: rocks (drivable vs solid), mud, bumps, zigzag, slopes, blocks / hurdles /
 * platforms, drive sanity, save/load and the built-in off-road example tracks.
 *
 * Test robot (terrainHelpers.make4wd): 4WD skid-steer, 1.2 kg, Ø66 mm wheels at the corners, one 12 V
 * 300 rpm 0.2 N·m gearmotor per wheel, tyre μ 0.9, ground clearance 20 mm → step limit
 * min(0.020, 0.6·0.033) = 19.8 mm.
 */
import { describe, expect, it } from "vitest";
import type { TrackDef } from "@/lib/sim/types";
import { compileTrack } from "@/lib/track/compile";
import { EXAMPLE_TRACKS, OFFROAD_EXAMPLE_IDS } from "@/lib/track/examples";
import { buildTerrain, isSolidFor, terrainStepLimit, TERRAIN_DEFAULTS } from "@/lib/track/terrain";
import { SimWorld } from "@/lib/sim/world";
import { closestPointOBB } from "@/lib/sim/geom";
import { drive, make4wd, piece, run, terrainTrack, type Sample } from "./terrainHelpers";

const deg = (r: number) => (r * 180) / Math.PI;
const range = (s: Sample[], k: keyof Sample) => {
  const v = s.map((q) => q[k] as number);
  return Math.max(...v) - Math.min(...v);
};
const maxOf = (s: Sample[], k: keyof Sample) => Math.max(...s.map((q) => q[k] as number));
const at = (s: Sample[], t: number) => s.find((q) => q.t >= t - 1e-9)!;

/** Hill whose up-slope foot is at x = 0 (piece centred at run + top/2). */
function hillTrack(slopeDeg: number, height: number, top = 0.4) {
  const run_ = height / Math.tan((slopeDeg * Math.PI) / 180);
  const L = 2 * run_ + top;
  return { track: terrainTrack([piece("h", "hill", L / 2, 0, { slopeDeg, height, length: L, width: 1.5 })], 14), run: run_, L };
}

describe("terrain model", () => {
  it("flat tracks have inactive terrain; the built-in non-off-road examples are unchanged", () => {
    for (const def of EXAMPLE_TRACKS.filter((d) => !OFFROAD_EXAMPLE_IDS.includes(d.id))) {
      const t = compileTrack(def);
      expect(t.terrain.active).toBe(false);
      expect(t.terrain.height(0.1, 0.2)).toBe(0);
    }
  });

  it("height() is exactly the composition of featureHeight() (what the renderer meshes)", () => {
    for (const id of OFFROAD_EXAMPLE_IDS) {
      const t = compileTrack(EXAMPLE_TRACKS.find((d) => d.id === id)!).terrain;
      for (let x = -2.2; x <= 2.2; x += 0.0137)
        for (let y = -1.1; y <= 1.1; y += 0.0291) {
          let hi = 0;
          let lo = 0;
          t.features.forEach((_, i) => {
            const h = t.featureHeight(i, x, y);
            if (h > hi) hi = h;
            else if (h < lo) lo = h;
          });
          expect(t.height(x, y)).toBe(hi + lo);
        }
    }
  });

  it("is deterministic and seeded", () => {
    const mk = (seed: number) => buildTerrain(terrainTrack([piece("rf", "rock-field", 0, 0, { count: 10, seed })]).def);
    const a = mk(7);
    const b = mk(7);
    const c = mk(8);
    let same = true;
    let diff = false;
    for (let x = -0.3; x <= 0.3; x += 0.01)
      for (let y = -0.2; y <= 0.2; y += 0.01) {
        if (a.height(x, y) !== b.height(x, y)) same = false;
        if (a.height(x, y) !== c.height(x, y)) diff = true;
      }
    expect(same).toBe(true);
    expect(diff).toBe(true);
    // the default seed comes from the piece id: same id → same terrain
    const d1 = buildTerrain(terrainTrack([piece("rockA", "rock", 0, 0, {})]).def);
    const d2 = buildTerrain(terrainTrack([piece("rockA", "rock", 0, 0, {})]).def);
    expect(d1.height(0.012, 0.007)).toBe(d2.height(0.012, 0.007));
  });

  it("rock-field: irregular rocks of several sizes, each its own feature with a collision outline", () => {
    const t = terrainTrack([piece("rf", "rock-field", 0, 0, { length: 1, width: 0.6, count: 12, height: 0.04, seed: 3 })]).terrain;
    expect(t.features.length).toBe(12);
    expect(t.features.every((f) => f.kind === "rock" && f.solid?.kind === "circle")).toBe(true);
    const heights = new Set(t.features.map((f) => f.maxHeight.toFixed(4)));
    expect(heights.size).toBeGreaterThan(8);
    // irregular outline: the radius at which the rock ends varies with direction
    const f = t.features[0];
    const s = f.solid as { cx: number; cy: number; r: number };
    const edge = (th: number) => {
      let r = 0;
      while (t.featureHeight(0, s.cx + r * Math.cos(th), s.cy + r * Math.sin(th)) > 0) r += 0.0005;
      return r;
    };
    const radii = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => edge((k * Math.PI) / 4));
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.002);
  });

  it("mud is a flat surface patch; surface() reports grip and drag", () => {
    const t = terrainTrack([piece("m", "mud", 0, 0, { length: 0.4, width: 0.3 })]).terrain;
    expect(t.active).toBe(true);
    expect(t.height(0, 0)).toBe(0);
    expect(t.surface(0, 0)).toEqual({ kind: "mud", mu: TERRAIN_DEFAULTS.mud.grip, crr: TERRAIN_DEFAULTS.mud.drag });
    expect(t.surface(0.5, 0)).toEqual({ kind: "ground", mu: 1, crr: 0 });
    expect(t.features[0].surface).toEqual({ mu: 0.45, crr: 0.12 });
  });

  it("per-robot solidity: step limit = min(clearance, 0.6 × driven wheel radius)", () => {
    const spec = make4wd();
    expect(terrainStepLimit(spec)).toBeCloseTo(0.0198, 6);
    expect(terrainStepLimit(make4wd({ clearance: 0.012 }))).toBeCloseTo(0.012, 6);
    const t = terrainTrack([
      piece("lo", "rock", 0, 0, { height: 0.012 }),
      piece("hi", "rock", 1, 0, { height: 0.03 }),
      piece("hill", "hill", 2, 0, { height: 0.3, slopeDeg: 30 }),
      piece("blk", "block", 3, 0, { height: 0.04 }),
      piece("plat", "platform", 4, 0, { height: 0.04, edge: 0.1 }),
    ]).terrain;
    const lim = terrainStepLimit(spec);
    expect(t.features.map((f) => isSolidFor(f, lim))).toEqual([false, true, false, true, false]);
  });
});

describe("rocks", () => {
  it("a tall rock stops the robot; it never passes through", () => {
    const track = terrainTrack([piece("r", "rock", 0, 0, { width: 0.07, height: 0.04, seed: 3 })]);
    const { samples, world } = run(track, { x: -0.5, y: 0, heading: 0 }, 3, drive(12, 12));
    const rockR = 0.95 * 0.035;
    // the chassis front (x + 0.12) never gets past the rock's near side
    expect(maxOf(samples, "x") + 0.12).toBeLessThan(0 - rockR + 0.002);
    expect(world.telemetry(0).colliding).toBe(true);
    expect(Math.abs(world.telemetry(0).speed)).toBeLessThan(0.02);
    expect(maxOf(samples, "z")).toBe(0);
  });

  it("a tall rock in a wheel track (wheels stick out of the chassis) deflects the robot but is never penetrated", () => {
    const track = terrainTrack([piece("r", "rock", 0, 0.09, { width: 0.07, height: 0.04, seed: 3 })]);
    const rock = track.terrain.features[0].solid as { cx: number; cy: number; r: number };
    const { samples } = run(track, { x: -0.5, y: 0, heading: 0 }, 3, drive(12, 12), 0.002);
    // hull = chassis 0.24 × 0.16 grown to enclose the wheels: x ±0.12, y ±(0.09 + 0.0125)
    let minGap = Infinity;
    for (const s of samples) {
      const q = closestPointOBB(rock.cx, rock.cy, { cx: s.x, cy: s.y, hx: 0.12, hy: 0.1025, rot: s.heading });
      minGap = Math.min(minGap, q.inside ? -1 : Math.hypot(rock.cx - q.x, rock.cy - q.y) - rock.r);
    }
    expect(minGap).toBeGreaterThan(-0.002);
    expect(maxOf(samples, "z")).toBe(0);
  });

  it("a low rock (below clearance and wheel climb limit) is driven over and z rises", () => {
    const track = terrainTrack([piece("r", "rock", 0, 0.09, { width: 0.07, height: 0.012, seed: 3 })]);
    const { samples } = run(track, { x: -0.4, y: 0, heading: 0 }, 1.5, drive(8, 8));
    expect(samples[samples.length - 1].x).toBeGreaterThan(0.4);
    expect(maxOf(samples, "z")).toBeGreaterThan(0.0025);
    expect(deg(maxOf(samples, "roll"))).toBeGreaterThan(1); // left side lifted
    expect(samples[samples.length - 1].z).toBe(0);
  });

  it("a low rock between the wheels passes under the chassis (no height change)", () => {
    const track = terrainTrack([piece("r", "rock", 0, 0, { width: 0.07, height: 0.012, seed: 3 })]);
    const { samples } = run(track, { x: -0.4, y: 0, heading: 0 }, 1.5, drive(8, 8));
    expect(samples[samples.length - 1].x).toBeGreaterThan(0.4);
    expect(maxOf(samples, "z")).toBe(0);
  });

  it("solid rocks are seen by the distance sensor, drivable ones are not", () => {
    const mk = (h: number) => new SimWorld(terrainTrack([piece("r", "rock", 0, 0, { width: 0.07, height: h, seed: 3 })]), [{ spec: make4wd(), pose: { x: -0.6, y: 0, heading: 0 } }]);
    const tall = mk(0.04).readSensors(0).us;
    const low = mk(0.012).readSensors(0).us;
    expect(tall.kind === "distance" && tall.distance).toBeGreaterThan(0.4);
    expect(tall.kind === "distance" && tall.distance).toBeLessThan(0.5);
    expect(low.kind === "distance" && low.distance).toBe(null);
  });
});

describe("mud", () => {
  const flat = terrainTrack([piece("far", "mud", 4, 4, { length: 0.1, width: 0.1 })]);
  const mud = terrainTrack([piece("m", "mud", 0, 0, { length: 8, width: 2 })]);

  it("reduces traction: slower acceleration, lower top speed, more slip", () => {
    const f = run(flat, { x: -3, y: 0, heading: 0 }, 3, drive(12, 12)).samples;
    const m = run(mud, { x: -3, y: 0, heading: 0 }, 3, drive(12, 12)).samples;
    const vf = at(f, 3).speed;
    const vm = at(m, 3).speed;
    console.log(`[terrain] 12 V top speed: ground ${vf.toFixed(3)} m/s, mud ${vm.toFixed(3)} m/s; speed after 0.1 s: ${at(f, 0.1).speed.toFixed(3)} vs ${at(m, 0.1).speed.toFixed(3)}; slip at 0.1 s: ${at(f, 0.1).slip.toFixed(3)} vs ${at(m, 0.1).slip.toFixed(3)}`);
    expect(vm).toBeLessThan(vf - 0.03);
    expect(at(m, 0.1).speed).toBeLessThan(0.6 * at(f, 0.1).speed);
    expect(at(m, 0.1).slip).toBeGreaterThan(5 * at(f, 0.1).slip);
    expect(at(m, 3).slip).toBeGreaterThan(at(f, 3).slip);
    expect(at(m, 3).surface).toBe("mud");
    expect(at(f, 3).surface).toBe("ground");
  });

  it("is applied per wheel: mud under the left wheels only pulls the robot to the left", () => {
    const half = terrainTrack([piece("m", "mud", 0, 0.52, { length: 8, width: 1 })]);
    const { samples } = run(half, { x: -2, y: 0, heading: 0 }, 2, drive(12, 12));
    expect(samples[samples.length - 1].heading).toBeGreaterThan(0.02);
  });
});

describe("uneven ground", () => {
  it("bumps and dips change z, pitch and roll", () => {
    const track = terrainTrack([piece("b", "bumps", 0, 0, { length: 1.2, width: 0.8, amplitude: 0.015, seed: 7 })]);
    expect(track.terrain.features[0].maxHeight).toBeGreaterThan(0.008);
    let dips = false;
    for (let x = -0.6; x <= 0.6; x += 0.01) for (let y = -0.4; y <= 0.4; y += 0.01) if (track.terrain.height(x, y) < -0.003) dips = true;
    expect(dips).toBe(true);
    const { samples } = run(track, { x: -0.8, y: 0, heading: 0 }, 2.5, drive(8, 8));
    expect(range(samples, "z")).toBeGreaterThan(0.005);
    expect(deg(range(samples, "pitch"))).toBeGreaterThan(2);
    expect(deg(range(samples, "roll"))).toBeGreaterThan(2);
    expect(samples.some((s) => s.surface === "bumps")).toBe(true);
    expect(samples[samples.length - 1].x).toBeGreaterThan(0.8);
  });
});

describe("zigzag", () => {
  it("has real height: z goes up and down along it", () => {
    const track = terrainTrack([piece("z", "zigzag", 0, 0, {})]);
    expect(track.terrain.features[0].maxHeight).toBe(TERRAIN_DEFAULTS.zigzag.height);
    const { samples } = run(track, { x: -1, y: 0, heading: 0 }, 3, drive(8, 8), 0.02);
    const z = samples.map((s) => s.z);
    // driving straight along the piece axis crosses raised and lower sections: up, down, up, down
    const peak1 = Math.max(...samples.filter((s) => s.x < -0.15).map((s) => s.z));
    const valley = Math.min(...samples.filter((s) => Math.abs(s.x) < 0.1).map((s) => s.z));
    const peak2 = Math.max(...samples.filter((s) => s.x > 0.15).map((s) => s.z));
    console.log(`[terrain] zigzag z profile (mm, every 0.1 s): ${samples.filter((_, i) => i % 5 === 4).map((s) => (s.z * 1000).toFixed(0)).join(" ")}`);
    expect(Math.max(...z)).toBeGreaterThan(0.025);
    expect(valley).toBeGreaterThan(0.005); // still on the raised path
    expect(peak1).toBeGreaterThan(valley + 0.01);
    expect(peak2).toBeGreaterThan(valley + 0.01);
    expect(z[0]).toBe(0);
    expect(samples[samples.length - 1].x).toBeGreaterThan(0.9);
    expect(samples.some((s) => s.surface === "zigzag")).toBe(true);
  });
});

describe("slopes", () => {
  it("uphill is slower than flat; a gentle 10° slope is climbable", () => {
    const { track, run: r } = hillTrack(10, 0.15);
    const up = run(track, { x: -0.3, y: 0, heading: 0 }, 4, drive(8, 8)).samples;
    const flat = run(terrainTrack([]), { x: -0.3, y: 0, heading: 0 }, 4, drive(8, 8)).samples;
    const mid = up.find((s) => s.x > r / 2)!;
    const flatAt = flat.find((s) => s.x > r / 2)!;
    expect(mid.speed).toBeLessThan(flatAt.speed - 0.03);
    expect(maxOf(up, "z")).toBeCloseTo(0.15, 3);
    expect(deg(mid.pitch)).toBeGreaterThan(9);
    expect(deg(mid.pitch)).toBeLessThan(11);
  });

  /** Robot at rest with all four wheels on the up-slope, `volts` on every motor for `t` s: Δz (m). */
  const climbFromRest = (slopeDeg: number, spec = make4wd(), volts = 12, t = 3) => {
    const { track, run: r } = hillTrack(slopeDeg, 1.5);
    const x0 = r / 3;
    const { samples, world } = run(track, { x: x0, y: 0, heading: 0 }, t, drive(volts, volts), 0.05, spec);
    const z0 = x0 * Math.tan((slopeDeg * Math.PI) / 180);
    // up: highest gain reached (the robot may go over the top), dz: final change
    return { up: maxOf(samples, "z") - z0, dz: samples[samples.length - 1].z - z0, samples, world, x0 };
  };

  it("a 45° slope (beyond μ = 0.9) is not climbable even at full voltage; no net uphill progress", () => {
    // from rest on the slope: slides back down although the wheels spin forward at full voltage
    const { dz, up, samples, world, x0 } = climbFromRest(45);
    const last = samples[samples.length - 1];
    expect(dz).toBeLessThan(-0.05);
    expect(up).toBeLessThan(0.002);
    expect(last.x).toBeLessThan(x0);
    const tel = world.telemetry(0);
    expect(Object.values(tel.motorVoltage).every((v) => v > 11)).toBe(true);
    expect(Object.values(tel.wheelRpm!).every((v) => v > 100)).toBe(true);
    expect(last.slip).toBeGreaterThan(0.9); // wheels spinning
    // from the foot with a run-up it gets part of the way (momentum), then slides back – never the top
    const { track } = hillTrack(45, 1.0);
    const fromFoot = run(track, { x: -0.13, y: 0, heading: 0 }, 6, drive(12, 12)).samples;
    expect(maxOf(fromFoot, "z")).toBeLessThan(0.55);
    expect(fromFoot[fromFoot.length - 1].z).toBeLessThan(maxOf(fromFoot, "z") - 0.1);
  });

  it("the climbing limit emerges from traction (friction circle) and motor torque, not a hard-coded angle", () => {
    let steepest = 0;
    for (let d = 30; d <= 46; d++) if (climbFromRest(d).up > 0.02) steepest = d;
    console.log(`[terrain] steepest slope the test robot climbs (from rest, 12 V): ${steepest}° (traction limit atan(0.9) = ${deg(Math.atan(0.9)).toFixed(1)}°)`);
    expect(steepest).toBeGreaterThanOrEqual(38);
    expect(steepest).toBeLessThan(42);
    // more grip → steeper climb with the same motors
    expect(climbFromRest(46, make4wd({ mu: 1.2 })).up).toBeGreaterThan(0.05);
    // weak drive (6 V on a 3 kg robot) is torque-limited well below the traction limit
    const heavy = make4wd({ massKg: 3 });
    expect(climbFromRest(10, heavy, 6).up).toBeGreaterThan(0.02);
    const stalled = climbFromRest(30, heavy, 6);
    expect(stalled.up).toBeLessThan(0.002);
    expect(stalled.samples[stalled.samples.length - 1].slip).toBeLessThan(0.5); // not wheelspin: the motors stall
  });

  it("downhill is faster than flat at the same voltage", () => {
    const H = 0.3;
    const { track, run: r, L } = hillTrack(15, H);
    const topEnd = L - r; // start of the down-slope
    const down = run(track, { x: topEnd + 0.05, y: 0, heading: 0 }, 1.2, drive(8, 8)).samples;
    const flat = run(terrainTrack([]), { x: 0, y: 0, heading: 0 }, 1.2, drive(8, 8)).samples;
    console.log(`[terrain] 8 V after 1 s: flat ${at(flat, 1).speed.toFixed(3)} m/s, 15° downhill ${at(down, 1).speed.toFixed(3)} m/s`);
    expect(at(down, 1).speed).toBeGreaterThan(at(flat, 1).speed + 0.05);
    expect(at(down, 1).pitch).toBeLessThan(-0.2); // nose down
  });
});

describe("blocks, hurdles and platforms", () => {
  it("a low block is climbed (z changes), a tall one stops the robot", () => {
    const low = run(terrainTrack([piece("b", "block", 0, 0, { height: 0.012, width: 0.4, depth: 0.1 })]), { x: -0.4, y: 0, heading: 0 }, 1.5, drive(8, 8)).samples;
    expect(maxOf(low, "z")).toBeGreaterThan(0.004);
    expect(low[low.length - 1].x).toBeGreaterThan(0.4);
    const tall = run(terrainTrack([piece("b", "block", 0, 0, { height: 0.04, width: 0.4, depth: 0.1 })]), { x: -0.4, y: 0, heading: 0 }, 1.5, drive(12, 12)).samples;
    expect(maxOf(tall, "z")).toBe(0);
    // block face (with half its edge ramp) at x = −0.05 − 0.004; wheel fronts stay behind it
    expect(maxOf(tall, "x") + 0.08 + 0.033).toBeLessThan(-0.05);
  });

  it("hurdles are crossed one after another", () => {
    const { samples } = run(terrainTrack([piece("h", "hurdles", 0, 0, { count: 3, height: 0.012 })]), { x: -0.6, y: 0, heading: 0 }, 2, drive(8, 8), 0.005);
    expect(samples[samples.length - 1].x).toBeGreaterThan(0.6);
    expect(maxOf(samples, "z")).toBeGreaterThan(0.004);
    expect(samples.some((s) => s.surface === "block")).toBe(true);
  });

  it("a platform with sloped edges is driven onto and off again", () => {
    const { samples } = run(terrainTrack([piece("p", "platform", 0, 0, { length: 0.5, width: 0.5, height: 0.04, edge: 0.1 })]), { x: -0.6, y: 0, heading: 0 }, 2.5, drive(8, 8));
    expect(maxOf(samples, "z")).toBeCloseTo(0.04, 3);
    expect(samples[samples.length - 1].x).toBeGreaterThan(0.6);
    expect(samples[samples.length - 1].z).toBe(0);
  });
});

describe("drive sanity on terrain", () => {
  const gentle = terrainTrack([
    piece("b", "bumps", 0.8, 0, { length: 1, width: 0.8, amplitude: 0.01, seed: 2 }),
    piece("h", "hill", 2.2, 0, { slopeDeg: 10, height: 0.05, length: 1, width: 0.8 }),
    piece("m", "mud", 3.3, 0, { length: 0.6, width: 0.8 }),
  ]);

  it("never moves backwards under forward commands (flat and gentle terrain)", () => {
    for (const track of [terrainTrack([]), gentle]) {
      const { samples } = run(track, { x: -0.3, y: 0, heading: 0 }, 5, drive(8, 8), 0.005);
      for (let i = 1; i < samples.length; i++) expect(samples[i].x).toBeGreaterThanOrEqual(samples[i - 1].x - 1e-9);
      expect(Math.min(...samples.map((s) => s.speed))).toBeGreaterThan(-1e-6);
      expect(samples[samples.length - 1].x).toBeGreaterThan(2.8);
      expect(samples[samples.length - 1].speed).toBeGreaterThan(0.3);
    }
  });

  it("forward / reverse / left / right commands do what they say, on terrain too", () => {
    for (const track of [terrainTrack([]), gentle]) {
      const p0 = { x: 0.8, y: 0, heading: 0 };
      const fwd = run(track, p0, 1, drive(8, 8)).samples;
      const rev = run(track, p0, 1, drive(-8, -8)).samples;
      const left = run(track, p0, 1, drive(-6, 6)).samples;
      const right = run(track, p0, 1, drive(6, -6)).samples;
      expect(fwd[fwd.length - 1].x).toBeGreaterThan(p0.x + 0.3);
      expect(rev[rev.length - 1].x).toBeLessThan(p0.x - 0.3);
      expect(left[left.length - 1].heading).toBeGreaterThan(0.5);
      expect(right[right.length - 1].heading).toBeLessThan(-0.5);
      const arcL = run(track, p0, 1, drive(4, 8)).samples;
      const arcR = run(track, p0, 1, drive(8, 4)).samples;
      expect(arcL[arcL.length - 1].heading).toBeGreaterThan(0.05);
      expect(arcR[arcR.length - 1].heading).toBeLessThan(-0.05);
    }
  });

  it("flat tracks report flat attitude and per-wheel telemetry", () => {
    const w = new SimWorld(terrainTrack([]), [{ spec: make4wd(), pose: { x: 0, y: 0, heading: 0 } }]);
    w.stepFor(0.5, () => [drive(8, 8)]);
    const t = w.telemetry(0);
    expect(t.surface).toBe("ground");
    expect(t.pitch).toBe(0);
    expect(t.roll).toBe(0);
    expect(t.z).toBe(0);
    expect(Object.keys(t.wheelRpm!)).toEqual(["fl", "fr", "rl", "rr"]);
    expect(t.wheelRpm!.fl).toBeGreaterThan(100);
    expect(Math.abs(t.wheelSlip!.fl)).toBeLessThan(0.05);
    const snap = w.getSnapshot().robots[0];
    expect(snap.pitch).toBe(0);
    expect(snap.roll).toBe(0);
  });
});

describe("save / load", () => {
  it("tracks round-trip through JSON and compile to the same terrain", () => {
    for (const id of OFFROAD_EXAMPLE_IDS) {
      const def = EXAMPLE_TRACKS.find((d) => d.id === id)!;
      const loaded = JSON.parse(JSON.stringify(def)) as TrackDef;
      expect(loaded).toEqual(def);
      const a = compileTrack(def).terrain;
      const b = compileTrack(loaded).terrain;
      expect(JSON.stringify(b.features)).toBe(JSON.stringify(a.features));
      for (let x = -2.2; x <= 2.2; x += 0.031)
        for (let y = -1.1; y <= 1.1; y += 0.029) {
          expect(b.height(x, y)).toBe(a.height(x, y));
          expect(b.surface(x, y)).toEqual(a.surface(x, y));
        }
    }
  });
});

describe("off-road example tracks", () => {
  it("there are eight, all race tracks with an earthy surface", () => {
    const names = OFFROAD_EXAMPLE_IDS.map((id) => EXAMPLE_TRACKS.find((d) => d.id === id)?.name);
    expect(names).toEqual([
      "Beginner Off-Road Track",
      "Intermediate Off-Road Track",
      "Advanced Off-Road Track",
      "Rock Challenge",
      "Mud Challenge",
      "Zigzag Terrain Challenge",
      "Hill Climb Challenge",
      "Mixed Terrain Challenge",
    ]);
  });

  for (const id of OFFROAD_EXAMPLE_IDS) {
    it(`${id}: compiles with terrain and the test robot drives its first straight without NaNs`, () => {
      const def = EXAMPLE_TRACKS.find((d) => d.id === id)!;
      expect(def.kind).toBe("race");
      const t = compileTrack(def);
      expect(t.terrain.active).toBe(true);
      expect(t.terrain.features.length).toBeGreaterThan(3);
      expect(t.checkpoints.length).toBeGreaterThan(0);
      expect(t.startLine).not.toBeNull();
      // nothing ON the road is taller than a small robot (clearance 15 mm, Ø65 mm wheels) can climb
      const small = make4wd({ clearance: 0.015 });
      const lim = terrainStepLimit(small);
      for (const f of t.terrain.features) {
        if (!isSolidFor(f, lim)) continue;
        const s = f.solid!;
        const r = s.kind === "circle" ? s.r : Math.hypot(s.w, s.h) / 2;
        const onRoad = t.roads.some((road) => road.points.some((p) => Math.hypot(p.x - s.cx, p.y - s.cy) < road.width / 2 + r - 0.12));
        expect(onRoad, `${f.pieceId} blocks the road`).toBe(false);
      }
      const { samples, world } = run(t, def.start, 2.5, drive(8, 8), 0.02);
      for (const s of samples) for (const v of [s.x, s.y, s.heading, s.speed, s.z, s.pitch, s.roll, s.slip]) expect(Number.isFinite(v)).toBe(true);
      const last = samples[samples.length - 1];
      expect(Math.hypot(last.x - def.start.x, last.y - def.start.y)).toBeGreaterThan(0.5);
      expect(Object.values(world.readSensors(0)).length).toBe(1);
    });
  }

  it("terrain stepping stays fast", () => {
    const def = EXAMPLE_TRACKS.find((d) => d.id === "example-offroad-mixed")!;
    const world = new SimWorld(compileTrack(def), [{ spec: make4wd(), pose: def.start }]);
    const t0 = performance.now();
    world.stepFor(10, () => [drive(6, 6.3)]);
    const ms = performance.now() - t0;
    console.log(`[terrain] 10 s of simulated time (10 000 steps) on the mixed track: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(4000);
  });
});
