"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircuitBoard, Code2, Copy, Gauge, Loader2, Lock, Map, Play, Bot, XCircle } from "lucide-react";
import { useApp } from "@/lib/store/app";
import { getTemplate } from "@/lib/garage";
import { getComponent } from "@/lib/catalogue";
import { compile, getBoard } from "@/lib/arduino";
import { checkCodeAgainstCircuit } from "@/lib/code/check";
import { validateProject } from "@/lib/circuit/validate";
import { buildRobotSpec } from "@/lib/robot/model";
import { SimSession } from "@/lib/sim/session";
import { getExampleTrack } from "@/lib/track/examples";
import { designFingerprint } from "@/lib/fingerprint";
import type { Project } from "@/lib/types";
import { Button } from "@/components/ui";

type Mode = "original" | "copy";
interface Step {
  label: string;
  detail?: string;
  state: "wait" | "run" | "ok" | "fail";
}

const STEP_LABELS = [
  "Loading project metadata",
  "Loading the chassis",
  "Loading 3D components",
  "Restoring component positions",
  "Restoring component rotations",
  "Restoring mechanical attachments",
  "Restoring circuit connections",
  "Restoring pin assignments",
  "Loading Arduino code",
  "Loading simulation parameters",
  "Loading the default track / arena",
  "Initialising the simulation",
];

/**
 * LOAD PROJECT flow: choose RUN ORIGINAL or CREATE MY OWN COPY, then load the project into the shared
 * project store. Every step really executes against the loaded project (counting, compiling, building the
 * physics model, starting a simulation) and reports what it found.
 */
