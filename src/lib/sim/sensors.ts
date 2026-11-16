/**
 * Sensor models. All pure / deterministic (no noise).
 *
 * Reflectance (IR line sensor): darkness 0..1 = fraction of a disc of radius `footprint` around the
 *   sensing point that covers dark floor, estimated with a fixed 21-point grid (5×5 grid at ±0.4r/±0.8r
 *   with the 4 corners removed). Floor darkness by track kind:
 *     line : white floor = 0, line (tape) = 1
 *     race : road = 0.85, off-road floor = 0.15
 *     sumo : black ring interior = 1, white border = 0, outside the ring (table edge / void) = 1
 *   Robots are not visible to the floor sensors.
 * Distance (ultrasonic / IR ranger): a fan of 7 rays spread uniformly over the FOV, cast against
 *   obstacles, walls (1 cm capsules, same as the collision shape) and other robots' rectangles. The
 *   nearest hit is returned. Hits closer than minRange read as minRange (the sensor is saturated – it
 *   cannot report anything smaller); nothing within maxRange → null.
 * Bumper: pressed when the bumper segment is within 2 mm of (or overlapping) a wall, obstacle or robot.
 * Encoder: signed integer count = trunc(wheel angle / 2π · countsPerRev); rpm from wheel speed.
 * IMU: yaw rate (rad/s), body-frame acceleration (m/s², no gravity), heading wrapped to (−π, π].
 */
import type { CompiledTrack, Obstacle, Segment, SensorReading, SimSensorSpec, Vec2 } from "./types";
import {
  closestOnSegment,
  distSqPointSegment,
  obbCorners,
  pointInOBB,
  rayCircle,
  rayOBB,
  raySegment,
  segmentIntersect,
  wrapAngle,
  type OBB,
} from "./geom";
import { WALL_RADIUS, obstacleOBB } from "./collision";
import type { RobotDynamics } from "./physics";

// ───────────────────────────── Spatial index for polylines ─────────────────────────────

export interface PolyHit {
  /** distance from the query point to the centre-line */
  d: number;
  poly: number;
  /** arc-length along that polyline of the closest point */
  s: number;
}

/** Uniform-grid index over a set of wide polylines (lines / roads). */
export class PolylineIndex {
  readonly polys: { points: Vec2[]; width: number }[];
  readonly lengths: number[];
  private segs: number[] = []; // ax, ay, bx, by, halfW, poly, sStart
  private cells: number[][] = [];
  private minX = 0;
  private minY = 0;
  private nx = 1;
  private ny = 1;
  private readonly cell: number;

