"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, FastForward, Pause, Play, RotateCcw, ShieldAlert, Wrench, X } from "lucide-react";
import { useApp } from "@/lib/store/app";
import { useWorkspace } from "@/lib/store/workspace";
import { planRepair, REPAIRABLE, type RepairPlan, type RepairStep } from "@/lib/circuit/repair";
import { validateProject } from "@/lib/circuit/validate";
import { designFingerprint } from "@/lib/fingerprint";
import type { Project, ValidationIssue } from "@/lib/types";
import { Button } from "@/components/ui";

const STEP_MS: Record<RepairStep["kind"], number> = { identify: 3800, disconnect: 3200, configure: 3200, select: 3200, add: 3600, connect: 4600, test: 0 };

export interface RepairResult {
  resolved: boolean;
  remaining: ValidationIssue | null;
  newProblems: number;
}

export interface RepairPlayerState {
  plan: RepairPlan | null;
  idx: number;
  step: RepairStep | null;
  playing: boolean;
  applied: boolean;
  result: RepairResult | null;
}

/** Drives one repair: builds the plan, steps through it, applies it at the "test" step and re-validates. */
export function useRepairPlayer(project: Project) {
  const req = useWorkspace((s) => s.repair);
  const set = useWorkspace((s) => s.set);
  const { updateProject, user, toast } = useApp();
  const [built, setBuilt] = useState<{ at: number; plan: RepairPlan | null; before: Project } | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [result, setResult] = useState<RepairResult | null>(null);

  // a new FIX IT request: build its plan from the circuit as it is now
  if (req && built?.at !== req.at) {
    setBuilt({ at: req.at, plan: planRepair(project, req.issue), before: project });
    setIdx(0);
    setResult(null);
    setPlaying(true);
  } else if (!req && built) setBuilt(null);

  // cannot be repaired safely on this circuit: show where it is instead (workspace store, not React state)
  useEffect(() => {
    if (!built || built.plan || !req || built.at !== req.at) return;
    useWorkspace.getState().focusIssue(req.issue);
    set({ repair: null });
    toast("info", "This problem needs your decision, so it is not repaired automatically. It is highlighted on the schematic.");
  }, [built, req, set, toast]);

  const plan = built?.plan ?? null;
  const last = plan ? plan.steps.length - 1 : 0;
  const applied = result !== null;

  const apply = useCallback(() => {
    if (!plan || !req || result) return;
    let res: RepairResult | null = null;
    updateProject(project.id, (p) => {
      const after = plan.apply(p);
      const report = validateProject(after, user?.name ?? "Engineer");
      const prev = validateProject(p, user?.name ?? "Engineer");
      const keyOf = (i: ValidationIssue) => `${i.code}|${i.partUid}|${i.pinId}`;
      const prevKeys = new Set(prev.issues.filter((i) => i.severity === "critical").map(keyOf));
      const still = report.issues.find((i) => i.code === req.issue.code && i.partUid === req.issue.partUid && (i.pinId ?? null) === (req.issue.pinId ?? null)) ?? null;
      res = { resolved: !still, remaining: still, newProblems: report.issues.filter((i) => i.severity === "critical" && !prevKeys.has(keyOf(i))).length };
      return { ...after, validation: { ...report, fingerprint: designFingerprint(after) } };
    });
    setResult(res);
  }, [plan, req, result, updateProject, project.id, user?.name]);

  const revert = () => {
    if (!result || !built) return;
    const snap = built.before;
    updateProject(project.id, () => snap);
    setResult(null);
  };

  /** Move to a step; reaching the last ("test") step applies the repair and re-runs validation. */
  const goTo = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(last, i));
      setIdx(n);
      if (n === last) apply();
    },
    [last, apply],
  );

  // auto-advance (the timer callback moves the step)
  useEffect(() => {
    if (!plan || !playing || idx >= last) return;
    const t = setTimeout(() => goTo(idx + 1), STEP_MS[plan.steps[idx].kind]);
    return () => clearTimeout(t);
  }, [plan, playing, idx, last, goTo]);

  const controls = {
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    next: () => goTo(idx + 1),
    prev: () => {
      if (idx === last && result) revert();
      setIdx(Math.max(0, idx - 1));
    },
    restart: () => {
      if (result) revert();
      setIdx(0);
      setPlaying(true);
    },
    skip: () => {
      setPlaying(false);
      goTo(last);
    },
    close: () => set({ repair: null }),
    /** continue with the next repairable problem (re-validated on the current circuit) */
    nextIssue: () => {
      const report = validateProject(project, user?.name ?? "Engineer");
      const order = { critical: 0, warning: 1, suggestion: 2 };
      const next = report.issues
        .filter((i) => REPAIRABLE.has(i.code) && i.severity !== "suggestion")
        .filter((i) => !(result && !result.resolved && req && i.code === req.issue.code && i.partUid === req.issue.partUid))
        .sort((a, b) => order[a.severity] - order[b.severity])[0];
      if (next) set({ repair: { issue: next, at: Date.now(), queue: [] } });
      else {
        set({ repair: null });
        toast("success", "No more problems that can be repaired automatically. Run VALIDATE MY ROBOT for the full report.");
      }
    },
  };
  const state: RepairPlayerState = { plan, idx, step: plan?.steps[idx] ?? null, playing, applied, result };
  return { state, controls, issue: req?.issue ?? null };
}

