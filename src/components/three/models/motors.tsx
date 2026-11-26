"use client";
import { LiveContext } from "./live";
/**
 * DC gear motors and servos.
 *
 * Designer convention (see RobotParts / drivetrain4wd): a motor's body runs along its local x (dims.x = length),
 * dims.y is its width across the robot and dims.z its height. The OUTPUT SHAFT leaves the part centre towards
 * local −z (three.js) = robot +y before yaw; the wheel is mounted 6 mm beyond that face. So every geared model
 * puts the output of its gearbox at the origin, and every model stays inside the part's dimension box.
 */
import { useMemo, useContext } from "react";
import { B, COL, Cyl, G, Mm, dShaftGeometry } from "./prims";
import type { ModelProps } from "./types";

/** Output shaft leaving the −z face (and the +z face too for a dual shaft). */
function Shaft({ W, r, len, double = false, dual = false, c = COL.silver }: { W: number; r: number; len: number; double?: boolean; dual?: boolean; c?: string }) {
  const geo = useMemo(() => dShaftGeometry(r, len, double), [r, len, double]);
  const geo2 = useMemo(() => (dual ? dShaftGeometry(r, len, double) : null), [r, len, double, dual]);
  const metal = c === COL.silver ? 0.9 : 0.05;
  return (
    <>
      <G geo={geo} p={[0, 0, -(W / 2 + len / 2)]} c={c} metal={metal} rough={0.3} hl={false} />
      {geo2 && <G geo={geo2} p={[0, 0, W / 2 + len / 2]} c={c} metal={metal} rough={0.3} hl={false} />}
    </>
  );
}

/** Rear end cap with two solder terminals. */
function EndCap({ x0, x1, r, c = "#1d1f22" }: { x0: number; x1: number; r: number; c?: string }) {
  const len = x1 - x0;
  return (
    <>
      <Cyl p={[(x0 + x1) / 2, 0, 0]} rad={r} len={len} ax="x" c={c} rough={0.7} />
      {[-1, 1].map((s) => (
        <B key={s} p={[x1 - Math.min(1.2, len / 2), r * 0.82, s * r * 0.4]} s={[Math.min(2.4, len), r * 0.45, Math.max(0.5, r * 0.06)]} c={COL.copper} metal={0.8} rough={0.3} hl={false} />
      ))}
    </>
  );
}

/** Hall encoder: magnet disc + small PCB on the motor's rear end. */
function Encoder({ x, r }: { x: number; r: number }) {
  return (
    <>
      <Cyl p={[x - 1.6, 0, 0]} rad={r * 0.7} len={1.2} ax="x" c="#222" seg={20} />
      <B p={[x - 0.4, 0, 0]} s={[0.8, r * 2, r * 2]} c={COL.pcbGreen} />
      <B p={[x - 0.4, r * 0.75, 0]} s={[1, r * 0.4, r * 1.2]} c={COL.header} hl={false} />
    </>
  );
}

function TT({ L, W, H }: Dim) {
  const xg = L * 0.12; // gearbox / can split; the shaft at x = 0 is inside the yellow gearbox
  const rc = (Math.min(H, W) / 2) * 0.9;
  const yellow = "#f2c230";
  return (
    <>
      <Cyl p={[-L / 2 + H / 2, 0, 0]} rad={H / 2} len={W} ax="z" c={yellow} rough={0.55} seg={20} />
      <B p={[(-L / 2 + H / 2 + xg) / 2, 0, 0]} s={[xg + L / 2 - H / 2, H, W]} c={yellow} rough={0.55} />
      {/* raised bearing bosses around the dual output shaft */}
      <Cyl p={[0, 0, 0]} rad={4.5} len={W + 1.4} ax="z" c="#e5b324" rough={0.5} />
      {/* through-holes for the M3 mounting screws */}
      {[-1, 1].map((s) => <Cyl key={s} p={[xg - 4.5, s * H * 0.3, 0]} rad={1.6} len={W + 0.2} ax="z" c="#3a2f10" seg={8} hl={false} />)}
      <Cyl p={[-L / 2 + H / 2, 0, 0]} rad={1.6} len={W + 0.2} ax="z" c="#3a2f10" seg={8} hl={false} />
      {/* flattened metal can + white retaining clip */}
      <Cyl p={[(xg + L / 2 - 3) / 2, 0, 0]} rad={rc} len={L / 2 - 3 - xg} ax="x" c={COL.silver} metal={0.85} rough={0.25} sc={[1, 0.9, 1.08]} />
      <Cyl p={[xg + 2, 0, 0]} rad={rc * 1.04} len={3} ax="x" c={COL.white} rough={0.6} sc={[1, 0.9, 1.08]} />
      <EndCap x0={L / 2 - 3} x1={L / 2} r={rc * 0.75} c="#e9e4d6" />
      <Shaft W={W} r={2.7} len={9} double dual c="#f4ead0" />
    </>
  );
}

