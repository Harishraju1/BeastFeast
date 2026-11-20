/**
 * Off-road terrain: TrackDef terrain pieces → TerrainModel (height map, surfaces, solid outlines).
 *
 * The SAME functions are used by the physics (world.ts samples them under every wheel) and by the 3D
 * renderer (one mesh per feature from `featureHeight`), so what the student sees is what the robot
 * drives on. Everything is deterministic: shapes come from a seeded PRNG (mulberry32); a piece without
 * `seed` uses a hash of its id, so a saved track always rebuilds the same terrain.
 *
 * ── Piece frame ────────────────────────────────────────────────────────────────────────────────
 * Every terrain piece is CENTRED on (piece.x, piece.y) and rotated by piece.rotation. Local +x is the
 * "along" direction (the direction a robot is expected to drive over it), local +y is "across".
 * Sizes: `length` = along local x, `width` = across (local y). Blocks/hurdles use `depth` for their
 * (thin) size along local x. All values in metres, angles in degrees (slopeDeg) or radians (angle).
 *
 * ── Pieces (defaults in TERRAIN_DEFAULTS) ──────────────────────────────────────────────────────
 *  rock       one irregular boulder: ellipsoid cap h = H·√(1 − q²), q = ρ/r(θ), where ρ is the
 *             distance from the centre in a frame scaled by width/2 × depth/2 and the outline
 *             r(θ) = 1 + Σₖ₌₂..₅ aₖ·cos(kθ + φₖ) is seeded (|aₖ| ≤ 0.28/k). Solid outline: circle of the
 *             mean radius (0.95 · (width + depth)/4).
 *  rock-field `count` rocks scattered (non-overlapping, seeded) in a length × width area; rock heights
 *             are 35–100 % of `height`, diameters 2–3.4 × their height (≥ 2 cm). Each rock is its own
 *             feature (kind "rock"), so each one is drivable or solid on its own.
 *  mud        flat patch (no height) shaped as a rounded rectangle (superellipse |x/a|⁴ + |y/b|⁴ ≤ 1);
 *             tyre μ × `grip`, extra rolling-resistance coefficient `drag` (sinkage).
 *  bumps      smooth bumps and dips: Σ seeded Gaussians (σ 3–8 cm, 30 % are dips at −70 % amplitude),
 *             soft-limited with A·tanh(Σ/A) and faded to 0 over the last ≤ 6 cm of the area.
 *  zigzag     raised path of `segments` straight legs, each at ±`angle` to local x, top width `width`.
 *             Top height along the path rises and falls between `minHeight` (at the ends and at every
 *             even corner) and `height` (at every odd corner) with smoothstep transitions, so there are
 *             flat-ish raised sections joined by up- and down-slopes. Off the top the sides slope linearly
 *             to the floor over `edge`; the path ends are rounded the same way.
 *  hill       frustum: linear up-slope at `slopeDeg`, flat top at `height`, down-slope; `length` is the
 *             whole footprint along x (if too short for the slopes the hill becomes a ridge with a lower
 *             peak at the same slope); the sides fall over `edge`. Never solid — whether a robot gets up
 *             is decided by gravity, traction and motor torque.
 *  block      box `depth` (along x) × `width` × `height` with a short linear ramp `edge` on every side.
 *  hurdles    `count` blocks (thickness `depth`) across the path, `spacing` = gap between hurdles.
 *  platform   raised flat top `length` × `width` at `height` with sloped edges `edge` on every side.
 *
 * ── Composition ────────────────────────────────────────────────────────────────────────────────
 * height(x, y) = max of the positive feature heights + min of the negative ones (dips). Features do NOT
 * stack (a rock on a hill top is hidden inside the hill), which is exactly the union of the per-feature
 * meshes the renderer draws. surface(x, y): inside mud → { "mud", grip, drag } (overlapping patches: the
 * lowest grip and highest drag); otherwise the kind of the highest feature at that point; μ 1, crr 0.
 *
 * ── Solids (per robot) ─────────────────────────────────────────────────────────────────────────
 * Features with a steep outline (rocks always; blocks, hurdles and platforms when height/edge > 1, i.e.
 * edges steeper than 45°) carry `solid`, an Obstacle outline. Whether it is solid for a particular robot
 * is decided by `isSolidFor(feature, terrainStepLimit(spec))`:
 *     step limit = min(groundClearance (default 1 cm), 0.6 × smallest driven wheel radius)
 *     solid ⇔ feature.solid is defined and feature.maxHeight ≥ step limit.
 * A solid feature is a collision obstacle for that robot (and visible to its distance sensors and
 * bumpers) and is removed from that robot's height map; a lower one is part of the height map and the
 * wheels ride over it. Slopes (hills, zigzag, bumps, gentle platform edges) are never solid.
 *
 * Limitations (honest): rocks/blocks are height fields (no overhangs); the solid outline of a rock is
 * a circle, so very irregular rocks collide slightly inside/outside their visual outline; features
 * don't stack; mud is flat (sinkage is modelled as drag, not as height).
 */
