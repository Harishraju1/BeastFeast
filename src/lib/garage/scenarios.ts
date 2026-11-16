/**
 * Behaviour scenarios for every reference project. Shared by the vitest suite and the report
 * generator (scripts/garage-report.ts) so the documented results are exactly what the tests ran.
 *
 * Every scenario drives the real stack: firmware → interpreter → circuit → physics → sensors.
 * Custom tracks are built from the same TrackPiece types the Track Designer saves.
 */
import type { Pose, TrackDef, TrackPiece } from "@/lib/sim/types";
import { SimSession } from "@/lib/sim/session";
import { getExampleTrack } from "@/lib/track/examples";
import { TrackChain } from "@/lib/track/builder";
import { compileTrack } from "@/lib/track/compile";
import { getTemplate } from "./index";
import { buildFromTemplate } from "./build";

export interface ScenarioResult {
  id: string;
  project: string;
  category: "line" | "race" | "sumo";
  name: string;
  config: string;
  expected: string;
  actual: string;
  pass: boolean;
  /** false = observed behaviour recorded for students, not a requirement */
  mustPass: boolean;
  limitation?: string;
}

export interface Scenario {
  id: string;
  project: string;
  category: ScenarioResult["category"];
  name: string;
  mustPass: boolean;
  run(): Omit<ScenarioResult, "id" | "project" | "category" | "name" | "mustPass">;
}

// ───────────────────────────── track factories (Track-Designer pieces) ─────────────────────────────

const LINE_SURFACE = { color: "#ffffff", mu: 0.9, lineColor: "#111111" };
const RACE_SURFACE = { color: "#d8d3c4", mu: 1.0, lineColor: "#2d2f33" };

function lineTrack(id: string, pieces: TrackPiece[], start: Pose, size = { w: 3.2, h: 2.4 }): TrackDef {
  return { id, name: id, kind: "line", difficulty: "intermediate", ownerId: "student", size, surface: LINE_SURFACE, pieces, start, laps: 1 };
}

/** Straight 2.4 m line, used for straight-line tracking and lost-line recovery. */
export function straightLine(width = 0.019): TrackDef {
  return lineTrack("custom-straight", [{ id: "s", type: "line-straight", x: -1.2, y: 0, rotation: 0, params: { length: 2.4, lineWidth: width } }], { x: -1.1, y: 0, heading: 0 }, { w: 3, h: 1.2 });
}

/** Rounded-rectangle loop drawn with straights and curves of a chosen radius and line width. */
export function roundedLoop(id: string, radius: number, width: number, long = 1.2, short = 0.5): TrackDef {
  const ch = new TrackChain({ x: -long / 2, y: -(short / 2 + radius), heading: 0 }, id);
  for (let i = 0; i < 2; i++) ch.add("line-straight", { length: long, lineWidth: width }).add("line-curve", { radius, angle: Math.PI / 2, lineWidth: width }).add("line-straight", { length: short, lineWidth: width }).add("line-curve", { radius, angle: Math.PI / 2, lineWidth: width });
  return lineTrack(id, ch.pieces, { x: -long / 2 + 0.1, y: -(short / 2 + radius), heading: 0 });
}

/**
 * A student-style closed course: straight, tight 18 cm curve, straight, sharp 90° corner (TrackDesigner
 * "line-sharp" piece), straight, wide 40 cm curve, straight, tight curve. Leg lengths make the loop close.
 */
export function studentCourse(): TrackDef {
  const w = 0.019;
  const ch = new TrackChain({ x: -0.6, y: -0.5, heading: 0 }, "stu");
  ch.add("line-straight", { length: 1.2, lineWidth: w })
    .add("line-curve", { radius: 0.18, angle: Math.PI / 2, lineWidth: w })
    .add("line-straight", { length: 0.5, lineWidth: w })
    .add("line-sharp", { length: 0.3, angle: Math.PI / 2, lineWidth: w })
    .add("line-straight", { length: 0.86, lineWidth: w })
    .add("line-curve", { radius: 0.4, angle: Math.PI / 2, lineWidth: w })
    .add("line-straight", { length: 0.4, lineWidth: w })
    .add("line-curve", { radius: 0.18, angle: Math.PI / 2, lineWidth: w });
  return lineTrack("custom-student-course", ch.pieces, { x: -0.5, y: -0.5, heading: 0 }, { w: 3.2, h: 2.4 });
}

