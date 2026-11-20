"use client";
/**
 * Sensor models. Local axes: x = dims.x (distance sensors face +x — partDims already swaps their board so the
 * long side runs across), z = dims.y (across), y = up (dims.z). Down-facing reflectance sensors put their
 * optics under the board.
 */
import { useMemo } from "react";
import { B, COL, Cyl, G, Mm, Sph, type BoxItem, mergeBoxes } from "./prims";
import type { ModelProps } from "./types";

interface Dims {
  L: number;
  W: number;
  H: number;
}

/** Horizontal right-angle header pins leaving the −x edge (n pins along z). */
function SidePins({ x, y, n }: { x: number; y: number; n: number }) {
  const geo = useMemo(() => mergeBoxes(Array.from({ length: n }, (_, i) => ({ p: [x - 2, y, (i - (n - 1) / 2) * 2.54] as [number, number, number], s: [4, 0.64, 0.64] as [number, number, number] }))), [x, y, n]);
  return (
    <>
      <B p={[x + 1.25, y, 0]} s={[2.5, 2.5, n * 2.54]} c={COL.header} rough={0.7} />
      <G geo={geo} c={COL.gold} metal={0.85} rough={0.3} hl={false} />
    </>
  );
}

/** Blue multi-turn/trimmer potentiometer with its adjustment screw. */
function Trimmer({ x, y, z = 0, h }: { x: number; y: number; z?: number; h: number }) {
  const s = Math.min(6.5, h * 1.6);
  return (
    <>
      <B p={[x, y + h / 2, z]} s={[s, h, s]} c="#2a5fd8" rough={0.5} />
      <Cyl p={[x, y + h + 0.15, z]} rad={s * 0.28} len={0.3} c={COL.silver} metal={0.8} seg={12} hl={false} />
      <B p={[x, y + h + 0.32, z]} s={[s * 0.45, 0.05, 0.5]} c="#333" hl={false} />
    </>
  );
}

function Ultrasonic({ L, W, H }: Dims) {
  const pinLen = 2.5;
  const bx = -L / 2 + pinLen + 0.8; // board centre (board faces +x)
  const rT = Math.min(8, H * 0.5, W * 0.18);
  const tl = Math.max(4, Math.min(12, L - pinLen - 1.6 - 0.5));
  const x0 = bx + 0.8;
  return (
    <>
      <B p={[bx, 0, 0]} s={[1.6, H, W]} c="#1c5fa8" rough={0.55} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Cyl p={[x0 + tl / 2, 0, s * W * 0.28]} rad={rT} len={tl} ax="x" c="#c7ccd2" metal={0.8} rough={0.3} seg={24} />
          <Cyl p={[x0 + tl + 0.05, 0, s * W * 0.28]} rad={rT * 0.8} len={0.1} ax="x" c="#2a2c30" rough={0.9} seg={24} hl={false} />
        </group>
      ))}
      {/* 40 kHz crystal between the transducers */}
      <B p={[x0 + 1.8, H * 0.28, 0]} s={[3.6, Math.min(4.5, H * 0.3), Math.min(11, W * 0.24)]} c={COL.silver} metal={0.85} rough={0.3} hl={false} />
      {/* VCC TRIG ECHO GND */}
      <B p={[bx - 0.8 - 1.25, -H / 2 + 1.5, 0]} s={[2.5, 2.5, 4 * 2.54]} c={COL.header} rough={0.7} />
      <SidePinsBack x={bx - 0.8} y={-H / 2 + 1.5} n={4} len={pinLen} />
    </>
  );
}

function SidePinsBack({ x, y, n, len }: { x: number; y: number; n: number; len: number }) {
  const geo = useMemo(() => mergeBoxes(Array.from({ length: n }, (_, i) => ({ p: [x - len / 2, y, (i - (n - 1) / 2) * 2.54] as [number, number, number], s: [len, 0.64, 0.64] as [number, number, number] }))), [x, y, n, len]);
  return <G geo={geo} c={COL.gold} metal={0.85} rough={0.3} hl={false} />;
}

