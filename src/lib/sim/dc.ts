/**
 * DC operating-point solver for the passive part of a circuit: resistors (Ohm's law), potentiometers and
 * LEDs (forward voltage + small series resistance). Uses modified nodal analysis on the circuit graph's nets:
 *
 *   - nets with a known potential (ground = 0 V, supply nets, controller pins driven as OUTPUT) are fixed;
 *   - every other net touched by a passive element is an unknown node;
 *   - G·v = i is solved by Gaussian elimination; LEDs are switched on/off until consistent.
 *
 * Pure and deterministic — used by the circuit bench (live LED brightness, resistor power, currents) and tests.
 */
import type { CircuitGraph, Net } from "@/lib/circuit/nets";
import { optionValue } from "@/lib/circuit/nets";
import type { ComponentRecord, PartInstance } from "@/lib/types";

export interface DcElementResult {
  partUid: string;
  kind: "resistor" | "led" | "pot" | "capacitor" | "ldr";
  /** current through the element in amps (positive A→K for LEDs, pin 1→2 for resistors) */
  current: number;
  /** voltage across the element */
  voltage: number;
  power: number;
  /** LEDs: 0…1 relative brightness (20 mA = 1) */
  brightness?: number;
  /** element is beyond its rating (LED > 30 mA, resistor > rated power) */
  overload?: string;
  /** LED channel (pin id of the anode) for multi-anode parts */
  channel?: string;
  /** LDR: present resistance (Ω) */
  ohms?: number;
}

export interface DcOptions {
  /** time step (s) for capacitors; without it capacitors are open circuits (DC steady state) */
  dt?: number;
  /** capacitor voltages from the previous step, keyed by part uid (updated in place) */
  capV?: Map<string, number>;
  /** light level on each LDR (lux), keyed by part uid; default 300 lux (indoor room) */
  lux?: Map<string, number>;
}

/** LDR resistance: R = R10 · (lux / 10)^−γ, γ ≈ 0.7 for GL55-series cells (typical, stated as an estimate). */
export function ldrOhms(r10kOhm: number, lux: number): number {
  return Math.min(5e6, Math.max(50, r10kOhm * 1000 * Math.pow(Math.max(0.01, lux) / 10, -0.7)));
}

export interface DcResult {
  elements: DcElementResult[];
  /** solved potential per net id (fixed and unknown nets) */
  potential: Map<number, number>;
  /** current drawn from each fixed-potential net (positive = sourced) */
  sourced: Map<number, number>;
}

const LED_RD = 12; // Ω dynamic resistance above Vf (typical 5 mm LED)
const G_LEAK = 1e-9; // keeps floating nodes solvable (≈ open circuit)

function ledVf(comp: ComponentRecord): number {
  const t = comp.specs.extra?.["Forward voltage"] ?? "";
  const m = /([\d.]+)\s*V/.exec(t);
  if (m) return Number(m[1]);
  if (/blue|white/i.test(comp.name)) return 3.0;
  return 2.0;
}

function resistorOhms(comp: ComponentRecord, part: PartInstance): number | null {
  const v = optionValue(comp, part, "ohms");
  if (v !== undefined) return Math.max(0.01, Number(v));
  const m = /([\d.]+)\s*(k|M)?Ω/.exec(comp.name);
  if (!m) return null;
  return Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "M" ? 1e6 : 1);
}

interface Elem {
  part: PartInstance;
  kind: DcElementResult["kind"];
  a: Net;
  b: Net;
  r: number; // ohms (LED: dynamic resistance)
  vf: number; // LED forward voltage (0 for resistors)
  on: boolean;
  channel?: string;
  ratingW?: number;
  vrating?: number;
  polarised?: boolean;
}

/**
 * @param fixed potential of nets whose voltage is imposed (ground, supplies, GPIO outputs). Missing = unknown.
 */
