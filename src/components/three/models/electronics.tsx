"use client";
/**
 * Procedural 3D models for small electronic parts that used to be drawn as plain boxes: resistors (real colour
 * bands from the resistance), capacitors, LEDs, push buttons, toggle switches, breadboards, LDRs, DHT sensors,
 * TO-92 sensors, OLED and character-LCD modules, buck converters and TO-220 / module regulators.
 *
 * Lightweight on purpose (a few dozen meshes each, shared low segment counts). Live state from the circuit bench
 * (LED brightness, switch position, servo angle, display text) arrives through LiveContext — a model only
 * animates when the simulation says so.
 */
import { useContext, useEffect, useMemo } from "react";
import { CanvasTexture, Matrix4 } from "three";
import { B, Cyl, Mm, Sph, type V3 } from "./prims";
import { LiveContext } from "./live";
import type { ModelProps } from "./types";
import { optionValue } from "@/lib/circuit/nets";

const BAND = ["#111", "#7b3f00", "#d32f2f", "#ef6c00", "#fbc02d", "#2e7d32", "#1565c0", "#6a1b9a", "#757575", "#fafafa"];
/** Resistor colour code (4 bands: 2 digits, multiplier, ±5 % gold). */
export function resistorBands(ohms: number): string[] {
  if (!(ohms > 0)) return [BAND[0], BAND[0], BAND[0], "#c9a227"];
  const exp = Math.floor(Math.log10(ohms)) - 1;
  const two = Math.round(ohms / Math.pow(10, exp));
  const d1 = Math.floor(two / 10) % 10, d2 = two % 10;
  const mult = exp >= 0 ? BAND[Math.min(9, exp)] : exp === -1 ? "#c9a227" : "#bdbdbd";
  return [BAND[d1], BAND[d2], mult, "#c9a227"];
}

function Leads({ x0, x1, y = 0, z = 0 }: { x0: number; x1: number; y?: number; z?: number }) {
  return <Cyl p={[(x0 + x1) / 2, y, z]} rad={0.3} len={Math.abs(x1 - x0)} ax="x" c="#c0c4c8" metal={0.8} rough={0.3} hl={false} seg={6} />;
}
function Legs({ xs, len = 8, y = 0 }: { xs: number[]; len?: number; y?: number }) {
  return (
    <>
      {xs.map((x, i) => <Cyl key={i} p={[x, y - len / 2, 0]} rad={0.25} len={len} c="#c0c4c8" metal={0.8} rough={0.3} hl={false} seg={6} />)}
    </>
  );
}

export function ResistorModel({ part, comp }: ModelProps) {
  const ohms = Number(optionValue(comp, part, "ohms") ?? 1000);
  const bands = resistorBands(ohms);
  return (
    <Mm>
      <Leads x0={-9} x1={9} />
      <Cyl p={[0, 0, 0]} rad={1.25} len={6.4} ax="x" c="#d9c7a3" rough={0.7} seg={12} />
      {bands.map((c, i) => <Cyl key={i} p={[-2.2 + i * 1.3 + (i === 3 ? 0.6 : 0), 0, 0]} rad={1.3} len={0.55} ax="x" c={c} seg={12} />)}
    </Mm>
  );
}

export function CapacitorModel({ comp }: ModelProps) {
  const elec = /electrolytic|tantalum/i.test(comp.name);
  if (elec)
    return (
      <Mm>
        <Cyl p={[0, 3, 0]} rad={3.15} len={11} c={/tantalum/i.test(comp.name) ? "#c49a1a" : "#1d2f6f"} rough={0.5} seg={18} />
        <B p={[2.4, 3, 0]} s={[1.2, 10.6, 2.4]} c="#d7dde5" />
        <Cyl p={[0, 8.6, 0]} rad={2.9} len={0.3} c="#b8bec6" metal={0.7} seg={18} />
        <Legs xs={[-1.25, 1.25]} len={6} y={-2.5} />
      </Mm>
    );
  return (
    <Mm>
      <Cyl p={[0, 3, 0]} rad={2.6} len={1.6} ax="z" c="#d98a1c" rough={0.6} seg={16} />
      <Legs xs={[-1.27, 1.27]} len={6} y={0.4} />
    </Mm>
  );
}

