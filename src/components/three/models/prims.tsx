"use client";
/**
 * Low-poly building blocks for the procedural part models.
 *
 * Models are authored in MILLIMETRES inside an <Mm> group (scale 0.001) using the part's local three.js axes:
 *   x = part length (robot x before yaw), y = up (robot z), z = across (robot −y before yaw).
 * Every material reads the selection/error highlight from EmissiveContext, so the highlight works on every
 * mesh of every model without prop drilling.
 */
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { BoxGeometry, type BufferGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, FrontSide, LatheGeometry, Shape, Vector2 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const MM = 0.001;
export type V3 = [number, number, number];
export type Axis = "x" | "y" | "z";

/** Highlight colour of the part being drawn (selected = cream, error = red), undefined = none. */
export const EmissiveContext = createContext<string | undefined>(undefined);

/** Scales millimetre-authored children to metres. */
export function Mm({ children, p, rot }: { children: ReactNode; p?: V3; rot?: V3 }) {
  return (
    <group scale={MM} position={p} rotation={rot}>
      {children}
    </group>
  );
}

export interface MatProps {
  c: string;
  metal?: number;
  rough?: number;
  opacity?: number;
  /** take part in the selection highlight (default true) */
  hl?: boolean;
  /** render both faces (lathe profiles) */
  ds?: boolean;
}

export function Mat({ c, metal = 0.1, rough = 0.6, opacity, hl = true, ds = false }: MatProps) {
  const e = useContext(EmissiveContext);
  const on = hl && !!e;
  return <meshStandardMaterial color={c} metalness={metal} roughness={rough} transparent={opacity !== undefined} opacity={opacity ?? 1} side={ds ? DoubleSide : FrontSide} emissive={on ? e : "#000000"} emissiveIntensity={on ? 0.45 : 0} />;
}

/** Box: centre p, size s (mm). */
export function B({ p, s, rot, ...mat }: { p?: V3; s: V3; rot?: V3 } & MatProps) {
  return (
    <mesh position={p} rotation={rot} castShadow>
      <boxGeometry args={s} />
      <Mat {...mat} />
    </mesh>
  );
}

export const AXIS_ROT: Record<Axis, V3> = { x: [0, 0, Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] };

/**
 * Cylinder: centre p, radius, length along `ax` (mm). `rad2` = radius at the +axis end (cones / tapers).
 * `sc` scales the result in the parent's axes (e.g. a flattened motor can).
 */
export function Cyl({ p, rad, rad2, len, ax = "y", seg = 16, rot, sc, ...mat }: { p?: V3; rad: number; rad2?: number; len: number; ax?: Axis; seg?: number; rot?: V3; sc?: V3 } & MatProps) {
  const mesh = (
    <mesh position={sc ? undefined : p} rotation={rot ?? AXIS_ROT[ax]} castShadow>
      <cylinderGeometry args={[rad2 ?? rad, rad, len, seg]} />
      <Mat {...mat} />
    </mesh>
  );
  return sc ? (
    <group position={p} scale={sc}>
      {mesh}
    </group>
  ) : (
    mesh
  );
}

/** Sphere (mm). */
export function Sph({ p, rad, seg = 12, ...mat }: { p?: V3; rad: number; seg?: number } & MatProps) {
  return (
    <mesh position={p} castShadow>
      <sphereGeometry args={[rad, seg, Math.max(6, Math.round(seg * 0.75))]} />
      <Mat {...mat} />
    </mesh>
  );
}

/** A mesh around a pre-built geometry (e.g. a merged tread or a lathe profile); disposes it when replaced. */
export function G({ geo, p, rot, ...mat }: { geo: BufferGeometry; p?: V3; rot?: V3 } & MatProps) {
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={p} rotation={rot} castShadow>
      <Mat {...mat} />
    </mesh>
  );
}

export interface BoxItem {
  p: V3;
  s: V3;
  rot?: V3;
}