/** Sharp GP2Y IR distance sensor: black housing with two lenses facing +x and side mounting tabs. */
function Sharp({ L, W, H }: Dims) {
  const bodyW = W * 0.66;
  const lr = Math.min(H * 0.33, bodyW * 0.2);
  return (
    <>
      <B p={[0, 0, 0]} s={[L * 0.86, H, bodyW]} c="#1a1a1c" rough={0.45} />
      <B p={[-L / 2 + 1.2, -H * 0.05, 0]} s={[2.4, H * 0.82, W]} c="#1a1a1c" rough={0.45} />
      {[-1, 1].map((s) => <Cyl key={s} p={[-L / 2 + 1.2, -H * 0.05, s * (W / 2 - 3.6)]} rad={1.6} len={2.6} ax="x" c="#050505" seg={10} hl={false} />)}
      {/* emitter + detector lenses */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <B p={[L * 0.43 + 0.4, 0, s * bodyW * 0.24]} s={[0.8, lr * 2.2, lr * 2.2]} c="#101012" rough={0.4} />
          <Cyl p={[L * 0.43 + 1, 0, s * bodyW * 0.24]} rad={lr} len={1.2} ax="x" c={s < 0 ? "#3a1d24" : "#22181c"} metal={0.3} rough={0.12} seg={20} hl={false} />
        </group>
      ))}
      <B p={[-L * 0.15, -H / 2 + 1.8, 0]} s={[5, 3.6, 8]} c={COL.white} rough={0.6} hl={false} />
    </>
  );
}

/** ToF breakout (VL53L0X style): small purple board standing at the front, sensor package facing +x. */
function Tof({ L, W, H }: Dims) {
  const bx = L / 2 - 0.8;
  return (
    <>
      <B p={[bx, 0, 0]} s={[1.6, H, W]} c={COL.pcbPurple} rough={0.55} />
      <B p={[bx + 1.3, H * 0.15, 0]} s={[1, Math.min(2.4, H * 0.3), Math.min(4.4, W * 0.3)]} c={COL.chip} rough={0.4} />
      {[-1, 1].map((s) => <Cyl key={s} p={[bx + 1.85, H * 0.15, s * Math.min(1, W * 0.06)]} rad={0.35} len={0.1} ax="x" c="#4a3a5a" rough={0.1} seg={8} hl={false} />)}
      <B p={[bx + 1, -H * 0.2, W * 0.25]} s={[0.6, 1.2, 2]} c="#222" hl={false} />
      <SidePinsBack x={bx - 0.8} y={-H / 2 + 1.5} n={Math.max(2, Math.min(6, Math.floor(W / 2.54) - 1))} len={2.5} />
    </>
  );
}

/** IR line (TCRT5000, facing down) or obstacle (two 5 mm LEDs facing +x) module with a blue trimmer. */
function IrModule({ L, W, H, obstacle }: Dims & { obstacle: boolean }) {
  const sh = obstacle ? 0 : H * 0.45;
  const y0 = -H / 2 + sh,
    yt = y0 + 1.6;
  const ph = Math.max(1, Math.min(4.5, H / 2 - yt));
  return (
    <>
      <B p={[0, y0 + 0.8, 0]} s={[L, 1.6, W]} c="#1f4fa0" rough={0.55} />
      {obstacle ? (
        [-1, 1].map((s) => (
          <group key={s}>
            <Cyl p={[L / 2 - 4, yt + 2.5, s * 2.8]} rad={2.5} len={6} ax="x" c={s < 0 ? "#dfeefc" : "#141414"} rough={0.15} opacity={s < 0 ? 0.85 : undefined} seg={14} />
            <Sph p={[L / 2 - 1, yt + 2.5, s * 2.8]} rad={2.5} c={s < 0 ? "#dfeefc" : "#141414"} rough={0.15} seg={12} />
          </group>
        ))
      ) : (
        <>
          {/* TCRT5000: blue IR emitter + black phototransistor, looking down */}
          <B p={[L / 2 - 3.6, -H / 2 + sh / 2, -Math.min(2.6, W * 0.18)]} s={[5.8, sh, Math.min(5, W * 0.35)]} c="#2b55c8" rough={0.3} />
          <B p={[L / 2 - 3.6, -H / 2 + sh / 2, Math.min(2.6, W * 0.18)]} s={[5.8, sh, Math.min(5, W * 0.35)]} c="#121212" rough={0.3} />
        </>
      )}
      <Trimmer x={obstacle ? -L * 0.05 : 0} y={yt} z={0} h={ph} />
      <B p={[-L * 0.22, yt + 0.75, 0]} s={[5, 1.5, Math.min(4, W * 0.3)]} c={COL.chip} rough={0.5} />
      {[-1, 1].map((s) => <B key={s} p={[-L * 0.08, yt + 0.3, s * W * 0.35]} s={[1.6, 0.6, 0.8]} c={s < 0 ? "#ff3b30" : "#2ecc71"} hl={false} />)}
      <SidePins x={-L / 2} y={yt + 1.25} n={Math.max(3, Math.min(4, Math.floor(W / 2.54) - 1))} />
    </>
  );
}

