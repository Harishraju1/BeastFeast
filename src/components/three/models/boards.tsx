"use client";
/**
 * Motor-driver and controller boards. Local axes: x = board length (dims.x), z = board width (dims.y,
 * robot −y), y = up (dims.z). The PCB sits at the bottom of the dimension box unless the board has pins
 * underneath (Nano, ESP32, MX1508…), in which case the pins fill the space below the PCB.
 */
import { useMemo } from "react";
import { B, COL, Cyl, G, Mm, type V3, type BoxItem, mergeBoxes, pinRow } from "./prims";
import type { ModelProps } from "./types";

// ───────────────────────────── shared board parts ─────────────────────────────

/** Gold pins merged into one draw call. */
function Pins({ items }: { items: BoxItem[] }) {
  const geo = useMemo(() => mergeBoxes(items), [items]);
  return <G geo={geo} c={COL.gold} metal={0.85} rough={0.3} hl={false} />;
}

/** Male header row: black spacer + pins (pointing up or down from y). */
function MaleHeader({ p, n, ax = "x", up = true, len = 6 }: { p: V3; n: number; ax?: "x" | "z"; up?: boolean; len?: number }) {
  const [px, py, pz] = p;
  const items = useMemo(() => pinRow([px, py, pz], n, ax, len, up ? 1 : -1), [px, py, pz, n, ax, up, len]);
  const span = n * 2.54;
  return (
    <>
      <B p={[p[0], p[1] + (up ? 1.25 : -1.25), p[2]]} s={ax === "x" ? [span, 2.5, 2.54] : [2.54, 2.5, span]} c={COL.header} rough={0.7} />
      <Pins items={items} />
    </>
  );
}

/** Female header (Arduino style): black body with a gold strip on top for the contacts. */
function FemaleHeader({ p, n, ax = "x", h = 8.5 }: { p: V3; n: number; ax?: "x" | "z"; h?: number }) {
  const span = n * 2.54;
  const s: V3 = ax === "x" ? [span, h, 2.54] : [2.54, h, span];
  return (
    <>
      <B p={[p[0], p[1] + h / 2, p[2]]} s={s} c={COL.header} rough={0.7} />
      <B p={[p[0], p[1] + h + 0.01, p[2]]} s={ax === "x" ? [span - 1, 0.02, 0.7] : [0.7, 0.02, span - 1]} c="#3a3a3a" hl={false} />
    </>
  );
}

/** Blue screw terminal block: n ways along `ax`, 5 mm pitch, with screw heads on top. */
function Terminal({ p, n, ax = "x", c = COL.terminalBlue, pitch = 5, h = 10, depth = 7.5 }: { p: V3; n: number; ax?: "x" | "z"; c?: string; pitch?: number; h?: number; depth?: number }) {
  const span = n * pitch;
  return (
    <>
      <B p={[p[0], p[1] + h / 2, p[2]]} s={ax === "x" ? [span, h, depth] : [depth, h, span]} c={c} rough={0.6} />
      {Array.from({ length: n }, (_, i) => {
        const o = (i - (n - 1) / 2) * pitch;
        return <Cyl key={i} p={[p[0] + (ax === "x" ? o : 0), p[1] + h + 0.3, p[2] + (ax === "z" ? o : 0)]} rad={1.5} len={0.6} c={COL.silver} metal={0.9} seg={10} hl={false} />;
      })}
    </>
  );
}

function Chip({ p, s, rot }: { p: V3; s: V3; rot?: V3 }) {
  return <B p={[p[0], p[1] + s[1] / 2, p[2]]} s={s} rot={rot} c={COL.chip} rough={0.55} />;
}

/** Electrolytic capacitor: black sleeve + silver top. */
function ECap({ p, r = 3, h = 7 }: { p: V3; r?: number; h?: number }) {
  return (
    <>
      <Cyl p={[p[0], p[1] + h / 2, p[2]]} rad={r} len={h} c="#16181c" rough={0.5} seg={14} />
      <Cyl p={[p[0], p[1] + h + 0.05, p[2]]} rad={r * 0.9} len={0.1} c={COL.silver} metal={0.9} seg={14} hl={false} />
    </>
  );
}