function BO({ L, W, H }: Dim) {
  const xg = L * 0.1;
  const rc = (Math.min(H, W) / 2) * 0.9;
  const yellow = "#f5b81c";
  return (
    <>
      <B p={[(-L / 2 + xg) / 2, 0, 0]} s={[xg + L / 2, H, W * 0.9]} c={yellow} rough={0.55} />
      {/* stepped output housing around the single shaft */}
      <Cyl p={[0, 0, -0.6]} rad={H * 0.42} len={W * 0.9 + 1.2} ax="z" c="#e8a912" rough={0.5} seg={20} />
      {/* vertical mounting holes and cover screws */}
      {[-1, 1].map((s) => <Cyl key={s} p={[-L / 2 + 5, 0, s * W * 0.24]} rad={1.6} len={H + 0.2} ax="y" c="#3a2f10" seg={8} hl={false} />)}
      {[-L / 2 + 4, -L * 0.18, xg - 3].map((x, i) => <Cyl key={i} p={[x, H * 0.32, W * 0.45 + 0.2]} rad={1.1} len={0.6} ax="z" c={COL.silver} metal={0.9} seg={8} hl={false} />)}
      <Cyl p={[(xg + L / 2 - 4) / 2, 0, 0]} rad={rc} len={L / 2 - 4 - xg} ax="x" c={COL.silver} metal={0.85} rough={0.25} />
      {[xg + 3, L / 2 - 8].map((x) => <Cyl key={x} p={[x, 0, 0]} rad={rc * 1.05} len={2.5} ax="x" c={COL.white} rough={0.6} />)}
      <EndCap x0={L / 2 - 4} x1={L / 2} r={rc * 0.8} />
      <Shaft W={W * 0.9} r={2.7} len={9} double c="#f4ead0" />
    </>
  );
}

/** BO motor in the L-shaped (right-angle) housing: the can stands up from the gearbox. */
function BOL({ L, W, H }: Dim) {
  const top = H * 0.05;
  const rc = Math.min(L * 0.2, W * 0.42);
  return (
    <>
      <B p={[0, (-H / 2 + top) / 2, 0]} s={[L, top + H / 2, W * 0.9]} c="#f5b81c" rough={0.55} />
      <Cyl p={[0, 0, -0.6]} rad={Math.min(H * 0.3, 7)} len={W * 0.9 + 1.2} ax="z" c="#e8a912" rough={0.5} seg={20} />
      <Cyl p={[L * 0.25, (top + H / 2 - 3) / 2, 0]} rad={rc} len={H / 2 - 3 - top} ax="y" c={COL.silver} metal={0.85} rough={0.25} />
      <Cyl p={[L * 0.25, H / 2 - 1.5, 0]} rad={rc * 0.8} len={3} ax="y" c="#1d1f22" rough={0.7} />
      <Shaft W={W * 0.9} r={2.7} len={9} double c="#f4ead0" />
    </>
  );
}

