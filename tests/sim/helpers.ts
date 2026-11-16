import type { CompiledTrack, TrackDef, TrackPiece } from "@/lib/sim/types";
import { compileTrack } from "@/lib/track/compile";

/** A large empty floor (line kind, white) with optional extra pieces. */
export function flatTrack(pieces: TrackPiece[] = [], size = 10, kind: TrackDef["kind"] = "line"): CompiledTrack {
  return compileTrack({
    id: "flat",
    name: "flat",
    kind,
    difficulty: "beginner",
    ownerId: null,
    size: { w: size, h: size },
    surface: { color: "#fff", mu: 1, lineColor: "#000" },
    pieces,
    start: { x: 0, y: 0, heading: 0 },
  });
}
