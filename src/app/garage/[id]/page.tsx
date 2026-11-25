"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Play, Target, Upload, XCircle } from "lucide-react";
import { buildFromTemplate, getTemplate } from "@/lib/garage";
import { runReadiness } from "@/lib/garage/readiness";
import { BT_PROTOCOL_DOC } from "@/lib/garage/projects/race";
import { getComponent } from "@/lib/catalogue";
import { getExampleTrack } from "@/lib/track/examples";
import { massSummary } from "@/lib/mech/geometry";
import { useApp } from "@/lib/store/app";
import { Badge, Button, Panel, SimBadge, Tabs } from "@/components/ui";
import { LoadFlow } from "@/components/garage/LoadFlow";
import { RobotTopView } from "@/components/garage/RobotTopView";
import { useReadiness } from "@/components/garage/useGarage";
import { WIRE_HEX as THEME_WIRES } from "@/lib/theme";
import { specSheet, wiringTable, type ConnectionType } from "@/lib/robot/specSheet";

const Preview3D = dynamic(() => import("@/components/garage/Preview3D"), { ssr: false });
const WIRE_HEX: Record<string, string> = THEME_WIRES;
type Tab = "overview" | "components" | "wiring" | "code" | "assembly" | "simulation" | "specs";
const TAB_LABEL: Record<Tab, string> = { overview: "OVERVIEW", components: "COMPONENTS", wiring: "WIRING", code: "CODE", assembly: "3D ASSEMBLY", simulation: "SIMULATION", specs: "SPECIFICATIONS" };
const TYPE_TONE: Record<ConnectionType, "bad" | "dim" | "warn" | "accent" | "ok" | "brand"> = { power: "bad", ground: "dim", motor: "warn", signal: "accent", sensor: "ok", communication: "brand" };

