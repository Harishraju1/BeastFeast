/**
 * Built-in example tracks (ownerId = null). Every path track is a closed loop built with TrackChain so
 * the pieces join exactly; the start pose lies on the line/road centre and points along it.
 *
 * Sumo: "Mini-sumo standard" dohyo = 77 cm diameter ring with a 2.5 cm white border and 180 s rounds.
 * Ring size, border and time limit are plain `arena` fields and can be changed per track. The arena is
 * always centred at the world origin.
 */
import type { Pose, TrackDef } from "../sim/types";
import { TrackChain } from "./builder";

const RACE_SURFACE = { color: "#d8d3c4", mu: 1.0, lineColor: "#2d2f33" };
const LINE_SURFACE = { color: "#ffffff", mu: 0.9, lineColor: "#111111" };
const SUMO_SURFACE = { color: "#141414", mu: 1.0, lineColor: "#ffffff" };

// ───────────── Race: beginner oval ─────────────
function raceBeginner(): TrackDef {
  const ch = new TrackChain({ x: -0.6, y: -0.55, heading: 0 }, "rb");
  const w = 0.3;
  ch.add("straight", { length: 1.2, width: w })
    .add("curve", { radius: 0.55, angle: Math.PI, width: w })
    .add("straight", { length: 1.2, width: w })
    .add("curve", { radius: 0.55, angle: Math.PI, width: w });
  ch.place("start", -0.4, -0.55, 0, { width: 0.4 });
  ch.place("checkpoint", 1.15, 0, Math.PI / 2, { width: 0.4 });
  ch.place("checkpoint", 0, 0.55, Math.PI, { width: 0.4 });
  return {
    id: "example-race-beginner-oval",
    name: "Race · Beginner Oval",
    kind: "race",
    difficulty: "beginner",
    ownerId: null,
    size: { w: 3.0, h: 2.0 },
    surface: RACE_SURFACE,
    pieces: ch.pieces,
    start: { x: -0.5, y: -0.55, heading: 0 },
    laps: 3,
  };
}

// ───────────── Race: intermediate – S-curves, obstacles, checkpoints ─────────────
function raceIntermediate(): TrackDef {
  const w = 0.4;
  const x0 = -1.116;
  const ch = new TrackChain({ x: x0, y: -0.7, heading: 0 }, "ri");
  ch.add("straight", { length: 0.4, width: w })
    .add("s-curve", { radius: 0.4, angle: Math.PI / 4, width: w })
    .add("straight", { length: 0.3, width: w })
    .add("s-curve", { radius: 0.4, angle: -Math.PI / 4, width: w })
    .add("straight", { length: 0.4, width: w })
    .add("curve", { radius: 0.7, angle: Math.PI, width: w });
  const topLen = ch.pose.x - x0;
  ch.add("straight", { length: topLen, width: w }).add("curve", { radius: 0.7, angle: Math.PI, width: w });
  ch.place("obstacle", 0.4, 0.8, 0, { width: 0.08, depth: 0.08, shape: "box" });
  ch.place("obstacle", -0.4, 0.6, 0, { width: 0.08, depth: 0.08, shape: "box" });
  ch.place("obstacle", 0, 0.82, 0, { width: 0.06, shape: "cylinder" });
  ch.place("start", -1.0, -0.7, 0, { width: 0.5 });
  ch.place("checkpoint", 0.75, -0.7, 0, { width: 0.5 });
  ch.place("checkpoint", 1.816, 0, Math.PI / 2, { width: 0.5 });
  ch.place("checkpoint", 0, 0.7, Math.PI, { width: 0.5 });
  ch.place("checkpoint", -1.816, 0, -Math.PI / 2, { width: 0.5 });
  return {
    id: "example-race-intermediate-scurves",
    name: "Race · S-Curves & Obstacles",
    kind: "race",
    difficulty: "intermediate",
    ownerId: null,
    size: { w: 4.4, h: 2.0 },
    surface: RACE_SURFACE,
    pieces: ch.pieces,
    start: { x: -1.08, y: -0.7, heading: 0 },
    laps: 3,
  };
}

