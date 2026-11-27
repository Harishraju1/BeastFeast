"use client";
import { useEffect } from "react";
import { AlertTriangle, BatteryMedium, Cpu, Gauge } from "lucide-react";
import { useBench3 } from "@/lib/store/bench";
export type { BenchMode } from "@/lib/store/bench";
import { designFingerprint } from "@/lib/fingerprint";
import type { SensorReading } from "@/lib/sim/types";
import type { Project } from "@/lib/types";

/**
 * The circuit bench for this project, from the shared bench store (one simulation and one animation loop for
 * Circuit Studio and the Robot Designer). Re-renders ≈20× per second while it runs.
 */
export function useBench(project: Project) {
  const st = useBench3();
  const key = `${designFingerprint(project)}|${project.code?.length ?? 0}|${project.code?.slice(-200)}`;
  const mine = st.projectId === project.id;
  // the circuit or code changed while the bench is on: rebuild from the new circuit, keeping the sensor inputs
  useEffect(() => {
    const s = useBench3.getState();
    if (s.projectId === project.id && s.sim && s.mode !== "stopped" && s.builtFor !== key) s.rebuild(project, key);
  }, [key, project]);
  const mode = mine ? st.mode : "stopped";
  return {
    mode,
    sim: mine && st.mode !== "stopped" ? st.sim : null,
    wheelAngles: mine ? st.wheelAngles : {},
    run: () => st.start(project, key),
    pause: () => st.pause(),
    stop: () => st.stop(),
    reset: () => st.reset(project, key),
    setReading: (uid: string, r: SensorReading) => {
      st.sim?.setReading(uid, r);
      st.bump();
    },
    setEnv: (uid: string, e: { temperature?: number; humidity?: number; lux?: number }) => {
      st.sim?.setEnv(uid, e);
      st.bump();
    },
    setManualPin: (pin: number, v: "input" | 0 | 1 | { duty: number }) => {
      st.sim?.setManualPin(pin, v);
      st.bump();
    },
    lowPerf: st.lowPerf,
    setLowPerf: st.setLowPerf,
  };
}

/** Controller pins that are wired to something, for manual control when no firmware runs. */
function wiredPins(s: NonNullable<ReturnType<typeof useBench>["sim"]>) {
  const ctrl = s.bridge.controller;
  if (!ctrl) return [];
  return ctrl.comp.pins
    .filter((p) => p.fn === "gpio" && p.arduinoPin !== undefined && !(p.caps ?? []).includes("input-only"))
    .map((p) => ({ p, net: s.graph.netOf.get(`${ctrl.part.uid}.${p.id}`) }))
    .filter(({ net }) => net && net.members.some((m) => m.part.uid !== ctrl.part.uid))
    .map(({ p, net }) => ({ pin: p.arduinoPin!, label: p.label, pwm: (p.caps ?? []).includes("pwm"), to: net!.members.filter((m) => m.part.uid !== ctrl.part.uid).map((m) => `${m.part.label}.${m.pin.label}`).join(", ") }));
}

const f1 = (x: number) => x.toFixed(1);