function N20({ L, W, H, encoder }: Dim & { encoder: boolean }) {
  const xg = Math.max(L * 0.08, 2.4); // gearbox [−L/2, xg] holds the output
  const end = L / 2 - (encoder ? 4 : 1.6);
  const plates = [-L / 2 + 0.4, (-L / 2 + xg) / 2, xg - 0.4];
  return (
    <>
      {/* brass gear train between steel plates */}
      <B p={[(-L / 2 + xg) / 2, 0, 0]} s={[xg + L / 2 - 0.6, H * 0.84, W * 0.84]} c="#b8913a" metal={0.8} rough={0.35} />
      {plates.map((x) => <B key={x} p={[x, 0, 0]} s={[0.8, H, W]} c={COL.steel} metal={0.85} rough={0.3} />)}
      {[-1, 1].map((s) => <Cyl key={s} p={[(-L / 2 + xg) / 2, s * H * 0.36, W * 0.36]} rad={0.6} len={xg + L / 2} ax="x" c={COL.silver} metal={0.9} seg={6} hl={false} />)}
      {/* flattened can */}
      <Cyl p={[(xg + end) / 2, 0, 0]} rad={W / 2} len={end - xg} ax="x" c={COL.silver} metal={0.85} rough={0.25} sc={[1, H / W, 1]} seg={20} />
      <B p={[end + 0.6, 0, 0]} s={[1.2, H * 0.8, W * 0.8]} c="#1d1f22" rough={0.7} />
      {[-1, 1].map((s) => <B key={s} p={[end + 1.5, H * 0.1, s * W * 0.25]} s={[1.6, H * 0.35, 0.4]} c={COL.copper} metal={0.8} hl={false} />)}
      {encoder && <Encoder x={L / 2} r={Math.min(W, H) / 2} />}
      <Shaft W={W} r={1.5} len={9} />
    </>
  );
}

/** Round metal gearbox + can, side output at the origin (25GA370, 37GB520 and family). */
function RoundGear({ L, W, H, gearColor, canColor, shaftR, shaftLen, encoder }: Dim & { gearColor: string; canColor: string; shaftR: number; shaftLen: number; encoder: boolean }) {
  const R = Math.min(W, H) / 2;
  const xg = Math.max(L * 0.06, shaftR * 2.5);
  const capLen = encoder ? Math.max(6, L * 0.09) : Math.max(4, L * 0.06);
  const xe = L / 2 - capLen;
  return (
    <>
      {/* front flange with bearing boss and M3 holes */}
      <Cyl p={[-L / 2 + 1, 0, 0]} rad={R * 0.97} len={2} ax="x" c={COL.steel} metal={0.85} rough={0.3} seg={24} />
      <Cyl p={[-L / 2 + 0.2, 0, 0]} rad={R * 0.3} len={0.6} ax="x" c={COL.silver} metal={0.9} seg={16} hl={false} />
      {[-1, 1].map((s) => <Cyl key={s} p={[-L / 2 - 0.05, 0, s * R * 0.62]} rad={R * 0.1} len={0.4} ax="x" c="#1b1b1b" seg={8} hl={false} />)}
      {/* gear stages: body + raised bands */}
      <Cyl p={[(-L / 2 + 2 + xg) / 2, 0, 0]} rad={R * 0.95} len={xg + L / 2 - 2} ax="x" c={gearColor} metal={0.75} rough={0.35} seg={24} />
      {[0.25, 0.55, 0.85].map((f) => <Cyl key={f} p={[-L / 2 + 2 + f * (xg + L / 2 - 2), 0, 0]} rad={R} len={1.2} ax="x" c={gearColor} metal={0.8} rough={0.3} seg={24} />)}
      {/* side output boss */}
      <Cyl p={[0, 0, -R * 0.8]} rad={shaftR * 2.2} len={R * 0.5} ax="z" c={gearColor} metal={0.8} rough={0.3} seg={16} />
      {/* motor can with flux-ring lip and rear cap */}
      <Cyl p={[xg + 0.6, 0, 0]} rad={R} len={1.2} ax="x" c={canColor} metal={0.85} rough={0.25} seg={24} />
      <Cyl p={[(xg + xe) / 2, 0, 0]} rad={R * 0.96} len={xe - xg} ax="x" c={canColor} metal={0.85} rough={0.25} seg={24} />
      {encoder ? <Encoder x={L / 2} r={R * 0.95} /> : <EndCap x0={xe} x1={L / 2} r={R * 0.85} />}
      {encoder && <Cyl p={[(xe + L / 2 - 2) / 2, 0, 0]} rad={R * 0.85} len={L / 2 - 2 - xe} ax="x" c="#1d1f22" rough={0.7} seg={20} />}
      <Shaft W={W} r={shaftR} len={shaftLen} />
    </>
  );
}