// ───────────── Race: advanced – chicane, sharp corners, ramp, obstacles ─────────────
function raceAdvanced(): TrackDef {
  const w = 0.3;
  const ch = new TrackChain({ x: -0.9, y: -0.75, heading: 0 }, "ra");
  ch.add("straight", { length: 0.5, width: w })
    .add("s-curve", { radius: 0.35, angle: Math.PI / 6, width: w })
    .add("s-curve", { radius: 0.35, angle: -Math.PI / 6, width: w })
    .add("straight", { length: 0.5, width: w })
    .add("curve", { radius: 0.4, angle: Math.PI / 2, width: w })
    .add("straight", { length: 0.8, width: w })
    .add("sharp-turn", { length: 0.3, angle: Math.PI / 2, width: w })
    .add("straight", { length: 1.7, width: w })
    .add("curve", { radius: 0.4, angle: Math.PI / 2, width: w })
    .add("straight", { length: 0.8, width: w })
    .add("sharp-turn", { length: 0.3, angle: Math.PI / 2, width: w });
  ch.place("ramp", 1.2, -0.25, Math.PI / 2, { length: 0.4, width: 0.3, slopeDeg: 8 });
  ch.place("obstacle", 0.3, 0.8, 0, { width: 0.08, shape: "cylinder" });
  ch.place("obstacle", -0.3, 0.7, 0.3, { width: 0.07, depth: 0.07, shape: "box" });
  ch.place("start", -0.8, -0.75, 0, { width: 0.4 });
  ch.place("checkpoint", 0.6, -0.75, 0, { width: 0.4 });
  ch.place("checkpoint", 1.2, 0.2, Math.PI / 2, { width: 0.4 });
  ch.place("checkpoint", 0, 0.75, Math.PI, { width: 0.4 });
  ch.place("checkpoint", -1.2, 0, -Math.PI / 2, { width: 0.4 });
  return {
    id: "example-race-advanced-circuit",
    name: "Race · Grand Circuit",
    kind: "race",
    difficulty: "advanced",
    ownerId: null,
    size: { w: 3.2, h: 2.2 },
    surface: RACE_SURFACE,
    pieces: ch.pieces,
    start: { x: -0.88, y: -0.75, heading: 0 },
    laps: 3,
  };
}

// ───────────── Line: beginner oval ─────────────
function lineBeginner(): TrackDef {
  const ch = new TrackChain({ x: -0.5, y: -0.6, heading: 0 }, "lb");
  ch.add("line-straight", { length: 1.0 })
    .add("line-curve", { radius: 0.6, angle: Math.PI })
    .add("line-straight", { length: 1.0 })
    .add("line-curve", { radius: 0.6, angle: Math.PI });
  ch.place("start", -0.3, -0.6, 0, { width: 0.2 });
  return {
    id: "example-line-beginner-oval",
    name: "Line · Beginner Oval",
    kind: "line",
    difficulty: "beginner",
    ownerId: null,
    size: { w: 3.0, h: 2.0 },
    surface: LINE_SURFACE,
    pieces: ch.pieces,
    start: { x: -0.4, y: -0.6, heading: 0 },
    laps: 1,
  };
}

// ───────────── Line: intermediate – sharp 90° corners and a step ─────────────
function lineIntermediate(): TrackDef {
  const L = 0.25;
  const ch = new TrackChain({ x: -0.5, y: -0.5, heading: 0 }, "li");
  ch.add("line-straight", { length: 0.8 })
    .add("line-sharp", { length: L, angle: Math.PI / 2 })
    .add("line-straight", { length: 0.5 })
    .add("line-curve", { radius: 0.3, angle: Math.PI / 2 })
    .add("line-straight", { length: 0.25 })
    .add("line-sharp", { length: 0.15, angle: -Math.PI / 2 })
    .add("line-sharp", { length: 0.15, angle: Math.PI / 2 })
    .add("line-straight", { length: 0.2 })
    .add("line-sharp", { length: L, angle: Math.PI / 2 })
    .add("line-straight", { length: 0.85 })
    .add("line-sharp", { length: L, angle: Math.PI / 2 });
  ch.place("start", -0.3, -0.5, 0, { width: 0.2 });
  return {
    id: "example-line-intermediate-sharp",
    name: "Line · Sharp Corners",
    kind: "line",
    difficulty: "intermediate",
    ownerId: null,
    size: { w: 2.0, h: 2.0 },
    surface: LINE_SURFACE,
    pieces: ch.pieces,
    start: { x: -0.4, y: -0.5, heading: 0 },
    laps: 1,
  };
}