export function LoadFlow({ templateId, intent, onClose }: { templateId: string; intent: "load" | "simulate" | "customise"; onClose: () => void }) {
  const t = getTemplate(templateId)!;
  const { loadTemplate, updateProject, user, tracks } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(intent === "simulate" ? "original" : intent === "customise" ? "copy" : null);
  const [steps, setSteps] = useState<Step[]>(STEP_LABELS.map((label) => ({ label, state: "wait" })));
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!mode || started.current) return;
    started.current = true;
    void (async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const mark = async (i: number, state: Step["state"], detail?: string) => {
        setSteps((s) => s.map((x, k) => (k === i ? { ...x, state, detail } : x)));
        await sleep(state === "run" ? 60 : 110);
      };
      try {
        await mark(0, "run");
        const p = await loadTemplate(templateId, mode);
        await mark(0, "ok", `${t.metadata.id} · ${t.metadata.name} v${t.metadata.version} · ${mode === "original" ? "read-only original" : "your own copy"}`);
        await mark(1, "ok", `${getComponent(p.chassis!.componentId)?.name} ${p.chassis!.length_mm}×${p.chassis!.width_mm}×${p.chassis!.thickness_mm} mm ${p.chassis!.material}`);
        await mark(2, "ok", `${p.parts.length} catalogue components`);
        await mark(3, "ok", `${p.parts.filter((x) => Number.isFinite(x.position.x)).length} positions (mm, chassis frame)`);
        await mark(4, "ok", `${p.parts.filter((x) => x.rotation.z !== 0).length} parts rotated`);
        const attached = p.parts.filter((x) => x.attachedTo).length;
        await mark(5, attached ? "ok" : "fail", `${attached} wheels / encoders mounted on motor shafts`);
        await mark(6, "ok", `${p.wires.length} wires`);
        await mark(7, "ok", `${t.pinMap.length} pin groups documented`);
        const compiled = compile(p.code, { board: getBoard(t.firmware.board) });
        await mark(8, compiled.ok ? "ok" : "fail", compiled.ok ? `${p.code.split("\n").length} lines compile for ${getBoard(t.firmware.board).name}` : "Firmware does not compile");
        const { spec, notes } = buildRobotSpec(p);
        await mark(9, notes.problems.length ? "fail" : "ok", `${(spec.massKg * 1000).toFixed(0)} g, ${spec.motors.length} motors, ${spec.sensors.length} sensors, dt ${(t.simulation.dt ?? 0.001) * 1000} ms`);
        const track = getExampleTrack(p.trackId ?? t.simulation.defaultTrackId) ?? tracks.find((x) => x.id === p.trackId);
        await mark(10, track ? "ok" : "fail", track?.name ?? "missing");
        let simOk = false;
        if (track) {
          const s = new SimSession({ project: p, track, mode: "code", opponent: t.simulation.opponent ?? null, studentName: user?.name });
          s.advance(0.05, 100);
          simOk = s.runtimeStatus?.state !== "error";
        }
        // store the real validation + code check so every module starts in an up-to-date state
        const validation = { ...validateProject(p, user?.name ?? "Engineer"), fingerprint: designFingerprint(p) };
        const issues = compiled.ok ? checkCodeAgainstCircuit(p, compiled, user?.name) : [];
        updateProject(p.id, (x) => ({ ...x, validation, codeCheck: { at: new Date().toISOString(), ok: compiled.ok && !issues.some((i) => i.severity === "critical"), issues, fingerprint: designFingerprint(x) } }), { history: false });
        await mark(11, simOk ? "ok" : "fail", simOk ? `Physics + firmware running · circuit ${validation.passed ? "verified" : "has issues"}` : "Simulation could not start");
        setProject(p);
        if (intent === "simulate") router.push(`/workspace/${p.id}/arena?autostart=1`);
        if (intent === "customise") router.push(`/workspace/${p.id}/design`);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [mode, intent, loadTemplate, templateId, t, updateProject, user, tracks, router]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sage-900/45 p-4 backdrop-blur-sm" role="dialog" aria-modal onMouseDown={onClose}>
      <div className="bf-panel bf-glow-accent w-full max-w-xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bf-grid border-b border-line px-5 py-4">
          <div className="bf-label text-accent-ink">BEAST PROJECT GARAGE · {t.metadata.id}</div>
          <div className="font-display text-xl font-bold">{t.metadata.name}</div>
        </div>
        {!mode ? (
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <button onClick={() => setMode("original")} className="rounded-lg border border-line p-4 text-left hover:border-brand">
              <Lock className="mb-2 text-brand" size={20} />
              <div className="font-display font-semibold">RUN ORIGINAL PROJECT</div>
              <div className="mt-1 text-xs text-muted">Open the reference robot read-only. Simulate it, change tracks and inspect everything — the original never changes.</div>
            </button>
            <button onClick={() => setMode("copy")} className="rounded-lg border border-line p-4 text-left hover:border-accent">
              <Copy className="mb-2 text-accent-ink" size={20} />
              <div className="font-display font-semibold">CREATE MY OWN COPY</div>
              <div className="mt-1 text-xs text-muted">A new project you own: change parts, wiring, pins, code and tuning. Autosave and version history included.</div>
            </button>
          </div>
        ) : (
          <div className="p-5">
            <ol className="space-y-1">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {s.state === "ok" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" /> : s.state === "fail" ? <XCircle size={16} className="mt-0.5 shrink-0 text-bad" /> : s.state === "run" ? <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-brand" /> : <span className="mt-1 h-3 w-3 shrink-0 rounded-full border border-line2" />}
                  <span className={s.state === "wait" ? "text-dim" : ""}>
                    {i + 1}. {s.label}
                    {s.detail && <span className="block font-mono text-[10px] text-muted">{s.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
            {error && <div className="mt-3 rounded border border-bad/40 bg-bad/10 p-2 text-sm text-bad">{error}</div>}
            {project && intent === "load" && (
              <div className="mt-5 text-center">
                <div className="font-display text-2xl font-bold text-ok">YOUR ROBOT IS READY!</div>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Button size="sm" onClick={() => router.push(`/workspace/${project.id}/design`)}><Bot size={13} /> OPEN DESIGNER</Button>
                  <Button size="sm" onClick={() => router.push(`/workspace/${project.id}/circuit`)}><CircuitBoard size={13} /> OPEN CIRCUIT</Button>
                  <Button size="sm" onClick={() => router.push(`/workspace/${project.id}/code`)}><Code2 size={13} /> OPEN CODE</Button>
                  <Button size="sm" onClick={() => router.push(`/workspace/${project.id}/arena?tracks=1`)}><Map size={13} /> CHANGE TRACK</Button>
                  <Button size="sm" variant="primary" onClick={() => router.push(`/workspace/${project.id}/arena?autostart=1`)}><Play size={13} /> START SIMULATION</Button>
                </div>
              </div>
            )}
            {project && intent !== "load" && <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted"><Gauge size={14} /> Opening…</div>}
          </div>
        )}
      </div>
    </div>
  );
}
