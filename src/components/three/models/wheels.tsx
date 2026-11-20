"use client";
/**
 * Wheels. The wheel axis is local y inside the spin group (the outer group turns it onto the robot's y axis,
 * exactly as before), so the spin is a rotation about y. Diameter = dims.x, width = dims.y. Details are
 * symmetric left/right so the same model works on both sides of the robot.
 */
import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import { type BoxItem, COL, Cyl, G, Mm, cylGeo, mergeBoxes, mergeOrEmpty, ringGeometry } from "./prims";
import type { ModelProps } from "./types";

interface WD {
  R: number;
  w: number;
}

/** Tread blocks around the tyre: `rows` staggered rows of `n` blocks. */
function treadItems(R: number, w: number, n: number, rows: number, block: [number, number, number], stagger = true): BoxItem[] {
  const items: BoxItem[] = [];
  for (let r = 0; r < rows; r++) {
    const y = rows === 1 ? 0 : (r / (rows - 1) - 0.5) * (w - block[1]);
    for (let i = 0; i < n; i++) {
      const a = ((i + (stagger && r % 2 ? 0.5 : 0)) / n) * Math.PI * 2;
      const rr = R - block[0] / 2; // outer face of the block on the wheel radius
      items.push({ p: [Math.cos(a) * rr, y, Math.sin(a) * rr], s: block, rot: [0, -a, 0] });
    }
  }
  return items;
}

/** n radial spokes between radius r0 and r1, thickness t (tangential) and depth d (axial). */
function spokeItems(n: number, r0: number, r1: number, t: number, d: number, phase = 0): BoxItem[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    const rm = (r0 + r1) / 2;
    return { p: [Math.cos(a) * rm, 0, Math.sin(a) * rm], s: [r1 - r0, d, t], rot: [0, -a, 0] };
  });
}

function Tyre({ R, w, ri, round, c, rough = 0.9, tread }: WD & { ri: number; round: number; c: string; rough?: number; tread?: BoxItem[] }) {
  const ring = useMemo(() => ringGeometry(ri, R, w, round), [ri, R, w, round]);
  const tg = useMemo(() => (tread ? mergeBoxes(tread) : null), [tread]);
  return (
    <>
      <G geo={ring} c={c} rough={rough} ds />
      {tg && <G geo={tg} c={c} rough={rough} />}
    </>
  );
}

/** Spoked plastic hub: rim ring + n spokes + central boss with a D-bore. */
function SpokedHub({ ri, w, n, c, metal = 0.05, boss = 5 }: { ri: number; w: number; n: number; c: string; metal?: number; boss?: number }) {
  const rimT = Math.max(1.2, ri * 0.12);
  const rim = useMemo(() => ringGeometry(ri - rimT, ri + 0.2, w * 0.86, 0.1, 32), [ri, rimT, w]);
  const sp = useMemo(() => mergeBoxes(spokeItems(n, boss * 0.8, ri - rimT + 0.3, Math.max(1.6, ri * 0.13), w * 0.4)), [n, boss, ri, rimT, w]);
  return (
    <>
      <G geo={rim} c={c} metal={metal} rough={0.5} ds />
      <G geo={sp} c={c} metal={metal} rough={0.5} />
      <Cyl rad={boss} len={w * 0.9} c={c} metal={metal} rough={0.5} seg={16} />
      <Cyl rad={Math.min(2.7, boss * 0.5)} len={w * 0.92} c="#141414" seg={10} hl={false} />
    </>
  );
}

/** Machined disc hub with lightening holes and a set-screw boss. */
function DiscHub({ ri, w, holes, c = COL.alu }: { ri: number; w: number; holes: number; c?: string }) {
  const hr = ri * 0.2;
  return (
    <>
      <Cyl rad={ri} len={w * 0.55} c={c} metal={0.85} rough={0.3} seg={32} />
      <Cyl rad={Math.max(4, ri * 0.3)} len={w * 0.95} c={c} metal={0.85} rough={0.3} seg={20} />
      {Array.from({ length: holes }, (_, i) => {
        const a = (i / holes) * Math.PI * 2;
        return <Cyl key={i} p={[Math.cos(a) * ri * 0.6, 0, Math.sin(a) * ri * 0.6]} rad={hr} len={w * 0.56} c="#202326" seg={14} hl={false} />;
      })}
      <Cyl rad={Math.min(2.5, ri * 0.15)} len={w * 0.97} c="#141414" seg={10} hl={false} />
    </>
  );
}

function TTWheel({ R, w }: WD) {
  const ri = R * 0.74;
  const tread = useMemo(() => treadItems(R, w * 0.8, 30, 2, [1, w * 0.36, 2.2]), [R, w]);
  return (
    <>
      <Tyre R={R - 0.6} w={w} ri={ri} round={0.35} c={COL.rubber} tread={tread} />
      <SpokedHub ri={ri} w={w} n={6} c="#f2c230" />
    </>
  );
}