// ───────────── Line: advanced – figure-8 through a "+" intersection, side loop ─────────────
function lineAdvanced(): TrackDef {
  const L = 0.8;
  const R = L / 2;
  const ch = new TrackChain({ x: -0.4, y: 0, heading: 0 }, "la");
  ch.add("intersection", { length: L }) // main (-0.4,0)->(0.4,0), cross line x=0, y∈[-0.4,0.4]
    .add("line-curve", { radius: R, angle: (3 * Math.PI) / 2 }) // lobe 1 → (0, 0.4) heading -π/2
    .moveTo({ x: 0, y: -0.4, heading: -Math.PI / 2 }) // the cross line carries the robot down
    .add("line-curve", { radius: R, angle: (-3 * Math.PI) / 2 }); // lobe 2 → back to (-0.4, 0)
  // side loop tangent to the outside of lobe 1 at its right-most point (0.8, 0.4)
  ch.place("loop", 0.8, 0.4, -Math.PI / 2, { radius: 0.25 });
  ch.place("start", -0.25, 0, 0, { width: 0.2 });
  return {
    id: "example-line-advanced-figure8",
    name: "Line · Figure-8 Crossing",
    kind: "line",
    difficulty: "advanced",
    ownerId: null,
    size: { w: 3.0, h: 2.0 },
    surface: LINE_SURFACE,
    pieces: ch.pieces,
    start: { x: -0.3, y: 0, heading: 0 },
    laps: 1,
  };
}

// ───────────── Line: beast – 60°/120° zig-zag and S-bends, thin line ─────────────
function lineBeast(): TrackDef {
  const l = 0.15;
  const lw = 0.015;
  const a = Math.PI / 3;
  const ch = new TrackChain({ x: -0.45, y: -0.35, heading: 0 }, "lx");
  ch.add("line-sharp", { length: l, angle: a, lineWidth: lw })
    .add("line-sharp", { length: l, angle: -2 * a, lineWidth: lw })
    .add("line-sharp", { length: l, angle: 2 * a, lineWidth: lw })
    .add("line-sharp", { length: l, angle: -2 * a, lineWidth: lw })
    .add("line-sharp", { length: l, angle: a, lineWidth: lw })
    .add("line-curve", { radius: 0.35, angle: Math.PI, lineWidth: lw })
    .add("s-curve", { radius: 0.25, angle: Math.PI / 4, lineWidth: lw })
    .add("line-straight", { length: 6 * l - 4 * 0.25 * Math.sin(Math.PI / 4), lineWidth: lw })
    .add("s-curve", { radius: 0.25, angle: -Math.PI / 4, lineWidth: lw })
    .add("line-curve", { radius: 0.35, angle: Math.PI, lineWidth: lw });
  ch.place("start", -0.35, -0.35, 0, { width: 0.2 });
  return {
    id: "example-line-beast-zigzag",
    name: "Line · Beast Zig-Zag",
    kind: "line",
    difficulty: "beast",
    ownerId: null,
    size: { w: 2.4, h: 2.0 },
    surface: LINE_SURFACE,
    pieces: ch.pieces,
    start: { x: -0.4, y: -0.35, heading: 0 },
    laps: 1,
  };
}

// ───────────── Sumo ─────────────
function sumoStandard(): TrackDef {
  return {
    id: "example-sumo-standard-dohyo",
    name: "Sumo · Mini-Sumo Dohyo (77 cm)",
    kind: "sumo",
    difficulty: "intermediate",
    ownerId: null,
    size: { w: 2.4, h: 2.4 },
    surface: SUMO_SURFACE,
    pieces: [],
    start: { x: -0.12, y: 0, heading: 0 },
    arena: { shape: "circle", radius: 0.385, border: 0.025, timeLimitS: 180 },
  };
}

function sumoRect(): TrackDef {
  return {
    id: "example-sumo-rect-arena",
    name: "Sumo · Rectangular Arena",
    kind: "sumo",
    difficulty: "beginner",
    ownerId: null,
    size: { w: 2.4, h: 2.0 },
    surface: SUMO_SURFACE,
    pieces: [],
    start: { x: -0.25, y: 0, heading: 0 },
    arena: { shape: "rect", w: 1.2, h: 0.8, border: 0.04, timeLimitS: 120 },
  };
}

