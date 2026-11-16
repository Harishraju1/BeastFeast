"use client";
import { useMemo } from "react";
import * as THREE from "three";
import type { CompiledTrack, Vec2 } from "@/lib/sim/types";

/** Ribbon mesh along a polyline (world x,y → three x,-z), lying on the floor at height h. */
export function ribbonGeometry(points: Vec2[], width: number, h = 0.0005): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    let dx = b.x - a.x,
      dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L;
    dy /= L;
    const nx = -dy * (width / 2),
      ny = dx * (width / 2);
    pos.push(p.x + nx, h, -(p.y + ny), p.x - nx, h, -(p.y - ny));
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function Ribbon({ points, width, color, h }: { points: Vec2[]; width: number; color: string; h: number }) {
  const geo = useMemo(() => ribbonGeometry(points, width, h), [points, width, h]);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.95} />
    </mesh>
  );
}

function Segment({ a, b, color, width = 0.03 }: { a: Vec2; b: Vec2; color: string; width?: number }) {
  return <Ribbon points={[a, b]} width={width} color={color} h={0.0012} />;
}

export function TrackScene({ track }: { track: CompiledTrack }) {
  const { def, bounds } = track;
  const w = bounds.maxX - bounds.minX,
    h = bounds.maxY - bounds.minY;
  const cx = (bounds.maxX + bounds.minX) / 2,
    cy = (bounds.maxY + bounds.minY) / 2;
  const floorColor = def.kind === "line" ? "#f2f2ee" : def.kind === "sumo" ? "#20242c" : "#3c6b3f";
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, -cy]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={def.kind === "race" ? "#27452a" : floorColor} roughness={1} />
      </mesh>
      {track.roads.map((r, i) => (
        <Ribbon key={`r${i}`} points={r.points} width={r.width} color={def.surface.color || "#2b2f36"} h={0.0004} />
      ))}
      {track.lines.map((l, i) => (
        <Ribbon key={`l${i}`} points={l.points} width={l.width} color={def.surface.lineColor && def.kind === "line" ? "#111" : "#111"} h={0.0008} />
      ))}
      {track.arena && track.arena.shape === "circle" && (
        <group position={[0, 0.0006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh receiveShadow>
            <circleGeometry args={[track.arena.radius!, 96]} />
            <meshStandardMaterial color="#0b0b0b" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.0002]}>
            <ringGeometry args={[track.arena.radius! - track.arena.border, track.arena.radius!, 96]} />
            <meshStandardMaterial color="#f4f4f4" />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.1, 0, 0.0003]}>
              <planeGeometry args={[0.01, 0.2]} />
              <meshStandardMaterial color="#8a5a2b" />
            </mesh>
          ))}
        </group>
      )}
      {track.arena && track.arena.shape === "rect" && (
        <group position={[0, 0.0006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <planeGeometry args={[track.arena.w!, track.arena.h!]} />
            <meshStandardMaterial color="#f4f4f4" />
          </mesh>
          <mesh position={[0, 0, 0.0002]}>
            <planeGeometry args={[track.arena.w! - 2 * track.arena.border, track.arena.h! - 2 * track.arena.border]} />
            <meshStandardMaterial color="#0b0b0b" />
          </mesh>
        </group>
      )}
      {track.obstacles.map((o, i) =>
        o.kind === "box" ? (
          <mesh key={`o${i}`} position={[o.cx, 0.04, -o.cy]} rotation={[0, o.rotation, 0]} castShadow>
            <boxGeometry args={[o.w, 0.08, o.h]} />
            <meshStandardMaterial color="#ff6b1a" />
          </mesh>
        ) : (
          <mesh key={`o${i}`} position={[o.cx, 0.04, -o.cy]} castShadow>
            <cylinderGeometry args={[o.r, o.r, 0.08, 24]} />
            <meshStandardMaterial color="#ff6b1a" />
          </mesh>
        ),
      )}
      {track.ramps.map((r, i) => (
        <mesh key={`ramp${i}`} position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[new THREE.Shape(r.polygon.map((p) => new THREE.Vector2(p.x, p.y)))]} />
          <meshStandardMaterial color="#6b7280" side={THREE.DoubleSide} />
        </mesh>
      ))}
      {track.checkpoints.map((c) => (
        <Segment key={`c${c.index}`} a={c.seg.a} b={c.seg.b} color="#00d9ff" width={0.015} />
      ))}
      {track.startLine && <Segment a={track.startLine.a} b={track.startLine.b} color="#22c55e" />}
      {track.finishLine && <Segment a={track.finishLine.a} b={track.finishLine.b} color="#ffffff" />}
      {track.walls.map((s, i) => {
        const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
        return (
          <mesh key={`w${i}`} position={[(s.a.x + s.b.x) / 2, 0.025, -(s.a.y + s.b.y) / 2]} rotation={[0, Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x), 0]}>
            <boxGeometry args={[len, 0.05, 0.02]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
        );
      })}
    </group>
  );
}
