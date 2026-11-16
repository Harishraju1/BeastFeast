/**
 * "Turtle" helper for building tracks programmatically: each path piece is placed at the current
 * pose and the pose advances to the piece exit, so consecutive pieces join exactly.
 */
import type { Pose, TrackPiece, TrackPieceType } from "../sim/types";
import { pieceEndpoints } from "./compile";

export class TrackChain {
  pose: Pose;
  readonly pieces: TrackPiece[] = [];
  private n = 0;

  constructor(
    start: Pose,
    private readonly prefix = "p",
  ) {
    this.pose = { ...start };
  }

  /** Append a path piece at the current pose and advance to its exit. */
  add(type: TrackPieceType, params: TrackPiece["params"] = {}): this {
    const piece: TrackPiece = { id: `${this.prefix}${this.n++}`, type, x: this.pose.x, y: this.pose.y, rotation: this.pose.heading, params };
    this.pieces.push(piece);
    const ep = pieceEndpoints(piece);
    if (ep) this.pose = ep.end;
    return this;
  }

  /** Place a marker/obstacle piece at the current pose (offset in the local frame) without advancing. */
  mark(type: TrackPieceType, params: TrackPiece["params"] = {}, dx = 0, dy = 0, drot = 0): this {
    const c = Math.cos(this.pose.heading);
    const s = Math.sin(this.pose.heading);
    this.pieces.push({
      id: `${this.prefix}${this.n++}`,
      type,
      x: this.pose.x + dx * c - dy * s,
      y: this.pose.y + dx * s + dy * c,
      rotation: this.pose.heading + drot,
      params,
    });
    return this;
  }

  /** Jump the turtle to a new pose without adding a piece. */
  moveTo(pose: Pose): this {
    this.pose = { ...pose };
    return this;
  }

  /** Place a piece at an absolute pose. */
  place(type: TrackPieceType, x: number, y: number, rotation = 0, params: TrackPiece["params"] = {}): this {
    this.pieces.push({ id: `${this.prefix}${this.n++}`, type, x, y, rotation, params });
    return this;
  }
}
