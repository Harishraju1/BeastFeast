/**
 * BEAST PROJECT GARAGE — reusable reference-project template format.
 *
 * A template is NOT a separate robot model: `build()` produces an ordinary `Project` (the same structure
 * the Robot Designer, Circuit Studio, Code Studio and Simulation Arena already use), assembled from real
 * catalogue components with the existing placement, wiring and simulation systems.
 */
import type { CompetitionId, Project, ProjectSimConfig, WireColor } from "@/lib/types";

export type GarageDifficulty = "beginner" | "intermediate" | "advanced";

export interface TemplatePart {
  /** catalogue id */
  componentId: string;
  label: string;
  /** chassis-relative placement in mm (x forward, y left, z up); omitted = smart placement */
  position?: { x: number; y: number; z: number };
  /** yaw in degrees */
  yawDeg?: number;
  config?: Record<string, number | boolean | string>;
  /** label of the motor whose shaft this wheel / encoder is mounted on */
  attachedTo?: string;
}

export interface ProjectTemplate {
  metadata: {
    id: string; // "LF-01"
    name: string;
    version: string; // semver, bumped whenever the definition changes
    competition: CompetitionId;
    difficulty: GarageDifficulty;
    learningLevel: string;
    description: string;
    workingPrinciple: string;
    learningObjectives: string[];
    limitations: string[];
    author: string;
    sensorSummary: string;
  };
  chassis: { componentId: string; length_mm?: number; width_mm?: number; thickness_mm?: number; material?: string };
  parts: TemplatePart[];
  /** "LABEL.PIN" → "LABEL.PIN" with wire colour */
  wiring: [string, string, WireColor][];
  /** what each controller pin is used for (documentation shown in the project view) */
  pinMap: { pin: string; connectedTo: string; purpose: string }[];
  firmware: {
    board: string;
    source: string;
    libraries: string[];
    adjustable: { name: string; meaning: string }[];
  };
  simulation: ProjectSimConfig & { defaultTrackId: string; alternativeTrackIds: string[] };
}

export type ReadinessStatus = "READY TO SIMULATE" | "READY WITH WARNINGS" | "NOT READY";

export interface ReadinessCheck {
  id: number;
  name: string;
  ok: boolean;
  warning?: boolean;
  detail: string;
}

export interface ReadinessReport {
  templateId: string;
  status: ReadinessStatus;
  checks: ReadinessCheck[];
  at: string;
}

export type BuiltProject = Project;
