/**
 * Sumo opponent AI.
 *
 * The opponent is an ordinary simulated robot (same physics as the student's robot) with its own
 * sensors. Its controller sees ONLY its own sensor readings – never ground-truth positions – and the
 * readings it acts on are delayed by a level-dependent reaction time.
 *
 * Sensors (ids):
 *   "edge"  – reflectance, 4 points: [front-left, front-right, rear-left, rear-right]; white (< 0.5)
 *             means the white ring border.
 *   "dist"  – front distance sensor (all levels)
 *   "distL" / "distR" – front sensors angled ±15° (advanced, beast)
 *   "sideL" / "sideR" – side-looking sensors (beast only)
 *
 * State machine (evaluated every call, highest priority first):
 *   RETREAT  – a FRONT edge sensor saw white: reverse for `backTime`, then TURN.
 *   TURN     – spin away from the side that saw the edge for `turnTime`, then SEARCH.
 *   ESCAPE   – a REAR edge sensor saw white: drive forward for `backTime`, then SEARCH.
 *   ATTACK   – target ahead closer than `attackRange`: full power forward, small steering towards the
 *              angled sensor that also sees it.
 *   APPROACH – target seen (≤ sensor range): forward at 75 % power, steering towards the target.
 *   SEARCH   – nothing seen: spin in place (direction = last side the target was seen on); advanced
 *              and beast levels add a forward drift after 1.5 s of fruitless spinning to change
 *              viewpoint. Side sensors (beast) immediately set the spin direction.
 * Beast may abort a TURN when its front sensor sees the target.
 */
import type { MotorCommands, RobotTelemetry, SensorReading, SimRobotSpec, SimSensorSpec } from "./types";
import { LIPO_2S } from "./presets";

export type OpponentLevel = "beginner" | "intermediate" | "advanced" | "beast";
export type OpponentState = "search" | "approach" | "attack" | "retreat" | "turn" | "escape";

export interface OpponentWorldInfo {
  /** simulation time (s) */
  t: number;
}

export type OpponentController = (readings: Record<string, SensorReading>, telemetry: RobotTelemetry, info: OpponentWorldInfo) => MotorCommands;

export interface OpponentParams {
  /** fraction of nominal motor voltage used when attacking */
  power: number;
  searchPower: number;
  reactionDelayS: number;
  fovDeg: number;
  rangeM: number;
  attackRange: number;
  backTime: number;
  turnTime: number;
  massKg: number;
  stallTorqueNm: number;
  noLoadRpm: number;
  wedge: number;
  angledSensors: boolean;
  sideSensors: boolean;
  wander: boolean;
}

export const OPPONENT_LEVELS: Record<OpponentLevel, OpponentParams> = {
  beginner: {
    power: 0.55,
    searchPower: 0.35,
    reactionDelayS: 0.15,
    fovDeg: 15,
    rangeM: 0.4,
    attackRange: 0.12,
    backTime: 0.35,
    turnTime: 0.45,
    massKg: 0.35,
    stallTorqueNm: 0.08,
    noLoadRpm: 200,
    wedge: 0,
    angledSensors: false,
    sideSensors: false,
    wander: false,
  },
  intermediate: {
    power: 0.75,
    searchPower: 0.45,
    reactionDelayS: 0.08,
    fovDeg: 25,
    rangeM: 0.6,
    attackRange: 0.2,
    backTime: 0.3,
    turnTime: 0.35,
    massKg: 0.45,
    stallTorqueNm: 0.12,
    noLoadRpm: 250,
    wedge: 0.1,
    angledSensors: false,
    sideSensors: false,
    wander: false,
  },
  advanced: {
    power: 0.9,
    searchPower: 0.5,
    reactionDelayS: 0.04,
    fovDeg: 30,
    rangeM: 0.7,
    attackRange: 0.25,
    backTime: 0.25,
    turnTime: 0.3,
    massKg: 0.5,
    stallTorqueNm: 0.18,
    noLoadRpm: 300,
    wedge: 0.2,
    angledSensors: true,
    sideSensors: false,
    wander: true,
  },
  beast: {
    power: 1.0,
    searchPower: 0.6,
    reactionDelayS: 0.015,
    fovDeg: 35,
    rangeM: 0.77,
    attackRange: 0.3,
    backTime: 0.2,
    turnTime: 0.25,
    massKg: 0.5,
    stallTorqueNm: 0.25,
    noLoadRpm: 350,
    wedge: 0.3,
    angledSensors: true,
    sideSensors: true,
    wander: true,
  },
};