/** Johnson side-shaft geared motor: flat stadium gearbox with an off-centre side output, big can. */
function Johnson({ L, W, H }: Dim) {
  const xg = L * 0.12;
  const gx0 = -L / 2 + H / 2,
    gx1 = xg - H / 2;
  const dz = W * 0.72;
  const zc = -W / 2 + dz / 2; // gearbox sits on the shaft side
  const rc = Math.min(H, W) / 2;
  const grey = "#5d646d";
  return (
    <>
      <B p={[(gx0 + gx1) / 2, 0, zc]} s={[gx1 - gx0, H, dz]} c={grey} metal={0.6} rough={0.4} />
      {[gx0, gx1].map((x) => <Cyl key={x} p={[x, 0, zc]} rad={H / 2} len={dz} ax="z" c={grey} metal={0.6} rough={0.4} seg={20} />)}
      {/* cover screws at the stadium corners */}
      {[gx0, gx1].flatMap((x) => [-1, 1].map((s) => <Cyl key={`${x}${s}`} p={[x, s * H * 0.3, -W / 2 - 0.2]} rad={1.1} len={0.6} ax="z" c={COL.silver} metal={0.9} seg={8} hl={false} />))}
      {/* output bearing boss — the shaft sits off the gearbox centre, towards the motor */}
      <Cyl p={[0, 0, -W / 2 - 0.6]} rad={5} len={1.6} ax="z" c={COL.silver} metal={0.9} rough={0.3} seg={16} />
      {/* large can and end bell */}
      <Cyl p={[(xg + L / 2 - 5) / 2, 0, 0]} rad={rc} len={L / 2 - 5 - xg} ax="x" c="#2a2d31" metal={0.5} rough={0.45} seg={24} />
      <Cyl p={[xg + 1.5, 0, 0]} rad={rc * 1.0} len={3} ax="x" c={COL.silver} metal={0.85} rough={0.3} seg={24} />
      <EndCap x0={L / 2 - 5} x1={L / 2} r={rc * 0.85} c={COL.silver} />
      <Shaft W={W} r={3} len={14} />
    </>
  );
}

/** Worm-gear motor: aluminium worm housing with a side output, can along x. */
function Worm({ L, W, H }: Dim) {
  const xg = L * 0.12;
  const rc = (Math.min(H, W) / 2) * 0.9;
  return (
    <>
      <B p={[(-L / 2 + xg) / 2, 0, 0]} s={[xg + L / 2, H, W * 0.95]} c="#c3c9cf" metal={0.75} rough={0.35} />
      <Cyl p={[(-L / 2 + xg) / 2, -H * 0.2, W * 0.2]} rad={H * 0.28} len={xg + L / 2} ax="x" c="#b3bac2" metal={0.75} rough={0.35} />
      <Cyl p={[0, 0, -W * 0.48]} rad={H * 0.35} len={2} ax="z" c="#b3bac2" metal={0.8} rough={0.3} seg={20} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sy) => <Cyl key={`${sx}${sy}`} p={[(-L / 2 + xg) / 2 + sx * (xg + L / 2) * 0.38, sy * H * 0.36, 0]} rad={1.3} len={W * 0.95 + 0.2} ax="z" c="#222" seg={8} hl={false} />))}
      <Cyl p={[(xg + L / 2 - 4) / 2, 0, 0]} rad={rc} len={L / 2 - 4 - xg} ax="x" c={COL.silver} metal={0.85} rough={0.25} seg={20} />
      <EndCap x0={L / 2 - 4} x1={L / 2} r={rc * 0.85} />
      <Shaft W={W * 0.95} r={3} len={12} />
    </>
  );
}

