/**
 * Line-following test matrix: every line robot (Garage LF-01 / LF-02 / LF-03 and the Code Studio
 * templates line-basic / line-pid on the reference robot) on straight lines, 90° and acute corners,
 * S-bends, a 12 mm line, a wide curve, a closed mixed course, all example line tracks, several
 * speeds and lost-line starts. Everything runs the real stack (firmware → interpreter → circuit →
 * physics → sensors); nothing is scripted.
 *
 * Metrics per run (robot centre = telemetry pose):
 *  - completion: a lap (closed tracks) or reaching the end of an open line while on it
 *  - on-line %: samples within 3 cm of the line; worst distance
 *  - backwards: the centre moving backwards (speed < −2 cm/s) for more than 0.3 s
 *  - turned around: heading more than 120° away from the local track direction, within 8 cm of
 *    the line, for more than 1 s (= following the track the wrong way). NB: the simulator counts a
 *    lap in either direction, so a robot that turns round still "completes" laps — this check is
 *    what catches it.
 *  - lost time: longest stretch with no sensor (that the code uses) seeing the line
 */
import { afterAll, describe, expect, it } from "vitest";
import type { Pose, TrackDef, TrackPiece, Vec2 } from "@/lib/sim/types";
import type { Project } from "@/lib/types";
import { SimSession } from "@/lib/sim/session";
import { TrackChain } from "@/lib/track/builder";
import { compileTrack } from "@/lib/track/compile";
import { getExampleTrack } from "@/lib/track/examples";
import { getTemplate } from "@/lib/garage";
import { buildFromTemplate } from "@/lib/garage/build";
import { referenceLineFollower } from "@/lib/robot/reference";
import { CODE_TEMPLATES } from "@/lib/code/templates";
import { compile, getBoard } from "@/lib/arduino";

// ───────────────────────────── robots ─────────────────────────────

type RobotId = "LF-01" | "LF-02" | "LF-03" | "line-basic" | "line-pid";
const ROBOTS: RobotId[] = ["LF-01", "LF-02", "LF-03", "line-basic", "line-pid"];
const isTemplate = (id: RobotId) => id === "line-basic" || id === "line-pid";
const tplCode = (id: string) => CODE_TEMPLATES.find((t) => t.id === id)!.code;
const sourceOf = (id: RobotId) => (isTemplate(id) ? tplCode(id) : getTemplate(id)!.firmware.source);

function makeProject(id: RobotId, code?: string): Project {
  if (isTemplate(id)) return { ...referenceLineFollower("t"), code: code ?? tplCode(id) };
  const p = buildFromTemplate(getTemplate(id)!, "t", "original");
  return code ? { ...p, code } : p;
}

/** LF-02 / LF-03 calibrate (sweep over the line) before they start following. */
const settleTime = (id: RobotId) => (id === "LF-02" ? 2.6 : id === "LF-03" ? 2.2 : 0.2);
/** Analog arrays see a 12 mm line between two sensors at ~25 % darkness; digital ones switch at 50 %. line-basic uses only A1–A3. */
const lostOpts = (id: RobotId): Pick<RunOpts, "lostBelow" | "channels"> => (id === "LF-02" || id === "LF-03" ? { lostBelow: 0.25 } : id === "line-basic" ? { channels: [1, 2, 3] } : {});

/** Same robot at a different base speed: string replacement for the templates, the Serial 'B' command for the Garage firmware. */
function atSpeed(id: RobotId, base: number): { code?: string; serial?: { at: number; text: string }[] } {
  if (isTemplate(id)) {
    const code = tplCode(id).replace(/int baseSpeed = \d+;/, `int baseSpeed = ${base};`);
    if (code === tplCode(id) && !tplCode(id).includes(`int baseSpeed = ${base};`)) throw new Error(`no baseSpeed in ${id}`);
    return { code };
  }
  return { serial: [{ at: 0.05, text: `B${base}\n` }] };
}

// ───────────────────────────── tracks ─────────────────────────────

const LINE_SURFACE = { color: "#ffffff", mu: 0.9, lineColor: "#111111" };
const W = 0.019;

