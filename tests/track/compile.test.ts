import { describe, expect, it } from "vitest";
import { compileTrack, pieceEndpoints, pieceLocalPolyline, pieceLocalPolylines } from "@/lib/track/compile";
import { EXAMPLE_TRACKS, sumoOpponentPose } from "@/lib/track/examples";
import { closestOnSegment, dist, polylineLength } from "@/lib/sim/geom";
import type { TrackPiece, Vec2 } from "@/lib/sim/types";

const piece = (type: TrackPiece["type"], params: TrackPiece["params"] = {}, x = 0, y = 0, rotation = 0): TrackPiece => ({ id: "t", type, x, y, rotation, params });

function nearestOnPolys(p: Vec2, polys: Vec2[][], skip = -1): { d: number; tangent: Vec2 } {
  let best = Infinity;
  let tangent = { x: 1, y: 0 };
  polys.forEach((pl, k) => {
    if (k === skip) return;
    for (let i = 1; i < pl.length; i++) {
      const r = closestOnSegment(p.x, p.y, pl[i - 1].x, pl[i - 1].y, pl[i].x, pl[i].y);
      const d = Math.sqrt(r.d2);
      if (d < best) {
        best = d;
        const l = dist(pl[i - 1], pl[i]) || 1;
        tangent = { x: (pl[i].x - pl[i - 1].x) / l, y: (pl[i].y - pl[i - 1].y) / l };
      }
    }
  });
  return { d: best, tangent };
}

describe("piece geometry", () => {
  it("straight", () => {
    expect(pieceLocalPolyline(piece("straight", { length: 0.7 }))).toEqual([
      { x: 0, y: 0 },
      { x: 0.7, y: 0 },
    ]);
  });
  it("curve: arc sampled ≤ 1 cm, analytic end pose", () => {
    const p = piece("curve", { radius: 0.5, angle: Math.PI / 2 }, 1, 2, Math.PI / 2);
    const pl = pieceLocalPolyline(p);
    for (let i = 1; i < pl.length; i++) expect(dist(pl[i - 1], pl[i])).toBeLessThanOrEqual(0.01 + 1e-12);
    expect(polylineLength(pl)).toBeCloseTo((0.5 * Math.PI) / 2, 3);
    const ep = pieceEndpoints(p)!;
    // local end (0.5, 0.5) rotated by 90° → (-0.5, 0.5) + (1, 2)
    expect(ep.end.x).toBeCloseTo(0.5, 9);
    expect(ep.end.y).toBeCloseTo(2.5, 9);
    expect(ep.end.heading).toBeCloseTo(Math.PI, 9);
    expect(ep.start).toEqual({ x: 1, y: 2, heading: Math.PI / 2 });
  });
  it("right-hand curve goes to -y", () => {
    const pl = pieceLocalPolyline(piece("line-curve", { radius: 0.3, angle: -Math.PI / 2 }));
    expect(pl[pl.length - 1].x).toBeCloseTo(0.3, 9);
    expect(pl[pl.length - 1].y).toBeCloseTo(-0.3, 9);
  });
  it("s-curve exits parallel, offset left", () => {
    const ep = pieceEndpoints(piece("s-curve", { radius: 0.4, angle: Math.PI / 4 }))!;
    expect(ep.end.heading).toBeCloseTo(0, 9);
    expect(ep.end.y).toBeCloseTo(2 * 0.4 * (1 - Math.cos(Math.PI / 4)), 9);
    const pl = pieceLocalPolyline(piece("s-curve", { radius: 0.4, angle: Math.PI / 4 }));
    expect(pl[pl.length - 1].x).toBeCloseTo(ep.end.x, 9);
  });
  it("sharp turn, loop, intersection, branch, free", () => {
    const sh = pieceLocalPolyline(piece("line-sharp", { length: 0.2 }));
    expect(sh[2].x).toBeCloseTo(0.2, 9);
    expect(sh[2].y).toBeCloseTo(0.2, 9);
    const loop = pieceLocalPolyline(piece("loop", { radius: 0.25 }));
    expect(dist(loop[0], loop[loop.length - 1])).toBeLessThan(1e-9);
    expect(polylineLength(loop)).toBeCloseTo(2 * Math.PI * 0.25, 3);
    const inter = pieceLocalPolylines(piece("intersection", { length: 0.4 }));
    expect(inter).toHaveLength(2);
    expect(inter[1][0]).toEqual({ x: 0.2, y: -0.2 });
    const br = pieceLocalPolylines(piece("branch", { length: 0.8 }));
    expect(br[1][0].y).toBe(0);
    expect(br[1][2].y).toBe(0);
    expect(br[1][1].y).toBeGreaterThan(0.1);
    const free = pieceLocalPolyline(piece("line-free", { points: [{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }] }));
    expect(free).toHaveLength(2);
    expect(pieceEndpoints(piece("obstacle"))).toBeNull();
  });
  it("compiles markers, obstacles, ramps, walls", () => {
    const t = compileTrack({
      id: "x",
      name: "x",
      kind: "race",
      difficulty: "beginner",
      ownerId: null,
      size: { w: 2, h: 1 },
      surface: { color: "#fff", mu: 1, lineColor: "#000" },
      pieces: [
        piece("straight", { length: 1 }),
        piece("checkpoint", {}, 0.5, 0),
        piece("checkpoint", { width: 0.2 }, 0.7, 0),
        piece("start", {}, 0.1, 0),
        piece("finish", {}, 0.9, 0),
        piece("obstacle", { width: 0.1, depth: 0.2 }, 0.3, 0.3, 0.5),
        piece("obstacle", { width: 0.1, shape: "cylinder" }, 0.3, -0.3),
        piece("ramp", { slopeDeg: 12 }, -0.5, 0, Math.PI),
      ],
      start: { x: 0, y: 0, heading: 0 },
    });
    expect(t.roads).toHaveLength(1);
    expect(t.roads[0].width).toBe(0.3);
    expect(t.lines).toHaveLength(0);
    expect(t.checkpoints.map((c) => c.index)).toEqual([0, 1]);
    expect(dist(t.checkpoints[1].seg.a, t.checkpoints[1].seg.b)).toBeCloseTo(0.2, 9);
    expect(t.startLine!.a.x).toBeCloseTo(0.1, 9);
    expect(t.finishLine!.a.x).toBeCloseTo(0.9, 9);
    expect(t.obstacles[0]).toEqual({ kind: "box", cx: 0.3, cy: 0.3, w: 0.1, h: 0.2, rotation: 0.5 });
    expect(t.obstacles[1]).toEqual({ kind: "circle", cx: 0.3, cy: -0.3, r: 0.05 });
    expect(t.ramps[0].uphill.x).toBeCloseTo(-1, 9);
    expect(t.ramps[0].slopeDeg).toBe(12);
    expect(t.walls).toHaveLength(4);
    expect(t.bounds).toEqual({ minX: -1, minY: -0.5, maxX: 1, maxY: 0.5 });
  });
});