/** Bare RS-type can motor (no gearbox): axial shaft at −x, plastic rear end cap with terminals. */
function RS({ L, W, H, big }: Dim & { big: boolean }) {
  const R = Math.min(W, H) / 2;
  const sl = Math.min(10, L * 0.15);
  const capLen = Math.max(3, L * 0.14);
  const x0 = -L / 2 + sl,
    xe = L / 2 - capLen;
  return (
    <>
      <Cyl p={[(x0 + xe) / 2, 0, 0]} rad={R} len={xe - x0} ax="x" c="#c5cbd1" metal={0.85} rough={0.25} seg={24} />
      {[0.3, 0.7].map((f) => <B key={f} p={[x0 + f * (xe - x0), 0, 0]} s={[2, R * 0.5, R * 2.02]} c="#7f878f" metal={0.6} hl={false} />)}
      <Cyl p={[(xe + L / 2) / 2, 0, 0]} rad={R * 0.97} len={capLen} ax="x" c={big ? "#1d1f22" : "#ece6d6"} rough={0.7} seg={24} />
      {[-1, 1].map((s) => <B key={s} p={[L / 2 - capLen / 2, s * R * 0.92, 0]} s={[2.4, 2.4, 0.6]} c={COL.copper} metal={0.8} hl={false} />)}
      <Cyl p={[x0 - 0.8, 0, 0]} rad={R * 0.3} len={1.6} ax="x" c={COL.brass} metal={0.85} seg={12} hl={false} />
      <Cyl p={[-L / 2 + (sl - 1.6) / 2, 0, 0]} rad={Math.max(1, R * 0.12)} len={sl - 1.6} ax="x" c={COL.silver} metal={0.9} seg={10} hl={false} />
    </>
  );
}

/** Clearly generic gear motor: plain grey box gearbox + can, shaft at the origin. */
function GenericMotor({ L, W, H }: Dim) {
  return (
    <>
      <B p={[-L * 0.19, 0, 0]} s={[L * 0.62, H, W * 0.95]} c="#8d949c" metal={0.4} rough={0.5} />
      <Cyl p={[L * 0.31, 0, 0]} rad={Math.min(H, W) * 0.45} len={L * 0.38} ax="x" c="#b5bcc3" metal={0.7} rough={0.35} seg={20} />
      <Shaft W={W * 0.95} r={1.5} len={10} />
    </>
  );
}

// ───────────────────────────── servos ─────────────────────────────