/** Centre the floor on the drawing with ≥ 40 cm of white floor around every line. */
function fitTrack(id: string, pieces: TrackPiece[], start: Pose, closed: boolean): TrackDef {
  const probe: TrackDef = { id, name: id, kind: "line", difficulty: "intermediate", ownerId: "student", size: { w: 50, h: 50 }, surface: LINE_SURFACE, pieces, start, laps: 1 };
  const pts = compileTrack(probe).lines.flatMap((l) => l.points);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {
    ...probe,
    size: { w: Math.max(...xs) - Math.min(...xs) + 0.8, h: Math.max(...ys) - Math.min(...ys) + 0.8 },
    pieces: pieces.map((p) => ({ ...p, x: p.x - cx, y: p.y - cy })),
    start: { ...start, x: start.x - cx, y: start.y - cy },
    laps: closed ? 1 : undefined,
  };
}

type Seg = [TrackPiece["type"], TrackPiece["params"]];
function openTrack(id: string, segs: Seg[]): TrackDef {
  const ch = new TrackChain({ x: 0, y: 0, heading: 0 }, id);
  for (const [t, p] of segs) ch.add(t, { lineWidth: W, ...p });
  return fitTrack(id, ch.pieces, { x: 0.1, y: 0, heading: 0 }, false);
}

const PI = Math.PI;
const corner = (id: string, angle: number) => openTrack(id, [["line-straight", { length: 0.7 }], ["line-sharp", { length: 0.3, angle }], ["line-straight", { length: 0.6 }]]);

/** Closed course: straight, 90° left and right corners, a 12 mm S-bend, a 135° corner, a 0.6 m-radius curve and two tight curves. */
function mixedCourse(): TrackDef {
  const n = 0.012;
  const ch = new TrackChain({ x: 0, y: 0, heading: 0 }, "mix");
  ch.add("line-straight", { length: 0.7, lineWidth: W })
    .add("line-sharp", { length: 0.2, angle: PI / 2, lineWidth: W })
    .add("line-straight", { length: 0.3, lineWidth: W })
    .add("line-sharp", { length: 0.2, angle: -PI / 2, lineWidth: W })
    .add("line-straight", { length: 0.15, lineWidth: W })
    .add("line-curve", { radius: 0.25, angle: PI / 4, lineWidth: n })
    .add("line-curve", { radius: 0.25, angle: -PI / 4, lineWidth: n })
    .add("line-straight", { length: 0.25, lineWidth: n })
    .add("line-sharp", { length: 0.25, angle: (3 * PI) / 4, lineWidth: W })
    .add("line-straight", { length: 0.3, lineWidth: W })
    .add("line-curve", { radius: 0.6, angle: PI / 4, lineWidth: W });
  // close the loop: straight a (heading π) → r 0.2 curve → straight b (heading −π/2) → r 0.2 curve → origin
  const a = ch.pose.x - 0.2 + 0.2;
  const b = ch.pose.y - 0.2 - 0.2;
  ch.add("line-straight", { length: a, lineWidth: W }).add("line-curve", { radius: 0.2, angle: PI / 2, lineWidth: W }).add("line-straight", { length: b, lineWidth: W }).add("line-curve", { radius: 0.2, angle: PI / 2, lineWidth: W });
  if (Math.hypot(ch.pose.x, ch.pose.y) > 1e-6 || a < 0.05 || b < 0.05) throw new Error("mixed course does not close");
  return fitTrack("mixed", ch.pieces, { x: 0.15, y: 0, heading: 0 }, true);
}

