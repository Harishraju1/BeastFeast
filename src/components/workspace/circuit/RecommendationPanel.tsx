"use client";
import { useMemo } from "react";
import { CheckCircle2, Info, PlusCircle, Replace, XCircle } from "lucide-react";
import { useApp } from "@/lib/store/app";
import { useWorkspace } from "@/lib/store/workspace";
import { recommendForPart, SUITABILITY_INFO } from "@/lib/circuit/recommend";
import { getComponent } from "@/lib/catalogue";
import { addPart } from "@/lib/robot/assembly";
import type { Project } from "@/lib/types";
import { Button, Modal } from "@/components/ui";

const TONE = { ok: "border-ok/50 bg-ok/10 text-ok", info: "border-info/50 bg-info/10 text-info", warn: "border-warn/50 bg-warn/10 text-warn", bad: "border-bad/50 bg-bad/10 text-bad" };

/** "Show better alternative": suitability of the selected part with the numbers behind it. */
export function RecommendationPanel({ project }: { project: Project }) {
  const partUid = useWorkspace((s) => s.recommendFor);
  const set = useWorkspace((s) => s.set);
  const { updateProject, toast } = useApp();
  const rec = useMemo(() => (partUid ? recommendForPart(project, partUid) : null), [project, partUid]);
  if (!partUid) return null;
  const close = () => set({ recommendFor: null });
  if (!rec)
    return (
      <Modal open onClose={close} title="Component check">
        <p className="text-sm text-muted">This part is no longer in the circuit.</p>
      </Modal>
    );
  const info = SUITABILITY_INFO[rec.category];

  /** Add the alternative next to the current part (the student rewires it — nothing is swapped silently). */
  const addAlternative = (id: string) => {
    const c = getComponent(id);
    if (!c) return;
    const old = project.parts.find((p) => p.uid === rec.partUid);
    updateProject(project.id, (p) => {
      const r = addPart(p, id);
      if (!r.part) return r.project;
      return { ...r.project, parts: r.project.parts.map((x) => (x.uid === r.part.uid ? { ...x, inCircuit: c.pins.length > 0, schematic: { x: (old?.schematic.x ?? 100) + 220, y: old?.schematic.y ?? 100 } } : x)) };
    });
    toast("info", `${c.name} added next to ${rec.label}. Move the wires across, then remove ${rec.label}.`);
    close();
  };

  return (
    <Modal open onClose={close} title={`${rec.label} · ${rec.name}`} wide>
      <div className="space-y-4 text-sm" data-testid="recommendation">
        <div className={`rounded-lg border p-3 ${TONE[info.tone]}`}>
          <div className="font-mono text-[10px] tracking-widest">{info.label}</div>
          <div className="mt-1 font-display text-lg font-semibold text-text">{rec.headline}</div>
          {rec.summary && <p className="mt-1 text-text/90">{rec.summary}</p>}
        </div>

        {rec.checks.length > 0 && (
          <div>
            <div className="bf-label mb-1">What was checked</div>
            <ul className="space-y-1">
              {rec.checks.map((c, i) => (
                <li key={i} className="flex gap-2">
                  {c.ok === true ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" /> : c.ok === false ? <XCircle size={15} className="mt-0.5 shrink-0 text-bad" /> : <Info size={15} className="mt-0.5 shrink-0 text-muted" />}
                  <span>
                    <span className="font-semibold">{c.label}: </span>
                    <span className="text-muted">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-dim">Running current is an estimate (no-load current + 25 % of the way to stall). Stall currents come from the motor data.</p>
          </div>
        )}

        {rec.extras.length > 0 && (
          <div>
            <div className="bf-label mb-1">You will also need</div>
            <ul className="list-disc space-y-0.5 pl-5">{rec.extras.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        {rec.alternatives.length > 0 && (
          <div>
            <div className="bf-label mb-1">Better alternatives</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {rec.alternatives.map((a) => (
                <div key={a.name} className="rounded border border-line p-2">
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-xs text-muted">{a.why}</div>
                  {a.available && a.id ? (
                    <Button size="sm" className="mt-2" onClick={() => addAlternative(a.id!)}><Replace size={12} /> Add to my circuit</Button>
                  ) : (
                    <div className="mt-2 text-xs text-warn">Don&apos;t worry! This component is not currently available in our simulator.</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(rec.offerCustom || rec.alternatives.some((a) => !a.available)) && (
          <div className="rounded-lg border border-line bg-bg2 p-3">
            <div className="font-semibold">Don&apos;t worry! If the part you need is not in our simulator, you can create your own component.</div>
            <p className="text-xs text-muted">Define its pins, voltage and current — motors and dual H-bridge drivers are fully simulated with your values.</p>
            <Button size="sm" variant="primary" className="mt-2" onClick={() => set({ recommendFor: null, customEditor: { kind: getComponent(rec.componentId)?.kind } })}>
              <PlusCircle size={12} /> Create custom component
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