/** Step indicator, explanation and the player controls (bottom of the canvas). */
export function RepairControls({ player }: { player: ReturnType<typeof useRepairPlayer> }) {
  const { state, controls, issue } = player;
  if (!state.plan || !state.step || !issue) return null;
  const n = state.plan.steps.length;
  const s = state.step;
  const progress = ((state.idx + 1) / n) * 100;
  return (
    <div className="absolute inset-x-2 bottom-2 z-20 mx-auto max-w-2xl rounded-lg border border-brand/50 bg-bg/95 shadow-xl backdrop-blur sm:inset-x-auto sm:left-1/2 sm:w-[min(640px,92%)] sm:-translate-x-1/2" role="region" aria-label="Repair assistant" data-testid="repair-player">
      <div className="h-1 overflow-hidden rounded-t-lg bg-line"><div className="h-full bg-brand transition-all duration-500" style={{ width: `${progress}%` }} /></div>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wrench size={16} className="text-brand" />
            <div className="font-mono text-[11px] tracking-widest text-brand" data-testid="repair-step">STEP {state.idx + 1}/{n} — {s.title.toUpperCase()}</div>
          </div>
          <button onClick={controls.close} className="text-muted hover:text-text" aria-label="Close repair assistant"><X size={16} /></button>
        </div>
        {state.idx === 0 && <div className="font-display text-sm font-semibold">{state.plan.intro}</div>}
        <p className="text-sm" aria-live="polite">{s.explanation}</p>
        {s.kind === "connect" && state.plan.codeHint && <div className="bf-code rounded px-2 py-1 font-mono text-[11px]">{state.plan.codeHint}</div>}
        {s.kind === "test" && state.result && (
          <div className={`flex items-start gap-2 rounded border px-2 py-1.5 text-sm ${state.result.resolved ? "border-ok/50 bg-ok/10 text-ok" : "border-bad/50 bg-bad/10 text-bad"}`} data-testid="repair-result">
            {state.result.resolved ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <ShieldAlert size={16} className="mt-0.5 shrink-0" />}
            <div>
              {state.result.resolved ? "Fixed! The validator no longer reports this problem." : `Still a problem: ${state.result.remaining?.title}`}
              {state.result.newProblems > 0 && <div className="text-warn">The repair revealed {state.result.newProblems} other problem(s) — see the validation list.</div>}
              <div className="text-xs text-muted">Changed: {state.plan.removes.length} wire(s) removed, {state.plan.adds.length} added. Press Ctrl+Z to undo.</div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {state.playing && state.idx < n - 1 ? (
            <Button size="sm" onClick={controls.pause} aria-label="Pause"><Pause size={13} /> Pause</Button>
          ) : (
            <Button size="sm" onClick={controls.play} disabled={state.idx >= n - 1} aria-label="Play"><Play size={13} /> Play</Button>
          )}
          <Button size="sm" onClick={controls.prev} disabled={state.idx === 0} aria-label="Previous step"><ChevronLeft size={13} /> Previous</Button>
          <Button size="sm" onClick={controls.next} disabled={state.idx >= n - 1} aria-label="Next step">Next <ChevronRight size={13} /></Button>
          <Button size="sm" onClick={controls.restart} aria-label="Restart"><RotateCcw size={13} /> Restart</Button>
          {state.idx < n - 1 && <Button size="sm" onClick={controls.skip} aria-label="Skip animation"><FastForward size={13} /> Skip animation</Button>}
          {state.result && <Button size="sm" variant="primary" className="ml-auto" onClick={controls.nextIssue}>Next problem →</Button>}
        </div>
        <div className="flex gap-1" aria-hidden>
          {state.plan.steps.map((st, i) => <div key={i} title={st.title} className={`h-1.5 flex-1 rounded ${i < state.idx ? "bg-brand/60" : i === state.idx ? "bg-brand" : "bg-line"}`} />)}
        </div>
      </div>
    </div>
  );
}
