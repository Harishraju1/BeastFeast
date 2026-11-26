"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, BatteryMedium, Cpu, Gauge } from "lucide-react";
import { BenchSim } from "@/lib/sim/bench";
import { designFingerprint } from "@/lib/fingerprint";
import type { SensorReading } from "@/lib/sim/types";
import type { Project } from "@/lib/types";

export type BenchMode = "stopped" | "running" | "paused";

/** Owns the bench simulator and its animation loop (≈20 UI updates per second; the code runs at 1 kHz). */
export function useBench(project: Project) {
  const [mode, setMode] = useState<BenchMode>("stopped");
  const [sim, setSim] = useState<BenchSim | null>(null);
  const [builtFor, setBuiltFor] = useState("");
  const [, setTick] = useState(0);
  const key = `${designFingerprint(project)}|${project.code?.length ?? 0}|${project.code?.slice(-200)}`;

  // the circuit or code changed while the bench is on: rebuild from the new circuit, keeping the sensor inputs
  if (sim && mode !== "stopped" && builtFor !== key) {
    const next = new BenchSim(project);
    for (const [k, v] of Object.entries(sim.readings)) if (k in next.readings) next.readings[k] = v;
    setSim(next);
    setBuiltFor(key);
  }

  useEffect(() => {
    if (mode !== "running" || !sim) return;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      // catch up after slow / throttled frames (BenchSim.advance caps one call at 0.4 s of simulated time)
      const dt = Math.min(0.4, (now - last) / 1000);
      last = now;
      sim.advance(dt);
      if (now - lastUi > 50) {
        lastUi = now;
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, sim]);

  const fresh = () => {
    setSim(new BenchSim(project));
    setBuiltFor(key);
  };
  return {
    mode,
    sim: mode === "stopped" ? null : sim,
    run: () => {
      if (mode === "stopped" || !sim) fresh();
      setMode("running");
    },
    pause: () => setMode("paused"),
    stop: () => {
      setSim(null);
      setMode("stopped");
    },
    reset: () => {
      fresh();
      if (mode === "stopped") setMode("paused");
    },
    setReading: (uid: string, r: SensorReading) => {
      sim?.setReading(uid, r);
      setTick((t) => t + 1);
    },
  };
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
            <div className="text-[10px] text-dim">Full {f1(st.battery.full)} V · empty {f1(st.battery.empty)} V · sags with load (internal resistance)</div>
          </div>
        ) : (
          <div className="text-warn">No battery in the circuit: nothing is powered.</div>
        )}
        {s.compileResult && !s.compileResult.ok && (
          <div className="rounded border border-bad/50 bg-bad/10 p-2 text-bad">Your code does not compile, so only the wiring is powered: {s.compileResult.diagnostics.find((d) => d.severity === "error")?.message}</div>
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
        {Object.entries(st.servo).map(([pin, a]) => <div key={pin} className="font-mono">Servo on pin {pin}: {Math.round(a)}°</div>)}
        {s.notSimulated.length > 0 && (
          <div className="mt-1 text-[11px] text-dim">Not simulated: {s.notSimulated.map((n) => `${n.label} (${n.reason})`).join("; ")}</div>
        )}
      </div>
      <div className="space-y-1">
        <div className="bf-label flex items-center gap-1"><Cpu size={12} /> Sensors (set what they see)</div>
        {Object.keys(s.readings).length === 0 && <div className="text-muted">No simulated sensors.</div>}
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
