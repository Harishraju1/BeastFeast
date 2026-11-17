"use client";
import { getComponent } from "@/lib/catalogue";
import { partBox } from "@/lib/mech/geometry";
import type { Project } from "@/lib/types";
import { THEME } from "@/lib/theme";

const COLOR: Record<string, string> = {
  controller: "#0e6f8f", "motor-driver": "#8d1d24", "dc-motor": "#c9a227", wheel: "#1b1d22", caster: "#9aa3ad", battery: "#2b7de9", sensor: "#1f8a4c", regulator: "#1a5fb4", wireless: "#1c7a5a", switch: "#555",
};

/** Plan-view thumbnail drawn from the project's real part positions and dimensions (not an image). */
export function RobotTopView({ project, className = "" }: { project: Project; className?: string }) {
  const ch = project.chassis;
  if (!ch) return null;
  const parts = project.parts.map((p) => ({ p, c: getComponent(p.componentId)! })).filter((x) => x.c && x.c.functionalityClass !== "C");
  const boxes = parts.map(({ p, c }) => ({ b: partBox(p, c), kind: c.kind, z: p.position.z, label: p.label }));
  const xs = [ch.length_mm / 2, -ch.length_mm / 2, ...boxes.flatMap((x) => [x.b.minX, x.b.maxX])];
  const ys = [ch.width_mm / 2, -ch.width_mm / 2, ...boxes.flatMap((x) => [x.b.minY, x.b.maxY])];
  const pad = 10;
  const minX = Math.min(...xs) - pad,
    maxX = Math.max(...xs) + pad,
    minY = Math.min(...ys) - pad,
    maxY = Math.max(...ys) + pad;
  // robot faces up the page: robot +x → screen −y, robot +y → screen −x
  const W = maxY - minY,
    H = maxX - minX;
  const sx = (y: number) => maxY - y;
  const sy = (x: number) => maxX - x;
  const order = ["wheel", "dc-motor", "caster", "sensor"];
  const sorted = [...boxes].sort((a, b) => (order.indexOf(b.kind) === -1 ? 1 : 0) - (order.indexOf(a.kind) === -1 ? 1 : 0) || a.z - b.z);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`Top view of ${project.name}`}>
      <rect x={sx(ch.width_mm / 2)} y={sy(ch.length_mm / 2)} width={ch.width_mm} height={ch.length_mm} rx={4} fill="rgba(241,238,227,0.08)" stroke={THEME.ivory} strokeWidth={1} />
      {sorted.map((x, i) => (
        <rect key={i} x={sx(x.b.maxY)} y={sy(x.b.maxX)} width={x.b.maxY - x.b.minY} height={x.b.maxX - x.b.minX} rx={1.5} fill={COLOR[x.kind] ?? THEME.sageLight} opacity={x.z < -ch.thickness_mm ? 0.75 : 0.95} stroke={THEME.sageDeeper} strokeWidth={0.6} />
      ))}
      <path d={`M ${W / 2 - 6} 5 L ${W / 2} 0 L ${W / 2 + 6} 5`} stroke={THEME.accent} strokeWidth={1.5} fill="none" />
    </svg>
  );
}
