"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, Minus, Target, TrendingUp, Trophy } from "lucide-react";
import { RequireAuth } from "@/components/shell/AppShell";
import { Badge, Empty, LinkButton, PageHeader, Panel, Stat } from "@/components/ui";
import { useApp } from "@/lib/store/app";
import { type Level, MIN_QUESTIONS_FOR_CATEGORY, type Stat as PerfStat, analysePerformance } from "@/lib/learning/performance";
import { categoryName } from "@/lib/learning/categories";

const LEVEL_TONE: Record<Level, "bad" | "warn" | "brand" | "ok"> = { "Needs Improvement": "bad", Developing: "warn", Good: "brand", Excellent: "ok" };
const LEVEL_FILL: Record<Level, string> = { "Needs Improvement": "var(--bad)", Developing: "var(--warn)", Good: "var(--info)", Excellent: "var(--ok)" };

function LevelBadge({ s }: { s: PerfStat }) {
  return s.level ? <Badge tone={LEVEL_TONE[s.level]}>{s.level}</Badge> : <span className="text-xs text-dim">Not enough data yet</span>;
}
function TrendIcon({ t }: { t: PerfStat["trend"] }) {
  if (t === "improving") return <span className="inline-flex items-center gap-1 text-xs text-ok"><ArrowUpRight size={13} /> improving</span>;
  if (t === "declining") return <span className="inline-flex items-center gap-1 text-xs text-bad"><ArrowDownRight size={13} /> declining</span>;
  if (t === "steady") return <span className="inline-flex items-center gap-1 text-xs text-muted"><Minus size={13} /> steady</span>;
  return <span className="text-xs text-dim">—</span>;
}

