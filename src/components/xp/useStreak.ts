"use client";
import { useEffect, useState } from "react";
import { getBackend } from "@/lib/data";
import type { StreakInfo } from "@/lib/data/types";

/**
 * The signed-in student's daily streak from the server (my_streak()). Re-read when their XP changes (new
 * activity) and every 5 minutes, so the day boundary at 23:59 is picked up without a reload.
 */
export function useStreak(userId: string | null | undefined, xp: number | undefined): StreakInfo | null {
  const [s, setS] = useState<StreakInfo | null>(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const load = () =>
      void getBackend()
        .then((b) => b.myStreak())
        .then((v) => live && setS(v))
        .catch(() => live && setS(null));
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [userId, xp]);
  return userId ? s : null;
}