import type { Obstacle, SimRobotSpec, TerrainFeature, TerrainModel, TerrainSurfaceKind, TrackDef, TrackPiece, TrackPieceType } from "@/lib/sim/types";

export const TERRAIN_PIECE_TYPES: TrackPieceType[] = ["rock", "rock-field", "mud", "bumps", "zigzag", "hill", "block", "hurdles", "platform"];

export const isTerrainPiece = (t: TrackPieceType): boolean => TERRAIN_PIECE_TYPES.includes(t);

/** Default parameters of each terrain piece (what the editor should show when a param is unset). */
export const TERRAIN_DEFAULTS = {
  /** depth defaults to width; seed defaults to a hash of the piece id */
  rock: { width: 0.06, depth: 0.06, height: 0.025 },
  "rock-field": { length: 0.6, width: 0.4, count: 8, height: 0.03 },
  mud: { length: 0.5, width: 0.3, grip: 0.45, drag: 0.12 },
  /** count defaults to round(length·width·40), clamped 3…80 */
  bumps: { length: 0.8, width: 0.4, amplitude: 0.012 },
  zigzag: { length: 1.2, width: 0.24, segments: 4, angle: Math.PI / 6, height: 0.04, minHeight: 0.01, edge: 0.06 },
  hill: { length: 1.0, width: 0.4, height: 0.05, slopeDeg: 15, edge: 0.05 },
  block: { depth: 0.06, width: 0.2, height: 0.015, edge: 0.008 },
  hurdles: { count: 3, depth: 0.025, width: 0.3, height: 0.012, spacing: 0.2, edge: 0.008 },
  platform: { length: 0.5, width: 0.35, height: 0.03, edge: 0.06 },
} as const;

/** Ground clearance assumed when a robot spec doesn't give one (m). */
export const DEFAULT_GROUND_CLEARANCE = 0.01;
/** A driven wheel can climb a step up to this fraction of its radius. */
export const WHEEL_CLIMB_FACTOR = 0.6;

/** Tallest step / rock this robot can drive over (m): min(ground clearance, 0.6 × smallest driven wheel radius). */
export function terrainStepLimit(spec: SimRobotSpec): number {
  const clearance = spec.groundClearance ?? DEFAULT_GROUND_CLEARANCE;
  const driven = spec.wheels.filter((w) => w.motorId);
  const wheels = driven.length ? driven : spec.wheels;
  const rMin = wheels.length ? Math.min(...wheels.map((w) => w.radius)) : 0;
  return Math.max(0, Math.min(clearance, WHEEL_CLIMB_FACTOR * rMin));
}

/** Is this feature a collision obstacle (rather than part of the height map) for a robot with this step limit? */
export function isSolidFor(f: TerrainFeature, stepLimit: number): boolean {
  return !!f.solid && f.maxHeight >= stepLimit;
}

// ───────────────────────────── helpers ─────────────────────────────

/** mulberry32 PRNG → uniform [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string (default seed of a piece). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const pos = (v: number | undefined, d: number, min = 0): number => (typeof v === "number" && isFinite(v) ? Math.max(min, v) : d);
const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

type Bounds = TerrainFeature["bounds"];

function rectBounds(cx: number, cy: number, c: number, s: number, hx: number, hy: number): Bounds {
  const ex = Math.abs(c) * hx + Math.abs(s) * hy;
  const ey = Math.abs(s) * hx + Math.abs(c) * hy;
  return { minX: cx - ex, minY: cy - ey, maxX: cx + ex, maxY: cy + ey };
}

interface FeatureImpl {
  feature: TerrainFeature;
  /** height function (world coords); null = flat (mud) */
  h: ((x: number, y: number) => number) | null;
  /** footprint test for flat surface features (mud) */
  inside?: (x: number, y: number) => boolean;
  label: TerrainSurfaceKind;
}

