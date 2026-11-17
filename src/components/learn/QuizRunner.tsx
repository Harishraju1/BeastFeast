"use client";
import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { QuizQuestion } from "@/lib/learning/types";
import { useApp } from "@/lib/store/app";
import { getBackend } from "@/lib/data";
import type { QuizAttempt } from "@/lib/data/types";
import { Button, Progress } from "@/components/ui";
import { Diagram } from "./Diagram";
import Link from "next/link";
import { History } from "lucide-react";
import { AttemptReview } from "./AttemptReview";
import { reviewAttempt } from "@/lib/learning/history";

const TYPE_LABEL: Record<QuizQuestion["type"], string> = {
  mcq: "Multiple choice", "identify-component": "Identify the component", "identify-pin": "Identify the pin", "predict-circuit": "Predict circuit behaviour", "find-wrong-connection": "Find the wrong connection",
  "identify-driver": "Identify the motor driver", "code-output": "Understand code output", "debug-code": "Debug the program", calculate: "Calculate", "predict-movement": "Predict robot movement",
};

/**
 * Immediate feedback per question; the attempt is graded by the backend (server-side in Supabase mode)
 * and XP is only ever awarded once per question.
 */
export function QuizRunner({ quizId, questions, title, passPercent, onDone }: { quizId: string; questions: QuizQuestion[]; title: string; passPercent: number; onDone?: (a: QuizAttempt) => void }) {
  const { user, progress, refreshUser, toast, content } = useApp();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<QuizAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const q = questions[i];
  const already = new Set(progress?.correctQuestions ?? []);

  const submit = async () => {
    if (!user) return toast("error", "Sign in to save quiz results and earn XP.");
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
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (result)
    return (
      <div className="space-y-5">
        <div className="space-y-2 text-center">
          <div className={`font-display text-4xl font-bold ${result.passed ? "text-ok" : "text-warn"}`}>{result.percent}%</div>
          <div className="text-sm text-muted">{result.correct} / {result.total} correct · {result.passed ? "PASSED" : `Pass mark ${passPercent}%`} · +{result.xpAwarded} XP</div>
          <div className="text-xs text-dim">XP is awarded once per correctly answered question — retakes help you learn but don&apos;t farm points.</div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button onClick={() => { setResult(null); setAnswers({}); setI(0); setRevealed(false); }}>Try again</Button>
            <Link href="/learn/history" className="inline-flex items-center gap-2 rounded-md border border-line2 px-3.5 py-2 text-sm text-heading hover:border-accent hover:bg-panel2"><History size={14} /> Quiz history</Link>
          </div>
        </div>
        <div className="border-t border-line pt-4">
          <div className="bf-label mb-3">Review this attempt</div>
          <AttemptReview review={reviewAttempt(result, content.extraQuestions)} />
        </div>
      </div>
    );

  if (!q) return <div className="text-sm text-muted">No questions.</div>;
  const chosen = answers[q.id];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="font-semibold text-text">{title}</span>
        <span>Question {i + 1} / {questions.length}</span>
      </div>
      <Progress value={((i + (revealed ? 1 : 0)) / questions.length) * 100} tone="brand" />
      <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wider">
        <span className="text-accent-ink">{TYPE_LABEL[q.type]}</span>
        <span className="text-dim">difficulty {q.difficulty} · {q.xp} XP{already.has(q.id) ? " (already earned)" : ""}</span>
      </div>
      <div className="whitespace-pre-line text-base">{q.prompt}</div>
      {q.code && <pre className="bf-code overflow-auto rounded-lg p-3 font-mono text-xs text-[#cfe3ff]">{q.code}</pre>}
      {q.diagram && <Diagram spec={q.diagram} />}
      <div className="grid gap-2">
        {q.options.map((o, k) => {
          const isRight = k === q.answerIndex;
          const state = !revealed ? (chosen === k ? "sel" : "") : isRight ? "right" : chosen === k ? "wrong" : "";
          return (
            <button key={k} disabled={revealed} onClick={() => setAnswers({ ...answers, [q.id]: k })} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${state === "sel" ? "border-brand bg-brand/10" : state === "right" ? "border-ok bg-ok/10" : state === "wrong" ? "border-bad bg-bad/10" : "border-line hover:border-line2"}`}>
              <span className="w-5 font-mono text-dim">{String.fromCharCode(65 + k)}</span>
              <span className="flex-1">{o}</span>
              {state === "right" && <CheckCircle2 size={16} className="text-ok" />}
              {state === "wrong" && <XCircle size={16} className="text-bad" />}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className={`rounded-lg border p-3 text-sm ${chosen === q.answerIndex ? "border-ok/40 bg-ok/5" : "border-bad/40 bg-bad/5"}`}>
          <div className="font-semibold">{chosen === q.answerIndex ? "Correct!" : `Not quite — the answer is ${String.fromCharCode(65 + q.answerIndex)}.`}</div>
          <div className="mt-1 text-muted">{q.explanation}</div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        {!revealed ? (
          <Button variant="secondary" disabled={chosen === undefined} onClick={() => setRevealed(true)}>Check answer</Button>
        ) : i < questions.length - 1 ? (
          <Button variant="primary" onClick={() => { setI(i + 1); setRevealed(false); }}>Next →</Button>
        ) : (
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>{busy ? "Submitting…" : "Finish & submit"}</Button>
        )}
      </div>
    </div>
  );
}
