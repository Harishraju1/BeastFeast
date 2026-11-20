/**
 * Off-road terrain generator for the Track Designer: places terrain pieces along a race track's road
 * using the student's settings. Deterministic (seeded), so the same settings give the same track.
 * Generated pieces are tagged (`gen:` id prefix) so they can be removed or regenerated without touching
 * hand-placed pieces.
 */
import type { TrackDef, TrackPiece, Vec2 } from "@/lib/sim/types";
import { compileTrack } from "./compile";

export interface TerrainGenSettings {
  /** 0 = easy … 1 = hard: scales heights and how much of the road is covered */
  difficulty: number;
  /** rocks per metre of road (0–6) */
  rockDensity: number;
  /** fraction of the road length covered by mud (0–0.6) */
  mudCoverage: number;
  /** number of hurdle rows (0–6) */
  hurdles: number;
  /** zigzag raised path height (m); 0 = none */
  zigzagHeight: number;
  /** hill slope (degrees); 0 = none */
  slopeDeg: number;
  seed: number;
}

export const DEFAULT_GEN: TerrainGenSettings = { difficulty: 0.4, rockDensity: 2, mudCoverage: 0.15, hurdles: 2, zigzagHeight: 0.04, slopeDeg: 10, seed: 1 };

export const GEN_PREFIX = "gen_";

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

interface Station {
  p: Vec2;
  heading: number;
  width: number;
}

/** Points every `step` metres along all road centre-lines, with the local heading and road width. */
function stations(def: TrackDef, step: number): { list: Station[]; length: number } {
  const c = compileTrack(def);
  const list: Station[] = [];
  let length = 0;
  for (const road of c.roads) {
    let carry = 0;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (seg < 1e-6) continue;
      const heading = Math.atan2(b.y - a.y, b.x - a.x);
      let d = step - carry;
      while (d <= seg) {
        const t = d / seg;
        list.push({ p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, heading, width: road.width });
        d += step;
      }
      carry = seg - (d - step);
      length += seg;
    }
  }
  return { list, length };
}

/** Remove previously generated terrain and add new terrain along the road. */
export function generateTerrain(def: TrackDef, s: TerrainGenSettings): TrackDef {
  const base: TrackDef = { ...def, pieces: def.pieces.filter((p) => !p.id.startsWith(GEN_PREFIX)) };
  if (base.kind !== "race") return base;
  const { list, length } = stations(base, 0.05);
  if (list.length < 10) return base;
  // keep the first and last 0.5 m clear (start/finish areas)
  const usable = list.slice(10, Math.max(10, list.length - 10));
  if (!usable.length) return base;
  const r = rng(s.seed);
  const d = Math.min(1, Math.max(0, s.difficulty));
  const out: TrackPiece[] = [];
  let n = 0;
  const id = (kind: string) => `${GEN_PREFIX}${kind}_${n++}`;
  const at = (frac: number) => usable[Math.min(usable.length - 1, Math.max(0, Math.floor(frac * usable.length)))];
  // reserve slots along the road so big features don't overlap
  const taken: number[] = [];
  const free = (frac: number, span: number) => taken.every((t) => Math.abs(t - frac) > span);

  // hill and zigzag: one each, placed on the road
  if (s.slopeDeg > 0) {
    const f = 0.3 + r() * 0.1;
    taken.push(f);
    const st = at(f);
    const height = 0.03 + 0.05 * d;
    out.push({ id: id("hill"), type: "hill", x: st.p.x, y: st.p.y, rotation: st.heading, params: { length: Math.max(0.5, (2 * height) / Math.tan((s.slopeDeg * Math.PI) / 180) + 0.25), width: st.width + 0.1, height, slopeDeg: s.slopeDeg } });
  }
  if (s.zigzagHeight > 0) {
    const f = 0.65 + r() * 0.1;
    if (free(f, 0.12)) {
      taken.push(f);
      const st = at(f);
      out.push({ id: id("zigzag"), type: "zigzag", x: st.p.x, y: st.p.y, rotation: st.heading, params: { length: 1.0, width: Math.max(0.2, st.width * 0.8), height: s.zigzagHeight, minHeight: s.zigzagHeight * 0.3, segments: 4, angle: Math.PI / 7 } });
    }
  }
  // mud patches covering the requested fraction of the road
  const mudLen = Math.min(0.6, Math.max(0, s.mudCoverage)) * length;
  for (let covered = 0, tries = 0; covered < mudLen && tries < 40; tries++) {
    const f = r();
    if (!free(f, 0.06)) continue;
    taken.push(f);
    const st = at(f);
    const len = Math.min(mudLen - covered, 0.3 + r() * 0.4);
    covered += len;
    out.push({ id: id("mud"), type: "mud", x: st.p.x, y: st.p.y, rotation: st.heading, params: { length: len, width: st.width * (0.8 + r() * 0.4), grip: 0.55 - 0.25 * d, drag: 0.08 + 0.1 * d } });
  }
  // hurdle rows across the road
  for (let h = 0, tries = 0; h < Math.min(6, s.hurdles) && tries < 40; tries++) {
    const f = r();
    if (!free(f, 0.05)) continue;
    taken.push(f);
    h++;
    const st = at(f);
    out.push({ id: id("hurdles"), type: "hurdles", x: st.p.x, y: st.p.y, rotation: st.heading, params: { width: st.width, depth: 0.025, height: 0.006 + 0.012 * d, count: 2 + Math.round(2 * d), spacing: 0.14 } });
  }
  // rocks scattered on and beside the road
  const rocks = Math.round(Math.max(0, s.rockDensity) * length);
  for (let k = 0; k < rocks; k++) {
    const st = at(r());
    const side = (r() - 0.5) * (st.width + 0.25);
    const nx = -Math.sin(st.heading),
      ny = Math.cos(st.heading);
    const big = r() < 0.2 + 0.3 * d;
    out.push({ id: id("rock"), type: "rock", x: st.p.x + nx * side, y: st.p.y + ny * side, rotation: r() * Math.PI, params: { width: big ? 0.09 : 0.05, depth: big ? 0.07 : 0.04, height: big ? 0.035 + 0.04 * d : 0.008 + 0.01 * d, seed: Math.floor(r() * 10000) } });
  }
  return { ...base, pieces: [...base.pieces, ...out] };
}

export function removeGeneratedTerrain(def: TrackDef): TrackDef {
  return { ...def, pieces: def.pieces.filter((p) => !p.id.startsWith(GEN_PREFIX)) };
}