/** Rounded-rectangle race road with a start line and checkpoints. */
export function customRaceLoop(): TrackDef {
  const w = 0.32;
  const ch = new TrackChain({ x: -0.7, y: -0.75, heading: 0 }, "cr");
  for (let i = 0; i < 2; i++) ch.add("straight", { length: 1.4, width: w }).add("curve", { radius: 0.45, angle: Math.PI / 2, width: w }).add("straight", { length: 0.6, width: w }).add("curve", { radius: 0.45, angle: Math.PI / 2, width: w });
  ch.place("start", -0.5, -0.75, 0, { width: 0.45 });
  ch.place("checkpoint", 1.15, 0, Math.PI / 2, { width: 0.45 });
  ch.place("checkpoint", 0, 0.75, Math.PI, { width: 0.45 });
  return { id: "custom-race-loop", name: "Custom race loop", kind: "race", difficulty: "intermediate", ownerId: "student", size: { w: 4, h: 3 }, surface: RACE_SURFACE, pieces: ch.pieces, start: { x: -0.6, y: -0.75, heading: 0 }, laps: 1 };
}

function straightRoad(withObstacle: boolean): TrackDef {
  const pieces: TrackPiece[] = [{ id: "r", type: "straight", x: -1.4, y: 0, rotation: 0, params: { length: 2.8, width: 0.4 } }];
  if (withObstacle) pieces.push({ id: "o", type: "obstacle", x: 0.6, y: 0, rotation: 0, params: { width: 0.2, depth: 0.2 } });
  return { id: withObstacle ? "custom-road-obstacle" : "custom-road", name: "Straight road", kind: "race", difficulty: "beginner", ownerId: "student", size: { w: 3.4, h: 1.4 }, surface: RACE_SURFACE, pieces, start: { x: -1.2, y: 0, heading: 0 }, laps: 1 };
}

// ───────────────────────────── helpers ─────────────────────────────

const session = (templateId: string, track: TrackDef, extra: Partial<ConstructorParameters<typeof SimSession>[0]> = {}) => {
  const t = getTemplate(templateId)!;
  return new SimSession({ project: buildFromTemplate(t, "test", "original"), track, mode: "code", ...extra });
};

/** Run until the first lap (or timeout); returns lap time, off-track count and worst line distance. */
function runLap(s: SimSession, maxS: number) {
  const compiled = compileTrack(s.track);
  let worst = 0;
  let samples = 0,
    within = 0;
  for (let t = 0; t < maxS; t += 0.5) {
    s.advance(0.5, 1000);
    const p = s.telemetry().pose;
    const d = distToPaths(p.x, p.y, s.track.kind === "line" ? compiled.lines : compiled.roads);
    if (s.time > 3) {
      worst = Math.max(worst, d);
      samples++;
      if (d < 0.03) within++;
    }
    const lap = s.events.find((e) => e.type === "lap" && e.robot === 0);
    if (lap) return { lap: true, time: s.time, worst, onLinePct: samples ? (within / samples) * 100 : 100, off: s.events.filter((e) => e.type === "off-track").length };
    if (s.runtimeStatus?.state === "error") break;
  }
  return { lap: false, time: s.time, worst, onLinePct: samples ? (within / samples) * 100 : 0, off: s.events.filter((e) => e.type === "off-track").length };
}

