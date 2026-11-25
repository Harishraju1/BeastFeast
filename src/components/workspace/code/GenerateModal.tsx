"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileCode2, XCircle } from "lucide-react";
import { detectBehaviour, detectControl, generateFirmware, type Behaviour, type ControlMethod } from "@/lib/code/generate";
import type { Project } from "@/lib/types";
import { Button, Modal, Tabs } from "@/components/ui";

const BEHAVIOURS: { v: Behaviour; l: string }[] = [
  { v: "manual", l: "Manual drive (remote control)" },
  { v: "line", l: "Line following (PID)" },
  { v: "sumo", l: "Sumo (search, attack, edge escape)" },
  { v: "obstacle", l: "Obstacle avoidance" },
  { v: "motor-test", l: "Motor test (each motor in turn)" },
];
const CONTROLS: { v: ControlMethod; l: string }[] = [
  { v: "none", l: "None (autonomous)" },
  { v: "hc05", l: "Bluetooth HC-05" },
  { v: "wifi", l: "Wi-Fi (ESP32)" },
];
type Section = "code" | "pins" | "wiring" | "guide";

/**
 * "Generate code for my robot": builds a complete sketch from the project's actual controller, driver,
 * motors, sensors, pins and control method. When something required is missing it lists what is missing
 * instead of producing misleading code.
 */
export function GenerateModal({ project, open, onClose, onInsert }: { project: Project; open: boolean; onClose: () => void; onInsert: (code: string) => void }) {
  const [behaviour, setBehaviour] = useState<Behaviour>(() => detectBehaviour(project));
  const [control, setControl] = useState<ControlMethod>(() => detectControl(project));
  const [section, setSection] = useState<Section>("code");
  const fw = useMemo(() => (open ? generateFirmware(project, { behaviour, control }) : null), [open, project, behaviour, control]);
  const download = () => {
    if (!fw?.ok) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([fw.code], { type: "text/plain" }));
    a.download = `${project.name.replace(/[^a-z0-9]+/gi, "_")}_generated.ino`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const list = (title: string, items: string[], ordered = false) =>
    items.length ? (
      <div>
        <div className="bf-label mb-1">{title}</div>
        {ordered ? <ol className="list-decimal space-y-0.5 pl-5 text-sm">{items.map((x) => <li key={x}>{x}</li>)}</ol> : <ul className="list-disc space-y-0.5 pl-5 text-sm">{items.map((x) => <li key={x}>{x}</li>)}</ul>}
      </div>
    ) : null;

  return (
    <Modal open={open} onClose={onClose} title="Generate code for my robot" wide>
      <div className="space-y-3">
        <p className="text-sm text-muted">The generator reads <b>this</b> robot: its controller, motor driver, motors, sensors and the exact pins you wired in Circuit Studio. Change the circuit and the code changes with it.</p>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-[11px] text-dim">Behaviour
            <select className="bf-input h-8 py-0 text-xs" value={behaviour} onChange={(e) => setBehaviour(e.target.value as Behaviour)}>{BEHAVIOURS.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-dim">Control
            <select className="bf-input h-8 py-0 text-xs" value={control} onChange={(e) => setControl(e.target.value as ControlMethod)}>{CONTROLS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
          </label>
          {fw && <div className="self-end text-xs text-muted">Board: <span className="font-mono text-brand">{fw.board.name}</span> <span className="font-mono text-dim">({fw.board.fqbn})</span></div>}
        </div>

        {fw && !fw.ok && (
          <div role="alert" className="rounded-lg border border-bad/50 bg-bad/10 p-3 text-sm">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-bad"><XCircle size={15} /> Can&apos;t generate code yet — the robot is missing:</div>
            <ul className="list-disc pl-5">{fw.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            <div className="mt-1 text-xs text-muted">Add these in the Robot Designer / Circuit Studio and open the generator again. No code is produced from a guess.</div>
          </div>
        )}
        {fw && fw.warnings.length > 0 && (
          <div className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm">
            {fw.warnings.map((w) => <div key={w} className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />{w}</div>)}
          </div>
        )}

        {fw?.ok && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1 ${fw.simulated ? "text-ok" : "text-warn"}`}>{fw.simulated ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{fw.simulated ? "Runs in the BEAST FEAST simulator" : "Not executed by the simulator"}</span>
              {fw.simulationNote && <span className="text-dim">{fw.simulationNote}</span>}
              <span className="text-dim">· Libraries: {fw.libraries.length ? fw.libraries.join(", ") : "none (core Arduino API only)"}</span>
            </div>
            <Tabs value={section} onChange={setSection} items={[{ value: "code", label: "CODE" }, { value: "pins", label: "PIN MAP" }, { value: "wiring", label: "WIRING" }, { value: "guide", label: "SETUP & UPLOAD" }]} />
            {section === "code" && <pre className="bf-code max-h-[420px] overflow-auto rounded-lg p-3 font-mono text-[11.5px] leading-relaxed">{fw.code}</pre>}
            {section === "pins" && (
              <table className="w-full text-sm">
                <thead><tr className="bf-label text-left"><th className="py-1">Pin</th><th>Function</th><th>Connected to</th></tr></thead>
                <tbody>{fw.pinTable.map((r) => <tr key={r.pin + r.function} className="border-t border-line"><td className="py-1 font-mono text-brand">{r.pin}</td><td>{r.function}</td><td className="text-muted">{r.connectedTo}</td></tr>)}</tbody>
              </table>
            )}
            {section === "wiring" && (
              <table className="w-full text-[12px]">
                <thead><tr className="bf-label text-left"><th className="py-1">From</th><th>To</th><th>Type</th><th>Note</th></tr></thead>
                <tbody>{fw.wiring.map((r, i) => <tr key={i} className="border-t border-line"><td className="py-1 font-mono">{r.from}</td><td className="font-mono">{r.to}</td><td>{r.type}</td><td className="text-muted">{r.note}</td></tr>)}</tbody>
              </table>
            )}
            {section === "guide" && (
              <div className="grid gap-4 md:grid-cols-2">
                {list("Setup", fw.setup, true)}
                {list("Upload", fw.upload, true)}
                {list("Expected behaviour", fw.expected)}
                {list("Troubleshooting", fw.troubleshooting)}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              <span className="mr-auto text-xs text-dim">Generated code is a reference: it earns no code XP. Change the logic or write your own to earn it.</span>
              <Button onClick={download}><Download size={13} /> .ino</Button>
              <Button variant="primary" onClick={() => { onInsert(fw.code); onClose(); }}><FileCode2 size={13} /> Insert into editor</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
