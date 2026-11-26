"use client";
/**
 * Batteries (and the caster, kept as it was).
 *
 * The LiPo pack and the 18650/21700/26650 holder are the club's existing designs, moved here unchanged
 * (metres, same Box helper, same label texture). The other chemistries got their own simple models.
 */
import { useContext, useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import type { ComponentRecord, PartInstance } from "@/lib/types";
import { batteryPack } from "@/lib/circuit/nets";
import { B, COL, Cyl, EmissiveContext, MM, Mm } from "./prims";
import type { ModelProps } from "./types";

/** Printed label on top of a battery pack (drawn into a canvas texture — no font download). */
export function BatteryLabel({ text, size, y }: { text: string; size: [number, number]; y: number }) {
  const tex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 160;
    const g = c.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#f2c230";
    g.fillRect(0, 0, 512, 160);
    g.fillStyle = "#111";
    g.fillRect(0, 0, 512, 10);
    g.fillRect(0, 150, 512, 10);
    g.font = "bold 58px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 256, 82, 490);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [text]);
  useEffect(() => () => tex?.dispose(), [tex]);
  if (!tex) return null;
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={tex} roughness={0.7} />
    </mesh>
  );
}

const fmtV = (v: number) => (Math.round(v * 10) / 10).toString();

/** The original metre-based box (only the main body takes the highlight, as before). */
function Box({ size, color, pos = [0, 0, 0], metal = 0.1, rough = 0.6, emissive }: { size: [number, number, number]; color: string; pos?: [number, number, number]; metal?: number; rough?: number; emissive?: string }) {
  return (
    <mesh position={pos} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.5 : 0} />
    </mesh>
  );
}

/** LiPo pack: wrapped casing, red (+) and black (−) leads at the rear end, printed label on top. Unchanged design. */
function LipoPack({ part, comp, x, y, z, emissive }: { part: PartInstance; comp: ComponentRecord; x: number; y: number; z: number; emissive?: string }) {
  const pack = batteryPack(comp, part)!;
  const label = `${fmtV(pack.nominal)}V ${pack.capacity}mAh ${pack.cells}S`;
  return (
    <group>
      <Box size={[x, y, z]} color="#1f3f78" metal={0.15} rough={0.55} emissive={emissive} />
      <Box size={[x * 0.06, y * 0.9, z * 1.002]} color="#151a22" pos={[-x / 2 + x * 0.03, 0, 0]} />
      <BatteryLabel text={label} size={[x * 0.8, z * 0.72]} y={y / 2 + 0.25 * MM} />
      {[{ c: "#d42a2a", off: z * 0.18 }, { c: "#151515", off: -z * 0.18 }].map((l) => (
        <group key={l.c}>
          <mesh position={[-x / 2 - 9 * MM, y * 0.15, l.off]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[1.6 * MM, 1.6 * MM, 18 * MM, 8]} />
            <meshStandardMaterial color={l.c} roughness={0.6} />
          </mesh>
          <Box size={[6 * MM, 5 * MM, 5 * MM]} color={l.c} pos={[-x / 2 - 20 * MM, y * 0.15, l.off]} />
        </group>
      ))}
    </group>
  );
}