  constructor(polys: { points: Vec2[]; width: number }[], cell = 0.05) {
    this.polys = polys;
    this.cell = cell;
    this.lengths = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    polys.forEach((pl, pi) => {
      let s = 0;
      const hw = pl.width / 2;
      for (let i = 1; i < pl.points.length; i++) {
        const a = pl.points[i - 1];
        const b = pl.points[i];
        this.segs.push(a.x, a.y, b.x, b.y, hw, pi, s);
        s += Math.hypot(b.x - a.x, b.y - a.y);
        minX = Math.min(minX, a.x - hw, b.x - hw);
        minY = Math.min(minY, a.y - hw, b.y - hw);
        maxX = Math.max(maxX, a.x + hw, b.x + hw);
        maxY = Math.max(maxY, a.y + hw, b.y + hw);
      }
      this.lengths.push(s);
    });
    if (!isFinite(minX)) return;
    this.minX = minX - cell;
    this.minY = minY - cell;
    this.nx = Math.max(1, Math.ceil((maxX - minX + 2 * cell) / cell));
    this.ny = Math.max(1, Math.ceil((maxY - minY + 2 * cell) / cell));
    this.cells = new Array(this.nx * this.ny);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    const nSeg = this.segs.length / 7;
    for (let k = 0; k < nSeg; k++) {
      const o = k * 7;
      const hw = this.segs[o + 4];
      const x0 = Math.min(this.segs[o], this.segs[o + 2]) - hw;
      const x1 = Math.max(this.segs[o], this.segs[o + 2]) + hw;
      const y0 = Math.min(this.segs[o + 1], this.segs[o + 3]) - hw;
      const y1 = Math.max(this.segs[o + 1], this.segs[o + 3]) + hw;
      const i0 = this.ix(x0);
      const i1 = this.ix(x1);
      const j0 = this.iy(y0);
      const j1 = this.iy(y1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.cells[j * this.nx + i].push(k);
    }
  }

  get totalLength(): number {
    return this.lengths.reduce((a, b) => a + b, 0);
  }

  private ix(x: number): number {
    const i = Math.floor((x - this.minX) / this.cell);
    return i < 0 ? 0 : i >= this.nx ? this.nx - 1 : i;
  }
  private iy(y: number): number {
    const j = Math.floor((y - this.minY) / this.cell);
    return j < 0 ? 0 : j >= this.ny ? this.ny - 1 : j;
  }

  /** Is (x, y) on any polyline (within its half-width)? */
  covered(x: number, y: number): boolean {
    if (this.cells.length === 0) return false;
    const fx = (x - this.minX) / this.cell;
    const fy = (y - this.minY) / this.cell;
    if (fx < 0 || fy < 0 || fx >= this.nx || fy >= this.ny) return false;
    const list = this.cells[Math.floor(fy) * this.nx + Math.floor(fx)];
    const sg = this.segs;
    for (let n = 0; n < list.length; n++) {
      const o = list[n] * 7;
      const hw = sg[o + 4];
      if (distSqPointSegment(x, y, sg[o], sg[o + 1], sg[o + 2], sg[o + 3]) <= hw * hw) return true;
    }
    return false;
  }

  /** Nearest centre-line point within maxR (grid search), or brute force when maxR is Infinity. */
  nearest(x: number, y: number, maxR = Infinity): PolyHit | null {
    const sg = this.segs;
    const nSeg = sg.length / 7;
    if (nSeg === 0) return null;
    let best = maxR * maxR;
    let bestK = -1;
    let bestT = 0;
    const test = (k: number) => {
      const o = k * 7;
      const r = closestOnSegment(x, y, sg[o], sg[o + 1], sg[o + 2], sg[o + 3]);
      if (r.d2 < best) {
        best = r.d2;
        bestK = k;
        bestT = r.t;
      }
    };
    if (!isFinite(maxR)) {
      for (let k = 0; k < nSeg; k++) test(k);
    } else {
      const i0 = this.ix(x - maxR);
      const i1 = this.ix(x + maxR);
      const j0 = this.iy(y - maxR);
      const j1 = this.iy(y + maxR);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const list = this.cells[j * this.nx + i];
          for (let n = 0; n < list.length; n++) test(list[n]);
        }
    }
    if (bestK < 0) return null;
    const o = bestK * 7;
    const segLen = Math.hypot(sg[o + 2] - sg[o], sg[o + 3] - sg[o + 1]);
    return { d: Math.sqrt(best), poly: sg[o + 5], s: sg[o + 6] + bestT * segLen };
  }
}

// ───────────────────────────── Floor ─────────────────────────────

export interface FloorModel {
  kind: CompiledTrack["def"]["kind"];
  lines: PolylineIndex;
  roads: PolylineIndex;
  arena: CompiledTrack["arena"];
}

const floorCache = new WeakMap<CompiledTrack, FloorModel>();

export function buildFloor(track: CompiledTrack): FloorModel {
  let f = floorCache.get(track);
  if (!f) {
    f = { kind: track.def.kind, lines: new PolylineIndex(track.lines), roads: new PolylineIndex(track.roads), arena: track.arena };
    floorCache.set(track, f);
  }
  return f;
}

export const RACE_ROAD_DARKNESS = 0.85;
export const RACE_OFFROAD_DARKNESS = 0.15;

/** Is the point inside the sumo arena (including the white border)? Arena is centred at the origin. */
export function insideArena(arena: NonNullable<CompiledTrack["arena"]>, x: number, y: number, inset = 0): boolean {
  if (arena.shape === "circle") {
    const R = (arena.radius ?? 0.385) - inset;
    return x * x + y * y <= R * R;
  }
  const hw = (arena.w ?? 1) / 2 - inset;
  const hh = (arena.h ?? 1) / 2 - inset;
  return Math.abs(x) <= hw && Math.abs(y) <= hh;
}

