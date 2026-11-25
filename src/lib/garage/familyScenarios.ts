/**
 * Behaviour scenarios for the spec-driven template families (T-RACE-…, T-LINE-…, T-SUMO-…, T-ROVER-…,
 * T-OBST-…, T-BT-…). Like the reference-robot scenarios they drive the full stack — generated firmware →
 * interpreter (Uno or ESP32) → circuit → physics → sensors — and are shared by tests/garage/families.test.ts and
 * `npm run garage:report`.
 */
import type { TrackDef, TrackPiece } from "@/lib/sim/types";
import { SimSession } from "@/lib/sim/session";
import { getExampleTrack } from "@/lib/track/examples";
import { buildRobotSpec } from "@/lib/robot/model";
import { buildFromTemplate } from "./build";
import { getTemplate } from "./index";
import type { Scenario, ScenarioResult } from "./scenarios";
import type { ProjectTemplate } from "./types";

type Run = Omit<ScenarioResult, "id" | "project" | "category" | "name" | "mustPass">;

const SURFACE = { color: "#d8d3c4", mu: 1.0, lineColor: "#2d2f33" };

/** Open flat test area (one wide road piece) with optional obstacles. */
export function flatTestArea(obstacles: TrackPiece[] = []): TrackDef {
  return { id: "family-flat", name: "Flat test area", kind: "race", difficulty: "beginner", ownerId: "test", size: { w: 5, h: 3 }, surface: SURFACE, pieces: [{ id: "r", type: "straight", x: -2.2, y: 0, rotation: 0, params: { length: 4.4, width: 2.4 } }, ...obstacles], start: { x: -1.4, y: 0, heading: 0 }, laps: 1 };
}

const FOUR = ["FL", "FR", "RL", "RR"] as const;
const deg = (r: number) => `${(r * 57.3).toFixed(0)}°`;

function probe(t: ProjectTemplate, track: TrackDef, extra: Partial<ConstructorParameters<typeof SimSession>[0]> = {}) {
  const project = buildFromTemplate(t, "test", "original");
  const s = new SimSession({ project, track, mode: t.firmware.runsInSimulator === false ? "manual" : "code", ...extra });
  const { notes } = buildRobotSpec(project);
  const uid = (c: string) => project.parts.find((p) => p.label === `${c} Motor`)!.uid;
  const rpm = (c: string) => (s.telemetry().motorRpm[uid(c)] ?? 0) * (notes.motorMirrored[uid(c)] ? -1 : 1);
  const volts = (c: string) => s.telemetry().motorVoltage[uid(c)] ?? 0;
  /** keeps sending the command every 0.25 s, like a phone app holding a button */
  const hold = (cmd: string, secs: number) => {
    for (let k = 0; k < Math.round(secs / 0.25); k++) {
      s.sendSerial(cmd);
      s.advance(0.25, 500);
    }
  };
  return { s, project, rpm, volts, hold };
}

function runLap(s: SimSession, maxS: number) {
  for (let t = 0; t < maxS; t += 0.5) {
    s.advance(0.5, 1000);
    const lap = s.events.find((e) => e.type === "lap" && e.robot === 0);
    if (lap) return { lap: true, time: lap.t, off: s.events.filter((e) => e.type === "off-track").length };
    if (s.runtimeStatus?.state === "error") break;
  }
  return { lap: false, time: s.time, off: s.events.filter((e) => e.type === "off-track").length };
}

// ───────────────────────────── manual control (HC-05) ─────────────────────────────

/** F / B / L / R / S over the HC-05 link (commands repeated while "held"). */
export function manualDrive(t: ProjectTemplate): Run {
  const { s, rpm, hold } = probe(t, flatTestArea());
  const h0 = s.telemetry().pose.heading;
  hold("F", 1.5);
  const vF = s.telemetry().speed;
  const rF = FOUR.map(rpm);
  const drift = s.telemetry().pose.heading - h0;
  hold("S", 0.75);
  const vS = s.telemetry().speed;
  hold("B", 1.0);
  const vB = s.telemetry().speed;
  hold("S", 0.75);
  let h = s.telemetry().pose.heading;
  hold("L", 0.75);
  const dL = s.telemetry().pose.heading - h;
  h = s.telemetry().pose.heading;
  hold("R", 0.75);
  const dR = s.telemetry().pose.heading - h;
  hold("S", 0.5);
  const pass = vF > 0.3 && rF.every((r) => r > 20) && Math.abs(drift) < 0.1 && Math.abs(vS) < 0.05 && vB < -0.15 && dL > 0.6 && dR < -0.6 && s.runtimeStatus?.state !== "error";
  return {
    config: "Flat test area; F 1.5 s, S, B 1 s, S, L 0.75 s, R 0.75 s, S — each command repeated every 0.25 s like a phone app",
    expected: "F: all four wheels forward, straight; S stops; B reverses; L spins left (heading +), R spins right (heading −)",
    actual: `F ${vF.toFixed(2)} m/s (rpm FL/FR/RL/RR ${rF.map((r) => r.toFixed(0)).join("/")}, drift ${deg(drift)}); S ${vS.toFixed(3)} m/s; B ${vB.toFixed(2)} m/s; L ${deg(dL)}; R ${deg(dR)}`,
    pass,
  };
}

