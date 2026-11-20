/**
 * Small 2D geometry toolkit used by the physics engine, sensors and track compiler.
 * Pure functions, no allocations in the hottest helpers where avoidable.
 */
import type { Pose, Segment, Vec2 } from "./types";

export const TAU = Math.PI * 2;

/** Fast 2-argument hypot (Math.hypot is slow in V8). */
export const hyp = (x: number, y: number): number => Math.sqrt(x * x + y * y);

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => hyp(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => hyp(a.x - b.x, a.y - b.y);
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function normalize(a: Vec2): Vec2 {
  const l = hyp(a.x, a.y);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
}

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}

/** Rotate vector by angle (CCW). */
export function rotate(p: Vec2, ang: number): Vec2 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Transform a local point by a pose (rotate then translate). */
export function toWorld(pose: Pose, p: Vec2): Vec2 {
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  return { x: pose.x + p.x * c - p.y * s, y: pose.y + p.x * s + p.y * c };
}

/** Inverse of toWorld. */
export function toLocal(pose: Pose, p: Vec2): Vec2 {
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  const dx = p.x - pose.x;
  const dy = p.y - pose.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** Closest point parameter t∈[0,1] on segment ab to p, plus squared distance. */
export function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { t: number; d2: number; x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t;
  const y = ay + dy * t;
  const ex = px - x;
  const ey = py - y;
  return { t, d2: ex * ex + ey * ey, x, y };
}

/** Squared distance from point to segment (allocation-free). */
export function distSqPointSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - (ax + dx * t);
  const ey = py - (ay + dy * t);
  return ex * ex + ey * ey;
}

/** Segment–segment intersection; returns parameters along both or null. */
export function segmentIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): { t: number; u: number } | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-14) return null;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/** Ray (origin o, unit dir d) vs segment ab; returns distance along ray or Infinity. */
export function raySegment(ox: number, oy: number, dx: number, dy: number, ax: number, ay: number, bx: number, by: number): number {
  const sx = bx - ax;
  const sy = by - ay;
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-14) return Infinity;
  const qx = ax - ox;
  const qy = ay - oy;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * dy - qy * dx) / den;
  if (t < 0 || u < 0 || u > 1) return Infinity;
  return t;
}

/** Ray vs circle; returns nearest non-negative hit distance (0 if origin inside) or Infinity. */
export function rayCircle(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number): number {
  const fx = ox - cx;
  const fy = oy - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const b = fx * dx + fy * dy;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}

/** Oriented box description. */
export interface OBB {
  cx: number;
  cy: number;
  hx: number; // half extent along local x
  hy: number; // half extent along local y
  rot: number;
}

export function obbCorners(b: OBB): Vec2[] {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const out: Vec2[] = [];
  const sx = [1, -1, -1, 1];
  const sy = [1, 1, -1, -1];
  for (let i = 0; i < 4; i++) {
    const lx = sx[i] * b.hx;
    const ly = sy[i] * b.hy;
    out.push({ x: b.cx + lx * c - ly * s, y: b.cy + lx * s + ly * c });
  }
  return out;
}

