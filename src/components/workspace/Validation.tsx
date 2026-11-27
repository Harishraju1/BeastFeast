"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, CheckCircle2, Lightbulb, Repeat2, ShieldAlert, Wrench, X } from "lucide-react";
import { planRepair, REPAIRABLE } from "@/lib/circuit/repair";
import { useApp } from "@/lib/store/app";
import { useWorkspace } from "@/lib/store/workspace";
import { validateProject } from "@/lib/circuit/validate";
import type { Project, ValidationIssue } from "@/lib/types";
import { designFingerprint } from "@/lib/fingerprint";
import { Button } from "@/components/ui";

/** Runs the real validation engine with a scanning animation that walks over every component. */
export function useValidate(project: Project | undefined) {
  const { user, updateProject, award, content, toast } = useApp();
  const ws = useWorkspace();
  return async () => {
    if (!project) return;
    ws.set({ scanning: true, reportOpen: false, focus: null });
    const order = project.parts.filter((p) => p.inCircuit || true).map((p) => p.uid);
    const per = Math.max(60, Math.min(220, 1600 / Math.max(order.length, 1)));
    for (const uid of order) {
      ws.set({ scanPart: uid });
      await new Promise((r) => setTimeout(r, per));
    }
    const r = content.rules.sumo;
    const report = validateProject(project, user?.name ?? "Engineer", { maxLength_mm: r.maxLength_mm, maxWidth_mm: r.maxWidth_mm, maxMass_g: r.maxMass_g });
    updateProject(project.id, (p) => ({ ...p, validation: { ...report, fingerprint: designFingerprint(project) } }), { history: false });
    ws.set({ scanning: false, scanPart: null, reportOpen: true });
    if (report.passed) {
      if (project.origin) toast("info", "Design passes — Garage designs don't earn design XP. Build your own robot to earn it.");
      else await award("validation-pass", project.id, undefined, `Robot design passed validation: ${project.name}`);
    }
  };
}

export function ScanOverlay() {
  const scanning = useWorkspace((s) => s.scanning);
  if (!scanning) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden bg-sage-900/25">
      <div className="bf-scanline absolute left-0 right-0 h-24 bg-gradient-to-b from-transparent via-brand/25 to-transparent" />
      <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded border border-brand/50 bg-bg/80 px-4 py-2 font-mono text-xs tracking-[0.3em] text-brand">SCANNING ROBOT SYSTEMS…</div>
    </div>
  );
}

/** Report categories, in the order they are shown. */
const CATEGORIES: [ValidationIssue["area"], string][] = [["safety", "Safety checks"], ["electrical", "Electrical validation"], ["power", "Power validation"], ["compatibility", "Component compatibility"], ["mechanical", "Mechanical validation"], ["simulation", "Simulation support"], ["code", "Code"]];

const SEV = {
  critical: { icon: ShieldAlert, cls: "border-bad/50 bg-bad/10", text: "text-bad", label: "CRITICAL ERROR" },
  warning: { icon: AlertTriangle, cls: "border-warn/40 bg-warn/5", text: "text-warn", label: "WARNING" },
  suggestion: { icon: Lightbulb, cls: "border-info/40 bg-info/5", text: "text-info", label: "IMPROVEMENT SUGGESTION" },
};

/** The workspace action that starts the animated repair (or falls back to highlighting the faulty part). */
export function startFix(issue: ValidationIssue, queue: ValidationIssue[] = []) {
  const ws = useWorkspace.getState();
  if (REPAIRABLE.has(issue.code)) ws.set({ repair: { issue, at: Date.now(), queue }, reportOpen: false, explain: null });
  else ws.focusIssue(issue);
}