type UsbKind = "b" | "mini" | "micro" | "c";
const USB_SIZE: Record<UsbKind, V3> = { b: [16, 11, 12], mini: [9, 4, 7.7], micro: [5.6, 2.7, 7.5], c: [7.4, 3.2, 9] };
/** USB receptacle at the −x edge of the board, opening towards −x. */
function Usb({ x0, y, z, kind }: { x0: number; y: number; z: number; kind: UsbKind }) {
  const s = USB_SIZE[kind];
  return (
    <>
      <B p={[x0 + s[0] / 2, y + s[1] / 2, z]} s={s} c={COL.silver} metal={0.85} rough={0.3} />
      <B p={[x0 - 0.01, y + s[1] / 2, z]} s={[0.05, s[1] * 0.55, s[2] * 0.7]} c="#111" hl={false} />
    </>
  );
}

function Pcb({ L, W, y, c, t = 1.6 }: { L: number; W: number; y: number; c: string; t?: number }) {
  return <B p={[0, y + t / 2, 0]} s={[L, t, W]} c={c} rough={0.6} />;
}

function Holes({ L, W, y, inset = 3.5, r = 1.6 }: { L: number; W: number; y: number; inset?: number; r?: number }) {
  return (
    <>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} p={[sx * (L / 2 - inset), y, sz * (W / 2 - inset)]} rad={r} len={1.8} c="#0d0d0d" seg={10} hl={false} />))}
    </>
  );
}

// ───────────────────────────── motor drivers ─────────────────────────────

function L298N({ L, W, H }: Dims) {
  const y0 = -H / 2,
    yt = y0 + 1.6;
  const hsD = Math.min(16, L * 0.37),
    hsW = Math.min(23, W * 0.55),
    hsH = H - 1.6 - 0.5;
  const hsX = -L / 2 + hsD / 2 + 2;
  const fins = useMemo(() => {
    const items: BoxItem[] = [{ p: [hsX + hsD / 2 - 1.5, yt + hsH / 2, 0], s: [3, hsH, hsW] }];
    const n = 7;
    for (let i = 0; i < n; i++) items.push({ p: [hsX - 1.5, yt + hsH / 2, (i - (n - 1) / 2) * (hsW / (n - 1)) * 0.94], s: [hsD - 3, hsH, 1.4] });
    return mergeBoxes(items);
  }, [hsX, hsD, hsW, hsH, yt]);
  return (
    <>
      <Pcb L={L} W={W} y={y0} c={COL.pcbRed} />
      <Holes L={L} W={W} y={y0 + 0.8} />
      {/* big black finned heatsink with the L298 Multiwatt package bolted to it */}
      <G geo={fins} c="#16181c" metal={0.5} rough={0.5} />
      <B p={[hsX + hsD / 2 + 1.5, yt + hsH * 0.42, 0]} s={[2.6, hsH * 0.75, hsW * 0.8]} c={COL.chip} rough={0.5} />
      {/* motor outputs (2-way, each side) and power input (3-way: 12V, GND, 5V) */}
      {[-1, 1].map((s) => <Terminal key={s} p={[hsX + 1, yt, s * (W / 2 - 3.75)]} n={2} ax="x" />)}
      <Terminal p={[L / 2 - 3.75, yt, W * 0.2]} n={3} ax="z" />
      {/* logic header ENA IN1..IN4 ENB with jumper caps on ENA/ENB */}
      <MaleHeader p={[L / 2 - 2, yt, -W * 0.2]} n={6} ax="z" />
      {[-1, 1].map((s) => <B key={s} p={[L / 2 - 2, yt + 6, -W * 0.2 + s * 6.35]} s={[2.6, 5, 2.6]} c="#111" hl={false} />)}
      <ECap p={[L * 0.12, yt, W * 0.22]} r={3.2} h={8} />
      <ECap p={[L * 0.12, yt, -W * 0.22]} r={3.2} h={8} />
      <Chip p={[L * 0.12, yt, 0]} s={[6.5, 2.3, 6]} />
      <B p={[L * 0.3, yt + 0.6, -W * 0.38]} s={[1.6, 1.2, 0.8]} c="#ff3b30" hl={false} />
    </>
  );
}

