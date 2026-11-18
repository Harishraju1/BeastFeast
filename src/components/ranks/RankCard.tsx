"use client";
import { useEffect, useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { Panel, Progress } from "@/components/ui";
import { RANKS, rankByLevel, rankProgress } from "@/lib/ranks";
import type { RankEvent } from "@/lib/data/types";
import { getBackend } from "@/lib/data";
import { RankBadge } from "./RankBadge";

/** Rank dashboard: current rank, progress to the next one, the full ladder and the permanent promotion history. */
export function RankCard({ userId, xp, rankLevel, dailyXp }: { userId: string; xp: number; rankLevel?: number; dailyXp?: number }) {
  const r = rankProgress(xp, rankLevel);
  const [history, setHistory] = useState<RankEvent[] | null>(null);
  const [ladder, setLadder] = useState(false);
  useEffect(() => {
    void getBackend()
      .then((b) => b.listRankHistory(userId))
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [userId, r.level]);

  return (
    <Panel title="Rank" bodyClass="p-0">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className="flex shrink-0 justify-center"><RankBadge level={r.level} size={112} /></div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="bf-label">Current rank · level {r.level} of {RANKS.length}</div>
            <div className="font-display text-3xl font-bold text-heading">{r.name}</div>
            <div className="text-sm text-muted">{r.current.motto}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><div className="bf-label">Lifetime XP</div><div className="font-mono text-lg font-semibold text-accent-ink">{xp.toLocaleString()}</div></div>
            <div><div className="bf-label">Today</div><div className="font-mono text-lg text-text">{(dailyXp ?? 0).toLocaleString()}</div></div>
            <div><div className="bf-label">Next rank</div><div className="truncate font-medium text-text">{r.next ? r.next.name : "Top rank"}</div></div>
            <div><div className="bf-label">Remaining</div><div className="font-mono text-lg text-text">{r.next ? `${r.toNext.toLocaleString()} XP` : "—"}</div></div>
          </div>
          {r.next ? (
            <div>
              <Progress value={r.pct} />
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>{r.current.min.toLocaleString()} XP</span>
                <span>{Math.round(r.pct)}% to {r.next.name}</span>
                <span>{r.next.min.toLocaleString()} XP</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-ok">You have reached the highest rank in BEAST FEAST.</div>
          )}
          <p className="text-xs text-dim">Ranks use lifetime XP. Once earned, a rank is never lost — not at the 11:15 PM daily reset and not through daily penalties.</p>
        </div>
      </div>

      <button onClick={() => setLadder(!ladder)} aria-expanded={ladder} className="flex w-full items-center justify-between border-t border-line px-5 py-3 text-sm text-muted hover:bg-panel2 hover:text-text">
        <span>All {RANKS.length} ranks</span>
        <ChevronDown size={16} className={`transition-transform ${ladder ? "rotate-180" : ""}`} />
      </button>
      {ladder && (
        <ol className="grid gap-2 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          {RANKS.map((x) => {
            const got = x.level <= r.level;
            return (
              <li key={x.level} className={`flex items-center gap-3 rounded-lg border p-2 ${x.level === r.level ? "border-accent bg-accent/[.06]" : "border-line"} ${got ? "" : "opacity-60"}`}>
                <RankBadge level={x.level} size={40} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text">{x.name}</div>
                  <div className="flex items-center gap-1 font-mono text-[11px] text-dim">{!got && <Lock size={10} />}{x.min.toLocaleString()} XP</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="border-t border-line p-4">
        <div className="bf-label mb-2">Rank history</div>
        {history === null ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : history.length === 0 ? (
          <div className="text-sm text-muted">Your promotions will be recorded here.</div>
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 text-sm">
                <RankBadge level={h.newLevel} size={28} />
                <span className="text-text">
                  {h.oldLevel ? <>{rankByLevel(h.oldLevel).name} → <b>{rankByLevel(h.newLevel).name}</b></> : <>Started at <b>{rankByLevel(h.newLevel).name}</b></>}
                </span>
                <span className="font-mono text-xs text-dim">level {h.newLevel} · {h.xpAt.toLocaleString()} XP</span>
                <span className="ml-auto text-xs text-muted">{new Date(h.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                {h.note && <span className="w-full pl-10 text-xs text-dim">{h.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