/** Point `dist` metres further along the road centre-line from the nearest point to (x, y). */
function lookAhead(paths: { points: { x: number; y: number }[] }[], x: number, y: number, dist: number) {
  const pts = paths.flatMap((p) => p.points);
  let bi = 0,
    bd = Infinity;
  pts.forEach((q, i) => {
    const d = Math.hypot(q.x - x, q.y - y);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  let acc = 0;
  for (let i = bi; i < bi + pts.length; i++) {
    const a = pts[i % pts.length],
      b = pts[(i + 1) % pts.length];
    acc += Math.hypot(b.x - a.x, b.y - a.y);
    if (acc >= dist) return b;
  }
  return pts[bi];
}

function distToPaths(x: number, y: number, paths: { points: { x: number; y: number }[] }[]) {
  let best = Infinity;
  for (const p of paths)
    for (let i = 1; i < p.points.length; i++) {
      const a = p.points[i - 1],
        b = p.points[i];
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
      best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
    }
  return best;
}

const fmt = (r: ReturnType<typeof runLap>) => (r.lap ? `Lap completed in ${r.time.toFixed(1)} s; on the line ${r.onLinePct.toFixed(0)}% of samples; ${r.off} off-track event(s)` : `No lap within ${r.time.toFixed(0)} s (${r.off} off-track event(s), worst distance ${(r.worst * 100).toFixed(1)} cm)`);

// ───────────────────────────── LINE ─────────────────────────────

function lineScenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const id of ["LF-01", "LF-02", "LF-03"]) {
    out.push({
      id: `${id}-straight`, project: id, category: "line", name: "Straight line", mustPass: true,
      run() {
        const s = session(id, straightLine());
        let maxDev = 0;
        for (let t = 0; t < 12 && s.telemetry().pose.x < 0.9; t += 0.25) {
          s.advance(0.25, 500);
          if (s.time > 3.5) maxDev = Math.max(maxDev, Math.abs(s.telemetry().pose.y));
        }
        const x = s.telemetry().pose.x;
        return { config: "2.4 m straight black line, 19 mm tape", expected: "Travels along the line, staying within 3 cm of it", actual: `Reached x = ${x.toFixed(2)} m; max deviation after calibration ${(maxDev * 100).toFixed(1)} cm`, pass: x > 0.85 && maxDev < 0.03 };
      },
    });
    out.push({
      id: `${id}-curves`, project: id, category: "line", name: "Curved line", mustPass: true,
      run() {
        const r = runLap(session(id, roundedLoop("custom-curves", 0.35, 0.019)), 60);
        return { config: "Student loop: 1.2 m straights joined by 0.35 m-radius curves", expected: "Completes a lap", actual: fmt(r), pass: r.lap };
      },
    });
    out.push({
      id: `${id}-sharp`, project: id, category: "line", name: "Sharp turns", mustPass: true,
      run() {
        const r = runLap(session(id, getExampleTrack("example-line-intermediate-sharp")!), 60);
        return { config: "Line · Sharp Corners (90° corners)", expected: "Completes a lap; may briefly leave the line at corners", actual: fmt(r), pass: r.lap };
      },
    });
    for (const w of [0.012, 0.03]) {
      out.push({
        id: `${id}-width-${w * 1000}`, project: id, category: "line", name: `Line width ${w * 1000} mm`, mustPass: true,
        run() {
          const r = runLap(session(id, roundedLoop(`custom-w${w}`, 0.4, w)), 60);
          return { config: `Rounded loop with ${w * 1000} mm line`, expected: "Completes a lap", actual: fmt(r), pass: r.lap };
        },
      });
    }
    out.push({
      id: `${id}-intersection`, project: id, category: "line", name: "Intersections", mustPass: true,
      run() {
        const r = runLap(session(id, getExampleTrack("example-line-advanced-figure8")!), 60);
        return { config: "Line · Figure-8 Crossing (one + intersection and a side loop)", expected: "Crosses the intersection and completes a lap", actual: fmt(r), pass: r.lap };
      },
    });
    out.push({
      id: `${id}-custom`, project: id, category: "line", name: "Custom student course", mustPass: false,
      run() {
        const r = runLap(session(id, studentCourse()), 60);
        return { config: "Student course: straight, 18 cm-radius curve, sharp 90° corner, wide curve", expected: "Attempts the course using only its sensors (tight 18 cm curves are hard)", actual: fmt(r), pass: r.lap, limitation: r.lap ? undefined : "Curves tighter than the robot can turn at its base speed make it lose the line; it then searches for it" };
      },
    });
    out.push({
      id: `${id}-lost`, project: id, category: "line", name: "Lost-line recovery", mustPass: true,
      run() {
        const tr = straightLine();
        const s = session(id, { ...tr, start: { x: -1.0, y: 0.025, heading: -0.35 } });
        let found = -1;
        for (let t = 0; t < 12; t += 0.1) {
          s.advance(0.1, 200);
          if (s.time > 3 && Math.abs(s.telemetry().pose.y) < 0.012 && found < 0) found = s.time;
        }
        const y = s.telemetry().pose.y;
        return { config: "Starts 25 mm beside the line, angled 20° across it", expected: "Re-acquires the line and ends up following it (|y| < 1.5 cm)", actual: `First centred at ${found < 0 ? "never" : found.toFixed(1) + " s"}; final offset ${(y * 100).toFixed(1)} cm`, pass: found > 0 && Math.abs(y) < 0.015 };
      },
    });
  }
  for (const id of ["LF-02", "LF-03"]) {
    out.push({
      id: `${id}-calibration`, project: id, category: "line", name: "Sensor calibration", mustPass: true,
      run() {
        const s = session(id, getExampleTrack("example-line-beginner-oval")!);
        s.advance(3.5, 5000);
        const m = /CAL,([\d,-]+)/.exec(s.serialOutput) ?? /Calibration done:\r\n([^\r]+)/.exec(s.serialOutput);
        const pairs = (m?.[1] ?? "").trim().split(/\s+|,/).filter(Boolean);
        const ranges = pairs.map((p) => p.split("-").map(Number)).filter((r) => r.length === 2);
        const ok = ranges.length >= 5 && ranges.every(([a, b]) => b - a > 400);
        return { config: "Firmware sweeps over the line during its first seconds", expected: "Every sensor records a white minimum and a black maximum at least 400 counts apart", actual: m ? `Ranges: ${pairs.join(" ")}` : "No calibration output", pass: ok };
      },
    });
  }
  out.push({
    id: "LF-03-pid-telemetry", project: "LF-03", category: "line", name: "PID telemetry and live tuning", mustPass: true,
    run() {
      const s = session("LF-03", getExampleTrack("example-line-beginner-oval")!);
      s.advance(5, 6000);
      s.sendSerial("P0.20\n");
      s.advance(2, 3000);
      const lines = s.serialOutput.split(/\r?\n/).filter((l) => l.startsWith("PID,"));
      const last = lines[lines.length - 1]?.split(",").slice(1).map(Number) ?? [];
      const ok = lines.length > 30 && last.length === 9 && last.every((v) => Number.isFinite(v));
      return { config: "Runs 5 s, then sends P0.20 over Serial", expected: "Telemetry lines PID,error,prev,integral,derivative,output,left,right,ticksL,ticksR stream every 100 ms; firmware keeps running after retuning", actual: `${lines.length} telemetry lines; last: ${lines[lines.length - 1] ?? "none"}`, pass: ok && s.runtimeStatus?.state !== "error" };
    },
  });
  return out;
}