// ───────────────────────────── feature builders ─────────────────────────────

function makeRock(pieceId: string, cx: number, cy: number, rot: number, width: number, depth: number, H: number, seed: number): FeatureImpl {
  const rnd = mulberry32(seed);
  const amp: number[] = [];
  const ph: number[] = [];
  for (let k = 2; k <= 5; k++) {
    amp.push(((rnd() * 2 - 1) * 0.28) / k);
    ph.push(rnd() * Math.PI * 2);
  }
  const outline = (th: number): number => {
    let r = 1;
    for (let k = 0; k < 4; k++) r += amp[k] * Math.cos((k + 2) * th + ph[k]);
    return r;
  };
  let rMax = 0;
  for (let i = 0; i < 96; i++) rMax = Math.max(rMax, outline((i / 96) * Math.PI * 2));
  rMax *= 1.01;
  const a = Math.max(0.004, width / 2);
  const b = Math.max(0.004, depth / 2);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const R = Math.max(a, b) * rMax;
  const rMax2 = rMax * rMax;
  const h = (x: number, y: number): number => {
    const ex = x - cx;
    const ey = y - cy;
    if (ex * ex + ey * ey >= R * R) return 0;
    const lx = (ex * c + ey * s) / a;
    const ly = (-ex * s + ey * c) / b;
    const rho2 = lx * lx + ly * ly;
    if (rho2 >= rMax2) return 0;
    const r = outline(Math.atan2(ly, lx));
    const q2 = rho2 / (r * r);
    return q2 >= 1 ? 0 : H * Math.sqrt(1 - q2);
  };
  return {
    feature: {
      pieceId,
      kind: "rock",
      bounds: { minX: cx - R, minY: cy - R, maxX: cx + R, maxY: cy + R },
      maxHeight: H,
      solid: { kind: "circle", cx, cy, r: 0.95 * ((a + b) / 2) },
    },
    h,
    label: "rock",
  };
}

/**
 * Frustum ("mesa") in the piece frame: flat top 2hx × 2hy at height H, linear ramps of run ex (along x)
 * and ey (across) on all sides.
 */
function makeMesa(
  pieceId: string,
  kind: "hill" | "block" | "platform",
  label: TerrainSurfaceKind,
  cx: number,
  cy: number,
  rot: number,
  hx: number,
  hy: number,
  ex: number,
  ey: number,
  H: number,
  canBeSolid: boolean,
): FeatureImpl {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const ox = hx + ex;
  const oy = hy + ey;
  const h = (x: number, y: number): number => {
    const dx = x - cx;
    const dy = y - cy;
    const lx = Math.abs(dx * c + dy * s);
    if (lx >= ox) return 0;
    const ly = Math.abs(-dx * s + dy * c);
    if (ly >= oy) return 0;
    const fx = (ox - lx) / ex;
    const fy = (oy - ly) / ey;
    const f = fx < fy ? fx : fy;
    return H * (f < 1 ? f : 1);
  };
  const steep = H > ex || H > ey; // an edge steeper than 45°
  const solid: Obstacle | undefined = canBeSolid && steep ? { kind: "box", cx, cy, w: 2 * hx + ex, h: 2 * hy + ey, rotation: rot } : undefined;
  return { feature: { pieceId, kind, bounds: rectBounds(cx, cy, c, s, ox, oy), maxHeight: H, solid }, h, label };
}

