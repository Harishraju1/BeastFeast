"use client";
import { withOption } from "@/lib/circuit/options";
import { useEffect, useMemo, useRef, useState } from "react";
import { Contrast, Copy, Download, Gauge, GraduationCap, Grid3x3, Maximize, Minus, Move, Pause, Play, Plus, PlusCircle, RotateCcw, RotateCw, ScanLine, SlidersHorizontal, Square, Trash2, Undo2, Wrench, X } from "lucide-react";
import { useApp } from "@/lib/store/app";
import { useWorkspace } from "@/lib/store/workspace";
import { getComponent } from "@/lib/catalogue";
import { registerCustomComponents } from "@/lib/catalogue/custom";
import type { ComponentRecord, PartInstance, PinDef, Project, ValidationIssue, Wire } from "@/lib/types";
import { addPart, uid } from "@/lib/robot/assembly";
import { buildGraph } from "@/lib/circuit/nets";
import { validateProject } from "@/lib/circuit/validate";
import { REPAIRABLE, wireColorFor } from "@/lib/circuit/repair";
import { ROLE_INFO, WIRE_COLOUR, netRole } from "@/lib/circuit/wireRole";
import { duplicateParts, moveSchematic, removeParts, rotateSchematic, wiresTouching } from "@/lib/robot/edit";
import { LibraryBrowser } from "@/components/library/LibraryBrowser";
import { pinColor, pinFunctionText } from "@/components/library/PinoutDiagram";
import { Button, Field, Tabs } from "@/components/ui";
import { IssueCard, startFix, useValidate } from "../Validation";
import { isTypingTarget } from "@/lib/keyboard";
import { THEME } from "@/lib/theme";
import { RepairControls, useRepairPlayer } from "./RepairPlayer";
import { RecommendationPanel } from "./RecommendationPanel";
import { CustomComponentModal } from "./CustomComponentModal";
import { LearnPanel } from "./LearnPanel";
import { BenchPanel, useBench } from "./BenchPanel";

const W = 170;
const PITCH = 16;
const HEAD = 34;
const FLOW_HEX = { power: "#ffffff", ground: "#ffffff", motor: "#ffffff", signal: "#ffffff" };
/** Light circuit canvas (kept light on purpose: wires and ground must never disappear into the background). */
/** Light-grey circuit canvas: not white, not dark — wires (red / black / blue) and white cards stay clearly visible. */
const CANVAS = { bg: "#DFE1E4", grid: "#C8CCD2", dot: "#A9AFB7", card: "#FFFFFF", ink: "#17212B", muted: "#4E5A66", line: "#AEB6BF", well: "#E3E7EB", select: "#F59E0B" };
type Side = "L" | "R" | "T" | "B";
const STUB: Record<Side, [number, number]> = { L: [-1, 0], R: [1, 0], T: [0, -1], B: [0, 1] };
const ROT_SIDE: Record<number, Record<Side, Side>> = {
  0: { L: "L", R: "R", T: "T", B: "B" },
  90: { L: "T", T: "R", R: "B", B: "L" },
  180: { L: "R", R: "L", T: "B", B: "T" },
  270: { L: "B", B: "R", R: "T", T: "L" },
};
/** rotate a node-local point (x, y) by rot° clockwise about the node centre */
function rotPt(x: number, y: number, rot: number, h: number) {
  const cx = W / 2, cy = h / 2, dx = x - cx, dy = y - cy;
  if (rot === 90) return { x: cx - dy, y: cy + dx };
  if (rot === 180) return { x: cx - dx, y: cy - dy };
  if (rot === 270) return { x: cx + dy, y: cy - dx };
  return { x, y };
}

function layout(comp: ComponentRecord) {
  const left = comp.pins.filter((p) => p.side === "L" || p.side === "T");
  const right = comp.pins.filter((p) => p.side === "R" || p.side === "B");
  const rows = Math.max(left.length, right.length, 1);
  const pos = new Map<string, { x: number; y: number; side: "L" | "R" }>();
  left.forEach((p, i) => pos.set(p.id, { x: 0, y: HEAD + i * PITCH, side: "L" }));
  right.forEach((p, i) => pos.set(p.id, { x: W, y: HEAD + i * PITCH, side: "R" }));
  return { h: HEAD + rows * PITCH + 6, pos };
}

interface ConnectFx {
  wireId: string;
  tone: "ok" | "warn" | "bad";
  text: string;
}

