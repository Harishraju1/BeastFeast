/**
 * Contact generation and impulse-based resolution.
 *
 * Shapes: robot body = oriented rectangle; obstacles = oriented boxes or circles; walls = segments
 * treated as capsules of radius WALL_RADIUS (1 cm). Contacts carry a unit normal pointing from the
 * robot ("A") towards the other body ("B"). Resolution: sequential impulses (restitution 0.1, Coulomb
 * friction) for a few iterations, followed by linear positional correction (Baumgarte style, 80 %
 * of penetration beyond a 0.5 mm slop). Static geometry has infinite mass.
 */
import type { CompiledTrack, Obstacle } from "./types";
import { closestOnSegment, closestPointOBB, hyp, obbCorners, pointInOBB, satOBB, type OBB } from "./geom";
import type { RobotDynamics } from "./physics";

export const WALL_RADIUS = 0.01;
export const RESTITUTION = 0.1;
export const FRICTION_STATIC = 0.3; // robot vs wall/obstacle
export const FRICTION_ROBOT = 0.5; // robot vs robot
const ITERATIONS = 6;
const SLOP = 0.0005;
const CORRECTION = 0.8;

export type ContactKind = "wall" | "obstacle" | "robot";

export interface Contact {
  a: number; // robot index
  b: number; // other robot index, or -1 for static geometry
  kind: ContactKind;
  px: number;
  py: number;
  nx: number; // unit normal A -> B
  ny: number;
  depth: number;
  /** obstacle index (kind obstacle) or wall index */
  ref: number;
}

export function obstacleOBB(o: Extract<Obstacle, { kind: "box" }>): OBB {
  return { cx: o.cx, cy: o.cy, hx: o.w / 2, hy: o.h / 2, rot: o.rotation };
}

/** Exit normal for a point inside box A (outward from A through the nearest face). */
function insideNormal(px: number, py: number, A: OBB): { nx: number; ny: number; depth: number } {
  const c = Math.cos(A.rot);
  const s = Math.sin(A.rot);
  const dx = px - A.cx;
  const dy = py - A.cy;
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  const pxDepth = A.hx - Math.abs(lx);
  const pyDepth = A.hy - Math.abs(ly);
  if (pxDepth < pyDepth) {
    const sg = lx >= 0 ? 1 : -1;
    return { nx: c * sg, ny: s * sg, depth: pxDepth };
  }
  const sg = ly >= 0 ? 1 : -1;
  return { nx: -s * sg, ny: c * sg, depth: pyDepth };
}

/** OBB vs OBB contact manifold (normal from A to B). */
export function boxBoxContacts(A: OBB, B: OBB): { points: { x: number; y: number }[]; nx: number; ny: number; depth: number } | null {
  const sat = satOBB(A, B);
  if (!sat) return null;
  const pts: { x: number; y: number }[] = [];
  const tol = 1e-6;
  for (const p of obbCorners(A)) if (pointInOBB(p.x, p.y, B, tol)) pts.push(p);
  for (const p of obbCorners(B)) if (pointInOBB(p.x, p.y, A, tol)) pts.push(p);
  if (pts.length === 0) {
    // edge-edge crossing: use the midpoint between the deepest support points
    const ca = obbCorners(A);
    const cb = obbCorners(B);
    let ia = 0;
    let ib = 0;
    for (let i = 1; i < 4; i++) {
      if (ca[i].x * sat.nx + ca[i].y * sat.ny > ca[ia].x * sat.nx + ca[ia].y * sat.ny) ia = i;
      if (cb[i].x * sat.nx + cb[i].y * sat.ny < cb[ib].x * sat.nx + cb[ib].y * sat.ny) ib = i;
    }
    pts.push({ x: (ca[ia].x + cb[ib].x) / 2, y: (ca[ia].y + cb[ib].y) / 2 });
  }
  // keep at most two points (average duplicates)
  const out = pts.length > 2 ? [pts[0], pts[pts.length - 1]] : pts;
  return { points: out, nx: sat.nx, ny: sat.ny, depth: sat.depth };
}