/** DIP-16 chip of the given body size (legs merged). */
function Dip({ L, W, H, p = [0, 0, 0], n = 16 }: { L: number; W: number; H: number; p?: V3; n?: number }) {
  const per = n / 2;
  const legH = H * 0.42,
    bodyH = H - legH;
  const [px, py, pz] = p;
  const legs = useMemo(() => {
    const items: BoxItem[] = [];
    for (let i = 0; i < per; i++)
      for (const s of [-1, 1]) {
        const x = px + (i - (per - 1) / 2) * 2.54;
        items.push({ p: [x, py - H / 2 + legH / 2, pz + s * (W / 2 - 0.3)], s: [0.5, legH, 0.3] });
        items.push({ p: [x, py - H / 2 + legH + 0.2, pz + s * (W / 2 - 0.6)], s: [1.2, 0.4, 0.9] });
      }
    return mergeBoxes(items);
  }, [per, px, py, pz, H, W, legH]);
  return (
    <>
      <B p={[p[0], p[1] - H / 2 + legH + bodyH / 2, p[2]]} s={[L, bodyH, W * 0.86]} c={COL.chip} rough={0.55} />
      <Cyl p={[p[0] - L / 2 + 0.7, p[1] + H / 2 - 0.02, p[2]]} rad={Math.min(0.9, W * 0.15)} len={0.06} c="#3b3b3b" seg={12} hl={false} />
      <G geo={legs} c={COL.silver} metal={0.85} rough={0.3} hl={false} />
    </>
  );
}

function L293DShield({ L, W, H }: Dims) {
  const y0 = -H / 2 + Math.min(4, H * 0.2),
    yt = y0 + 1.6;
  const pinsDown = useMemo(() => [...pinRow([0, y0, W / 2 - 1.5], Math.max(4, Math.floor((L * 0.8) / 2.54)), "x", Math.min(4, H * 0.2), -1), ...pinRow([0, y0, -W / 2 + 1.5], Math.max(4, Math.floor((L * 0.6) / 2.54)), "x", Math.min(4, H * 0.2), -1)], [L, W, H, y0]);
  const chipH = 4;
  const chipL = Math.min(20, W * 0.5);
  return (
    <>
      <Pcb L={L} W={W} y={y0} c="#1f4e96" />
      <Pins items={pinsDown} />
      {/* two L293D drivers and the 74HC595 shift register (DIP-16, across the board) */}
      {[-1, 0, 1].map((s) => (
        <group key={s} position={[s * L * 0.2, yt + chipH / 2, W * 0.05]} rotation={[0, Math.PI / 2, 0]}>
          <Dip L={chipL} W={7} H={chipH} />
        </group>
      ))}
      {/* M1/M2 and M3/M4 outputs on the long edge, external power at one end */}
      {[-1, 1].map((s) => <Terminal key={s} p={[s * L * 0.3, yt, -W / 2 + 4]} n={Math.max(2, Math.min(5, Math.floor((L * 0.35) / 5)))} ax="x" h={Math.min(10, H * 0.5)} />)}
      <Terminal p={[-L / 2 + 4, yt, W * 0.25]} n={2} ax="z" h={Math.min(10, H * 0.5)} />
      {/* servo headers, reset button, bulk capacitor */}
      <MaleHeader p={[L / 2 - 3, yt, W * 0.3]} n={3} ax="z" len={Math.min(6, H * 0.3)} />
      <MaleHeader p={[L / 2 - 5.5, yt, W * 0.3]} n={3} ax="z" len={Math.min(6, H * 0.3)} />
      <B p={[-L * 0.38, yt + 1, -W * 0.05]} s={[6, 2, 6]} c={COL.silver} metal={0.8} hl={false} />
      <Cyl p={[-L * 0.38, yt + 2.3, -W * 0.05]} rad={1.7} len={1} c="#111" seg={10} hl={false} />
      <ECap p={[L * 0.38, yt, -W * 0.05]} r={Math.min(4, W * 0.08)} h={Math.min(10, H * 0.5)} />
    </>
  );
}