/** V<n> changes the cruise speed. */
export function manualSpeed(t: ProjectTemplate): Run {
  const { s, hold } = probe(t, flatTestArea());
  s.sendSerial("V230\n");
  hold("F", 1.5);
  const fast = s.telemetry().speed;
  hold("S", 1.0);
  s.sendSerial("V110\n");
  hold("F", 1.5);
  const slow = s.telemetry().speed;
  hold("S", 0.5);
  return { config: "V230 then F for 1.5 s; stop; V110 then F for 1.5 s", expected: "The robot drives clearly slower after V110 than after V230", actual: `V230: ${fast.toFixed(2)} m/s; V110: ${slow.toFixed(2)} m/s`, pass: fast > 0.3 && slow > 0.08 && slow < fast * 0.7 };
}

/** 1–4 run a single motor; 0 ends the test. */
export function manualMotorTest(t: ProjectTemplate): Run {
  const { s, rpm, volts, hold } = probe(t, flatTestArea());
  const rows: string[] = [];
  let ok = true;
  FOUR.forEach((c, i) => {
    hold(String(i + 1), 0.5);
    const v = FOUR.map((k) => Math.abs(volts(k)));
    const r = FOUR.map(rpm);
    const others = [0, 1, 2, 3].filter((k) => k !== i);
    ok &&= v[i] > 3 && others.every((k) => v[k] < 0.3) && r[i] > 40;
    rows.push(`${c}: ${v.map((x) => x.toFixed(1)).join("/")} V, rpm ${r.map((x) => x.toFixed(0)).join("/")}`);
    hold("0", 0.5);
  });
  return { config: "Commands 1, 2, 3, 4 (FL, FR, RL, RR), each held 0.5 s, 0 between them", expected: "Only the selected motor gets voltage and its wheel turns forward", actual: rows.join("; "), pass: ok };
}

/** No command for > 1 s while moving = motors stop. */
export function manualLinkLoss(t: ProjectTemplate): Run {
  const { s } = probe(t, flatTestArea());
  s.sendSerial("F");
  s.advance(0.7, 1400);
  const moving = s.telemetry().speed;
  s.advance(1.5, 3000);
  const after = s.telemetry().speed;
  const volts = Object.values(s.telemetry().motorVoltage).map((v) => Math.abs(v));
  const msg = /LINK LOST/.test(s.serialOutput);
  return { config: "One F command, then silence (the phone lost the connection)", expected: "Drives while commands arrive, then stops on its own ≈1 s after the last command", actual: `speed 0.7 s after F: ${moving.toFixed(2)} m/s; 2.2 s after F: ${after.toFixed(3)} m/s; motor voltages ${volts.map((v) => v.toFixed(1)).join("/")} V; "LINK LOST" ${msg ? "printed" : "not printed"}`, pass: moving > 0.2 && Math.abs(after) < 0.05 && volts.every((v) => v < 0.3) && msg };
}

/** Wi-Fi sketches are not simulated: Manual mode must drive all four wheels. */
export function manualModeDrive(t: ProjectTemplate): Run {
  const { s, rpm } = probe(t, flatTestArea());
  s.manual.forward = 1;
  s.advance(1.5, 3000);
  const vF = s.telemetry().speed;
  const r = FOUR.map(rpm);
  s.manual.forward = 0;
  s.manual.turn = 1;
  const h = s.telemetry().pose.heading;
  s.advance(0.8, 1600);
  const dL = s.telemetry().pose.heading - h;
  return { config: "Arena Manual mode (W, then A) — the Wi-Fi firmware itself is not simulated", expected: "All four wheels are electrically reachable: the robot drives forward and turns left", actual: `forward ${vF.toFixed(2)} m/s, rpm ${r.map((x) => x.toFixed(0)).join("/")}; turn ${deg(dL)}`, pass: vF > 0.3 && r.every((x) => x > 20) && dL > 0.4 };
}

// ───────────────────────────── line ─────────────────────────────