// ───────────── Off-road (race tracks with real terrain: see terrain.ts) ─────────────
//
// Sized for small robots: wheels Ø65–85 mm, ground clearance 15–30 mm, 0.2–0.3 m long. Such a robot can
// drive over anything up to min(clearance, 0.6·wheel radius) ≈ 15 mm, so everything placed ON the
// road (low rocks, blocks, hurdles) is ≤ 14 mm, while the big decorative rocks beside the road
// (35–70 mm) are solid. Slopes stay ≤ 20°, well below the traction limit (≈ 40° for μ ≈ 0.9).

const OFFROAD_SURFACE = { color: "#7a5c3e", mu: 0.9, lineColor: "#a7895f" };

/** Closed oval: bottom straight (y = −R, left → right), right half-circle, top straight, left half-circle. */
function offroadOval(prefix: string, L: number, R: number, w: number, gate: number): TrackChain {
  const ch = new TrackChain({ x: -L / 2, y: -R, heading: 0 }, prefix);
  ch.add("straight", { length: L, width: w })
    .add("curve", { radius: R, angle: Math.PI, width: w })
    .add("straight", { length: L, width: w })
    .add("curve", { radius: R, angle: Math.PI, width: w });
  ch.place("start", -L / 2 + 0.2, -R, 0, { width: gate });
  ch.place("checkpoint", L / 2 + R, 0, Math.PI / 2, { width: gate });
  ch.place("checkpoint", 0, R, Math.PI, { width: gate });
  ch.place("checkpoint", -L / 2 - R, 0, -Math.PI / 2, { width: gate });
  return ch;
}

/** S-curve loop of the intermediate race example (x0 = −1.116, straights at y = −0.7 / +0.7). */
function offroadSLoop(prefix: string, w: number, gate: number): TrackChain {
  const x0 = -1.116;
  const ch = new TrackChain({ x: x0, y: -0.7, heading: 0 }, prefix);
  ch.add("straight", { length: 0.4, width: w })
    .add("s-curve", { radius: 0.4, angle: Math.PI / 4, width: w })
    .add("straight", { length: 0.3, width: w })
    .add("s-curve", { radius: 0.4, angle: -Math.PI / 4, width: w })
    .add("straight", { length: 0.4, width: w })
    .add("curve", { radius: 0.7, angle: Math.PI, width: w });
  const topLen = ch.pose.x - x0;
  ch.add("straight", { length: topLen, width: w }).add("curve", { radius: 0.7, angle: Math.PI, width: w });
  ch.place("start", -1.0, -0.7, 0, { width: gate });
  ch.place("checkpoint", 0.75, -0.7, 0, { width: gate });
  ch.place("checkpoint", 1.816, 0, Math.PI / 2, { width: gate });
  ch.place("checkpoint", 0, 0.7, Math.PI, { width: gate });
  ch.place("checkpoint", -1.816, 0, -Math.PI / 2, { width: gate });
  return ch;
}

function offroadDef(id: string, name: string, difficulty: TrackDef["difficulty"], size: { w: number; h: number }, ch: TrackChain, start: Pose, laps = 2): TrackDef {
  return { id, name, kind: "race", difficulty, ownerId: null, size, surface: OFFROAD_SURFACE, pieces: ch.pieces, start, laps };
}

function offroadBeginner(): TrackDef {
  const L = 1.6;
  const R = 0.55;
  const w = 0.42;
  const ch = offroadOval("ob", L, R, w, 0.5);
  ch.place("bumps", -0.1, -R, 0, { length: 0.45, width: w, amplitude: 0.008, seed: 3 });
  ch.place("hill", 0.5, -R, 0, { slopeDeg: 10, height: 0.035, length: 0.6, width: w, edge: 0.06 });
  ch.place("mud", 0.2, R, Math.PI, { length: 0.5, width: w, grip: 0.6, drag: 0.08 });
  ch.place("rock-field", 0, 0, 0, { length: 1.2, width: 0.3, count: 6, height: 0.05, seed: 11 });
  ch.place("rock", -0.4, -0.9, 0.4, { width: 0.08, depth: 0.065, height: 0.045, seed: 12 });
  ch.place("rock", 0.6, 0.9, 1.1, { width: 0.09, depth: 0.07, height: 0.05, seed: 13 });
  ch.place("rock", 1.5, -0.75, 2.0, { width: 0.07, height: 0.04, seed: 14 });
  return offroadDef("example-offroad-beginner", "Beginner Off-Road Track", "beginner", { w: 3.6, h: 2.0 }, ch, { x: -L / 2 + 0.1, y: -R, heading: 0 });
}