// ───────────────────────────── RACE ─────────────────────────────

function raceScenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const id of ["RR-01", "RR-02"]) {
    out.push({
      id: `${id}-drive`, project: id, category: "race", name: "Forward · reverse · left · right · stop (via Bluetooth)", mustPass: true,
      run() {
        const s = session(id, straightRoad(false));
        const h0 = s.telemetry().pose.heading;
        s.sendSerial("F");
        s.advance(0.2, 400);
        const vEarly = s.telemetry().speed;
        s.advance(1.3, 2000);
        const vFwd = s.telemetry().speed;
        const dh = s.telemetry().pose.heading - h0;
        s.sendSerial("S");
        s.advance(0.6, 1000);
        const vStop = s.telemetry().speed;
        s.sendSerial("B");
        s.advance(1.0, 2000);
        const vRev = s.telemetry().speed;
        s.sendSerial("S");
        s.advance(0.6, 1000);
        const hL0 = s.telemetry().pose.heading;
        s.sendSerial("L");
        s.advance(0.8, 1500);
        const turnL = s.telemetry().pose.heading - hL0;
        s.sendSerial("R");
        s.advance(0.8, 1500);
        const turnR = s.telemetry().pose.heading - hL0 - turnL;
        s.sendSerial("S");
        s.advance(0.5, 1000);
        const pass = vFwd > 0.3 && Math.abs(dh) < 0.15 && vEarly < vFwd * 0.8 && Math.abs(vStop) < 0.05 && vRev < -0.15 && turnL > 0.4 && turnR < -0.4;
        return {
          config: "Commands F, S, B, S, L, R, S sent over the HC-05 serial link",
          expected: "Accelerates forward gradually, brakes to a stop, reverses, spins left then right",
          actual: `forward ${vFwd.toFixed(2)} m/s (${vEarly.toFixed(2)} m/s after 0.2 s, heading drift ${(dh * 57.3).toFixed(1)}°); after S ${vStop.toFixed(3)} m/s; reverse ${vRev.toFixed(2)} m/s; left ${(turnL * 57.3).toFixed(0)}°, right ${(turnR * 57.3).toFixed(0)}°`,
          pass,
        };
      },
    });
    out.push({
      id: `${id}-brake`, project: id, category: "race", name: "Acceleration and braking", mustPass: true,
      run() {
        const s = session(id, straightRoad(false));
        s.sendSerial("+F");
        const v: number[] = [];
        for (let i = 0; i < 10; i++) {
          s.advance(0.1, 200);
          v.push(s.telemetry().speed);
        }
        s.sendSerial("S");
        let stopT = -1;
        for (let i = 0; i < 20 && stopT < 0; i++) {
          s.advance(0.05, 100);
          if (Math.abs(s.telemetry().speed) < 0.02) stopT = (i + 1) * 0.05;
        }
        const rising = v.every((x, i) => i === 0 || x >= v[i - 1] - 0.005);
        return { config: "Boost on + forward for 1 s, then stop", expected: "Speed rises over several samples (acceleration ramp); stops in under 0.6 s (braking ramp)", actual: `speed samples ${v.map((x) => x.toFixed(2)).join(" → ")}; stopped after ${stopT < 0 ? ">1 s" : stopT.toFixed(2) + " s"}`, pass: rising && v[9] > v[1] && stopT > 0 && stopT < 0.6 };
      },
    });
    out.push({
      id: `${id}-collision`, project: id, category: "race", name: "Collision", mustPass: true,
      run() {
        const s = session(id, straightRoad(true));
        s.sendSerial("F");
        s.advance(4, 6000);
        const hit = s.events.find((e) => e.type === "collision" && e.robot === 0);
        return { config: "Straight road with a 20 cm obstacle 1.8 m ahead; driver holds W", expected: "Robot hits the obstacle and stops against it", actual: hit ? `Collision at ${hit.t.toFixed(2)} s; final speed ${s.telemetry().speed.toFixed(2)} m/s` : "No collision", pass: !!hit && Math.abs(s.telemetry().speed) < 0.05 };
      },
    });
    out.push({
      id: `${id}-custom-track`, project: id, category: "race", name: "Custom track (keyboard driver)", mustPass: true,
      run() {
        const track = customRaceLoop();
        const s = session(id, track);
        // a scripted "driver" pressing keys like a student: aim at a point 30 cm ahead on the road centre
        const roads = compileTrack(track).roads;
        let last = "";
        for (let t = 0; t < 60; t += 0.05) {
          const p = s.telemetry().pose;
          const aim = lookAhead(roads, p.x, p.y, 0.3);
          let err = Math.atan2(aim.y - p.y, aim.x - p.x) - p.heading;
          err = Math.atan2(Math.sin(err), Math.cos(err));
          const key = err > 0.45 ? "L" : err < -0.45 ? "R" : err > 0.1 ? "Q" : err < -0.1 ? "E" : "F";
          if (key !== last) {
            s.sendSerial(key);
            last = key;
          }
          s.advance(0.05, 100);
          if (s.events.some((e) => e.type === "lap")) break;
        }
        const lap = s.events.find((e) => e.type === "lap");
        return { config: "Student-built rounded-rectangle road; keys chosen by a scripted driver (Q/E/F)", expected: "The robot responds to the keys on the new track and completes a lap", actual: lap ? `Lap in ${lap.t.toFixed(1)} s; ${s.events.filter((e) => e.type === "off-track").length} off-track event(s)` : `No lap; progress ${(((s.telemetry().race?.progress ?? 0) * 100) | 0)}%`, pass: !!lap };
      },
    });
  }
  out.push({
    id: "RR-03-encoders", project: "RR-03", category: "race", name: "Encoder speed control", mustPass: true,
    run() {
      const s = session("RR-03", straightRoad(false));
      s.advance(3, 4000);
      const lines = s.serialOutput.split(/\r?\n/).filter((l) => l.startsWith("RACE,"));
      const last = lines[lines.length - 1]?.split(",").map(Number) ?? [];
      const rpm = (last[1] + last[2]) / 2;
      const truth = (Object.values(s.telemetry().motorRpm).reduce((a, b) => a + Math.abs(b), 0) / 2) | 0;
      const speedCm = last[3];
      const real = s.telemetry().speed * 100;
      return { config: "Straight road, setpoint 18 ticks / 50 ms", expected: "Firmware RPM from encoder ticks matches the simulated wheel RPM within 15%, and its speed estimate matches the real speed", actual: `firmware ${rpm.toFixed(0)} rpm vs simulated ${truth} rpm; firmware ${speedCm.toFixed(1)} cm/s vs real ${real.toFixed(1)} cm/s`, pass: Math.abs(rpm - truth) < truth * 0.15 && Math.abs(speedCm - real) < real * 0.2 };
    },
  });
  for (const tr of ["example-race-beginner-oval", "custom"] as const) {
    out.push({
      id: `RR-03-lap-${tr}`, project: "RR-03", category: "race", name: tr === "custom" ? "Custom track (autonomous)" : "Autonomous lap", mustPass: true,
      run() {
        const track = tr === "custom" ? customRaceLoop() : getExampleTrack(tr)!;
        const r = runLap(session("RR-03", track), 60);
        return { config: track.name, expected: "Keeps itself on the road with its two road sensors and completes a lap", actual: fmt(r), pass: r.lap };
      },
    });
  }
  out.push({
    id: "RR-03-obstacles", project: "RR-03", category: "race", name: "Obstacle course", mustPass: false,
    run() {
      const r = runLap(session("RR-03", getExampleTrack("example-race-intermediate-scurves")!), 60);
      return { config: "Race · S-Curves & Obstacles", expected: "Observed behaviour only — RR-03 has no obstacle sensor", actual: fmt(r), pass: r.lap, limitation: "RR-03 cannot see obstacles; add an HC-SR04 and avoidance logic as an extension exercise" };
    },
  });
  return out;
}