export function lineLap(t: ProjectTemplate, trackId: string): Run {
  const track = getExampleTrack(trackId)!;
  const { s } = probe(t, track);
  const h0 = s.telemetry().pose.heading;
  const r = runLap(s, 60);
  const turned = s.telemetry().pose.heading - h0;
  // the example tracks run anticlockwise: a correct lap turns the robot through about +360°
  const rightWay = turned > 5;
  return { config: `${track.name}; generated firmware with ${/NUM_SENSORS = (\d+)/.exec(t.firmware.source)?.[1]} sensors`, expected: "Completes a lap in the course direction using only its sensors", actual: r.lap ? `Lap in ${r.time.toFixed(1)} s, heading turned ${deg(turned)}, ${r.off} off-track event(s)` : `No lap within ${r.time.toFixed(0)} s`, pass: r.lap && rightWay };
}

// ───────────────────────────── sumo ─────────────────────────────

const dohyo = () => getExampleTrack("example-sumo-standard-dohyo")!;

export function sumoStaysIn(t: ProjectTemplate): Run {
  const { s } = probe(t, dohyo());
  let maxR = 0;
  for (let k = 0; k < 80; k++) {
    s.advance(0.5, 1000);
    const p = s.telemetry().pose;
    maxR = Math.max(maxR, Math.hypot(p.x, p.y));
  }
  const out = s.world.getSnapshot().robots[0].out;
  return { config: "Standard dohyo, no opponent, 40 s", expected: "Searches the ring (spin + creep), reaches the border and always turns back in", actual: out ? "Left the ring" : `Stayed inside; drove ${s.telemetry().distance.toFixed(1)} m, furthest ${(maxR * 100).toFixed(0)} cm from the centre`, pass: !out && s.telemetry().distance > 1 };
}

export function sumoBeatsBeginner(t: ProjectTemplate): Run {
  const { s } = probe(t, dohyo(), { opponent: "beginner", opponentStartDelayS: 5 });
  let res = "draw (time limit)";
  let win = false;
  for (let k = 0; k < 1800; k++) {
    s.advance(0.1, 200);
    const sn = s.world.getSnapshot();
    if (sn.robots[1].out) {
      res = `WIN at ${s.time.toFixed(1)} s`;
      win = true;
      break;
    }
    if (sn.robots[0].out) {
      res = `loss at ${s.time.toFixed(1)} s`;
      break;
    }
  }
  // keep going: after the ring-out the robot must still stay in
  s.advance(5, 6000);
  const stillIn = !s.world.getSnapshot().robots[0].out;
  return { config: "Standard dohyo, beginner AI, 5 s start delay for both", expected: "Pushes the beginner AI out of the ring and stays in itself", actual: `${res}; ${s.events.filter((e) => e.type === "collision").length} collision event(s); ${stillIn ? "still inside 5 s later" : "left the ring afterwards"}`, pass: win && stillIn };
}

// ───────────────────────────── rover ─────────────────────────────

export function roverOffroad(t: ProjectTemplate, trackId = "example-offroad-beginner"): Run {
  const track = getExampleTrack(trackId)!;
  const { s, hold } = probe(t, track);
  const zs: number[] = [];
  let finite = true;
  let pitch = 0;
  const x0 = s.telemetry().pose.x;
  for (let k = 0; k < 16; k++) {
    hold("F", 0.25);
    const tel = s.telemetry();
    zs.push(tel.z ?? 0);
    pitch = Math.max(pitch, Math.abs(tel.pitch ?? 0));
    finite &&= [tel.pose.x, tel.pose.y, tel.pose.heading, tel.speed, tel.z ?? 0, tel.pitch ?? 0, tel.roll ?? 0].every(Number.isFinite);
  }
  const dx = s.telemetry().pose.x - x0;
  const dz = Math.max(...zs) - Math.min(...zs);
  return { config: `${track.name}; F held for 4 s over Bluetooth`, expected: "Drives onto the terrain: the body rises and tilts (terrain interaction), every value stays finite", actual: `moved ${(dx * 100).toFixed(0)} cm; body height range ${(dz * 1000).toFixed(1)} mm; max pitch ${deg(pitch)}; values ${finite ? "finite" : "NOT finite"}`, pass: finite && dx > 0.5 && dz > 0.003 };
}

// ───────────────────────────── obstacle ─────────────────────────────

export function obstacleHeadOn(t: ProjectTemplate): Run {
  const obstacleX = 0.2;
  const { s } = probe(t, flatTestArea([{ id: "o", type: "obstacle", x: obstacleX, y: 0, rotation: 0, params: { width: 0.25, depth: 0.2 } }]));
  let turnedAt: number | null = null;
  let minGap = Infinity;
  for (let k = 0; k < 120; k++) {
    s.advance(0.1, 200);
    const p = s.telemetry().pose;
    if (turnedAt === null && Math.abs(p.heading) > 0.35) turnedAt = obstacleX - p.x;
    if (Math.abs(p.y) < 0.2) minGap = Math.min(minGap, obstacleX - 0.1 - p.x);
  }
  const hits = s.events.filter((e) => e.type === "collision" && e.robot === 0);
  return { config: "Flat area, 25 × 20 cm obstacle 1.6 m straight ahead; 12 s", expected: "Drives forward, stops or turns before the obstacle and never touches it", actual: `${turnedAt === null ? "never turned" : `turned ${(turnedAt * 100).toFixed(0)} cm before the obstacle centre`}; ${hits.length} collision(s)`, pass: turnedAt !== null && turnedAt > 0.25 && hits.length === 0 };
}

