"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, History, SkipForward } from "lucide-react";
import type { QuizQuestion } from "@/lib/learning/types";
import { useApp } from "@/lib/store/app";
import { getBackend } from "@/lib/data";
import type { QuizAttempt } from "@/lib/data/types";
import { Button, Progress } from "@/components/ui";
import { Diagram } from "./Diagram";
import { AttemptReview } from "./AttemptReview";
import { optionLetter, reviewAttempt } from "@/lib/learning/history";

const TYPE_LABEL: Record<QuizQuestion["type"], string> = {
  mcq: "Multiple choice", "identify-component": "Identify the component", "identify-pin": "Identify the pin", "predict-circuit": "Predict circuit behaviour", "find-wrong-connection": "Find the wrong connection",
  "identify-driver": "Identify the motor driver", "code-output": "Understand code output", "debug-code": "Debug the program", calculate: "Calculate", "predict-movement": "Predict robot movement",
};

type QState = "answered" | "skipped" | "unanswered";

/**
 * Exam-style quiz: move freely with Previous / Skip / Next, see which questions are answered, skipped or
 * still open, review everything, then submit once. The attempt is graded by the backend (server-side in
 * cloud mode, against answer keys students cannot read) and question XP is only ever awarded once.
 */
export function QuizRunner({ quizId, questions, title, passPercent, onDone }: { quizId: string; questions: QuizQuestion[]; title: string; passPercent: number; onDone?: (a: QuizAttempt) => void }) {
  const { user, progress, refreshUser, toast, content } = useApp();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"answer" | "review">("answer");
  const [result, setResult] = useState<QuizAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false); // one submission per attempt, even on double-click
  const already = new Set(progress?.correctQuestions ?? []);

  const stateOf = (q: QuizQuestion): QState => (answers[q.id] !== undefined ? "answered" : skipped.has(q.id) ? "skipped" : "unanswered");
  const counts = useMemo(() => {
    const c = { answered: 0, skipped: 0, unanswered: 0 };
    for (const q of questions) c[answers[q.id] !== undefined ? "answered" : skipped.has(q.id) ? "skipped" : "unanswered"]++;
    return c;
  }, [questions, answers, skipped]);

  const restart = () => {
    submitted.current = false;
    setResult(null);
    setAnswers({});
    setSkipped(new Set());
    setI(0);
    setPhase("answer");
  };

  const choose = (qid: string, k: number) => {
    setAnswers((a) => ({ ...a, [qid]: k }));
    setSkipped((s) => {
      if (!s.has(qid)) return s;
      const n = new Set(s);
      n.delete(qid);
      return n;
    });
  };
  const go = (n: number) => {
    setPhase("answer");
    setI(Math.max(0, Math.min(questions.length - 1, n)));
  };
  const skip = () => {
    const q = questions[i];
    setAnswers((a) => {
      if (a[q.id] === undefined) return a;
      const n = { ...a };
      delete n[q.id];
      return n;
    });
    setSkipped((s) => new Set(s).add(q.id));
    if (i < questions.length - 1) setI(i + 1);
    else setPhase("review");
  };

  const submit = async () => {
    if (!user) return toast("error", "Sign in to save quiz results and earn XP.");
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    try {
      const be = await getBackend();
      const a = await be.submitQuiz(user.id, quizId, answers);
      setResult(a);
      await refreshUser();
      useApp.setState({ progress: await be.getProgress(user.id) });
      if (a.xpAwarded) toast("xp", `+${a.xpAwarded} XP`);
      onDone?.(a);
    } catch (e) {
      submitted.current = false;
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ───────── results ─────────
  if (result) {
    const review = reviewAttempt(result, content.extraQuestions);
    const incorrect = review.items.filter((x) => !x.correct && x.chosen !== null).length;
    const unanswered = review.items.filter((x) => x.chosen === null).length;
    return (
      <div className="space-y-5">
        <div className="space-y-2 text-center">
          <div className={`font-display text-4xl font-bold ${result.passed ? "text-ok" : "text-warn"}`}>{result.percent}%</div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
            <span className="text-ok">{result.correct} correct</span>
            <span className="text-bad">{incorrect} incorrect</span>
            <span className="text-warn">{unanswered} skipped / unanswered</span>
            <span className="text-muted">{result.passed ? "PASSED" : `Pass mark ${passPercent}%`}</span>
            <span className="font-semibold text-accent-ink">+{result.xpAwarded} XP</span>
          </div>
          <div className="text-xs text-dim">XP is awarded once per correctly answered question — retakes help you learn but don&apos;t farm points. Skipped questions earn no XP.</div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button onClick={restart}>Try again</Button>
            <Link href="/learn/history" className="inline-flex items-center gap-2 rounded-md border border-line2 px-3.5 py-2 text-sm text-heading hover:border-accent hover:bg-panel2"><History size={14} /> Quiz history</Link>
          </div>
        </div>
        <div className="border-t border-line pt-4">
          <div className="bf-label mb-3">Review this attempt</div>
          <AttemptReview review={review} />
        </div>
      </div>
    );
  }

  if (!questions.length) return <div className="text-sm text-muted">No questions.</div>;

  const palette = (
    <div className="flex flex-wrap gap-1.5" role="navigation" aria-label="Questions">
      {questions.map((q, n) => {
        const st = stateOf(q);
        const cur = phase === "answer" && n === i;
        return (
          <button
            key={q.id}
            onClick={() => go(n)}
            aria-label={`Question ${n + 1}: ${st}`}
            aria-current={cur ? "step" : undefined}
            className={`h-8 w-8 rounded-md border font-mono text-xs transition ${cur ? "ring-2 ring-accent ring-offset-1 ring-offset-[var(--panel)]" : ""} ${
              st === "answered" ? "border-ivory bg-ivory font-semibold text-[var(--forest-sage)]" : st === "skipped" ? "border-warn bg-warn/15 text-warn" : "border-line2 text-muted hover:border-ivory"
            }`}
          >
            {n + 1}
          </button>
        );
      })}
    </div>
  );
  const legend = (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-ivory" /> Answered {counts.answered}</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-warn bg-warn/15" /> Skipped {counts.skipped}</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-line2" /> Unanswered {counts.unanswered}</span>
    </div>
  );

  // ───────── review before submitting ─────────
  if (phase === "review")
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-text">{title} — review your answers</span>
          <span className="text-xs text-muted">{questions.length} questions</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-line bg-bg2 p-3"><div className="font-display text-2xl font-bold text-text">{counts.answered}</div><div className="text-xs text-muted">Answered</div></div>
          <div className="rounded-lg border border-warn/40 bg-warn/5 p-3"><div className="font-display text-2xl font-bold text-warn">{counts.skipped}</div><div className="text-xs text-muted">Skipped</div></div>
          <div className="rounded-lg border border-line bg-bg2 p-3"><div className="font-display text-2xl font-bold text-muted">{counts.unanswered}</div><div className="text-xs text-muted">Unanswered</div></div>
        </div>
        {palette}
        <ol className="divide-y divide-[var(--line)] rounded-lg border border-line">
          {questions.map((q, n) => {
            const st = stateOf(q);
            return (
              <li key={q.id}>
                <button onClick={() => go(n)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-panel2">
                  <span className="w-6 shrink-0 font-mono text-xs text-dim">{n + 1}.</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm text-text">{q.prompt}</span>
                    <span className={`block text-xs ${st === "answered" ? "text-muted" : st === "skipped" ? "text-warn" : "text-dim"}`}>
                      {st === "answered" ? `Your answer: ${optionLetter(answers[q.id])}. ${q.options[answers[q.id]]}` : st === "skipped" ? "Skipped — click to answer" : "Not answered yet — click to answer"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {counts.answered < questions.length && <div className="rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-warn">{questions.length - counts.answered} question(s) have no answer. They will be marked wrong and earn no XP.</div>}
        <div className="flex flex-wrap justify-between gap-2">
          <Button onClick={() => go(i)}><ArrowLeft size={14} /> Back to questions</Button>
          <Button variant="primary" disabled={busy || !user} onClick={() => void submit()}>
            <ClipboardCheck size={15} /> {busy ? "Submitting…" : "Submit quiz"}
          </Button>
        </div>
        {!user && <div className="text-right text-xs text-warn">Sign in to submit and earn XP.</div>}
      </div>
    );

  // ───────── answering ─────────
  const q = questions[i];
  const chosen = answers[q.id];
  const st = stateOf(q);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="font-semibold text-text">{title}</span>
        <span>
          Question <b className="text-text">{i + 1}</b> of {questions.length}
        </span>
      </div>
      <Progress value={(counts.answered / questions.length) * 100} tone="accent" />
      {palette}
      {legend}
      <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wider">
        <span className="text-accent-ink">{TYPE_LABEL[q.type]}</span>
        <span className="text-dim">difficulty {q.difficulty} · {q.xp} XP{already.has(q.id) ? " (already earned)" : ""}</span>
        {st === "skipped" && <span className="text-warn">skipped</span>}
      </div>
      <div className="whitespace-pre-line text-base text-text">{q.prompt}</div>
      {q.code && <pre className="bf-code overflow-auto rounded-lg p-3 font-mono text-xs">{q.code}</pre>}
      {q.diagram && <Diagram spec={q.diagram} />}
      <div className="grid gap-2" role="radiogroup" aria-label="Answer options">
        {q.options.map((o, k) => {
          const sel = chosen === k;
          return (
            <button
              key={k}
              role="radio"
              aria-checked={sel}
              onClick={() => choose(q.id, k)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition ${sel ? "border-accent bg-accent/10 text-text" : "border-line hover:border-line2 hover:bg-panel2"}`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-xs ${sel ? "bg-accent text-white" : "bg-bg2 text-dim"}`}>{optionLetter(k)}</span>
              <span className="flex-1">{o}</span>
              {sel && <CheckCircle2 size={16} className="text-accent-ink" />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button disabled={i === 0} onClick={() => go(i - 1)} aria-label="Previous question">
          <ArrowLeft size={14} /> Previous
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={skip} aria-label="Skip question">
            <SkipForward size={14} /> Skip
          </Button>
          {i < questions.length - 1 ? (
            <Button variant="secondary" onClick={() => go(i + 1)} aria-label="Next question">
              Next <ArrowRight size={14} />
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setPhase("review")}>
              <ClipboardCheck size={14} /> Review &amp; submit
            </Button>
          )}
        </div>
      </div>
      {i < questions.length - 1 && (
        <div className="text-right">
          <button className="text-xs text-muted underline-offset-2 hover:text-text hover:underline" onClick={() => setPhase("review")}>
            Review &amp; submit now
          </button>
        </div>
      )}
    </div>
  );
}
