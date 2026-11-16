"use client";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import type { ComponentRecord, PartInstance } from "@/lib/types";
import { PartMesh } from "@/components/three/RobotParts";
import { partDims } from "@/lib/mech/geometry";

export type PreviewView = "front" | "side" | "top" | "iso";

function Cam({ view, size }: { view: PreviewView; size: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const d = size * 2.4;
    const pos: Record<PreviewView, [number, number, number]> = { front: [d, 0, 0], side: [0, 0, d], top: [0.0001, d, 0], iso: [d * 0.7, d * 0.6, d * 0.7] };
    camera.position.set(...pos[view]);
    camera.lookAt(0, 0, 0);
  }, [view, size, camera]);
  return null;
}

/** Procedural 3D preview of a catalogue part, sized from its dimensions. */
export default function ComponentPreview({ comp, view }: { comp: ComponentRecord; view: PreviewView }) {
  const part: PartInstance = useMemo(() => {
    const config: PartInstance["config"] = {};
    comp.options.forEach((o) => (config[o.key] = o.default));
    return { uid: "preview", componentId: comp.id, label: "", position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, config, schematic: { x: 0, y: 0 }, inCircuit: false };
  }, [comp]);
  const d = partDims(part, comp);
  const size = Math.max(d.x, d.y, d.z) / 1000;
  return (
    <Canvas camera={{ fov: 35, near: 0.001, far: 10 }} dpr={[1, 2]}>
      <color attach="background" args={["#0c1017"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[1, 2, 1]} intensity={2} />
      <pointLight position={[-1, 0.5, -1]} intensity={1.5} color="#00d9ff" />
      <PartMesh part={part} comp={comp} />
      <Cam view={view} size={size} />
      <OrbitControls enablePan={false} />
    </Canvas>
  );
}
