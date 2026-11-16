import type { TrackDef } from "@/lib/sim/types";
import { uid } from "@/lib/robot/assembly";

export function blankTrack(kind: TrackDef["kind"], ownerId: string): TrackDef {
  const base = { id: uid("trk"), name: `My ${kind} track`, kind, difficulty: "beginner" as const, ownerId, pieces: [], createdAt: new Date().toISOString() };
  if (kind === "sumo") return { ...base, size: { w: 1.4, h: 1.4 }, surface: { color: "#111", mu: 1, lineColor: "#fff" }, start: { x: -0.2, y: 0, heading: 0 }, arena: { shape: "circle", radius: 0.385, border: 0.025, timeLimitS: 180 } };
  if (kind === "line") return { ...base, size: { w: 3, h: 2 }, surface: { color: "#f2f2ee", mu: 1, lineColor: "#111" }, start: { x: -1, y: 0, heading: 0 }, laps: 1 };
  return { ...base, size: { w: 4, h: 3 }, surface: { color: "#2b2f36", mu: 1, lineColor: "#fff" }, start: { x: -1.5, y: 0, heading: 0 }, laps: 3 };
}
