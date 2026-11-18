"use client";
import { useEffect, useRef, useState } from "react";
import { getBackend } from "@/lib/data";
import type { RankEvent } from "@/lib/data/types";
import { rankByLevel } from "@/lib/ranks";
import { useApp } from "@/lib/store/app";
import { RankBadge } from "./RankBadge";

/**
 * Shows a rank-up celebration once per promotion. Promotions are written by the server (rank_history);
 * after the student closes the celebration they are marked seen, so it never replays on the next login.
 */
export function RankUpCelebration() {
  const user = useApp((s) => s.user);
  const [ev, setEv] = useState<{ top: RankEvent; ids: string[] } | null>(null);
  const checking = useRef(false);

  useEffect(() => {
    if (!user || checking.current) return;
    checking.current = true;
    void getBackend()
      .then((b) => b.listRankHistory(user.id))
      .then((h) => {
        const fresh = h.filter((x) => !x.seen && x.oldLevel !== null && x.newLevel > x.oldLevel);
        if (fresh.length) setEv({ top: fresh.reduce((a, b) => (b.newLevel > a.newLevel ? b : a)), ids: fresh.map((x) => x.id) });
      })
      .catch(() => {})
      .finally(() => {
        checking.current = false;
      });
  }, [user?.id, user?.rankLevel, user?.xp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ev) return null;
  const rank = rankByLevel(ev.top.newLevel);
  const close = () => {
    const ids = ev.ids;
    setEv(null);
    void getBackend().then((b) => b.markRankSeen(ids));
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(8,11,9,0.78)] p-4 backdrop-blur-sm" role="dialog" aria-modal aria-labelledby="rankup-title" onClick={close}>
      <div className="bf-panel bf-raised bf-rankup relative w-full max-w-sm overflow-hidden p-7 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="bf-rankup-rays pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <div className="bf-label text-accent-ink">RANK UP!</div>
          <div className="bf-rankup-badge mx-auto my-4 w-fit"><RankBadge level={rank.level} size={150} /></div>
          <div className="text-sm text-muted">{rankByLevel(ev.top.oldLevel ?? 1).name} →</div>
          <h2 id="rankup-title" className="font-display text-3xl font-bold text-heading">{rank.name}</h2>
          <div className="mt-1 text-sm text-muted">Level {rank.level} · reached at {ev.top.xpAt.toLocaleString()} XP</div>
          <p className="mt-3 text-sm italic text-dim">“{rank.motto}”</p>
          <button onClick={close} autoFocus className="mt-5 w-full rounded-md bg-accent px-4 py-2.5 font-semibold text-white hover:bg-accent-hover">Keep building</button>
        </div>
      </div>
    </div>
  );
}