export function solveDc(g: CircuitGraph, fixed: Map<number, number>, opts: DcOptions = {}): DcResult {
  const elems: Elem[] = [];
  for (const p of g.parts) {
    const c = g.comps.get(p.uid)!;
    const net = (pin: string) => g.netOf.get(`${p.uid}.${pin}`);
    if (c.kind === "resistor" && !c.pins.some((x) => x.id === "W")) {
      const r = resistorOhms(c, p);
      const a = net("1"), b = net("2");
      if (r && a && b && a !== b) elems.push({ part: p, kind: "resistor", a, b, r, vf: 0, on: true, ratingW: 0.25 });
    } else if (c.kind === "led") {
      const k = c.pins.find((x) => x.fn === "cathode");
      for (const an of c.pins.filter((x) => x.fn === "anode")) {
        const a = net(an.id), b = k && net(k.id);
        if (a && b && a !== b) elems.push({ part: p, kind: "led", a, b, r: LED_RD, vf: ledVf(c), on: true, channel: an.id });
      }
    } else if (c.kind === "capacitor" && opts.dt && opts.dt > 0) {
      // backward Euler: i = C/dt · (v − v_prev)  ⇔  an element with R = dt/C and offset v_prev
      const uf = Number(optionValue(c, p, "uf") ?? 1);
      const pins = c.pins.filter((x) => x.fn === "passive" || x.fn === "anode" || x.fn === "cathode");
      const a = pins[0] && net(pins[0].id), b = pins[1] && net(pins[1].id);
      const vprev = opts.capV?.get(p.uid) ?? 0;
      if (a && b && a !== b) elems.push({ part: p, kind: "capacitor", a, b, r: opts.dt / Math.max(1e-12, uf * 1e-6), vf: vprev, on: true, vrating: Number(optionValue(c, p, "vrating") ?? 0) || undefined, polarised: pins.some((x) => x.fn === "anode") });
    } else if (c.kind === "sensor" && /\bLDR\b|photoresistor/i.test(c.name) && c.pins.length === 2) {
      const a = net(c.pins[0].id), b = net(c.pins[1].id);
      const r = ldrOhms(Number(optionValue(c, p, "r10") ?? 10), opts.lux?.get(p.uid) ?? 300);
      if (a && b && a !== b) elems.push({ part: p, kind: "ldr", a, b, r, vf: 0, on: true });
    } else if (/potentiometer/i.test(c.name) && c.pins.some((x) => x.id === "W")) {
      const total = Number(optionValue(c, p, "ohms") ?? 10000);
      const pos = Math.min(1, Math.max(0, Number(optionValue(c, p, "position") ?? 0.5)));
      const n1 = net("1"), w = net("W"), n3 = net("3");
      if (n1 && w && n1 !== w) elems.push({ part: p, kind: "pot", a: n1, b: w, r: Math.max(1, total * pos), vf: 0, on: true });
      if (n3 && w && n3 !== w) elems.push({ part: p, kind: "pot", a: w, b: n3, r: Math.max(1, total * (1 - pos)), vf: 0, on: true });
    }
  }
  const potential = new Map<number, number>(fixed);
  const sourced = new Map<number, number>();
  if (!elems.length) return { elements: [], potential, sourced };

  // unknown nodes = nets touched by elements without a fixed potential
  const unknown: Net[] = [];
  const idx = new Map<number, number>();
  for (const e of elems)
    for (const n of [e.a, e.b])
      if (!fixed.has(n.id) && !idx.has(n.id)) {
        idx.set(n.id, unknown.length);
        unknown.push(n);
      }

  const solve = () => {
    const N = unknown.length;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const I = new Float64Array(N);
    for (let i = 0; i < N; i++) G[i][i] += G_LEAK;
    for (const e of elems) {
      if (!e.on) continue;
      const g0 = 1 / e.r;
      const ia = idx.get(e.a.id), ib = idx.get(e.b.id);
      const va = fixed.get(e.a.id), vb = fixed.get(e.b.id);
      // element current a→b = g0 (Va − Vb − vf)
      if (ia !== undefined) {
        G[ia][ia] += g0;
        if (ib !== undefined) G[ia][ib] -= g0;
        else I[ia] += g0 * (vb ?? 0);
        I[ia] += g0 * e.vf;
      }
      if (ib !== undefined) {
        G[ib][ib] += g0;
        if (ia !== undefined) G[ib][ia] -= g0;
        else I[ib] += g0 * (va ?? 0);
        I[ib] -= g0 * e.vf;
      }
    }
    // Gaussian elimination with partial pivoting
    const x = new Float64Array(N);
    const A = G.map((row, i) => [...row, I[i]]);
    for (let col = 0; col < N; col++) {
      let piv = col;
      for (let r = col + 1; r < N; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      [A[col], A[piv]] = [A[piv], A[col]];
      const d = A[col][col] || 1e-30;
      for (let r = col + 1; r < N; r++) {
        const f = A[r][col] / d;
        if (f) for (let k = col; k <= N; k++) A[r][k] -= f * A[col][k];
      }
    }
    for (let r = N - 1; r >= 0; r--) {
      let s = A[r][N];
      for (let k = r + 1; k < N; k++) s -= A[r][k] * x[k];
      x[r] = s / (A[r][r] || 1e-30);
    }
    for (const n of unknown) potential.set(n.id, x[idx.get(n.id)!]);
  };

  const V = (n: Net) => potential.get(n.id) ?? 0;
  for (let iter = 0; iter < 12; iter++) {
    solve();
    let changed = false;
    for (const e of elems) {
      if (e.kind !== "led") continue;
      const vak = V(e.a) - V(e.b);
      if (e.on && vak - e.vf < 0) {
        e.on = false;
        changed = true;
      } else if (!e.on && vak > e.vf + 1e-6) {
        e.on = true;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const elements: DcElementResult[] = elems.map((e) => {
    const v = V(e.a) - V(e.b);
    const current = e.on ? (v - e.vf) / e.r : 0;
    const res: DcElementResult = { partUid: e.part.uid, kind: e.kind, current, voltage: v, power: Math.abs(current * v) };
    if (e.kind === "led") {
      res.channel = e.channel;
      res.brightness = Math.max(0, Math.min(1, current / 0.02));
      if (current > 0.03) res.overload = `${(current * 1000).toFixed(0)} mA through the LED (max ≈20 mA continuous) — it would burn out.`;
    }
    if (e.ratingW && res.power > e.ratingW) res.overload = `${res.power.toFixed(2)} W in a ${e.ratingW} W resistor — it would overheat.`;
    if (e.kind === "ldr") res.ohms = e.r;
    if (e.kind === "capacitor") {
      opts.capV?.set(e.part.uid, v);
      if (e.polarised && v < -0.5) res.overload = `${v.toFixed(1)} V across a polarised capacitor: it is connected backwards and can vent or short.`;
      else if (e.vrating && Math.abs(v) > e.vrating) res.overload = `${Math.abs(v).toFixed(1)} V across a ${e.vrating} V capacitor: above its voltage rating.`;
    }
    for (const [n, sign] of [[e.a, 1], [e.b, -1]] as const) if (fixed.has(n.id)) sourced.set(n.id, (sourced.get(n.id) ?? 0) + sign * current);
    return res;
  });
  return { elements, potential, sourced };
}
