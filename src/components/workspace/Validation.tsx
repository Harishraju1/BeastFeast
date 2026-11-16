"use client";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Lightbulb, ShieldAlert, Wrench, X } from "lucide-react";
import { useApp } from "@/lib/store/app";
import { useWorkspace } from "@/lib/store/workspace";
import { validateProject } from "@/lib/circuit/validate";
import type { Project, ValidationIssue } from "@/lib/types";
import { designFingerprint } from "@/lib/fingerprint";
import { Button } from "@/components/ui";

/** Runs the real validation engine with a scanning animation that walks over every component. */
export function useValidate(project: Project | undefined) {
  const { user, updateProject, award, content } = useApp();
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
    if (report.passed) await award("validation-pass", project.id);
  };
}

export function ScanOverlay() {
  const scanning = useWorkspace((s) => s.scanning);
  if (!scanning) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden bg-black/45">
      <div className="bf-scanline absolute left-0 right-0 h-24 bg-gradient-to-b from-transparent via-cyan/25 to-transparent" />
      <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded border border-cyan/50 bg-bg/80 px-4 py-2 font-mono text-xs tracking-[0.3em] text-cyan">SCANNING ROBOT SYSTEMS…</div>
    </div>
  );
}

const SEV = {
  critical: { icon: ShieldAlert, cls: "border-bad/50 bg-bad/10", text: "text-bad", label: "CRITICAL ERROR" },
  warning: { icon: AlertTriangle, cls: "border-warn/40 bg-warn/5", text: "text-warn", label: "WARNING" },
  suggestion: { icon: Lightbulb, cls: "border-info/40 bg-info/5", text: "text-info", label: "SUGGESTION" },
};

export function IssueCard({ issue, n, onFix }: { issue: ValidationIssue; n: number; onFix?: () => void }) {
  const s = SEV[issue.severity];
  const Icon = s.icon;
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
          <div className="text-xs text-muted">{issue.explanation}</div>
          <div className="text-xs">
            <span className="text-ok">Fix: </span>
            {issue.fix}
          </div>
        </div>
        {onFix && (issue.partUid || issue.pinId) && (
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
    ws.focusIssue(i);
    // mechanical issues are shown in 3D, electrical ones on the schematic
    const tab = i.area === "mechanical" ? "design" : "circuit";
    if (!location.pathname.endsWith(`/${tab}`)) router.push(`/workspace/${project.id}/${tab}`);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={() => ws.set({ reportOpen: false })}>
      <div className={`bf-panel max-h-[88vh] w-full max-w-3xl overflow-hidden ${rep.passed ? "bf-glow-cyan" : "bf-glow-orange"}`} onMouseDown={(e) => e.stopPropagation()}>
        <header className={`flex items-center justify-between px-5 py-4 ${rep.passed ? "bg-ok/10" : "bg-bad/10"}`}>
          <div className="flex items-center gap-3">
            {rep.passed ? <CheckCircle2 className="text-ok" size={28} /> : <ShieldAlert className="text-bad" size={28} />}
            <div>
              <div className="font-display text-xl font-bold">{rep.passed ? "ROBOT SYSTEMS VERIFIED!" : `HEY ${(user?.name ?? "ENGINEER").toUpperCase()}! YOUR ROBOT NEEDS SOME FIXES!`}</div>
              <div className="text-xs text-muted">
                {rep.checksRun} checks · {crit.length} critical · {rep.issues.filter((i) => i.severity === "warning").length} warnings · {rep.issues.filter((i) => i.severity === "suggestion").length} suggestions
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
          {rep.issues.map((i, n) => (
            <IssueCard key={i.id} issue={i} n={n + 1} onFix={() => fix(i)} />
          ))}
        </div>
        <footer className="flex justify-between gap-2 border-t border-line px-5 py-3">
          <span className="self-center text-[11px] text-dim">Scores are computed from the issues above: −30 per critical, −10 per warning, −2 per suggestion in each area. Your design is never changed automatically.</span>
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