/** Ray vs OBB (slab test in local frame). Returns distance or Infinity (0 if origin inside). */
export function rayOBB(ox: number, oy: number, dx: number, dy: number, b: OBB): number {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const px = ox - b.cx;
  const py = oy - b.cy;
  const lox = px * c + py * s;
  const loy = -px * s + py * c;
  const ldx = dx * c + dy * s;
  const ldy = -dx * s + dy * c;
  let tmin = -Infinity;
  let tmax = Infinity;
  // x slab
  if (Math.abs(ldx) < 1e-14) {
    if (lox < -b.hx || lox > b.hx) return Infinity;
  } else {
    let t1 = (-b.hx - lox) / ldx;
    let t2 = (b.hx - lox) / ldx;
    if (t1 > t2) {
      const tt = t1;
      t1 = t2;
      t2 = tt;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // y slab
  if (Math.abs(ldy) < 1e-14) {
    if (loy < -b.hy || loy > b.hy) return Infinity;
  } else {
    let t1 = (-b.hy - loy) / ldy;
    let t2 = (b.hy - loy) / ldy;
    if (t1 > t2) {
      const tt = t1;
      t1 = t2;
      t2 = tt;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (tmax < 0) return Infinity;
  return tmin >= 0 ? tmin : 0;
}

/** Point inside OBB? (with optional tolerance) */
export function pointInOBB(px: number, py: number, b: OBB, tol = 0): boolean {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const dx = px - b.cx;
  const dy = py - b.cy;
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  return Math.abs(lx) <= b.hx + tol && Math.abs(ly) <= b.hy + tol;
}

/** Closest point on/in OBB to p (returns p itself if inside). */
export function closestPointOBB(px: number, py: number, b: OBB): { x: number; y: number; inside: boolean } {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const dx = px - b.cx;
  const dy = py - b.cy;
  let lx = dx * c + dy * s;
  let ly = -dx * s + dy * c;
  const inside = Math.abs(lx) <= b.hx && Math.abs(ly) <= b.hy;
  lx = clamp(lx, -b.hx, b.hx);
  ly = clamp(ly, -b.hy, b.hy);
  return { x: b.cx + lx * c - ly * s, y: b.cy + lx * s + ly * c, inside };
}

/** Point-in-polygon (even-odd). */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function polylineLength(pts: Vec2[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

/** Project p onto a polyline: arc-length s of the closest point and the distance. */
export function projectOnPolyline(p: Vec2, pts: Vec2[]): { s: number; d: number; seg: number } {
  let best = Infinity;
  let bestS = 0;
  let bestSeg = 0;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = dist(a, b);
    const r = closestOnSegment(p.x, p.y, a.x, a.y, b.x, b.y);
    if (r.d2 < best) {
      best = r.d2;
      bestS = acc + r.t * segLen;
      bestSeg = i - 1;
    }
    acc += segLen;
  }
  return { s: bestS, d: Math.sqrt(best), seg: bestSeg };
}

/** Segment helper for typed segment records. */
export function segIntersects(s: Segment, a: Vec2, b: Vec2): boolean {
  return segmentIntersect(s.a, s.b, a, b) !== null;
}

/**
 * Separating-axis test between two OBBs.
 * Returns penetration depth and unit normal pointing from A to B, or null if separated.
 */
export function satOBB(A: OBB, B: OBB): { depth: number; nx: number; ny: number } | null {
  const axes: [number, number][] = [
    [Math.cos(A.rot), Math.sin(A.rot)],
    [-Math.sin(A.rot), Math.cos(A.rot)],
    [Math.cos(B.rot), Math.sin(B.rot)],
    [-Math.sin(B.rot), Math.cos(B.rot)],
  ];
  const tx = B.cx - A.cx;
  const ty = B.cy - A.cy;
  let minDepth = Infinity;
  let nx = 0;
  let ny = 0;
  const aAx = axes[0];
  const aAy = axes[1];
  const bAx = axes[2];
  const bAy = axes[3];
  for (const [ux, uy] of axes) {
    const ra = A.hx * Math.abs(aAx[0] * ux + aAx[1] * uy) + A.hy * Math.abs(aAy[0] * ux + aAy[1] * uy);
    const rb = B.hx * Math.abs(bAx[0] * ux + bAx[1] * uy) + B.hy * Math.abs(bAy[0] * ux + bAy[1] * uy);
    const d = tx * ux + ty * uy;
    const overlap = ra + rb - Math.abs(d);
    if (overlap <= 0) return null;
    if (overlap < minDepth) {
      minDepth = overlap;
      const sgn = d >= 0 ? 1 : -1;
      nx = ux * sgn;
      ny = uy * sgn;
    }
  }
  return { depth: minDepth, nx, ny };
}

/** Arc points helper: arc starting at local origin heading +x with radius r sweeping angle (positive = left). */
export function arcPoints(r: number, angle: number, maxStep = 0.01): Vec2[] {
  const n = Math.max(2, Math.ceil((Math.abs(angle) * r) / maxStep));
  const sgn = angle >= 0 ? 1 : -1;
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const phi = (Math.abs(angle) * i) / n;
    pts.push({ x: r * Math.sin(phi), y: sgn * r * (1 - Math.cos(phi)) });
  }
  return pts;
}

/** Inverse of a 3×3 matrix given row-major as 9 numbers, or null if (near-)singular. */
export function invert3(m: ArrayLike<number>): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const scale = Math.abs(a) + Math.abs(e) + Math.abs(i);
  if (!isFinite(det) || Math.abs(det) < 1e-12 * Math.max(1e-30, scale * scale * scale)) return null;
  const k = 1 / det;
  return [
    A * k,
    -(b * i - c * h) * k,
    (b * f - c * e) * k,
    B * k,
    (a * i - c * g) * k,
    -(a * f - c * d) * k,
    C * k,
    -(a * h - b * g) * k,
    (a * e - b * d) * k,
  ];
}
