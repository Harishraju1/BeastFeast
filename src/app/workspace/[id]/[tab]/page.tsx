"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { History, Maximize2, Minimize2, Redo2, Save, ScanLine, Undo2 } from "lucide-react";
import { InlineNotice, NotificationBell } from "@/components/shell/Notifications";
import { RequireAuth } from "@/components/shell/AppShell";
import { Badge, Button, Empty, Modal, Spinner } from "@/components/ui";
import { useApp } from "@/lib/store/app";
import { useWorkspace } from "@/lib/store/workspace";
import { COMPETITIONS, type Project } from "@/lib/types";
import { ScanOverlay, ValidationReportModal, useValidate } from "@/components/workspace/Validation";
import { validationState } from "@/lib/fingerprint";
import { isTypingTarget } from "@/lib/keyboard";

const loading = () => (
  <div className="flex h-full items-center justify-center">
    <Spinner label="Loading module…" />
  </div>
);
const DesignerTab = dynamic(() => import("@/components/workspace/designer/Designer"), { ssr: false, loading });
const CircuitTab = dynamic(() => import("@/components/workspace/circuit/CircuitStudio"), { ssr: false, loading });
const CodeTab = dynamic(() => import("@/components/workspace/code/CodeStudio"), { ssr: false, loading });
const ArenaTab = dynamic(() => import("@/components/workspace/arena/Arena"), { ssr: false, loading });

const TABS = [
  { key: "design", label: "1 · Robot Designer" },
  { key: "circuit", label: "2 · Circuit Studio" },
  { key: "code", label: "3 · Code Studio" },
  { key: "arena", label: "4 · Simulation Arena" },
] as const;

function Pipeline({ project }: { project: Project }) {
  const steps = [
    { label: "Chassis", ok: !!project.chassis },
    { label: "Motors & wheels", ok: project.parts.some((p) => p.attachedTo) },
    { label: "Controller", ok: project.parts.some((p) => /arduino|esp|pico|nodemcu|attiny|teensy|stm32/.test(p.componentId)) },
    { label: "Wiring", ok: project.wires.length > 0 },
    { label: validationState(project) === "stale" ? "Re-validate" : "Validated", ok: validationState(project) === "passed", bad: ["failed", "stale"].includes(validationState(project)) },
    { label: "Code", ok: !!project.codeCheck?.ok, bad: project.codeCheck && !project.codeCheck.ok },
    { label: "Simulated", ok: project.simulations.length > 0 },
  ];
  return (
    <div className="hidden items-center gap-1 lg:flex">
      {steps.map((s, i) => (
        <span key={s.label} className={`flex items-center gap-1 font-mono text-[10px] ${s.ok ? "text-ok" : s.bad ? "text-bad" : "text-dim"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.ok ? "bg-ok" : s.bad ? "bg-bad" : "bg-line2"}`} />
          {s.label}
          {i < steps.length - 1 && <span className="mx-1 text-line2">›</span>}
        </span>
      ))}
    </div>
  );
}

function ReferenceBanner({ project }: { project: Project }) {
  const loadTemplate = useApp((s) => s.loadTemplate);
  const router = useRouter();
  const o = project.origin;
  if (!o) return null;
  if (o.mode === "copy")
    return <div className="border-b border-line bg-bg2 px-3 py-1 text-[11px] text-muted">Your copy of garage project <Link className="text-accent-ink" href={`/garage/${o.templateId}`}>{o.templateId}</Link> v{o.templateVersion} — edit anything; the original stays unchanged.</div>;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-brand/40 bg-brand/5 px-3 py-1.5 text-xs">
      <span className="font-mono tracking-widest text-brand">REFERENCE PROJECT {o.templateId} · READ-ONLY</span>
      <span className="text-muted">Simulate, change tracks and inspect freely. Design, wiring and code edits need your own copy.</span>
      <Button size="sm" variant="primary" className="ml-auto" onClick={async () => { const p = await loadTemplate(o.templateId, "copy"); router.push(`/workspace/${p.id}/design`); }}>CREATE MY OWN COPY</Button>
    </div>
  );
}