/** 18650 / 21700 / 26650 holder: black base and the cells side by side. Unchanged design. */
function CellHolder({ part, comp, x, y, z, emissive }: { part: PartInstance; comp: ComponentRecord; x: number; y: number; z: number; emissive?: string }) {
  const fixed = comp.battery?.cellCount;
  const n = fixed ?? Number(part.config.series ?? 1);
  // multi-cell packs: cells in the same parallel group share a colour so the S×P arrangement is visible
  const pack = fixed ? batteryPack(comp, part) : null;
  const groupOf = (i: number) => (pack ? Math.floor(i / (pack.parallel ?? 1)) : i);
  const r = (/21700/.test(comp.name) ? 21 : /26650/.test(comp.name) ? 26 : 18) * MM * 0.5;
  return (
    <group>
      <Box size={[x, 2 * MM, z]} color="#111" pos={[0, -y / 2 + 1 * MM, 0]} emissive={emissive} />
      {Array.from({ length: n }, (_, i) => {
        const zc = (i - (n - 1) / 2) * r * 2.1;
        const len = x * 0.85;
        // series neighbours alternate direction (+ next to −), as in a real holder
        const flip = pack ? groupOf(i) % 2 === 1 : i % 2 === 1;
        const wrap = ["#2b7de9", "#21a366", "#e0413a", "#7a4ee0", "#e0a21b"][groupOf(i) % 5];
        return (
          <group key={i} position={[0, 0, zc]} rotation={[0, flip ? Math.PI : 0, 0]}>
            {/* PVC wrap (colour = series group), label band, + cap with nub and white insulator ring, flat − end */}
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[r, r, len, 20]} />
              <meshStandardMaterial color={wrap} metalness={0.3} roughness={0.4} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.4 : 0} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[r * 1.005, r * 1.005, len * 0.38, 20]} />
              <meshStandardMaterial color="#f1eee3" roughness={0.7} />
            </mesh>
            <mesh position={[len / 2 + 0.25 * MM, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[r * 0.82, r * 0.82, 0.5 * MM, 18]} />
              <meshStandardMaterial color="#f5f5f5" roughness={0.6} />
            </mesh>
            <mesh position={[len / 2 + 0.9 * MM, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[r * 0.36, r * 0.4, 1.2 * MM, 14]} />
              <meshStandardMaterial color="#c9ced4" metalness={0.9} roughness={0.25} />
            </mesh>
            <mesh position={[-len / 2 - 0.2 * MM, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[r * 0.9, r * 0.9, 0.4 * MM, 18]} />
              <meshStandardMaterial color="#b9bec4" metalness={0.9} roughness={0.3} />
            </mesh>
          </group>
        );
      })}
      {/* holder contacts and leads: red = pack +, black = pack − */}
      <Box size={[1.2 * MM, y * 0.8, z * 0.95]} color="#c9ced4" pos={[x / 2 - 0.6 * MM, 0, 0]} />
      <Box size={[1.2 * MM, y * 0.8, z * 0.95]} color="#c9ced4" pos={[-x / 2 + 0.6 * MM, 0, 0]} />
      <mesh position={[x / 2 + 5 * MM, -y / 2 + 2 * MM, z * 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.9 * MM, 0.9 * MM, 10 * MM, 8]} />
        <meshStandardMaterial color="#d42a2a" />
      </mesh>
      <mesh position={[x / 2 + 5 * MM, -y / 2 + 2 * MM, -z * 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.9 * MM, 0.9 * MM, 10 * MM, 8]} />
        <meshStandardMaterial color="#151515" />
      </mesh>
    </group>
  );
}

/** Red (+) / black (−) lead pair leaving the −x end (mm). */
function Leads({ L, y, gap }: { L: number; y: number; gap: number }) {
  return (
    <>
      {[
        ["#d42a2a", gap],
        ["#151515", -gap],
      ].map(([c, z]) => (
        <Cyl key={c as string} p={[-L / 2 - 6, y, z as number]} rad={1.1} len={12} ax="x" c={c as string} rough={0.6} seg={8} hl={false} />
      ))}
    </>
  );
}