/** Pololu-style carrier: purple PCB, header holes along both long edges, chip in the middle. */
function Carrier({ L, W, H, color, chip, rows = 2 }: Dims & { color: string; chip: V3; rows?: number }) {
  const y0 = -H / 2,
    yt = y0 + Math.min(1.6, H * 0.5);
  const n = Math.max(2, Math.floor((L - 1) / 2.54) + 1);
  const pads = useMemo(() => {
    const items: BoxItem[] = [];
    for (const s of rows === 2 ? [-1, 1] : [-1])
      for (let i = 0; i < n; i++) items.push({ p: [(i - (n - 1) / 2) * 2.54, yt + 0.01, s * (W / 2 - 1.3)], s: [1.6, 0.04, 1.6] });
    return mergeBoxes(items);
  }, [n, yt, W, rows]);
  return (
    <>
      <Pcb L={L} W={W} y={y0} c={color} t={Math.min(1.6, H * 0.5)} />
      <G geo={pads} c={COL.gold} metal={0.85} rough={0.3} hl={false} />
      <Chip p={[0, yt, 0]} s={chip} />
      {[-1, 1].map((s) => <B key={s} p={[s * L * 0.3, yt + 0.4, W * 0.08]} s={[1.6, 0.8, 0.8]} c="#c9b48a" hl={false} />)}
      <B p={[L * 0.3, yt + 0.4, -W * 0.12]} s={[1.6, 0.8, 0.8]} c="#7a5a3a" hl={false} />
    </>
  );
}

function MX1508({ L, W, H }: Dims) {
  const pinLen = Math.max(1, H - 1.6 - 1.6);
  const y0 = -H / 2 + pinLen,
    yt = y0 + 1.6;
  const pins = useMemo(() => [...pinRow([-L / 2 + 1.5, y0, 0], 6, "z", pinLen, -1), ...pinRow([L / 2 - 1.5, y0, 0], 4, "z", pinLen, -1)], [L, y0, pinLen]);
  return (
    <>
      <Pcb L={L} W={W} y={y0} c="#c0272d" />
      <Pins items={pins} />
      <Chip p={[0, yt, 0]} s={[10, 1.5, 6]} />
      {[-1, 1].map((s) => <B key={s} p={[L * 0.25, yt + 0.5, s * W * 0.3]} s={[2, 1, 1.2]} c="#c9b48a" hl={false} />)}
      <B p={[-L * 0.25, yt + 0.4, W * 0.35]} s={[1.6, 0.8, 0.8]} c="#ff3b30" hl={false} />
    </>
  );
}

function BTS7960({ L, W, H }: Dims) {
  const y0 = -H / 2;
  const hf = H * 0.42;
  const base = 4;
  const yPcb = y0 + hf + base + 3;
  const yt = yPcb + 1.6;
  const sink = useMemo(() => {
    const items: BoxItem[] = [{ p: [0, y0 + hf + base / 2, 0], s: [L, base, W] }];
    const n = 9;
    for (let i = 0; i < n; i++) items.push({ p: [0, y0 + hf / 2, (i - (n - 1) / 2) * ((W - 1.6) / (n - 1))], s: [L, hf, 1.6] });
    return mergeBoxes(items);
  }, [L, W, y0, hf]);
  return (
    <>
      <G geo={sink} c="#c4cad0" metal={0.75} rough={0.35} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} p={[sx * (L / 2 - 4), yPcb - 1.5, sz * (W / 2 - 4)]} rad={1.6} len={3} c={COL.brass} metal={0.9} seg={8} hl={false} />))}
      <Pcb L={L * 0.96} W={W * 0.96} y={yPcb} c={COL.pcbRed} />
      {/* B+ B− M+ M− power terminal and the 8-pin logic header */}
      <Terminal p={[L / 2 - 6, yt, 0]} n={4} ax="z" h={Math.min(12, H - (yt - y0) - 1)} depth={9} />
      <MaleHeader p={[-L / 2 + 3, yt, 0]} n={8} ax="z" len={Math.min(6, H - (yt - y0) - 3)} />
      <Chip p={[-L * 0.12, yt, 0]} s={[12.8, 1.6, 7.5]} />
      {[-1, 1].map((s) => <ECap key={s} p={[L * 0.12, yt, s * W * 0.28]} r={4} h={Math.min(11, H - (yt - y0) - 0.5)} />)}
    </>
  );
}

function GenericDriver({ L, W, H, small }: Dims & { small: boolean }) {
  const y0 = -H / 2,
    yt = y0 + Math.min(1.6, H * 0.4);
  return (
    <>
      <Pcb L={L} W={W} y={y0} c="#2d5a7b" t={Math.min(1.6, H * 0.4)} />
      <Chip p={[0, yt, 0]} s={[Math.min(10, L * 0.3), Math.min(1.5, H * 0.3), Math.min(8, W * 0.35)]} />
      {!small && [-1, 1].map((s) => <Terminal key={s} p={[s * (L / 2 - 4), yt, 0]} n={2} ax="z" h={Math.min(10, H - 2)} />)}
    </>
  );
}