export function obstacleWall(t: ProjectTemplate): Run {
  const { s } = probe(t, flatTestArea([{ id: "w", type: "obstacle", x: 0.4, y: 0, rotation: 0, params: { width: 1.6, depth: 0.1 } }]));
  let headOn = 0;
  for (let k = 0; k < 120; k++) s.advance(0.1, 200);
  const hits = s.events.filter((e) => e.type === "collision" && e.robot === 0);
  headOn = hits.filter((e) => (e.value ?? 0) > 0.1).length;
  return { config: "Flat area, 1.6 m wide wall 1.8 m ahead; 12 s", expected: "Stops / turns before the wall and never drives into it head-on", actual: `${hits.length} contact(s), ${headOn} at > 0.1 m/s; drove ${s.telemetry().distance.toFixed(1)} m`, pass: headOn === 0 && hits.length === 0 };
}

export function obstacleTrack(t: ProjectTemplate): Run {
  const track = getExampleTrack("example-race-intermediate-scurves")!;
  const { s } = probe(t, track);
  s.advance(20, 25000);
  const hits = s.events.filter((e) => e.type === "collision" && e.robot === 0);
  const headOn = hits.filter((e) => (e.value ?? 0) > 0.1);
  return { config: `${track.name}, 20 s autonomous`, expected: "Wanders the course without hitting an obstacle head-on", actual: `${hits.length} contact(s), ${headOn.length} head-on (> 0.1 m/s); drove ${s.telemetry().distance.toFixed(1)} m`, pass: headOn.length === 0 && s.telemetry().distance > 2 };
}

// ───────────────────────────── the list ─────────────────────────────

export function familyScenarios(): Scenario[] {
  const out: Scenario[] = [];
  const add = (id: string, name: string, category: ScenarioResult["category"], run: (t: ProjectTemplate) => Run, suffix: string) =>
    out.push({ id: `${id}-${suffix}`, project: id, category, name, mustPass: true, run: () => run(getTemplate(id)!) });
  const ids = (prefix: string) => ["UNO", "ESP32"].flatMap((c) => [`${prefix}-${c}`]);
  for (const id of ["T-RACE-UNO-L298N", "T-RACE-UNO-BTS", "T-RACE-ESP32-L298N", "T-RACE-ESP32-BTS"]) {
    add(id, "Bluetooth drive F / B / L / R / S", "race", manualDrive, "drive");
    add(id, "Connection loss stops the car", "race", manualLinkLoss, "link-loss");
  }
  add("T-RACE-ESP32-BTS-WIFI", "Manual-mode drive (Wi-Fi not simulated)", "race", manualModeDrive, "manual");
  for (const id of ["T-LINE-UNO-3", "T-LINE-UNO-5", "T-LINE-ESP32-3", "T-LINE-ESP32-5", "T-LINE-ESP32-8"]) {
    add(id, "Beginner Oval lap", "line", (t) => lineLap(t, "example-line-beginner-oval"), "oval");
    add(id, "Sharp Corners lap", "line", (t) => lineLap(t, "example-line-intermediate-sharp"), "sharp");
  }
  for (const id of ids("T-SUMO")) {
    add(id, "Stays in the ring (alone, 40 s)", "sumo", sumoStaysIn, "ring");
    add(id, "Beats the beginner AI", "sumo", sumoBeatsBeginner, "beginner");
  }
  for (const id of ids("T-ROVER")) add(id, "Drives onto the off-road track", "race", (t) => roverOffroad(t), "offroad");
  for (const id of ids("T-OBST")) {
    add(id, "Avoids an obstacle ahead", "race", obstacleHeadOn, "head-on");
    add(id, "Never drives into a wall", "race", obstacleWall, "wall");
    add(id, "Obstacle course without head-on hits", "race", obstacleTrack, "course");
  }
  for (const id of ["T-BT-UNO", "T-BT-ESP32"]) {
    add(id, "Bluetooth drive F / B / L / R / S", "race", manualDrive, "drive");
    add(id, "Speed command V<n>", "race", manualSpeed, "speed");
    add(id, "Individual motor test 1–4", "race", manualMotorTest, "motor-test");
    add(id, "Connection loss stops the robot", "race", manualLinkLoss, "link-loss");
  }
  add("T-BT-ESP32-WIFI", "Manual-mode drive (Wi-Fi not simulated)", "race", manualModeDrive, "manual");
  return out;
}
