"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { CompiledTrack } from "@/lib/sim/types";
import { TrackScene } from "./TrackScene";

export default function TrackPreview3D({ track }: { track: CompiledTrack }) {
  const cx = (track.bounds.minX + track.bounds.maxX) / 2,
    cy = (track.bounds.minY + track.bounds.maxY) / 2;
  return (
    <Canvas shadows camera={{ position: [cx + 1.5, 2.2, -cy + 2.2], fov: 45 }}>
      <color attach="background" args={["#07090d"]} />
      <hemisphereLight args={["#bcd7ff", "#1b1f27", 0.7]} />
      <directionalLight position={[2, 4, 1]} intensity={2} castShadow />
      <TrackScene track={track} />
      <mesh position={[track.def.start.x, 0.02, -track.def.start.y]} rotation={[0, track.def.start.heading, 0]}>
        <boxGeometry args={[0.15, 0.03, 0.1]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
      <OrbitControls target={[cx, 0, -cy]} />
    </Canvas>
  );
}