// ───────────────────────────── controllers ─────────────────────────────

/** Uno / Uno R4 / Leonardo form factor (68.6 × 53.3 mm). u, v = position on the real board in mm. */
function Uno({ L, W, H, variant }: Dims & { variant: "r3" | "r4" | "leo" }) {
  const y0 = -H / 2 + 1.4,
    yt = y0 + 1.6;
  const ku = L / 68.6,
    kv = W / 53.3;
  const at = (u: number, v: number): [number, number] => [-L / 2 + u * ku, -W / 2 + v * kv];
  const hh = Math.min(8.5, H - (yt + H / 2) - 0.2);
  const usb = variant === "r3" ? "b" : variant === "r4" ? "c" : "micro";
  const [ux, uz] = at(0, 38.1);
  const [jx, jz] = at(0, 7.6);
  return (
    <>
      <Pcb L={L} W={W} y={y0} c={COL.pcbTeal} />
      <Holes L={L} W={W} y={y0 + 0.8} inset={3} r={1.6} />
      <Usb x0={ux} y={yt} z={uz} kind={usb} />
      {/* DC barrel jack */}
      <B p={[jx + 7, yt + Math.min(11, H - 3) / 2, jz]} s={[14, Math.min(11, H - 3), 9]} c="#141414" rough={0.6} />
      <Cyl p={[jx - 0.01, yt + Math.min(11, H - 3) / 2, jz]} rad={3.2} len={0.2} ax="x" c="#000" seg={14} hl={false} />
      {/* female headers: digital (top edge), power + analog (bottom edge) */}
      {(
        [
          [30.2, 51.8, 10],
          [54.6, 51.8, 8],
          [36.6, 1.5, 8],
          [56.9, 1.5, 6],
        ] as const
      ).map(([u, v, n]) => {
        const [x, z] = at(u, v);
        return <FemaleHeader key={`${u}${v}`} p={[x, yt, z]} n={n} h={hh} />;
      })}
      {variant === "r3" ? (
        <>
          {/* ATmega328P in its DIP-28 socket */}
          <B p={[at(47, 14)[0], yt + 0.75, at(47, 14)[1]]} s={[37 * ku, 1.5, 10 * kv]} c="#2a2a2a" rough={0.7} />
          <Chip p={[at(47, 14)[0], yt + 1.5, at(47, 14)[1]]} s={[35.6 * ku, 3.4, 7.5 * kv]} />
          <B p={[at(30, 30)[0], yt + 1.75, at(30, 30)[1]]} s={[10 * ku, 3.5, 4 * kv]} c={COL.silver} metal={0.85} rough={0.3} hl={false} />
          <Chip p={[at(19, 38)[0], yt, at(19, 38)[1]]} s={[5 * ku, 1, 5 * kv]} rot={[0, Math.PI / 4, 0]} />
        </>
      ) : (
        <Chip p={[at(42, 26)[0], yt, at(42, 26)[1]]} s={[8 * ku, 1.2, 8 * kv]} rot={[0, Math.PI / 4, 0]} />
      )}
      {/* ICSP header, reset button, regulator + caps near the jack */}
      <MaleHeader p={[at(64, 27)[0], yt, at(64, 27)[1]]} n={3} ax="z" len={Math.min(6, hh - 2.5)} />
      <MaleHeader p={[at(66.5, 27)[0], yt, at(66.5, 27)[1]]} n={3} ax="z" len={Math.min(6, hh - 2.5)} />
      <B p={[at(6, 49)[0], yt + 1.5, at(6, 49)[1]]} s={[6 * ku, 3, 6 * kv]} c={COL.silver} metal={0.8} hl={false} />
      <Cyl p={[at(6, 49)[0], yt + 3.2, at(6, 49)[1]]} rad={1.6} len={0.6} c="#8b1a1a" seg={10} hl={false} />
      <Chip p={[at(18, 8)[0], yt, at(18, 8)[1]]} s={[6.5, 2.3, 6]} />
      {[13, 22].map((v) => <ECap key={v} p={[at(23, v)[0], yt, at(23, v)[1]]} r={3 * Math.min(ku, kv)} h={Math.min(7, hh)} />)}
    </>
  );
}

