"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Pause, Play, RotateCcw, Square, StepForward, Bug, Eye, Gamepad2, Code2 } from "lucide-react";
import { useApp } from "@/lib/store/app";
import { useArenaHex } from "@/lib/store/hex";
import { SimSession, type ControlMode } from "@/lib/sim/session";
import type { DebugFinding } from "@/lib/sim/debug";
import type { OpponentLevel } from "@/lib/sim/opponent";
import { compileTrack } from "@/lib/track/compile";
import { EXAMPLE_TRACKS } from "@/lib/track/examples";
import type { TrackDef } from "@/lib/sim/types";
import type { Project, SimulationResult } from "@/lib/types";
import { getComponent } from "@/lib/catalogue";
import { partDims } from "@/lib/mech/geometry";
import { validationState } from "@/lib/fingerprint";
import { RobotAssembly } from "@/components/three/RobotParts";
import { TrackScene } from "@/components/three/TrackScene";
import { Badge, Button, Tabs } from "@/components/ui";
import { isTypingTarget } from "@/lib/keyboard";
import { THEME } from "@/lib/theme";
import { checkOriginality } from "@/lib/code/originality";

type Cam = "robot" | "free" | "top" | "side";
type RunState = "idle" | "running" | "paused" | "finished" | "error";

interface Snap {
  x: number;
  y: number;
  h: number;
  wheels: Record<string, number>;
  opp?: { x: number; y: number; h: number };
  ghost?: { x: number; y: number; h: number } | null;
}

function RobotView({ project, snap, groundOffset }: { project: Project; snap: React.RefObject<Snap>; groundOffset: number }) {
  const g = useRef<THREE.Group>(null);
  const [wheels, setWheels] = useState<Record<string, number>>({});
  useFrame(() => {
    const s = snap.current;
    if (!g.current || !s) return;
    g.current.position.set(s.x, groundOffset, -s.y);
    g.current.rotation.y = s.h;
    setWheels(s.wheels);
  });
  return (
    <group ref={g}>
      <RobotAssembly project={project} wheelAngles={wheels} />
    </group>
  );
}

