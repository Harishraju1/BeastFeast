/**
 * Circuit connection graph: turns placed parts + wires into electrical nets (union-find),
 * then propagates supply voltages through batteries, switches, regulators and controller rails.
 * The validation engine, code checker and simulator all read this graph.
 */
import { getComponent } from "@/lib/catalogue";
import { seriesCellsOf } from "@/lib/catalogue/platform";
import type { ComponentRecord, PartInstance, PinDef, Project, Wire } from "@/lib/types";

export interface PinRef {
  part: string;
  pin: string;
}
export const pinKey = (p: PinRef) => `${p.part}.${p.pin}`;

export interface NetMember {
  part: PartInstance;
  comp: ComponentRecord;
  pin: PinDef;
  key: string;
}

export interface Net {
  id: number;
  members: NetMember[];
  wires: Wire[];
  /** resolved supply voltage (nominal) or null */
  voltage: number | null;
  /** max (fully charged) voltage, for over-voltage checks */
  vMax: number | null;
  /** the driving source(s) */
  sources: { key: string; v: number; vMax: number; label: string }[];
  isGround: boolean;
}

export interface CircuitGraph {
  parts: PartInstance[];
  comps: Map<string, ComponentRecord>;
  nets: Net[];
  netOf: Map<string, Net>; // pinKey -> net
  /** parts whose supply is satisfied */
  powered: Set<string>;
  wires: Wire[];
}

/** Parses an arrangement such as "2S2P" → { s: 2, p: 2 }. */
export function parseArrangement(a: unknown, cells: number): { s: number; p: number } {
  const m = /^(\d+)S(\d+)P$/i.exec(String(a ?? ""));
  if (m && Number(m[1]) * Number(m[2]) === cells) return { s: Number(m[1]), p: Number(m[2]) };
  return { s: cells, p: 1 };
}

export function batteryPack(comp: ComponentRecord, part: PartInstance) {
  const b = comp.battery;
  if (!b) return null;
  if (b.cellCount) {
    // fixed-count multi-cell pack: series × parallel chosen by the student, ratings per cell
    const { s, p } = parseArrangement(optionValue(comp, part, "arrangement"), b.cellCount);
    const cellV = Number(optionValue(comp, part, "cellNominal") ?? b.nominalVoltage);
    const cellMax = Number(optionValue(comp, part, "cellMax") ?? b.maxVoltage);
    const cellCap = Number(optionValue(comp, part, "capacity") ?? b.capacity_mAh);
    const cellA = Number(optionValue(comp, part, "cellMaxA") ?? b.maxContinuousA);
    return { nominal: cellV * s, max: cellMax * s, min: b.minVoltage * s, capacity: cellCap * p, rint: (b.internalResistance_ohm * s) / p, maxA: cellA * p, cells: s, parallel: p };
  }
  const n = b.perCell ? Number(part.config.series ?? comp.options.find((o) => o.key === "series")?.default ?? 1) : 1;
  const cap = Number(part.config.capacity ?? b.capacity_mAh);
  // fixed packs (e.g. "LiPo 3S") report their own series cell count; cell-based parts use the instance option
  const cells = b.perCell ? n : (seriesCellsOf(comp) ?? 1);
  return { nominal: b.nominalVoltage * n, max: b.maxVoltage * n, min: b.minVoltage * n, capacity: cap, rint: b.internalResistance_ohm * n, maxA: b.maxContinuousA, cells, parallel: 1 };
}

export function optionValue(comp: ComponentRecord, part: PartInstance, key: string) {
  return part.config[key] ?? comp.options.find((o) => o.key === key)?.default;
}

class UF {
  p = new Map<string, string>();
  find(a: string): string {
    if (!this.p.has(a)) this.p.set(a, a);
    let r = a;
    while (this.p.get(r) !== r) r = this.p.get(r)!;
    let c = a;
    while (this.p.get(c) !== r) {
      const n = this.p.get(c)!;
      this.p.set(c, r);
      c = n;
    }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a),
      rb = this.find(b);
    if (ra !== rb) this.p.set(ra, rb);
  }
}

/** Which pins are joined inside a part (always-on bridges + closed switches). */
export function internalBridges(comp: ComponentRecord, part: PartInstance): string[][] {
  const groups = [...comp.bridges];
  const switchPins = comp.pins.filter((p) => p.fn === "switch").map((p) => p.id);
  if (switchPins.length >= 2) {
    const closedOpt = comp.options.find((o) => o.key === "closed");
    const closed = closedOpt ? Boolean(part.config.closed ?? closedOpt.default) : false;
    if (closed) {
      if (switchPins.includes("COM") && switchPins.includes("NO")) groups.push(["COM", "NO"]);
      else if (switchPins.includes("COM") && switchPins.includes("A")) groups.push(["COM", "A"]);
      else if (switchPins.length === 2) groups.push(switchPins);
    } else if (switchPins.includes("COM") && switchPins.includes("NC")) groups.push(["COM", "NC"]);
    else if (switchPins.includes("COM") && switchPins.includes("B") && closedOpt) groups.push(["COM", "B"]);
  }
  return groups;
}

