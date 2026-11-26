"use client";
/**
 * Live simulation state for 3D models, keyed by part uid. Filled from the circuit bench (one central simulation)
 * by the Robot Designer; models read it through this context and only animate what the simulation reports.
 */
import { createContext } from "react";

export interface LivePart {
  /** LED: 0…1 brightness from the solved current */
  led?: number;
  /** switch contact closed */
  closed?: boolean;
  /** servo horn angle (°) */
  servoAngle?: number;
  /** display text (LCD lines) / OLED glyph runs */
  lines?: string[];
  runs?: { x: number; y: number; size: number; ch: string }[];
  backlight?: boolean;
  /** battery state of charge 0…1 and terminal voltage */
  soc?: number;
  volts?: number;
  /** motor driver: |voltage| fraction per channel (0…1) */
  channels?: number[];
}

export const LiveContext = createContext<Record<string, LivePart> | null>(null);
