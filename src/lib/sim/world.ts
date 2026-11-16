/**
 * SimWorld – owns the robots on a compiled track and advances them with a fixed timestep.
 *
 * Per step (dt, default 1 ms):
 *   1. each robot: battery → motors → wheels/tyres/casters → body velocities (physics.ts)
 *   2. positions integrated (semi-implicit Euler)
 *   3. contacts (walls, obstacles, robot–robot) detected and resolved with impulses + positional
 *      correction (collision.ts); sumo wedge lift evaluated for the next step
 *   4. competition logic: on-track / off-track, checkpoints (strict order), laps, ring-out, battery-low
 *
 * Competition rules implemented here:
 *  • Race / line: the robot's COM path between two steps is tested against checkpoint and start/finish
 *    segments. Checkpoints count only in index order. Crossing the finish line (or the start line when
 *    there is no finish piece; or a virtual 30 cm line through the start pose when neither exists) after
 *    all checkpoints completes a lap. Tracks without checkpoints require the robot to have travelled at
 *    least half of the total road/line length since the previous lap. `laps` in the TrackDef → "finish".
 *  • on-track: race = COM inside any road (|d| ≤ width/2); line = COM within 5 cm of a line centre.
 *  • Sumo: arena centred at the origin; a robot is `out` once its COM leaves the arena (border
 *    included) → one "ring-out" event. The time limit is enforced by the caller.
 *  • Wedge: if robot A (wedge > 0) touches robot B with its front face, B's tyre loads are multiplied by
 *    (1 − wedge_A) and the removed weight is added to A's loads, while the contact lasts.
 *  • Collision events: one per contact start; a new event needs ≥ 50 ms without contact.
 *  • Battery-low: once, when terminal voltage < 1.1 × minVoltage.
 */
import type { CompiledTrack, MotorCommands, Pose, RobotTelemetry, Segment, SensorReading, SimEvent, SimRobotSpec, Vec2 } from "./types";
import { GRAVITY, RobotDynamics, type DriveEnv } from "./physics";
import { robotContacts, resolveContacts, staticContacts, type Contact, type ContactKind } from "./collision";
import { buildFloor, insideArena, readSensor, type FloorModel, type PolylineIndex, type RayScene } from "./sensors";
import { pointInPolygon, segmentIntersect, type OBB } from "./geom";

export interface SimWorldOptions {
  dt?: number;
}

export const LINE_ON_TRACK_TOLERANCE = 0.05;
const COLLISION_DEBOUNCE_S = 0.05;

export interface RobotSnapshot {
  id: string;
  pose: Pose;
  /** height above floor (m) – non-zero on ramps */
  z: number;
  /** wheel rotation angles (rad) for spinning wheel meshes, keyed by wheel id */
  wheelAngles: Record<string, number>;
  speed: number;
  colliding: boolean;
  onTrack: boolean;
  out: boolean;
}

export interface WorldSnapshot {
  t: number;
  robots: RobotSnapshot[];
}

export interface RaceStatus {
  lap: number;
  lapTimes: number[];
  nextCheckpoint: number;
  checkpointCount: number;
  /** fraction (0..1) of the path from the start pose, by projection onto the centre-line */
  progress: number;
  finished: boolean;
}

export interface SimRobotTelemetry extends RobotTelemetry {
  race: RaceStatus;
  /** body-frame acceleration */
  ax: number;
  ay: number;
}

interface Runtime {
  spec: SimRobotSpec;
  initialPose: Pose;
  body: RobotDynamics;
  colliding: boolean;
  lastContactT: number;
  onTrack: boolean;
  out: boolean;
  lap: number;
  lapTimes: number[];
  lapStartT: number;
  lapStartDist: number;
  nextCp: number;
  finished: boolean;
  batteryLow: boolean;
  loadFactor: number;
  extraLoad: number;
  z: number;
}

export class SimWorld {
  readonly track: CompiledTrack;
  readonly dt: number;
  time = 0;
  /** append-only event log (see drainEvents for incremental consumption) */
  events: SimEvent[] = [];
  private drained = 0;
  private stepCount = 0;
  private robots: Runtime[] = [];
  private readonly floor: FloorModel;
  private readonly finishSeg: Segment | null;
  private readonly startSeg: Segment | null;
  private readonly pathIndex: PolylineIndex;
  private readonly pathOffsets: number[];
  private readonly pathTotal: number;
  private readonly startS: number;
  private readonly robotDefs: { spec: SimRobotSpec; pose: Pose }[];
  /** contacts of the most recent step */
  lastContacts: Contact[] = [];