/** Horizontal accuracy bars per category with the 50 / 70 / 85 % level boundaries marked. */
function CategoryBars({ cats }: { cats: (PerfStat & { id: string; name: string })[] }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="space-y-2.5" role="table" aria-label="Accuracy by category">
      <div className="ml-[38%] flex justify-between pr-14 font-mono text-[10px] text-dim md:ml-[30%]" aria-hidden>
        <span>0%</span>
        <span>50</span>
        <span>70</span>
        <span>85</span>
        <span>100%</span>
      </div>
      {cats.map((c) => {
        const has = c.attempted > 0;
        return (
          <div key={c.id} role="row" className="relative flex items-center gap-3" onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}>
            <div role="rowheader" className="w-[38%] shrink-0 truncate text-sm text-text md:w-[30%]">{c.name}</div>
            <div role="cell" className="relative h-6 flex-1 rounded bg-bg2">
              {[50, 70, 85].map((m) => (
                <span key={m} className="absolute inset-y-0 w-px bg-[var(--line2)]" style={{ left: `${m}%` }} aria-hidden />
              ))}
              {has && (
                <span
                  className="absolute inset-y-1 left-0 rounded-r"
                  style={{ width: `${Math.max(2, c.accuracy)}%`, background: c.level ? LEVEL_FILL[c.level] : "var(--line2)", opacity: hover && hover !== c.id ? 0.55 : 1 }}
                />
              )}
              {hover === c.id && (
                <div className="bf-panel bf-raised absolute -top-2 left-1/2 z-10 w-56 -translate-x-1/2 -translate-y-full p-2.5 text-xs" role="tooltip">
                  <div className="font-semibold text-text">{c.name}</div>
                  {has ? (
                    <div className="mt-1 space-y-0.5 text-muted">
                      <div>{Math.round(c.accuracy)}% accuracy · {c.correct}/{c.attempted} correct</div>
                      <div>{c.quizAttempts} quiz attempt{c.quizAttempts === 1 ? "" : "s"}</div>
                      <div>{c.level ?? `Needs ${MIN_QUESTIONS_FOR_CATEGORY}+ answers for a level`}</div>
                    </div>
                  ) : (
                    <div className="mt-1 text-muted">No questions answered yet</div>
                  )}
                </div>
              )}
            </div>
            <div role="cell" className="w-14 shrink-0 text-right font-mono text-sm text-text">{has ? `${Math.round(c.accuracy)}%` : "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Accuracy per quiz attempt over time (single series, hover for details). */
function Timeline({ points }: { points: { at: string; accuracy: number; title: string }[] }) {
  const [hi, setHi] = useState<number | null>(null);
  if (points.length < 2) return <div className="text-sm text-muted">Take at least two quizzes to see your trend.</div>;
  const W = 640, H = 180, L = 34, R = 10, T = 10, B = 24;
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(" ");
  const p = hi !== null ? points[hi] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Quiz accuracy over ${points.length} attempts`}
        onMouseLeave={() => setHi(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHi(Math.max(0, Math.min(points.length - 1, Math.round(((px - L) / (W - L - R)) * (points.length - 1)))));
        }}>
        {[0, 50, 70, 85, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--dim)" fontFamily="JetBrains Mono">{v}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--accent-ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={T} y2={H - B} stroke="var(--line2)" strokeWidth={1} />}
        {points.map((pt, i) => (
          <circle key={i} cx={x(i)} cy={y(pt.accuracy)} r={hi === i ? 5 : 3.5} fill="var(--accent-ink)" stroke="var(--panel)" strokeWidth={2} />
        ))}
        <text x={L} y={H - 6} fontSize={10} fill="var(--dim)">oldest</text>
        <text x={W - R} y={H - 6} fontSize={10} fill="var(--dim)" textAnchor="end">latest</text>
      </svg>
      {p && (
        <div className="bf-panel bf-raised pointer-events-none absolute right-2 top-2 p-2.5 text-xs" role="status">
          <div className="font-semibold text-text">{Math.round(p.accuracy)}% accuracy</div>
          <div className="text-muted">{p.title}</div>
          <div className="text-dim">{new Date(p.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div>
        </div>
      )}
    </div>
  );
}

function Inner() {
  const { progress, content } = useApp();
  const rep = useMemo(() => analysePerformance(progress?.quizAttempts ?? [], content.extraQuestions, progress?.completedTopics ?? []), [progress, content.extraQuestions]);
  const [showAll, setShowAll] = useState(false);

  if (!rep.totals.attempts)
    return (
      <div className="mx-auto max-w-5xl px-5 py-8">
        <PageHeader kicker="BEAST TOPICS" title="My Performance Analysis" />
        <Empty title="No quiz results yet" action={<LinkButton href="/learn" variant="primary">Start a Beast Topic</LinkButton>}>
          Take topic quizzes and challenges — this page then shows which topics you understand well and which need more practice, with lessons to study next.
        </Empty>
      </div>
    );

  const topics = [...rep.topics].sort((a, b) => (b.level ? 1 : 0) - (a.level ? 1 : 0) || a.accuracy - b.accuracy);
  const shown = showAll ? topics : topics.slice(0, 12);
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <PageHeader kicker="BEAST TOPICS" title="My Performance Analysis" actions={<><LinkButton href="/learn/history" variant="outline" size="sm">Quiz history</LinkButton><LinkButton href="/learn" variant="outline" size="sm">Beast Topics</LinkButton></>}>
        Built from every quiz and challenge you have submitted. A topic gets a level once you have answered at least {MIN_QUESTIONS_FOR_CATEGORY} of its questions.
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="bf-panel p-4"><Stat label="Questions answered" value={rep.totals.attempted} /></div>
        <div className="bf-panel p-4"><Stat label="Overall accuracy" value={`${Math.round(rep.totals.accuracy)}%`} tone="accent" /></div>
        <div className="bf-panel p-4"><Stat label="Correct" value={rep.totals.correct} tone="ok" /></div>
        <div className="bf-panel p-4"><Stat label="Quiz attempts" value={rep.totals.attempts} /></div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel title={<span className="flex items-center gap-2"><Trophy size={15} className="text-ok" /> Strongest topics</span>}>
          {rep.strongest.length ? (
            <ul className="space-y-2">{rep.strongest.map((t) => (
              <li key={t.topicId} className="flex items-center justify-between gap-2 text-sm"><Link className="truncate text-text hover:underline" href={`/learn/${t.topicId}`}>{t.title}</Link><span className="flex items-center gap-2"><span className="font-mono">{Math.round(t.accuracy)}%</span><LevelBadge s={t} /></span></li>
            ))}</ul>
          ) : <div className="text-sm text-muted">Not enough data yet — answer at least {MIN_QUESTIONS_FOR_CATEGORY} questions on a topic with 70%+ accuracy.</div>}
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><Target size={15} className="text-accent-ink" /> Topics to improve</span>}>
          {rep.weakest.length ? (
            <ul className="space-y-2">{rep.weakest.map((t) => (
              <li key={t.topicId} className="flex items-center justify-between gap-2 text-sm"><Link className="truncate text-text hover:underline" href={`/learn/${t.topicId}`}>{t.title}</Link><span className="flex items-center gap-2"><span className="font-mono">{Math.round(t.accuracy)}%</span><LevelBadge s={t} /></span></li>
            ))}</ul>
          ) : <div className="text-sm text-muted">Nothing below 70% with enough data — keep it up.</div>}
        </Panel>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Panel title="Accuracy by category">
          <CategoryBars cats={rep.categories} />
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {(Object.keys(LEVEL_FILL) as Level[]).map((l) => (
              <span key={l} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: LEVEL_FILL[l] }} />{l} {l === "Needs Improvement" ? "<50%" : l === "Developing" ? "50–69%" : l === "Good" ? "70–84%" : "85%+"}</span>
            ))}
          </div>
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><TrendingUp size={15} className="text-accent-ink" /> Improvement trend</span>}>
          <Timeline points={rep.timeline} />
        </Panel>
      </div>

      {rep.recommendations.length > 0 && (
        <Panel title={<span className="flex items-center gap-2"><BookOpen size={15} className="text-accent-ink" /> Recommended lessons</span>} className="mb-6" bodyClass="p-0">
          <ul>{rep.recommendations.map((r) => (
            <li key={r.topicId} className="border-t border-line first:border-0">
              <Link href={`/learn/${r.topicId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-panel2">
                <span className="min-w-0"><span className="block font-medium text-text">{r.title}</span><span className="block text-xs text-muted">{r.reason}</span></span>
                <ArrowRight size={16} className="shrink-0 text-accent-ink" />
              </Link>
            </li>
          ))}</ul>
        </Panel>
      )}

      <Panel title={`Topic-wise accuracy (${rep.topics.length})`} bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg2"><tr className="bf-label text-left">
              <th className="px-4 py-2.5">Topic</th><th className="hidden px-4 py-2.5 md:table-cell">Category</th><th className="px-4 py-2.5 text-right">Answered</th><th className="px-4 py-2.5 text-right">Correct</th><th className="hidden px-4 py-2.5 text-right sm:table-cell">Incorrect</th><th className="px-4 py-2.5 text-right">Accuracy</th><th className="hidden px-4 py-2.5 lg:table-cell">Recent</th><th className="hidden px-4 py-2.5 lg:table-cell">Trend</th><th className="px-4 py-2.5">Level</th>
            </tr></thead>
            <tbody>{shown.map((t) => (
              <tr key={t.topicId} className="border-t border-line">
                <td className="px-4 py-2.5"><Link href={`/learn/${t.topicId}`} className="text-text hover:underline">{t.title}</Link></td>
                <td className="hidden px-4 py-2.5 text-muted md:table-cell">{t.category ? categoryName(t.category) : "—"}</td>
                <td className="px-4 py-2.5 text-right font-mono">{t.attempted}</td>
                <td className="px-4 py-2.5 text-right font-mono text-ok">{t.correct}</td>
                <td className="hidden px-4 py-2.5 text-right font-mono text-bad sm:table-cell">{t.incorrect}</td>
                <td className="px-4 py-2.5 text-right font-mono">{Math.round(t.accuracy)}%</td>
                <td className="hidden px-4 py-2.5 font-mono text-muted lg:table-cell">{t.recent === null ? "—" : `${Math.round(t.recent)}%`}</td>
                <td className="hidden px-4 py-2.5 lg:table-cell"><TrendIcon t={t.trend} /></td>
                <td className="px-4 py-2.5"><LevelBadge s={t} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {topics.length > 12 && <div className="border-t border-line p-3 text-center"><button className="text-sm text-accent-ink hover:underline" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${topics.length} topics`}</button></div>}
      </Panel>
    </div>
  );
}

export default function PerformancePage() {
  return (
    <RequireAuth>
      <Inner />
    </RequireAuth>
  );
}
