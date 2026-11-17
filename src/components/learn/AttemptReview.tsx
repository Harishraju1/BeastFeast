"use client";
import Link from "next/link";
import { useState } from "react";
import { BookOpen, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import type { ReviewedAttempt } from "@/lib/learning/history";
import { optionLetter } from "@/lib/learning/history";

/** Question-by-question review of one quiz attempt: your answer, the correct answer and why. */
export function AttemptReview({ review, defaultMistakesOnly = true }: { review: ReviewedAttempt; defaultMistakesOnly?: boolean }) {
  const [onlyWrong, setOnlyWrong] = useState(defaultMistakesOnly && review.wrong.length > 0);
  const shown = onlyWrong ? review.wrong : review.items;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted">
          {review.wrong.length === 0 ? (
            <span className="text-ok">Every question answered correctly.</span>
          ) : (
            <>
              <span className="font-semibold text-accent-ink">{review.wrong.length}</span> to review · {review.items.length - review.wrong.length} correct
            </>
          )}
        </div>
        {review.wrong.length > 0 && (
          <div className="flex rounded-md border border-line p-0.5 text-xs" role="tablist" aria-label="Which questions to show">
            <button role="tab" aria-selected={onlyWrong} onClick={() => setOnlyWrong(true)} className={`rounded px-2.5 py-1 ${onlyWrong ? "bg-accent text-white" : "text-muted hover:text-text"}`}>
              Mistakes only
            </button>
            <button role="tab" aria-selected={!onlyWrong} onClick={() => setOnlyWrong(false)} className={`rounded px-2.5 py-1 ${!onlyWrong ? "bg-accent text-white" : "text-muted hover:text-text"}`}>
              All questions
            </button>
          </div>
        )}
      </div>

      <ol className="space-y-3">
        {shown.map((it) => {
          const n = review.items.indexOf(it) + 1;
          const q = it.question;
          return (
            <li key={q.id} className={`rounded-lg border p-4 ${it.correct ? "border-ok/30 bg-ok/[.04]" : "border-bad/40 bg-bad/[.05]"}`}>
              <div className="flex items-start gap-3">
                {it.correct ? (
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" aria-label="Correct" />
                ) : it.chosen === null ? (
                  <MinusCircle size={18} className="mt-0.5 shrink-0 text-warn" aria-label="Not answered" />
                ) : (
                  <XCircle size={18} className="mt-0.5 shrink-0 text-bad" aria-label="Wrong" />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="text-xs font-mono text-dim">Question {n}</div>
                  <div className="whitespace-pre-line text-sm text-text">{q.prompt}</div>
                  {q.code && <pre className="bf-code overflow-auto rounded-lg p-3 font-mono text-xs">{q.code}</pre>}
                  <div className="grid gap-1.5 text-sm">
                    {!it.correct && (
                      <div className="flex gap-2">
                        <span className="w-28 shrink-0 text-dim">Your answer</span>
                        <span className={it.chosen === null ? "text-warn" : "text-bad"}>
                          {it.chosen === null ? "Not answered" : `${optionLetter(it.chosen)}. ${q.options[it.chosen] ?? "—"}`}
                        </span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <span className="w-28 shrink-0 text-dim">{it.correct ? "Your answer" : "Correct answer"}</span>
                      <span className="text-ok">
                        {optionLetter(q.answerIndex)}. {q.options[q.answerIndex]}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-md border border-line bg-bg2 px-3 py-2 text-sm text-muted">
                    <span className="font-semibold text-text">Why: </span>
                    {q.explanation}
                  </div>
                  {!it.correct && it.topicId && (
                    <Link href={`/learn/${it.topicId}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-ink hover:underline">
                      <BookOpen size={13} /> Revise “{it.topicTitle}”
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
