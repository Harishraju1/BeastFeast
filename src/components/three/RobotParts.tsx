"use client";
/**
 * Procedural 3D representation of a robot built from the project data and real part dimensions.
 * These are labelled as procedural representations — the catalogue has no accurate CAD models yet.
 * Robot frame (mm): x forward, y left, z up  →  three.js (m): (x, z, -y).
 */
import { type ReactNode, useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace } from "three";
import { getComponent } from "@/lib/catalogue";
import type { ComponentRecord, PartInstance, Project } from "@/lib/types";
import { partBox, partDims } from "@/lib/mech/geometry";
import { batteryPack } from "@/lib/circuit/nets";
import { CORNERS, type Drivetrain4WD, HUB_GAP_MM, find4WD } from "@/lib/robot/drivetrain4wd";

const MM = 0.001;
export const toThree = (p: { x: number; y: number; z: number }): [number, number, number] => [p.x * MM, p.z * MM, -p.y * MM];

const MATERIAL_COLOR: Record<string, { color: string; opacity?: number; metal?: number }> = {
  Acrylic: { color: "#7fd8ff", opacity: 0.55 },
  Aluminium: { color: "#b8c2cc", metal: 0.8 },
  Steel: { color: "#8a939c", metal: 0.85 },
  "Stainless steel": { color: "#c9ced3", metal: 0.9 },
  "Carbon fibre": { color: "#1b1d22", metal: 0.3 },
  ABS: { color: "#e9e4d8" },
  PLA: { color: "#D91A14" }, // Signal Red print — the BEAST robot colour
  PETG: { color: "#2fb5a0", opacity: 0.85 },
  Nylon: { color: "#efe9dc" },
  Polycarbonate: { color: "#cfe9ff", opacity: 0.5 },
  FR4: { color: "#1f6f3a" },
};

export function ChassisMesh({ project, highlight }: { project: Project; highlight?: boolean }) {
  const ch = project.chassis;
  const dt = useMemo(() => find4WD(project), [project]);
  if (!ch) return null;
  const m = MATERIAL_COLOR[ch.material] ?? { color: "#7fd8ff", opacity: 0.6 };
  return (
    <group>
      <mesh position={[0, (-ch.thickness_mm / 2) * MM, 0]} castShadow receiveShadow>
        <boxGeometry args={[ch.length_mm * MM, ch.thickness_mm * MM, ch.width_mm * MM]} />
        <meshStandardMaterial color={m.color} transparent={m.opacity !== undefined} opacity={m.opacity ?? 1} metalness={m.metal ?? 0.1} roughness={0.45} emissive={highlight ? "#F20B0B" : "#000"} emissiveIntensity={highlight ? 0.6 : 0} />
      </mesh>
      {dt && <FourWDChassisDetails project={project} dt={dt} />}
    </group>
  );
}

/** Box in robot-frame millimetres: centre (x, y, z), size (length x, width y, height z). */
function MmBox({ c, s, color, metal = 0.5, rough = 0.5, opacity }: { c: [number, number, number]; s: [number, number, number]; color: string; metal?: number; rough?: number; opacity?: number }) {
  return (
    <mesh position={[c[0] * MM, c[2] * MM, -c[1] * MM]} castShadow>
      <boxGeometry args={[s[0] * MM, s[2] * MM, s[1] * MM]} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} transparent={opacity !== undefined} opacity={opacity ?? 1} />
    </mesh>
  );
}

const BRACKET = "#9aa3ad";
const BRASS = "#c9a227";

/**
 * Structural details drawn on a 4WD chassis (procedural, from the real part positions): motor mounting
 * brackets and clamps at the four corners, wheel hubs, a battery tray, the electronics area with standoffs
 * and a front sensor mount.
 */