/** Darkness of the floor at a single point (0 = white … 1 = black). */
export function floorDarknessAt(floor: FloorModel, x: number, y: number): number {
  switch (floor.kind) {
    case "line":
      return floor.lines.covered(x, y) ? 1 : 0;
    case "race":
      if (floor.lines.covered(x, y)) return 1;
      return floor.roads.covered(x, y) ? RACE_ROAD_DARKNESS : RACE_OFFROAD_DARKNESS;
    case "sumo": {
      const a = floor.arena;
      if (!a) return 1;
      if (!insideArena(a, x, y)) return 1; // off the table / void
      if (insideArena(a, x, y, a.border)) return 1; // black dohyo
      return 0; // white border ring
    }
  }
  return 0;
}

/** Fixed disc sample pattern (unit radius): 5×5 grid minus corners = 21 points. */
export const DISC_SAMPLES: Vec2[] = (() => {
  const g = [-0.8, -0.4, 0, 0.4, 0.8];
  const out: Vec2[] = [];
  for (const x of g) for (const y of g) if (x * x + y * y <= 1.0001) out.push({ x, y });
  return out;
})();

/** Fraction of the footprint disc that is dark. */
export function reflectanceAt(floor: FloorModel, x: number, y: number, footprint: number): number {
  if (footprint <= 0) return floorDarknessAt(floor, x, y);
  let acc = 0;
  for (const s of DISC_SAMPLES) acc += floorDarknessAt(floor, x + s.x * footprint, y + s.y * footprint);
  return acc / DISC_SAMPLES.length;
}

// ───────────────────────────── Ray casting ─────────────────────────────

export interface RayScene {
  walls: Segment[];
  obstacles: Obstacle[];
  robots: OBB[];
}

/** Distance along a unit ray to the first hit (Infinity if none). */
export function castRay(scene: RayScene, ox: number, oy: number, dx: number, dy: number, maxRange = Infinity): number {
  let best = Infinity;
  const cull = (maxRange + WALL_RADIUS) * (maxRange + WALL_RADIUS);
  for (const w of scene.walls) {
    if (distSqPointSegment(ox, oy, w.a.x, w.a.y, w.b.x, w.b.y) > cull) continue;
    // capsule: two offset segments + end circles
    const sx = w.b.x - w.a.x;
    const sy = w.b.y - w.a.y;
    const l = Math.sqrt(sx * sx + sy * sy) || 1;
    const nx = (-sy / l) * WALL_RADIUS;
    const ny = (sx / l) * WALL_RADIUS;
    best = Math.min(
      best,
      raySegment(ox, oy, dx, dy, w.a.x + nx, w.a.y + ny, w.b.x + nx, w.b.y + ny),
      raySegment(ox, oy, dx, dy, w.a.x - nx, w.a.y - ny, w.b.x - nx, w.b.y - ny),
      rayCircle(ox, oy, dx, dy, w.a.x, w.a.y, WALL_RADIUS),
      rayCircle(ox, oy, dx, dy, w.b.x, w.b.y, WALL_RADIUS),
    );
  }
  for (const o of scene.obstacles) {
    const ex = o.cx - ox;
    const ey = o.cy - oy;
    const rad = o.kind === "circle" ? o.r : 0.5 * Math.sqrt(o.w * o.w + o.h * o.h);
    if (ex * ex + ey * ey > (maxRange + rad) * (maxRange + rad)) continue;
    best = Math.min(best, o.kind === "circle" ? rayCircle(ox, oy, dx, dy, o.cx, o.cy, o.r) : rayOBB(ox, oy, dx, dy, obstacleOBB(o)));
  }
  for (const r of scene.robots) best = Math.min(best, rayOBB(ox, oy, dx, dy, r));
  return best;
}

export const DISTANCE_RAYS = 7;