function BoxBot({ snap, pick, color, size, opacity = 1 }: { snap: React.RefObject<Snap>; pick: "opp" | "ghost"; color: string; size: [number, number, number]; opacity?: number }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const p = snap.current?.[pick];
    if (!m.current) return;
    m.current.visible = !!p;
    if (p) {
      m.current.position.set(p.x, size[1] / 2, -p.y);
      m.current.rotation.y = p.h;
    }
  });
  return (
    <mesh ref={m} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

function CameraRig({ mode, snap, center }: { mode: Cam; snap: React.RefObject<Snap>; center: [number, number] }) {
  const { camera } = useThree();
  useFrame(() => {
    const s = snap.current;
    if (!s || mode === "free") return;
    const target = new THREE.Vector3(s.x, 0, -s.y);
    let pos: THREE.Vector3;
    if (mode === "robot") pos = new THREE.Vector3(s.x - Math.cos(s.h) * 0.45, 0.28, -(s.y - Math.sin(s.h) * 0.45));
    else if (mode === "top") pos = new THREE.Vector3(center[0], 3.2, -center[1] + 0.001);
    else pos = new THREE.Vector3(s.x, 0.18, -s.y + 0.9);
    camera.position.lerp(pos, mode === "top" ? 1 : 0.12);
    camera.lookAt(mode === "top" ? new THREE.Vector3(center[0], 0, -center[1]) : target);
  });
  return null;
}

export default function Arena({ project }: { project: Project }) {
  const { tracks, updateProject, award, user, updateProgress, progress, content, toast } = useApp();
  const hex = useArenaHex((s) => (s.hex?.projectId === project.id ? s.hex : null));
  const allTracks = useMemo(() => [...EXAMPLE_TRACKS, ...tracks].filter((t) => t.kind === project.competition), [tracks, project.competition]);
  const [trackId, setTrackId] = useState<string>(project.trackId && allTracks.some((t) => t.id === project.trackId) ? project.trackId : allTracks[0]?.id);
  const track = allTracks.find((t) => t.id === trackId) ?? allTracks[0];
  const compiled = useMemo(() => (track ? compileTrack(track) : null), [track]);
  const [mode, setMode] = useState<ControlMode>(project.simConfig?.controlMode ?? (project.codeCheck?.ok ? "code" : "manual"));
  const [level, setLevel] = useState<OpponentLevel>(project.simConfig?.opponent ?? "beginner");
  const [speedX, setSpeedX] = useState(1);
  const [cam, setCam] = useState<Cam>("robot");
  const [run, setRun] = useState<RunState>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [vm, setVm] = useState<ViewModel | null>(null);
  const [panel, setPanel] = useState<"telemetry" | "sensors" | "serial" | "debug" | "tune">(project.simConfig?.tunables?.length || project.simConfig?.telemetryPrefix ? "tune" : "telemetry");
  const [serialIn, setSerialIn] = useState("");
  const [finding, setFinding] = useState<DebugFinding | null>(null);
  const [ghostOn, setGhostOn] = useState(true);
  const session = useRef<SimSession | null>(null);
  const snap = useRef<Snap>({ x: 0, y: 0, h: 0, wheels: {} });
  const keys = useRef(new Set<string>());
  const lastSerialCmd = useRef("");
  const lastBoost = useRef(false);
  const [highlightTracks, setHighlightTracks] = useState(false);
  // ?autostart=1 stays pending until the physics loop really runs (robust to effects re-running)
  const autostartPending = useRef<boolean | null>(null);
  // slider positions mirror what the running firmware has received; reset whenever the firmware restarts
  const tuneDefaults = () => Object.fromEntries((project.simConfig?.tunables ?? []).map((t) => [t.key, t.default]));
  const [tuneValues, setTuneValues] = useState<Record<string, number>>(tuneDefaults);
  const containerRef = useRef<HTMLDivElement>(null);
  const resultSaved = useRef(false);
  const vstate = validationState(project);

  const groundOffset = useMemo(() => {
    const wheels = project.parts.filter((p) => getComponent(p.componentId)?.kind === "wheel");
    const gz = wheels.length ? Math.min(...wheels.map((w) => w.position.z - partDims(w, getComponent(w.componentId)!).x / 2)) : -40;
    return -gz / 1000;
  }, [project.parts]);

  const best = useMemo(() => project.simulations.filter((r) => r.trackId === trackId && r.bestLapS && r.ghost?.length).sort((a, b) => a.bestLapS! - b.bestLapS!)[0], [project.simulations, trackId]);

  const build = useCallback(() => {
    if (!track) return null;
    try {
      const s = new SimSession({ project, track, mode, hex: mode === "code" ? hex?.text : null, opponent: track.kind === "sumo" ? level : null, opponentStartDelayS: content.rules.sumo.startDelayS, studentName: user?.name });
      session.current = s;
      setErr(s.mode === "code" && s.compileResult && !s.compileResult.ok ? "Your code does not compile — open Code Studio." : null);
      const t = s.telemetry(0);
      snap.current = { x: t.pose.x, y: t.pose.y, h: t.pose.heading, wheels: {} };
      resultSaved.current = false;
      setFinding(null);
      setTuneValues(tuneDefaults());
      setVm(makeVm(s));
      return s;
    } catch (e) {
      setErr((e as Error).message);
      session.current = null;
      setVm(null);
      return null;
    }
  }, [project, track, mode, hex, level, user, content.rules.sumo.startDelayS]);

  useEffect(() => {
    // Rebuild the session when its inputs change. ?autostart=1 / ?tracks=1 come from the Project Garage.
    if (autostartPending.current === null) {
      const q = new URLSearchParams(window.location.search);
      autostartPending.current = q.get("autostart") === "1";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time reaction to the URL
      if (q.get("tracks") === "1") setHighlightTracks(true);
    }
    const s0 = build();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset run state when the session is rebuilt
    setRun(autostartPending.current && s0 ? "running" : "idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, mode, level, hex]);



  const saveResult = useCallback(
    async (outcome: SimulationResult["outcome"]) => {
      const s = session.current;
      if (!s || resultSaved.current || !track) return;
      resultSaved.current = true;
      const tel = s.telemetry(0);
      const laps = tel.race?.lapTimes ?? [];
      const bestLap = laps.length ? Math.min(...laps) : undefined;
      const collisions = s.events.filter((e) => e.type === "collision" && e.robot === 0).length;
      const r: SimulationResult = {
        id: `sim_${Date.now()}`, at: new Date().toISOString(), mode: track.kind, trackId: track.id, controlMode: mode,
        lapTimeS: laps[laps.length - 1], bestLapS: bestLap, avgSpeed: s.time > 0 ? tel.distance / s.time : 0, maxSpeed: s.maxSpeed, distanceM: tel.distance, collisions,
        completion: tel.race?.progress, outcome,
        ghost: bestLap ? s.samples.filter((_, i) => i % 2 === 0).map((x) => ({ t: x.t, x: x.x, y: x.y, h: x.h })) : undefined,
      };
      updateProject(project.id, (p) => ({ ...p, trackId: track.id, simulations: [...p.simulations.slice(-19), r] }), { history: false });
      // XP only for results achieved by the student's OWN code (not templates, Garage firmware or keyboard driving)
      const own = mode === "code" ? checkOriginality(project.code) : null;
      const earns = !!own?.original;
      if ((outcome === "completed" || outcome === "win") && !earns)
        toast("info", mode === "code" ? `Great run — no XP: ${own!.reason}` : "Great run — XP is earned by completing tracks with your own code, not keyboard control.");
      if (earns && outcome === "completed") await award("lap-complete", `${project.id}:${track.id}`, undefined, `Completed ${track.name} with ${project.name}`);
      if (earns && outcome === "win" && track.kind === "sumo") await award("sumo-win", `${track.id}:${level}`, undefined, `Won sumo on ${track.name} vs ${level} opponent`);
      if (progress && bestLap) {
        const prev = progress.records[track.id]?.bestLapS;
        if (prev === undefined || bestLap < prev - 0.01) {
          await updateProgress((pr) => ({ ...pr, records: { ...pr.records, [track.id]: { ...pr.records[track.id], bestLapS: bestLap } } }));
          if (prev !== undefined && earns) await award("record-improved", `${track.id}:${bestLap.toFixed(2)}`, undefined, `New best lap ${bestLap.toFixed(2)} s on ${track.name}`);
        }
      }
      if (outcome === "win") await updateProgress((pr) => ({ ...pr, records: { ...pr.records, [track.id]: { ...pr.records[track.id], wins: (pr.records[track.id]?.wins ?? 0) + 1 } } }));
    },
    [track, mode, project.id, project.code, project.name, updateProject, award, level, progress, updateProgress, toast],
  );

  // main loop: fixed physics steps, decoupled from rendering
  useEffect(() => {
    if (run !== "running") return;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let last = performance.now();
    let uiT = 0;
    // requestAnimationFrame normally; a timer fallback keeps physics running if frames stall (hidden/embedded views)
    const schedule = (fn: (t: number) => void) => {
      let fired = false;
      const run1 = (t: number) => {
        if (fired || stopped) return;
        fired = true;
        cancelAnimationFrame(raf);
        clearTimeout(timer);
        fn(t);
      };
      raf = requestAnimationFrame(run1);
      timer = setTimeout(() => run1(performance.now()), 60);
    };
    const loop = (now: number) => {
      const s = session.current;
      if (!s) return;
      autostartPending.current = false;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // keyboard → manual input / bluetooth serial
      const k = keys.current;
      const fwd = (k.has("w") ? 1 : 0) - (k.has("s") ? 1 : 0);
      const turn = (k.has("a") ? 1 : 0) - (k.has("d") ? 1 : 0);
      s.manual.forward = fwd;
      s.manual.turn = turn;
      s.manual.boost = k.has("shift");
      s.manual.estop = k.has(" ");
      if (s.mode === "code" && s.bridge.hasSerialModule()) {
        // Bluetooth RC protocol: F/B/L/R/S plus diagonals Q/E (forward-left/right), Z/C (reverse-left/right), +/- boost
        const cmd = k.has(" ") ? "S" : fwd > 0 ? (turn > 0 ? "Q" : turn < 0 ? "E" : "F") : fwd < 0 ? (turn > 0 ? "Z" : turn < 0 ? "C" : "B") : turn > 0 ? "L" : turn < 0 ? "R" : "S";
        const boost = k.has("shift");
        if (boost !== lastBoost.current) {
          s.sendSerial(boost ? "+" : "-");
          lastBoost.current = boost;
          lastSerialCmd.current = "";
        }
        if (cmd !== lastSerialCmd.current) {
          s.sendSerial(cmd);
          lastSerialCmd.current = cmd;
        }
      }
      const { pauseFor } = s.advance(dt * speedX, 20000);
      const tel = s.telemetry(0);
      const sn = s.world.getSnapshot();
      const ghost = ghostOn && best?.ghost ? interp(best.ghost, s.time) : null;
      snap.current = { x: tel.pose.x, y: tel.pose.y, h: tel.pose.heading, wheels: sn.robots[0]?.wheelAngles ?? {}, opp: sn.robots[1] ? { x: sn.robots[1].pose.x, y: sn.robots[1].pose.y, h: sn.robots[1].pose.heading } : undefined, ghost };
      // end conditions
      let end: SimulationResult["outcome"] | null = null;
      if (track?.kind === "sumo") {
        if (sn.robots[1]?.out) end = "win";
        else if (sn.robots[0]?.out) end = "loss";
        else if (s.time >= (track.arena?.timeLimitS ?? content.rules.sumo.matchTimeS)) end = "draw";
      } else if (tel.race?.finished) end = "completed";
      if (s.runtimeStatus?.state === "error") {
        setRun("error");
        setPanel("debug");
      }
      if (end) {
        void saveResult(end);
        setRun("finished");
      } else if (pauseFor) {
        setFinding(pauseFor);
        setPanel("debug");
        setRun("paused");
      }
      uiT += dt;
      if (uiT > 0.1 || end || pauseFor) {
        uiT = 0;
        setVm(makeVm(s));
      }
      schedule(loop);
    };
    schedule(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [run, speedX, ghostOn, best, track, saveResult, content.rules.sumo.matchTimeS]);

  // keyboard focus handling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = (e: KeyboardEvent) => (e.key === "Shift" ? "shift" : e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const k = map(e);
      if (["w", "a", "s", "d", " ", "shift", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) e.preventDefault();
      if (k === "ArrowUp" && session.current) session.current.manual.speed = Math.min(1, session.current.manual.speed + 0.1);
      else if (k === "ArrowDown" && session.current) session.current.manual.speed = Math.max(0.2, session.current.manual.speed - 0.1);
      else keys.current.add(k === "ArrowLeft" ? "a" : k === "ArrowRight" ? "d" : k);
    };
    const up = (e: KeyboardEvent) => {
      const k = map(e);
      keys.current.delete(k === "ArrowLeft" ? "a" : k === "ArrowRight" ? "d" : k);
    };
    el.addEventListener("keydown", down);
    el.addEventListener("keyup", up);
    const blur = () => keys.current.clear();
    el.addEventListener("blur", blur);
    return () => {
      el.removeEventListener("keydown", down);
      el.removeEventListener("keyup", up);
      el.removeEventListener("blur", blur);
    };
  }, []);

  const tel = vm?.tel;

  const start = () => {
    if (!session.current || run === "finished" || run === "error") build();
    setRun("running");
    containerRef.current?.focus();
  };
  const stop = () => {
    setRun("idle");
    if (session.current && session.current.time > 1) void saveResult("aborted");
  };
  const restart = () => {
    build();
    setRun("running");
    containerRef.current?.focus();
  };
  const reset = () => {
    build();
    setRun("idle");
  };

  if (!track || !compiled) return <div className="p-6 text-muted">No tracks for this competition yet. <Link className="text-accent-ink" href="/tracks">Create one</Link>.</div>;
  const center: [number, number] = [(compiled.bounds.minX + compiled.bounds.maxX) / 2, (compiled.bounds.minY + compiled.bounds.maxY) / 2];
  const motors = project.parts.filter((p) => getComponent(p.componentId)?.kind === "dc-motor");
  const readings = vm?.readings ?? {};
  const pins = vm?.pins ?? [];

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_360px]">
      <div className="flex min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-bg2 px-2 py-1.5">
          <select className={`bf-input !w-auto !py-1 text-xs ${highlightTracks ? "bf-glow-accent" : ""}`} value={trackId} onChange={(e) => { setTrackId(e.target.value); setHighlightTracks(false); updateProject(project.id, (p) => ({ ...p, trackId: e.target.value }), { history: false }); }} aria-label="Track">
            {allTracks.map((t) => <option key={t.id} value={t.id}>{t.name}{t.ownerId ? " (mine)" : ""}</option>)}
          </select>
          <Tabs value={mode} onChange={setMode} items={[{ value: "code", label: <span className="inline-flex items-center gap-1"><Code2 size={12} /> My code</span> }, { value: "manual", label: <span className="inline-flex items-center gap-1"><Gamepad2 size={12} /> Manual</span> }]} />
          {track.kind === "sumo" && (
            <select className="bf-input !w-auto !py-1 text-xs" value={level} onChange={(e) => setLevel(e.target.value as OpponentLevel)} aria-label="Opponent">
              {(["beginner", "intermediate", "advanced", "beast"] as const).map((l) => <option key={l} value={l}>Opponent: {l === "beast" ? "BEAST MODE" : l}</option>)}
            </select>
          )}
          <div className="mx-1 h-5 w-px bg-line" />
          {run === "running" ? <Button size="sm" variant="secondary" onClick={() => setRun("paused")}><Pause size={13} /> PAUSE</Button> : <Button size="sm" variant="primary" onClick={start} disabled={!vm && !!err}><Play size={13} /> {run === "paused" ? "RESUME" : "START"}</Button>}
          <Button size="sm" onClick={stop} disabled={run === "idle"}><Square size={13} /> STOP</Button>
          <Button size="sm" onClick={restart}><RotateCcw size={13} /> RESTART</Button>
          <Button size="sm" onClick={reset}>RESET</Button>
          {run === "paused" && <Button size="sm" onClick={() => { const ss = session.current; if (ss) { ss.advance(0.02); setVm(makeVm(ss)); } }}><StepForward size={13} /> Step 20 ms</Button>}
          <select className="bf-input !w-auto !py-1 text-xs" value={speedX} onChange={(e) => setSpeedX(Number(e.target.value))} aria-label="Simulation speed">
            {[0.25, 0.5, 1, 2, 4].map((v) => <option key={v} value={v}>{v}× speed</option>)}
          </select>
          <Tabs value={cam} onChange={setCam} items={[{ value: "robot", label: "Robot" }, { value: "free", label: "Free" }, { value: "top", label: "Top" }, { value: "side", label: "Side" }]} />
          {best && <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={ghostOn} onChange={(e) => setGhostOn(e.target.checked)} /> Ghost ({best.bestLapS!.toFixed(2)} s)</label>}
        </div>
        {(vstate !== "passed" || (mode === "code" && !project.codeCheck?.ok) || err || hex) && (
          <div className="space-y-0.5 border-b border-line bg-bg2 px-3 py-1 text-xs">
            {vstate !== "passed" && <div className="text-warn">⚠ Your robot {vstate === "stale" ? "changed since it was validated" : "has not passed validation"} — it will behave exactly as wired, faults included.</div>}
            {mode === "code" && !project.codeCheck?.ok && <div className="text-warn">⚠ Code not validated against the circuit yet (Code Studio → VALIDATE CODE).</div>}
            {hex && mode === "code" && <div className="text-brand">Running uploaded {hex.name} on the AVR emulator.</div>}
            {err && <div className="text-bad">✖ {err}</div>}
          </div>
        )}
        <div ref={containerRef} tabIndex={0} className="relative min-h-0 flex-1 outline-none focus:ring-1 focus:ring-brand/40" aria-label="Simulation view — click to focus keyboard control">
          <Canvas shadows camera={{ position: [1, 1.4, 1.8], fov: 45, near: 0.01, far: 50 }} dpr={[1, 1.75]}>
            <color attach="background" args={[THEME.sceneBg]} />
            <hemisphereLight args={[THEME.hemiSky, THEME.hemiGround, 0.75]} />
            <directionalLight position={[2, 4, 1.5]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} />
            <TrackScene track={compiled} />
            <RobotView project={project} snap={snap} groundOffset={groundOffset} />
            {track.kind === "sumo" && <BoxBot snap={snap} pick="opp" color={THEME.accent} size={[0.1, 0.05, 0.1]} />}
            {best && ghostOn && <BoxBot snap={snap} pick="ghost" color={THEME.ivory} size={[(project.chassis?.length_mm ?? 150) / 1000, 0.04, (project.chassis?.width_mm ?? 120) / 1000]} opacity={0.3} />}
            <CameraRig mode={cam} snap={snap} center={center} />
            {cam === "free" && <OrbitControls makeDefault target={[center[0], 0, -center[1]]} />}
          </Canvas>
          {/* HUD */}
          <div className="pointer-events-none absolute left-3 top-3 grid grid-cols-3 gap-x-4 gap-y-1 rounded border border-line bg-bg/80 px-3 py-2 font-mono text-[11px] backdrop-blur">
            <span className="text-dim">TIME</span><span className="col-span-2 text-text">{(vm?.time ?? 0).toFixed(2)} s</span>
            <span className="text-dim">SPEED</span><span className="col-span-2 text-brand">{(tel?.speed ?? 0).toFixed(2)} m/s</span>
            {track.kind !== "sumo" && <><span className="text-dim">LAP</span><span className="col-span-2">{tel?.race?.lap ?? 0}{track.laps ? ` / ${track.laps}` : ""} · {(((tel?.race?.progress ?? 0) * 100) | 0)}%</span></>}
            {track.kind === "sumo" && <><span className="text-dim">MATCH</span><span className="col-span-2">{Math.max(0, (track.arena?.timeLimitS ?? 180) - (vm?.time ?? 0)).toFixed(0)} s left</span></>}
            <span className="text-dim">STATE</span><span className={`col-span-2 ${run === "running" ? "text-ok" : run === "error" ? "text-bad" : "text-warn"}`}>{run.toUpperCase()}</span>
          </div>
          {run === "finished" && vm && (
            <div className="absolute left-1/2 top-1/2 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-accent bg-bg/95 p-5 text-center shadow-2xl">
              <div className="font-display text-2xl font-bold text-accent-ink">{track.kind === "sumo" ? (vm.out[1] ? "VICTORY!" : vm.out[0] ? "PUSHED OUT!" : "DRAW") : "TRACK COMPLETE!"}</div>
              <div className="mt-2 space-y-0.5 text-sm text-muted">
                <div>Time {vm.time.toFixed(2)} s · max {vm.maxSpeed.toFixed(2)} m/s</div>
                {tel?.race?.lapTimes.length ? <div>Best lap {Math.min(...tel.race.lapTimes).toFixed(2)} s</div> : null}
                <div>Collisions {vm.collisions}</div>
              </div>
              <Button className="mt-3" variant="primary" onClick={restart}>Race again</Button>
            </div>
          )}
          {/* on-screen controller */}
          <div className="absolute bottom-3 left-3 grid grid-cols-3 gap-1 select-none" aria-label="On-screen controller">
            {[["", ""], ["w", "▲"], ["", ""], ["a", "◀"], [" ", "■"], ["d", "▶"], ["", ""], ["s", "▼"], ["shift", "⚡"]].map(([k, l], i) =>
              k ? (
                <button key={i} className={`h-10 w-10 rounded-md border text-sm ${k === " " ? "border-bad/60 text-bad" : "border-line2 text-text"} bg-bg/80 active:bg-accent active:text-black`}
                  onPointerDown={(e) => { e.preventDefault(); keys.current.add(k); }} onPointerUp={() => keys.current.delete(k)} onPointerLeave={() => keys.current.delete(k)} title={k === " " ? "Emergency stop (SPACE)" : k === "shift" ? "Boost (SHIFT)" : k.toUpperCase()}>
                  {l}
                </button>
              ) : <span key={i} />,
            )}
          </div>
          <div className="pointer-events-none absolute bottom-3 right-3 text-right font-mono text-[10px] text-dim">
            CLICK VIEW TO FOCUS · W/S FWD/REV · A/D TURN · SPACE E-STOP · SHIFT BOOST · ↑/↓ SPEED {mode === "code" && vm?.hasSerial ? "· KEYS SENT TO BLUETOOTH SERIAL" : ""}
          </div>
        </div>
      </div>

      <aside className="flex min-h-0 flex-col border-l border-line bg-bg2">
        <div className="border-b border-line p-2">
          <Tabs value={panel} onChange={setPanel} items={[...(project.simConfig?.tunables?.length || project.simConfig?.telemetryPrefix ? [{ value: "tune" as const, label: "Tune" }] : []), { value: "telemetry", label: "Telemetry" }, { value: "sensors", label: "Sensors" }, { value: "serial", label: "Serial" }, { value: "debug", label: <span className="inline-flex items-center gap-1"><Bug size={12} />{vm?.findings.length ? ` ${vm.findings.length}` : ""}</span> }]} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
          {panel === "telemetry" && tel && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
                {([
                  ["Speed", `${tel.speed.toFixed(3)} m/s`], ["Max speed", `${(vm?.maxSpeed ?? 0).toFixed(2)} m/s`], ["Distance", `${tel.distance.toFixed(2)} m`], ["Battery", `${tel.batteryVoltage.toFixed(2)} V`],
                  ["Used", `${tel.batteryUsed_mAh.toFixed(1)} mAh`], ["Heading", `${(((tel.pose.heading * 180) / Math.PI) % 360).toFixed(0)}°`], ["Direction", tel.speed > 0.01 ? "forward" : tel.speed < -0.01 ? "reverse" : tel.yawRate > 0.2 ? "turning left" : tel.yawRate < -0.2 ? "turning right" : "stopped"],
                  ["Collision", tel.colliding ? "YES" : "no"], ["On track", tel.onTrack ? "yes" : "NO"], ["Sim time", `${(vm?.time ?? 0).toFixed(2)} s`],
                  ...(tel.race?.lapTimes.length ? [["Lap times", tel.race.lapTimes.map((x) => x.toFixed(2)).join(", ")]] : []),
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-dim">{k}</dt><dd className={k === "Collision" && v === "YES" ? "text-bad" : "text-text"}>{v}</dd></div>
                ))}
              </dl>
              <div>
                <div className="bf-label mb-1">Motors</div>
                {motors.map((m) => (
                  <div key={m.uid} className="mb-1 font-mono">
                    <div className="flex justify-between"><span>{m.label}</span><span className="text-brand">{(tel.motorRpm[m.uid] ?? 0).toFixed(0)} rpm</span></div>
                    <div className="flex justify-between text-dim"><span>{(tel.motorVoltage[m.uid] ?? 0).toFixed(2)} V</span><span>{(tel.motorCurrentA[m.uid] ?? 0).toFixed(2)} A</span></div>
                  </div>
                ))}
              </div>
              <div>
                <div className="bf-label mb-1">Controller pins</div>
                {pins.length === 0 && <div className="text-dim">No pins used yet.</div>}
                {pins.map((p) => (
                  <div key={p.pin} className="flex justify-between font-mono">
                    <span>{p.pin} {p.mode === "OUTPUT" ? "OUT" : p.mode === "INPUT_PULLUP" ? "IN↑" : "IN"}</span>
                    <span className="text-dim">{p.connectedTo.join(", ") || "—"}</span>
                    <span className={p.level ? "text-ok" : "text-dim"}>{p.duty !== null ? `${(p.duty * 100).toFixed(0)}%` : p.level ? "HIGH" : "LOW"}</span>
                  </div>
                ))}
              </div>
              {vm?.notes.estimated.length ? <div className="text-[10px] text-dim">Model notes: {vm.notes.estimated.join(" · ")}</div> : null}
              {vm?.notes.problems.length ? <div className="text-[10px] text-warn">{vm.notes.problems.join(" · ")}</div> : null}
            </div>
          )}
          {panel === "sensors" && (
            <div className="space-y-3">
              {Object.entries(readings).length === 0 && <div className="text-dim">This robot has no simulated sensors.</div>}
              {Object.entries(readings).map(([id, r]) => {
                const part = project.parts.find((p) => p.uid === id);
                return (
                  <div key={id} className="rounded border border-line p-2">
                    <div className="mb-1 flex justify-between"><span className="font-semibold">{part?.label ?? id}</span><span className="text-dim">{getComponent(part?.componentId ?? "")?.name}</span></div>
                    {r.kind === "reflectance" && (
                      <div className="flex items-end gap-1">
                        {r.darkness.map((d, i) => (
                          <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                            <div className="flex h-16 w-full items-end rounded bg-bg"><div className="w-full rounded bg-gradient-to-t from-accent to-accent/60" style={{ height: `${d * 100}%` }} /></div>
                            <span className="font-mono text-[9px]">{d.toFixed(2)}</span>
                            <span className={`font-mono text-[9px] ${d > 0.5 ? "text-accent-ink" : "text-dim"}`}>{d > 0.5 ? "BLACK" : "white"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.kind === "distance" && <div className="font-mono">{r.distance === null ? "nothing in range" : `${(r.distance * 100).toFixed(1)} cm`}</div>}
                    {r.kind === "bumper" && <div className={r.pressed ? "text-accent-ink" : "text-dim"}>{r.pressed ? "PRESSED" : "released"}</div>}
                    {r.kind === "encoder" && <div className="font-mono">count {r.count} · {r.rpm.toFixed(0)} rpm</div>}
                    {r.kind === "imu" && <div className="font-mono">yaw rate {r.yawRate.toFixed(2)} rad/s</div>}
                  </div>
                );
              })}
              <p className="text-[10px] text-dim">Readings come from each sensor&apos;s position and footprint on the actual track (0 = white, 1 = black). Your code sees them only through the pins they are wired to.</p>
            </div>
          )}
          {panel === "serial" && (
            <div className="flex h-full flex-col gap-2">
              <pre className="min-h-40 flex-1 overflow-auto whitespace-pre-wrap bf-code rounded-lg p-2 font-mono text-[11px]">{vm?.serial.slice(-6000) || "(no Serial output)"}</pre>
              <form onSubmit={(e) => { e.preventDefault(); session.current?.sendSerial(serialIn); setSerialIn(""); }} className="flex gap-1">
                <input className="bf-input" value={serialIn} onChange={(e) => setSerialIn(e.target.value)} placeholder="Send to Serial…" />
                <Button size="sm" variant="secondary">Send</Button>
              </form>
            </div>
          )}
          {panel === "tune" && <TunePanel project={project} serial={vm?.serial ?? ""} send={(t) => session.current?.sendSerial(t)} running={run === "running" || run === "paused"} values={tuneValues} setValues={setTuneValues} />}
          {panel === "debug" && (
            <div className="space-y-2">
              {!vm?.findings.length && <div className="text-dim">The debugging assistant watches the simulation and reports problems here.</div>}
              {[...(vm?.findings ?? [])].reverse().map((f) => (
                <div key={f.id} className={`rounded border p-2 ${f.id === finding?.id ? "border-accent" : f.severity === "critical" ? "border-bad/50" : f.severity === "warning" ? "border-warn/40" : "border-line"}`}>
                  <div className="font-display text-sm font-semibold">{f.title}</div>
                  <div className="font-mono text-[10px] text-dim">t = {f.t.toFixed(2)} s</div>
                  {f.verified.length > 0 && <div className="mt-1"><span className="text-ok">Verified:</span><ul className="list-disc pl-4 text-muted">{f.verified.map((v, i) => <li key={i}>{v}</li>)}</ul></div>}
                  {f.possible.length > 0 && <div className="mt-1"><span className="text-warn">Possible causes (not verified):</span><ul className="list-disc pl-4 text-muted">{f.possible.map((v, i) => <li key={i}>{v}</li>)}</ul></div>}
                  {f.steps.length > 0 && <div className="mt-1"><span className="text-brand">Steps:</span><ol className="list-decimal pl-4 text-muted">{f.steps.map((v, i) => <li key={i}>{v}</li>)}</ol></div>}
                  <details className="mt-1"><summary className="cursor-pointer text-dim">Telemetry at that moment</summary><div className="font-mono text-[10px]">{Object.entries(f.telemetry).map(([k, v]) => <div key={k}>{k}: {v}</div>)}</div></details>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" onClick={() => { setCam("top"); }}><Eye size={12} /> SHOW ME THE ISSUE</Button>
                    <Link className="rounded border border-line2 px-2 py-1 hover:border-brand" href={`/workspace/${project.id}/circuit`}>FIX MY CIRCUIT</Link>
                    <Link className="rounded border border-line2 px-2 py-1 hover:border-brand" href={`/workspace/${project.id}/code`}>GO TO CODE{f.codeLines?.length ? ` (line ${f.codeLines[0]})` : ""}</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-line p-2 text-[10px] text-dim">
          Physics: planar rigid body, DC motor model, tyre friction circle, 1 ms fixed step. Code: {mode === "code" ? (hex ? "AVR emulator" : "BEAST interpreter (Arduino subset)") : "manual control through your wiring"}.
          <Badge>{project.simulations.length} runs saved</Badge>
        </div>
      </aside>
    </div>
  );
}

/** Live tuning (sends the firmware's own Serial commands) + a telemetry panel parsed from the firmware's prints. */
function TunePanel({ project, serial, send, running, values, setValues }: { project: Project; serial: string; send: (t: string) => void; running: boolean; values: Record<string, number>; setValues: (v: Record<string, number>) => void }) {
  const cfg = project.simConfig;
  const lines = cfg?.telemetryPrefix ? serial.split(/\r?\n/).filter((l) => l.startsWith(cfg.telemetryPrefix + ",")) : [];
  const last = lines[lines.length - 1]?.split(",").slice(1).map(Number) ?? [];
  const hist = lines.slice(-80).map((l) => Number(l.split(",")[1]));
  const max = Math.max(1, ...hist.map((v) => Math.abs(v)));
  const sendValue = (cmd: string, v: string) => send(`${cmd}${v}\n`);
  return (
    <div className="space-y-4">
      {cfg?.tunables?.length ? (
        <div className="space-y-3">
          <div className="bf-label">Live parameters (sent to the firmware over Serial)</div>
          {cfg.tunables.map((t) => (
            <label key={t.key} className="block">
              <div className="flex justify-between text-xs"><span>{t.label}</span><span className="font-mono text-accent-ink">{values[t.key]}</span></div>
              <input
                type="range"
                min={t.min}
                max={t.max}
                step={t.step}
                value={values[t.key]}
                className="w-full accent-[var(--signal-red)]"
                onChange={(e) => setValues({ ...values, [t.key]: Number(e.target.value) })}
                onPointerUp={(e) => sendValue(t.command, (e.target as HTMLInputElement).value)}
                onKeyUp={(e) => sendValue(t.command, (e.target as HTMLInputElement).value)}
              />
              <div className="font-mono text-[10px] text-dim">sends &quot;{t.command}{values[t.key]}&quot;</div>
            </label>
          ))}
          {!running && <div className="text-[11px] text-warn">Start the simulation, then move a slider — the running sketch parses the command.</div>}
        </div>
      ) : null}
      {cfg?.telemetryPrefix && (
        <div>
          <div className="bf-label mb-1">Firmware telemetry ({cfg.telemetryPrefix})</div>
          {last.length ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 font-mono text-xs">
              {(cfg.telemetryFields ?? []).map((name, i) => (
                <div key={name} className="contents">
                  <dt className="text-dim">{name}</dt>
                  <dd className="text-right">{Number.isFinite(last[i]) ? last[i] : "—"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="text-xs text-dim">Waiting for telemetry lines…</div>
          )}
          {hist.length > 2 && (
            <svg viewBox="0 0 200 60" className="mt-2 w-full rounded border border-line bg-bg" aria-label="telemetry history">
              <line x1="0" y1="30" x2="200" y2="30" stroke={THEME.hairline2} strokeWidth="0.5" />
              <polyline fill="none" stroke={THEME.accent} strokeWidth="1.2" points={hist.map((v, i) => `${(i / (hist.length - 1)) * 200},${30 - (v / max) * 27}`).join(" ")} />
            </svg>
          )}
          {hist.length > 2 && <div className="text-[10px] text-dim">{cfg.telemetryFields?.[0]} over the last {hist.length} samples</div>}
        </div>
      )}
    </div>
  );
}

type ViewModel = ReturnType<typeof makeVm>;
function makeVm(s: SimSession) {
  const sn = s.world.getSnapshot();
  return {
    time: s.time,
    tel: s.telemetry(0),
    maxSpeed: s.maxSpeed,
    readings: s.sensorReadings(0),
    pins: s.bridge.pinSnapshot(),
    findings: [...s.debug.findings],
    serial: s.serialOutput,
    notes: s.notes,
    hasSerial: s.bridge.hasSerialModule(),
    out: sn.robots.map((r) => r.out),
    collisions: s.events.filter((e) => e.type === "collision" && e.robot === 0).length,
  };
}

function interp(g: NonNullable<SimulationResult["ghost"]>, t: number) {
  if (!g.length || t > g[g.length - 1].t) return null;
  let i = g.findIndex((p) => p.t >= t);
  if (i <= 0) i = 1;
  const a = g[i - 1],
    b = g[i] ?? a;
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: a.h + (b.h - a.h) * f };
}
export type { TrackDef };