function Servo({ L, W, H, variant, angle = 90 }: Dim & { variant: "sg90" | "mg90s" | "mg99x" | "ds32" | "generic"; angle?: number }) {
  const micro = variant === "sg90" || variant === "mg90s";
  const hb = H * 0.74; // body height (rest = gear tower + horn)
  const yb = -H / 2 + hb / 2;
  const ear = micro ? 4.5 : 7;
  const body = variant === "sg90" ? "#2f63c8" : variant === "generic" ? "#30343a" : "#18191c";
  const xo = -L / 2 + W / 2; // output spline sits over one end
  const towerH = H * 0.12;
  return (
    <>
      <B p={[0, yb, 0]} s={[L, hb, W]} c={body} rough={0.5} />
      {variant === "ds32" && <B p={[0, yb + hb * 0.05, 0]} s={[L + 0.2, hb * 0.45, W + 0.2]} c={COL.alu} metal={0.8} rough={0.3} />}
      {variant === "mg90s" && <B p={[0, yb + hb * 0.25, 0]} s={[L + 0.1, hb * 0.2, W + 0.1]} c="#9aa3ad" metal={0.7} rough={0.35} />}
      {/* mounting ears with holes */}
      <B p={[0, -H / 2 + hb * 0.72, 0]} s={[L + 2 * ear, micro ? 2.2 : 2.8, W]} c={body} rough={0.5} />
      {[-1, 1].map((s) => <Cyl key={s} p={[s * (L / 2 + ear / 2), -H / 2 + hb * 0.72, 0]} rad={micro ? 1.1 : 2} len={3.2} c="#0c0c0c" seg={8} hl={false} />)}
      {/* gear tower + output spline */}
      <Cyl p={[xo, -H / 2 + hb + towerH / 2, 0]} rad={W * 0.47} len={towerH} c={variant === "mg99x" || variant === "mg90s" ? "#2b2d31" : body} rough={0.5} seg={20} />
      <Cyl p={[-L * 0.05, -H / 2 + hb + towerH * 0.3, 0]} rad={W * 0.22} len={towerH * 0.6} c={body} rough={0.5} seg={14} />
      <Cyl p={[xo, -H / 2 + hb + towerH + 1, 0]} rad={W * 0.14} len={2} c={variant === "sg90" ? COL.white : COL.brass} metal={0.6} seg={10} hl={false} />
      {/* white horn: hub + two-arm (micro) or cross (standard) — turned to the simulated angle (90° = centred) */}
      <group position={[xo, 0, 0]} rotation={[0, ((angle - 90) * Math.PI) / 180, 0]}>
        <Cyl p={[0, H / 2 - 1.2, 0]} rad={micro ? 3.5 : 5.5} len={2.4} c={COL.white} rough={0.6} seg={16} />
        <B p={[0, H / 2 - 0.8, 0]} s={[micro ? L * 0.95 : L * 0.9, 1.6, micro ? 4.5 : 6]} c={COL.white} rough={0.6} />
        {!micro && <B p={[0, H / 2 - 0.8, 0]} s={[6, 1.6, W * 1.4]} c={COL.white} rough={0.6} />}
      </group>
      {/* lead: brown / red / orange */}
      {["#5a3a22", "#c62828", "#f39c12"].map((c, i) => <Cyl key={c} p={[L / 2 + 3, -H / 2 + 2.5, (i - 1) * 1.1]} rad={0.5} len={6} ax="x" c={c} seg={6} hl={false} />)}
    </>
  );
}

// ───────────────────────────── dispatch ─────────────────────────────

interface Dim {
  L: number;
  W: number;
  H: number;
}

export function MotorModel({ comp, d, info }: ModelProps) {
  const L = d.x,
    W = d.y,
    H = d.z; // length, width (shaft axis), height
  const text = `${comp.id} ${comp.name} ${comp.description}`.toLowerCase();
  const encoder = /encoder/.test(`${comp.id} ${comp.name}`.toLowerCase());
  const body = (() => {
    switch (info.key) {
      case "tt":
        return <TT L={L} W={W} H={H} />;
      case "bo":
        return <BO L={L} W={W} H={H} />;
      case "bo-l":
        return <BOL L={L} W={W} H={H} />;
      case "n20":
        return <N20 L={L} W={W} H={H} encoder={encoder} />;
      case "ga25":
        return <RoundGear L={L} W={W} H={H} gearColor="#c8a64e" canColor="#cfd4da" shaftR={2} shaftLen={12} encoder={encoder} />;
      case "ga37":
        return <RoundGear L={L} W={W} H={H} gearColor="#b9c0c8" canColor="#aeb5bd" shaftR={3} shaftLen={14} encoder={encoder} />;
      case "johnson":
        return <Johnson L={L} W={W} H={H} />;
      case "worm":
        return <Worm L={L} W={W} H={H} />;
      case "rs":
        return <RS L={L} W={W} H={H} big={/5[45]\d|775/.test(text)} />;
      default:
        return <GenericMotor L={L} W={W} H={H} />;
    }
  })();
  return <Mm>{body}</Mm>;
}

export function ServoModel({ part, comp, d }: ModelProps) {
  const live = useContext(LiveContext)?.[part.uid];
  const t = comp.id;
  const variant = t === "sg90" ? "sg90" : t === "mg90s" ? "mg90s" : /mg99/.test(t) ? "mg99x" : /ds32/.test(t) ? "ds32" : "generic";
  return (
    <Mm>
      <Servo L={d.x} W={d.y} H={d.z} variant={variant} angle={live?.servoAngle ?? 90} />
    </Mm>
  );
}
