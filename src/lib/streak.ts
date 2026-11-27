/**
 * Daily streak rules (the same rules as the database's streak_day() / my_streak(), migration 0015):
 *  - a streak day ends at 23:59 in the student's timezone (default Asia/Kolkata), so activity from 23:59
 *    onwards counts for the next day;
 *  - the current streak counts back from today if today is active, otherwise from yesterday (the streak is not
 *    broken until today's day has ended), and is 0 once a whole day has been missed;
 *  - "active today" is true only for activity inside today's streak day — yesterday is never shown as today.
 */
import type { StreakInfo, XpEvent } from "@/lib/data/types";

export const DEFAULT_TZ = "Asia/Kolkata";

function safeTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** YYYY-MM-DD streak day of an instant: its local date after adding one minute (the day ends at 23:59). */
export function streakDay(at: Date | string | number, tz: string = DEFAULT_TZ): string {
  const t = new Date(typeof at === "string" ? Date.parse(at) : at).getTime() + 60_000;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: safeTz(tz), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The calendar day before a YYYY-MM-DD date. */
function prevDay(d: string): string {
  const t = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Streak from a list of XP events (positive amounts only), as of `now`. */
export function computeStreak(events: Pick<XpEvent, "at" | "amount">[], now: Date = new Date(), tz: string = DEFAULT_TZ): StreakInfo {
  const zone = safeTz(tz);
  const today = streakDay(now, zone);
  const days = new Set(events.filter((e) => e.amount > 0).map((e) => streakDay(e.at, zone)).filter((d) => d <= today));
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && prevDay(d) === prev ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const activeToday = days.has(today);
  let current = 0;
  let cur = activeToday ? today : prevDay(today);
  while (days.has(cur)) {
    current++;
    cur = prevDay(cur);
  }
  return { current, longest, activeToday, lastActive: sorted.length ? sorted[sorted.length - 1] : null, today, timezone: zone };
}