export function buildGraph(project: Pick<Project, "parts" | "wires">): CircuitGraph {
  const parts = project.parts.filter((p) => p.inCircuit);
  const comps = new Map<string, ComponentRecord>();
  for (const p of parts) {
    const c = getComponent(p.componentId);
    if (c) comps.set(p.uid, c);
  }
  const uf = new UF();
  for (const p of parts) {
    const c = comps.get(p.uid);
    if (!c) continue;
    for (const pin of c.pins) uf.find(`${p.uid}.${pin.id}`);
    for (const g of internalBridges(c, p)) for (let i = 1; i < g.length; i++) uf.union(`${p.uid}.${g[0]}`, `${p.uid}.${g[i]}`);
  }
  const validWires = project.wires.filter((w) => comps.has(w.from.part) && comps.has(w.to.part));
  for (const w of validWires) uf.union(pinKey(w.from), pinKey(w.to));

  const byRoot = new Map<string, Net>();
  const netOf = new Map<string, Net>();
  let id = 0;
  for (const p of parts) {
    const c = comps.get(p.uid);
    if (!c) continue;
    for (const pin of c.pins) {
      const key = `${p.uid}.${pin.id}`;
      const r = uf.find(key);
      let net = byRoot.get(r);
      if (!net) {
        net = { id: id++, members: [], wires: [], voltage: null, vMax: null, sources: [], isGround: false };
        byRoot.set(r, net);
      }
      net.members.push({ part: p, comp: c, pin, key });
      netOf.set(key, net);
    }
  }
  for (const w of validWires) netOf.get(pinKey(w.from))?.wires.push(w);

  const graph: CircuitGraph = { parts, comps, nets: [...byRoot.values()], netOf, powered: new Set(), wires: validWires };
  propagatePower(graph);
  return graph;
}

/** Iteratively resolve which nets carry a supply voltage and which parts are powered. */
function propagatePower(g: CircuitGraph) {
  // Ground reference: nets holding a battery negative terminal.
  for (const n of g.nets) if (n.members.some((m) => m.pin.fn === "bat-")) n.isGround = true;
  // Ground also spreads through gnd pins that are bridged inside parts (already merged by union-find).

  const addSource = (key: string, v: number, vMax: number, label: string) => {
    const n = g.netOf.get(key);
    if (!n || n.sources.some((s) => s.key === key)) return false;
    n.sources.push({ key, v, vMax, label });
    if (n.voltage === null || v > n.voltage) n.voltage = v;
    n.vMax = Math.max(n.vMax ?? 0, vMax);
    return true;
  };

  for (const p of g.parts) {
    const c = g.comps.get(p.uid)!;
    const pack = batteryPack(c, p);
    const plus = c.pins.find((x) => x.fn === "bat+");
    const minus = c.pins.find((x) => x.fn === "bat-");
    if (pack && plus && minus) {
      // A battery only drives its + terminal relative to its own − terminal.
      addSource(`${p.uid}.${plus.id}`, pack.nominal, pack.max, `${p.label} (${pack.nominal.toFixed(1)} V)`);
    }
  }

  const isGnd = (key: string) => g.netOf.get(key)?.isGround ?? false;
  for (let iter = 0; iter < 12; iter++) {
    let changed = false;
    for (const p of g.parts) {
      const c = g.comps.get(p.uid)!;
      const gndPins = c.pins.filter((x) => x.fn === "gnd");
      const grounded = gndPins.length === 0 ? c.kind === "dc-motor" : gndPins.some((x) => isGnd(`${p.uid}.${x.id}`));
      const vins = c.pins.filter((x) => x.fn === "vin" || (x.fn === "vout" && x.vRange));
      const supplied = vins.filter((x) => (g.netOf.get(`${p.uid}.${x.id}`)?.voltage ?? null) !== null && !g.netOf.get(`${p.uid}.${x.id}`)!.sources.some((s) => s.key === `${p.uid}.${x.id}`));
      const poweredNow = grounded && supplied.length > 0;
      if (poweredNow && !g.powered.has(p.uid)) {
        g.powered.add(p.uid);
        changed = true;
      }
      if (!g.powered.has(p.uid)) continue;
      const inV = Math.max(...supplied.map((x) => g.netOf.get(`${p.uid}.${x.id}`)!.voltage ?? 0), 0);
      for (const out of c.pins.filter((x) => x.fn === "vout" && x.vOut !== undefined)) {
        // Controller 5V/3V3 rails and regulator outputs.
        const key = `${p.uid}.${out.id}`;
        const myNet = g.netOf.get(key)!;
        if (myNet.sources.some((s) => s.key === key)) continue;
        // a 5V pin that is itself the input (back-powered) is not a source
        if (out.vRange && supplied.some((s) => s.id === out.id)) continue;
        let v = out.vOut!;
        const setV = optionValue(c, p, "vout");
        if (c.kind === "regulator" && setV !== undefined) v = Number(setV);
        if (c.id === "l298n" && out.id === "5V") {
          const jumper = Boolean(optionValue(c, p, "regJumper"));
          if (!jumper) continue;
          const vs = g.netOf.get(`${p.uid}.VS`)?.voltage ?? 0;
          if (vs < 6.5) continue; // 78M05 cannot regulate
        }
        if (c.kind === "regulator" && /Buck|LDO|Regulator|BEC/i.test(c.name) && !/Boost/i.test(c.name) && inV && v > inV) v = Math.max(0, inV - 0.5);
        if (c.kind === "controller" && out.id === "5V" && inV < 6.5 && !supplied.some((s) => s.fn === "vout")) v = Math.max(0, inV - 1.1);
        if (addSource(key, v, v, `${p.label} ${out.label}`)) changed = true;
      }
      // bridged pass-through parts (switches/fuses/PDB) are merged already; nothing to do.
    }
    if (!changed) break;
  }
}

/** Find what a controller pin is connected to. */
export function netPeers(g: CircuitGraph, key: string): NetMember[] {
  const n = g.netOf.get(key);
  if (!n) return [];
  return n.members.filter((m) => m.key !== key && m.part.uid !== key.split(".")[0]);
}

export function isConnected(g: CircuitGraph, key: string): boolean {
  const n = g.netOf.get(key);
  if (!n) return false;
  return n.wires.length > 0 || n.members.some((m) => m.key !== key && m.part.uid !== key.split(".")[0]);
}