function RubberWheel({ R, w }: WD) {
  const ri = R * 0.7;
  const tread = useMemo(() => treadItems(R, w, 24, 3, [0.9, w * 0.26, 3.2]), [R, w]);
  return (
    <>
      <Tyre R={R - 0.5} w={w} ri={ri} round={0.3} c={COL.rubber} tread={tread} />
      <SpokedHub ri={ri} w={w} n={5} c={COL.beastRed} />
      <Cyl rad={3.2} len={w * 0.96} c={COL.silver} metal={0.9} rough={0.3} seg={6} hl={false} />
    </>
  );
}

function OffroadWheel({ R, w }: WD) {
  const ri = R * 0.6; // deep sidewall
  const knobs = useMemo(() => [...treadItems(R, w * 0.92, 16, 2, [3, w * 0.34, 5.5]), ...treadItems(R - 2.5, w * 1.04, 16, 1, [2.4, w * 1.04, 2.4], false).map((k) => ({ ...k, rot: [0, (k.rot?.[1] ?? 0) + 0.2, 0] as [number, number, number] }))], [R, w]);
  return (
    <>
      <Tyre R={R - 2.4} w={w} ri={ri} round={0.55} c="#1b1b1b" rough={0.95} tread={knobs} />
      <SpokedHub ri={ri} w={w * 0.85} n={5} c="#2c2f35" metal={0.5} boss={6} />
      <Cyl rad={4} len={w * 0.9} c={COL.silver} metal={0.9} rough={0.3} seg={6} hl={false} />
    </>
  );
}

function SumoWheel({ R, w }: WD) {
  const ri = R * 0.72;
  return (
    <>
      <Tyre R={R} w={w} ri={ri} round={0.12} c="#202022" rough={0.98} />
      <DiscHub ri={ri} w={w} holes={4} />
    </>
  );
}

function FoamWheel({ R, w }: WD) {
  const ri = R * 0.55;
  return (
    <>
      <Tyre R={R} w={w} ri={ri} round={0.55} c="#cfcabd" rough={1} />
      <Cyl rad={ri} len={w * 0.5} c={COL.white} rough={0.6} seg={24} />
      <Cyl rad={Math.max(3.5, ri * 0.35)} len={w * 0.9} c={COL.white} rough={0.6} seg={16} />
      <Cyl rad={Math.min(2, ri * 0.15)} len={w * 0.92} c="#141414" seg={10} hl={false} />
    </>
  );
}

function RacingWheel({ R, w }: WD) {
  const ri = R * 0.82; // low-profile slick
  return (
    <>
      <Tyre R={R} w={w} ri={ri} round={0.25} c="#151517" rough={0.75} />
      <SpokedHub ri={ri} w={w} n={6} c={COL.beastRed} boss={4.5} />
    </>
  );
}

function MetalWheel({ R, w }: WD) {
  const oring = useMemo(() => ringGeometry(R - 2.2, R, Math.min(3, w * 0.3), 0.9, 36), [R, w]);
  const rim = useMemo(() => ringGeometry(R * 0.8, R - 1.6, w, 0.15, 40), [R, w]);
  return (
    <>
      <G geo={rim} c={COL.alu} metal={0.9} rough={0.25} ds />
      <G geo={oring} c={COL.rubber} rough={0.9} ds />
      <DiscHub ri={R * 0.8} w={w} holes={6} />
    </>
  );
}

function PrintedWheel({ R, w }: WD) {
  const ri = R * 0.76;
  const tread = useMemo(() => [...treadItems(R, w * 0.5, 18, 1, [1.2, w * 0.5, 2.4]).map((t) => ({ ...t, p: [t.p[0], -w * 0.22, t.p[2]] as [number, number, number], rot: [0.5, t.rot![1], 0] as [number, number, number] })), ...treadItems(R, w * 0.5, 18, 1, [1.2, w * 0.5, 2.4]).map((t) => ({ ...t, p: [t.p[0], w * 0.22, t.p[2]] as [number, number, number], rot: [-0.5, t.rot![1], 0] as [number, number, number] }))], [R, w]);
  return (
    <>
      <Tyre R={R - 0.8} w={w} ri={ri} round={0.25} c="#2b2d31" rough={0.85} tread={tread} />
      <SpokedHub ri={ri} w={w} n={3} c={COL.beastRed} boss={5} />
    </>
  );
}