  constructor(track: CompiledTrack, robots: { spec: SimRobotSpec; pose: Pose }[], opts: SimWorldOptions = {}) {
    this.track = track;
    this.dt = opts.dt ?? 0.001;
    this.robotDefs = robots.map((r) => ({ spec: r.spec, pose: { ...r.pose } }));
    this.floor = buildFloor(track);
    const kind = track.def.kind;
    this.pathIndex = kind === "race" ? this.floor.roads : this.floor.lines;
    this.pathOffsets = [];
    let acc = 0;
    for (const l of this.pathIndex.lengths) {
      this.pathOffsets.push(acc);
      acc += l;
    }
    this.pathTotal = acc;
    let start = track.startLine;
    if (!start && kind !== "sumo") {
      const p = track.def.start;
      const nx = -Math.sin(p.heading) * 0.15;
      const ny = Math.cos(p.heading) * 0.15;
      start = { a: { x: p.x - nx, y: p.y - ny }, b: { x: p.x + nx, y: p.y + ny } };
    }
    this.startSeg = start;
    this.finishSeg = track.finishLine ?? start;
    this.startS = this.pathS(track.def.start.x, track.def.start.y);
    this.reset();
  }

  get robotCount(): number {
    return this.robots.length;
  }

  /** Direct access to a robot's dynamics state (advanced use / debugging). */
  body(i: number): RobotDynamics {
    return this.robots[i].body;
  }

  reset(): void {
    this.time = 0;
    this.stepCount = 0;
    this.events = [];
    this.drained = 0;
    this.robots = this.robotDefs.map((d) => this.makeRuntime(d.spec, d.pose));
    this.robots.forEach((r) => this.updateSurfaceState(r));
  }

  private makeRuntime(spec: SimRobotSpec, pose: Pose): Runtime {
    const body = new RobotDynamics(spec, pose);
    return {
      spec,
      initialPose: { ...pose },
      body,
      colliding: false,
      lastContactT: -Infinity,
      onTrack: true,
      out: false,
      lap: 0,
      lapTimes: [],
      lapStartT: 0,
      lapStartDist: 0,
      nextCp: 0,
      finished: false,
      batteryLow: false,
      loadFactor: 1,
      extraLoad: 0,
      z: 0,
    };
  }

  /** Teleport robot i (velocities zeroed). On-track state and events update on the next step. */
  setPose(i: number, pose: Pose): void {
    this.robots[i].body.setPose(pose);
  }

  /** New events since the last drain. */
  drainEvents(): SimEvent[] {
    const out = this.events.slice(this.drained);
    this.drained = this.events.length;
    return out;
  }

  private emit(robot: number, type: SimEvent["type"], detail?: string, value?: number): void {
    this.events.push({ t: this.time, robot, type, detail, value });
  }

  /** Arc-length position along the concatenated path polylines. */
  private pathS(x: number, y: number): number {
    if (this.pathTotal <= 0) return 0;
    const h = this.pathIndex.nearest(x, y, 0.3) ?? this.pathIndex.nearest(x, y);
    if (!h) return 0;
    return this.pathOffsets[h.poly] + h.s;
  }

  private updateSurfaceState(r: Runtime): void {
    const b = r.body;
    const kind = this.track.def.kind;
    if (kind === "race") r.onTrack = this.floor.roads.covered(b.cx, b.cy);
    else if (kind === "line") r.onTrack = this.floor.lines.nearest(b.cx, b.cy, LINE_ON_TRACK_TOLERANCE) !== null;
    else r.onTrack = !r.out;
  }