/** OBB vs circle (normal from box to circle). */
export function boxCircleContact(A: OBB, cx: number, cy: number, r: number): { x: number; y: number; nx: number; ny: number; depth: number } | null {
  const q = closestPointOBB(cx, cy, A);
  if (!q.inside) {
    const dx = cx - q.x;
    const dy = cy - q.y;
    const d = hyp(dx, dy);
    if (d >= r) return null;
    return { x: q.x, y: q.y, nx: dx / d, ny: dy / d, depth: r - d };
  }
  const n = insideNormal(cx, cy, A);
  return { x: cx, y: cy, nx: n.nx, ny: n.ny, depth: n.depth + r };
}

/** OBB vs segment-capsule (normal from box to the wall). */
export function boxSegmentContacts(
  A: OBB,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius = WALL_RADIUS,
): { x: number; y: number; nx: number; ny: number; depth: number }[] {
  const out: { x: number; y: number; nx: number; ny: number; depth: number }[] = [];
  for (const p of obbCorners(A)) {
    const q = closestOnSegment(p.x, p.y, ax, ay, bx, by);
    if (q.d2 < radius * radius) {
      const d = Math.sqrt(q.d2);
      let nx: number;
      let ny: number;
      if (d > 1e-9) {
        nx = (q.x - p.x) / d;
        ny = (q.y - p.y) / d;
      } else {
        // corner exactly on the wall line: push away from box centre
        const sx = bx - ax;
        const sy = by - ay;
        const l = hyp(sx, sy) || 1;
        nx = -sy / l;
        ny = sx / l;
        if ((A.cx - ax) * nx + (A.cy - ay) * ny > 0) {
          nx = -nx;
          ny = -ny;
        }
      }
      out.push({ x: p.x, y: p.y, nx, ny, depth: radius - d });
    }
  }
  for (const e of [
    { x: ax, y: ay },
    { x: bx, y: by },
  ]) {
    if (pointInOBB(e.x, e.y, A, radius)) {
      const n = insideNormal(e.x, e.y, A);
      out.push({ x: e.x, y: e.y, nx: n.nx, ny: n.ny, depth: n.depth + radius });
    }
  }
  return out;
}

/** All contacts between robot `i` and static geometry. */
export function staticContacts(i: number, A: OBB, track: CompiledTrack, out: Contact[]): void {
  // quick reject radius
  const rA = hyp(A.hx, A.hy);
  track.walls.forEach((w, wi) => {
    // bounding check
    const q = closestOnSegment(A.cx, A.cy, w.a.x, w.a.y, w.b.x, w.b.y);
    if (q.d2 > (rA + WALL_RADIUS) * (rA + WALL_RADIUS)) return;
    for (const c of boxSegmentContacts(A, w.a.x, w.a.y, w.b.x, w.b.y)) {
      out.push({ a: i, b: -1, kind: "wall", px: c.x, py: c.y, nx: c.nx, ny: c.ny, depth: c.depth, ref: wi });
    }
  });
  track.obstacles.forEach((o, oi) => {
    if (o.kind === "circle") {
      if (hyp(o.cx - A.cx, o.cy - A.cy) > rA + o.r) return;
      const c = boxCircleContact(A, o.cx, o.cy, o.r);
      if (c) out.push({ a: i, b: -1, kind: "obstacle", px: c.x, py: c.y, nx: c.nx, ny: c.ny, depth: c.depth, ref: oi });
    } else {
      if (hyp(o.cx - A.cx, o.cy - A.cy) > rA + hyp(o.w, o.h) / 2) return;
      const m = boxBoxContacts(A, obstacleOBB(o));
      if (m) for (const p of m.points) out.push({ a: i, b: -1, kind: "obstacle", px: p.x, py: p.y, nx: m.nx, ny: m.ny, depth: m.depth, ref: oi });
    }
  });
}