/** Reflectance array: channel count and pitch from the catalogue, optics under the board. */
function ReflectanceArray({ L, W, H, n, pitch, pololu }: Dims & { n: number; pitch: number; pololu: boolean }) {
  const p = Math.min(pitch, (L * 0.92) / Math.max(1, n));
  const t = Math.min(1.6, H * 0.5);
  const sh = Math.max(0.6, Math.min(H - t - 0.4, pololu ? 1.6 : 7));
  const y0 = -H / 2 + sh;
  const geos = useMemo(() => {
    const a: BoxItem[] = [],
      b: BoxItem[] = [],
      leds: BoxItem[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * p;
      if (pololu) a.push({ p: [x, -H / 2 + sh / 2, 0], s: [Math.min(2.9, p * 0.8), sh, Math.min(3.6, W * 0.5)] });
      else {
        const hw = Math.min(5, W * 0.3, p * 0.45);
        a.push({ p: [x, -H / 2 + sh / 2, -hw / 2], s: [Math.min(5.8, p * 0.8), sh, hw] });
        b.push({ p: [x, -H / 2 + sh / 2, hw / 2], s: [Math.min(5.8, p * 0.8), sh, hw] });
      }
      leds.push({ p: [x, y0 + t + 0.25, W * 0.3], s: [Math.min(1.6, p * 0.5), 0.5, 0.8] });
    }
    return { a: mergeBoxes(a), b: b.length ? mergeBoxes(b) : null, leds: mergeBoxes(leds) };
  }, [n, p, H, W, sh, t, y0, pololu]);
  const pads = useMemo(() => {
    const k = Math.min(n + 2, Math.floor((L - 2) / 2.54));
    return mergeBoxes(Array.from({ length: k }, (_, i) => ({ p: [(i - (k - 1) / 2) * 2.54, y0 + t + 0.01, -W / 2 + 1.4] as [number, number, number], s: [1.5, 0.04, 1.5] as [number, number, number] })));
  }, [n, L, W, y0, t]);
  return (
    <>
      <B p={[0, y0 + t / 2, 0]} s={[L, t, W]} c={pololu ? "#2a2c6a" : COL.pcbBlack} rough={0.55} />
      <G geo={geos.a} c={pololu ? "#151515" : "#2b55c8"} rough={0.35} />
      {geos.b && <G geo={geos.b} c="#121212" rough={0.35} />}
      <G geo={geos.leds} c="#ff3b30" hl={false} />
      <G geo={pads} c={COL.gold} metal={0.85} rough={0.3} hl={false} />
    </>
  );
}

/** M18-style barrel proximity sensor along x (sensing face at +x), with two lock nuts. */
function Barrel({ L, W, H, variant }: Dims & { variant: "e18" | "inductive" | "capacitive" | "photo" }) {
  const r = Math.min(W, H) / 2;
  const body = variant === "inductive" ? "#b9bfc6" : "#26282c";
  const face = variant === "inductive" ? "#e07a1f" : variant === "capacitive" ? "#8a9099" : "#3a1d24";
  return (
    <>
      <Cyl p={[0, 0, 0]} rad={r * 0.92} len={L * 0.92} ax="x" c={body} metal={variant === "inductive" ? 0.8 : 0.2} rough={0.45} seg={20} />
      {[0.15, 0.55].map((f) => <Cyl key={f} p={[-L / 2 + f * L, 0, 0]} rad={r} len={Math.min(4, L * 0.1)} ax="x" c="#9aa3ad" metal={0.8} rough={0.35} seg={6} />)}
      <Cyl p={[L * 0.46 + 0.3, 0, 0]} rad={r * 0.8} len={0.6} ax="x" c={face} rough={0.2} seg={20} hl={false} />
      <Sph p={[-L * 0.46, r * 0.6, 0]} rad={Math.min(1, r * 0.2)} c="#ff3b30" hl={false} seg={8} />
      <Cyl p={[-L / 2 + 0.4, 0, 0]} rad={r * 0.3} len={0.8} ax="x" c="#111" seg={10} hl={false} />
    </>
  );
}

