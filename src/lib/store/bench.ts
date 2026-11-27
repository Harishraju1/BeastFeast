"use client";
/**
 * One circuit-bench simulation per open workspace, shared by Circuit Studio (schematic) and the Robot Designer
 * (3D). A single animation loop advances it; views subscribe to `tick` (≈20 updates per second) and read the
 * simulator's state. Wheel angles are integrated here from the simulated motor speeds so the 3D wheels turn
 * exactly as fast as the electrical model says.
 */
import { create } from "zustand";
import { BenchSim } from "@/lib/sim/bench";
import type { Project } from "@/lib/types";

export type BenchMode = "stopped" | "running" | "paused";

interface BenchStore {
  projectId: string | null;
  sim: BenchSim | null;
  mode: BenchMode;
  builtFor: string;
  tick: number;
  /** wheel rotation (rad) per wheel part uid, integrated from its motor's simulated rpm */
  wheelAngles: Record<string, number>;
  start(project: Project, key: string): void;
  rebuild(project: Project, key: string): void;
  pause(): void;
  stop(): void;
  reset(project: Project, key: string): void;
  bump(): void;
  /** low-performance mode: fewer UI updates, no decorative motion, lighter 3D */
  lowPerf: boolean;
  setLowPerf(v: boolean): void;
}

function initialLowPerf(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("bf.lowPerf") === "1";
  } catch {
    return false;
  }
}

let raf = 0;
let last = 0;
let lastUi = 0;

function loop(now: number) {
  const st = useBench3.getState();
  if (st.mode !== "running" || !st.sim) {
    raf = 0;
    return;
  }
  // catch up after slow / throttled frames (BenchSim.advance caps one call at 0.4 s of simulated time)
  const dt = Math.min(0.4, (now - (last || now)) / 1000);
  last = now;
  st.sim.advance(dt);
  // wheels turn with the motor they are attached to
  const angles = st.wheelAngles;
  const project = st.sim.project;
  for (const w of project.parts) {
    if (!w.attachedTo) continue;
    const m = st.sim.state.motors[w.attachedTo];
    if (m) angles[w.uid] = (angles[w.uid] ?? 0) + ((m.rpm * Math.PI * 2) / 60) * dt;
  }
  if (now - lastUi > (st.lowPerf ? 200 : 50)) {
    lastUi = now;
    useBench3.setState({ tick: st.tick + 1, wheelAngles: { ...angles } });
  }
  raf = requestAnimationFrame(loop);
}
function ensureLoop() {
  if (raf || typeof requestAnimationFrame === "undefined") return;
  last = 0;
  raf = requestAnimationFrame(loop);
}

export const useBench3 = create<BenchStore>((set, get) => ({
  projectId: null,
  sim: null,
  mode: "stopped",
  builtFor: "",
  tick: 0,
  wheelAngles: {},
  start(project, key) {
    const s = get();
    if (s.mode === "stopped" || !s.sim || s.projectId !== project.id) set({ sim: new BenchSim(project), builtFor: key, projectId: project.id, wheelAngles: {} });
    set({ mode: "running" });
    ensureLoop();
  },
  rebuild(project, key) {
    const prev = get().sim;
    const next = new BenchSim(project);
    if (prev) {
      for (const [k, v] of Object.entries(prev.readings)) if (k in next.readings) next.readings[k] = v;
      for (const [k, v] of Object.entries(prev.env)) if (k in next.env) next.env[k] = v;
    }
    set({ sim: next, builtFor: key, projectId: project.id, tick: get().tick + 1 });
  },
  pause() {
    set({ mode: "paused" });
  },
  stop() {
    if (raf && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(raf);
    raf = 0;
    set({ sim: null, mode: "stopped", projectId: null, wheelAngles: {} });
  },
  reset(project, key) {
    set({ sim: new BenchSim(project), builtFor: key, projectId: project.id, wheelAngles: {}, mode: get().mode === "stopped" ? "paused" : get().mode });
    if (get().mode === "running") ensureLoop();
  },
  bump() {
    set({ tick: get().tick + 1 });
  },
  lowPerf: initialLowPerf(),
  setLowPerf(v) {
    try {
      window.localStorage.setItem("bf.lowPerf", v ? "1" : "0");
    } catch {
      /* storage blocked: keep it for this visit */
    }
    set({ lowPerf: v });
  },
}));
