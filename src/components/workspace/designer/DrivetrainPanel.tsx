"use client";
/**
 * Robot Designer: "4WD drivetrain" panel (parameters + FL/FR/RL/RR mapping, set-up and explicit 2WD → 4WD
 * conversion) and the power summary. Every change goes through updateProject, so it is undoable (Ctrl+Z).
 */
import { useMemo, useState } from "react";
import { getComponent, allComponents } from "@/lib/catalogue";
import type { Project } from "@/lib/types";
import { useApp } from "@/lib/store/app";
import {
  CORNERS,
  DEFAULT_4WD_MOTOR,
  DEFAULT_4WD_WHEEL,
  type Drivetrain4WDParams,
  apply4WDParams,
  check4WD,
  convertTo4WD,
  find4WD,
  layout4WD,
  minTrackWidth,
  motorDriverChannel,
  read4WDParams,
  setup4WD,
} from "@/lib/robot/drivetrain4wd";
import { partDims } from "@/lib/mech/geometry";
import { USABLE_CAPACITY, powerSummary } from "@/lib/robot/power";
import { Button, Field } from "@/components/ui";

const PARAM_FIELDS: [keyof Drivetrain4WDParams, string][] = [
  ["wheelDiameter_mm", "Wheel Ø"],
  ["wheelWidth_mm", "Wheel width"],
  ["wheelbase_mm", "Wheelbase"],
  ["trackWidth_mm", "Track width"],
  ["chassisLength_mm", "Chassis length"],
  ["chassisWidth_mm", "Chassis width"],
  ["groundClearance_mm", "Ground clearance"],
];

const HELP: Partial<Record<keyof Drivetrain4WDParams, string>> = {
  wheelbase_mm: "Front axle to rear axle",
  trackWidth_mm: "Left wheel centre to right wheel centre",
  groundClearance_mm: "Floor to the lowest point of plate or motors",
};