const TRACKS: Record<string, () => TrackDef> = {
  straight: () => openTrack("straight", [["line-straight", { length: 2.0 }]]),
  "90° left": () => corner("left90", PI / 2),
  "90° right": () => corner("right90", -PI / 2),
  "120° left": () => corner("left120", (2 * PI) / 3),
  "135° left": () => corner("left135", (3 * PI) / 4),
  "135° right": () => corner("right135", (-3 * PI) / 4),
  "S-bend": () => openTrack("s-shape", [["line-straight", { length: 0.4 }], ["line-curve", { radius: 0.25, angle: PI / 2 }], ["line-curve", { radius: 0.25, angle: -PI }], ["line-curve", { radius: 0.25, angle: PI / 2 }], ["line-straight", { length: 0.5 }]]),
  "12 mm line": () => openTrack("narrow", [["line-straight", { length: 0.6, lineWidth: 0.012 }], ["line-curve", { radius: 0.3, angle: PI / 2, lineWidth: 0.012 }], ["line-sharp", { length: 0.3, angle: -PI / 2, lineWidth: 0.012 }], ["line-straight", { length: 0.5, lineWidth: 0.012 }]]),
  "wide curve r 0.7 m": () => openTrack("wide", [["line-straight", { length: 0.4 }], ["line-curve", { radius: 0.7, angle: PI / 2 }], ["line-curve", { radius: 0.7, angle: -PI / 2 }], ["line-straight", { length: 0.4 }]]),
  "mixed closed course": mixedCourse,
  "Line · Beginner Oval": () => getExampleTrack("example-line-beginner-oval")!,
  "Line · Sharp Corners": () => getExampleTrack("example-line-intermediate-sharp")!,
  "Line · Figure-8 Crossing": () => getExampleTrack("example-line-advanced-figure8")!,
  "Line · Beast Zig-Zag": () => getExampleTrack("example-line-beast-zigzag")!,
};

// ───────────────────────────── geometry ─────────────────────────────

interface DirPoly {
  points: Vec2[];
  /** +1 = drawn in the driving direction, −1 = drawn against it, 0 = may be driven either way */
  dir: number;
}

function directedLines(track: TrackDef): DirPoly[] {
  return compileTrack(track).lines.map((l) => {
    let dir = 1;
    if (track.id === "example-line-advanced-figure8") {
      const xs = l.points.map((p) => p.x);
      if (Math.max(...xs) - Math.min(...xs) < 1e-6) dir = -1; // the "+" cross line is drawn upwards but driven downwards
      if (xs.reduce((s, x) => s + x, 0) / xs.length > 0.9) dir = 0; // tangent side loop
    }
    return { points: l.points, dir };
  });
}

