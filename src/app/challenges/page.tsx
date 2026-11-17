"use client";
import { useState } from "react";
import { Award, Clock, Swords } from "lucide-react";
import { QUIZZES, getQuestion } from "@/lib/learning";
import { useApp } from "@/lib/store/app";
import { Badge, Button, PageHeader, Panel } from "@/components/ui";
import { QuizRunner } from "@/components/learn/QuizRunner";
import Link from "next/link";

const KIND_LABEL = { competition: "Competition quiz", weekly: "Weekly quiz", challenge: "Engineering challenge", final: "Final examination" } as const;

export default function ChallengesPage() {
  const { progress, user } = useApp();
  const [active, setActive] = useState<string | null>(null);
  const quiz = QUIZZES.find((q) => q.id === active);
  const best = (id: string) => Math.max(-1, ...(progress?.quizAttempts.filter((a) => a.quizId === id).map((a) => a.percent) ?? []));

  if (quiz)
    return (
      <div className="mx-auto max-w-3xl px-5 py-8">
        <button className="mb-3 text-xs text-muted hover:text-text" onClick={() => setActive(null)}>← All challenges</button>
        <Panel title={quiz.title} actions={<Badge tone="accent">Pass {quiz.passPercent}%</Badge>}>
          <QuizRunner quizId={quiz.id} questions={quiz.questionIds.map((id) => getQuestion(id)!).filter(Boolean)} title={quiz.title} passPercent={quiz.passPercent} />
        </Panel>
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <PageHeader kicker="PROVE YOUR SKILLS" title="Challenges">
        Topic quizzes live inside each Beast Topic. Here are the competition quizzes, weekly quizzes, advanced engineering challenges and the Final Beast Engineer examination. Simulation challenges are completed in the Simulation Arena.
      </PageHeader>
      {!user && <div className="mb-4 rounded border border-warn/40 bg-warn/5 p-3 text-sm text-warn">Sign in to record results and earn XP.</div>}
      {(["final", "competition", "challenge", "weekly"] as const).map((kind) => (
        <section key={kind} className="mb-8">
          <h2 className="mb-3 font-display text-lg font-semibold">{KIND_LABEL[kind]}s</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QUIZZES.filter((q) => q.kind === kind).map((q) => {
              const b = best(q.id);
              return (
                <div key={q.id} className={`bf-panel flex flex-col justify-between p-4 ${kind === "final" ? "bf-glow-accent" : ""}`}>
                  <div>
                    <div className="flex items-center gap-2">{kind === "final" ? <Award className="text-accent-ink" size={18} /> : <Swords className="text-brand" size={16} />}<span className="font-display font-semibold">{q.title}</span></div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      <Badge>{q.questionIds.length} questions</Badge>
                      <Badge tone="accent">pass {q.passPercent}%</Badge>
                      {q.pathId && <Badge tone="brand">{q.pathId}</Badge>}
                      {q.timeLimitS && <Badge><Clock size={10} className="mr-1" />{Math.round(q.timeLimitS / 60)} min</Badge>}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className={`text-xs ${b >= q.passPercent ? "text-ok" : "text-dim"}`}>{b < 0 ? "Not attempted" : `Best: ${b}%`}</span>
                    <Button size="sm" variant="primary" onClick={() => setActive(q.id)}>{b < 0 ? "Start" : "Retry"}</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <Panel title="Simulation challenges">
        <ul className="space-y-1 text-sm text-muted">
          <li>▸ Complete any race track with your own code — <b className="text-text">+40 XP</b> per track</li>
          <li>▸ Beat your best lap time — <b className="text-text">+15 XP</b> per new record</li>
          <li>▸ Win a sumo match — <b className="text-text">+60 XP</b> per opponent level per arena (Advanced/Beast unlock <i>Simulation Champion</i>)</li>
          <li>▸ Complete a line track with your own code — unlocks <i>Sensor Expert</i></li>
        </ul>
        <Link href="/projects" className="mt-3 inline-block text-sm text-accent-ink">Open a project → Simulation Arena</Link>
      </Panel>
    </div>
  );
}