export default function CircuitStudio({ project }: { project: Project }) {
  const { updateProject, toast, undo } = useApp();
  const { selected, select, focus, clearFocus, scanPart, learning, set: setWs } = useWorkspace();
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 0.85 });
  const [snap, setSnap] = useState(true);
  const [pending, setPending] = useState<{ part: string; pin: string } | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [selWire, setSelWire] = useState<string | null>(null);
  const [hoverPin, setHoverPin] = useState<{ part: PartInstance; pin: PinDef } | null>(null);
  const [drag, setDrag] = useState<{ kind: "pan" | "node"; uid?: string; sx: number; sy: number; ox: number; oy: number; group?: string[]; moved?: boolean } | null>(null);
  // multi-selection (Shift + click / Shift + drag a box); `selected` stays the primary part for the inspector
  const [multi, setMulti] = useState<string[]>([]);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [contrast, setContrast] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [hoverWire, setHoverWire] = useState<{ id: string; x: number; y: number } | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ uids: string[]; wires: number } | null>(null);
  const [undoBar, setUndoBar] = useState<string | null>(null);
  const [bottom, setBottom] = useState<"connections" | "issues" | "bench">("connections");
  const [fx, setFx] = useState<ConnectFx | null>(null);
  const validate = useValidate(project);

  // student-defined parts must be known to the catalogue before anything looks them up
  useMemo(() => registerCustomComponents(project.customComponents), [project.customComponents]);

  const bench = useBench(project);
  const sim = bench.sim;
  const player = useRepairPlayer(project);
  const rstep = player.state.step;

  const parts = project.parts.filter((p) => p.inCircuit).map((p) => ({ p, c: getComponent(p.componentId)! })).filter((x) => x.c && x.c.pins.length);
  const layouts = useMemo(() => new Map(parts.map(({ p, c }) => [p.uid, layout(c)])), [parts]);
  const graph = useMemo(() => buildGraph(project), [project]);

  const pinXY = (partUid: string, pinId: string) => {
    const part = project.parts.find((p) => p.uid === partUid);
    const l = layouts.get(partUid);
    const pp = l?.pos.get(pinId);
    if (!part || !pp) return null;
    const rot = part.schematic.rot ?? 0;
    const q = rotPt(pp.x, pp.y, rot, l!.h);
    return { x: part.schematic.x + q.x, y: part.schematic.y + q.y, side: ROT_SIDE[rot][pp.side] };
  };
  /** screen-independent bounding box of a (possibly rotated) node */
  const nodeBox = (p: PartInstance) => {
    const l = layouts.get(p.uid);
    const h = l?.h ?? 60;
    const rot = p.schematic.rot ?? 0;
    const turned = rot === 90 || rot === 270;
    const w2 = turned ? h : W, h2 = turned ? W : h;
    return { x: p.schematic.x + W / 2 - w2 / 2, y: p.schematic.y + h / 2 - h2 / 2, w: w2, h: h2 };
  };
  const selectedSet = multi.length ? multi : selected ? [selected] : [];
  const clearSelection = () => {
    select(null);
    setMulti([]);
  };
  const deleteParts = (uids: string[], confirmed = false) => {
    if (!uids.length) return;
    const n = wiresTouching(project, uids).length;
    if (!confirmed && n >= 4) return setConfirmDel({ uids, wires: n });
    const labels = project.parts.filter((p) => uids.includes(p.uid)).map((p) => p.label);
    updateProject(project.id, (p) => removeParts(p, uids));
    setConfirmDel(null);
    clearSelection();
    setSelWire(null);
    setUndoBar(`Deleted ${labels.length > 2 ? `${labels.length} components` : labels.join(" and ")}${n ? ` and ${n} connection${n === 1 ? "" : "s"}` : ""}.`);
  };
  const duplicateSel = (uids: string[]) => {
    if (!uids.length) return;
    let created: string[] = [];
    updateProject(project.id, (p) => {
      const r = duplicateParts(p, uids);
      created = r.created;
      return r.project;
    });
    if (created.length === 1) {
      select(created[0]);
      setMulti([]);
    } else {
      select(created[0] ?? null);
      setMulti(created);
    }
  };
  const rotateSel = (uids: string[], dir: 1 | -1) => uids.length && updateProject(project.id, (p) => rotateSchematic(p, uids, dir));
  const toWorld = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };
  const centreOn = (partUid: string | undefined) => {
    if (!partUid || !svgRef.current) return;
    const part = project.parts.find((p) => p.uid === partUid);
    if (!part) return;
    const r = svgRef.current.getBoundingClientRect();
    const k = 1.15;
    setView({ k, x: r.width / 2 - (part.schematic.x + W / 2) * k, y: r.height / 2.6 - (part.schematic.y + 80) * k });
  };

  // focus from validation "FIX IT": select the faulty wire (derived during render) and centre on the part (needs the DOM size)
  const [focusSeen, setFocusSeen] = useState<number | null>(null);
  if (focus && focus.at !== focusSeen) {
    setFocusSeen(focus.at);
    if (focus.wireId) setSelWire(focus.wireId);
  }
  useEffect(() => {
    if (!focus?.partUid) return;
    centreOn(focus.partUid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  // repair assistant: centre on the faulty part when a repair starts
  useEffect(() => {
    if (player.state.plan) centreOn(player.state.plan.steps[0].partUid ?? player.state.plan.steps[0].pins?.[0]?.part);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.state.plan]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        setPending(null);
        setSelWire(null);
        setConfirmDel(null);
        select(null);
        setMulti([]);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selWire) {
          updateProject(project.id, (p) => ({ ...p, wires: p.wires.filter((w) => w.id !== selWire) }));
          setSelWire(null);
        } else if (selectedSet.length) {
          e.preventDefault();
          deleteParts(selectedSet);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selectedSet.length) {
        e.preventDefault();
        duplicateSel(selectedSet);
        return;
      }
      if (selectedSet.length && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const st = e.shiftKey ? 50 : 10;
        const [dx, dy] = e.key === "ArrowLeft" ? [-st, 0] : e.key === "ArrowRight" ? [st, 0] : e.key === "ArrowUp" ? [0, -st] : [0, st];
        updateProject(project.id, (p) => moveSchematic(p, selectedSet, dx, dy));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  useEffect(() => {
    if (!undoBar) return;
    const t = setTimeout(() => setUndoBar(null), 9000);
    return () => clearTimeout(t);
  }, [undoBar]);
  useEffect(() => {
    if (!fx) return;
    const t = setTimeout(() => setFx(null), 3800);
    return () => clearTimeout(t);
  }, [fx]);

  /** Quick verdict for a new connection: does it create a new problem on either part? */
  const judge = (before: Project, after: Project, w: Wire): ConnectFx => {
    const key = (i: ValidationIssue) => `${i.code}|${i.partUid}|${i.pinId}`;
    const was = new Set(validateProject(before).issues.map(key));
    const fresh = validateProject(after).issues.filter((i) => !was.has(key(i)) && (i.partUid === w.from.part || i.partUid === w.to.part) && i.severity !== "suggestion");
    const a = project.parts.find((p) => p.uid === w.from.part)?.label, b = project.parts.find((p) => p.uid === w.to.part)?.label;
    const names = `${a}.${w.from.pin} → ${b}.${w.to.pin}`;
    const bad = fresh.find((i) => i.severity === "critical");
    if (bad) return { wireId: w.id, tone: "bad", text: `✗ ${names}: ${bad.title}` };
    if (fresh[0]) return { wireId: w.id, tone: "warn", text: `⚠ ${names}: ${fresh[0].title}` };
    return { wireId: w.id, tone: "ok", text: `✓ ${names} connected` };
  };

  const clickPin = (part: PartInstance, pin: PinDef) => {
    if (!pending) {
      setPending({ part: part.uid, pin: pin.id });
      setSelWire(null);
      return;
    }
    if (pending.part === part.uid && pending.pin === pin.id) return setPending(null);
    const a = getComponent(project.parts.find((p) => p.uid === pending.part)!.componentId)!.pins.find((x) => x.id === pending.pin)!;
    const dup = project.wires.some((w) => (w.from.part === pending.part && w.from.pin === pending.pin && w.to.part === part.uid && w.to.pin === pin.id) || (w.to.part === pending.part && w.to.pin === pending.pin && w.from.part === part.uid && w.from.pin === pin.id));
    if (!dup) {
      const w: Wire = { id: uid("w"), from: { ...pending }, to: { part: part.uid, pin: pin.id }, color: wireColorFor(a, pin) };
      const after = { ...project, wires: [...project.wires, w], codeCheck: project.codeCheck ? { ...project.codeCheck, ok: false } : null };
      setFx(judge(project, after, w));
      updateProject(project.id, (p) => ({ ...p, wires: [...p.wires, w], codeCheck: p.codeCheck ? { ...p.codeCheck, ok: false } : null }));
      setSelWire(w.id);
    }
    setPending(null);
  };

  const add = (id: string) => {
    const c = getComponent(id);
    if (!c || c.functionalityClass === "C") return;
    let added: string | null = null;
    updateProject(project.id, (p) => {
      const r = addPart(p, id);
      if (!r.part) return r.project;
      added = r.part.uid;
      const w0 = toWorldCenter();
      return { ...r.project, parts: r.project.parts.map((x) => (x.uid === r.part.uid ? { ...x, inCircuit: c.pins.length > 0, schematic: { x: w0.x, y: w0.y } } : x)) };
    });
    if (learning && added) select(added);
  };
  const toWorldCenter = () => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 100, y: 100 };
    return { x: Math.round((r.width / 2 - view.x) / view.k / 10) * 10 - W / 2, y: Math.round((r.height / 2 - view.y) / view.k / 10) * 10 - 60 };
  };

  const fit = () => {
    if (!parts.length || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const bs = parts.map(({ p }) => nodeBox(p));
    const maxX = Math.max(...bs.map((b) => b.x + b.w)) + 80,
      maxY = Math.max(...bs.map((b) => b.y + b.h)) + 40;
    const minX = Math.min(...bs.map((b) => b.x)) - 80,
      minY = Math.min(...bs.map((b) => b.y)) - 40;
    const k = Math.min(1.5, Math.min(r.width / (maxX - minX), r.height / (maxY - minY)));
    setView({ k, x: -minX * k + (r.width - (maxX - minX) * k) / 2, y: -minY * k + 10 });
  };
  useEffect(() => {
    // fit the whole circuit on open — unless we arrived via FIX IT, which centres on the faulty part
    if (useWorkspace.getState().focus?.partUid || useWorkspace.getState().repair) return;
    const t = setTimeout(fit, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wirePathOf = (from: { part: string; pin: string }, to: { part: string; pin: string }) => {
    const a = pinXY(from.part, from.pin),
      b = pinXY(to.part, to.pin);
    if (!a || !b) return null;
    const [sax, say] = STUB[a.side as Side], [sbx, sby] = STUB[b.side as Side];
    const ax = a.x + sax * 14, ay = a.y + say * 14, bx = b.x + sbx * 14, by = b.y + sby * 14;
    if (say === 0 && sby === 0) {
      const mx = a.side === b.side ? (a.side === "L" ? Math.min(ax, bx) - 16 : Math.max(ax, bx) + 16) : (ax + bx) / 2;
      return { d: `M${a.x},${a.y} H${ax} H${mx} V${b.y} H${bx} H${b.x}`, mid: { x: mx, y: (a.y + b.y) / 2 } };
    }
    if (sax === 0 && sbx === 0) {
      const my = a.side === b.side ? (a.side === "T" ? Math.min(ay, by) - 16 : Math.max(ay, by) + 16) : (ay + by) / 2;
      return { d: `M${a.x},${a.y} V${ay} V${my} H${b.x} V${by} V${b.y}`, mid: { x: (a.x + b.x) / 2, y: my } };
    }
    // one horizontal stub, one vertical: an L-shaped route through the corner
    const corner = sax !== 0 ? { x: bx, y: ay } : { x: ax, y: by };
    return { d: `M${a.x},${a.y} L${ax},${ay} L${corner.x},${corner.y} L${bx},${by} L${b.x},${b.y}`, mid: corner };
  };
  const wirePath = (w: Wire) => wirePathOf(w.from, w.to)?.d ?? null;

  /** "Fix Issues": validate now and start with the most serious repairable problem. */
  const fixIssues = () => {
    const report = validateProject(project);
    const order = { critical: 0, warning: 1, suggestion: 2 };
    const list = report.issues.filter((i) => REPAIRABLE.has(i.code) && i.severity !== "suggestion").sort((a, b) => order[a.severity] - order[b.severity]);
    if (!list.length) return toast("info", report.passed ? "Nothing to repair: the circuit passes validation." : "The remaining problems need your decision — open VALIDATE MY ROBOT and use Explain / Better alternative.");
    startFix(list[0], list.slice(1));
  };

  const selectedWire = project.wires.find((w) => w.id === selWire);
  const selPart = project.parts.find((p) => p.uid === selected);
  const selComp = selPart && getComponent(selPart.componentId);
  const issues = project.validation?.issues ?? [];
  const focusPins = new Set(focus?.partUid && focus.pinId ? [`${focus.partUid}.${focus.pinId}`] : []);
  const issuePins = new Set(issues.filter((i) => i.severity === "critical" && i.partUid && i.pinId).map((i) => `${i.partUid}.${i.pinId}`));

  // repair overlay sets
  const plan = player.state.plan;
  const ridx = player.state.idx;
  const stepIdxOf = (k: string) => plan?.steps.findIndex((s) => s.kind === k) ?? -1;
  const cutWires = new Set(plan && !player.state.applied && stepIdxOf("disconnect") >= 0 && ridx >= stepIdxOf("disconnect") ? plan.removes : []);
  const ghostWires = plan && !player.state.applied && stepIdxOf("connect") >= 0 && ridx >= stepIdxOf("connect") ? plan.adds : [];
  const stepPins = new Map((rstep?.pins ?? []).map((p) => [`${p.part}.${p.pin}`, rstep!.kind]));
  const ringColor = (k: string) => (k === "identify" || k === "disconnect" ? THEME.accent : k === "select" ? "#3FB37F" : "#F1EEE3");
  const repairPart = rstep && (rstep.kind === "identify" || rstep.kind === "configure" || rstep.kind === "add") ? rstep.partUid : undefined;

  // bench overlays
  const st = sim?.state;
  const faultWires = new Set(sim?.faults.flatMap((f) => f.wireIds) ?? []);
  const pinSnap = useMemo(() => new Map((sim?.bridge.pinSnapshot() ?? []).map((s) => [s.pin, s])), [sim, st?.t]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveV = (net: ReturnType<typeof graph.netOf.get>) => {
    if (!net || !st) return null;
    if (net.isGround) return 0;
    if (net.voltage !== null) return net.sources.some((s) => graph.comps.get(s.key.split(".")[0])?.battery) ? (st.battery?.volts ?? net.voltage) : net.voltage;
    return null;
  };

  /** Actions for the selected component(s), floating above the selection. */
  const renderSelectionToolbar = () => {
    const sel = project.parts.filter((p) => selectedSet.includes(p.uid) && p.inCircuit);
    if (!sel.length || plan || drag?.moved) return null;
    const bs = sel.map(nodeBox);
    const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
    const yb = Math.max(...bs.map((b) => b.y + b.h));
    const left = Math.max(4, view.x + x * view.k);
    // above the selection — or below it when that would collide with the canvas toolbars at the top
    const above = view.y + y * view.k - 38;
    const top = above < 92 ? view.y + yb * view.k + 6 : above;
    const ids = sel.map((p) => p.uid);
    return (
      <div className="absolute z-20 flex items-center gap-0.5 rounded-md border border-[#C3CBD4] bg-white p-0.5 text-[#17212B] shadow-lg" style={{ left, top }} role="toolbar" aria-label="Component actions" data-testid="part-toolbar">
        <span className="px-1.5 font-mono text-[10px]">{sel.length === 1 ? sel[0].label : `${sel.length} selected`}</span>
        <button className="rounded p-1 hover:bg-[#ECEFF2]" title="Move: drag the title bar, or use the arrow keys (Shift = 5 steps)" aria-label="Move"><Move size={14} /></button>
        <button className="rounded p-1 hover:bg-[#ECEFF2]" title="Rotate anticlockwise" aria-label="Rotate anticlockwise" onClick={() => rotateSel(ids, -1)}><RotateCcw size={14} /></button>
        <button className="rounded p-1 hover:bg-[#ECEFF2]" title="Rotate clockwise" aria-label="Rotate clockwise" onClick={() => rotateSel(ids, 1)}><RotateCw size={14} /></button>
        <button className="rounded p-1 hover:bg-[#ECEFF2]" title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={() => duplicateSel(ids)}><Copy size={14} /></button>
        <button className="rounded p-1 text-[#C62828] hover:bg-[#FDECEA]" title="Delete (Delete key)" aria-label="Delete" onClick={() => deleteParts(ids)}><Trash2 size={14} /></button>
        <button className="rounded p-1 hover:bg-[#ECEFF2]" title="Properties" aria-label="View properties" onClick={() => { select(ids[0]); document.getElementById("cs-inspector")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}><SlidersHorizontal size={14} /></button>
      </div>
    );
  };

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[1fr_280px] xl:grid-cols-[260px_1fr_300px]">
      <aside className="hidden min-h-0 flex-col border-r border-line bg-bg2 xl:flex">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="font-mono text-[10px] tracking-widest text-muted">ADD COMPONENTS</span>
          <button className="flex items-center gap-1 text-[11px] text-brand hover:underline" onClick={() => setWs({ customEditor: {} })}><PlusCircle size={12} /> Custom</button>
        </div>
        <div className="min-h-0 flex-1">
          <LibraryBrowser compact onAdd={add} competition={project.competition} />
        </div>
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-col">
          {/* simulation toolbar */}
          <div className="flex flex-wrap items-center gap-1 border-b border-line bg-bg2 p-1.5 md:absolute md:right-3 md:top-3 md:z-10 md:max-w-[70%] md:justify-end md:rounded-md md:border md:border-line md:bg-bg/95 md:p-1 md:shadow-lg" role="toolbar" aria-label="Simulation">
            {bench.mode === "running" ? (
              <Button size="sm" onClick={bench.pause} title="Pause the bench"><Pause size={14} /> Pause</Button>
            ) : (
              <Button size="sm" variant="primary" onClick={() => { bench.run(); setBottom("bench"); }} title="Power the circuit and run your code on the bench" data-testid="bench-run"><Play size={14} /> Run</Button>
            )}
            <Button size="sm" onClick={bench.stop} disabled={bench.mode === "stopped"} title="Stop and power off"><Square size={13} /> Stop</Button>
            <Button size="sm" onClick={bench.reset} title="Reset: restart the code with a fresh battery"><RotateCcw size={13} /> Reset</Button>
            <Button size="sm" variant="secondary" onClick={() => void validate()} title="Validate My Robot"><ScanLine size={14} /><span className="hidden sm:inline"> Validate</span></Button>
            <Button size="sm" variant="secondary" onClick={fixIssues} title="Repair problems step by step" data-testid="fix-issues"><Wrench size={14} /><span className="hidden sm:inline"> Fix issues</span></Button>
            <Button size="sm" variant={bench.lowPerf ? "primary" : "outline"} aria-pressed={bench.lowPerf} onClick={() => bench.setLowPerf(!bench.lowPerf)} title="Low-performance mode: no wire-flow or spin animation, fewer updates — for slower laptops"><Gauge size={14} /><span className="hidden lg:inline"> Lite</span></Button>
            <Button size="sm" variant={learning ? "primary" : "outline"} aria-pressed={learning} onClick={() => setWs({ learning: !learning })} title="Learning mode: explain the selected component"><GraduationCap size={14} /><span className="hidden sm:inline"> Learn</span></Button>
          </div>
          <div className="pointer-events-none flex items-center gap-1.5 bg-bg2 px-2 pb-1 font-mono text-[10px] md:absolute md:right-3 md:top-[52px] md:z-10 md:rounded md:bg-bg/90 md:px-2 md:py-0.5" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${sim?.faults.length ? "bg-bad" : bench.mode === "running" ? "bg-ok" : bench.mode === "paused" ? "bg-warn" : "bg-dim"}`} />
            <span className="text-muted">{sim?.faults.length ? "BENCH HALTED · SHORT CIRCUIT" : bench.mode === "running" ?`BENCH RUNNING · ${st?.t.toFixed(1)} s${sim?.hasProgram ? " · code running" : " · no program"}` : bench.mode === "paused" ? "BENCH PAUSED" : "POWERED OFF"}</span>
          </div>
        <div className="relative min-h-[340px] flex-1 overflow-hidden md:min-h-0" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData("text/component-id"); if (id) add(id); }}>
          <svg
            ref={svgRef}
            className="h-full w-full touch-none select-none"
            style={{ background: CANVAS.bg }}
            onWheel={(e) => {
              const r = svgRef.current!.getBoundingClientRect();
              const k = Math.max(0.25, Math.min(2.5, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
              const mx = e.clientX - r.left,
                my = e.clientY - r.top;
              setView({ k, x: mx - ((mx - view.x) / view.k) * k, y: my - ((my - view.y) / view.k) * k });
            }}
            onPointerDown={(e) => {
              if (e.target === svgRef.current || (e.target as Element).getAttribute("data-bg")) {
                setSelWire(null);
                clearFocus();
                if (e.shiftKey) {
                  const w0 = toWorld(e.clientX, e.clientY);
                  setBox({ x0: w0.x, y0: w0.y, x1: w0.x, y1: w0.y });
                  return;
                }
                setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y });
                clearSelection();
              }
            }}
            onPointerMove={(e) => {
              const wpt = toWorld(e.clientX, e.clientY);
              setMouse(wpt);
              if (box) return setBox({ ...box, x1: wpt.x, y1: wpt.y });
              if (!drag) return;
              if (drag.kind === "pan") setView({ ...view, x: drag.ox + e.clientX - drag.sx, y: drag.oy + e.clientY - drag.sy });
              else if (drag.uid) {
                let nx = drag.ox + (e.clientX - drag.sx) / view.k,
                  ny = drag.oy + (e.clientY - drag.sy) / view.k;
                if (snap) {
                  nx = Math.round(nx / 10) * 10;
                  ny = Math.round(ny / 10) * 10;
                }
                const ddx = nx - drag.ox, ddy = ny - drag.oy;
                const group = drag.group ?? [drag.uid];
                // one undo step per drag: the first move is recorded, the rest of the drag is not
                updateProject(project.id, (p) => {
                  const start = p.parts.find((x) => x.uid === drag.uid)!;
                  return moveSchematic(p, group, ddx - (start.schematic.x - drag.ox), ddy - (start.schematic.y - drag.oy));
                }, { history: !drag.moved });
                if (!drag.moved) setDrag({ ...drag, moved: true });
              }
            }}
            onPointerUp={() => {
              setDrag(null);
              if (box) {
                const [x0, x1] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)], [y0, y1] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)];
                const hit = parts.filter(({ p }) => { const b = nodeBox(p); return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0; }).map(({ p }) => p.uid);
                const merged = [...new Set([...selectedSet, ...hit])];
                setMulti(merged.length > 1 ? merged : []);
                select(merged[0] ?? null);
                setBox(null);
              }
            }}
            onPointerLeave={() => { setDrag(null); setBox(null); setHoverWire(null); }}
          >
            <defs>
              <filter id="bf-node-shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#141A16" floodOpacity="0.45" /></filter>
              <filter id="bf-led-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3" /></filter>
              <pattern id="grid" width={20} height={20} patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke={CANVAS.grid} strokeWidth={0.8} />
                <circle cx={0} cy={0} r={1.1} fill={CANVAS.dot} />
              </pattern>
            </defs>
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              <rect data-bg="1" x={-5000} y={-5000} width={10000} height={10000} fill="url(#grid)" />
              {/* wires */}
              {project.wires.map((w) => {
                const d = wirePath(w);
                if (!d) return null;
                const net = graph.netOf.get(`${w.from.part}.${w.from.pin}`);
                const potential = net && net.voltage !== null && !net.isGround;
                const isSel = selWire === w.id;
                const bad = focus?.wireId === w.id;
                const flow = st?.flows[w.id];
                const fault = faultWires.has(w.id);
                const cut = cutWires.has(w.id);
                const fresh = fx?.wireId === w.id;
                const role = netRole(graph, net, sim?.bridge.outState ?? null);
                return (
                  <g key={w.id} onPointerDown={(e) => { e.stopPropagation(); setSelWire(w.id); clearSelection(); }} onPointerMove={(e) => { const r = svgRef.current!.getBoundingClientRect(); setHoverWire({ id: w.id, x: e.clientX - r.left, y: e.clientY - r.top }); }} onPointerLeave={() => setHoverWire(null)} className="cursor-pointer" data-wire={w.id} data-role={role}>
                    <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                    {(contrast || isSel) && <path d={d} fill="none" stroke={isSel ? CANVAS.select : "#000"} strokeWidth={(fault ? 4 : isSel || bad ? 3.5 : contrast ? 3 : 2) + 2.6} strokeLinejoin="round" opacity={isSel ? 0.35 : 0.9} />}
                    <path d={d} pathLength={fresh ? 1 : undefined} className={fresh ? "bf-draw" : fault ? "bf-blink" : undefined} fill="none" stroke={fault ? THEME.accent : bad ? THEME.accent : WIRE_COLOUR[role]} strokeDasharray={role === "undriven" && !fresh ? "5 3" : undefined} strokeWidth={fault ? 4 : isSel || bad ? 3.5 : contrast ? 3 : 2.2} strokeLinejoin="round" opacity={cut ? 0.25 : selWire && !isSel ? 0.55 : 1} />
                    {flow && !cut && !bench.lowPerf ? (
                      <path d={d} fill="none" stroke={FLOW_HEX[flow.kind]} strokeWidth={flow.kind === "signal" ? 1.2 : 1.6} opacity={0.35 + 0.6 * flow.level} className={`bf-flow ${flow.dir < 0 ? "bf-flow-rev" : ""}`} style={{ animationDuration: `${Math.max(0.25, 1.1 - 0.8 * flow.level)}s`, animationPlayState: bench.mode === "paused" ? "paused" : "running" }} data-flow={flow.kind} />
                    ) : (
                      !sim && potential && !bench.lowPerf && <path d={d} fill="none" stroke="#fff" strokeWidth={1} opacity={0.5} className="bf-flow" />
                    )}
                    {cut && <path d={d} fill="none" stroke={THEME.accent} strokeWidth={3.2} className="bf-cut" />}
                  </g>
                );
              })}
              {/* junctions: two or more wires on the same pin */}
              {(() => {
                const ends = new Map<string, number>();
                for (const w of project.wires) for (const e of [w.from, w.to]) ends.set(`${e.part}.${e.pin}`, (ends.get(`${e.part}.${e.pin}`) ?? 0) + 1);
                return [...ends].filter(([, n]) => n >= 2).map(([k]) => {
                  const [pu, pi] = [k.slice(0, k.indexOf(".")), k.slice(k.indexOf(".") + 1)];
                  const xy = pinXY(pu, pi);
                  if (!xy) return null;
                  const r = netRole(graph, graph.netOf.get(k), sim?.bridge.outState ?? null);
                  return <circle key={k} cx={xy.x} cy={xy.y} r={5.2} fill={WIRE_COLOUR[r]} stroke="#fff" strokeWidth={1.2} pointerEvents="none" data-junction={k} />;
                });
              })()}
              {/* repair assistant: the new wires being drawn */}
              {ghostWires.map((w) => {
                const p = wirePathOf(w.from, w.to);
                if (!p) return null;
                return (
                  <g key={w.id} pointerEvents="none" data-ghost-wire={w.id}>
                    <path d={p.d} pathLength={1} className="bf-draw" fill="none" stroke="#3FB37F" strokeWidth={3.4} strokeLinejoin="round" />
                    <path d={p.d} fill="none" stroke="#fff" strokeWidth={1.2} opacity={0.8} className="bf-flow" />
                  </g>
                );
              })}
              {/* rubber band */}
              {pending && (() => {
                const a = pinXY(pending.part, pending.pin);
                return a ? <line x1={a.x} y1={a.y} x2={mouse.x} y2={mouse.y} stroke={CANVAS.ink} strokeWidth={2} strokeDasharray="6 4" /> : null;
              })()}
              {/* parts */}
              {parts.map(({ p, c }) => {
                const l = layouts.get(p.uid)!;
                const isSel = selectedSet.includes(p.uid);
                const isFocus = focus?.partUid === p.uid;
                const rot = p.schematic.rot ?? 0;
                // text stays readable: upside-down positions are flipped back
                const up = (tx: number, ty: number) => (rot === 180 || rot === 270 ? `rotate(180 ${tx} ${ty})` : undefined);
                const motor = st?.motors[p.uid];
                const led = st?.dc.find((e) => e.kind === "led" && e.partUid === p.uid);
                const bat = st?.battery?.uid === p.uid ? st.battery : null;
                return (
                  <g key={p.uid} transform={`translate(${p.schematic.x},${p.schematic.y})${rot ? ` rotate(${rot} ${W / 2} ${l.h / 2})` : ""}`} data-part={p.label} data-rot={rot}>
                    {repairPart === p.uid && <rect x={-8} y={-8} width={W + 16} height={l.h + 16} rx={10} fill="none" stroke={rstep?.kind === "configure" ? "#3FB37F" : THEME.accent} strokeWidth={2.5} strokeDasharray="8 5" className="bf-flow" />}
                    <rect width={W} height={l.h} rx={6} fill={CANVAS.card} stroke={isFocus || scanPart === p.uid ? THEME.accent : isSel ? CANVAS.select : CANVAS.line} filter="url(#bf-node-shadow)" strokeWidth={isFocus || isSel ? 2.2 : 1} />
                    <rect
                      width={W}
                      height={26}
                      rx={6}
                      fill={c.kind === "controller" ? "#DCE8F5" : c.kind === "motor-driver" ? "#F8DDD6" : c.kind === "battery" ? "#F6E7C8" : c.kind === "dc-motor" ? "#EDE8CF" : "#ECEFF2"}
                      className="cursor-move"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelWire(null);
                        if (e.shiftKey) {
                          // Shift + click toggles the part in the multi-selection
                          const base = selectedSet.includes(p.uid) ? selectedSet.filter((x) => x !== p.uid) : [...selectedSet, p.uid];
                          setMulti(base.length > 1 ? base : []);
                          select(base[base.length - 1] ?? null);
                          return;
                        }
                        const group = selectedSet.includes(p.uid) && selectedSet.length > 1 ? selectedSet : [p.uid];
                        if (group.length === 1) {
                          select(p.uid);
                          setMulti([]);
                        }
                        setDrag({ kind: "node", uid: p.uid, sx: e.clientX, sy: e.clientY, ox: p.schematic.x, oy: p.schematic.y, group });
                      }}
                    />
                    <text x={8} y={12} transform={up(W / 2, 12)} textAnchor={rot === 180 || rot === 270 ? "end" : undefined} dx={rot === 180 || rot === 270 ? W - 16 : 0} fill={CANVAS.ink} fontSize={10} fontWeight={600} fontFamily="Space Grotesk" pointerEvents="none">{p.label}</text>
                    <text x={8} y={22} transform={up(W / 2, 22)} textAnchor={rot === 180 || rot === 270 ? "end" : undefined} dx={rot === 180 || rot === 270 ? W - 16 : 0} fill={CANVAS.muted} fontSize={8} fontFamily="JetBrains Mono" pointerEvents="none">{c.name.slice(0, motor || bat || led ? 20 : 30)}</text>
                    {/* bench: motor rotor */}
                    {motor && (
                      <g pointerEvents="none" data-motor-rpm={Math.round(motor.rpm)}>
                        <circle cx={W - 14} cy={13} r={9} fill="#fff" stroke={THEME.cardInk} strokeWidth={1} />
                        <g className={Math.abs(motor.rpm) > 1 && !bench.lowPerf ? "bf-spin" : undefined} style={{ animationDuration: `${Math.max(0.08, 60 / Math.max(1, Math.abs(motor.rpm)))}s`, animationDirection: motor.rpm < 0 ? "reverse" : "normal", animationPlayState: bench.mode === "paused" ? "paused" : "running" }}>
                          {[0, 120, 240].map((a) => <line key={a} x1={W - 14} y1={13} x2={W - 14 + 7 * Math.cos((a * Math.PI) / 180)} y2={13 + 7 * Math.sin((a * Math.PI) / 180)} stroke={THEME.accent} strokeWidth={1.8} />)}
                        </g>
                        <text x={W - 26} y={22} transform={up(W - 50, 20)} textAnchor="end" fill={CANVAS.ink} fontSize={7.5} fontFamily="JetBrains Mono">{motor.volts === null ? "coast" : `${motor.volts.toFixed(1)}V ${Math.round(motor.rpm)}rpm`}</text>
                      </g>
                    )}
                    {bat && (
                      <g pointerEvents="none">
                        <rect x={W - 44} y={5} width={34} height={10} rx={2} fill="#fff" stroke={THEME.cardInk} strokeWidth={0.8} />
                        <rect x={W - 43} y={6} width={32 * bat.soc} height={8} rx={1.5} fill="#3FB37F" />
                        <text x={W - 8} y={23} transform={up(W - 30, 20)} textAnchor="end" fill={CANVAS.ink} fontSize={7.5} fontFamily="JetBrains Mono">{bat.volts.toFixed(2)}V {bat.currentA.toFixed(2)}A</text>
                      </g>
                    )}
                    {/* bench: interactive switch — click the body to open / close it */}
                    {sim && c.kind === "switch" && (
                      <g className="cursor-pointer" onPointerDown={(e) => { e.stopPropagation(); updateProject(project.id, (pr) => ({ ...pr, parts: pr.parts.map((x) => (x.uid === p.uid ? { ...x, config: { ...x.config, closed: !Boolean(x.config.closed ?? c.options.find((o) => o.key === "closed")?.default) } } : x)) }), { history: false }); }} data-switch-toggle={p.label}>
                        <rect x={W - 46} y={4} width={38} height={14} rx={7} fill={Boolean(p.config.closed ?? c.options.find((o) => o.key === "closed")?.default) ? "#2E9D58" : "#9AA5B1"} />
                        <circle cx={Boolean(p.config.closed ?? c.options.find((o) => o.key === "closed")?.default) ? W - 15 : W - 39} cy={11} r={5.5} fill="#fff" />
                        <text x={W - 27} y={26} transform={up(W - 27, 24)} textAnchor="middle" fontSize={6.5} fill={CANVAS.muted} fontFamily="JetBrains Mono">{Boolean(p.config.closed ?? c.options.find((o) => o.key === "closed")?.default) ? "CLOSED" : "OPEN"}</text>
                      </g>
                    )}
                    {/* bench: servo horn at the simulated angle */}
                    {st?.servos[p.uid] && (() => {
                      const sv = st.servos[p.uid];
                      const a = ((sv.angle - 90) * Math.PI) / 180;
                      return (
                        <g pointerEvents="none" data-servo-angle={Math.round(sv.angle)}>
                          <circle cx={W - 16} cy={14} r={9} fill="#fff" stroke={CANVAS.ink} strokeWidth={0.8} />
                          <line x1={W - 16} y1={14} x2={W - 16 + 8 * Math.sin(a)} y2={14 - 8 * Math.cos(a)} stroke={sv.powered ? "#1976D2" : "#9AA5B1"} strokeWidth={2.4} strokeLinecap="round" />
                          <text x={W - 30} y={22} transform={up(W - 40, 20)} textAnchor="end" fontSize={7.5} fill={CANVAS.ink} fontFamily="JetBrains Mono">{sv.pin === null ? "no signal" : `${Math.round(sv.angle)}°`}</text>
                        </g>
                      );
                    })()}
                    {/* bench: sensor environment and capacitor voltage */}
                    {sim && (() => {
                      const env = sim.env[p.uid];
                      const capE = st?.dc.find((e) => e.partUid === p.uid && (e.kind === "capacitor" || e.kind === "ldr"));
                      const text = env?.temperature !== undefined ? `${env.temperature.toFixed(1)}°C ${Math.round(env.humidity ?? 0)}%` : capE?.kind === "ldr" ? `${Math.round(env?.lux ?? 300)} lux · ${capE.ohms! >= 1000 ? `${(capE.ohms! / 1000).toFixed(1)}k` : Math.round(capE.ohms!)}Ω` : capE?.kind === "capacitor" ? `${capE.voltage.toFixed(2)} V` : null;
                      if (!text) return null;
                      return <text x={W - 8} y={22} transform={up(W - 30, 20)} textAnchor="end" fontSize={7.5} fill={capE?.overload ? "#C62828" : CANVAS.ink} fontFamily="JetBrains Mono" pointerEvents="none">{capE?.overload ? "⚠ " : ""}{text}</text>;
                    })()}
                    {/* bench: what a wired display shows */}
                    {st?.displays.filter((d) => d.partUid === p.uid).map((d, di) => {
                      const oled = d.kind === "oled";
                      const sc = W / 128;
                      const hh = oled ? 64 * sc : 10 + 12 * Math.max(1, d.lines.length || 2);
                      return (
                        <g key={di} transform={`translate(0 ${l.h + 6})`} pointerEvents="none" data-display={p.label}>
                          <rect width={W} height={hh} rx={3} fill={oled ? "#05080A" : d.backlight && d.on ? "#7FB3D5" : "#3D4F5C"} stroke={CANVAS.ink} strokeWidth={1} />
                          {d.reason ? (
                            <text x={6} y={14} fontSize={7} fill={oled ? "#8A97A3" : "#E8EEF2"} fontFamily="JetBrains Mono">{d.reason.slice(0, 44)}</text>
                          ) : oled ? (
                            d.runs.map((r, i) => <text key={i} x={r.x * sc + 1} y={(r.y + 7 * r.size) * sc + 1} fontSize={8 * r.size * sc} fill="#6FE3FF" fontFamily="JetBrains Mono">{r.ch}</text>)
                          ) : (
                            d.on && d.lines.map((ln, i) => <text key={i} x={6} y={16 + i * 12} fontSize={10} fill={d.backlight ? "#0B2233" : "#1d2a33"} fontFamily="JetBrains Mono" xmlSpace="preserve">{ln}</text>)
                          )}
                        </g>
                      );
                    })}
                    {led && (
                      <g pointerEvents="none">
                        <circle cx={W - 14} cy={13} r={8} fill={THEME.accent} opacity={0.25 + 0.75 * (led.brightness ?? 0)} filter={led.brightness ? "url(#bf-led-glow)" : undefined} />
                        <circle cx={W - 14} cy={13} r={5} fill={led.overload ? "#333" : THEME.accent} opacity={led.overload ? 1 : 0.35 + 0.65 * (led.brightness ?? 0)} />
                        {led.overload && <text x={W - 14} y={16} textAnchor="middle" fill="#fff" fontSize={9}>✕</text>}
                      </g>
                    )}
                    {c.pins.map((pin) => {
                      const pp = l.pos.get(pin.id)!;
                      const key = `${p.uid}.${pin.id}`;
                      const net = graph.netOf.get(key);
                      const connected = net?.wires.length;
                      const hl = focusPins.has(key);
                      const rk = stepPins.get(key);
                      const isPending = pending?.part === p.uid && pending.pin === pin.id;
                      const fxPin = fx && (project.wires.find((w) => w.id === fx.wireId)?.from.part === p.uid && project.wires.find((w) => w.id === fx.wireId)?.from.pin === pin.id || project.wires.find((w) => w.id === fx.wireId)?.to.part === p.uid && project.wires.find((w) => w.id === fx.wireId)?.to.pin === pin.id);
                      // live tags on the bench: supply voltages and controller pin levels
                      let tag: string | null = null;
                      if (st && connected && (pin.fn === "vin" || pin.fn === "vout" || pin.fn === "bat+")) {
                        const v = liveV(net);
                        if (v !== null && v > 0) tag = `${v.toFixed(1)}V`;
                      }
                      if (st && pin.fn === "gpio" && pin.arduinoPin !== undefined) {
                        const s = pinSnap.get(pin.arduinoPin);
                        if (s && s.mode === "OUTPUT") tag = s.duty !== null ? `PWM ${Math.round(s.duty * 100)}%` : s.level ? "HIGH" : "LOW";
                      }
                      return (
                        <g key={pin.id} onPointerEnter={() => setHoverPin({ part: p, pin })} onPointerLeave={() => setHoverPin(null)}>
                          <line x1={pp.x} y1={pp.y} x2={pp.side === "L" ? pp.x + 8 : pp.x - 8} y2={pp.y} stroke={pinColor(pin)} strokeWidth={1.5} />
                          <text x={pp.side === "L" ? 12 : W - 12} y={pp.y + 3} transform={up(pp.side === "L" ? 12 : W - 12, pp.y)} textAnchor={(pp.side === "L") !== (rot === 180 || rot === 270) ? "start" : "end"} fill={hl || rk ? THEME.accentInk : CANVAS.ink} fontWeight={rk ? 700 : 400} fontSize={8.5} fontFamily="JetBrains Mono" pointerEvents="none">
                            {pin.label.length > 18 ? pin.label.slice(0, 18) + "…" : pin.label}
                          </text>
                          {(hl || rk || fxPin) && (
                            <circle cx={pp.x} cy={pp.y} r={9} fill="none" stroke={rk ? ringColor(rk) : fxPin ? (fx!.tone === "ok" ? "#3FB37F" : fx!.tone === "warn" ? "#E0A21B" : THEME.accent) : THEME.accent} strokeWidth={2.2} pointerEvents="none">
                              <animate attributeName="r" values="6;13;6" dur="1.2s" repeatCount="indefinite" />
                            </circle>
                          )}
                          {tag && (
                            <g pointerEvents="none">
                              <rect x={pp.side === "L" ? pp.x - 44 : pp.x + 4} y={pp.y - 6} width={40} height={11} rx={2} fill="#1d2721" opacity={0.85} />
                              <text x={pp.side === "L" ? pp.x - 24 : pp.x + 24} y={pp.y + 2.5} transform={up(pp.side === "L" ? pp.x - 24 : pp.x + 24, pp.y)} textAnchor="middle" fill="#ffe08a" fontSize={7} fontFamily="JetBrains Mono">{tag}</text>
                            </g>
                          )}
                          <circle
                            cx={pp.x}
                            cy={pp.y}
                            r={isPending ? 6 : 4.2}
                            fill={connected ? pinColor(pin) : CANVAS.well}
                            stroke={issuePins.has(key) ? THEME.accent : pinColor(pin)}
                            strokeWidth={1.5}
                            className="cursor-crosshair"
                            data-pin={`${p.label}.${pin.id}`}
                            role="button"
                            aria-label={`Pin ${p.label} ${pin.label}`}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              clickPin(p, pin);
                            }}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}
              {box && <rect x={Math.min(box.x0, box.x1)} y={Math.min(box.y0, box.y1)} width={Math.abs(box.x1 - box.x0)} height={Math.abs(box.y1 - box.y0)} fill={CANVAS.select} fillOpacity={0.08} stroke={CANVAS.select} strokeDasharray="5 4" pointerEvents="none" />}
            </g>
          </svg>
          {renderSelectionToolbar()}
          <div className="absolute left-3 top-3 z-10 flex gap-1 rounded-md border border-line bg-bg/95 p-1 shadow-lg">
            <Button size="sm" onClick={() => setView({ ...view, k: Math.min(2.5, view.k * 1.2) })} title="Zoom in"><Plus size={14} /></Button>
            <Button size="sm" onClick={() => setView({ ...view, k: Math.max(0.25, view.k / 1.2) })} title="Zoom out"><Minus size={14} /></Button>
            <Button size="sm" onClick={fit} title="Fit"><Maximize size={14} /></Button>
            <Button size="sm" variant={snap ? "secondary" : "outline"} onClick={() => setSnap(!snap)} title="Grid snapping"><Grid3x3 size={14} /></Button>
            <Button size="sm" onClick={() => exportCircuit(project, graph)} title="Export netlist"><Download size={14} /><span className="hidden lg:inline">Export</span></Button>
            <Button size="sm" variant={contrast ? "secondary" : "outline"} onClick={() => setContrast(!contrast)} title="High-contrast wires" aria-pressed={contrast}><Contrast size={14} /></Button>
          </div>
          {pending && <div className="absolute left-1/2 top-12 -translate-x-1/2 rounded border border-brand/50 bg-bg/90 px-3 py-1 text-xs text-brand">Wiring from {project.parts.find((p) => p.uid === pending.part)?.label}.{pending.pin} — click another pin (Esc to cancel)</div>}
          {fx && (
            <div className={`absolute left-1/2 top-12 max-w-[90%] -translate-x-1/2 rounded border px-3 py-1 text-xs ${fx.tone === "ok" ? "border-ok/50 bg-bg/90 text-ok" : fx.tone === "warn" ? "border-warn/50 bg-bg/90 text-warn" : "border-bad/60 bg-bg/95 text-bad"}`} role="status" data-testid="connect-fx">{fx.text}</div>
          )}
          {sim?.faults.length ? (
            <div className="absolute left-1/2 top-20 w-[min(520px,92%)] -translate-x-1/2 rounded border border-bad/60 bg-bg/95 p-2 text-xs text-bad" role="alert">
              {sim.faults[0].message}
              {(() => {
                const iss = validateProject(project).issues.find((i) => i.code === "E_SHORT_CIRCUIT");
                return iss ? <Button size="sm" variant="primary" className="ml-2" onClick={() => { bench.stop(); startFix(iss); }}><Wrench size={12} /> Show me the fix</Button> : null;
              })()}
            </div>
          ) : null}
          {hoverPin && !plan && (
            <div className="pointer-events-none absolute bottom-3 left-3 max-w-md rounded border border-line bg-bg/95 px-3 py-2 text-xs">
              <span className="font-mono text-brand">{hoverPin.part.label}.{hoverPin.pin.label}</span> — {pinFunctionText(hoverPin.pin)}
              {hoverPin.pin.note && <div className="text-dim">{hoverPin.pin.note}</div>}
            </div>
          )}
          {focus?.issue && focus.issue.area !== "mechanical" && !plan && (
            <div className="absolute bottom-3 right-3 w-[min(480px,90%)]">
              <IssueCard issue={focus.issue} n={1} project={project} compact />
              <button className="mt-1 text-xs text-muted hover:text-text" onClick={clearFocus}>Dismiss</button>
            </div>
          )}
          <RepairControls player={player} />
          {project.wires.length > 0 && !plan && (
            <div className="absolute bottom-3 right-3 max-w-[220px] rounded border border-[#AEB6BF] bg-white/95 p-2 text-[10px] text-[#17212B] shadow" data-testid="wire-legend">
              <button className="flex w-full items-center justify-between font-mono tracking-widest" onClick={() => setLegendOpen(!legendOpen)} aria-expanded={legendOpen}>WIRE COLOURS <span>{legendOpen ? "−" : "+"}</span></button>
              {legendOpen && (
                <ul className="mt-1 space-y-0.5">
                  {(["positive", "negative", "signal"] as const).map((r) => (
                    <li key={r} className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-5 rounded" style={{ background: ROLE_INFO[r].hex }} />{r === "positive" ? "Red" : r === "negative" ? "Black" : "Blue"} – {ROLE_INFO[r].label}</li>
                  ))}
                </ul>
              )}
              {legendOpen && <div className="mt-1 text-[#4E5A66]">Motor-driver outputs follow the H-bridge: HIGH red, LOW black{sim ? "" : " — dashed until you press Run"}. Colours never change the simulation.</div>}
            </div>
          )}
          {hoverWire && (() => {
            const w = project.wires.find((x) => x.id === hoverWire.id);
            if (!w) return null;
            const net = graph.netOf.get(`${w.from.part}.${w.from.pin}`);
            const role = netRole(graph, net, sim?.bridge.outState ?? null);
            const v = liveV(net) ?? net?.voltage ?? null;
            const flow = st?.flows[w.id];
            const a = project.parts.find((p) => p.uid === w.from.part)?.label, b = project.parts.find((p) => p.uid === w.to.part)?.label;
            return (
              <div className="pointer-events-none absolute z-20 rounded border border-[#C3CBD4] bg-white px-2 py-1 text-[11px] text-[#17212B] shadow" style={{ left: Math.min(hoverWire.x + 12, 9999), top: hoverWire.y + 12 }} role="tooltip" data-testid="wire-tooltip">
                <div className="font-mono font-semibold">{a}.{w.from.pin} → {b}.{w.to.pin}</div>
                <div className="flex items-center gap-1"><span className="inline-block h-1.5 w-3 rounded" style={{ background: WIRE_COLOUR[role] }} />{role === "undriven" ? "Motor output — not driven (off / coasting)" : ROLE_INFO[role].label}{v !== null && !net?.isGround ? ` · ${v.toFixed(2)} V` : ""}{flow?.amps !== undefined ? ` · ≈${flow.amps.toFixed(2)} A` : ""}</div>
              </div>
            );
          })()}
          {confirmDel && (
            <div className="absolute left-1/2 top-24 z-30 w-[min(420px,92%)] -translate-x-1/2 rounded-lg border border-bad/50 bg-bg/95 p-3 text-sm shadow-xl" role="alertdialog" aria-label="Confirm delete">
              <div className="font-semibold">Delete {confirmDel.uids.length === 1 ? project.parts.find((p) => p.uid === confirmDel.uids[0])?.label : `${confirmDel.uids.length} components`} and its {confirmDel.wires} connections?</div>
              <p className="text-xs text-muted">The wires to it are removed too. You can undo this.</p>
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirmDel(null)}>Cancel</Button>
                <Button size="sm" variant="danger" onClick={() => deleteParts(confirmDel.uids, true)} autoFocus><Trash2 size={12} /> Delete</Button>
              </div>
            </div>
          )}
          {undoBar && (
            <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-bg/95 px-3 py-2 text-xs shadow-xl" role="status" data-testid="undo-bar">
              {undoBar}
              <Button size="sm" onClick={() => { undo(project.id); setUndoBar(null); }}><Undo2 size={12} /> Undo</Button>
              <button onClick={() => setUndoBar(null)} aria-label="Dismiss" className="text-muted hover:text-text"><X size={13} /></button>
            </div>
          )}
          {!parts.length && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">Add electronic components from the library to start wiring.</div>}
        </div>
        <div className={`${bottom === "bench" ? "h-56" : "h-40"} border-t border-line bg-bg2`}>
          <div className="border-b border-line px-3 py-1">
            <Tabs value={bottom} onChange={setBottom} items={[{ value: "connections", label: `Connections (${project.wires.length})` }, { value: "issues", label: `Validation (${issues.length})` }, { value: "bench", label: bench.mode === "stopped" ? "Live bench" : "● Live bench" }]} />
          </div>
          <div className="h-[calc(100%-34px)] overflow-auto p-2 font-mono text-[11px]">
            {bottom === "connections" &&
              project.wires.map((w) => {
                const a = project.parts.find((p) => p.uid === w.from.part),
                  b = project.parts.find((p) => p.uid === w.to.part);
                return (
                  <button key={w.id} onClick={() => setSelWire(w.id)} className={`flex w-full gap-2 rounded px-2 py-0.5 text-left ${selWire === w.id ? "bg-panel2" : "hover:bg-panel"}`}>
                    <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ background: WIRE_COLOUR[netRole(graph, graph.netOf.get(`${w.from.part}.${w.from.pin}`), sim?.bridge.outState ?? null)] }} />
                    <span>{a?.label}.{w.from.pin}</span>
                    <span className="text-dim">→</span>
                    <span>{b?.label}.{w.to.pin}</span>
                    {w.label && <span className="text-dim">“{w.label}”</span>}
                  </button>
                );
              })}
            {bottom === "issues" && (issues.length ? <div className="space-y-2 font-sans">{issues.map((i, n) => <IssueCard key={i.id} issue={i} n={n + 1} project={project} compact />)}</div> : <div className="text-muted">Run VALIDATE MY ROBOT to check the circuit.</div>)}
            {bottom === "bench" && <BenchPanel bench={bench} project={project} />}
          </div>
        </div>
      </div>

      <aside id="cs-inspector" className="min-h-0 overflow-auto border-l border-line bg-bg2 p-3 text-sm">
        {learning && selComp && !selectedWire && (
          <div className="mb-4 border-b border-line pb-3">
            <LearnPanel comp={selComp} />
          </div>
        )}
        {learning && !selComp && !selectedWire && <div className="mb-3 rounded border border-brand/40 p-2 text-xs text-brand">Learning mode is on: select any component to see what it is, how it works and how to connect it.</div>}
        {selectedWire ? (
          <div className="space-y-3">
            <div className="bf-label">Wire</div>
            <div className="font-mono text-xs">
              {project.parts.find((p) => p.uid === selectedWire.from.part)?.label}.{selectedWire.from.pin} → {project.parts.find((p) => p.uid === selectedWire.to.part)?.label}.{selectedWire.to.pin}
            </div>
            {st?.flows[selectedWire.id]?.amps !== undefined && <div className="text-xs text-accent-ink">≈{st.flows[selectedWire.id].amps!.toFixed(2)} A flowing ({st.flows[selectedWire.id].kind})</div>}
            {(() => {
              const r = netRole(graph, graph.netOf.get(`${selectedWire.from.part}.${selectedWire.from.pin}`), sim?.bridge.outState ?? null);
              return <div className="flex items-center gap-2 text-xs"><span className="inline-block h-2 w-6 rounded" style={{ background: WIRE_COLOUR[r] }} />{r === "undriven" ? "Motor output (polarity set by the H-bridge while running)" : ROLE_INFO[r].label}</div>;
            })()}
            <Field label="Label">
              <input className="bf-input" value={selectedWire.label ?? ""} onChange={(e) => updateProject(project.id, (p) => ({ ...p, wires: p.wires.map((w) => (w.id === selectedWire.id ? { ...w, label: e.target.value } : w)) }))} />
            </Field>
            <Button variant="danger" size="sm" onClick={() => { updateProject(project.id, (p) => ({ ...p, wires: p.wires.filter((w) => w.id !== selectedWire.id) })); setSelWire(null); }}>
              <Trash2 size={13} /> Remove connection
            </Button>
            <p className="text-[11px] text-dim">Colours are automatic: red = positive, black = negative / GND, blue = signal.</p>
          </div>
        ) : selPart && selComp ? (
          <div className="space-y-2">
            <div className="bf-label">Pin inspector</div>
            <div className="font-display text-base font-semibold">{selPart.label} · {selComp.name}</div>
            <div className="text-[11px] text-dim">Pinout: {selComp.pinoutStatus.replace("-", " ")} · {graph.powered.has(selPart.uid) ? <span className="text-ok">powered</span> : <span className="text-warn">not powered</span>}</div>
            <Button size="sm" variant="ghost" onClick={() => setWs({ recommendFor: selPart.uid })}>Is this the right part? Check it</Button>
            {selComp.options.filter((o) => o.type === "boolean").map((o) => (
              <label key={o.key} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={Boolean(selPart.config[o.key] ?? o.default)} onChange={(e) => updateProject(project.id, (p) => ({ ...p, parts: p.parts.map((x) => (x.uid === selPart.uid ? { ...x, config: { ...x.config, [o.key]: e.target.checked } } : x)) }))} />
                {o.label}
              </label>
            ))}
            {selComp.options.filter((o) => o.type === "number").map((o) => (
              <Field key={o.key} label={`${o.label}${o.unit ? ` (${o.unit})` : ""}`}>
                <input className="bf-input" type="number" min={o.min} max={o.max} step={o.step} value={Number(selPart.config[o.key] ?? o.default)} onChange={(e) => { const v = Number(e.target.value); if (!Number.isFinite(v)) return; const cl = Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, v)); updateProject(project.id, (p) => ({ ...p, parts: p.parts.map((x) => (x.uid === selPart.uid ? { ...x, config: { ...x.config, [o.key]: cl } } : x)) })); }} />
              </Field>
            ))}
            {selComp.options.filter((o) => o.type === "select").map((o) => (
              <Field key={o.key} label={o.label}>
                <select className="bf-input" value={String(selPart.config[o.key] ?? o.default)} onChange={(e) => updateProject(project.id, (p) => ({ ...p, parts: p.parts.map((x) => (x.uid === selPart.uid ? { ...x, config: withOption(selComp, x.config, o.key, e.target.value) as typeof x.config } : x)) }))}>
                  {(o.choices ?? []).map((ch) => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
                </select>
              </Field>
            ))}
            <table className="w-full text-[11px]">
              <tbody>
                {selComp.pins.map((pin) => {
                  const net = graph.netOf.get(`${selPart.uid}.${pin.id}`);
                  const peers = net?.members.filter((m) => m.part.uid !== selPart.uid) ?? [];
                  const lv = liveV(net);
                  return (
                    <tr key={pin.id} className={`border-b border-line/60 align-top ${focusPins.has(`${selPart.uid}.${pin.id}`) ? "bg-bad/10" : ""}`}>
                      <td className="py-1 pr-2 font-mono" style={{ color: pinColor(pin) }}>{pin.label}</td>
                      <td className="py-1 text-muted">
                        <div>{pinFunctionText(pin)}</div>
                        {peers.length > 0 && <div className="text-text">→ {peers.map((m) => `${m.part.label}.${m.pin.label}`).join(", ")}</div>}
                        {net?.voltage != null && !net.isGround && <div className="text-accent-ink">{(lv ?? net.voltage).toFixed(2)} V{lv !== null && st ? " (live)" : ""}</div>}
                        {net?.isGround && <div className="text-dim">GND</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-3 text-xs text-muted">
            <div className="bf-label">How to wire</div>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Click a pin to start a wire.</li>
              <li>Click the destination pin to connect it — you see at once whether the connection is valid.</li>
              <li>Click a wire to recolour, label or delete it (Delete key).</li>
              <li>Drag a component by its title bar; wheel to zoom; drag the background to pan.</li>
              <li>Press <b>Run</b> to power the circuit: your code runs, motors spin and current flows.</li>
            </ol>
            <p>Every connection is stored in the circuit graph used by the validator, Code Studio and the simulator.</p>
            <Button size="sm" variant="ghost" onClick={() => setWs({ customEditor: {} })}><PlusCircle size={12} /> Create a custom component</Button>
          </div>
        )}
      </aside>
      <RecommendationPanel project={project} />
      <CustomComponentModal project={project} />
    </div>
  );
}

function exportCircuit(project: Project, graph: ReturnType<typeof buildGraph>) {
  const data = {
    project: project.name,
    exportedAt: new Date().toISOString(),
    parts: project.parts.filter((p) => p.inCircuit).map((p) => ({ ref: p.label, component: getComponent(p.componentId)?.name, config: p.config })),
    connections: project.wires.map((w) => ({ from: `${project.parts.find((p) => p.uid === w.from.part)?.label}.${w.from.pin}`, to: `${project.parts.find((p) => p.uid === w.to.part)?.label}.${w.to.pin}`, color: w.color, label: w.label })),
    nets: graph.nets.filter((n) => n.members.length > 1 && n.wires.length).map((n) => ({ voltage: n.voltage, ground: n.isGround, pins: n.members.map((m) => `${m.part.label}.${m.pin.label}`) })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${project.name.replace(/\W+/g, "_")}_circuit.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