/** Shrink-wrapped pack of cylindrical cells (Li-ion, LiFePO4, NiCd) with a fish-paper end and BMS strip. */
function WrappedPack({ L, W, H, wrap, cells }: { L: number; W: number; H: number; wrap: string; cells: number }) {
  const n = Math.max(1, Math.min(cells, Math.round(W / Math.max(8, H * 0.9))));
  const r = Math.min(H / 2, W / (2 * n));
  return (
    <>
      {Array.from({ length: n }, (_, i) => <Cyl key={i} p={[0, -H / 2 + r, (i - (n - 1) / 2) * 2 * r]} rad={r} len={L * 0.96} ax="x" c={wrap} metal={0.2} rough={0.45} seg={20} />)}
      {n > 1 && <B p={[0, -H / 2 + r, 0]} s={[L * 0.96, r * 1.6, (n - 1) * 2 * r]} c={wrap} metal={0.2} rough={0.45} />}
      <B p={[L / 2 - 0.6, -H / 2 + r, 0]} s={[1.2, r * 1.9, n * 2 * r * 0.97]} c="#c9b98f" rough={0.8} />
      <B p={[-L / 2 + 1, -H / 2 + r * 1.95, 0]} s={[2, 1.2, n * 2 * r * 0.7]} c={COL.pcbGreen} hl={false} />
      <Leads L={L} y={-H / 2 + r} gap={Math.min(3, W * 0.15)} />
    </>
  );
}

/** Open AA/AAA holder: black tray, cells side by side (alternating), springs, leads. */
function AAHolder({ L, W, H, n, aaa, nimh }: { L: number; W: number; H: number; n: number; aaa: boolean; nimh: boolean }) {
  const cellR0 = aaa ? 5.25 : 7.25,
    cellL0 = aaa ? 44.5 : 50.5;
  const r = Math.min(cellR0, (W - 3) / (2 * n), H * 0.45);
  const cl = Math.min(cellL0, L - 8);
  const body = nimh ? "#2a7d4f" : "#26282c";
  return (
    <>
      <B p={[0, -H / 2 + 0.8, 0]} s={[L, 1.6, W]} c="#141414" rough={0.7} />
      {[-1, 1].map((s) => <B key={`e${s}`} p={[s * (L / 2 - 1.5), -H / 2 + r + 0.8, 0]} s={[3, r * 2 + 1.6, W]} c="#141414" rough={0.7} />)}
      {[-1, 1].map((s) => <B key={`w${s}`} p={[0, -H / 2 + r * 0.6 + 0.8, s * (W / 2 - 0.5)]} s={[L, r * 1.2, 1]} c="#141414" rough={0.7} />)}
      {Array.from({ length: n }, (_, i) => {
        const z = (i - (n - 1) / 2) * 2 * r;
        const flip = i % 2 ? 1 : -1;
        return (
          <group key={i}>
            <Cyl p={[0, -H / 2 + 1.6 + r, z]} rad={r * 0.96} len={cl} ax="x" c={body} metal={0.3} rough={0.4} seg={16} />
            <Cyl p={[flip * (cl / 2 - cl * 0.12), -H / 2 + 1.6 + r, z]} rad={r * 0.97} len={cl * 0.22} ax="x" c={nimh ? "#e8e8e8" : COL.copper} metal={0.5} rough={0.4} seg={16} hl={false} />
            <Cyl p={[flip * (cl / 2 + 0.6), -H / 2 + 1.6 + r, z]} rad={r * 0.35} len={1.2} ax="x" c={COL.silver} metal={0.9} seg={10} hl={false} />
          </group>
        );
      })}
      <Leads L={L} y={-H / 2 + 2} gap={Math.min(3, W * 0.12)} />
    </>
  );
}

/** 9 V PP3: wrapped block with the snap terminals (hexagonal −, round +) on top of one end. */
function PP3({ L, W, H }: { L: number; W: number; H: number }) {
  return (
    <>
      <B p={[0, 0, 0]} s={[L, H, W]} c="#1b1c1f" metal={0.3} rough={0.5} />
      <B p={[L * 0.05, 0, 0]} s={[L * 0.6, H * 1.005, W * 1.005]} c="#e7b416" metal={0.2} rough={0.5} />
      <Cyl p={[L / 2 + 1.5, H * 0.15, W * 0.22]} rad={Math.min(3, H * 0.15)} len={3} ax="x" c={COL.silver} metal={0.9} seg={16} hl={false} />
      <Cyl p={[L / 2 + 1.5, H * 0.15, -W * 0.22]} rad={Math.min(4, H * 0.2)} len={3} ax="x" c={COL.silver} metal={0.9} seg={6} hl={false} />
    </>
  );
}