function buildPiece(piece: TrackPiece, out: FeatureImpl[]): void {
  const p = piece.params;
  const cx = piece.x;
  const cy = piece.y;
  const rot = piece.rotation || 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const seed = typeof p.seed === "number" && isFinite(p.seed) ? Math.floor(p.seed) >>> 0 : hashString(piece.id);
  const toWorld = (lx: number, ly: number) => ({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c });

  switch (piece.type) {
    case "rock": {
      const D = TERRAIN_DEFAULTS.rock;
      const w = pos(p.width, D.width, 0.01);
      out.push(makeRock(piece.id, cx, cy, rot, w, pos(p.depth, w, 0.01), pos(p.height, D.height, 0.001), seed));
      return;
    }
    case "rock-field": {
      const D = TERRAIN_DEFAULTS["rock-field"];
      const hx = pos(p.length, D.length, 0.02) / 2;
      const hy = pos(p.width, D.width, 0.02) / 2;
      const count = Math.min(200, Math.round(pos(p.count, D.count)));
      const Hmax = pos(p.height, D.height, 0.001);
      const rnd = mulberry32(seed);
      const placed: { x: number; y: number; r: number }[] = [];
      for (let k = 0; k < count; k++) {
        const H = Hmax * (0.35 + 0.65 * rnd());
        const dia = Math.min(0.15, Math.max(0.02, H * (2 + 1.4 * rnd())));
        const dia2 = dia * (0.7 + 0.3 * rnd());
        const r = dia / 2;
        const rockRot = rnd() * Math.PI;
        const rockSeed = Math.floor(rnd() * 4294967295);
        for (let tries = 0; tries < 30; tries++) {
          const lx = (rnd() * 2 - 1) * Math.max(0, hx - r);
          const ly = (rnd() * 2 - 1) * Math.max(0, hy - r);
          if (placed.some((q) => Math.hypot(q.x - lx, q.y - ly) < (q.r + r) * 1.05)) continue;
          placed.push({ x: lx, y: ly, r });
          const w = toWorld(lx, ly);
          out.push(makeRock(piece.id, w.x, w.y, rot + rockRot, dia, dia2, H, rockSeed));
          break;
        }
      }
      return;
    }
    case "mud": {
      const D = TERRAIN_DEFAULTS.mud;
      const hx = pos(p.length, D.length, 0.01) / 2;
      const hy = pos(p.width, D.width, 0.01) / 2;
      const grip = Math.min(1, Math.max(0.05, pos(p.grip, D.grip)));
      const drag = Math.min(1, pos(p.drag, D.drag));
      const inside = (x: number, y: number): boolean => {
        const dx = x - cx;
        const dy = y - cy;
        const u = (dx * c + dy * s) / hx;
        const v = (-dx * s + dy * c) / hy;
        const u2 = u * u;
        const v2 = v * v;
        return u2 * u2 + v2 * v2 <= 1;
      };
      out.push({
        feature: { pieceId: piece.id, kind: "mud", bounds: rectBounds(cx, cy, c, s, hx, hy), maxHeight: 0, surface: { mu: grip, crr: drag } },
        h: null,
        inside,
        label: "mud",
      });
      return;
    }
    case "bumps": {
      const D = TERRAIN_DEFAULTS.bumps;
      const hx = pos(p.length, D.length, 0.02) / 2;
      const hy = pos(p.width, D.width, 0.02) / 2;
      const A = Math.abs(typeof p.amplitude === "number" && isFinite(p.amplitude) ? p.amplitude : D.amplitude) || 1e-6;
      const count = Math.round(Math.min(80, Math.max(3, pos(p.count, 4 * hx * hy * 40))));
      const fade = Math.min(0.06, hx / 2, hy / 2);
      const rnd = mulberry32(seed);
      const bx: number[] = [];
      const by: number[] = [];
      const bs: number[] = [];
      const ba: number[] = [];
      for (let k = 0; k < count; k++) {
        bx.push((rnd() * 2 - 1) * Math.max(0, hx - 0.03));
        by.push((rnd() * 2 - 1) * Math.max(0, hy - 0.03));
        bs.push(0.03 + 0.05 * rnd());
        const dip = rnd() < 0.3;
        ba.push(A * (0.5 + 0.5 * rnd()) * (dip ? -0.7 : 1));
      }
      const inv2s2 = bs.map((sg) => 1 / (2 * sg * sg));
      const cut2 = bs.map((sg) => 9 * sg * sg);
      const h = (x: number, y: number): number => {
        const dx = x - cx;
        const dy = y - cy;
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        const mx = hx - Math.abs(lx);
        const my = hy - Math.abs(ly);
        if (mx <= 0 || my <= 0) return 0;
        let sum = 0;
        for (let k = 0; k < count; k++) {
          const ex = lx - bx[k];
          const ey = ly - by[k];
          const d2 = ex * ex + ey * ey;
          if (d2 < cut2[k]) sum += ba[k] * Math.exp(-d2 * inv2s2[k]);
        }
        return A * Math.tanh(sum / A) * smooth(Math.min(mx, my) / fade);
      };
      let maxH = 0;
      const step = 0.01;
      for (let lx = -hx; lx <= hx; lx += step)
        for (let ly = -hy; ly <= hy; ly += step) {
          const w = toWorld(lx, ly);
          maxH = Math.max(maxH, h(w.x, w.y));
        }
      out.push({ feature: { pieceId: piece.id, kind: "bumps", bounds: rectBounds(cx, cy, c, s, hx, hy), maxHeight: maxH }, h, label: "bumps" });
      return;
    }
    case "zigzag": {
      const D = TERRAIN_DEFAULTS.zigzag;
      const L = pos(p.length, D.length, 0.05);
      const pw = pos(p.width, D.width, 0.02);
      const n = Math.max(1, Math.min(40, Math.round(pos(p.segments, D.segments, 1))));
      const ang = Math.min((70 * Math.PI) / 180, Math.abs(typeof p.angle === "number" && isFinite(p.angle) ? p.angle : D.angle));
      let H = pos(p.height, D.height);
      let Hmin = pos(p.minHeight, D.minHeight);
      if (Hmin > H) [H, Hmin] = [Hmin, H];
      const edge = pos(p.edge, D.edge, 0.002);
      const run = L / n;
      const amp = run * Math.tan(ang);
      // legs in the local frame
      const vx: number[] = [];
      const vy: number[] = [];
      for (let k = 0; k <= n; k++) {
        vx.push(-L / 2 + k * run);
        vy.push((k % 2 === 0 ? -1 : 1) * (amp / 2));
      }
      const legLen = Math.hypot(run, amp);
      const half = pw / 2;
      const reach = half + edge;
      /** top height at leg coordinate u ∈ [0, n] (integer = corner) */
      const top = (u: number): number => {
        const m = u % 2;
        const tri = m <= 1 ? m : 2 - m; // 0 at even corners, 1 at odd corners
        return Hmin + (H - Hmin) * smooth((tri - 0.2) / 0.6);
      };
      const h = (x: number, y: number): number => {
        const dx = x - cx;
        const dy = y - cy;
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        if (Math.abs(lx) > L / 2 + reach || Math.abs(ly) > amp / 2 + reach) return 0;
        let best = 0;
        for (let k = 0; k < n; k++) {
          const ax = vx[k];
          const ay = vy[k];
          const sx = vx[k + 1] - ax;
          const sy = vy[k + 1] - ay;
          let t = ((lx - ax) * sx + (ly - ay) * sy) / (legLen * legLen);
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = lx - (ax + sx * t);
          const ey = ly - (ay + sy * t);
          const d = Math.sqrt(ex * ex + ey * ey);
          if (d >= reach) continue;
          const f = d <= half ? 1 : 1 - (d - half) / edge;
          const v = top(k + t) * f;
          if (v > best) best = v;
        }
        return best;
      };
      out.push({
        feature: { pieceId: piece.id, kind: "zigzag", bounds: rectBounds(cx, cy, c, s, L / 2 + reach, amp / 2 + reach), maxHeight: H },
        h,
        label: "zigzag",
      });
      return;
    }
    case "hill": {
      const D = TERRAIN_DEFAULTS.hill;
      const L = pos(p.length, D.length, 0.02);
      const hy = pos(p.width, D.width, 0.01) / 2;
      const slope = (Math.min(80, Math.max(1, pos(p.slopeDeg, D.slopeDeg))) * Math.PI) / 180;
      let H = pos(p.height, D.height, 0.001);
      let run = H / Math.tan(slope);
      if (2 * run > L) {
        run = L / 2;
        H = run * Math.tan(slope);
      }
      const hx = Math.max(0, L / 2 - run);
      out.push(makeMesa(piece.id, "hill", "slope", cx, cy, rot, hx, hy, run, pos(p.edge, D.edge, 0.002), H, false));
      return;
    }
    case "block": {
      const D = TERRAIN_DEFAULTS.block;
      const e = pos(p.edge, D.edge, 0.002);
      const d = pos(p.depth ?? p.length, D.depth, 0.004);
      const w = pos(p.width, D.width, 0.004);
      out.push(makeMesa(piece.id, "block", "block", cx, cy, rot, d / 2, w / 2, e, e, pos(p.height, D.height, 0.001), true));
      return;
    }
    case "hurdles": {
      const D = TERRAIN_DEFAULTS.hurdles;
      const n = Math.max(1, Math.min(50, Math.round(pos(p.count, D.count, 1))));
      const e = pos(p.edge, D.edge, 0.002);
      const d = pos(p.depth ?? p.length, D.depth, 0.004);
      const w = pos(p.width, D.width, 0.004);
      const gap = pos(p.spacing, D.spacing);
      const H = pos(p.height, D.height, 0.001);
      const pitch = d + gap;
      for (let k = 0; k < n; k++) {
        const q = toWorld((k - (n - 1) / 2) * pitch, 0);
        out.push(makeMesa(piece.id, "block", "block", q.x, q.y, rot, d / 2, w / 2, e, e, H, true));
      }
      return;
    }
    case "platform": {
      const D = TERRAIN_DEFAULTS.platform;
      const e = pos(p.edge, D.edge, 0.002);
      const L = pos(p.length, D.length, 0.01);
      const w = pos(p.width, D.width, 0.01);
      out.push(makeMesa(piece.id, "platform", "platform", cx, cy, rot, L / 2, w / 2, e, e, pos(p.height, D.height, 0.001), true));
      return;
    }
    default:
      return;
  }
}