/** Merges many small boxes into one geometry (one draw call): tread blocks, heatsink fins, pins… */
export function mergeBoxes(items: BoxItem[]): BufferGeometry {
  const gs = items.map((it) => {
    const g = new BoxGeometry(...it.s);
    if (it.rot) {
      g.rotateX(it.rot[0]);
      g.rotateY(it.rot[1]);
      g.rotateZ(it.rot[2]);
    }
    g.translate(...it.p);
    return g;
  });
  return mergeOrEmpty(gs);
}

export function mergeOrEmpty(gs: BufferGeometry[]): BufferGeometry {
  if (!gs.length) return new BoxGeometry(0, 0, 0);
  const merged = mergeGeometries(gs, false) ?? new BoxGeometry(0, 0, 0);
  for (const g of gs) g.dispose();
  return merged;
}

/** Cylinder geometry along y (radius r, length len), to be rotated/translated and merged. */
export function cylGeo(r: number, len: number, seg = 10, r2?: number) {
  return new CylinderGeometry(r2 ?? r, r, len, seg);
}

/**
 * D-shaped (or double-D) shaft profile extruded along z, centred on the origin: radius r, length len.
 * The flat sits at +y (and −y for a double-D).
 */
export function dShaftGeometry(r: number, len: number, double = false): BufferGeometry {
  const f = 0.62; // flat at 62 % of the radius
  const a = Math.asin(f);
  const s = new Shape();
  if (double) {
    s.moveTo(Math.cos(a) * r, f * r);
    s.absarc(0, 0, r, a, -a, true);
    s.lineTo(Math.cos(a) * r, -f * r);
    s.absarc(0, 0, r, Math.PI + a, Math.PI - a, true);
    s.lineTo(-Math.cos(a) * r, f * r);
  } else {
    s.moveTo(Math.cos(a) * r, f * r);
    s.absarc(0, 0, r, a, Math.PI - a, true);
  }
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -len / 2);
  return g;
}

/**
 * Ring (tyre / rim) around the y axis: inner radius ri, outer radius ro, width w, rounded outer corners
 * (round = 0..1 of the smaller of the wall height and half the width).
 */
export function ringGeometry(ri: number, ro: number, w: number, round = 0.3, seg = 36): BufferGeometry {
  const c = Math.max(0.01, round * Math.min(ro - ri, w / 2));
  const pts: Vector2[] = [new Vector2(ri, -w / 2)];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= 3; i++) {
      const a = a0 + ((a1 - a0) * i) / 3;
      pts.push(new Vector2(cx + c * Math.cos(a), cy + c * Math.sin(a)));
    }
  };
  arc(ro - c, -w / 2 + c, -Math.PI / 2, 0);
  arc(ro - c, w / 2 - c, 0, Math.PI / 2);
  pts.push(new Vector2(ri, w / 2), new Vector2(ri, -w / 2));
  return new LatheGeometry(pts, seg);
}

/** Row of header pins as box items: n pins along `ax` centred on p, extending `pinLen` up (dir 1) or down (−1). */
export function pinRow(p: V3, n: number, ax: "x" | "z", pinLen: number, dir: 1 | -1 = 1, pitch = 2.54): BoxItem[] {
  return Array.from({ length: n }, (_, i) => {
    const o = (i - (n - 1) / 2) * pitch;
    return { p: [p[0] + (ax === "x" ? o : 0), p[1] + (dir * pinLen) / 2, p[2] + (ax === "z" ? o : 0)], s: [0.64, pinLen, 0.64] };
  });
}

// Shared palette
export const COL = {
  pcbTeal: "#00878f",
  pcbBlue: "#1d4f9c",
  pcbBlack: "#17191d",
  pcbGreen: "#1f6f3a",
  pcbRed: "#b3191f",
  pcbPurple: "#4b2d86",
  chip: "#141518",
  header: "#121214",
  gold: "#d4a93a",
  silver: "#c9ced4",
  steel: "#9aa3ad",
  alu: "#cfd5db",
  terminalBlue: "#2470c9",
  rubber: "#1a1c20",
  brass: "#c9a227",
  copper: "#c77b3a",
  white: "#f1efe8",
  beastRed: "#D91A14",
} as const;