export function LedModel({ part, comp }: ModelProps) {
  const live = useContext(LiveContext)?.[part.uid];
  const color = /blue/i.test(comp.name) ? "#3d7bff" : /green/i.test(comp.name) ? "#33d06a" : /yellow/i.test(comp.name) ? "#ffd21f" : /white/i.test(comp.name) ? "#f2f6ff" : "#ff2a2a";
  const on = live?.led ?? 0;
  return (
    <Mm>
      <Cyl p={[0, 2.2, 0]} rad={2.5} len={4.4} c={color} opacity={0.75} seg={16} />
      <Sph p={[0, 4.4, 0]} rad={2.5} c={color} opacity={0.75} seg={14} />
      <Cyl p={[0, 0.2, 0]} rad={2.9} len={0.8} c={color} opacity={0.8} seg={16} />
      {on > 0.01 && (
        <mesh position={[0, 3.2, 0]}>
          <sphereGeometry args={[2 + 2.5 * on, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.25 + 0.55 * on} depthWrite={false} />
        </mesh>
      )}
      <Legs xs={[-1.27, 1.27]} len={9} y={-0.2} />
    </Mm>
  );
}

export function SwitchModel({ part, comp }: ModelProps) {
  const live = useContext(LiveContext)?.[part.uid];
  const closed = live?.closed ?? Boolean(optionValue(comp, part, "closed"));
  if (/push|tactile|button/i.test(comp.name))
    return (
      <Mm>
        <B p={[0, 1.7, 0]} s={[6, 3.4, 6]} c="#222" />
        <B p={[0, 3.5, 0]} s={[4.6, 0.3, 4.6]} c="#9aa3ad" metal={0.7} />
        <Cyl p={[0, closed ? 3.9 : 4.6, 0]} rad={1.75} len={1.8} c="#e8e2c9" seg={14} />
        <Legs xs={[-3.25, 3.25]} len={3.5} y={0} />
      </Mm>
    );
  return (
    <Mm>
      <B p={[0, 4, 0]} s={[13, 8, 8]} c="#1b1b1b" />
      <Cyl p={[0, 8.8, 0]} rad={3} len={1.6} c="#c3c8cc" metal={0.8} seg={16} />
      <group position={[0, 9.4, 0]} rotation={[0, 0, closed ? -0.45 : 0.45]}>
        <Cyl p={[0, 4.5, 0]} rad={1.1} rad2={0.9} len={9} c="#d6dadd" metal={0.85} rough={0.25} seg={10} />
      </group>
      {[-4.5, 0, 4.5].map((x) => <B key={x} p={[x, -2, 0]} s={[1.2, 4, 0.5]} c="#c0c4c8" metal={0.8} hl={false} />)}
    </Mm>
  );
}

export function BreadboardModel({ comp, d }: ModelProps) {
  const L = d.x, W = d.y, H = Math.max(6, d.z);
  const cols = Math.max(10, Math.min(63, Math.round((L - 10) / 2.54)));
  const holes = useMemo(() => {
    const out: V3[] = [];
    for (let c = 0; c < cols; c++) for (let r = 0; r < 10; r++) out.push([-L / 2 + 5 + c * 2.54, H + 0.01, (r < 5 ? -W / 2 + 10 + r * 2.54 : W / 2 - 10 - (9 - r) * 2.54)]);
    return out;
  }, [cols, L, W, H]);
  void comp;
  return (
    <Mm>
      <B p={[0, H / 2, 0]} s={[L, H, W]} c="#f4f4f0" rough={0.8} />
      <B p={[0, H + 0.02, 0]} s={[L - 4, 0.05, 2.5]} c="#cfcfc8" />
      {[-W / 2 + 3, W / 2 - 3].map((z, i) => <B key={i} p={[0, H + 0.03, z]} s={[L - 6, 0.05, 0.5]} c={i ? "#1565c0" : "#d32f2f"} hl={false} />)}
      <instancedMesh args={[undefined, undefined, holes.length]} ref={(m) => {
        if (!m) return;
        const o = new Matrix4();
        holes.forEach((h, i) => { o.makeTranslation(h[0], h[1], h[2]); m.setMatrixAt(i, o); });
        m.instanceMatrix.needsUpdate = true;
      }}>
        <boxGeometry args={[0.9, 0.06, 0.9]} />
        <meshBasicMaterial color="#3a3a36" />
      </instancedMesh>
    </Mm>
  );
}

export function LdrModel() {
  return (
    <Mm>
      <Cyl p={[0, 1.2, 0]} rad={2.5} len={2} c="#e0b45c" seg={18} />
      <B p={[0, 2.25, 0]} s={[3.6, 0.1, 0.4]} c="#7a3b12" hl={false} />
      <B p={[0, 2.25, 0.9]} s={[3.6, 0.1, 0.4]} c="#7a3b12" hl={false} />
      <B p={[0, 2.25, -0.9]} s={[3.6, 0.1, 0.4]} c="#7a3b12" hl={false} />
      <Legs xs={[-1.6, 1.6]} len={9} y={0.2} />
    </Mm>
  );
}

export function DhtModel({ comp }: ModelProps) {
  const dht22 = /22/.test(comp.name);
  const [w, h, t] = dht22 ? [15, 25, 7.7] : [12, 15.5, 5.5];
  const grille = useMemo(() => {
    const out: V3[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < (dht22 ? 6 : 4); j++) out.push([-w / 2 + 2.5 + i * ((w - 5) / 3), h * 0.35 + j * ((h * 0.55) / (dht22 ? 6 : 4)), t / 2 + 0.05]);
    return out;
  }, [dht22, w, h, t]);
  return (
    <Mm>
      <B p={[0, h / 2, 0]} s={[w, h, t]} c={dht22 ? "#f2f2ee" : "#2f7fd1"} />
      {grille.map((g, i) => <B key={i} p={g} s={[2, 1.2, 0.2]} c={dht22 ? "#9aa0a6" : "#164f8c"} hl={false} />)}
      <Legs xs={[-3.81, -1.27, 1.27, 3.81]} len={7} y={0} />
    </Mm>
  );
}

export function To92Model() {
  return (
    <Mm>
      <Cyl p={[0, 2.5, 0]} rad={2.3} len={5} c="#151515" seg={14} />
      <B p={[0, 2.5, 1.6]} s={[4.6, 5, 1.4]} c="#151515" />
      <Legs xs={[-1.27, 0, 1.27]} len={10} y={0} />
    </Mm>
  );
}

/** Text from the simulated display drawn into a canvas texture (only while something is shown). */
function useScreenTexture(lines: string[] | undefined, oled: boolean, runs?: { x: number; y: number; size: number; ch: string }[]) {
  const key = oled ? JSON.stringify(runs ?? []) : (lines ?? []).join("\n");
  const tex = useMemo(() => {
    if (typeof document === "undefined" || (!lines?.length && !runs?.length)) return null;
    const cv = document.createElement("canvas");
    cv.width = oled ? 256 : 320;
    cv.height = oled ? 128 : 32 * Math.max(2, lines?.length ?? 2) + 8;
    const g = cv.getContext("2d");
    if (!g) return null;
    g.fillStyle = oled ? "#05080a" : "#7fb3d5";
    g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = oled ? "#6fe3ff" : "#0b2233";
    if (oled) for (const r of runs ?? []) { g.font = `${16 * r.size}px monospace`; g.fillText(r.ch, r.x * 2, (r.y + 7 * r.size) * 2); }
    else { g.font = "24px monospace"; (lines ?? []).forEach((ln, i) => g.fillText(ln, 8, 30 + i * 32)); }
    return new CanvasTexture(cv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

export function DisplayModel({ part, comp, d }: ModelProps) {
  const live = useContext(LiveContext)?.[part.uid];
  const oled = /OLED/i.test(comp.name);
  const i2c = comp.pins.some((p) => p.fn === "i2c-sda");
  const tex = useScreenTexture(live?.lines, oled, live?.runs);
  if (oled) {
    const s = Math.max(20, Math.min(d.x, d.y));
    return (
      <Mm>
        <B p={[0, 0.8, 0]} s={[s, 1.6, s]} c="#1a4fa0" />
        <B p={[0, 2.1, -1]} s={[s * 0.92, 1, s * 0.6]} c="#0b0d10" metal={0.2} rough={0.2} />
        {tex && (
          <mesh position={[0, 2.62, -1]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[s * 0.86, s * 0.43]} />
            <meshBasicMaterial map={tex} />
          </mesh>
        )}
        {[-3.81, -1.27, 1.27, 3.81].map((x) => <B key={x} p={[x, 2.6, s / 2 - 2]} s={[0.64, 4, 0.64]} c="#c9a227" metal={0.8} hl={false} />)}
      </Mm>
    );
  }
  const big = /20x4|20×4/i.test(comp.name);
  const [L, W] = big ? [98, 60] : [80, 36];
  return (
    <Mm>
      <B p={[0, 0.8, 0]} s={[L, 1.6, W]} c="#1f7a3e" />
      <B p={[0, 4.6, 0]} s={[L * 0.89, 7, W * 0.72]} c="#26292c" metal={0.6} rough={0.4} />
      <B p={[0, 8.2, 0]} s={[L * 0.82, 0.3, W * 0.5]} c={live?.backlight === false ? "#3d4f5c" : "#7fb3d5"} />
      {tex && (
        <mesh position={[0, 8.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[L * 0.8, W * 0.46]} />
          <meshBasicMaterial map={tex} />
        </mesh>
      )}
      {i2c && <B p={[0, -1.8, 0]} s={[42, 3.6, 19]} c="#1a1a1a" />}
      {Array.from({ length: i2c ? 4 : 16 }, (_, k) => <B key={k} p={[-L / 2 + 8 + k * 2.54, 1.8, -W / 2 + 3]} s={[0.64, 2.4, 0.64]} c="#c9a227" metal={0.8} hl={false} />)}
    </Mm>
  );
}

export function RegulatorModel({ comp, d }: ModelProps) {
  if (/buck|LM2596|XL40|MP1584|MP2307|TPS5430/i.test(comp.name)) {
    const L = d.x, W = d.y;
    return (
      <Mm>
        <B p={[0, 0.8, 0]} s={[L, 1.6, W]} c="#1c4fb0" />
        <B p={[-L * 0.12, 4.4, 0]} s={[L * 0.3, 5.6, W * 0.55]} c="#2b2b2b" />
        <Cyl p={[L * 0.25, 5, -W * 0.2]} rad={3.2} len={8} c="#202a3a" seg={14} />
        <Cyl p={[L * 0.25, 5, W * 0.22]} rad={3.2} len={8} c="#202a3a" seg={14} />
        <B p={[-L * 0.38, 3.2, W * 0.3]} s={[9.5, 3.2, 4.6]} c="#2a63c9" />
        <Cyl p={[-L * 0.38 - 4.6, 3.4, W * 0.3]} rad={1.1} len={1.2} ax="x" c="#d4b24c" metal={0.8} hl={false} />
        <B p={[L * 0.05, 2.6, -W * 0.32]} s={[6.5, 2.2, 6]} c="#111" />
      </Mm>
    );
  }
  if (/AMS1117|1117/i.test(comp.name))
    return (
      <Mm>
        <B p={[0, 0.8, 0]} s={[d.x, 1.6, d.y]} c="#1c4fb0" />
        <B p={[0, 2.4, 0]} s={[6.5, 1.6, 3.5]} c="#151515" />
        <B p={[0, 2.4, 2.6]} s={[3, 1.6, 1.6]} c="#b8bec6" metal={0.8} />
      </Mm>
    );
  // TO-220 linear regulator (7805 / 7812 / LM317)
  return (
    <Mm>
      <B p={[0, 4.5, 0]} s={[10, 9, 4.5]} c="#141414" />
      <B p={[0, 12, -1.6]} s={[10, 6.5, 1.3]} c="#c8ccd1" metal={0.85} rough={0.3} />
      <mesh position={[0, 13, -1.6]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.8, 1.8, 1.4, 14]} />
        <meshBasicMaterial color="#1b1f24" />
      </mesh>
      {[-2.54, 0, 2.54].map((x) => <B key={x} p={[x, -5, 0]} s={[0.8, 10, 0.5]} c="#c0c4c8" metal={0.8} hl={false} />)}
    </Mm>
  );
}


export function DiodeModel({ comp }: ModelProps) {
  const power = /1N400|schottky|flyback|tvs/i.test(comp.name);
  const [r, len] = power ? [1.35, 5.2] : [0.9, 3.8];
  return (
    <Mm>
      <Leads x0={-8} x1={8} />
      <Cyl p={[0, 0, 0]} rad={r} len={len} ax="x" c={/1N4148/i.test(comp.name) ? "#d6732c" : "#1a1a1a"} rough={0.4} seg={12} opacity={/1N4148/i.test(comp.name) ? 0.85 : undefined} />
      <Cyl p={[len / 2 - 0.5, 0, 0]} rad={r + 0.02} len={0.6} ax="x" c="#c8ccd1" metal={0.5} seg={12} />
    </Mm>
  );
}

/** TO-92 (small-signal), TO-220 (TIP / IRF power) or SOT-23 (AO3400). */
export function TransistorModel({ comp }: ModelProps) {
  if (/AO3400|SOT/i.test(comp.name))
    return (
      <Mm>
        <B p={[0, 0.5, 0]} s={[2.9, 1, 1.6]} c="#1a1a1a" />
        {[-0.95, 0.95].map((x) => <B key={x} p={[x, 0.2, -1.1]} s={[0.4, 0.15, 0.6]} c="#c0c4c8" metal={0.8} hl={false} />)}
        <B p={[0, 0.2, 1.1]} s={[0.4, 0.15, 0.6]} c="#c0c4c8" metal={0.8} hl={false} />
      </Mm>
    );
  if (/TIP|IRF|IRL|Z44|540|n-channel|p-channel/i.test(comp.name))
    return (
      <Mm>
        <B p={[0, 4.5, 0]} s={[10, 9, 4.5]} c="#141414" />
        <B p={[0, 12, -1.6]} s={[10, 6.5, 1.3]} c="#c8ccd1" metal={0.85} rough={0.3} />
        {[-2.54, 0, 2.54].map((x) => <B key={x} p={[x, -5, 0]} s={[0.8, 10, 0.5]} c="#c0c4c8" metal={0.8} hl={false} />)}
      </Mm>
    );
  return <To92Model />;
}

/** Seeed Studio XIAO: 21 × 17.5 mm with USB-C and 2 × 7 castellated pads. */
export function XiaoModel({ comp }: ModelProps) {
  return (
    <Mm>
      <B p={[0, 0.6, 0]} s={[21, 1.2, 17.5]} c={/rp2040/i.test(comp.name) ? "#1d2b4a" : "#0f2a1c"} />
      <B p={[1.5, 1.9, 0]} s={[11, 1.4, 10]} c="#c9ced4" metal={0.85} rough={0.3} />
      <B p={[-9, 2, 0]} s={[7.4, 3.2, 9]} c="#b8bec6" metal={0.9} rough={0.25} />
      {Array.from({ length: 7 }, (_, i) => [-1, 1].map((sz) => <B key={`${i}${sz}`} p={[-7.6 + i * 2.54, 1.25, sz * 7.9]} s={[1.3, 0.1, 1.5]} c="#d4b24c" metal={0.9} hl={false} />))}
    </Mm>
  );
}

/** Folded metal bracket (motor / servo / sensor mounts, L- and U-brackets). */
export function BracketModel({ comp, d }: ModelProps) {
  const L = Math.max(15, d.x), W = Math.max(10, d.y), H = Math.max(10, d.z);
  const u = /^u-|U-bracket|servo/i.test(comp.name);
  return (
    <Mm>
      <B p={[0, 0.75, 0]} s={[L, 1.5, W]} c="#b9c0c8" metal={0.85} rough={0.35} />
      <B p={[-L / 2 + 0.75, H / 2, 0]} s={[1.5, H, W]} c="#b9c0c8" metal={0.85} rough={0.35} />
      {u && <B p={[L / 2 - 0.75, H / 2, 0]} s={[1.5, H, W]} c="#b9c0c8" metal={0.85} rough={0.35} />}
      {[-0.25, 0.25].map((t) => (
        <mesh key={t} position={[-L / 2 - 0.01, H * 0.6, W * t]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[1.6, 1.6, 1.6, 12]} />
          <meshBasicMaterial color="#2a2f35" />
        </mesh>
      ))}
    </Mm>
  );
}

/** Capacitive / resistive soil probe: a two-prong fork on a small board. */
export function SoilModel() {
  return (
    <Mm>
      <B p={[0, 0.8, 0]} s={[22, 1.6, 20]} c="#1c4fb0" />
      {[-5, 5].map((z) => <B key={z} p={[-22, 0.8, z]} s={[30, 1.6, 4]} c="#2a63c9" />)}
      {[-5, 5].map((z) => <B key={`t${z}`} p={[-22, 1.7, z]} s={[28, 0.1, 2.6]} c="#d4b24c" metal={0.9} hl={false} />)}
      {[0, 1, 2, 3].map((i) => <B key={i} p={[9, 3, -3.8 + i * 2.54]} s={[0.64, 4, 0.64]} c="#c9a227" metal={0.8} hl={false} />)}
    </Mm>
  );
}

/** MAX30102 pulse-oximeter breakout: small purple board with the optical window. */
export function PulseOxModel() {
  return (
    <Mm>
      <B p={[0, 0.8, 0]} s={[14, 1.6, 12.7]} c="#6a1b9a" />
      <B p={[0, 2.1, 0]} s={[5.6, 1, 3.3]} c="#111" />
      <B p={[0, 2.65, 0]} s={[4.2, 0.1, 2]} c="#3a3a3a" metal={0.2} rough={0.1} opacity={0.8} />
      {Array.from({ length: 7 }, (_, i) => <B key={i} p={[-6 + i * 2, 0.9, 5.8]} s={[1.2, 0.1, 1]} c="#d4b24c" metal={0.9} hl={false} />)}
    </Mm>
  );
}
