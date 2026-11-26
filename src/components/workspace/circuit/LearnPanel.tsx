"use client";
import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { lessonFor } from "@/lib/components/learn";
import { supportOf } from "@/lib/components/support";
import type { ComponentRecord } from "@/lib/types";

const TABS = ["Intro", "Pins", "Connect", "Mistakes", "Uses", "Q&A"] as const;
type Tab = (typeof TABS)[number];

/** Learning mode: a short beginner lesson for the selected component. */
export function LearnPanel({ comp }: { comp: ComponentRecord }) {
  const l = lessonFor(comp);
  const s = supportOf(comp);
  const [tab, setTab] = useState<Tab>("Intro");
  const available = TABS.filter((t) => t === "Intro" || t === "Pins" || (t === "Connect" && l.connect.length) || (t === "Mistakes" && l.mistakes.length) || (t === "Uses" && l.uses.length) || (t === "Q&A" && l.qa.length));
  return (
    <div className="space-y-2" data-testid="learn-panel">
      <div className="flex items-center gap-2 text-brand"><GraduationCap size={16} /><span className="bf-label text-brand">Learning mode</span></div>
      <div className="font-display text-base font-semibold">{l.title}</div>
      <div className="flex flex-wrap gap-1">
        {available.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded px-2 py-0.5 text-[11px] ${tab === t ? "bg-accent text-white" : "bg-panel text-muted hover:text-text"}`}>{t}</button>
        ))}
      </div>
      <div className="space-y-2 text-xs leading-relaxed">
        {tab === "Intro" && (
          <>
            <p>{l.intro}</p>
            <p className="text-muted"><span className="font-semibold text-text">How it works: </span>{l.how}</p>
          </>
        )}
        {tab === "Pins" && (
          <table className="w-full">
            <tbody>{l.pins.map((p) => <tr key={p.pin} className="border-b border-line/50 align-top"><td className="py-1 pr-2 font-mono text-brand">{p.pin}</td><td className="py-1 text-muted">{p.text}</td></tr>)}</tbody>
          </table>
        )}
        {tab === "Connect" && <ol className="list-decimal space-y-1 pl-4">{l.connect.map((c) => <li key={c}>{c}</li>)}</ol>}
        {tab === "Mistakes" && <ul className="list-disc space-y-1 pl-4">{l.mistakes.map((c) => <li key={c}>{c}</li>)}</ul>}
        {tab === "Uses" && <ul className="list-disc space-y-1 pl-4">{l.uses.map((c) => <li key={c}>{c}</li>)}</ul>}
        {tab === "Q&A" && (
          <div className="space-y-2">
            {l.qa.map((q) => (
              <details key={q.q} className="rounded border border-line px-2 py-1">
                <summary className="cursor-pointer font-semibold">{q.q}</summary>
                <p className="mt-1 text-muted">{q.a}</p>
              </details>
            ))}
          </div>
        )}
      </div>
      <div className={`rounded border px-2 py-1 text-[11px] ${s.level === "full" ? "border-ok/40 text-ok" : s.level === "limited" ? "border-info/40 text-info" : "border-warn/40 text-warn"}`}>
        <span className="font-mono">{s.label}</span> — <span className="text-muted">{s.model}</span>
        {s.limits.length > 0 && <div className="text-muted">Not modelled: {s.limits.join(" ")}</div>}
      </div>
    </div>
  );
}