export function DrivetrainPanel({ project }: { project: Project }) {
  const { updateProject } = useApp();
  const dt = useMemo(() => find4WD(project), [project]);
  const params = useMemo(() => read4WDParams(project), [project]);
  const problems = useMemo(() => check4WD(project), [project]);
  const motors = project.parts.filter((p) => getComponent(p.componentId)?.kind === "dc-motor");
  const wheels = project.parts.filter((p) => getComponent(p.componentId)?.kind === "wheel");
  const [motorId, setMotorId] = useState(DEFAULT_4WD_MOTOR);
  const [wheelId, setWheelId] = useState(DEFAULT_4WD_WHEEL);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const motorOptions = useMemo(() => allComponents().filter((c) => c.kind === "dc-motor" && c.motor && !/Brushless/.test(c.name)), []);
  const wheelOptions = useMemo(() => allComponents().filter((c) => c.kind === "wheel"), []);

  const run = (fn: (p: Project) => Project) => {
    try {
      setError(null);
      updateProject(project.id, fn);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (dt && params) {
    const md = partDims(dt.motors.FL, getComponent(dt.motors.FL.componentId)!);
    const { mounting } = layout4WD(params, md, project.chassis?.thickness_mm ?? 3);
    const minTrack = minTrackWidth(params);
    return (
      <div className="space-y-3 border-t border-line pt-3 text-sm">
        <div className="flex items-center justify-between">
          <div className="bf-label text-accent-ink">4WD drivetrain</div>
          <span className="font-mono text-[10px] text-dim">SKID STEER · {dt.casters.length ? `${dt.casters.length} CASTER(S)!` : "NO CASTER"}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PARAM_FIELDS.map(([k, label]) => (
            <Field key={k} label={`${label} (mm)`} hint={HELP[k]}>
              <CommitNumber value={params[k]} step={k === "groundClearance_mm" ? 1 : 2} onCommit={(v) => run((p) => apply4WDParams(p, { [k]: v }))} />
            </Field>
          ))}
        </div>
        <div className="space-y-0.5 text-[11px] text-dim">
          <div>{mounting.note}</div>
          {params.trackWidth_mm < minTrack && <div className="text-warn">Track width below {minTrack} mm: the tyres rub on this chassis.</div>}
          {problems.map((p) => (
            <div key={p.code} className="text-warn">{p.message}</div>
          ))}
        </div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-dim">
              <th className="font-normal">Corner</th>
              <th className="font-normal">Motor</th>
              <th className="font-normal">Wheel</th>
              <th className="font-normal">Driver</th>
            </tr>
          </thead>
          <tbody>
            {CORNERS.map((c) => (
              <tr key={c.key} className="border-t border-line">
                <td className="py-0.5 pr-1"><span className="font-mono text-accent-ink">{c.key}</span> <span className="text-dim">{c.name}</span></td>
                <td className="truncate pr-1 font-mono">{dt.motors[c.key].label}</td>
                <td className="truncate pr-1 font-mono">{dt.wheels[c.key].label}</td>
                <td className="truncate text-muted">{motorDriverChannel(project, dt.motors[c.key].uid) ?? "not wired"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-dim">Left motors face out to the left, right motors are mounted mirrored (180°) with swapped leads, so one &quot;forward&quot; command turns all four wheels forward. Changing a value moves the eight parts; wires and settings are kept.</p>
      </div>
    );
  }

  const twoWD = motors.length === 2 && motors.every((m) => wheels.some((w) => w.attachedTo === m.uid));
  return (
    <div className="space-y-2 border-t border-line pt-3 text-sm">
      <div className="bf-label text-accent-ink">4WD drivetrain</div>
      {motors.length === 0 ? (
        <>
          <p className="text-[11px] text-dim">4WD (four driven wheels, skid steering, no caster) is the club standard for Robo Race and Sumo.</p>
          <Field label="Motors (×4)">
            <select className="bf-input" value={motorId} onChange={(e) => setMotorId(e.target.value)}>
              {motorOptions.map((c) => <option key={c.id} value={c.id}>{c.name}{c.motor ? ` — ${c.motor.nominalVoltage} V` : ""}</option>)}
            </select>
          </Field>
          <Field label="Wheels (×4)">
            <select className="bf-input" value={wheelId} onChange={(e) => setWheelId(e.target.value)}>
              {wheelOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Button size="sm" variant="primary" className="w-full" onClick={() => run((p) => setup4WD(p, { motorId, wheelId }))}>Set up 4WD drivetrain</Button>
        </>
      ) : twoWD ? (
        <>
          <p className="text-[11px] text-dim">This robot is 2WD. Converting keeps your two motors and wheels (with their wires) as the rear pair, adds a front pair (not wired yet) and removes the caster. Undo (Ctrl+Z) restores the 2WD robot.</p>
          {confirmConvert ? (
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => { run((p) => convertTo4WD(p)); setConfirmConvert(false); }}>Convert now</Button>
              <Button size="sm" onClick={() => setConfirmConvert(false)}>Cancel</Button>
            </div>
          ) : (
            <Button size="sm" className="w-full" onClick={() => setConfirmConvert(true)}>Convert to 4WD…</Button>
          )}
        </>
      ) : (
        <p className="text-[11px] text-dim">{motors.length} drive motor(s) placed. The 4WD panel appears when there are four motors, each with its own wheel, two on each side.</p>
      )}
      {error && <div className="text-[11px] text-bad">{error}</div>}
    </div>
  );
}

/** Number input that applies its value on Enter / blur (typing "120" does not move the wheels to 1 and 12 first). */
function CommitNumber({ value, step, onCommit }: { value: number; step: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    setDraft(null);
    if (Number.isFinite(v) && v > 0 && v !== value) onCommit(v);
  };
  return (
    <input
      className="bf-input"
      type="number"
      step={step}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}

const fmtA = (a: number) => (a < 1 ? `${Math.round(a * 1000)} mA` : `${a.toFixed(2)} A`);

export function PowerPanel({ project }: { project: Project }) {
  const s = useMemo(() => powerSummary(project), [project]);
  const b = s.battery;
  return (
    <div className="space-y-2 border-t border-line pt-3 text-sm">
      <div className="bf-label text-accent-ink">Power summary</div>
      {b ? (
        <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-0.5 text-xs">
          <dt className="text-dim">Battery</dt>
          <dd className="truncate">{b.label} · {b.name}</dd>
          <dt className="text-dim">Voltage</dt>
          <dd>{b.nominal_V} V nominal / {b.full_V} V full{b.cells > 1 ? ` (${b.cells}S${b.chemistry ? ` ${b.chemistry.split(" ")[0]}` : ""})` : ""}</dd>
          <dt className="text-dim">Cut-off (sim)</dt>
          <dd>{b.cutoff_V} V</dd>
          <dt className="text-dim">Capacity</dt>
          <dd>{b.capacity_mAh} mAh ({b.capacity_Ah} Ah)</dd>
          <dt className="text-dim">Energy</dt>
          <dd>{b.energy_Wh} Wh</dd>
          {b.notSpecified.length > 0 && (
            <>
              <dt className="text-dim">Not specified</dt>
              <dd className="text-muted">{b.notSpecified.join(", ")}</dd>
            </>
          )}
        </dl>
      ) : (
        <div className="text-xs text-dim">No battery placed.</div>
      )}
      {s.loads.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">
            Estimated current while driving: <span className="text-text">{fmtA(s.totalCurrent_A)}</span> <span className="text-dim">(estimate)</span>
          </summary>
          <ul className="mt-1 space-y-0.5 text-[11px] text-dim">
            {s.loads.map((l) => (
              <li key={l.uid}><span className="font-mono text-muted">{l.label}</span> {fmtA(l.current_A)} — {l.basis}</li>
            ))}
          </ul>
        </details>
      )}
      {s.stallCurrent_A > 0 && <div className="text-[11px] text-dim">All motors stalled (worst case): ≈{s.stallCurrent_A} A</div>}
      <div className="text-xs">
        Estimated runtime:{" "}
        {s.runtime_min !== null ? (
          <span className="text-text">≈{s.runtime_min} min <span className="text-dim">(estimate: {Math.round(USABLE_CAPACITY * 100)} % of the capacity at the current above)</span></span>
        ) : (
          <span className="text-dim">not enough data{s.missing.length ? ` — ${s.missing.join(" ")}` : ""}</span>
        )}
      </div>
    </div>
  );
}