function Imu({ L, W, H, blue }: Dims & { blue: boolean }) {
  const t = Math.min(1.6, H * 0.5);
  const y0 = -H / 2,
    yt = y0 + t;
  const pads = useMemo(() => {
    const k = Math.max(2, Math.min(8, Math.floor((L - 1) / 2.54)));
    return mergeBoxes(Array.from({ length: k }, (_, i) => ({ p: [(i - (k - 1) / 2) * 2.54, yt + 0.01, -W / 2 + 1.4] as [number, number, number], s: [1.5, 0.04, 1.5] as [number, number, number] })));
  }, [L, W, yt]);
  return (
    <>
      <B p={[0, y0 + t / 2, 0]} s={[L, t, W]} c={blue ? "#1e4f9c" : COL.pcbPurple} rough={0.55} />
      <G geo={pads} c={COL.gold} metal={0.85} rough={0.3} hl={false} />
      <B p={[0, yt + 0.45, W * 0.1]} s={[4, 0.9, 4]} c={COL.chip} rough={0.4} />
      <B p={[-L * 0.3, yt + 0.5, W * 0.2]} s={[3, 1, 1.6]} c={COL.chip} hl={false} />
      {[-1, 1].map((s) => <Cyl key={s} p={[s * (L / 2 - 2.5), yt - t / 2, W / 2 - 2.5]} rad={1.5} len={t + 0.1} c="#0d0d0d" seg={10} hl={false} />)}
      <B p={[L * 0.3, yt + 0.3, W * 0.25]} s={[1.2, 0.6, 0.8]} c="#2ecc71" hl={false} />
    </>
  );
}

/** Lever micro-switch: black body, steel lever (with roller), three solder tabs. */
function MicroSwitch({ L, W, H }: Dims) {
  const bl = L * 0.62,
    bh = H * 0.62;
  const bx = -L / 2 + bl / 2;
  const by = -H / 2 + bh / 2 + H * 0.12;
  const ang = 0.18;
  const ll = L * 0.95;
  return (
    <>
      <B p={[bx, by, 0]} s={[bl, bh, W * 0.6]} c="#1b1c1f" rough={0.5} />
      <B p={[bx + bl * 0.2, by + bh / 2 + 0.6, 0]} s={[1.6, 1.2, 1.6]} c="#c62828" hl={false} />
      <group position={[-L / 2 + 2, by + bh / 2 + 0.3, 0]} rotation={[0, 0, ang]}>
        <B p={[ll / 2, 0, 0]} s={[ll, 0.4, W * 0.45]} c={COL.alu} metal={0.85} rough={0.3} />
        <Cyl p={[ll - 1, 1.2, 0]} rad={Math.min(2.4, H * 0.12)} len={W * 0.4} ax="z" c="#e8e8e8" rough={0.4} seg={14} />
      </group>
      {[-1, 0, 1].map((i) => <B key={i} p={[bx + i * bl * 0.33, -H / 2 + H * 0.06, 0]} s={[1.2, H * 0.12, 3]} c={COL.silver} metal={0.8} hl={false} />)}
    </>
  );
}

function GenericSensor({ L, W, H }: Dims) {
  const t = Math.min(1.6, H * 0.4);
  return (
    <>
      <B p={[0, -H / 2 + t / 2, 0]} s={[L, t, W]} c="#26303b" rough={0.6} />
      <B p={[0, -H / 2 + t + Math.min(2, H * 0.3) / 2, 0]} s={[L * 0.35, Math.min(2, H * 0.3), W * 0.45]} c={COL.chip} rough={0.5} />
      <B p={[-L / 2 + 1.5, -H / 2 + t + Math.min(2.5, H * 0.4) / 2, 0]} s={[2.54, Math.min(2.5, H * 0.4), Math.min(W - 1, 3 * 2.54)]} c={COL.header} hl={false} />
    </>
  );
}

export function SensorModel({ comp, d, info }: ModelProps) {
  const p = { L: d.x, W: d.y, H: d.z };
  const id = comp.id;
  const body = (() => {
    switch (info.key) {
      case "ultrasonic":
        return <Ultrasonic {...p} />;
      case "sharp-ir":
        return <Sharp {...p} />;
      case "tof":
        return <Tof {...p} />;
      case "ir-module":
        return <IrModule {...p} obstacle={comp.sensor?.kind === "ir-obstacle-digital"} />;
      case "reflectance-array": {
        const n = Math.max(1, comp.sensor?.channels ?? (Number(/(\d+)-channel/.exec(id)?.[1]) || 8));
        return <ReflectanceArray {...p} n={n} pitch={comp.sensor?.pitch_mm ?? (p.L * 0.9) / n} pololu={/qtr/.test(id)} />;
      }
      case "ir-barrel":
        return <Barrel {...p} variant={/inductive/.test(id) ? "inductive" : /capacitive/.test(id) ? "capacitive" : /photo/.test(id) ? "photo" : "e18"} />;
      case "imu":
        return <Imu {...p} blue={/mpu6050/.test(id)} />;
      case "microswitch":
        return <MicroSwitch {...p} />;
      default:
        return <GenericSensor {...p} />;
    }
  })();
  return <Mm>{body}</Mm>;
}
