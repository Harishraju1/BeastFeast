"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, History, RotateCcw, Target, Trophy } from "lucide-react";
import { RequireAuth } from "@/components/shell/AppShell";
import { Badge, Empty, LinkButton, PageHeader, Panel, Stat } from "@/components/ui";
import { AttemptReview } from "@/components/learn/AttemptReview";
import { useApp } from "@/lib/store/app";
import { optionLetter, reviewAll, weakSpots } from "@/lib/learning/history";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Inner() {
  const { progress, content } = useApp();
  const reviews = useMemo(() => reviewAll(progress?.quizAttempts ?? [], content.extraQuestions), [progress?.quizAttempts, content.extraQuestions]);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mistakes" | "passed" | "failed">("all");
  const shown = reviews.filter((r) => (filter === "all" ? true : filter === "mistakes" ? r.wrong.length > 0 : filter === "passed" ? r.attempt.passed : !r.attempt.passed));
  const avg = reviews.length ? Math.round(reviews.reduce((a, r) => a + r.attempt.percent, 0) / reviews.length) : 0;
  const passed = reviews.filter((r) => r.attempt.passed).length;
  const totalWrong = reviews.reduce((a, r) => a + r.wrong.length, 0);
  const weak = weakSpots(reviews);
  const retakeHref = (quizId: string) => (quizId.startsWith("topic:") ? `/learn/${quizId.slice(6)}#quiz` : "/challenges");

  if (!reviews.length)
    return (
      <div className="mx-auto max-w-5xl px-5 py-8">
        <PageHeader kicker="BEAST TOPICS" title="Quiz History" />
        <Empty title="No quizzes taken yet" action={<LinkButton href="/learn" variant="primary">Go to Beast Topics</LinkButton>}>
          Finish a topic quiz or a challenge and every attempt will appear here, with the questions you got wrong, the right answers and why.
        </Empty>
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <PageHeader kicker="BEAST TOPICS" title="Quiz History" actions={<LinkButton href="/learn" variant="outline">Back to topics</LinkButton>}>
        Every quiz you have submitted, newest first. Open an attempt to see each question you got wrong, the correct answer and the explanation.
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="bf-panel p-4"><Stat label="Attempts" value={reviews.length} /></div>
        <div className="bf-panel p-4"><Stat label="Average score" value={`${avg}%`} tone="accent" /></div>
        <div className="bf-panel p-4"><Stat label="Passed" value={`${passed} / ${reviews.length}`} tone="ok" /></div>
        <div className="bf-panel p-4"><Stat label="Answers to review" value={totalWrong} /></div>
      </div>

      {weak.length > 0 && (
        <Panel title={<span className="flex items-center gap-2"><Target size={15} className="text-accent-ink" /> Most-missed questions</span>} className="mb-6" bodyClass="p-0">
          <ul>
            {weak.map(({ item, misses }) => (
              <li key={item.question.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-line px-4 py-3 first:border-0">
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm text-text">{item.question.prompt}</div>
                  <div className="mt-1 text-xs text-muted">
                    Correct answer: <span className="text-ok">{optionLetter(item.question.answerIndex)}. {item.question.options[item.question.answerIndex]}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="bad">missed {misses}×</Badge>
                  {item.topicId && <Link href={`/learn/${item.topicId}`} className="text-xs font-medium text-accent-ink hover:underline">Revise</Link>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><History size={18} className="text-accent-ink" /> Attempts</h2>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "mistakes", "failed", "passed"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f ? "border-accent bg-accent text-white" : "border-line text-muted hover:text-text"}`}>
              {f === "all" ? "All" : f === "mistakes" ? "With mistakes" : f === "failed" ? "Not passed" : "Passed"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {shown.map((r) => {
          const isOpen = open === r.attempt.id;
          return (
            <section key={r.attempt.id} className="bf-panel overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : r.attempt.id)} aria-expanded={isOpen} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left hover:bg-panel2">
                <span className={`flex h-11 w-14 shrink-0 items-center justify-center rounded-md font-display text-lg font-bold ${r.attempt.passed ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad"}`}>{r.attempt.percent}%</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-text">{r.title}</span>
                  <span className="block text-xs text-muted">{when(r.attempt.at)} · {r.attempt.correct}/{r.attempt.total} correct · +{r.attempt.xpAwarded} XP</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={r.attempt.passed ? "ok" : "bad"}>{r.attempt.passed ? "Passed" : "Not passed"}</Badge>
                  {r.wrong.length > 0 && <Badge tone="warn">{r.wrong.length} wrong</Badge>}
                  <ChevronDown size={16} className={`text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-line p-4">
                  <AttemptReview review={r} />
                  <div className="mt-4 flex justify-end">
                    <LinkButton href={retakeHref(r.attempt.quizId)} variant="primary" size="sm"><RotateCcw size={13} /> Retake this quiz</LinkButton>
                  </div>
                </div>
              )}
            </section>
          );
        })}
        {!shown.length && <div className="bf-panel p-6 text-center text-sm text-muted"><Trophy size={18} className="mx-auto mb-2 text-ok" />No attempts match this filter.</div>}
      </div>
    </div>
  );
}

export default function QuizHistoryPage() {
  return (
    <RequireAuth>
      <Inner />
    </RequireAuth>
  );
}