/** Sealed lead-acid block: grey/black case, lighter lid, red and black spade terminals. */
function LeadAcid({ L, W, H }: { L: number; W: number; H: number }) {
  return (
    <>
      <B p={[0, -H * 0.05, 0]} s={[L, H * 0.9, W]} c="#2b2e33" rough={0.7} />
      <B p={[0, H * 0.45, 0]} s={[L, H * 0.1, W]} c="#4a4e55" rough={0.7} />
      <B p={[0, -H * 0.05, W / 2 + 0.05]} s={[L * 0.7, H * 0.5, 0.1]} c="#d9d4c7" rough={0.8} hl={false} />
      {[
        ["#c62828", 1],
        ["#151515", -1],
      ].map(([c, s]) => (
        <B key={c as string} p={[(s as number) * L * 0.35, H / 2 + 2, W * 0.3]} s={[6.3, 4, 0.8]} c={c as string} metal={0.6} hl={false} />
      ))}
    </>
  );
}

export function BatteryModel({ part, comp, d, info }: ModelProps) {
  const emissive = useContext(EmissiveContext);
  const [x, y, z] = [d.x * MM, d.z * MM, d.y * MM]; // three: length, height, width (metres)
  const L = d.x,
    W = d.y,
    H = d.z;
  const series = Number(part.config.series ?? comp.options.find((o) => o.key === "series")?.default ?? 1);
  switch (info.key) {
    case "lipo":
      return <LipoPack part={part} comp={comp} x={x} y={y} z={z} emissive={emissive} />;
    case "cell-holder":
      return <CellHolder part={part} comp={comp} x={x} y={y} z={z} emissive={emissive} />;
    case "liion-pack":
      return (
        <Mm>
          <WrappedPack L={L} W={W} H={H} wrap={/lifepo4/.test(comp.id) ? "#2a7d4f" : /nicd/.test(comp.id) ? "#e0a21b" : "#2b6cd9"} cells={comp.battery?.perCell ? series : 2} />
        </Mm>
      );
    case "aa-holder": {
      const n = /6-x-aa/.test(comp.id) ? 6 : /4-x-aa/.test(comp.id) ? 4 : Math.max(1, series);
      return (
        <Mm>
          <AAHolder L={L} W={W} H={H} n={n} aaa={/aaa/.test(comp.id)} nimh={/nimh/.test(comp.id)} />
        </Mm>
      );
    }
    case "pp3":
      return (
        <Mm>
          <PP3 L={L} W={W} H={H} />
        </Mm>
      );
    case "lead-acid":
      return (
        <Mm>
          <LeadAcid L={L} W={W} H={H} />
        </Mm>
      );
    default:
      return <Box size={[x, y, z]} color={/LiPo/.test(comp.name) ? "#2c3440" : "#3b3f46"} emissive={emissive} />;
  }
}

/** Ball caster: chrome ball under a mounting plate. Unchanged design. */
export function CasterModel({ d }: ModelProps) {
  const emissive = useContext(EmissiveContext);
  const [x, y, z] = [d.x * MM, d.z * MM, d.y * MM];
  return (
    <group>
      <mesh castShadow>
        <sphereGeometry args={[Math.min(x, y) * 0.35, 16, 16]} />
        <meshStandardMaterial color="#d7dbe0" metalness={0.9} roughness={0.2} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.5 : 0} />
      </mesh>
      <Box size={[x, 3 * MM, z]} color="#333" pos={[0, y * 0.3, 0]} />
    </group>
  );
}
