"use client";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Panel } from "@/components/ui";
import type { Project } from "@/lib/types";
import type { Progress, XpEvent } from "@/lib/data/types";
import { TOPICS } from "@/lib/learning";
import { workspaceHref } from "@/components/shell/AppShell";

/**
 * "What should I do next?" — a short checklist built from what the student has actually done, so new
 * students always know where to go and regulars see today's learning task (which also avoids the daily
 * XP penalty).
 */
export function NextSteps({ projects, progress, events }: { projects: Project[]; progress: Progress | null; events: XpEvent[] }) {
  const today = new Date().toDateString();
  const learnedToday =
    (progress?.quizAttempts ?? []).some((a) => new Date(a.at).toDateString() === today) ||
    events.some((e) => (e.type === "lesson-complete" || e.type === "question-correct") && new Date(e.at).toDateString() === today);
  const own = projects.filter((p) => !p.origin);
  const has = (t: XpEvent["type"]) => events.some((e) => e.type === t);
  const nextTopic = TOPICS.find((t) => !(progress?.completedTopics ?? []).includes(t.id)) ?? TOPICS[0];
  const latest = own[0];

  const steps = [
    { done: learnedToday, title: "Study today", detail: `Read “${nextTopic.title}” or take a quiz — a day without learning costs XP.`, href: `/learn/${nextTopic.id}` },
    { done: (progress?.quizAttempts.length ?? 0) > 0, title: "Take a quiz", detail: "Every topic ends with a mini quiz; see your weak spots afterwards.", href: `/learn/${nextTopic.id}#quiz` },
    { done: own.length > 0, title: "Start your own robot", detail: "Pick a competition and create a project (Garage robots are great for ideas).", href: "/projects" },
    { done: has("validation-pass"), title: "Design and validate it", detail: "Add components, wire them, then press Validate — +60 XP when it passes.", href: latest ? `/workspace/${latest.id}/circuit` : "/projects" },
    { done: has("code-check-pass"), title: "Write your own code", detail: "Code that matches your circuit earns +80 XP (templates earn none).", href: latest ? `/workspace/${latest.id}/code` : workspaceHref(null, "code") },
    { done: has("lap-complete") || has("sumo-win"), title: "Simulate and win", detail: "Finish a track or win a sumo match with your own code — +150 XP.", href: latest ? `/workspace/${latest.id}/arena` : workspaceHref(null, "arena") },
  ];
  const next = steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Panel title="Your next steps" actions={<span className="font-mono text-xs text-muted">{doneCount}/{steps.length} done</span>} bodyClass="p-0">
      <ol>
        {steps.map((s, i) => (
          <li key={s.title} className="border-t border-line first:border-0">
            <Link href={s.href} className={`flex items-center gap-3 px-4 py-3 hover:bg-panel2 ${i === next ? "bg-accent/[.06]" : ""}`}>
              {s.done ? <CheckCircle2 size={18} className="shrink-0 text-ok" aria-label="Done" /> : <Circle size={18} className={`shrink-0 ${i === next ? "text-accent-ink" : "text-dim"}`} aria-label="To do" />}
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${s.done ? "text-muted line-through decoration-[var(--line2)]" : "text-text"}`}>{s.title}</span>
                <span className="block text-xs text-muted">{s.detail}</span>
              </span>
              {i === next && <span className="hidden items-center gap-1 text-xs font-semibold text-accent-ink sm:flex">Next <ArrowRight size={13} /></span>}
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