/** Contacts between robots i and j. */
export function robotContacts(i: number, A: OBB, j: number, B: OBB, out: Contact[]): void {
  if (hyp(A.cx - B.cx, A.cy - B.cy) > hyp(A.hx, A.hy) + hyp(B.hx, B.hy)) return;
  const m = boxBoxContacts(A, B);
  if (!m) return;
  for (const p of m.points) out.push({ a: i, b: j, kind: "robot", px: p.x, py: p.y, nx: m.nx, ny: m.ny, depth: m.depth, ref: j });
}

/** Sequential-impulse velocity resolution + positional correction. */
export function resolveContacts(contacts: Contact[], bodies: RobotDynamics[]): void {
  if (contacts.length === 0) return;
  for (let it = 0; it < ITERATIONS; it++) {
    for (const c of contacts) {
      const A = bodies[c.a];
      const B = c.b >= 0 ? bodies[c.b] : null;
      const va = A.pointVelocity(c.px, c.py);
      const vb = B ? B.pointVelocity(c.px, c.py) : { x: 0, y: 0 };
      const rvx = vb.x - va.x;
      const rvy = vb.y - va.y;
      const vn = rvx * c.nx + rvy * c.ny;
      if (vn >= 0) continue; // separating
      const rax = c.px - A.cx;
      const ray = c.py - A.cy;
      const raN = rax * c.ny - ray * c.nx;
      let k = A.invMass + raN * raN * A.invInertia;
      let rbx = 0;
      let rby = 0;
      if (B) {
        rbx = c.px - B.cx;
        rby = c.py - B.cy;
        const rbN = rbx * c.ny - rby * c.nx;
        k += B.invMass + rbN * rbN * B.invInertia;
      }
      // restitution only for real impacts (avoid jitter while resting/pushing)
      const e = vn < -0.05 ? RESTITUTION : 0;
      const j = (-(1 + e) * vn) / k;
      A.applyImpulse(c.px, c.py, -j * c.nx, -j * c.ny);
      if (B) B.applyImpulse(c.px, c.py, j * c.nx, j * c.ny);
      // friction
      const va2 = A.pointVelocity(c.px, c.py);
      const vb2 = B ? B.pointVelocity(c.px, c.py) : { x: 0, y: 0 };
      const tx = -c.ny;
      const ty = c.nx;
      const vt = (vb2.x - va2.x) * tx + (vb2.y - va2.y) * ty;
      const raT = rax * ty - ray * tx;
      let kt = A.invMass + raT * raT * A.invInertia;
      if (B) {
        const rbT = rbx * ty - rby * tx;
        kt += B.invMass + rbT * rbT * B.invInertia;
      }
      const mu = c.kind === "robot" ? FRICTION_ROBOT : FRICTION_STATIC;
      let jt = -vt / kt;
      const maxF = mu * j;
      if (jt > maxF) jt = maxF;
      else if (jt < -maxF) jt = -maxF;
      A.applyImpulse(c.px, c.py, -jt * tx, -jt * ty);
      if (B) B.applyImpulse(c.px, c.py, jt * tx, jt * ty);
    }
  }
  // positional correction: one per (a,b,ref) pair using the deepest contact
  const seen = new Map<string, Contact>();
  for (const c of contacts) {
    const key = `${c.a}|${c.b}|${c.kind}|${c.ref}`;
    const prev = seen.get(key);
    if (!prev || c.depth > prev.depth) seen.set(key, c);
  }
  for (const c of seen.values()) {
    const A = bodies[c.a];
    const B = c.b >= 0 ? bodies[c.b] : null;
    const corr = Math.max(0, c.depth - SLOP) * CORRECTION;
    if (corr <= 0) continue;
    const wA = A.invMass;
    const wB = B ? B.invMass : 0;
    const tot = wA + wB;
    A.cx -= c.nx * corr * (wA / tot);
    A.cy -= c.ny * corr * (wA / tot);
    if (B) {
      B.cx += c.nx * corr * (wB / tot);
      B.cy += c.ny * corr * (wB / tot);
    }
  }
}