export function IssueCard({ issue, n, onFix, project, compact = false }: { issue: ValidationIssue; n: number; onFix?: () => void; project?: Project; compact?: boolean }) {
  const s = SEV[issue.severity];
  const Icon = s.icon;
  const [open, setOpen] = useState(false);
  const plan = useMemo(() => (open && project && REPAIRABLE.has(issue.code) ? planRepair(project, issue) : null), [open, project, issue]);
  const part = project?.parts.find((p) => p.uid === issue.partUid);
  const canRepair = REPAIRABLE.has(issue.code) && !!project;
  return (
    <div className={`rounded-lg border p-3 ${s.cls}`}>
      <div className="flex items-start gap-3">
        <Icon size={18} className={`mt-0.5 shrink-0 ${s.text}`} />
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-mono text-[10px] tracking-widest ${s.text}`}>
              #{n} {s.label} · {issue.area.toUpperCase()}
            </span>
            <span className="font-mono text-[10px] text-dim">{issue.code}</span>
          </div>
          <div className="font-display font-semibold">{issue.title}</div>
          {issue.incorrect && (
            <div className="text-xs">
              <span className="text-dim">Found: </span>
              <span className="font-mono">{issue.incorrect}</span>
            </div>
          )}
          {!compact && <div className="text-xs text-muted">{issue.explanation}</div>}
          <div className="text-xs">
            <span className="text-ok">Fix: </span>
            {issue.fix}
          </div>
          {open && (
            <div className="mt-2 space-y-1.5 rounded border border-line bg-bg/60 p-2 text-xs" data-testid="issue-explain">
              <div><span className="bf-label">What is wrong</span><div>{issue.incorrect ?? issue.title}</div></div>
              <div><span className="bf-label">Why it matters</span><div className="text-muted">{issue.explanation}</div></div>
              {(part || issue.pinId) && <div><span className="bf-label">Affected</span><div className="font-mono">{part?.label ?? "—"}{issue.pinId ? ` · pin ${issue.pinId}` : ""}</div></div>}
              <div><span className="bf-label">Recommended solution</span><div>{issue.fix}</div></div>
              {plan ? (
                <div><span className="bf-label">Automatic repair</span><ol className="list-decimal pl-4 text-muted">{plan.steps.map((st, i) => <li key={i}>{st.title}</li>)}</ol></div>
              ) : canRepair ? null : project && <div className="text-dim">This one needs your decision, so it is not repaired automatically. FIX IT shows you exactly where it is.</div>}
            </div>
          )}
          {project && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}><BookOpen size={12} /> {open ? "Hide explanation" : "Explain problem"}</Button>
              {issue.area !== "mechanical" && (
                <Button size="sm" variant="primary" onClick={onFix ?? (() => startFix(issue))}><Wrench size={12} /> FIX IT</Button>
              )}
              {issue.partUid && <Button size="sm" variant="secondary" data-alt="1" onClick={() => useWorkspace.getState().set({ recommendFor: issue.partUid!, reportOpen: false })}><Repeat2 size={12} /> Better alternative</Button>}
            </div>
          )}
        </div>
        {!project && onFix && (issue.partUid || issue.pinId) && (
          <Button size="sm" variant="primary" onClick={onFix}>
            <Wrench size={12} /> FIX IT
          </Button>
        )}
      </div>
    </div>
  );
}

export function ValidationReportModal({ project }: { project: Project }) {
  const ws = useWorkspace();
  const user = useApp((s) => s.user);
  const router = useRouter();
  const rep = project.validation;
  if (!ws.reportOpen || !rep) return null;
  const crit = rep.issues.filter((i) => i.severity === "critical");
  const fix = (i: ValidationIssue) => {
    // mechanical issues are shown in 3D; electrical ones are repaired (animated) or highlighted on the schematic
    if (i.area === "mechanical") ws.focusIssue(i);
    else startFix(i);
    const tab = i.area === "mechanical" ? "design" : "circuit";
    if (!location.pathname.endsWith(`/${tab}`)) router.push(`/workspace/${project.id}/${tab}`);
  };
  const goCircuit = () => {
    if (!location.pathname.endsWith("/circuit")) router.push(`/workspace/${project.id}/circuit`);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sage-900/45 p-4 backdrop-blur-sm" onMouseDown={() => ws.set({ reportOpen: false })}>
      <div className={`bf-panel max-h-[88vh] w-full max-w-3xl overflow-hidden ${rep.passed ? "bf-glow-brand" : "bf-glow-accent"}`} onMouseDown={(e) => e.stopPropagation()}>
        <header className={`flex items-center justify-between px-5 py-4 ${rep.passed ? "bg-ok/10" : "bg-bad/10"}`}>
          <div className="flex items-center gap-3">
            {rep.passed ? <CheckCircle2 className="text-ok" size={28} /> : <ShieldAlert className="text-bad" size={28} />}
            <div>
              <div className="font-display text-xl font-bold">{rep.passed ? "ROBOT SYSTEMS VERIFIED!" : `HEY ${(user?.name ?? "ENGINEER").toUpperCase()}! YOUR ROBOT NEEDS SOME FIXES!`}</div>
              <div className="text-xs text-muted">
                {rep.checksRun} checks · {crit.length} critical · {rep.issues.filter((i) => i.severity === "warning").length} warnings · {rep.issues.filter((i) => i.severity === "suggestion").length} improvement suggestions · {rep.passedChecks?.length ?? 0} groups passed
              </div>
            </div>
          </div>
          <button onClick={() => ws.set({ reportOpen: false })} className="text-muted hover:text-text" aria-label="Close">
            <X />
          </button>
        </header>
        <div className="grid grid-cols-5 gap-2 border-b border-line px-5 py-3 text-center">
          {(["electrical", "mechanical", "power", "compatibility", "overall"] as const).map((k) => (
            <div key={k}>
              <div className="bf-label">{k}</div>
              <div className={`font-display text-2xl font-bold ${rep.scores[k] >= 80 ? "text-ok" : rep.scores[k] >= 50 ? "text-warn" : "text-bad"}`}>{rep.scores[k]}</div>
            </div>
          ))}
        </div>
        <div className="max-h-[52vh] space-y-2 overflow-auto p-5">
          {rep.issues.length === 0 && <div className="text-center text-sm text-ok">No issues found. Your robot is ready for Code Studio.</div>}
          {CATEGORIES.map(([area, title]) => {
            const list = rep.issues.filter((i) => i.area === area);
            if (!list.length) return null;
            return (
              <section key={area} className="space-y-2" data-testid={`category-${area}`}>
                <h3 className="font-mono text-[11px] tracking-widest text-muted">{title.toUpperCase()} · {list.filter((i) => i.severity === "critical").length} critical · {list.filter((i) => i.severity === "warning").length} warnings · {list.filter((i) => i.severity === "suggestion").length} suggestions</h3>
                {list.map((i) => (
                  <div key={i.id} onClickCapture={(e) => { if ((e.target as HTMLElement).closest("[data-alt]")) goCircuit(); }}>
                    <IssueCard issue={i} n={rep.issues.indexOf(i) + 1} onFix={() => fix(i)} project={project} />
                  </div>
                ))}
              </section>
            );
          })}
          {(rep.passedChecks?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-ok/40 bg-ok/5 p-3 text-sm" data-testid="passed-checks">
              <div className="mb-1 flex items-center gap-2 font-mono text-[10px] tracking-widest text-ok"><CheckCircle2 size={14} /> PASSED</div>
              <ul className="grid gap-x-4 text-xs sm:grid-cols-2">{rep.passedChecks!.map((c) => <li key={c}>✓ {c}</li>)}</ul>
            </div>
          )}
        </div>
        <footer className="flex justify-between gap-2 border-t border-line px-5 py-3">
          <span className="self-center text-[11px] text-dim">Scores are computed from the issues above: −30 per critical, −10 per warning, −2 per suggestion in each area. Your design only changes when you run a FIX IT repair (Ctrl+Z undoes it).</span>
          {rep.passed && (
            <Button variant="primary" onClick={() => { ws.set({ reportOpen: false }); router.push(`/workspace/${project.id}/code`); }}>
              Continue to Code Studio →
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