// ───────────────────────────── spatial index + sampler ─────────────────────────────

const CELL = 0.1;

class BucketGrid {
  private minX = 0;
  private minY = 0;
  private nx = 0;
  private ny = 0;
  private cells: number[][] = [];
  readonly empty: boolean;

  constructor(bounds: Bounds[], ids: number[]) {
    this.empty = ids.length === 0;
    if (this.empty) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const i of ids) {
      const b = bounds[i];
      x0 = Math.min(x0, b.minX);
      y0 = Math.min(y0, b.minY);
      x1 = Math.max(x1, b.maxX);
      y1 = Math.max(y1, b.maxY);
    }
    this.minX = x0;
    this.minY = y0;
    this.nx = Math.max(1, Math.min(1000, Math.ceil((x1 - x0) / CELL) + 1));
    this.ny = Math.max(1, Math.min(1000, Math.ceil((y1 - y0) / CELL) + 1));
    this.cells = Array.from({ length: this.nx * this.ny }, () => []);
    for (const i of ids) {
      const b = bounds[i];
      const [i0, j0] = this.cellOf(b.minX, b.minY);
      const [i1, j1] = this.cellOf(b.maxX, b.maxY);
      for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) this.cells[j * this.nx + k].push(i);
    }
  }

  private cellOf(x: number, y: number): [number, number] {
    const i = Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.minX) / CELL)));
    const j = Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.minY) / CELL)));
    return [i, j];
  }

  /** Candidate feature ids at a point (may be empty). */
  at(x: number, y: number): number[] | null {
    if (this.empty) return null;
    const i = Math.floor((x - this.minX) / CELL);
    const j = Math.floor((y - this.minY) / CELL);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) return null;
    return this.cells[j * this.nx + i];
  }

  /** true if any feature may touch the square of half-size r around (x, y) */
  any(x: number, y: number, r: number): boolean {
    if (this.empty) return false;
    const i0 = Math.floor((x - r - this.minX) / CELL);
    const j0 = Math.floor((y - r - this.minY) / CELL);
    const i1 = Math.floor((x + r - this.minX) / CELL);
    const j1 = Math.floor((y + r - this.minY) / CELL);
    for (let j = Math.max(0, j0); j <= Math.min(this.ny - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) if (this.cells[j * this.nx + i].length) return true;
    return false;
  }
}

