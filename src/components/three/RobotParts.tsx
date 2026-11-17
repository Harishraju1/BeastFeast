"use client";
/**
 * Procedural 3D representation of a robot built from the project data and real part dimensions.
 * These are labelled as procedural representations — the catalogue has no accurate CAD models yet.
 * Robot frame (mm): x forward, y left, z up  →  three.js (m): (x, z, -y).
 */
import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { getComponent } from "@/lib/catalogue";
import type { ComponentRecord, PartInstance, Project } from "@/lib/types";
import { partDims } from "@/lib/mech/geometry";

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
  if (!ch) return null;
  const m = MATERIAL_COLOR[ch.material] ?? { color: "#7fd8ff", opacity: 0.6 };
  return (
    <mesh position={[0, (-ch.thickness_mm / 2) * MM, 0]} castShadow receiveShadow>
      <boxGeometry args={[ch.length_mm * MM, ch.thickness_mm * MM, ch.width_mm * MM]} />
      <meshStandardMaterial color={m.color} transparent={m.opacity !== undefined} opacity={m.opacity ?? 1} metalness={m.metal ?? 0.1} roughness={0.45} emissive={highlight ? "#F20B0B" : "#000"} emissiveIntensity={highlight ? 0.6 : 0} />
    </mesh>
  );
}

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