  /** One fixed physics step for all robots. commands[i] = motor voltages for robot i. */
  step(commands: (MotorCommands | undefined)[]): void {
    const dt = this.dt;
    const mu = this.track.def.surface.mu;
    const n = this.robots.length;

    // 1. drive forces → velocities
    for (let i = 0; i < n; i++) {
      const r = this.robots[i];
      const b = r.body;
      const env: DriveEnv = { surfaceMu: mu, extraForce: { x: 0, y: 0 }, loadFactor: r.loadFactor, extraLoad: r.extraLoad };
      r.z = 0;
      for (const ramp of this.track.ramps) {
        if (pointInPolygon({ x: b.cx, y: b.cy }, ramp.polygon)) {
          const th = (ramp.slopeDeg * Math.PI) / 180;
          const f = b.mass * GRAVITY * Math.sin(th);
          env.extraForce.x -= ramp.uphill.x * f;
          env.extraForce.y -= ramp.uphill.y * f;
          env.loadFactor *= Math.cos(th);
          const p0 = ramp.polygon[0];
          r.z = Math.max(0, ((b.cx - p0.x) * ramp.uphill.x + (b.cy - p0.y) * ramp.uphill.y) * Math.tan(th));
          break;
        }
      }
      b.stepDrive(commands[i], env, dt);
    }

    // 2. positions
    const prev: Vec2[] = this.robots.map((r) => ({ x: r.body.cx, y: r.body.cy }));
    for (const r of this.robots) r.body.stepPosition(dt);

    // 3. contacts
    const contacts: Contact[] = [];
    const obbs: OBB[] = this.robots.map((r) => r.body.bodyOBB());
    for (let i = 0; i < n; i++) staticContacts(i, obbs[i], this.track, contacts);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) robotContacts(i, obbs[i], j, obbs[j], contacts);
    const touching: (ContactKind | null)[] = this.robots.map(() => null);
    for (const c of contacts) {
      touching[c.a] = touching[c.a] ?? c.kind;
      if (c.b >= 0) touching[c.b] = touching[c.b] ?? c.kind;
    }
    resolveContacts(contacts, this.robots.map((r) => r.body));
    this.lastContacts = contacts;
    for (const r of this.robots) r.body.updateImu(dt);

    // wedge lift for the next step
    for (const r of this.robots) {
      r.loadFactor = 1;
      r.extraLoad = 0;
    }
    for (const c of contacts) {
      if (c.b < 0) continue;
      this.applyWedge(c.a, c.b, c, 1);
      this.applyWedge(c.b, c.a, c, -1);
    }

    this.time = ++this.stepCount * dt; // no floating-point drift

