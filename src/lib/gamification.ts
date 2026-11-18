import type { Project } from "@/lib/types";
import type { Progress, XpEvent } from "@/lib/data/types";

import { rankProgress } from "./ranks";

/** Rank summary for display — thresholds live in src/lib/ranks.ts (the single rank configuration). */
export function rankFor(xp: number, storedLevel?: number | null) {
  const r = rankProgress(xp, storedLevel);
  return { name: r.name, level: r.level, index: r.level - 1, next: r.next?.name ?? null, toNext: r.toNext, pct: r.pct };
}

export const ACHIEVEMENTS = [
  { id: "first-circuit", title: "First Circuit", description: "Pass circuit validation for the first time" },
  { id: "first-robot", title: "First Robot", description: "Build a robot with chassis, motors, wheels and a controller" },
  { id: "first-simulation", title: "First Simulation", description: "Run your robot in the Simulation Arena" },
  { id: "circuit-master", title: "Circuit Master", description: "Pass validation on 5 different projects" },
  { id: "code-warrior", title: "Code Warrior", description: "Code matches the circuit and drives a simulation" },
  { id: "track-designer", title: "Track Designer", description: "Design and save your own track" },
  { id: "sensor-expert", title: "Sensor Expert", description: "Complete a line track with your own code" },
  { id: "simulation-champion", title: "Simulation Champion", description: "Win a sumo match against an Advanced or Beast opponent" },
  { id: "beast-engineer", title: "Beast Engineer", description: "Pass the Final Beast Engineer examination" },
] as const;

/** Achievements are derived from recorded XP events and saved data (never from page visits). */
export function earnedAchievements(events: XpEvent[], projects: Project[], progress: Progress | null): Set<string> {
  const has = (t: XpEvent["type"], pred: (e: XpEvent) => boolean = () => true) => events.some((e) => e.type === t && pred(e));
  const s = new Set<string>();
  if (has("validation-pass")) s.add("first-circuit");
  if (projects.some((p) => p.chassis && p.parts.filter((x) => x.componentId.includes("motor")).length >= 2 && p.parts.some((x) => x.attachedTo))) s.add("first-robot");
  if (has("simulation-first")) s.add("first-simulation");
  if (events.filter((e) => e.type === "validation-pass").length >= 5) s.add("circuit-master");
  if (has("code-check-pass") && projects.some((p) => p.simulations.some((r) => r.controlMode === "code"))) s.add("code-warrior");
  if (has("track-created")) s.add("track-designer");
  if (projects.some((p) => p.competition === "line" && p.simulations.some((r) => r.controlMode === "code" && r.outcome === "completed"))) s.add("sensor-expert");
  if (has("sumo-win", (e) => /advanced|beast/.test(e.refId))) s.add("simulation-champion");
  if (progress?.quizAttempts.some((a) => a.quizId === "final-beast-engineer" && a.passed)) s.add("beast-engineer");
  return s;
}

export function streakDays(events: XpEvent[]): number {
  const days = new Set(events.map((e) => e.at.slice(0, 10)));
  let n = 0;
  const d = new Date();
  for (;;) {
    const k = d.toISOString().slice(0, 10);
    if (!days.has(k)) {
      if (n === 0) {
        d.setDate(d.getDate() - 1);
        if (!days.has(d.toISOString().slice(0, 10))) return 0;
        continue;
      }
      return n;
    }
    n++;
    d.setDate(d.getDate() - 1);
  }
}
