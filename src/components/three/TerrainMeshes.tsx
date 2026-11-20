"use client";
import { useMemo } from "react";
import * as THREE from "three";
import type { TerrainFeature, TerrainModel } from "@/lib/sim/types";

/**
 * 3D meshes for off-road terrain. Every vertex height comes from `terrain.featureHeight` — the same
 * function the physics samples under each wheel — so what students see is what their robot drives on.
 * Mud is flat in the physics (it changes grip and drag, not height), so it is drawn as a wet, dark patch
 * shaped by `terrain.surface`.
 */

const COLORS: Record<TerrainFeature["kind"], [string, string]> = {
  // [low, high] — vertex colour is blended by height for a natural look
  rock: ["#5d5852", "#9a948a"],
  bumps: ["#4a3f2c", "#7a6a48"],
  zigzag: ["#5a4a32", "#a08660"],
  hill: ["#4c4230", "#8c7a55"],
  block: ["#6d6a63", "#9b968b"],
  platform: ["#5f5b52", "#8f897c"],
  mud: ["#4b3520", "#5e4428"],
};

/** grid resolution: ~1 cm for small features, capped at 120 × 120 vertices */
function gridSize(f: TerrainFeature) {
  const w = f.bounds.maxX - f.bounds.minX;
  const h = f.bounds.maxY - f.bounds.minY;
  const step = Math.max(0.006, Math.max(w, h) / 120);
  return { nx: Math.max(2, Math.ceil(w / step) + 1), ny: Math.max(2, Math.ceil(h / step) + 1), w, h };
}

function featureGeometry(terrain: TerrainModel, index: number): THREE.BufferGeometry | null {
  const f = terrain.features[index];
  const { nx, ny, w, h } = gridSize(f);
  const pos = new Float32Array(nx * ny * 3);
  const col = new Float32Array(nx * ny * 3);
  const heights = new Float32Array(nx * ny);
  const inside = new Uint8Array(nx * ny);
  const [lo, hi] = COLORS[f.kind].map((c) => new THREE.Color(c));
  const span = Math.max(1e-3, f.maxHeight);
  const tmp = new THREE.Color();
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = f.bounds.minX + (w * i) / (nx - 1);
      const y = f.bounds.minY + (h * j) / (ny - 1);
      const k = j * nx + i;
      let z: number;
      if (f.kind === "mud") {
        const s = terrain.surface(x, y);
        inside[k] = s.kind === "mud" ? 1 : 0;
        z = terrain.height(x, y) + 0.0012; // sits just above whatever is under it
      } else {
        z = terrain.featureHeight(index, x, y);
        inside[k] = Math.abs(z) > 0.0004 ? 1 : 0;
      }
      heights[k] = z;
      pos[k * 3] = x;
      pos[k * 3 + 1] = z;
      pos[k * 3 + 2] = -y;
      // height-blended colour with a little deterministic speckle so rocks and dirt don't look flat
      const speckle = (Math.sin(x * 913.1 + y * 517.7) * 43758.5453) % 1;
      tmp.copy(lo).lerp(hi, Math.min(1, Math.max(0, z / span)) * 0.85 + Math.abs(speckle) * 0.15);
      col[k * 3] = tmp.r;
      col[k * 3 + 1] = tmp.g;
      col[k * 3 + 2] = tmp.b;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i,
        b = a + 1,
        c = a + nx,
        d = c + 1;
      // drop cells that are completely flat floor (keeps the floor and road visible around features)
      if (!(inside[a] || inside[b] || inside[c] || inside[d])) continue;
      if (f.kind === "mud" && !(inside[a] && inside[b] && inside[c] && inside[d])) continue;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function FeatureMesh({ terrain, index }: { terrain: TerrainModel; index: number }) {
  const f = terrain.features[index];
  const geo = useMemo(() => featureGeometry(terrain, index), [terrain, index]);
  if (!geo) return null;
  const mud = f.kind === "mud";
  return (
    <mesh geometry={geo} castShadow={!mud} receiveShadow>
      <meshStandardMaterial vertexColors roughness={mud ? 0.28 : f.kind === "rock" ? 0.85 : 0.95} metalness={mud ? 0.05 : 0} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function TerrainMeshes({ terrain }: { terrain: TerrainModel }) {
  if (!terrain.active) return null;
  return (
    <group>
      {terrain.features.map((f, i) => (
        <FeatureMesh key={`${f.pieceId}-${i}`} terrain={terrain} index={i} />
      ))}
    </group>
  );
}
