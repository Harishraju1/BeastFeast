/**
 * THE rank configuration — one place for names and thresholds.
 * Ranks are based on LIFETIME XP (never on daily XP) and are never lost when XP dips (penalties or the
 * 11:15 PM daily reset): the database keeps the highest rank reached in profiles.rank_level.
 * supabase/migrations/0007_ledger_daily_ranks.sql seeds the `ranks` table with exactly these values.
 */
export interface RankDef {
  level: number;
  name: string;
  /** lifetime XP needed to reach this rank */
  min: number;
  /** short motto shown on the rank card */
  motto: string;
}

export const RANKS: RankDef[] = [
  { level: 1, name: "Beginner", min: 0, motto: "Every engineer starts with a single circuit." },
  { level: 2, name: "Explorer", min: 100, motto: "Curious about every component." },
  { level: 3, name: "Apprentice", min: 300, motto: "Learning the tools of the trade." },
  { level: 4, name: "Practitioner", min: 600, motto: "Building, testing, repeating." },
  { level: 5, name: "Skilled Engineer", min: 1000, motto: "Your robots work the first time — mostly." },
  { level: 6, name: "Advanced Engineer", min: 1600, motto: "Circuits, code and chassis in harmony." },
  { level: 7, name: "Specialist", min: 2500, motto: "Deep skill in your chosen field." },
  { level: 8, name: "Senior Specialist", min: 3600, motto: "Others come to you for answers." },
  { level: 9, name: "Expert", min: 5000, motto: "Precision in every design." },
  { level: 10, name: "Master Engineer", min: 7000, motto: "You see the whole system at once." },
  { level: 11, name: "Elite Engineer", min: 9500, motto: "Among the club's very best." },
  { level: 12, name: "Robotics Architect", min: 12500, motto: "You design what others build." },
  { level: 13, name: "Grandmaster", min: 16000, motto: "Mastery across every competition." },
  { level: 14, name: "Legendary Engineer", min: 20500, motto: "Your robots are talked about." },
  { level: 15, name: "Robotics Titan", min: 26000, motto: "A force on every track and arena." },
  { level: 16, name: "BEAST", min: 33000, motto: "Build. Code. Simulate. Dominate." },
];

export const MAX_LEVEL = RANKS[RANKS.length - 1].level;

export const rankByLevel = (level: number) => RANKS[Math.max(0, Math.min(RANKS.length, level) - 1)] ?? RANKS[0];

/** Rank earned by an amount of lifetime XP. */
export function levelForXp(xp: number): number {
  let lvl = 1;
  for (const r of RANKS) if (xp >= r.min) lvl = r.level;
  return lvl;
}

export interface RankProgress {
  level: number;
  name: string;
  current: RankDef;
  next: RankDef | null;
  xp: number;
  /** XP still needed for the next rank (0 at the top) */
  toNext: number;
  /** progress from this rank's threshold to the next, 0–100 */
  pct: number;
}

/**
 * Progress for display. `storedLevel` is the server's permanent rank (highest reached); the shown rank is
 * never lower than that, even if lifetime XP later dips below the threshold.
 */
export function rankProgress(xp: number, storedLevel?: number | null): RankProgress {
  const level = Math.max(levelForXp(xp), storedLevel ?? 1);
  const current = rankByLevel(level);
  const next = RANKS.find((r) => r.level === level + 1) ?? null;
  const span = next ? next.min - current.min : 1;
  const pct = next ? Math.max(0, Math.min(100, ((xp - current.min) / span) * 100)) : 100;
  return { level, name: current.name, current, next, xp, toNext: next ? Math.max(0, next.min - xp) : 0, pct };
}

/** Thresholds must strictly increase — checked by tests and the migration seed. */
export const RANKS_ARE_VALID = RANKS.every((r, i) => i === 0 || (r.min > RANKS[i - 1].min && r.level === RANKS[i - 1].level + 1));