/**
 * Fast spatial sampler over any TerrainModel (uses only the public contract: features + featureHeight).
 * `skip[i] = 1` removes feature i from the height map (features that are solid for a given robot).
 */
export class TerrainSampler {
  private readonly heightGrid: BucketGrid;
  private readonly mudGrid: BucketGrid;
  private readonly feats: TerrainFeature[];

  constructor(readonly model: TerrainModel) {
    this.feats = model.features;
    const bounds = this.feats.map((f) => f.bounds);
    const hIds: number[] = [];
    const mIds: number[] = [];
    this.feats.forEach((f, i) => (f.kind === "mud" ? mIds : hIds).push(i));
    this.heightGrid = new BucketGrid(bounds, hIds);
    this.mudGrid = new BucketGrid(bounds, mIds);
  }

  get hasMud(): boolean {
    return !this.mudGrid.empty;
  }

  height(x: number, y: number, skip?: Uint8Array | null): number {
    const cell = this.heightGrid.at(x, y);
    if (!cell || cell.length === 0) return 0;
    let hi = 0;
    let lo = 0;
    for (let k = 0; k < cell.length; k++) {
      const i = cell[k];
      if (skip && skip[i]) continue;
      const b = this.feats[i].bounds;
      if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
      const h = this.model.featureHeight(i, x, y);
      if (h > hi) hi = h;
      else if (h < lo) lo = h;
    }
    return hi + lo;
  }

