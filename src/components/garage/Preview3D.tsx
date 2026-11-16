"use client";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useMemo, useState } from "react";
import { getComponent } from "@/lib/catalogue";
import { partDims } from "@/lib/mech/geometry";
import type { Project } from "@/lib/types";
import { RobotAssembly } from "@/components/three/RobotParts";

/** Interactive 3D preview of a (garage) project — the same procedural assembly the Robot Designer draws. */
export default function Preview3D({ project, exploded = 0, highlight }: { project: Project; exploded?: number; highlight?: string | null }) {
  const lift = useMemo(() => {
    const wheels = project.parts.filter((p) => getComponent(p.componentId)?.kind === "wheel");
    const g = wheels.length ? Math.min(...wheels.map((w) => w.position.z - partDims(w, getComponent(w.componentId)!).x / 2)) : -40;
    return -g / 1000;
  }, [project]);
  // frame the whole robot including wheels/sensors that stick out beyond the plate
  const size = (Math.max(project.chassis?.length_mm ?? 150, project.chassis?.width_mm ?? 120, ...project.parts.map((p) => 2 * Math.max(Math.abs(p.position.x), Math.abs(p.position.y)) + 30)) / 1000) * 1.15;
  const [auto, setAuto] = useState(true);
  return (
    <Canvas camera={{ position: [size * 1.5, size * 1.25, size * 1.5], fov: 38, near: 0.005, far: 10 }} dpr={[1, 1.75]} onPointerDown={() => setAuto(false)}>
      <color attach="background" args={["#0b0f16"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[0.5, 1, 0.3]} intensity={2} />
      <pointLight position={[-0.4, 0.3, -0.3]} intensity={1.6} color="#00d9ff" />
      <group position={[0, lift, 0]}>
        <RobotAssembly project={project} exploded={exploded} selected={highlight ?? null} />
      </group>
      <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={size * 3} blur={2} far={0.2} />
      <gridHelper args={[size * 4, 20, "#1d3b4a", "#12202b"]} />
      <OrbitControls autoRotate={auto} autoRotateSpeed={1.2} enablePan={false} target={[0, lift * 0.6, 0]} />
    </Canvas>
  );
}