function offroadIntermediate(): TrackDef {
  const w = 0.42;
  const ch = offroadSLoop("oi", w, 0.5);
  ch.place("hurdles", 0, -0.466, 0, { count: 2, depth: 0.025, width: w, height: 0.01, spacing: 0.2 });
  ch.place("bumps", 0.92, -0.7, 0, { length: 0.38, width: w, amplitude: 0.01, seed: 31 });
  ch.place("hill", 0.6, 0.7, Math.PI, { slopeDeg: 15, height: 0.045, length: 0.55, width: w, edge: 0.06 });
  ch.place("mud", -0.05, 0.7, Math.PI, { length: 0.45, width: w, grip: 0.5, drag: 0.12 });
  ch.place("rock-field", -0.7, 0.7, Math.PI, { length: 0.5, width: 0.34, count: 7, height: 0.012, seed: 32 });
  ch.place("rock-field", 0, 0.12, 0, { length: 1.6, width: 0.28, count: 8, height: 0.05, seed: 33 });
  return offroadDef("example-offroad-intermediate", "Intermediate Off-Road Track", "intermediate", { w: 4.4, h: 2.2 }, ch, { x: -1.08, y: -0.7, heading: 0 });
}

function offroadAdvanced(): TrackDef {
  const w = 0.36;
  const ch = new TrackChain({ x: -0.9, y: -0.75, heading: 0 }, "oa");
  ch.add("straight", { length: 0.5, width: w })
    .add("s-curve", { radius: 0.35, angle: Math.PI / 6, width: w })
    .add("s-curve", { radius: 0.35, angle: -Math.PI / 6, width: w })
    .add("straight", { length: 0.5, width: w })
    .add("curve", { radius: 0.4, angle: Math.PI / 2, width: w })
    .add("straight", { length: 0.8, width: w })
    .add("sharp-turn", { length: 0.3, angle: Math.PI / 2, width: w })
    .add("straight", { length: 1.7, width: w })
    .add("curve", { radius: 0.4, angle: Math.PI / 2, width: w })
    .add("straight", { length: 0.8, width: w })
    .add("sharp-turn", { length: 0.3, angle: Math.PI / 2, width: w });
  ch.place("start", -0.8, -0.75, 0, { width: 0.45 });
  ch.place("checkpoint", 0.6, -0.75, 0, { width: 0.45 });
  ch.place("checkpoint", 1.2, 0.2, Math.PI / 2, { width: 0.45 });
  ch.place("checkpoint", 0, 0.75, Math.PI, { width: 0.45 });
  ch.place("checkpoint", -1.2, 0, -Math.PI / 2, { width: 0.45 });
  ch.place("rock-field", -0.05, -0.7, 0, { length: 0.6, width: 0.3, count: 7, height: 0.013, seed: 41 });
  ch.place("bumps", 0.55, -0.75, 0, { length: 0.45, width: w, amplitude: 0.014, seed: 42 });
  ch.place("hurdles", 1.2, 0.05, Math.PI / 2, { count: 3, depth: 0.025, width: w, height: 0.013, spacing: 0.16 });
  ch.place("zigzag", 0.3, 0.75, Math.PI, { length: 0.7, width: 0.3, segments: 4, angle: Math.PI / 9, height: 0.035, minHeight: 0.01, edge: 0.07 });
  ch.place("platform", -0.5, 0.75, Math.PI, { length: 0.22, width: 0.45, height: 0.03, edge: 0.08 });
  ch.place("hill", -1.2, -0.05, -Math.PI / 2, { slopeDeg: 20, height: 0.06, length: 0.7, width: w, edge: 0.06 });
  ch.place("mud", -1.2, -0.05, -Math.PI / 2, { length: 0.3, width: w, grip: 0.4, drag: 0.15 });
  ch.place("rock-field", 0, 0, 0, { length: 1.6, width: 0.5, count: 10, height: 0.06, seed: 43 });
  return offroadDef("example-offroad-advanced", "Advanced Off-Road Track", "advanced", { w: 3.2, h: 2.2 }, ch, { x: -0.88, y: -0.75, heading: 0 });
}