function WorkspaceInner() {
  const { id, tab } = useParams<{ id: string; tab: string }>();
  const { getProject, undo, redo, saveNow, history, saveState, updateProject } = useApp();
  const project = getProject(id);
  const validate = useValidate(project);
  const scanning = useWorkspace((s) => s.scanning);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const snapshotVersion = useApp((s) => s.snapshotVersion);

  // Full screen: the browser's fullscreen mode where available, otherwise the workspace fills the window
  const rootRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const toggleFull = useCallback(() => {
    if (!full) {
      setFull(true);
      const el = rootRef.current;
      if (el?.requestFullscreen && !document.fullscreenElement) void el.requestFullscreen().catch(() => {});
    } else {
      setFull(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    }
  }, [full]);
  useEffect(() => {
    // leaving browser fullscreen with Esc / F11 also leaves our full-screen layout
    const onChange = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    if (!full) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement && !isTypingTarget(e.target)) setFull(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [full]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo(id);
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        redo(id);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow(id);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFull();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [id, undo, redo, saveNow, toggleFull]);

  if (!project) return <Empty title="Project not found" action={<Link className="text-accent-ink" href="/projects">Back to projects</Link>}>It may have been deleted, or it belongs to another account.</Empty>;
  const h = history[id];

  return (
    <div ref={rootRef} className={`flex flex-col bg-bg ${full ? "fixed inset-0 z-[55] h-[100dvh]" : "relative h-[calc(100vh-56px)]"}`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-bg2 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Badge tone="accent">{COMPETITIONS[project.competition].short}</Badge>
          <span className="max-w-[220px] truncate font-display text-sm font-semibold">{project.name}</span>
        </div>
        <nav className="flex gap-0.5" aria-label="Workspace">
          {TABS.map((t) => (
            <Link key={t.key} href={`/workspace/${id}/${t.key}`} className={`rounded px-2.5 py-1 text-xs font-medium ${tab === t.key ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-panel hover:text-text"}`}>
              {t.label}
            </Link>
          ))}
          <Link href={`/tracks?project=${id}`} className="rounded px-2.5 py-1 text-xs font-medium text-muted hover:bg-panel hover:text-text">Track Designer ↗</Link>
        </nav>
        <Pipeline project={project} />
        <div className="ml-auto flex items-center gap-1">
          {full && <InlineNotice className="mr-1" />}
          {full && <NotificationBell />}
          <Button size="sm" variant="ghost" title="Undo (Ctrl+Z)" disabled={!h?.past.length} onClick={() => undo(id)}><Undo2 size={14} /></Button>
          <Button size="sm" variant="ghost" title="Redo (Ctrl+Y)" disabled={!h?.future.length} onClick={() => redo(id)}><Redo2 size={14} /></Button>
          <Button size="sm" variant="ghost" title="Version history" onClick={() => setVersionsOpen(true)}><History size={14} /></Button>
          <Button size="sm" variant="ghost" title="Save now (Ctrl+S)" onClick={() => void saveNow(id)} disabled={saveState === "saving"}><Save size={14} /></Button>
          <Button size="sm" variant={full ? "secondary" : "ghost"} title={full ? "Exit full screen (Esc)" : "Full screen (Ctrl+Shift+F)"} aria-pressed={full} onClick={toggleFull}>
            {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span className="hidden lg:inline">{full ? "Exit full screen" : "Full screen"}</span>
          </Button>
          {(tab === "design" || tab === "circuit") && (
            <Button size="sm" variant="primary" disabled={scanning} onClick={() => void validate()}>
              <ScanLine size={14} /> VALIDATE MY ROBOT
            </Button>
          )}
        </div>
      </div>
      <ReferenceBanner project={project} />
      <div className="relative min-h-0 flex-1">
        {tab === "design" && <DesignerTab project={project} />}
        {tab === "circuit" && <CircuitTab project={project} />}
        {tab === "code" && <CodeTab project={project} />}
        {tab === "arena" && <ArenaTab project={project} />}
        <ScanOverlay />
      </div>
      <ValidationReportModal project={project} />
      <Modal open={versionsOpen} onClose={() => setVersionsOpen(false)} title="Version history">
        <div className="space-y-3 text-sm">
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => snapshotVersion(id, `Manual snapshot ${new Date().toLocaleString()}`)}>Save a snapshot now</Button>
          </div>
          {project.versions.length === 0 && <div className="text-muted">No snapshots yet. Snapshots are also taken automatically before you restore one.</div>}
          {[...project.versions].reverse().map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded border border-line px-3 py-2">
              <div>
                <div>{v.note}</div>
                <div className="font-mono text-[10px] text-dim">{new Date(v.at).toLocaleString()}</div>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  snapshotVersion(id, "Before restoring an older version");
                  const snap = JSON.parse(v.snapshot) as Omit<Project, "versions">;
                  updateProject(id, (p) => ({ ...snap, versions: p.versions }));
                  setVersionsOpen(false);
                }}
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <RequireAuth>
      <WorkspaceInner />
    </RequireAuth>
  );
}