const NOMINAL_V = 6;

export function opponentSpec(level: OpponentLevel, id = `opponent-${level}`): SimRobotSpec {
  const p = OPPONENT_LEVELS[level];
  const half = 0.05;
  const sensors: SimSensorSpec[] = [
    {
      id: "edge",
      kind: "reflectance",
      points: [
        { x: 0.045, y: 0.042 },
        { x: 0.045, y: -0.042 },
        { x: -0.045, y: 0.042 },
        { x: -0.045, y: -0.042 },
      ],
      footprint: 0.003,
    },
    { id: "dist", kind: "distance", x: half, y: 0, angle: 0, fovDeg: p.fovDeg, minRange: 0.02, maxRange: p.rangeM },
  ];
  if (p.angledSensors) {
    const a = (15 * Math.PI) / 180;
    sensors.push({ id: "distL", kind: "distance", x: half, y: 0.03, angle: a, fovDeg: p.fovDeg * 0.6, minRange: 0.02, maxRange: p.rangeM });
    sensors.push({ id: "distR", kind: "distance", x: half, y: -0.03, angle: -a, fovDeg: p.fovDeg * 0.6, minRange: 0.02, maxRange: p.rangeM });
  }
  if (p.sideSensors) {
    sensors.push({ id: "sideL", kind: "distance", x: 0, y: half, angle: Math.PI / 2, fovDeg: 20, minRange: 0.02, maxRange: 0.5 });
    sensors.push({ id: "sideR", kind: "distance", x: 0, y: -half, angle: -Math.PI / 2, fovDeg: 20, minRange: 0.02, maxRange: 0.5 });
  }
  const motor = {
    nominalVoltage: NOMINAL_V,
    noLoadRpm: p.noLoadRpm,
    stallTorqueNm: p.stallTorqueNm,
    stallCurrentA: 1.6,
    noLoadCurrentA: 0.12,
    invert: false,
  };
  return {
    id,
    name: `Opponent (${level})`,
    massKg: p.massKg,
    length: 0.1,
    width: 0.1,
    height: 0.05,
    com: { x: -0.012, y: 0 },
    wheels: [
      { id: "wl", x: -0.01, y: 0.042, radius: 0.02, width: 0.014, mu: 1.1, motorId: "L" },
      { id: "wr", x: -0.01, y: -0.042, radius: 0.02, width: 0.014, mu: 1.1, motorId: "R" },
    ],
    casters: [{ x: 0.04, y: 0, crr: 0.05 }],
    motors: [
      { id: "L", ...motor },
      { id: "R", ...motor },
    ],
    battery: { ...LIPO_2S },
    sensors,
    wedge: p.wedge > 0 ? p.wedge : undefined,
    color: level === "beast" ? "#b91c1c" : level === "advanced" ? "#7c3aed" : level === "intermediate" ? "#2563eb" : "#16a34a",
  };
}

export interface Opponent {
  level: OpponentLevel;
  params: OpponentParams;
  spec: SimRobotSpec;
  controller: OpponentController;
  /** current state-machine state (for UI/debug) */
  getState: () => OpponentState;
}

function dist(r: SensorReading | undefined): number | null {
  return r && r.kind === "distance" ? r.distance : null;
}

