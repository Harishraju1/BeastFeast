"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store/app";
import { useWorkspace } from "@/lib/store/workspace";
import { addPart } from "@/lib/robot/assembly";
import { CUSTOM_CATEGORIES, CUSTOM_MODELS, CUSTOM_PIN_TYPES, CustomComponentSchema, type CustomModel, newCustomId, registerCustomComponents, templatePins } from "@/lib/catalogue/custom";
import type { ComponentKind, Project } from "@/lib/types";
import { Button, Field, Modal } from "@/components/ui";

type PinRow = { id: string; type: string; description: string };

/** Create a student-defined component and drop it into the circuit. */
export function CustomComponentModal({ project }: { project: Project }) {
  const editor = useWorkspace((s) => s.customEditor);
  if (!editor) return null;
  return <CustomComponentForm project={project} initialName={editor.name ?? ""} initialKind={editor.kind} />;
}

function startModel(kind?: string): CustomModel {
  return kind === "motor-driver" ? "driver-in-in-en" : kind === "dc-motor" ? "dc-motor" : "generic";
}

function CustomComponentForm({ project, initialName, initialKind }: { project: Project; initialName: string; initialKind?: string }) {
  const set = useWorkspace((s) => s.set);
  const { updateProject, toast } = useApp();
  const m0 = startModel(initialKind);
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<ComponentKind>(m0 === "dc-motor" ? "dc-motor" : m0 === "generic" ? (CUSTOM_CATEGORIES.some((c) => c.kind === initialKind) ? (initialKind as ComponentKind) : "sensor") : "motor-driver");
  const [model, setModel] = useState<CustomModel>(m0);
  const [description, setDescription] = useState("");
  const [vMin, setVMin] = useState(m0 === "generic" ? 3.3 : m0 === "dc-motor" ? 3 : 5);
  const [vMax, setVMax] = useState(m0 === "generic" ? 5.5 : m0 === "dc-motor" ? 12 : 24);
  const [maxA, setMaxA] = useState(0.5);
  const [constraints, setConstraints] = useState("");
  const [pins, setPins] = useState<PinRow[]>(() => templatePins(m0)?.map((p) => ({ ...p })) ?? [{ id: "VCC", type: "power-in", description: "Supply" }, { id: "GND", type: "ground", description: "Ground" }, { id: "OUT", type: "digital-out", description: "Signal" }]);
  const [motor, setMotor] = useState({ nominalVoltage: 6, noLoadRpm: 200, stallCurrentA: 1.5, stallTorqueKgCm: 1 });
  const [driver, setDriver] = useState({ dropV: 0.5, contCurrentA: 2, peakCurrentA: 4 });
  const [error, setError] = useState<string | null>(null);

  const close = () => set({ customEditor: null });
  const fixed = model !== "generic";

  function pickModel(m: CustomModel) {
    setModel(m);
    const t = templatePins(m);
    if (t) setPins(t.map((p) => ({ ...p })));
    if (m === "dc-motor") {
      setKind("dc-motor");
      setVMin(3);
      setVMax(12);
    }
    if (m.startsWith("driver")) {
      setKind("motor-driver");
      setVMin(5);
      setVMax(24);
    }
  }

  const save = () => {
    const def = {
      id: newCustomId(name || "part"),
      name: name.trim(),
      kind,
      model,
      description,
      vMin: Number(vMin),
      vMax: Number(vMax),
      maxCurrentA: Number(maxA),
      constraints,
      pins: pins.map((p) => ({ ...p, id: p.id.trim() })),
      ...(model === "dc-motor" ? { motor } : {}),
      ...(model.startsWith("driver") ? { driver } : {}),
    };
    const parsed = CustomComponentSchema.safeParse(def);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setError(`${first.path.join(" ") || "Form"}: ${first.message}`);
      return;
    }
    registerCustomComponents([parsed.data]);
    updateProject(project.id, (p) => {
      const withDef = { ...p, customComponents: [...(p.customComponents ?? []), parsed.data] };
      const r = addPart(withDef, parsed.data.id, { label: parsed.data.name.slice(0, 12).toUpperCase().replace(/\s+/g, "_") } as never);
      return { ...r.project, parts: r.project.parts.map((x) => (x.uid === r.part.uid ? { ...x, inCircuit: true } : x)) };
    });
    toast("success", `${parsed.data.name} added to your circuit. ${model === "generic" ? "Its wiring and voltage are checked; its behaviour is not simulated." : "It is simulated with the values you entered."}`);
    close();
  };

  return (
    <Modal open onClose={close} title="Create custom component" wide>
      <div className="space-y-3 text-sm" data-testid="custom-component">
        <p className="text-xs text-muted">Values you enter here are yours (shown as “not verified”). Use the datasheet of the real part.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Component name"><input className="bf-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. DRV8874 driver" maxLength={60} /></Field>
          <Field label="Category">
            <select className="bf-input" value={kind} disabled={fixed} onChange={(e) => setKind(e.target.value as ComponentKind)}>
              {CUSTOM_CATEGORIES.map((c) => <option key={c.kind} value={c.kind}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Simulation model">
            <select className="bf-input" value={model} onChange={(e) => pickModel(e.target.value as CustomModel)}>
              {(Object.keys(CUSTOM_MODELS) as CustomModel[]).map((m) => <option key={m} value={m}>{CUSTOM_MODELS[m]}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Min operating voltage (V)"><input className="bf-input" type="number" step="0.1" value={vMin} onChange={(e) => setVMin(Number(e.target.value))} /></Field>
          <Field label="Max operating voltage (V)"><input className="bf-input" type="number" step="0.1" value={vMax} onChange={(e) => setVMax(Number(e.target.value))} /></Field>
          <Field label="Max current (A)"><input className="bf-input" type="number" step="0.05" value={maxA} onChange={(e) => setMaxA(Number(e.target.value))} /></Field>
        </div>
        {model === "dc-motor" && (
          <div className="grid gap-3 sm:grid-cols-4">
            {(["nominalVoltage", "noLoadRpm", "stallCurrentA", "stallTorqueKgCm"] as const).map((k) => (
              <Field key={k} label={{ nominalVoltage: "Rated voltage (V)", noLoadRpm: "No-load speed (rpm)", stallCurrentA: "Stall current (A)", stallTorqueKgCm: "Stall torque (kg·cm)" }[k]}>
                <input className="bf-input" type="number" step="0.1" value={motor[k]} onChange={(e) => setMotor({ ...motor, [k]: Number(e.target.value) })} />
              </Field>
            ))}
          </div>
        )}
        {model.startsWith("driver") && (
          <div className="grid gap-3 sm:grid-cols-3">
            {(["dropV", "contCurrentA", "peakCurrentA"] as const).map((k) => (
              <Field key={k} label={{ dropV: "Voltage drop (V)", contCurrentA: "Continuous current / channel (A)", peakCurrentA: "Peak current / channel (A)" }[k]}>
                <input className="bf-input" type="number" step="0.1" value={driver[k]} onChange={(e) => setDriver({ ...driver, [k]: Number(e.target.value) })} />
              </Field>
            ))}
          </div>
        )}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="bf-label">Pins ({pins.length}){fixed ? " — fixed by the simulation model" : ""}</span>
            {!fixed && <Button size="sm" onClick={() => setPins([...pins, { id: `P${pins.length + 1}`, type: "passive", description: "" }])} disabled={pins.length >= 40}><Plus size={12} /> Add pin</Button>}
          </div>
          <div className="max-h-56 space-y-1 overflow-auto">
            {pins.map((p, i) => (
              <div key={i} className="grid grid-cols-[90px_1fr_1.4fr_auto] gap-1">
                <input className="bf-input font-mono" aria-label="Pin name" value={p.id} disabled={fixed} onChange={(e) => setPins(pins.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} />
                <select className="bf-input" aria-label="Pin type" value={p.type} disabled={fixed} onChange={(e) => setPins(pins.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                  {Object.entries(CUSTOM_PIN_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input className="bf-input" aria-label="Pin description" value={p.description} placeholder="Description" onChange={(e) => setPins(pins.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                {!fixed ? <Button size="sm" variant="ghost" aria-label="Remove pin" onClick={() => setPins(pins.filter((_, j) => j !== i))} disabled={pins.length <= 1}><Trash2 size={12} /></Button> : <span />}
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Description"><textarea className="bf-input min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} /></Field>
          <Field label="Electrical constraints"><textarea className="bf-input min-h-16" value={constraints} onChange={(e) => setConstraints(e.target.value)} maxLength={400} placeholder="e.g. logic inputs are 3.3 V only" /></Field>
        </div>
        {error && <div className="rounded border border-bad/50 bg-bad/10 px-3 py-2 text-xs text-bad" role="alert">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>Create and add to circuit</Button>
        </div>
      </div>
    </Modal>
  );
}