    // 4. events + competition logic
    for (let i = 0; i < n; i++) {
      const r = this.robots[i];
      const b = r.body;
      const kind = touching[i];
      if (kind) {
        if (!r.colliding && this.time - r.lastContactT > COLLISION_DEBOUNCE_S) this.emit(i, "collision", kind, Math.abs(b.forwardSpeed));
        r.colliding = true;
        r.lastContactT = this.time;
      } else r.colliding = false;

      const wasOn = r.onTrack;
      this.updateSurfaceState(r);
      if (this.track.def.kind === "sumo") {
        if (!r.out && this.track.arena && !insideArena(this.track.arena, b.cx, b.cy)) {
          r.out = true;
          r.onTrack = false;
          this.emit(i, "ring-out");
        }
      } else {
        if (wasOn && !r.onTrack) this.emit(i, "off-track");
        else if (!wasOn && r.onTrack) this.emit(i, "back-on-track");
        this.raceLogic(i, r, prev[i], { x: b.cx, y: b.cy });
      }

      if (!r.batteryLow && b.battery.terminalV < r.spec.battery.minVoltage * 1.1) {
        r.batteryLow = true;
        this.emit(i, "battery-low", undefined, b.battery.terminalV);
      }
    }
  }

  private applyWedge(a: number, other: number, c: Contact, sign: number): void {
    const A = this.robots[a];
    const w = A.spec.wedge ?? 0;
    if (w <= 0) return;
    const h = A.body.heading;
    const fx = Math.cos(h);
    const fy = Math.sin(h);
    // normal from A towards the other robot
    const nx = c.nx * sign;
    const ny = c.ny * sign;
    if (nx * fx + ny * fy < 0.7) return;
    const pose = A.body.pose;
    const lx = (c.px - pose.x) * fx + (c.py - pose.y) * fy;
    if (lx < A.spec.length / 2 - 0.015) return;
    const B = this.robots[other];
    const wl = Math.min(1, w);
    if (B.loadFactor > 1 - wl) {
      B.loadFactor = 1 - wl;
      A.extraLoad = wl * B.body.mass * GRAVITY;
    }
  }

  private raceLogic(i: number, r: Runtime, p0: Vec2, p1: Vec2): void {
    if (p0.x === p1.x && p0.y === p1.y) return;
    const cps = this.track.checkpoints;
    if (r.nextCp < cps.length) {
      const cp = cps[r.nextCp];
      if (segmentIntersect(p0, p1, cp.seg.a, cp.seg.b)) {
        this.emit(i, "checkpoint", `checkpoint ${cp.index}`, cp.index);
        r.nextCp++;
      }
    }
    const fin = this.finishSeg;
    if (fin && segmentIntersect(p0, p1, fin.a, fin.b)) {
      const travelled = r.body.distance - r.lapStartDist;
      const ok = cps.length > 0 ? r.nextCp >= cps.length : travelled >= 0.5 * Math.max(this.pathTotal, 0.5);
      if (ok) {
        const lapTime = this.time - r.lapStartT;
        r.lap++;
        r.lapTimes.push(lapTime);
        this.emit(i, "lap", `lap ${r.lap}`, lapTime);
        r.lapStartT = this.time;
        r.lapStartDist = r.body.distance;
        r.nextCp = 0;
        const target = this.track.def.laps;
        if (target && r.lap >= target && !r.finished) {
          r.finished = true;
          this.emit(i, "finish", undefined, this.time);
        }
      }
    }
  }

  /** Run for `seconds` of simulated time, asking the provider for commands before every step. */
  stepFor(seconds: number, commandsProvider: (t: number) => (MotorCommands | undefined)[]): void {
    const steps = Math.round(seconds / this.dt);
    for (let k = 0; k < steps; k++) this.step(commandsProvider(this.time));
  }

  private scene(exclude: number): RayScene {
    return {
      walls: this.track.walls,
      obstacles: this.track.obstacles,
      robots: this.robots.filter((_, j) => j !== exclude).map((r) => r.body.bodyOBB()),
    };
  }

  /** Current readings of all sensors of robot i, keyed by sensor id. */
  readSensors(robotIndex: number): Record<string, SensorReading> {
    const r = this.robots[robotIndex];
    const scene = this.scene(robotIndex);
    const out: Record<string, SensorReading> = {};
    for (const s of r.spec.sensors) out[s.id] = readSensor(s, r.body, this.floor, scene);
    return out;
  }

  raceStatus(i: number): RaceStatus {
    const r = this.robots[i];
    let progress = 0;
    if (this.pathTotal > 0) {
      const s = this.pathS(r.body.cx, r.body.cy);
      progress = (((s - this.startS) % this.pathTotal) + this.pathTotal) % this.pathTotal / this.pathTotal;
    }
    return {
      lap: r.lap,
      lapTimes: [...r.lapTimes],
      nextCheckpoint: r.nextCp,
      checkpointCount: this.track.checkpoints.length,
      progress,
      finished: r.finished,
    };
  }

  telemetry(robotIndex: number): SimRobotTelemetry {
    const r = this.robots[robotIndex];
    const b = r.body;
    const motorRpm: Record<string, number> = {};
    const motorCurrentA: Record<string, number> = {};
    const motorVoltage: Record<string, number> = {};
    b.motors.forEach((m, k) => {
      motorRpm[m.spec.id] = (b.motorOmega[k] * 60) / (2 * Math.PI);
      motorCurrentA[m.spec.id] = b.motorI[k];
      motorVoltage[m.spec.id] = b.motorV[k];
    });
    return {
      pose: b.pose,
      speed: b.forwardSpeed,
      vx: b.vx,
      vy: b.vy,
      yawRate: b.omega,
      motorRpm,
      motorCurrentA,
      motorVoltage,
      batteryVoltage: b.battery.terminalV,
      batteryUsed_mAh: b.battery.used_mAh,
      distance: b.distance,
      colliding: r.colliding,
      onTrack: r.onTrack,
      out: r.out,
      race: this.raceStatus(robotIndex),
      ax: b.ax,
      ay: b.ay,
    };
  }

  getSnapshot(): WorldSnapshot {
    return {
      t: this.time,
      robots: this.robots.map((r) => {
        const wheelAngles: Record<string, number> = {};
        r.spec.wheels.forEach((w, k) => (wheelAngles[w.id] = r.body.wheelAngle[k]));
        return {
          id: r.spec.id,
          pose: r.body.pose,
          z: r.z,
          wheelAngles,
          speed: r.body.forwardSpeed,
          colliding: r.colliding,
          onTrack: r.onTrack,
          out: r.out,
        };
      }),
    };
  }
}