function offroadRocks(): TrackDef {
  const L = 2.0;
  const R = 0.6;
  const w = 0.45;
  const ch = offroadOval("or", L, R, w, 0.55);
  // low rocks you drive over, a few big ones on the road edges you must steer around
  ch.place("rock-field", -0.25, -R, 0, { length: 0.6, width: 0.38, count: 9, height: 0.012, seed: 21 });
  ch.place("rock", 0.35, -R - 0.16, 0.3, { width: 0.08, depth: 0.07, height: 0.05, seed: 5 });
  ch.place("rock", 0.75, -R + 0.15, 1.2, { width: 0.07, height: 0.045, seed: 6 });
  ch.place("rock-field", 0.45, R, Math.PI, { length: 0.6, width: 0.38, count: 10, height: 0.014, seed: 22 });
  ch.place("rock-field", -0.4, R, Math.PI, { length: 0.55, width: 0.4, count: 5, height: 0.022, seed: 23 });
  ch.place("rock-field", L / 2 + R, 0, Math.PI / 2, { length: 0.4, width: 0.3, count: 5, height: 0.01, seed: 27 });
  // scenery: big boulders inside and outside the loop
  ch.place("rock-field", 0, 0, 0, { length: 1.8, width: 0.5, count: 10, height: 0.07, seed: 24 });
  ch.place("rock-field", 0, -0.98, 0, { length: 2.0, width: 0.12, count: 6, height: 0.05, seed: 25 });
  ch.place("rock-field", 0, 0.98, 0, { length: 2.0, width: 0.12, count: 6, height: 0.05, seed: 26 });
  return offroadDef("example-offroad-rocks", "Rock Challenge", "intermediate", { w: 4.0, h: 2.4 }, ch, { x: -L / 2 + 0.1, y: -R, heading: 0 });
}

function offroadMud(): TrackDef {
  const L = 2.0;
  const R = 0.6;
  const w = 0.45;
  const ch = offroadOval("om", L, R, w, 0.55);
  ch.place("mud", -0.3, -R, 0, { length: 0.5, width: w, grip: 0.5, drag: 0.1 });
  ch.place("mud", 0.55, -R, 0, { length: 0.45, width: w, grip: 0.3, drag: 0.2 });
  ch.place("mud", L / 2 + R, 0, Math.PI / 2, { length: 0.5, width: w, grip: 0.45, drag: 0.12 });
  // a muddy hill and a rutted stretch with a drier line on one side
  ch.place("hill", 0.45, R, Math.PI, { slopeDeg: 10, height: 0.03, length: 0.5, width: w, edge: 0.06 });
  ch.place("mud", 0.45, R, Math.PI, { length: 0.35, width: w, grip: 0.45, drag: 0.12 });
  ch.place("bumps", -0.45, R, Math.PI, { length: 0.6, width: w, amplitude: 0.008, seed: 51 });
  ch.place("mud", -0.45, R + 0.08, Math.PI, { length: 0.6, width: 0.3, grip: 0.4, drag: 0.15 });
  ch.place("rock-field", 0, 0, 0, { length: 1.6, width: 0.4, count: 6, height: 0.05, seed: 52 });
  return offroadDef("example-offroad-mud", "Mud Challenge", "intermediate", { w: 4.0, h: 2.2 }, ch, { x: -L / 2 + 0.1, y: -R, heading: 0 });
}

function offroadZigzag(): TrackDef {
  const L = 2.2;
  const R = 0.6;
  const w = 0.45;
  const ch = offroadOval("oz", L, R, w, 0.55);
  ch.place("zigzag", 0.1, -R, 0, { length: 1.3, width: 0.26, segments: 4, angle: Math.PI / 7, height: 0.04, minHeight: 0.012, edge: 0.07 });
  ch.place("zigzag", 0, R, Math.PI, { length: 1.5, width: 0.28, segments: 6, angle: Math.PI / 6, height: 0.05, minHeight: 0.015, edge: 0.08 });
  ch.place("rock-field", 0, 0, 0, { length: 1.8, width: 0.4, count: 8, height: 0.06, seed: 61 });
  return offroadDef("example-offroad-zigzag", "Zigzag Terrain Challenge", "advanced", { w: 4.2, h: 2.2 }, ch, { x: -L / 2 + 0.1, y: -R, heading: 0 });
}