/** Rollers on a mecanum (45°) or omni (90°) wheel, merged into one geometry. */
function rollerGeometry(R: number, w: number, kind: "mecanum" | "omni") {
  const up = new Vector3(0, 1, 0);
  const gs = [];
  if (kind === "mecanum") {
    const n = 9;
    const rr = R * 0.18;
    const rc = R - rr;
    const len = w * 0.85 * Math.SQRT2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const t = new Vector3(-Math.sin(a), 0, Math.cos(a));
      const axis = t.clone().add(up).normalize();
      const g = cylGeo(rr * 0.8, len, 10, rr * 0.8);
      g.applyQuaternion(new Quaternion().setFromUnitVectors(up, axis));
      g.translate(Math.cos(a) * rc, 0, Math.sin(a) * rc);
      gs.push(g);
    }
  } else {
    const n = 8;
    const rr = R * 0.16;
    const rc = R - rr;
    const len = ((2 * Math.PI * rc) / n) * 0.78;
    for (const [row, y] of [
      [0, -w * 0.24],
      [1, w * 0.24],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const a = ((i + row * 0.5) / n) * Math.PI * 2;
        const t = new Vector3(-Math.sin(a), 0, Math.cos(a));
        const g = cylGeo(rr, len, 10, rr * 0.75);
        g.applyQuaternion(new Quaternion().setFromUnitVectors(up, t));
        g.translate(Math.cos(a) * rc, y, Math.sin(a) * rc);
        gs.push(g);
      }
    }
  }
  return mergeOrEmpty(gs);
}

function RollerWheel({ R, w, kind }: WD & { kind: "mecanum" | "omni" }) {
  const rollers = useMemo(() => rollerGeometry(R, w, kind), [R, w, kind]);
  const plateR = R * (kind === "mecanum" ? 0.66 : 0.7);
  return (
    <>
      <G geo={rollers} c={kind === "mecanum" ? "#2b2d31" : "#3a3d42"} rough={0.85} />
      {[-1, 1].map((s) => <Cyl key={s} p={[0, s * w * 0.46, 0]} rad={plateR} len={1.6} c={COL.steel} metal={0.85} rough={0.3} seg={kind === "mecanum" ? 9 : 16} />)}
      {kind === "omni" && <Cyl rad={plateR * 0.9} len={1.6} c={COL.steel} metal={0.85} rough={0.3} seg={16} />}
      <Cyl rad={Math.max(5, R * 0.18)} len={w * 0.96} c="#2c2f35" metal={0.5} seg={16} />
      <Cyl rad={Math.min(3, R * 0.08)} len={w * 0.98} c="#141414" seg={6} hl={false} />
    </>
  );
}

function DualWheel({ R, w }: WD) {
  const each = w / 2 - 1;
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, s * (each / 2 + 1), 0]}>
          <RubberWheel R={R} w={each} />
        </group>
      ))}
      <Cyl rad={4} len={w} c={COL.silver} metal={0.9} rough={0.3} seg={12} />
    </>
  );
}

/** Clearly generic wheel: plain black cylinder and a grey hex hub. */
function GenericWheel({ R, w }: WD) {
  return (
    <>
      <Cyl rad={R} len={w} c={COL.rubber} rough={0.9} seg={32} />
      <Cyl rad={R * 0.32} len={w * 1.04} c="#7d858e" metal={0.4} seg={6} />
    </>
  );
}

function WheelBody({ info, R, w }: { info: ModelProps["info"]; R: number; w: number }) {
  switch (info.key) {
    case "wheel-tt":
      return <TTWheel R={R} w={w} />;
    case "wheel-rubber":
      return <RubberWheel R={R} w={w} />;
    case "offroad":
      return <OffroadWheel R={R} w={w} />;
    case "sumo":
      return <SumoWheel R={R} w={w} />;
    case "foam":
      return <FoamWheel R={R} w={w} />;
    case "racing":
      return <RacingWheel R={R} w={w} />;
    case "wheel-metal":
      return <MetalWheel R={R} w={w} />;
    case "wheel-printed":
      return <PrintedWheel R={R} w={w} />;
    case "wheel-dual":
      return <DualWheel R={R} w={w} />;
    case "mecanum":
      return <RollerWheel R={R} w={w} kind="mecanum" />;
    case "omni":
      return <RollerWheel R={R} w={w} kind="omni" />;
    default:
      return <GenericWheel R={R} w={w} />;
  }
}

/** Wheel with spin: only the inner rotation changes per frame; the geometry is memoised. */
export function WheelModel({ d, info, wheelAngle = 0 }: ModelProps & { wheelAngle?: number }) {
  const R = d.x / 2,
    w = d.y;
  const body = useMemo(
    () => (
      <Mm>
        <WheelBody info={info} R={R} w={w} />
      </Mm>
    ),
    [info, R, w],
  );
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <group rotation={[0, wheelAngle, 0]}>{body}</group>
    </group>
  );
}