export function createOpponent(level: OpponentLevel, opts: { id?: string } = {}): Opponent {
  const p = OPPONENT_LEVELS[level];
  const spec = opponentSpec(level, opts.id);
  let state: OpponentState = "search";
  let stateUntil = 0;
  let stateStart = 0;
  let turnDir = 1; // +1 = CCW (left)
  let searchDir = 1;
  const history: { t: number; r: Record<string, SensorReading> }[] = [];

  const setState = (s: OpponentState, t: number, duration = 0) => {
    if (s !== state) stateStart = t;
    state = s;
    stateUntil = t + duration;
  };

  const drive = (l: number, r: number): MotorCommands => ({
    L: Math.max(-1, Math.min(1, l)) * NOMINAL_V,
    R: Math.max(-1, Math.min(1, r)) * NOMINAL_V,
  });

  const controller: OpponentController = (readings, _telemetry, info) => {
    const t = info.t;
    // reaction delay: act on the newest reading that is at least `reactionDelayS` old
    history.push({ t, r: readings });
    let idx = -1;
    for (let k = history.length - 1; k >= 0; k--) {
      if (history[k].t <= t - p.reactionDelayS + 1e-9) {
        idx = k;
        break;
      }
    }
    if (idx > 0) history.splice(0, idx);
    const seen = idx >= 0 ? history[0].r : null;
    if (!seen) return drive(0, 0);

    const edge = seen["edge"];
    const dark = edge && edge.kind === "reflectance" ? edge.darkness : [1, 1, 1, 1];
    const white = dark.map((d) => d < 0.5);
    const dC = dist(seen["dist"]);
    const dL = dist(seen["distL"]);
    const dR = dist(seen["distR"]);
    const sL = dist(seen["sideL"]);
    const sR = dist(seen["sideR"]);
    const front = [dC, dL, dR].filter((d): d is number => d !== null);
    const nearest = front.length ? Math.min(...front) : null;

    // ── edge handling (highest priority) ──
    if (white[0] || white[1]) {
      if (state !== "retreat") {
        turnDir = white[0] && !white[1] ? -1 : white[1] && !white[0] ? 1 : turnDir;
        setState("retreat", t, p.backTime);
      }
    } else if ((white[2] || white[3]) && state !== "retreat") {
      setState("escape", t, p.backTime);
    }

    if (state === "retreat") {
      if (t < stateUntil) return drive(-p.power, -p.power);
      setState("turn", t, p.turnTime);
    }
    if (state === "escape") {
      if (t < stateUntil && !(white[0] || white[1])) return drive(p.power, p.power);
      setState("search", t);
    }
    if (state === "turn") {
      const abort = level === "beast" && dC !== null;
      if (t < stateUntil && !abort) return drive(-turnDir * p.power * 0.8, turnDir * p.power * 0.8);
      searchDir = turnDir;
      setState("search", t);
    }

    // ── target tracking ──
    if (nearest !== null) {
      let steer = 0;
      if (dL !== null && dR === null) steer = 1;
      else if (dR !== null && dL === null) steer = -1;
      if (steer !== 0) searchDir = steer;
      if (nearest <= p.attackRange) {
        setState("attack", t);
        return drive(p.power - 0.25 * Math.max(0, steer), p.power + 0.25 * Math.min(0, steer));
      }
      setState("approach", t);
      const base = 0.75 * p.power;
      return drive(base - 0.3 * base * steer, base + 0.3 * base * steer);
    }
    if (sL !== null) searchDir = 1;
    else if (sR !== null) searchDir = -1;

    // ── search ──
    if (state !== "search") setState("search", t);
    const sp = p.searchPower;
    if (p.wander && t - stateStart > 1.5) {
      // spiral outward to change the viewpoint
      return drive(sp * (searchDir > 0 ? 0.2 : 1), sp * (searchDir > 0 ? 1 : 0.2));
    }
    return drive(-searchDir * sp, searchDir * sp);
  };

  return { level, params: p, spec, controller, getState: () => state };
}
