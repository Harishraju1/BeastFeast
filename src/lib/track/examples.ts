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

export const EXAMPLE_TRACKS: TrackDef[] = [
  raceBeginner(),
  raceIntermediate(),
  raceAdvanced(),
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
