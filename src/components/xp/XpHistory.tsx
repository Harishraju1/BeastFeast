"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge, Panel, Stat } from "@/components/ui";
import { type XpEvent, type XpSource, XP_RULES, XP_SOURCE_LABEL, sourceOf } from "@/lib/data/types";
import { getTopic, QUIZZES } from "@/lib/learning";
import { quizTitle } from "@/lib/learning/history";

const PAGE = 15;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/** Human description for a ledger row (stored description first, then derived from its reference). */
export function describeXp(e: XpEvent): { text: string; quiz: string | null } {
  let quiz: string | null = null;
  if (e.type === "quiz-pass") quiz = quizTitle(e.refId);
  if (e.description) {
    const m = /—\s(.+)$|^Passed:\s(.+)$/.exec(e.description);
    if (m) quiz = m[1] ?? m[2] ?? quiz;
    return { text: e.description, quiz };
  }
  if (e.type === "lesson-complete") return { text: `Completed lesson: ${getTopic(e.refId)?.title ?? e.refId}`, quiz };
  if (e.type === "quiz-pass") return { text: `Passed: ${quiz}`, quiz };
  if (e.type === "inactivity-penalty") return { text: `No Beast Topics, videos or quizzes on ${e.refId}`, quiz };
  return { text: XP_RULES[e.type]?.label ?? e.type, quiz };
}

/**
 * XP HISTORY — the student's XP ledger (one row per transaction, newest first) with search, date, source,
 * challenge and quiz filters, and pagination. Penalties and corrections appear as negative rows.
 */
export function XpHistory({ events, lifetimeXp, dailyXp, title = "XP history", fixedSource }: { events: XpEvent[]; lifetimeXp: number; dailyXp: number; title?: string; fixedSource?: XpSource }) {
  const rows = useMemo(
    () =>
      events
        .filter((e) => e.amount !== 0)
        .map((e) => ({ e, src: sourceOf(e), ...describeXp(e) }))
        .filter((r) => !fixedSource || r.src === fixedSource)
        .sort((a, b) => b.e.at.localeCompare(a.e.at)),
    [events, fixedSource],
  );
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [src, setSrc] = useState<XpSource | "">("");
  const [quiz, setQuiz] = useState("");
  const [page, setPage] = useState(0);

  const quizNames = useMemo(() => [...new Set(rows.map((r) => r.quiz).filter((x): x is string => !!x))].sort(), [rows]);
  const challengeNames = new Set(QUIZZES.map((x) => x.title));
  const filtered = rows.filter((r) => {
    if (src && r.src !== src) return false;
    if (quiz && r.quiz !== quiz) return false;
    const d = dayKey(r.e.at);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (q && !`${r.text} ${XP_RULES[r.e.type]?.label ?? ""} ${r.quiz ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
  const challengeXp = events.filter((e) => sourceOf(e) === "challenge").reduce((a, e) => a + e.amount, 0);
  const reset = () => setPage(0);

  return (
    <Panel title={title} bodyClass="p-0">
      {!fixedSource && (
        <div className="grid grid-cols-2 gap-4 border-b border-line p-4 sm:grid-cols-4">
          <Stat label="Lifetime XP" value={lifetimeXp.toLocaleString()} tone="accent" />
          <Stat label="Today (since 11:15 PM)" value={dailyXp.toLocaleString()} />
          <Stat label="Challenge XP" value={challengeXp.toLocaleString()} />
          <Stat label="Transactions" value={rows.length} />
        </div>
      )}
      <div className="grid gap-2 border-b border-line p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6a756d]" />
          <input className="bf-input !pl-8" placeholder="Search activity…" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} aria-label="Search XP history" />
        </label>
        {!fixedSource && (
          <select className="bf-input" value={src} onChange={(e) => { setSrc(e.target.value as XpSource | ""); reset(); }} aria-label="XP source">
            <option value="">All sources</option>
            {(Object.keys(XP_SOURCE_LABEL) as XpSource[]).map((s) => <option key={s} value={s}>{XP_SOURCE_LABEL[s]}</option>)}
          </select>
        )}
        <select className="bf-input" value={quiz} onChange={(e) => { setQuiz(e.target.value); reset(); }} aria-label="Challenge or quiz">
          <option value="">All challenges & quizzes</option>
          {quizNames.filter((n) => challengeNames.has(n)).length > 0 && <optgroup label="Challenges">{quizNames.filter((n) => challengeNames.has(n)).map((n) => <option key={n}>{n}</option>)}</optgroup>}
          {quizNames.filter((n) => !challengeNames.has(n)).length > 0 && <optgroup label="Topic quizzes">{quizNames.filter((n) => !challengeNames.has(n)).map((n) => <option key={n}>{n}</option>)}</optgroup>}
        </select>
        <input className="bf-input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} aria-label="From date" />
        <input className="bf-input" type="date" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} aria-label="To date" />
      </div>

      {shown.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted">
          {rows.length === 0 ? "No XP yet. XP comes from designing your own robots, writing your own code, completing simulations with it, lessons and quizzes." : "No transactions match these filters."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg2"><tr className="bf-label text-left">
              <th className="px-4 py-2.5">Date & time</th><th className="px-4 py-2.5">Activity</th><th className="hidden px-4 py-2.5 md:table-cell">Source</th><th className="hidden px-4 py-2.5 lg:table-cell">Status</th><th className="px-4 py-2.5 text-right">XP</th>
            </tr></thead>
            <tbody>
              {shown.map(({ e, src: s, text }) => (
                <tr key={e.id} className="border-t border-line align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted">{when(e.at)}</td>
                  <td className="px-4 py-2.5 text-text">{text}<span className="block text-xs text-dim">{XP_RULES[e.type]?.label ?? e.type}</span></td>
                  <td className="hidden px-4 py-2.5 md:table-cell"><Badge tone={s === "penalty" ? "bad" : s === "challenge" ? "accent" : "dim"}>{XP_SOURCE_LABEL[s]}</Badge></td>
                  <td className="hidden px-4 py-2.5 text-xs lg:table-cell">{e.amount > 0 ? <span className="text-ok">Awarded</span> : <span className="text-bad">Deducted</span>}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${e.amount < 0 ? "text-bad" : "text-ok"}`}>{e.amount > 0 ? "+" : "−"}{Math.abs(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
        <span>{filtered.length} transaction{filtered.length === 1 ? "" : "s"} · net {filtered.reduce((a, r) => a + r.e.amount, 0) >= 0 ? "+" : ""}{filtered.reduce((a, r) => a + r.e.amount, 0)} XP</span>
        <span className="flex items-center gap-1">
          <button className="rounded p-1 hover:bg-panel2 disabled:opacity-30" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
          Page {cur + 1} of {pages}
          <button className="rounded p-1 hover:bg-panel2 disabled:opacity-30" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
        </span>
      </div>
    </Panel>
  );
}