function Mega({ L, W, H }: Dims) {
  const y0 = -H / 2 + 1.4,
    yt = y0 + 1.6;
  const ku = L / 101.5,
    kv = W / 53.3;
  const at = (u: number, v: number): [number, number] => [-L / 2 + u * ku, -W / 2 + v * kv];
  const hh = Math.min(8.5, H - (yt + H / 2) - 0.2);
  const [ux, uz] = at(0, 38.1);
  const [jx, jz] = at(0, 7.6);
  return (
    <>
      <Pcb L={L} W={W} y={y0} c={COL.pcbTeal} />
      <Holes L={L} W={W} y={y0 + 0.8} inset={3} r={1.6} />
      <Usb x0={ux} y={yt} z={uz} kind="b" />
      <B p={[jx + 7, yt + Math.min(11, H - 3) / 2, jz]} s={[14, Math.min(11, H - 3), 9]} c="#141414" rough={0.6} />
      {(
        [
          [30.2, 51.8, 10],
          [54.6, 51.8, 8],
          [75, 51.8, 8],
          [36.6, 1.5, 8],
          [56.9, 1.5, 8],
          [77.2, 1.5, 8],
        ] as const
      ).map(([u, v, n]) => {
        const [x, z] = at(u, v);
        return <FemaleHeader key={`${u}${v}`} p={[x, yt, z]} n={n} h={hh} />;
      })}
      {/* the 2 × 18 double header at the far end */}
      {[0, 2.54].map((o) => <FemaleHeader key={o} p={[at(96.5 + o, 26.6)[0], yt, at(96.5, 26.6)[1]]} n={18} ax="z" h={hh} />)}
      <Chip p={[at(58, 27)[0], yt, at(58, 27)[1]]} s={[14 * ku, 1.4, 14 * kv]} rot={[0, Math.PI / 4, 0]} />
      <Chip p={[at(19, 38)[0], yt, at(19, 38)[1]]} s={[5 * ku, 1, 5 * kv]} rot={[0, Math.PI / 4, 0]} />
      <B p={[at(38, 30)[0], yt + 1.75, at(38, 30)[1]]} s={[10 * ku, 3.5, 4 * kv]} c={COL.silver} metal={0.85} rough={0.3} hl={false} />
      <MaleHeader p={[at(88, 27)[0], yt, at(88, 27)[1]]} n={3} ax="z" len={Math.min(6, hh - 2.5)} />
      <Chip p={[at(18, 8)[0], yt, at(18, 8)[1]]} s={[6.5, 2.3, 6]} />
    </>
  );
}

/** Nano-size boards: pins underneath, small USB at the −x end. */
function Nano({ L, W, H, usb, color }: Dims & { usb: UsbKind | null; color: string }) {
  const usbH = usb ? USB_SIZE[usb][1] : 1;
  const pinLen = Math.max(1, H - 1.6 - usbH);
  const y0 = -H / 2 + pinLen,
    yt = y0 + 1.6;
  const n = Math.max(4, Math.min(15, Math.floor((L - 4) / 2.54)));
  const rowZ = Math.min(7.62, W / 2 - 1.3);
  return (
    <>
      <Pcb L={L} W={W} y={y0} c={color} />
      {[-1, 1].map((s) => <MaleHeader key={s} p={[L * 0.02, y0, s * rowZ]} n={n} up={false} len={pinLen} />)}
      {usb && <Usb x0={-L / 2} y={yt} z={0} kind={usb} />}
      <Chip p={[L * 0.12, yt, 0]} s={[7, 1, 7]} rot={[0, Math.PI / 4, 0]} />
      <B p={[-L * 0.08, yt + 0.6, 0]} s={[3, 1.2, 5]} c={COL.silver} metal={0.8} hl={false} />
      {[0, 1, 2, 3].map((i) => <B key={i} p={[-L * 0.2, yt + 0.3, (i - 1.5) * 2]} s={[1.2, 0.6, 0.8]} c={i === 0 ? "#2ecc71" : "#f39c12"} hl={false} />)}
      <B p={[L / 2 - 3, yt + 0.02, 0]} s={[4.5, 0.04, 7]} c={COL.gold} metal={0.85} hl={false} />
    </>
  );
}