describe("example tracks", () => {
  it("has the required set", () => {
    const keys = EXAMPLE_TRACKS.map((t) => `${t.kind}:${t.difficulty}`);
    for (const k of ["race:beginner", "race:intermediate", "race:advanced", "line:beginner", "line:intermediate", "line:advanced", "line:beast"]) expect(keys).toContain(k);
    expect(EXAMPLE_TRACKS.filter((t) => t.kind === "sumo").map((t) => t.arena?.shape).sort()).toEqual(["circle", "rect"]);
    expect(EXAMPLE_TRACKS.every((t) => t.ownerId === null)).toBe(true);
    expect(new Set(EXAMPLE_TRACKS.map((t) => t.id)).size).toBe(EXAMPLE_TRACKS.length);
  });

  it("standard dohyo is 77 cm with 2.5 cm border and 180 s rounds", () => {
    const s = EXAMPLE_TRACKS.find((t) => t.arena?.shape === "circle")!;
    expect(s.arena).toMatchObject({ radius: 0.385, border: 0.025, timeLimitS: 180 });
    const o = sumoOpponentPose(s);
    expect(o.x).toBeCloseTo(-s.start.x, 9);
  });

  for (const def of EXAMPLE_TRACKS) {
    it(`${def.id} compiles into a closed network with start on the path`, () => {
      const t = compileTrack(def);
      const paths = def.kind === "race" ? t.roads : def.kind === "line" ? t.lines : [];
      const polys = paths.map((p) => p.points);
      if (def.kind === "sumo") {
        expect(t.arena).toBeTruthy();
        return;
      }
      expect(polys.length).toBeGreaterThan(0);
      // every polyline end connects to another polyline (no dead ends) – i.e. closed loops
      polys.forEach((pl, k) => {
        if (dist(pl[0], pl[pl.length - 1]) < 1e-6) return; // self-closed (loop)
        for (const end of [pl[0], pl[pl.length - 1]]) expect(nearestOnPolys(end, polys, k).d).toBeLessThan(1e-3);
      });
      // all geometry inside the floor
      for (const pl of polys)
        for (const p of pl) {
          expect(Math.abs(p.x)).toBeLessThan(def.size.w / 2);
          expect(Math.abs(p.y)).toBeLessThan(def.size.h / 2);
        }
      // start pose on the centre-line and heading along it
      const n = nearestOnPolys(def.start, polys);
      expect(n.d).toBeLessThan(0.005);
      expect(Math.abs(Math.cos(def.start.heading) * n.tangent.y - Math.sin(def.start.heading) * n.tangent.x)).toBeLessThan(0.05);
      if (def.kind === "race") {
        expect(t.checkpoints.length).toBeGreaterThan(0);
        // gates are centred on the road
        for (const seg of [...t.checkpoints.map((c) => c.seg), t.startLine!]) {
          const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
          expect(nearestOnPolys(mid, polys).d).toBeLessThan(0.02);
        }
      }
    });
  }

  it("chained path pieces of the ovals join end-to-start and close", () => {
    for (const def of EXAMPLE_TRACKS.filter((d) => d.id.includes("oval") || d.id.includes("circuit") || d.id.includes("scurves") || d.id.includes("zigzag") || d.id.includes("sharp"))) {
      const path = def.pieces.filter((p) => pieceEndpoints(p));
      for (let i = 0; i < path.length; i++) {
        const a = pieceEndpoints(path[i])!.end;
        const b = pieceEndpoints(path[(i + 1) % path.length])!.start;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
        expect(Math.cos(a.heading - b.heading)).toBeCloseTo(1, 6);
      }
    }
  });
});