export default function GarageProjectPage() {
  const { id } = useParams<{ id: string }>();
  const t = getTemplate(id);
  const project = useMemo(() => (t ? buildFromTemplate(t, "preview", "original") : null), [t]);
  const reports = useReadiness(useMemo(() => (t ? [t] : []), [t]));
  const [tab, setTab] = useState<Tab>("overview");
  const [exploded, setExploded] = useState(0);
  const [flow, setFlow] = useState<"load" | "simulate" | "customise" | null>(null);
  const [fresh, setFresh] = useState<ReturnType<typeof runReadiness> | null>(null);
  const { user } = useApp();
  if (!t || !project) return <div className="p-8 text-muted">Project not found. <Link href="/garage" className="text-accent-ink">Back to the garage</Link></div>;
  const report = fresh ?? reports[t.metadata.id];
  const mass = massSummary(project);
  const bom = Object.values(
    project.parts.reduce<Record<string, { id: string; n: number; labels: string[] }>>((acc, p) => {
      (acc[p.componentId] ??= { id: p.componentId, n: 0, labels: [] }).n++;
      acc[p.componentId].labels.push(p.label);
      return acc;
    }, {}),
  );
  const label = (uid: string) => project.parts.find((p) => p.uid === uid)?.label ?? uid;
  const wiring = tab === "wiring" ? wiringTable(project) : [];
  const sheet = tab === "specs" || tab === "overview" ? specSheet(project) : null;
  const act = (a: "load" | "simulate" | "customise") => (user ? setFlow(a) : (location.href = `/login?next=/garage/${id}`));

  return (
    <div className="mx-auto max-w-7xl px-5 py-6">
      <Link href="/garage" className="text-xs text-muted hover:text-text">← BEAST PROJECT GARAGE</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="bf-label text-accent-ink">{t.metadata.id} · v{t.metadata.version} · {t.metadata.author}</div>
          <h1 className="font-display text-3xl font-bold">{t.metadata.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={t.metadata.difficulty === "beginner" ? "ok" : t.metadata.difficulty === "intermediate" ? "warn" : "bad"}>{t.metadata.difficulty}</Badge>
            <Badge tone="brand">{t.metadata.competition === "line" ? "Line Following" : t.metadata.competition === "race" ? "Robo Race" : "Robo War / Sumo"}</Badge>
            {t.metadata.drivetrain && <Badge tone={t.metadata.legacy ? "dim" : t.metadata.drivetrain === "4WD" ? "accent" : "dim"}>{t.metadata.legacy ? "Legacy 2WD — 4WD is the club standard" : t.metadata.drivetrain}</Badge>}
            {report ? <Badge tone={report.status === "READY TO SIMULATE" ? "ok" : report.status === "READY WITH WARNINGS" ? "warn" : "bad"}>{report.status}</Badge> : <Badge>readiness test running…</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => act("load")}><Upload size={14} /> LOAD PROJECT</Button>
          <Button variant="primary" onClick={() => act("simulate")}><Play size={14} /> SIMULATE NOW</Button>
          <Button variant="secondary" onClick={() => act("customise")}><Copy size={14} /> CUSTOMISE (MY COPY)</Button>
        </div>
      </div>

      <div className="my-5 overflow-x-auto">
        <Tabs value={tab} onChange={setTab} items={(Object.keys(TAB_LABEL) as Tab[]).map((v) => ({ value: v, label: TAB_LABEL[v] }))} />
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-5">
            <Panel title="What it is"><p className="text-sm text-muted">{t.metadata.description}</p></Panel>
            <Panel title="Working principle"><p className="text-sm leading-relaxed text-muted">{t.metadata.workingPrinciple}</p></Panel>
            <Panel title="Learning objectives">
              <ul className="space-y-1 text-sm">{t.metadata.learningObjectives.map((o) => <li key={o} className="flex gap-2"><Target size={14} className="mt-0.5 shrink-0 text-accent-ink" />{o}</li>)}</ul>
              <div className="mt-2 text-xs text-dim">Learning level: {t.metadata.learningLevel}</div>
            </Panel>
            <Panel title="Project limitations">
              <ul className="space-y-1 text-sm text-muted">{t.metadata.limitations.map((o) => <li key={o} className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />{o}</li>)}</ul>
            </Panel>
          </div>
          <div className="space-y-5">
            {sheet?.drivers.filter((d) => d.warning).map((d) => (
              <div key={d.label} role="alert" className="flex gap-2 rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" /><span><b>{d.label} current limit:</b> {d.warning}</span></div>
            ))}
            <div className="h-72 overflow-hidden rounded-xl border border-line"><Preview3D project={project} /></div>
            <Panel title="Chassis & mass">
              <dl className="grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-dim">Chassis</dt><dd>{getComponent(project.chassis!.componentId)?.name}</dd>
                <dt className="text-dim">Size</dt><dd>{project.chassis!.length_mm} × {project.chassis!.width_mm} × {project.chassis!.thickness_mm} mm</dd>
                <dt className="text-dim">Material</dt><dd>{project.chassis!.material}</dd>
                <dt className="text-dim">Total mass</dt><dd>{mass.totalG.toFixed(0)} g{mass.estimatedParts.length ? " (some parts estimated)" : ""}</dd>
                <dt className="text-dim">Centre of mass</dt><dd className="font-mono text-xs">x {mass.com.x.toFixed(1)} · y {mass.com.y.toFixed(1)} · z {mass.com.z.toFixed(1)} mm</dd>
              </dl>
            </Panel>
          </div>
        </div>
      )}

      {tab === "assembly" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
          <div className="relative h-[520px] overflow-hidden rounded-xl border border-line">
            <Preview3D project={project} exploded={exploded} />
            <Button size="sm" className="absolute left-3 top-3" variant={exploded ? "primary" : "outline"} onClick={() => setExploded(exploded ? 0 : 1)}>{exploded ? "RESTORE" : "EXPLODED VIEW"}</Button>
          </div>
          <Panel title="Mechanical configuration" bodyClass="max-h-[520px] overflow-auto p-3">
            <RobotTopView project={project} className="mx-auto mb-3 h-40" />
            <table className="w-full text-[11px]">
              <thead><tr className="bf-label text-left"><th>Part</th><th>x, y, z (mm)</th><th>yaw</th></tr></thead>
              <tbody>
                {project.parts.map((p) => (
                  <tr key={p.uid} className="border-t border-line/60">
                    <td className="py-1">{p.label}{p.attachedTo ? <span className="text-dim"> → {label(p.attachedTo)}</span> : null}</td>
                    <td className="font-mono">{p.position.x.toFixed(0)}, {p.position.y.toFixed(0)}, {p.position.z.toFixed(0)}</td>
                    <td className="font-mono">{Math.round((p.rotation.z * 180) / Math.PI)}°</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {tab === "wiring" && (
        <div className="space-y-5">
          <Panel title={`Connections (${wiring.length})`} bodyClass="max-h-[560px] overflow-auto p-0">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-bg2"><tr className="bf-label text-left"><th className="px-3 py-2">From</th><th className="px-3 py-2">To</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Wire</th><th className="px-3 py-2">Voltage</th><th className="px-3 py-2">Note</th></tr></thead>
              <tbody>
                {wiring.map((r) => (
                  <tr key={r.id} className="border-t border-line/60">
                    <td className="px-3 py-1.5 font-mono">{r.from}</td>
                    <td className="px-3 py-1.5 font-mono">{r.to}</td>
                    <td className="px-3 py-1.5"><Badge tone={TYPE_TONE[r.type]}>{r.type}</Badge></td>
                    <td className="px-3 py-1.5"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-5 rounded" style={{ background: WIRE_HEX[r.color] }} />{r.color}</span></td>
                    <td className="px-3 py-1.5 font-mono">{r.voltage == null ? "—" : `${r.voltage} V`}</td>
                    <td className="px-3 py-1.5 text-muted">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Pin mapping">
              <table className="w-full text-sm">
                <thead><tr className="bf-label text-left"><th className="py-1">Controller pin</th><th>Connected to</th><th>Purpose</th></tr></thead>
                <tbody>{t.pinMap.map((r) => <tr key={r.pin} className="border-t border-line align-top"><td className="py-1.5 font-mono text-brand">{r.pin}</td><td className="pr-2">{r.connectedTo}</td><td className="text-muted">{r.purpose}</td></tr>)}</tbody>
              </table>
            </Panel>
            <Panel title="Reading the wiring">
              <p className="text-sm text-muted">Every row above is one wire in this robot. Voltages come from the circuit solver (battery → switch → driver / regulator → controller), not from labels. Wire colours follow the studio convention: red supply, black ground, yellow signal, green sensor output, blue communication/encoders, orange motor.</p>
              <p className="mt-2 text-xs text-dim">Load the project to open the full interactive schematic in Circuit Studio — the circuit, the code generator and the simulator all read this same wiring.</p>
            </Panel>
          </div>
        </div>
      )}

      {tab === "code" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
          <pre className="max-h-[640px] overflow-auto bf-code rounded-xl p-4 font-mono text-[12px] leading-relaxed">
            {t.firmware.source.split("\n").map((l, i) => (
              <div key={i}><span className="mr-4 inline-block w-8 select-none text-right text-dim">{i + 1}</span><span className={l.trim().startsWith("//") ? "bf-code-dim" : l.trim().startsWith("#define") ? "text-accent-ink" : ""}>{l}</span></div>
            ))}
          </pre>
          <div className="space-y-4">
            <Panel title="Board & libraries">
              <div className="text-sm">Board profile: <span className="font-mono text-brand">{t.firmware.board}</span></div>
              <div className="text-sm">Libraries: {t.firmware.libraries.length ? t.firmware.libraries.join(", ") : "none (core Arduino API only)"}</div>
              {t.simulation.keyboardViaSerial && <div className="mt-2 text-xs text-muted">Bluetooth commands: {t.metadata.controlProtocol ?? BT_PROTOCOL_DOC}</div>}
            </Panel>
            <Panel title="Adjustable parameters">
              <ul className="space-y-2 text-sm">{t.firmware.adjustable.map((a) => <li key={a.name}><span className="font-mono text-accent-ink">{a.name}</span><div className="text-xs text-muted">{a.meaning}</div></li>)}</ul>
            </Panel>
          </div>
        </div>
      )}

      {tab === "simulation" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Simulation configuration">
            <dl className="grid grid-cols-[150px_1fr] gap-y-1.5 text-sm">
              <dt className="text-dim">Default environment</dt><dd>{getExampleTrack(t.simulation.defaultTrackId)?.name}</dd>
              <dt className="text-dim">Also try</dt><dd>{t.simulation.alternativeTrackIds.map((x) => getExampleTrack(x)?.name).join(" · ")}<div className="text-xs text-muted">…or any track you draw in the Track Designer.</div></dd>
              <dt className="text-dim">Control</dt><dd>{t.simulation.keyboardViaSerial ? "Keyboard → HC-05 → firmware (W/A/S/D, SHIFT boost, SPACE stop)" : "Autonomous firmware"}</dd>
              {t.simulation.opponent && (<><dt className="text-dim">Opponent</dt><dd>{t.simulation.opponent} AI (change in the arena)</dd></>)}
              <dt className="text-dim">Physics timestep</dt><dd>{(t.simulation.dt ?? 0.001) * 1000} ms fixed</dd>
              <dt className="text-dim">Difficulty</dt><dd>{t.simulation.difficulty}</dd>
              {t.simulation.tunables?.length ? (<><dt className="text-dim">Live tuning</dt><dd>{t.simulation.tunables.map((x) => `${x.label} (${x.command})`).join(", ")}</dd></>) : null}
              {t.simulation.telemetryFields?.length ? (<><dt className="text-dim">Telemetry panel</dt><dd className="text-xs">{t.simulation.telemetryFields.join(", ")}</dd></>) : null}
            </dl>
          </Panel>
          <Panel title="Automated readiness test" actions={<Button size="sm" onClick={() => setFresh(runReadiness(t, { simSeconds: 2 }))}>Run again</Button>}>
            {!report ? <div className="text-sm text-muted">Running…</div> : (
              <ol className="space-y-1">
                {report.checks.map((c) => (
                  <li key={c.id} className="flex gap-2 text-sm">
                    {c.ok ? (c.warning ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" />) : <XCircle size={15} className="mt-0.5 shrink-0 text-bad" />}
                    <span>{c.id}. {c.name}<span className="block text-[11px] text-dim">{c.detail}</span></span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      )}

      {tab === "specs" && sheet && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Mechanical">
            <dl className="grid grid-cols-[150px_1fr] gap-y-1.5 text-sm">
              <dt className="text-dim">Drivetrain</dt><dd>{t.metadata.drivetrain ?? "—"}{t.metadata.drivetrain === "4WD" ? " skid-steer, four powered wheels" : ""}</dd>
              {sheet.dimensions && (<><dt className="text-dim">Chassis</dt><dd>{sheet.dimensions.length_mm} × {sheet.dimensions.width_mm} × {sheet.dimensions.thickness_mm} mm {sheet.dimensions.material}</dd></>)}
              <dt className="text-dim">Ground clearance</dt><dd>{sheet.groundClearance_mm == null ? "—" : `${Math.round(sheet.groundClearance_mm)} mm`}</dd>
              {sheet.wheels && (<><dt className="text-dim">Wheels</dt><dd>{sheet.wheels.count}× {sheet.wheels.name} — Ø{sheet.wheels.diameter_mm} × {sheet.wheels.width_mm} mm</dd></>)}
              {sheet.motors && (<><dt className="text-dim">Motors</dt><dd>{sheet.motors.count}× {sheet.motors.name}{sheet.motors.ratedV ? ` — ${sheet.motors.ratedV} V, ${sheet.motors.rpm} rpm no-load, ${sheet.motors.stallA} A stall` : ""}</dd></>)}
              <dt className="text-dim">Total mass</dt><dd>{sheet.mass_g} g{sheet.massEstimated ? " (some parts estimated)" : ""}</dd>
              <dt className="text-dim">Controller</dt><dd>{sheet.controller ?? "—"}</dd>
              <dt className="text-dim">Sensors</dt><dd>{sheet.sensors.length ? sheet.sensors.join(" · ") : "none"}</dd>
            </dl>
          </Panel>
          <Panel title="Power">
            {sheet.power.battery ? (
              <dl className="grid grid-cols-[150px_1fr] gap-y-1.5 text-sm">
                <dt className="text-dim">Battery</dt><dd>{sheet.power.battery.name}</dd>
                <dt className="text-dim">Voltage</dt><dd>{sheet.power.battery.nominal_V} V nominal · {sheet.power.battery.full_V} V full · {sheet.power.battery.cutoff_V} V cut-off ({sheet.power.battery.cells}S)</dd>
                <dt className="text-dim">Capacity / energy</dt><dd>{sheet.power.battery.capacity_mAh} mAh · {sheet.power.battery.energy_Wh} Wh</dd>
                <dt className="text-dim">Typical draw (est.)</dt><dd>{sheet.power.totalCurrent_A.toFixed(2)} A while driving</dd>
                <dt className="text-dim">All motors stalled</dt><dd>{sheet.power.stallCurrent_A} A worst case</dd>
                <dt className="text-dim">Runtime (est.)</dt><dd>{sheet.power.runtime_min == null ? "not enough data" : `≈ ${sheet.power.runtime_min} min of driving (80 % usable capacity)`}</dd>
              </dl>
            ) : <p className="text-sm text-muted">No battery in this robot.</p>}
            {sheet.power.missing.length > 0 && <ul className="mt-2 text-xs text-warn">{sheet.power.missing.map((m) => <li key={m}>{m}</li>)}</ul>}
          </Panel>
          <Panel title="Motor driver channel loading" className="lg:col-span-2" bodyClass="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-bg2"><tr className="bf-label text-left"><th className="px-3 py-2">Driver</th><th className="px-3 py-2">Motors / channel</th><th className="px-3 py-2">Rating (cont. / peak)</th><th className="px-3 py-2">Channel draw (driving / stall)</th><th className="px-3 py-2">Result</th></tr></thead>
              <tbody>
                {sheet.drivers.map((d) => (
                  <tr key={d.label} className="border-t border-line align-top">
                    <td className="px-3 py-2">{d.label} <span className="text-xs text-dim">{d.name}</span></td>
                    <td className="px-3 py-2">{d.motorsPerChannel}</td>
                    <td className="px-3 py-2 font-mono">{d.contA} A / {d.peakA} A</td>
                    <td className="px-3 py-2 font-mono">{d.channelDriveA} A / {d.channelStallA} A</td>
                    <td className="px-3 py-2">{d.ok ? <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 size={14} /> within limits</span> : <span className="flex gap-1 text-warn"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{d.warning}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-dim">Currents are estimates from the motor datasheet values scaled to the battery voltage; driving assumes 25 % of the way from no-load to stall.</p>
          </Panel>
          <Panel title="Limitations" className="lg:col-span-2">
            <ul className="space-y-1 text-sm text-muted">{t.metadata.limitations.map((o) => <li key={o} className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />{o}</li>)}</ul>
          </Panel>
        </div>
      )}

      {tab === "components" && (
        <Panel title={`Bill of materials (${project.parts.length} parts + chassis)`} bodyClass="p-0">
          <table className="w-full text-sm">
            <thead className="bg-bg2"><tr className="bf-label text-left"><th className="px-4 py-2">Qty</th><th className="px-4 py-2">Component</th><th className="px-4 py-2">Refs</th><th className="px-4 py-2">Simulation</th></tr></thead>
            <tbody>
              <tr className="border-t border-line"><td className="px-4 py-2">1</td><td className="px-4 py-2"><Link className="hover:text-accent-ink" href={`/library?c=${project.chassis!.componentId}`}>{getComponent(project.chassis!.componentId)?.name}</Link></td><td className="px-4 py-2 text-dim">chassis</td><td className="px-4 py-2"><SimBadge status={getComponent(project.chassis!.componentId)!.simStatus} /></td></tr>
              {bom.map((b) => {
                const c = getComponent(b.id)!;
                return (
                  <tr key={b.id} className="border-t border-line">
                    <td className="px-4 py-2">{b.n}</td>
                    <td className="px-4 py-2"><Link className="hover:text-accent-ink" href={`/library?c=${b.id}`}>{c.name}</Link><div className="text-xs text-dim">{c.model ?? c.category}</div></td>
                    <td className="px-4 py-2 font-mono text-xs text-muted">{b.labels.join(", ")}</td>
                    <td className="px-4 py-2"><SimBadge status={c.simStatus} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
      {flow && <LoadFlow templateId={t.metadata.id} intent={flow} onClose={() => setFlow(null)} />}
    </div>
  );
}
