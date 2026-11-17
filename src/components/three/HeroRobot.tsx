"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { reference2WD } from "@/lib/robot/reference";
import { getComponent } from "@/lib/catalogue";
import { RobotAssembly } from "./RobotParts";
import { THEME } from "@/lib/theme";

function Spinner({ highlight }: { highlight: string | null }) {
  const project = useMemo(() => reference2WD("race", "hero"), []);
  const g = useRef<Group>(null);
  const [angle, setAngle] = useState(0);
  useFrame((_, dt) => {
    if (g.current) g.current.position.y = 0.045 + Math.sin(performance.now() / 700) * 0.003;
    setAngle((a) => a + dt * 4);
  });
  const wheels = Object.fromEntries(project.parts.filter((p) => getComponent(p.componentId)?.kind === "wheel").map((p) => [p.uid, angle]));
  const sel = highlight ? project.parts.find((p) => getComponent(p.componentId)?.kind === highlight)?.uid ?? null : null;
  return (
    <group ref={g}>
      <RobotAssembly project={project} wheelAngles={wheels} selected={sel} />
    </group>
  );
}

export default function HeroRobot({ highlight }: { highlight: string | null }) {
  return (
    <Canvas shadows camera={{ position: [0.32, 0.22, 0.32], fov: 38 }} dpr={[1, 2]}>
      <color attach="background" args={[THEME.sceneBg]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[0.5, 1, 0.3]} intensity={2.2} castShadow />
      <pointLight position={[-0.4, 0.2, -0.3]} intensity={2.4} color={THEME.fillLight} />
      <pointLight position={[0.4, 0.1, 0.4]} intensity={1.6} color={THEME.accent} />
      <Spinner highlight={highlight} />
      <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={0.8} blur={2.4} far={0.3} />
      <gridHelper args={[2, 40, THEME.gridMajor, THEME.gridMinor]} />
      <OrbitControls autoRotate autoRotateSpeed={0.8} enablePan={false} minDistance={0.25} maxDistance={0.9} maxPolarAngle={Math.PI / 2.1} target={[0, 0.03, 0]} />
    </Canvas>
  );
}