function nearest(x: number, y: number, polys: DirPoly[]) {
  let best = Infinity, tx = 1, ty = 0, dir = 1, poly = -1;
  polys.forEach((p, pi) => {
    for (let i = 1; i < p.points.length; i++) {
      const a = p.points[i - 1], b = p.points[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
      const d = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
      if (d < best) {
        best = d;
        tx = dx / Math.sqrt(L2);
        ty = dy / Math.sqrt(L2);
        dir = p.dir;
        poly = pi;
      }
    }
  });
  return { d: best, tx, ty, dir, poly };
}

// ───────────────────────────── run + metrics ─────────────────────────────

interface RunOpts {
  maxS?: number;
  serial?: { at: number; text: string }[];
  lostBelow?: number;
  channels?: number[];
  /** keep simulating this long after the end of an open line was reached */
  afterEndS?: number;
}

interface Metrics {
  completed: boolean;
  time: number;
  onLinePct: number;
  worst: number;
  maxBackwardsS: number;
  maxWrongWayS: number;
  maxLostS: number;
  /** first time the centre is within 1.5 cm of the line and heading along it (±20°) */
  reacquireS: number;
  error?: string;
  final?: { pose: Pose; speed: number; turnLast05s: number; distFromEnd: number };
}

function run(project: Project, track: TrackDef, settle: number, opts: RunOpts = {}): Metrics {
  const s = new SimSession({ project, track, mode: "code" });
  const m: Metrics = { completed: false, time: 0, onLinePct: 0, worst: 0, maxBackwardsS: 0, maxWrongWayS: 0, maxLostS: 0, reacquireS: -1 };
  if (!s.compileResult?.ok) return { ...m, error: `does not compile: ${JSON.stringify(s.compileResult?.diagnostics).slice(0, 300)}` };
  const polys = directedLines(track);
  const closed = !!track.laps;
  const lastPts = polys[polys.length - 1].points;
  const end = lastPts[lastPts.length - 1];
  const serial = [...(opts.serial ?? [])].sort((a, b) => a.at - b.at);
  const dt = 0.02;
  let samples = 0, within = 0, back = 0, wrong = 0, lost = 0;
  let endAt = -1;
  const headings: number[] = [];
  while (s.time < (opts.maxS ?? 45)) {
    while (serial.length && serial[0].at <= s.time + 1e-9) s.sendSerial(serial.shift()!.text);
    s.advance(dt, 100);
    if (s.runtimeStatus?.state === "error") return { ...m, time: s.time, error: "runtime error" };
    const tel = s.telemetry();
    const p = tel.pose;
    const n = nearest(p.x, p.y, polys);
    headings.push(p.heading);
    if (s.time > settle) {
      samples++;
      if (n.d < 0.03) within++;
      m.worst = Math.max(m.worst, n.d);
      back = tel.speed < -0.02 ? back + dt : 0;
      m.maxBackwardsS = Math.max(m.maxBackwardsS, back);
      const along = Math.cos(p.heading) * n.tx + Math.sin(p.heading) * n.ty;
      wrong = n.dir !== 0 && n.d < 0.08 && along * n.dir < -0.5 ? wrong + dt : 0;
      m.maxWrongWayS = Math.max(m.maxWrongWayS, wrong);
      const refl = Object.values(s.sensorReadings()).flatMap((r) => (r.kind === "reflectance" ? r.darkness : []));
      lost = refl.filter((_, i) => !opts.channels || opts.channels.includes(i)).every((v) => v < (opts.lostBelow ?? 0.5)) ? lost + dt : 0;
      m.maxLostS = Math.max(m.maxLostS, lost);
      if (m.reacquireS < 0 && n.d < 0.015 && along * (n.dir || 1) > 0.94) m.reacquireS = s.time;
    }
    if (endAt < 0) {
      if (closed ? s.events.some((e) => e.type === "lap" && e.robot === 0) : Math.hypot(p.x - end.x, p.y - end.y) < 0.2 && n.poly === polys.length - 1 && n.d < 0.04) {
        m.completed = true;
        endAt = s.time;
      }
    }
    if (endAt >= 0 && s.time >= endAt + (opts.afterEndS ?? 0)) break;
  }
  const tel = s.telemetry();
  const k = Math.round(0.5 / dt);
  m.final = { pose: tel.pose, speed: tel.speed, turnLast05s: headings.length > k ? Math.abs(headings[headings.length - 1] - headings[headings.length - 1 - k]) : 0, distFromEnd: Math.hypot(tel.pose.x - end.x, tel.pose.y - end.y) };
  m.time = endAt >= 0 ? endAt : s.time;
  m.onLinePct = samples ? (within / samples) * 100 : 0;
  return m;
}

const results: { robot: string; scenario: string; ok: string; time: string; "on-line %": string; "worst cm": string; "backwards s": string; "wrong-way s": string; "lost s": string }[] = [];
function record(robot: string, scenario: string, m: Metrics) {
  results.push({
    robot,
    scenario,
    ok: m.error ? "ERROR" : m.completed ? "yes" : "NO",
    time: m.time.toFixed(1),
    "on-line %": m.onLinePct.toFixed(0),
    "worst cm": (m.worst * 100).toFixed(1),
    "backwards s": m.maxBackwardsS.toFixed(2),
    "wrong-way s": m.maxWrongWayS.toFixed(2),
    "lost s": m.maxLostS.toFixed(2),
  });
}
afterAll(() => {
  if (results.length) console.table(results);
});

/** The common pass criteria: finished, never followed the track backwards, never reversed. */
function expectGoodRun(m: Metrics, { worst = 0.08, onLine = 55, lost = 1.0 } = {}) {
  expect(m.error).toBeUndefined();
  expect(m.completed, "completes the lap / reaches the end of the line").toBe(true);
  expect(m.maxWrongWayS, "never follows the track the wrong way for more than 1 s").toBeLessThanOrEqual(1);
  expect(m.maxBackwardsS, "never drives backwards for more than 0.3 s").toBeLessThanOrEqual(0.3);
  expect(m.worst, "worst distance of the robot centre from the line").toBeLessThan(worst);
  expect(m.onLinePct, "share of samples with the centre within 3 cm of the line").toBeGreaterThanOrEqual(onLine);
  expect(m.maxLostS, "longest time without any sensor on the line (recovery time)").toBeLessThan(lost);
}

const SLOW = 180_000;

// ───────────────────────────── tests ─────────────────────────────

describe("all line firmware compiles in the BEAST interpreter", () => {
  for (const id of ROBOTS) {
    it(id, () => {
      const board = isTemplate(id) ? "uno" : getTemplate(id)!.firmware.board;
      const r = compile(sourceOf(id), { board: getBoard(board) });
      expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(r.ok).toBe(true);
    });
  }
});

describe("reverse-command validation: motor polarity and steering direction", () => {
  for (const id of ROBOTS) {
    it(`${id}: equal positive commands drive forward, a left command turns counter-clockwise, a right command clockwise`, () => {
      const src = sourceOf(id);
      const fn = /void (drive|setMotors)\(int left, int right\)/.exec(src)![1];
      // the robot's own drive helper and wiring; setup() without the calibration sweep; a scripted loop()
      const code = `${src.slice(0, src.indexOf("void loop()")).replace(/\n\s*calibrate\(\);/, "\n")}
long t0 = -1;
void loop() {
  if (t0 < 0) t0 = millis();
  long t = millis() - t0;
  if (t < 1000) ${fn}(150, 150);
  else if (t < 1400) ${fn}(0, 0);
  else if (t < 2200) ${fn}(60, 200);
  else if (t < 2600) ${fn}(0, 0);
  else if (t < 3400) ${fn}(200, 60);
  else ${fn}(0, 0);
}
`;
      const track = { ...TRACKS.straight(), size: { w: 6, h: 6 } };
      const s = new SimSession({ project: makeProject(id, code), track, mode: "code" });
      expect(s.compileResult?.ok).toBe(true);
      const p0 = { ...s.telemetry().pose };
      s.advance(1.0, 2000);
      const p1 = { ...s.telemetry().pose };
      const forward = (p1.x - p0.x) * Math.cos(p0.heading) + (p1.y - p0.y) * Math.sin(p0.heading);
      const sideways = -(p1.x - p0.x) * Math.sin(p0.heading) + (p1.y - p0.y) * Math.cos(p0.heading);
      expect(forward, "moves forward along its heading").toBeGreaterThan(0.25);
      expect(Math.abs(sideways)).toBeLessThan(0.03);
      expect(s.telemetry().speed).toBeGreaterThan(0.2);
      s.advance(1.2, 3000);
      const h2 = s.telemetry().pose.heading;
      expect(h2 - p1.heading, "left command → heading increases (CCW)").toBeGreaterThan(0.6);
      s.advance(1.2, 3000);
      expect(s.telemetry().pose.heading - h2, "right command → heading decreases (CW)").toBeLessThan(-0.6);
    }, SLOW);

    it(`${id}: a line on its left makes it steer left, a line on its right makes it steer right`, () => {
      // LF-02 / LF-03 normally calibrate by sweeping over the line first; here the calibration table is
      // filled with the sensor's real white/black ADC levels (5 % … 95 % of 1023) so the very first
      // correction can be observed
      const n = id === "LF-03" ? 8 : 5;
      const code = sourceOf(id).replace(/\n\s*calibrate\(\);/, `\n  for (int i = 0; i < ${n}; i++) { minV[i] = 51; maxV[i] = 972; }`);
      const tr = TRACKS.straight();
      for (const [dy, sign] of [[-0.02, 1], [0.02, -1]] as const) {
        const s = new SimSession({ project: makeProject(id, code), track: { ...tr, start: { ...tr.start, y: tr.start.y + dy } }, mode: "code" });
        const h0 = s.telemetry().pose.heading;
        let first = 0;
        for (let i = 0; i < 200 && first === 0; i++) {
          s.advance(0.005, 10);
          const d = s.telemetry().pose.heading - h0;
          if (Math.abs(d) > 0.03) first = Math.sign(d);
        }
        expect(first, `first correction with the line ${dy < 0 ? "left" : "right"} of the robot`).toBe(sign);
      }
    }, SLOW);
  }
});

describe("track matrix at default speed", () => {
  for (const id of ROBOTS) {
    for (const [name, make] of Object.entries(TRACKS)) {
      it(`${id} · ${name}`, () => {
        const m = run(makeProject(id), make(), settleTime(id), { ...lostOpts(id), maxS: 45 });
        record(id, name, m);
        expectGoodRun(m);
      }, SLOW);
    }
  }
});

const SPEEDS: Record<RobotId, number[]> = { "LF-01": [120, 150, 200], "LF-02": [120, 140, 200], "LF-03": [140, 170, 220], "line-basic": [120, 140, 200], "line-pid": [120, 150, 200] };

describe("speeds: mixed course at three base speeds, sharp corners at high speed", () => {
  for (const id of ROBOTS) {
    for (const base of SPEEDS[id]) {
      it(`${id} · mixed closed course @ base ${base}`, () => {
        const v = atSpeed(id, base);
        const m = run(makeProject(id, v.code), mixedCourse(), settleTime(id), { ...lostOpts(id), maxS: 45, serial: v.serial });
        record(id, `mixed @${base}`, m);
        expectGoodRun(m, { lost: 1.0 });
      }, SLOW);
    }
    for (const [name, angle] of [["135° left", (3 * PI) / 4], ["135° right", (-3 * PI) / 4]] as const) {
      it(`${id} · ${name} corner @ base 230 (high-speed lost-line recovery)`, () => {
        const v = atSpeed(id, 230);
        const m = run(makeProject(id, v.code), corner(`hs${angle}`, angle), settleTime(id), { ...lostOpts(id), maxS: 30, serial: v.serial });
        record(id, `${name} @230`, m);
        // 3 digital sensors cannot always tell an acute corner from a wobble at this speed: a wrong first
        // sweep is allowed (≈ 2 s), driving off or turning round is not
        expectGoodRun(m, { lost: 2.5 });
      }, SLOW);
    }
  }
});

describe("lost-line recovery: start parallel to the line, 3–5 cm beside it", () => {
  for (const id of ROBOTS) {
    for (const dy of [0.03, -0.04, 0.05, -0.05]) {
      it(`${id} · starts ${Math.abs(dy) * 100} cm ${dy > 0 ? "left" : "right"} of the line`, () => {
        const tr = TRACKS.straight();
        const m = run(makeProject(id), { ...tr, start: { ...tr.start, y: tr.start.y + dy } }, settleTime(id), { ...lostOpts(id), maxS: 30 });
        record(id, `start ${dy * 100} cm beside`, m);
        expect(m.error).toBeUndefined();
        expect(m.reacquireS, "finds the line and lines up with it").toBeGreaterThan(0);
        expect(m.reacquireS - settleTime(id), "recovery time").toBeLessThan(2.0);
        expect(m.completed, "then follows it to the end").toBe(true);
        expect(m.maxWrongWayS).toBeLessThanOrEqual(1);
        expect(m.maxBackwardsS).toBeLessThanOrEqual(0.3);
        expect(m.maxLostS).toBeLessThan(1.0);
      }, SLOW);
    }
  }
});

describe("end of the line: the search is bounded and stops — no endless spinning, no U-turn", () => {
  for (const id of ROBOTS) {
    it(`${id} stops near the end of an open line instead of turning round onto it`, () => {
      const m = run(makeProject(id), TRACKS.straight(), settleTime(id), { ...lostOpts(id), maxS: 30, afterEndS: 6 });
      expect(m.completed).toBe(true);
      expect(m.maxWrongWayS, "never drives back along the line").toBeLessThanOrEqual(1);
      expect(m.maxBackwardsS).toBeLessThanOrEqual(0.3);
      expect(m.final!.distFromEnd, "still at the end of the line").toBeLessThan(0.3);
      expect(Math.abs(m.final!.speed), "stopped").toBeLessThan(0.01);
      expect(m.final!.turnLast05s, "not spinning").toBeLessThan(0.02);
    }, SLOW);
  }
});