/** ESP32 DevKit (V1 / S3): black board, WROOM module with RF shield can and PCB antenna, pins underneath. */
function Esp32({ L, W, H, s3 }: Dims & { s3: boolean }) {
  const top = 3.6;
  const pinLen = Math.max(1, H - 1.6 - top);
  const y0 = -H / 2 + pinLen,
    yt = y0 + 1.6;
  const n = Math.max(4, Math.min(s3 ? 22 : 15, Math.floor((L - 4) / 2.54)));
  const rowZ = W / 2 - 1.5;
  const modL = Math.min(25.5, L * 0.5),
    modW = Math.min(18, W * 0.68);
  const mx = L / 2 - modL / 2;
  const antL = Math.min(6, modL * 0.25);
  const ant = useMemo(() => {
    const items: BoxItem[] = [];
    const ax = mx + modL / 2 - antL / 2;
    for (let i = 0; i < 4; i++) items.push({ p: [ax - antL / 2 + 0.6 + i * (antL / 4), yt + 0.82, 0], s: [0.3, 0.04, modW * 0.75] });
    items.push({ p: [ax, yt + 0.82, modW * 0.37], s: [antL, 0.04, 0.3] });
    return mergeBoxes(items);
  }, [mx, modL, modW, antL, yt]);
  return (
    <>
      <Pcb L={L} W={W} y={y0} c={COL.pcbBlack} />
      {[-1, 1].map((s) => <MaleHeader key={s} p={[-L * 0.02, y0, s * rowZ]} n={n} up={false} len={pinLen} />)}
      {/* module PCB, shield can, antenna trace */}
      <B p={[mx, yt + 0.4, 0]} s={[modL, 0.8, modW]} c="#1b2333" rough={0.6} />
      <B p={[mx - antL / 2, yt + 0.8 + 1.2, 0]} s={[modL - antL - 1, 2.4, modW - 1.5]} c={COL.silver} metal={0.85} rough={0.3} />
      <G geo={ant} c={COL.gold} metal={0.8} rough={0.3} hl={false} />
      {/* USB (micro on V1, two USB-C on S3), EN/BOOT buttons, USB-UART chip, regulator */}
      {s3 ? [-1, 1].map((s) => <Usb key={s} x0={-L / 2} y={yt} z={s * W * 0.22} kind="c" />) : <Usb x0={-L / 2} y={yt} z={0} kind="micro" />}
      {[-1, 1].map((s) => (
        <group key={s}>
          <B p={[-L / 2 + 4, yt + 0.8, s * W * (s3 ? 0.42 : 0.3)]} s={[3.5, 1.6, 3]} c={COL.silver} metal={0.8} hl={false} />
          <B p={[-L / 2 + 4, yt + 1.8, s * W * (s3 ? 0.42 : 0.3)]} s={[1.6, 0.6, 1.6]} c="#111" hl={false} />
        </group>
      ))}
      <Chip p={[-L * 0.18, yt, -W * 0.15]} s={[5, 0.9, 5]} />
      <Chip p={[-L * 0.18, yt, W * 0.2]} s={[6.5, 1.6, 3.5]} />
      {s3 && <B p={[-L * 0.05, yt + 0.5, 0]} s={[2, 1, 2]} c="#f4f4f4" hl={false} />}
      <B p={[-L * 0.05, yt + 0.3, W * 0.32]} s={[1.2, 0.6, 0.8]} c="#ff3b30" hl={false} />
    </>
  );
}