// ───────────────────────────── SUMO ─────────────────────────────

function sumoScenarios(): Scenario[] {
  const out: Scenario[] = [];
  const dohyo = () => getExampleTrack("example-sumo-standard-dohyo")!;
  for (const id of ["RW-01", "RW-02", "RW-03"]) {
    out.push({
      id: `${id}-edge`, project: id, category: "sumo", name: "Edge detection (alone for 40 s)", mustPass: true,
      run() {
        const s = session(id, dohyo());
        s.advance(40, 50000);
        const out0 = s.world.getSnapshot().robots[0].out;
        return { config: "Standard dohyo, no opponent", expected: "Searches for 40 s without ever leaving the ring", actual: out0 ? "Left the ring" : `Stayed inside; drove ${s.telemetry().distance.toFixed(1)} m`, pass: !out0 };
      },
    });
    out.push({
      id: `${id}-recovery`, project: id, category: "sumo", name: "Boundary recovery", mustPass: true,
      run() {
        const s = session(id, { ...dohyo(), start: { x: 0.2, y: 0, heading: 0 } });
        s.advance(14, 16000);
        const out0 = s.world.getSnapshot().robots[0].out;
        return { config: "Starts 20 cm from the centre facing straight at the border", expected: "Edge sensors see the white border; it reverses, turns away and stays in", actual: out0 ? "Left the ring" : `Stayed inside (final distance from centre ${Math.hypot(s.telemetry().pose.x, s.telemetry().pose.y).toFixed(2)} m)`, pass: !out0 };
      },
    });
    out.push({
      id: `${id}-detect-attack`, project: id, category: "sumo", name: "Opponent detection, distance and attack", mustPass: true,
      run() {
        // a passive dummy: the opponent never starts (start delay longer than the test)
        const s = session(id, dohyo(), { opponent: "beginner", opponentStartDelayS: 1e6 });
        s.advance(4.9, 6000);
        const truth = Object.values(s.sensorReadings(0)).find((r) => r.kind === "distance");
        let won = -1;
        let firstContact = -1;
        for (let t = 0; t < 15 && won < 0; t += 0.1) {
          s.advance(0.1, 200);
          if (firstContact < 0 && s.events.some((e) => e.type === "collision")) firstContact = s.time;
          if (s.world.getSnapshot().robots[1].out) won = s.time;
        }
        const d = truth && truth.kind === "distance" ? truth.distance : null;
        return { config: "Opponent placed opposite and left passive", expected: "A forward distance sensor sees the opponent, the robot drives at it, collides and pushes it out", actual: `Sensor reading at the start: ${d === null ? "nothing" : (d * 100).toFixed(0) + " cm"}; first contact ${firstContact < 0 ? "none" : firstContact.toFixed(2) + " s"}; opponent out ${won < 0 ? "no" : "at " + won.toFixed(2) + " s"}`, pass: d !== null && firstContact > 0 && won > 0 };
      },
    });
    for (const level of ["beginner", "intermediate", "advanced", "beast"] as const) {
      out.push({
        id: `${id}-match-${level}`, project: id, category: "sumo", name: `Match vs ${level === "beast" ? "Beast Mode" : level} AI`, mustPass: false,
        run() {
          const s = session(id, dohyo(), { opponent: level, opponentStartDelayS: 5 });
          let res = "draw (time limit)";
          for (let t = 0; t < 180; t += 0.1) {
            s.advance(0.1, 200);
            const sn = s.world.getSnapshot();
            if (sn.robots[1].out) {
              res = `WIN at ${s.time.toFixed(1)} s`;
              break;
            }
            if (sn.robots[0].out) {
              res = `loss at ${s.time.toFixed(1)} s`;
              break;
            }
          }
          const contacts = s.events.filter((e) => e.type === "collision").length;
          return { config: `Standard dohyo, ${level} opponent, 5 s start delay for both`, expected: "Match ends by a ring-out or the time limit, decided by physics", actual: `${res}; ${contacts} collision event(s)`, pass: res !== "" && contacts > 0, limitation: "The reference robots' 25GA370 motors and sticky tyres out-push the built-in opponent robots, so head-on starts are usually decided in the first push" };
        },
      });
    }
  }
  out.push({
    id: "RW-02-distance", project: "RW-02", category: "sumo", name: "Distance measurement accuracy", mustPass: true,
    run() {
      const s = session("RW-02", dohyo(), { opponent: "beginner", opponentStartDelayS: 1e6 });
      s.advance(5.15, 6000);
      const truth = Object.entries(s.sensorReadings(0)).filter(([, r]) => r.kind === "distance").map(([, r]) => (r.kind === "distance" ? r.distance : null));
      const line = s.serialOutput.split(/\r?\n/).filter((l) => l.startsWith("SUMO,")).pop() ?? "";
      const [, sharp, us] = line.split(",").map(Number);
      const t = truth.find((x) => x !== null) ?? null;
      const ok = t !== null && Math.abs(us - t * 100) < 4;
      return { config: "Opponent passive, robot just after its start delay", expected: "Ultrasonic distance computed by the firmware (µs / 58) is within 4 cm of the simulated range", actual: `firmware: ultrasonic ${us} cm, Sharp ${sharp} cm; simulated range ${t === null ? "none" : (t * 100).toFixed(1) + " cm"}`, pass: ok, limitation: "The Sharp sensor is out of range (>80 cm) at the start distance and reports 999" };
    },
  });
  return out;
}

export function allScenarios(): Scenario[] {
  return [...lineScenarios(), ...raceScenarios(), ...sumoScenarios()];
}

export function runScenario(s: Scenario): ScenarioResult {
  try {
    return { id: s.id, project: s.project, category: s.category, name: s.name, mustPass: s.mustPass, ...s.run() };
  } catch (e) {
    return { id: s.id, project: s.project, category: s.category, name: s.name, mustPass: s.mustPass, config: "-", expected: "-", actual: `Error: ${(e as Error).message}`, pass: false };
  }
}