export function BenchPanel({ bench, project }: { bench: ReturnType<typeof useBench>; project: Project }) {
  const s = bench.sim;
  if (!s) return <div className="p-2 text-muted">Press <b>Run</b> to power the circuit on the bench: your code runs, motors spin, current flows through the wires. Nothing here changes your saved design.</div>;
  const st = s.state;
  const label = (uid: string) => project.parts.find((p) => p.uid === uid)?.label ?? uid;
  const ctrl = s.bridge.controller;
  return (
    <div className="grid gap-3 p-2 font-sans text-xs md:grid-cols-3" data-testid="bench-panel">
      <div className="space-y-2">
        {s.faults.map((f) => (
          <div key={f.message} className="bf-blink rounded border border-bad/60 bg-bad/10 p-2 text-bad" role="alert"><AlertTriangle size={13} className="mr-1 inline" />{f.message}</div>
        ))}
        {st.battery ? (
          <div className="rounded border border-line p-2">
            <div className="flex items-center gap-1 font-semibold"><BatteryMedium size={14} /> {label(st.battery.uid)}</div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-line"><div className="h-full bg-ok transition-all" style={{ width: `${Math.round(st.battery.soc * 100)}%` }} /></div>
            <div className="mt-1 grid grid-cols-2 gap-x-2 font-mono">
              <span>{f1(st.battery.volts)} V</span><span>{Math.round(st.battery.soc * 100)} % charge</span>
              <span>{st.battery.currentA.toFixed(2)} A</span><span>{f1(st.battery.powerW)} W</span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-2 text-[10px] text-muted" data-testid="battery-props">
              <span>{st.battery.cells}S{st.battery.parallel}P · {st.battery.capacity_mAh} mAh</span><span>{f1(st.battery.energyWh)} Wh</span>
              <span>Full {f1(st.battery.full)} V · cut-off {f1(st.battery.empty)} V</span><span>R int ≈{(st.battery.rint * 1000).toFixed(0)} mΩ</span>
              <span>Max {Number.isFinite(st.battery.maxA) ? `${f1(st.battery.maxA)} A` : "not specified"}</span><span>≈{st.battery.tempC.toFixed(1)} °C (estimate)</span>
              <span className="col-span-2">Runtime at this load: {st.battery.runtimeMin === null ? "—" : st.battery.runtimeMin > 600 ? "> 10 h" : `≈${Math.round(st.battery.runtimeMin)} min`}</span>
            </div>
            {st.battery.warnings.map((w) => <div key={w} className="mt-1 rounded border border-warn/50 bg-warn/10 px-1.5 py-0.5 text-[10px] text-warn">{w}</div>)}
            <div className="text-[10px] text-dim">Voltage sags with load (internal resistance); charge drains with the simulated current × time.</div>
          </div>
        ) : (
          <div className="text-warn">No battery in the circuit: nothing is powered.</div>
        )}
        {s.compileResult && !s.compileResult.ok && (
          <div className="rounded border border-bad/50 bg-bad/10 p-2 text-bad">Your code does not compile: {s.compileResult.diagnostics.find((d) => d.severity === "error")?.message}</div>
        )}
        {!s.hasProgram && s.bridge.controller && (
          <div className="rounded border border-warn/50 bg-warn/10 p-2" data-testid="manual-pins">
            <div className="font-semibold text-warn">Firmware is not running{!s.compileResult ? " (this board's code is not executed by the simulator)" : ""}.</div>
            <div className="mb-1 text-[11px] text-muted">The electrical circuit is still simulated. Drive the controller pins by hand to test the hardware:</div>
            {wiredPins(s).length === 0 && <div className="text-muted">No controller pin is wired yet.</div>}
            {wiredPins(s).map((w) => {
              const cur = s.manualPins.get(w.pin);
              const val = !cur ? "input" : "duty" in cur ? "pwm" : String(cur.level);
              return (
                <div key={w.pin} className="flex flex-wrap items-center gap-1 py-0.5">
                  <span className="w-10 font-mono">{w.label}</span>
                  <select className="bf-input !w-auto !py-0 text-[11px]" value={val} aria-label={`Pin ${w.label}`} onChange={(e) => bench.setManualPin(w.pin, e.target.value === "input" ? "input" : e.target.value === "pwm" ? { duty: 0.5 } : (Number(e.target.value) as 0 | 1))}>
                    <option value="input">not driven</option>
                    <option value="0">LOW</option>
                    <option value="1">HIGH</option>
                    {w.pwm && <option value="pwm">PWM</option>}
                  </select>
                  {cur && "duty" in cur && <input type="range" min={0} max={100} value={Math.round(cur.duty * 100)} aria-label={`PWM duty on ${w.label}`} onChange={(e) => bench.setManualPin(w.pin, { duty: Number(e.target.value) / 100 })} />}
                  {cur && "duty" in cur && <span className="font-mono">{Math.round(cur.duty * 100)} %</span>}
                  <span className="truncate text-[10px] text-dim">→ {w.to}</span>
                </div>
              );
            })}
          </div>
        )}
        {!ctrl && <div className="text-muted">No controller: motors only move if they are wired straight to power.</div>}
        {st.runtime?.error && <div className="rounded border border-bad/50 bg-bad/10 p-2 text-bad">Runtime error (line {st.runtime.error.line ?? "?"}): {st.runtime.error.message}</div>}
      </div>
      <div className="space-y-1">
        <div className="bf-label flex items-center gap-1"><Gauge size={12} /> Motors</div>
        {Object.entries(st.motors).length === 0 && <div className="text-muted">No DC motors.</div>}
        {Object.entries(st.motors).map(([uid, m]) => (
          <div key={uid} className="flex flex-wrap justify-between gap-x-2 border-b border-line/50 py-0.5 font-mono" data-testid={`bench-motor-${label(uid)}`}>
            <span className="font-sans font-semibold">{label(uid)}</span>
            <span>{m.volts === null ? "coasting" : `${f1(m.volts)} V`}</span>
            <span>{Math.round(m.rpm)} rpm {m.rpm > 1 ? "↻" : m.rpm < -1 ? "↺" : "■"}</span>
            <span>{Math.abs(m.currentA).toFixed(2)} A</span>
          </div>
        ))}
        {st.dc.filter((e) => e.kind === "led").map((e) => (
          <div key={e.partUid + e.channel} className="flex justify-between font-mono"><span className="font-sans">{label(e.partUid)}</span><span className={e.overload ? "text-bad" : ""}>{(e.current * 1000).toFixed(1)} mA {e.overload ? "— BURNT" : `· ${Math.round((e.brightness ?? 0) * 100)} %`}</span></div>
        ))}
        {st.dc.filter((e) => e.kind === "resistor").map((e) => (
          <div key={e.partUid} className="flex justify-between font-mono"><span className="font-sans">{label(e.partUid)}</span><span className={e.overload ? "text-bad" : ""}>{(Math.abs(e.current) * 1000).toFixed(1)} mA · {(e.power * 1000).toFixed(0)} mW</span></div>
        ))}
        {Object.entries(st.servos).map(([uid, sv]) => <div key={uid} className="flex justify-between font-mono"><span className="font-sans">{label(uid)}</span><span>{sv.pin === null ? "signal not wired" : !sv.powered ? "no power" : `${Math.round(sv.angle)}° → ${Math.round(sv.target)}°`}</span></div>)}
        {Object.entries(st.regulators).map(([uid, r]) => (
          <div key={uid} className="font-mono">
            <div className="flex justify-between"><span className="font-sans">{label(uid)}</span><span>{f1(r.vin)} V → {f1(r.vout)} V</span></div>
            <div className="flex justify-between text-[10px] text-muted"><span>out {(r.ioutA * 1000).toFixed(0)} mA · in {(r.iinA * 1000).toFixed(0)} mA</span><span>{Math.round(r.efficiency * 100)} % · {r.heatW.toFixed(2)} W heat</span></div>
            {r.warning && <div className="text-[10px] text-warn">{r.warning}</div>}
          </div>
        ))}
        {st.displays.map((d, i) => (
          <div key={i} className="text-[11px]"><span className="font-sans font-semibold">{d.partUid ? label(d.partUid) : d.kind.toUpperCase()}</span>{" "}{d.reason ? <span className="text-warn">{d.reason}</span> : <span className="font-mono text-muted">{(d.kind === "oled" ? d.runs.map((r) => r.ch).join("") : d.lines.join(" / ")).trim().slice(0, 60) || "(blank)"}</span>}</div>
        ))}
        {s.notSimulated.length > 0 && (
          <div className="mt-1 text-[11px] text-dim">Not simulated: {s.notSimulated.map((n) => `${n.label} (${n.reason})`).join("; ")}</div>
        )}
      </div>
      <div className="space-y-1">
        <div className="bf-label flex items-center gap-1"><Cpu size={12} /> Sensors (set what they see)</div>
        {Object.keys(s.readings).length === 0 && Object.keys(s.env).length === 0 && <div className="text-muted">No simulated sensors.</div>}
        {Object.entries(s.env).map(([uid, e]) => (
          <div key={uid} className="rounded border border-line p-1.5">
            <div className="font-semibold">{label(uid)}</div>
            {e.temperature !== undefined && (
              <label className="flex items-center gap-2">Temp <input type="range" min={-20} max={60} step={0.5} value={e.temperature} aria-label="Temperature" onChange={(ev) => bench.setEnv(uid, { temperature: Number(ev.target.value) })} /><span className="font-mono">{e.temperature.toFixed(1)} °C</span></label>
            )}
            {e.humidity !== undefined && (
              <label className="flex items-center gap-2">Hum. <input type="range" min={0} max={100} step={1} value={e.humidity} aria-label="Humidity" onChange={(ev) => bench.setEnv(uid, { humidity: Number(ev.target.value) })} /><span className="font-mono">{Math.round(e.humidity)} %</span></label>
            )}
            {e.lux !== undefined && (
              <label className="flex items-center gap-2">Light <input type="range" min={0} max={3} step={0.05} value={Math.log10(Math.max(1, e.lux))} aria-label="Light level" onChange={(ev) => bench.setEnv(uid, { lux: Math.round(Math.pow(10, Number(ev.target.value))) })} /><span className="font-mono">{Math.round(e.lux)} lux</span></label>
            )}
          </div>
        ))}
        {Object.entries(s.readings).map(([uid, r]) => (
          <div key={uid} className="rounded border border-line p-1.5">
            <div className="font-semibold">{label(uid)}</div>
            {r.kind === "reflectance" && (
              <div className="flex flex-wrap gap-2">
                {r.darkness.map((d, i) => (
                  <label key={i} className="flex items-center gap-1">
                    <input type="checkbox" checked={d > 0.5} onChange={(e) => bench.setReading(uid, { kind: "reflectance", darkness: r.darkness.map((x, j) => (j === i ? (e.target.checked ? 1 : 0) : x)) })} />
                    {r.darkness.length > 1 ? `S${i + 1}` : ""} on black
                  </label>
                ))}
              </div>
            )}
            {r.kind === "distance" && (
              <div className="flex items-center gap-2">
                <input type="range" min={2} max={200} value={r.distance === null ? 200 : Math.round(r.distance * 100)} aria-label="Distance" onChange={(e) => bench.setReading(uid, { kind: "distance", distance: Number(e.target.value) >= 200 ? null : Number(e.target.value) / 100 })} />
                <span className="font-mono">{r.distance === null ? "nothing" : `${Math.round(r.distance * 100)} cm`}</span>
              </div>
            )}
            {r.kind === "bumper" && (
              <label className="flex items-center gap-1"><input type="checkbox" checked={r.pressed} onChange={(e) => bench.setReading(uid, { kind: "bumper", pressed: e.target.checked })} /> pressed</label>
            )}
            {r.kind === "encoder" && <div className="text-dim">Encoders count wheel turns in the arena; on the bench they stay at 0.</div>}
          </div>
        ))}
        {st.serial && <pre className="bf-code max-h-24 overflow-auto whitespace-pre-wrap rounded p-1 font-mono text-[10px]">{st.serial.slice(-800)}</pre>}
      </div>
    </div>
  );
}
