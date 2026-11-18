"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge, Panel } from "@/components/ui";
import type { QuizAttempt, XpEvent } from "@/lib/data/types";
import { getQuiz } from "@/lib/learning";

const KIND = { competition: "Competition quiz", weekly: "Weekly quiz", challenge: "Engineering challenge", final: "Final examination" } as const;

/**
 * CHALLENGE XP HISTORY — every Challenges-page attempt with its score and the XP it earned. XP comes from
 * the same ledger as the profile XP history (rows linked to the attempt), so the two always agree.
 */
export function ChallengeHistory({ attempts, events }: { attempts: QuizAttempt[]; events: XpEvent[] }) {
  const rows = useMemo(() => {
    const byAttempt = new Map<string, number>();
    for (const e of events) if (e.attemptId) byAttempt.set(e.attemptId, (byAttempt.get(e.attemptId) ?? 0) + e.amount);
    return attempts
      .filter((a) => !a.quizId.startsWith("topic:"))
      .map((a) => {
        const quiz = getQuiz(a.quizId);
        return { a, title: quiz?.title ?? a.quizId, kind: quiz?.kind ?? "challenge", xp: byAttempt.get(a.id) ?? a.xpAwarded };
      })
      .sort((x, y) => y.a.at.localeCompare(x.a.at));
  }, [attempts, events]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minXp, setMinXp] = useState("");
  const shown = rows.filter((r) => {
    const d = r.a.at.slice(0, 10);
    return (!q || r.title.toLowerCase().includes(q.toLowerCase())) && (!kind || r.kind === kind) && (!from || d >= from) && (!to || d <= to) && (!minXp || r.xp >= Number(minXp));
  });

  return (
    <Panel title="Challenge XP history" bodyClass="p-0">
      <div className="grid gap-2 border-b border-line p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_0.8fr]">
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6a756d]" />
          <input className="bf-input !pl-8" placeholder="Challenge name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search challenges" />
        </label>
        <select className="bf-input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="bf-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <input className="bf-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        <input className="bf-input" type="number" min={0} placeholder="Min XP" value={minXp} onChange={(e) => setMinXp(e.target.value)} aria-label="Minimum XP earned" />
      </div>
      {shown.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted">{rows.length ? "No attempts match these filters." : "No challenge attempts yet — pick a challenge above to start."}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg2"><tr className="bf-label text-left">
              <th className="px-4 py-2.5">Challenge</th><th className="hidden px-4 py-2.5 md:table-cell">Category</th><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5 text-right">Score</th><th className="px-4 py-2.5 text-right">XP earned</th><th className="px-4 py-2.5">Status</th>
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.a.id} className="border-t border-line">
                  <td className="px-4 py-2.5 text-text">{r.title}</td>
                  <td className="hidden px-4 py-2.5 text-muted md:table-cell">{KIND[r.kind as keyof typeof KIND]}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted">{new Date(r.a.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.a.correct}/{r.a.total} <span className="text-dim">({r.a.percent}%)</span></td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-accent-ink">+{r.xp}</td>
                  <td className="px-4 py-2.5"><Badge tone={r.a.passed ? "ok" : "bad"}>{r.a.passed ? "Completed" : "Not passed"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