  /** Index of the highest feature at a point (|h| > 0.5 mm), or −1. */
  topFeature(x: number, y: number): number {
    const cell = this.heightGrid.at(x, y);
    if (!cell) return -1;
    let best = -1;
    let bestH = 0.0005;
    let dip = -1;
    for (const i of cell) {
      const b = this.feats[i].bounds;
      if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
      const h = this.model.featureHeight(i, x, y);
      if (h > bestH) {
        bestH = h;
        best = i;
      } else if (h < -0.0005) dip = i;
    }
    return best >= 0 ? best : dip;
  }

  /** Mud candidates at a point. */
  mudAt(x: number, y: number): number[] | null {
    return this.mudGrid.at(x, y);
  }

  /** true if any feature (height or mud) may lie within the square of half-size r around (x, y). */
  near(x: number, y: number, r: number): boolean {
    return this.heightGrid.any(x, y, r) || this.mudGrid.any(x, y, r);
  }
}

// ───────────────────────────── model ─────────────────────────────

export const FLAT_TERRAIN: TerrainModel = {
  active: false,
  features: [],
  height: () => 0,
  featureHeight: () => 0,
  surface: () => ({ kind: "ground", mu: 1, crr: 0 }),
};

const GROUND = { kind: "ground" as TerrainSurfaceKind, mu: 1, crr: 0 };

/** Compile all terrain pieces of a track. Returns FLAT_TERRAIN (inactive) when there are none. */
export function buildTerrain(def: TrackDef): TerrainModel {
  const impls: FeatureImpl[] = [];
  for (const piece of def.pieces ?? []) if (isTerrainPiece(piece.type)) buildPiece(piece, impls);
  if (impls.length === 0) return FLAT_TERRAIN;
  const features = impls.map((f) => f.feature);
  const fns = impls.map((f) => f.h);
  const ref: { sampler: TerrainSampler | null } = { sampler: null };
  const model: TerrainModel = {
    active: true,
    features,
    featureHeight(index: number, x: number, y: number): number {
      const fn = fns[index];
      if (!fn) return 0;
      const b = features[index].bounds;
      if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return 0;
      return fn(x, y);
    },
    height(x: number, y: number): number {
      return ref.sampler!.height(x, y);
    },
    surface(x: number, y: number) {
      const sampler = ref.sampler!;
      const muds = sampler.mudAt(x, y);
      if (muds && muds.length) {
        let mu = Infinity;
        let crr = 0;
        for (const i of muds) {
          const f = impls[i];
          const b = f.feature.bounds;
          if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
          if (!f.inside!(x, y)) continue;
          mu = Math.min(mu, f.feature.surface!.mu);
          crr = Math.max(crr, f.feature.surface!.crr);
        }
        if (mu !== Infinity) return { kind: "mud" as TerrainSurfaceKind, mu, crr };
      }
      const top = sampler.topFeature(x, y);
      return top >= 0 ? { kind: impls[top].label, mu: 1, crr: 0 } : GROUND;
    },
  };
  ref.sampler = new TerrainSampler(model);
  return model;
}
