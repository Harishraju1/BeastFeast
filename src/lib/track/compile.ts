/**
 * Track compiler: TrackDef (editor pieces) → CompiledTrack (world geometry for physics/sensors/render).
 *
 * Piece-local frame: origin at the piece entry, path leaves along +x, +y is left. Each piece is
 * transformed by its (x, y, rotation). Curves are sampled every ≤ 1 cm.
 *
 *  straight / line-straight : length L (default 0.5 m) along +x
 *  curve / line-curve       : arc radius R (default 0.5) sweeping `angle` (default +π/2, + = left)
 *  s-curve                  : arc(+angle) followed by arc(−angle) (default R 0.5, angle π/4) – exits
 *                             parallel to the entry, offset sideways
 *  sharp-turn / line-sharp  : two legs of `length` (default 0.3) meeting at a sharp vertex, turning by
 *                             `angle` (default π/2)
 *  loop                     : full circle of radius R (default 0.3) tangent to +x at the origin, centre
 *                             on the left; entry pose = exit pose
 *  intersection             : main line (0,0)→(L,0) plus a perpendicular cross line through its middle,
 *                             (L/2,−L/2)→(L/2,L/2) – a "+" crossing (default L 0.4)
 *  branch                   : main line (0,0)→(L,0) (default L 0.8) plus a side spur leaving at 0.25L
 *                             at 35° to the left, peaking and rejoining the main line at 0.75L
 *  line-free                : params.points (piece-local polyline)
 *
 * Road-type pieces (straight, curve, s-curve, sharp-turn) produce `roads` (width = params.width,
 * default 0.3 m) on race tracks and `lines` on line tracks. Line-type pieces always produce `lines`
 * (lineWidth default 0.019 m – standard 19 mm electrical tape).
 * obstacle → box (width × depth, default 0.1 × 0.1) or cylinder (diameter = width).
 * checkpoint / start / finish → segment across the local y axis at the origin, width default 0.4.
 * ramp → rectangle length × width (default 0.5 × 0.3) with slopeDeg (default 10°), uphill = local +x.
 * Walls = the 4 edges of the floor (centred at the origin), bounds from size, arena copied.
 *
 * Off-road terrain pieces (rock, rock-field, mud, bumps, zigzag, hill, block, hurdles, platform) are
 * compiled by terrain.ts (buildTerrain) into `terrain.features` – a height map, mud surfaces and
 * per-robot solid outlines. They are deliberately NOT added to `obstacles`: whether a rock or block is
 * solid depends on the robot (ground clearance, wheel size), so the world decides per robot. Tracks
 * without terrain pieces get an inactive terrain and behave exactly as before.
 */
import type { CompiledTrack, Obstacle, Pose, Segment, TrackDef, TrackPiece, TrackPieceType, Vec2 } from "../sim/types";
import { arcPoints } from "../sim/geom";
import { buildTerrain } from "./terrain";

export const DEFAULT_ROAD_WIDTH = 0.3;
export const DEFAULT_LINE_WIDTH = 0.019;
export const DEFAULT_GATE_WIDTH = 0.4;

const ROAD_TYPES: TrackPieceType[] = ["straight", "curve", "s-curve", "sharp-turn"];
const LINE_TYPES: TrackPieceType[] = ["line-straight", "line-curve", "line-sharp", "intersection", "loop", "branch", "line-free"];

export const isRoadPiece = (t: TrackPieceType): boolean => ROAD_TYPES.includes(t);
export const isLinePiece = (t: TrackPieceType): boolean => LINE_TYPES.includes(t);
export const isPathPiece = (t: TrackPieceType): boolean => isRoadPiece(t) || isLinePiece(t);

function applyPose(pose: Pose, p: Vec2): Vec2 {
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  return { x: pose.x + p.x * c - p.y * s, y: pose.y + p.x * s + p.y * c };
}

function composePose(a: Pose, b: Pose): Pose {
  const p = applyPose(a, b);
  return { x: p.x, y: p.y, heading: a.heading + b.heading };
}