/** Distance sensor reading from a world-space origin and facing angle. */
export function distanceReading(
  scene: RayScene,
  ox: number,
  oy: number,
  facing: number,
  fovDeg: number,
  minRange: number,
  maxRange: number,
  rays = DISTANCE_RAYS,
): number | null {
  const fov = (Math.max(0, fovDeg) * Math.PI) / 180;
  let best = Infinity;
  for (let i = 0; i < rays; i++) {
    const a = rays === 1 ? facing : facing - fov / 2 + (fov * i) / (rays - 1);
    best = Math.min(best, castRay(scene, ox, oy, Math.cos(a), Math.sin(a), maxRange));
  }
  if (!(best <= maxRange)) return null;
  return best < minRange ? minRange : best;
}

// ───────────────────────────── Bumper ─────────────────────────────

export const BUMPER_TOLERANCE = 0.002;

function segmentNearOBB(a: Vec2, b: Vec2, box: OBB, tol: number): boolean {
  if (pointInOBB(a.x, a.y, box, tol) || pointInOBB(b.x, b.y, box, tol)) return true;
  const cs = obbCorners(box);
  for (let i = 0; i < 4; i++) {
    const p = cs[i];
    const q = cs[(i + 1) % 4];
    if (segmentIntersect(a, b, p, q)) return true;
    if (distSqPointSegment(p.x, p.y, a.x, a.y, b.x, b.y) <= tol * tol) return true;
  }
  return false;
}

function segSegDistSq(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  if (segmentIntersect(a, b, c, d)) return 0;
  return Math.min(
    distSqPointSegment(a.x, a.y, c.x, c.y, d.x, d.y),
    distSqPointSegment(b.x, b.y, c.x, c.y, d.x, d.y),
    distSqPointSegment(c.x, c.y, a.x, a.y, b.x, b.y),
    distSqPointSegment(d.x, d.y, a.x, a.y, b.x, b.y),
  );
}

/** Is the world-space bumper segment a–b touching anything in the scene? */
export function bumperPressed(scene: RayScene, a: Vec2, b: Vec2, tol = BUMPER_TOLERANCE): boolean {
  for (const w of scene.walls) {
    const r = WALL_RADIUS + tol;
    if (segSegDistSq(a, b, w.a, w.b) <= r * r) return true;
  }
  for (const o of scene.obstacles) {
    if (o.kind === "circle") {
      const r = o.r + tol;
      if (distSqPointSegment(o.cx, o.cy, a.x, a.y, b.x, b.y) <= r * r) return true;
    } else if (segmentNearOBB(a, b, obstacleOBB(o), tol)) return true;
  }
  for (const r of scene.robots) if (segmentNearOBB(a, b, r, tol)) return true;
  return false;
}

// ───────────────────────────── Per-robot sensor evaluation ─────────────────────────────

/** Evaluate one sensor of a robot. `scene` must exclude the robot itself. */
export function readSensor(sensor: SimSensorSpec, body: RobotDynamics, floor: FloorModel, scene: RayScene): SensorReading {
  const pose = body.pose;
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  const w = (p: Vec2): Vec2 => ({ x: pose.x + p.x * c - p.y * s, y: pose.y + p.x * s + p.y * c });
  switch (sensor.kind) {
    case "reflectance":
      return {
        kind: "reflectance",
        darkness: sensor.points.map((p) => {
          const q = w(p);
          return reflectanceAt(floor, q.x, q.y, sensor.footprint);
        }),
      };
    case "distance": {
      const o = w({ x: sensor.x, y: sensor.y });
      return {
        kind: "distance",
        distance: distanceReading(scene, o.x, o.y, pose.heading + sensor.angle, sensor.fovDeg, sensor.minRange, sensor.maxRange),
      };
    }
    case "bumper":
      return { kind: "bumper", pressed: bumperPressed(scene, w(sensor.a), w(sensor.b)) };
    case "encoder": {
      const wi = body.spec.wheels.findIndex((wh) => wh.id === sensor.wheelId);
      if (wi < 0) return { kind: "encoder", count: 0, rpm: 0 };
      const ang = body.wheelAngle[wi];
      const om = body.wheelOmega[wi];
      return { kind: "encoder", count: Math.trunc((ang / (2 * Math.PI)) * sensor.countsPerRev), rpm: (om * 60) / (2 * Math.PI) };
    }
    case "imu":
      return { kind: "imu", yawRate: body.omega, ax: body.ax, ay: body.ay, heading: wrapAngle(body.heading) };
  }
}
