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
  /** mounting role, e.g. "front-left" for the FL corner of a 4WD drivetrain */
  role?: string;
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
    /** "4WD" skid-steer (four driven wheels, no caster) or "2WD" differential drive with a caster */
    drivetrain?: "2WD" | "4WD";
    /**
     * Legacy reference robot, kept so student copies that reference its template id keep working.
     * Shown in a secondary "Legacy 2WD" group in the Garage.
     */
    legacy?: boolean;
    /** command protocol shown for keyboard/Bluetooth-controlled robots (defaults to the RR protocol) */
    controlProtocol?: string;
    /** Template family (spec-driven templates), e.g. "Robo Race Car". Reference robots have none. */
    family?: string;
    /** Short variant name within the family, e.g. "ESP32 · 2 × BTS7960 · Wi-Fi" */
    variantLabel?: string;
    /** Human-readable configuration of the variant */
    options?: { controller: string; driver: string; motors: string; sensors: string; control: string };
  };
  chassis: { componentId: string; length_mm?: number; width_mm?: number; thickness_mm?: number; material?: string; groundClearance_mm?: number };
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
    /** spec-driven templates: the behaviour and control method the firmware was generated for */
    behaviour?: string;
    control?: string;
    /**
     * false = the firmware uses something the BEAST interpreter does not simulate (ESP32 Wi-Fi): it is statically
     * checked instead, and the arena drives the robot in Manual mode. Default true.
     */
    runsInSimulator?: boolean;
    simulationNote?: string;
    /** simulator-compilable twin of a non-simulated sketch (same pins and motor code), used for static checks */
    checkSource?: string;
  };
  simulation: ProjectSimConfig & { defaultTrackId: string; alternativeTrackIds: string[] };
}

export type ReadinessStatus = "READY TO SIMULATE" | "READY WITH WARNINGS" | "NOT READY";

export interface ReadinessCheck {
  id: number;
  name: string;
  ok: boolean;
  warning?: boolean;
  /** a warning the template documents in its limitations (shown, but it does not lower the status) */
  documented?: boolean;
  detail: string;
}

export interface ReadinessReport {
  templateId: string;
  status: ReadinessStatus;
  checks: ReadinessCheck[];
  /** template validation (spec-driven families only) */
  template?: ReadinessCheck[];
  at: string;
}

export type BuiltProject = Project;