function arcEnd(r: number, angle: number): Pose {
  const sg = angle >= 0 ? 1 : -1;
  const a = Math.abs(angle);
  return { x: r * Math.sin(a), y: sg * r * (1 - Math.cos(a)), heading: angle };
}

function arcFrom(start: Pose, r: number, angle: number): Vec2[] {
  return arcPoints(r, angle, 0.01).map((p) => applyPose(start, p));
}

/** Local exit pose of a path piece (relative to its origin), or null for non-path pieces. */
export function pieceLocalEnd(piece: TrackPiece): Pose | null {
  const p = piece.params;
  switch (piece.type) {
    case "straight":
    case "line-straight":
      return { x: p.length ?? 0.5, y: 0, heading: 0 };
    case "curve":
    case "line-curve":
      return arcEnd(p.radius ?? 0.5, p.angle ?? Math.PI / 2);
    case "s-curve": {
      const r = p.radius ?? 0.5;
      const a = p.angle ?? Math.PI / 4;
      return composePose(arcEnd(r, a), arcEnd(r, -a));
    }
    case "sharp-turn":
    case "line-sharp": {
      const L = p.length ?? 0.3;
      const a = p.angle ?? Math.PI / 2;
      return { x: L + L * Math.cos(a), y: L * Math.sin(a), heading: a };
    }
    case "loop":
      return { x: 0, y: 0, heading: 0 };
    case "intersection":
      return { x: p.length ?? 0.4, y: 0, heading: 0 };
    case "branch":
      return { x: p.length ?? 0.8, y: 0, heading: 0 };
    case "line-free": {
      const pts = p.points ?? [];
      if (pts.length < 2) return null;
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      return { x: b.x, y: b.y, heading: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    default:
      return null;
  }
}

/** All centre-line polylines of a piece in its local frame (first = main path). */
export function pieceLocalPolylines(piece: TrackPiece): Vec2[][] {
  const p = piece.params;
  const O: Pose = { x: 0, y: 0, heading: 0 };
  switch (piece.type) {
    case "straight":
    case "line-straight": {
      const L = p.length ?? 0.5;
      return [[{ x: 0, y: 0 }, { x: L, y: 0 }]];
    }
    case "curve":
    case "line-curve":
      return [arcFrom(O, p.radius ?? 0.5, p.angle ?? Math.PI / 2)];
    case "s-curve": {
      const r = p.radius ?? 0.5;
      const a = p.angle ?? Math.PI / 4;
      const first = arcFrom(O, r, a);
      const second = arcFrom(arcEnd(r, a), r, -a);
      return [[...first, ...second.slice(1)]];
    }
    case "sharp-turn":
    case "line-sharp": {
      const L = p.length ?? 0.3;
      const a = p.angle ?? Math.PI / 2;
      return [
        [
          { x: 0, y: 0 },
          { x: L, y: 0 },
          { x: L + L * Math.cos(a), y: L * Math.sin(a) },
        ],
      ];
    }
    case "loop":
      return [arcFrom(O, p.radius ?? 0.3, 2 * Math.PI)];
    case "intersection": {
      const L = p.length ?? 0.4;
      return [
        [
          { x: 0, y: 0 },
          { x: L, y: 0 },
        ],
        [
          { x: L / 2, y: -L / 2 },
          { x: L / 2, y: L / 2 },
        ],
      ];
    }
    case "branch": {
      const L = p.length ?? 0.8;
      const h = 0.25 * L * Math.tan((35 * Math.PI) / 180);
      return [
        [
          { x: 0, y: 0 },
          { x: L, y: 0 },
        ],
        [
          { x: 0.25 * L, y: 0 },
          { x: 0.5 * L, y: h },
          { x: 0.75 * L, y: 0 },
        ],
      ];
    }
    case "line-free":
      return (p.points ?? []).length >= 2 ? [(p.points ?? []).map((q) => ({ x: q.x, y: q.y }))] : [];
    default:
      return [];
  }
}

/** Main centre-line polyline of a path piece, piece-local. */
export function pieceLocalPolyline(piece: TrackPiece): Vec2[] {
  return pieceLocalPolylines(piece)[0] ?? [];
}

export function piecePose(piece: TrackPiece): Pose {
  return { x: piece.x, y: piece.y, heading: piece.rotation };
}

/** World polylines of a piece. */
export function pieceWorldPolylines(piece: TrackPiece): Vec2[][] {
  const pose = piecePose(piece);
  return pieceLocalPolylines(piece).map((pl) => pl.map((q) => applyPose(pose, q)));
}

/** World entry/exit poses of a road/line piece (for snapping in the editor), or null. */
export function pieceEndpoints(piece: TrackPiece): { start: Pose; end: Pose } | null {
  const local = pieceLocalEnd(piece);
  if (!local) return null;
  const start = piecePose(piece);
  return { start, end: composePose(start, local) };
}

function gate(piece: TrackPiece): Segment {
  const w = piece.params.width ?? DEFAULT_GATE_WIDTH;
  const pose = piecePose(piece);
  return { a: applyPose(pose, { x: 0, y: -w / 2 }), b: applyPose(pose, { x: 0, y: w / 2 }) };
}

export function compileTrack(def: TrackDef): CompiledTrack {
  const roads: CompiledTrack["roads"] = [];
  const lines: CompiledTrack["lines"] = [];
  const obstacles: Obstacle[] = [];
  const checkpoints: CompiledTrack["checkpoints"] = [];
  const ramps: CompiledTrack["ramps"] = [];
  let startLine: Segment | null = null;
  let finishLine: Segment | null = null;
  let cpIndex = 0;

  for (const piece of def.pieces) {
    const t = piece.type;
    if (isRoadPiece(t) && def.kind !== "line") {
      for (const pl of pieceWorldPolylines(piece)) roads.push({ points: pl, width: piece.params.width ?? DEFAULT_ROAD_WIDTH });
    } else if (isPathPiece(t)) {
      for (const pl of pieceWorldPolylines(piece)) lines.push({ points: pl, width: piece.params.lineWidth ?? DEFAULT_LINE_WIDTH });
    } else if (t === "obstacle") {
      const p = piece.params;
      if (p.shape === "cylinder") {
        obstacles.push({ kind: "circle", cx: piece.x, cy: piece.y, r: (p.width ?? 0.1) / 2 });
      } else {
        obstacles.push({ kind: "box", cx: piece.x, cy: piece.y, w: p.width ?? 0.1, h: p.depth ?? 0.1, rotation: piece.rotation });
      }
    } else if (t === "checkpoint") {
      checkpoints.push({ index: cpIndex++, seg: gate(piece) });
    } else if (t === "start") {
      startLine = gate(piece);
    } else if (t === "finish") {
      finishLine = gate(piece);
    } else if (t === "ramp") {
      const L = piece.params.length ?? 0.5;
      const w = piece.params.width ?? 0.3;
      const pose = piecePose(piece);
      ramps.push({
        polygon: [
          { x: 0, y: -w / 2 },
          { x: L, y: -w / 2 },
          { x: L, y: w / 2 },
          { x: 0, y: w / 2 },
        ].map((q) => applyPose(pose, q)),
        slopeDeg: piece.params.slopeDeg ?? 10,
        uphill: { x: Math.cos(piece.rotation), y: Math.sin(piece.rotation) },
      });
    }
  }

  const hw = def.size.w / 2;
  const hh = def.size.h / 2;
  const c = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  const walls: Segment[] = c.map((a, i) => ({ a, b: c[(i + 1) % 4] }));

  return {
    def,
    roads,
    lines,
    obstacles,
    walls,
    checkpoints,
    startLine,
    finishLine,
    ramps,
    terrain: buildTerrain(def),
    arena: def.arena ?? null,
    bounds: { minX: -hw, minY: -hh, maxX: hw, maxY: hh },
  };
}