function offroadHills(): TrackDef {
  const L = 2.6;
  const R = 0.6;
  const w = 0.45;
  const ch = offroadOval("oh", L, R, w, 0.55);
  ch.place("hill", -0.55, -R, 0, { slopeDeg: 10, height: 0.04, length: 0.6, width: w, edge: 0.06 });
  ch.place("hill", 0.35, -R, 0, { slopeDeg: 15, height: 0.05, length: 0.55, width: w, edge: 0.06 });
  ch.place("hill", 0.6, R, Math.PI, { slopeDeg: 20, height: 0.06, length: 0.55, width: w, edge: 0.06 });
  ch.place("platform", -0.45, R, Math.PI, { length: 0.3, width: 0.5, height: 0.04, edge: 0.1 });
  ch.place("rock-field", 0, 0, 0, { length: 2.0, width: 0.4, count: 8, height: 0.06, seed: 71 });
  return offroadDef("example-offroad-hills", "Hill Climb Challenge", "advanced", { w: 4.6, h: 2.2 }, ch, { x: -L / 2 + 0.1, y: -R, heading: 0 });
}

function offroadMixed(): TrackDef {
  const w = 0.42;
  const ch = offroadSLoop("ox", w, 0.5);
  ch.place("bumps", -0.45, -0.6, 0, { length: 0.35, width: w, amplitude: 0.012, seed: 81 });
  ch.place("block", 0, -0.466, 0, { depth: 0.06, width: w, height: 0.012, edge: 0.008 });
  ch.place("mud", 0.92, -0.7, 0, { length: 0.38, width: w, grip: 0.45, drag: 0.12 });
  ch.place("rock-field", 1.816, 0, Math.PI / 2, { length: 0.45, width: 0.3, count: 6, height: 0.012, seed: 82 });
  ch.place("hill", 0.85, 0.7, Math.PI, { slopeDeg: 15, height: 0.05, length: 0.55, width: w, edge: 0.06 });
  ch.place("zigzag", 0, 0.7, Math.PI, { length: 0.7, width: 0.3, segments: 4, angle: Math.PI / 8, height: 0.035, minHeight: 0.01, edge: 0.07 });
  ch.place("hurdles", -0.85, 0.7, Math.PI, { count: 2, depth: 0.025, width: w, height: 0.012, spacing: 0.18 });
  ch.place("platform", -1.816, 0, -Math.PI / 2, { length: 0.25, width: 0.5, height: 0.03, edge: 0.08 });
  ch.place("rock-field", 0, 0.12, 0, { length: 1.6, width: 0.28, count: 8, height: 0.055, seed: 83 });
  return offroadDef("example-offroad-mixed", "Mixed Terrain Challenge", "beast", { w: 4.4, h: 2.2 }, ch, { x: -1.08, y: -0.7, heading: 0 });
}

/** The built-in off-road race tracks (also part of EXAMPLE_TRACKS). */
export const OFFROAD_EXAMPLE_IDS = [
  "example-offroad-beginner",
  "example-offroad-intermediate",
  "example-offroad-advanced",
  "example-offroad-rocks",
  "example-offroad-mud",
  "example-offroad-zigzag",
  "example-offroad-hills",
  "example-offroad-mixed",
];

export const EXAMPLE_TRACKS: TrackDef[] = [
  raceBeginner(),
  raceIntermediate(),
  raceAdvanced(),
  offroadBeginner(),
  offroadIntermediate(),
  offroadAdvanced(),
  offroadRocks(),
  offroadMud(),
  offroadZigzag(),
  offroadHills(),
  offroadMixed(),
  lineBeginner(),
  lineIntermediate(),
  lineAdvanced(),
  lineBeast(),
  sumoStandard(),
  sumoRect(),
];

export function getExampleTrack(id: string): TrackDef | undefined {
  return EXAMPLE_TRACKS.find((t) => t.id === id);
}

/** Opponent start pose for sumo: the player's start mirrored through the arena centre, facing it. */
export function sumoOpponentPose(track: TrackDef): Pose {
  return { x: -track.start.x, y: -track.start.y, heading: track.start.heading + Math.PI };
}