function FourWDChassisDetails({ project, dt }: { project: Project; dt: Drivetrain4WD }) {
  const ch = project.chassis!;
  const T = ch.thickness_mm;
  const L = ch.length_mm;
  const parts = project.parts.map((p) => ({ p, c: getComponent(p.componentId) })).filter((x): x is { p: PartInstance; c: ComponentRecord } => !!x.c);
  const bat = parts.find((x) => x.c.kind === "battery");
  const ctrl = parts.find((x) => x.c.kind === "controller");
  const frontSensor = parts.filter((x) => ["ultrasonic", "ir-distance-analog", "tof", "ir-obstacle-digital"].includes(x.c.sensor?.kind ?? "") && x.p.position.z > 0).sort((a, b) => b.p.position.x - a.p.position.x)[0];
  const els: ReactNode[] = [];

  for (const corner of CORNERS) {
    const mp = dt.motors[corner.key];
    const wp = dt.wheels[corner.key];
    const mc = getComponent(mp.componentId)!;
    const wc = getComponent(wp.componentId)!;
    const md = partDims(mp, mc);
    const wd = partDims(wp, wc);
    const side = corner.sy;
    const { x, y, z } = mp.position;
    // vertical bracket plate on the motor's inner face, from the plate to the motor
    const zA = Math.min(-T, z - md.z / 2);
    const zB = Math.max(0, z + md.z / 2);
    const len = Math.min(30, md.x * 0.5);
    els.push(<MmBox key={`br-${corner.key}`} c={[x, y - side * (md.y / 2 + 1.2), (zA + zB) / 2]} s={[len, 2, zB - zA]} color={BRACKET} metal={0.8} rough={0.35} />);
    // horizontal tab bolted to the plate (under it for hanging motors, on top for top-mounted ones)
    const tabZ = z < -T ? -T - 1 : 1;
    els.push(<MmBox key={`tab-${corner.key}`} c={[x, y - side * (md.y / 2 + 6), tabZ]} s={[len, 10, 2]} color={BRACKET} metal={0.8} rough={0.35} />);
    // clamp strap around the motor body
    els.push(<MmBox key={`cl-${corner.key}`} c={[x - md.x * 0.12, y, z]} s={[6, md.y + 2.5, md.z + 2.5]} color="#4a5058" metal={0.6} rough={0.4} />);
    // wheel hub / shaft coupler between the motor and the wheel
    const hubY = wp.position.y - side * (wd.y / 2 + HUB_GAP_MM / 2);
    const hubR = Math.max(4, Math.min(9, wd.x * 0.14));
    els.push(
      <mesh key={`hub-${corner.key}`} position={[wp.position.x * MM, wp.position.z * MM, -hubY * MM]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[hubR * MM, hubR * MM, HUB_GAP_MM * MM, 16]} />
        <meshStandardMaterial color="#c5ccd3" metalness={0.85} roughness={0.25} />
      </mesh>,
    );
  }

  // battery tray (low walls around the battery footprint, or a default spot near the rear)
  const tb = bat ? partBox(bat.p, bat.c) : { minX: -L * 0.3 - 37, maxX: -L * 0.3 + 37, minY: -20, maxY: 20, minZ: 0, maxZ: 20 };
  const m = 2;
  const tx = (tb.minX + tb.maxX) / 2,
    ty = (tb.minY + tb.maxY) / 2;
  const tl = tb.maxX - tb.minX + 2 * m,
    tw = tb.maxY - tb.minY + 2 * m;
  const wallH = 7;
  els.push(<MmBox key="tray-base" c={[tx, ty, 0.25]} s={[tl, tw, 0.5]} color="#23272d" metal={0.2} rough={0.8} />);
  els.push(<MmBox key="tray-f" c={[tx + tl / 2 - 0.75, ty, wallH / 2]} s={[1.5, tw, wallH]} color="#23272d" metal={0.2} rough={0.8} />);
  els.push(<MmBox key="tray-r" c={[tx - tl / 2 + 0.75, ty, wallH / 2]} s={[1.5, tw, wallH]} color="#23272d" metal={0.2} rough={0.8} />);
  els.push(<MmBox key="tray-l" c={[tx, ty + tw / 2 - 0.75, wallH / 2]} s={[tl, 1.5, wallH]} color="#23272d" metal={0.2} rough={0.8} />);
  els.push(<MmBox key="tray-rr" c={[tx, ty - tw / 2 + 0.75, wallH / 2]} s={[tl, 1.5, wallH]} color="#23272d" metal={0.2} rough={0.8} />);
  if (bat) {
    const top = tb.maxZ;
    els.push(<MmBox key="strap" c={[tx, ty, top + 0.6]} s={[12, tw, 1.2]} color="#1b3a6b" metal={0} rough={0.9} />);
  }

  // electronics area: deck outline under the controller and brass standoffs at its corners
  if (ctrl) {
    const b = partBox(ctrl.p, ctrl.c);
    const deckZ = Math.max(0.3, b.minZ - 0.3);
    els.push(<MmBox key="deck" c={[(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, deckZ > 2 ? deckZ : 0.15]} s={[b.maxX - b.minX + 8, b.maxY - b.minY + 8, 0.3]} color="#2e7d5b" metal={0.1} rough={0.7} opacity={0.55} />);
    const h = Math.max(1, b.minZ);
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
      els.push(
        <mesh key={`so-${sx}${sy}`} position={[(sx > 0 ? b.maxX - 3.5 : b.minX + 3.5) * MM, (h / 2) * MM, -(sy > 0 ? b.maxY - 3.5 : b.minY + 3.5) * MM]}>
          <cylinderGeometry args={[2.5 * MM, 2.5 * MM, h * MM, 6]} />
          <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.3} />
        </mesh>,
      );
  }

  // front sensor mount: upright plate with two transducer holes, behind the front distance sensor (or at the nose)
  const sd = frontSensor ? partDims(frontSensor.p, frontSensor.c) : null;
  const mx = frontSensor && sd ? frontSensor.p.position.x - sd.x / 2 - 1.5 : L / 2 - 2;
  const my = frontSensor ? frontSensor.p.position.y : 0;
  const mh = frontSensor && sd ? Math.max(18, frontSensor.p.position.z + sd.z / 2) : 22;
  els.push(<MmBox key="smount" c={[mx, my, mh / 2]} s={[2, 50, mh]} color={BRACKET} metal={0.8} rough={0.35} />);
  els.push(<MmBox key="smount-foot" c={[mx - 5, my, 1]} s={[10, 50, 2]} color={BRACKET} metal={0.8} rough={0.35} />);
  if (!frontSensor)
    for (const s of [-1, 1])
      els.push(
        <mesh key={`hole-${s}`} position={[(mx + 1.1) * MM, (mh * 0.55) * MM, -(my + s * 13) * MM]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[8 * MM, 8 * MM, 0.4 * MM, 20]} />
          <meshStandardMaterial color="#15171a" />
        </mesh>,
      );
  return <group>{els}</group>;
}