function Pico({ L, W, H, wireless }: Dims & { wireless: boolean }) {
  const y0 = -H / 2 + Math.max(0, H - 1 - 2.8) / 2,
    yt = y0 + 1;
  const castell = useMemo(() => {
    const items: BoxItem[] = [];
    const n = 20;
    for (const s of [-1, 1]) for (let i = 0; i < n; i++) items.push({ p: [(i - (n - 1) / 2) * 2.54, y0 + 0.5, s * (W / 2 - 0.9)], s: [1.5, 1.04, 1.8] });
    return mergeBoxes(items);
  }, [y0, W]);
  return (
    <>
      <Pcb L={L} W={W} y={y0} c="#1e7b3c" t={1} />
      <G geo={castell} c={COL.gold} metal={0.85} rough={0.3} hl={false} />
      <Usb x0={-L / 2 - 1.3} y={yt} z={0} kind="micro" />
      <Chip p={[L * 0.02, yt, 0]} s={[7, 0.9, 7]} />
      <Chip p={[-L * 0.17, yt, 0]} s={[4, 0.9, 5]} />
      {/* BOOTSEL button */}
      <B p={[-L * 0.3, yt + 0.8, -W * 0.18]} s={[3.6, 1.6, 3.6]} c={COL.silver} metal={0.7} hl={false} />
      <Cyl p={[-L * 0.3, yt + 1.9, -W * 0.18]} rad={1.1} len={0.8} c={COL.white} seg={10} hl={false} />
      <B p={[-L * 0.32, yt + 0.3, W * 0.22]} s={[1.2, 0.6, 0.8]} c="#2ecc71" hl={false} />
      {/* SWD debug pads */}
      {[-1, 0, 1].map((i) => <B key={i} p={[L / 2 - 1.2, yt + 0.02, i * 2.54]} s={[1.4, 0.04, 1.4]} c={COL.gold} metal={0.85} hl={false} />)}
      {wireless && <B p={[L * 0.27, yt + 0.6, 0]} s={[10, 1.2, 10]} c={COL.silver} metal={0.85} rough={0.3} />}
      {wireless && <B p={[L / 2 - 4.5, yt + 0.02, 0]} s={[5, 0.04, W * 0.6]} c="#2f8f4a" hl={false} />}
    </>
  );
}

function GenericController({ L, W, H, color }: Dims & { color: string }) {
  const y0 = -H / 2 + Math.min(3, H * 0.3),
    yt = y0 + Math.min(1.6, H * 0.3);
  return (
    <>
      <Pcb L={L} W={W} y={y0} c={color} t={Math.min(1.6, H * 0.3)} />
      <Chip p={[0, yt, 0]} s={[Math.min(8, L * 0.4), Math.min(1.2, H * 0.2), Math.min(8, W * 0.4)]} />
      {W > 8 && L > 12 && [-1, 1].map((s) => <B key={s} p={[0, y0 - Math.min(3, H * 0.3) / 2, s * (W / 2 - 1.3)]} s={[L * 0.85, Math.min(3, H * 0.3), 2.54]} c={COL.header} hl={false} />)}
    </>
  );
}

// ───────────────────────────── dispatch ─────────────────────────────

interface Dims {
  L: number;
  W: number;
  H: number;
}

export function DriverModel({ d, info }: ModelProps) {
  const p = { L: d.x, W: d.y, H: d.z };
  const body = (() => {
    switch (info.key) {
      case "l298n":
        return <L298N {...p} />;
      case "l293d":
        return <Dip {...p} />;
      case "l293d-shield":
        return <L293DShield {...p} />;
      case "tb6612":
        return <Carrier {...p} color={COL.pcbPurple} chip={[7.8, Math.min(1, p.H * 0.3), 5.3]} />;
      case "drv8833":
        return <Carrier {...p} color={COL.pcbPurple} chip={[5, Math.min(1, p.H * 0.3), 4.4]} />;
      case "mx1508":
        return <MX1508 {...p} />;
      case "bts7960":
        return <BTS7960 {...p} />;
      case "driver-carrier":
        return <GenericDriver {...p} small />;
      default:
        return <GenericDriver {...p} small={p.L < 30} />;
    }
  })();
  return <Mm>{body}</Mm>;
}

export function ControllerModel({ comp, d, info }: ModelProps) {
  const p = { L: d.x, W: d.y, H: d.z };
  const id = comp.id;
  const body = (() => {
    switch (info.key) {
      case "uno":
        return <Uno {...p} variant={/r4/.test(id) ? "r4" : /leonardo/.test(id) ? "leo" : "r3"} />;
      case "mega":
        return <Mega {...p} />;
      case "nano":
        return <Nano {...p} usb={/pro-mini/.test(id) ? null : /every|micro/.test(id) ? "micro" : "mini"} color={/pro-mini/.test(id) ? "#1d4f9c" : "#0f6f9c"} />;
      case "esp32":
        return <Esp32 {...p} s3={false} />;
      case "esp32s3":
        return <Esp32 {...p} s3 />;
      case "pico":
        return <Pico {...p} wireless={/pico-w/.test(id)} />;
      default:
        return <GenericController {...p} color={/blue-pill/.test(id) ? "#1d4f9c" : /teensy/.test(id) ? "#1f6f3a" : "#2e3a46"} />;
    }
  })();
  return <Mm>{body}</Mm>;
}