/** Printed label on top of a battery pack (drawn into a canvas texture — no font download). */
function BatteryLabel({ text, size, y }: { text: string; size: [number, number]; y: number }) {
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

interface PartProps {
  part: PartInstance;
  comp: ComponentRecord;
  selected?: boolean;
  error?: boolean;
  offset?: [number, number, number];
  wheelAngle?: number;
  onSelect?: (uid: string, e: ThreeEvent<PointerEvent>) => void;
}

function Box({ size, color, pos = [0, 0, 0], metal = 0.1, rough = 0.6, emissive }: { size: [number, number, number]; color: string; pos?: [number, number, number]; metal?: number; rough?: number; emissive?: string }) {
  return (
    <mesh position={pos} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.5 : 0} />
    </mesh>
  );
}

export function PartMesh({ part, comp, selected, error, offset = [0, 0, 0], wheelAngle = 0, onSelect }: PartProps) {
  const d = partDims(part, comp);
  const [x, y, z] = [d.x * MM, d.z * MM, d.y * MM]; // three: length, height, width
  const pos = toThree(part.position);
  const emissive = error ? "#F20B0B" : selected ? "#F1EEE3" : undefined;
  const body = useMemo(() => {
    switch (comp.kind) {
      case "controller": {
        const esp = /ESP|Pico|NodeMCU/.test(comp.name);
        return (
          <group>
            <Box size={[x, 1.6 * MM, z]} color={esp ? "#16181d" : comp.name.includes("Nano") ? "#0b5c8c" : "#0e6f8f"} emissive={emissive} />
            <Box size={[x * 0.85, 8 * MM, 2.5 * MM]} color="#111" pos={[0, 4.5 * MM, z / 2 - 2 * MM]} />
            <Box size={[x * 0.6, 8 * MM, 2.5 * MM]} color="#111" pos={[0, 4.5 * MM, -z / 2 + 2 * MM]} />
            <Box size={[10 * MM, 9 * MM, 12 * MM]} color="#c0c6cc" pos={[-x / 2 + 6 * MM, 5 * MM, z * 0.2]} metal={0.8} rough={0.3} />
            <Box size={[10 * MM, 1.6 * MM, 10 * MM]} color="#222" pos={[0, 1.6 * MM, 0]} />
          </group>
        );
      }
      case "motor-driver":
        return (
          <group>
            <Box size={[x, 1.6 * MM, z]} color={comp.id === "l298n" ? "#b01e24" : comp.id.includes("tb6612") || comp.id.includes("drv88") ? "#3b2a85" : "#204b8f"} emissive={emissive} />
            {comp.id === "l298n" && <Box size={[x * 0.55, y * 0.8, 4 * MM]} color="#16181c" pos={[0, y * 0.4, 0]} metal={0.6} />}
            <Box size={[x * 0.3, 8 * MM, 6 * MM]} color="#2a7fd4" pos={[-x * 0.3, 4 * MM, z * 0.35]} />
            <Box size={[x * 0.3, 8 * MM, 6 * MM]} color="#2a7fd4" pos={[-x * 0.3, 4 * MM, -z * 0.35]} />
          </group>
        );
      case "dc-motor": {
        const tt = /TT|BO/.test(comp.name);
        return (
          <group>
            <Box size={[x * 0.62, y, z * 0.95]} color={tt ? "#f2c230" : "#9aa3ad"} pos={[-x * 0.19, 0, 0]} metal={tt ? 0.1 : 0.7} emissive={emissive} />
            <mesh position={[x * 0.31, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[Math.min(y, z) * 0.45, Math.min(y, z) * 0.45, x * 0.38, 20]} />
              <meshStandardMaterial color="#c9ced4" metalness={0.85} roughness={0.25} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.4 : 0} />
            </mesh>
            {/* output shaft points out of the robot side (local −z in three = robot +y before yaw) */}
            <mesh position={[0, 0, -(z / 2 + 4 * MM)]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[1.5 * MM, 1.5 * MM, 10 * MM, 8]} />
              <meshStandardMaterial color="#ddd" metalness={0.9} />
            </mesh>
          </group>
        );
      }
      case "wheel":
        return (
          <group rotation={[Math.PI / 2, 0, 0]}>
            <group rotation={[0, wheelAngle, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[x / 2, x / 2, z, 32]} />
                <meshStandardMaterial color="#1a1c20" roughness={0.9} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.5 : 0} />
              </mesh>
              <mesh>
                <cylinderGeometry args={[x * 0.32, x * 0.32, z * 1.04, 6]} />
                <meshStandardMaterial color={comp.name.includes("Aluminium") || comp.name.includes("Metal") ? "#c5ccd3" : "#D91A14"} metalness={0.4} />
              </mesh>
            </group>
          </group>
        );
      case "caster":
        return (
          <group>
            <mesh castShadow>
              <sphereGeometry args={[Math.min(x, y) * 0.35, 16, 16]} />
              <meshStandardMaterial color="#d7dbe0" metalness={0.9} roughness={0.2} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.5 : 0} />
            </mesh>
            <Box size={[x, 3 * MM, z]} color="#333" pos={[0, y * 0.3, 0]} />
          </group>
        );
      case "battery":
        if (/18650|21700|26650/.test(comp.name)) {
          const n = Number(part.config.series ?? 1);
          const r = (/21700/.test(comp.name) ? 21 : /26650/.test(comp.name) ? 26 : 18) * MM * 0.5;
          return (
            <group>
              <Box size={[x, 2 * MM, z]} color="#111" pos={[0, -y / 2 + 1 * MM, 0]} emissive={emissive} />
              {Array.from({ length: n }, (_, i) => (
                <mesh key={i} position={[0, 0, (i - (n - 1) / 2) * r * 2.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[r, r, x * 0.85, 20]} />
                  <meshStandardMaterial color={["#2b7de9", "#21a366", "#e0413a", "#7a4ee0"][i % 4]} metalness={0.3} roughness={0.4} />
                </mesh>
              ))}
            </group>
          );
        }
        if (/LiPo/.test(comp.name) && comp.battery && !comp.battery.perCell) {
          // LiPo pack: wrapped casing, red (+) and black (−) leads at the rear end, printed label on top
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
        return <Box size={[x, y, z]} color={/LiPo/.test(comp.name) ? "#2c3440" : "#3b3f46"} emissive={emissive} />;
      case "sensor": {
        const k = comp.sensor?.kind ?? "";
        if (k === "ultrasonic")
          return (
            <group>
              <Box size={[1.6 * MM, y, z]} color="#1c5fa8" emissive={emissive} />
              {[-1, 1].map((s) => (
                <mesh key={s} position={[6 * MM, 0, s * z * 0.28]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[8 * MM, 8 * MM, 12 * MM, 20]} />
                  <meshStandardMaterial color="#c7ccd2" metalness={0.8} roughness={0.3} />
                </mesh>
              ))}
            </group>
          );
        if (k.startsWith("reflectance")) {
          const n = comp.sensor?.channels ?? 1;
          return (
            <group>
              <Box size={[x, 1.6 * MM, z]} color="#174f2a" emissive={emissive} />
              {Array.from({ length: n }, (_, i) => (
                <Box key={i} size={[3 * MM, 3 * MM, 3 * MM]} color={i % 2 ? "#111" : "#3a49d9"} pos={[(i - (n - 1) / 2) * (x / Math.max(n, 1)) * 0.9, -2 * MM, 0]} />
              ))}
            </group>
          );
        }
        return <Box size={[x, y, z]} color="#222a35" emissive={emissive} />;
      }
      default: {
        const palette: Partial<Record<ComponentRecord["kind"], string>> = { regulator: "#1a5fb4", wireless: "#1c7a5a", switch: "#222", display: "#0a0a0a", servo: "#1f4fbf", mechanical: "#8b95a3", "rc-input": "#333" };
        if (/Wedge|Blade/.test(comp.name))
          return (
            <mesh rotation={[0, 0, -0.35]} castShadow>
              <boxGeometry args={[30 * MM, 2 * MM, ((part.config.width as number) ?? 100) * MM]} />
              <meshStandardMaterial color="#aeb6bf" metalness={0.9} roughness={0.25} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.5 : 0} />
            </mesh>
          );
        return <Box size={[x, y, z]} color={palette[comp.kind] ?? "#555c66"} emissive={emissive} />;
      }
    }
  }, [comp, x, y, z, emissive, part.config, part.rotation.z, wheelAngle]);
  return (
    <group
      position={[pos[0] + offset[0], pos[1] + offset[1], pos[2] + offset[2]]}
      rotation={[part.rotation.x, part.rotation.z, part.rotation.y]}
      onPointerDown={onSelect ? (e) => {
        e.stopPropagation();
        onSelect(part.uid, e);
      } : undefined}
    >
      {body}
      {error && (
        <mesh>
          <sphereGeometry args={[Math.max(x, y, z) * 0.8, 16, 16]} />
          <meshBasicMaterial color="#F20B0B" transparent opacity={0.15} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Exploded-view offsets (metres) by part kind, plus the assembly order they are shown in. */
export const ASSEMBLY_ORDER: ComponentRecord["kind"][] = ["chassis", "dc-motor", "wheel", "caster", "battery", "motor-driver", "controller", "sensor", "regulator", "switch", "wireless"];
export function explodeOffset(comp: ComponentRecord, part: PartInstance, t: number): [number, number, number] {
  if (t <= 0) return [0, 0, 0];
  const side = Math.sign(part.position.y) || 1;
  const k = comp.kind;
  const o: [number, number, number] =
    k === "wheel" ? [0, -0.02, -side * 0.12] : k === "dc-motor" ? [0, -0.06, -side * 0.06] : k === "caster" ? [0, -0.08, 0] : k === "controller" ? [0, 0.12, 0] : k === "motor-driver" ? [0, 0.09, 0] : k === "battery" ? [0, 0.06, 0] : k === "sensor" ? [part.position.x > 0 ? 0.08 : -0.08, part.position.z < 0 ? -0.05 : 0.05, 0] : [0, 0.15, 0];
  return [o[0] * t, o[1] * t, o[2] * t];
}

export function RobotAssembly({ project, selected, errors, exploded = 0, wheelAngles, onSelect }: { project: Project; selected?: string | null; errors?: Set<string>; exploded?: number; wheelAngles?: Record<string, number>; onSelect?: (uid: string, e: ThreeEvent<PointerEvent>) => void }) {
  const parts = project.parts.map((p) => ({ p, c: getComponent(p.componentId) })).filter((x): x is { p: PartInstance; c: ComponentRecord } => !!x.c && x.c.functionalityClass !== "C");
  return (
    <group>
      <group position={[0, exploded * -0.1, 0]}>
        <ChassisMesh project={project} highlight={errors?.has("chassis")} />
      </group>
      {parts.map(({ p, c }) => (
        <PartMesh key={p.uid} part={p} comp={c} selected={selected === p.uid} error={errors?.has(p.uid)} offset={explodeOffset(c, p, exploded)} wheelAngle={wheelAngles?.[p.uid] ?? 0} onSelect={onSelect} />
      ))}
    </group>
  );
}
