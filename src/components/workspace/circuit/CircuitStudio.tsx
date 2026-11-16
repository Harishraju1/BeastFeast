"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Grid3x3, Maximize, Minus, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store/app";
import { useWorkspace } from "@/lib/store/workspace";
import { getComponent } from "@/lib/catalogue";
import type { ComponentRecord, PartInstance, PinDef, Project, Wire, WireColor } from "@/lib/types";
import { addPart, uid } from "@/lib/robot/assembly";
import { buildGraph } from "@/lib/circuit/nets";
import { LibraryBrowser } from "@/components/library/LibraryBrowser";
import { pinColor, pinFunctionText } from "@/components/library/PinoutDiagram";
import { Button, Field, Tabs } from "@/components/ui";
import { IssueCard } from "../Validation";
import { isTypingTarget } from "@/lib/keyboard";

const W = 170;
const PITCH = 16;
const HEAD = 34;
const WIRE_HEX: Record<WireColor, string> = { red: "#ff3b4e", black: "#7c8696", yellow: "#f5c518", blue: "#3b82f6", green: "#22c55e", orange: "#ff8a3d", white: "#e5e7eb", purple: "#a855f7" };

function layout(comp: ComponentRecord) {
  const left = comp.pins.filter((p) => p.side === "L" || p.side === "T");
  const right = comp.pins.filter((p) => p.side === "R" || p.side === "B");
  const rows = Math.max(left.length, right.length, 1);
  const pos = new Map<string, { x: number; y: number; side: "L" | "R" }>();
  left.forEach((p, i) => pos.set(p.id, { x: 0, y: HEAD + i * PITCH, side: "L" }));
  right.forEach((p, i) => pos.set(p.id, { x: W, y: HEAD + i * PITCH, side: "R" }));
  return { h: HEAD + rows * PITCH + 6, pos };
}

function defaultColor(a: PinDef, b: PinDef): WireColor {
  const fns = [a.fn, b.fn];
  if (fns.some((f) => f === "gnd" || f === "bat-")) return "black";
  if (fns.some((f) => f === "vin" || f === "vout" || f === "bat+")) return "red";
  if (fns.some((f) => f.startsWith("i2c") || f.startsWith("spi") || f.startsWith("uart"))) return "blue";
  if (fns.some((f) => f.startsWith("motor"))) return "orange";
  return "yellow";
}

export default function CircuitStudio({ project }: { project: Project }) {
  const { updateProject } = useApp();
  const { selected, select, focus, clearFocus, scanPart } = useWorkspace();
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 0.85 });
  const [snap, setSnap] = useState(true);
  const [pending, setPending] = useState<{ part: string; pin: string } | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [selWire, setSelWire] = useState<string | null>(null);
  const [hoverPin, setHoverPin] = useState<{ part: PartInstance; pin: PinDef } | null>(null);
  const [drag, setDrag] = useState<{ kind: "pan" | "node"; uid?: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [bottom, setBottom] = useState<"connections" | "issues">("connections");

  const parts = project.parts.filter((p) => p.inCircuit).map((p) => ({ p, c: getComponent(p.componentId)! })).filter((x) => x.c && x.c.pins.length);
  const layouts = useMemo(() => new Map(parts.map(({ p, c }) => [p.uid, layout(c)])), [parts]);
  const graph = useMemo(() => buildGraph(project), [project]);

  const pinXY = (partUid: string, pinId: string) => {
    const part = project.parts.find((p) => p.uid === partUid);
    const l = layouts.get(partUid);
    const pp = l?.pos.get(pinId);
    if (!part || !pp) return null;
    return { x: part.schematic.x + pp.x, y: part.schematic.y + pp.y, side: pp.side };
  };
  const toWorld = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };

  // focus from validation "FIX IT": centre on the part
  useEffect(() => {
    if (!focus?.partUid || !svgRef.current) return;
    const part = project.parts.find((p) => p.uid === focus.partUid);
    if (!part) return;
    const r = svgRef.current.getBoundingClientRect();
    const k = 1.15;
    setView({ k, x: r.width / 2 - (part.schematic.x + W / 2) * k, y: r.height / 2 - (part.schematic.y + 80) * k });
    if (focus.wireId) setSelWire(focus.wireId);
  }, [focus, project.parts]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") setPending(null);
      if ((e.key === "Delete" || e.key === "Backspace") && selWire) {
        updateProject(project.id, (p) => ({ ...p, wires: p.wires.filter((w) => w.id !== selWire) }));
        setSelWire(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selWire, project.id, updateProject]);

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
      const w: Wire = { id: uid("w"), from: { ...pending }, to: { part: part.uid, pin: pin.id }, color: defaultColor(a, pin) };
      updateProject(project.id, (p) => ({ ...p, wires: [...p.wires, w], codeCheck: p.codeCheck ? { ...p.codeCheck, ok: false } : null }));
      setSelWire(w.id);
    }
    setPending(null);
  };

  const add = (id: string) => {
    const c = getComponent(id);
    if (!c || c.functionalityClass === "C") return;
    updateProject(project.id, (p) => {
      const r = addPart(p, id);
      if (!r.part) return r.project;
      const w0 = toWorldCenter();
      return { ...r.project, parts: r.project.parts.map((x) => (x.uid === r.part.uid ? { ...x, inCircuit: c.pins.length > 0, schematic: { x: w0.x, y: w0.y } } : x)) };
    });
  };
  const toWorldCenter = () => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 100, y: 100 };
    return { x: Math.round((r.width / 2 - view.x) / view.k / 10) * 10 - W / 2, y: Math.round((r.height / 2 - view.y) / view.k / 10) * 10 - 60 };
  };

  const fit = () => {
    if (!parts.length || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const xs = parts.map(({ p }) => p.schematic.x),
      ys = parts.map(({ p }) => p.schematic.y);
    const maxX = Math.max(...xs) + W + 80,
      maxY = Math.max(...parts.map(({ p }) => p.schematic.y + layouts.get(p.uid)!.h)) + 40;
    const minX = Math.min(...xs) - 80,
      minY = Math.min(...ys) - 40;
    const k = Math.min(1.5, Math.min(r.width / (maxX - minX), r.height / (maxY - minY)));
    setView({ k, x: -minX * k + (r.width - (maxX - minX) * k) / 2, y: -minY * k + 10 });
  };
  useEffect(() => {
    // fit the whole circuit on open — unless we arrived via FIX IT, which centres on the faulty part
    if (useWorkspace.getState().focus?.partUid) return;
    const t = setTimeout(fit, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wirePath = (w: Wire) => {
    const a = pinXY(w.from.part, w.from.pin),
      b = pinXY(w.to.part, w.to.pin);
    if (!a || !b) return null;
    const ax = a.x + (a.side === "L" ? -14 : 14),
      bx = b.x + (b.side === "L" ? -14 : 14);
    const mx = a.side === b.side ? (a.side === "L" ? Math.min(ax, bx) - 16 : Math.max(ax, bx) + 16) : (ax + bx) / 2;
    return `M${a.x},${a.y} H${ax} ${a.side === b.side ? `H${mx}` : `H${mx}`} V${b.y} H${bx} H${b.x}`;
  };

  const selectedWire = project.wires.find((w) => w.id === selWire);
  const selPart = project.parts.find((p) => p.uid === selected);
  const selComp = selPart && getComponent(selPart.componentId);
  const issues = project.validation?.issues ?? [];
  const focusPins = new Set(focus?.partUid && focus.pinId ? [`${focus.partUid}.${focus.pinId}`] : []);
  const issuePins = new Set(issues.filter((i) => i.severity === "critical" && i.partUid && i.pinId).map((i) => `${i.partUid}.${i.pinId}`));

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[1fr_280px] xl:grid-cols-[260px_1fr_300px]">
      <aside className="hidden min-h-0 flex-col border-r border-line bg-bg2 xl:flex">
        <div className="border-b border-line px-3 py-2 font-mono text-[10px] tracking-widest text-muted">ADD COMPONENTS</div>
        <div className="min-h-0 flex-1">
          <LibraryBrowser compact onAdd={add} competition={project.competition} />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData("text/component-id"); if (id) add(id); }}>
          <svg
            ref={svgRef}
            className="h-full w-full touch-none select-none bg-[#0a0d13]"
            onWheel={(e) => {
              const r = svgRef.current!.getBoundingClientRect();
              const k = Math.max(0.25, Math.min(2.5, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
              const mx = e.clientX - r.left,
                my = e.clientY - r.top;
              setView({ k, x: mx - ((mx - view.x) / view.k) * k, y: my - ((my - view.y) / view.k) * k });
            }}
            onPointerDown={(e) => {
              if (e.target === svgRef.current || (e.target as Element).getAttribute("data-bg")) {
                setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y });
                select(null);
                setSelWire(null);
                clearFocus();
              }
            }}
            onPointerMove={(e) => {
              setMouse(toWorld(e.clientX, e.clientY));
              if (!drag) return;
              if (drag.kind === "pan") setView({ ...view, x: drag.ox + e.clientX - drag.sx, y: drag.oy + e.clientY - drag.sy });
              else if (drag.uid) {
                let nx = drag.ox + (e.clientX - drag.sx) / view.k,
                  ny = drag.oy + (e.clientY - drag.sy) / view.k;
                if (snap) {
                  nx = Math.round(nx / 10) * 10;
                  ny = Math.round(ny / 10) * 10;
                }
                updateProject(project.id, (p) => ({ ...p, parts: p.parts.map((x) => (x.uid === drag.uid ? { ...x, schematic: { ...x.schematic, x: nx, y: ny } } : x)) }), { history: false });
              }
            }}
            onPointerUp={() => setDrag(null)}
            onPointerLeave={() => setDrag(null)}
          >
            <defs>
              <pattern id="grid" width={20} height={20} patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#141c27" strokeWidth={1} />
              </pattern>
            </defs>
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              <rect data-bg="1" x={-5000} y={-5000} width={10000} height={10000} fill="url(#grid)" />
              {/* wires */}
              {project.wires.map((w) => {
                const d = wirePath(w);
                if (!d) return null;
                const net = graph.netOf.get(`${w.from.part}.${w.from.pin}`);
                const live = net && net.voltage !== null && !net.isGround;
                const isSel = selWire === w.id;
                const bad = focus?.wireId === w.id;
                return (
                  <g key={w.id} onPointerDown={(e) => { e.stopPropagation(); setSelWire(w.id); select(null); }} className="cursor-pointer">
                    <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                    <path d={d} fill="none" stroke={bad ? "#ff3b4e" : WIRE_HEX[w.color]} strokeWidth={isSel || bad ? 3.5 : 2} strokeLinejoin="round" opacity={selWire && !isSel ? 0.55 : 1} />
                    {live && <path d={d} fill="none" stroke="#fff" strokeWidth={1} opacity={0.35} className="bf-flow" />}
                  </g>
                );
              })}
              {/* rubber band */}
              {pending && (() => {
                const a = pinXY(pending.part, pending.pin);
                return a ? <line x1={a.x} y1={a.y} x2={mouse.x} y2={mouse.y} stroke="#00d9ff" strokeWidth={2} strokeDasharray="6 4" /> : null;
              })()}
              {/* parts */}
              {parts.map(({ p, c }) => {
                const l = layouts.get(p.uid)!;
                const isSel = selected === p.uid;
                const isFocus = focus?.partUid === p.uid;
                return (
                  <g key={p.uid} transform={`translate(${p.schematic.x},${p.schematic.y})`}>
                    <rect width={W} height={l.h} rx={6} fill="#141a25" stroke={isFocus ? "#ff3b4e" : isSel || scanPart === p.uid ? "#00d9ff" : "#2c3850"} strokeWidth={isFocus || isSel ? 2 : 1} />
                    <rect
                      width={W}
                      height={26}
                      rx={6}
                      fill={c.kind === "controller" ? "#0f4c64" : c.kind === "motor-driver" ? "#5c1820" : c.kind === "battery" ? "#4c3510" : c.kind === "dc-motor" ? "#4a3f0c" : "#1d2738"}
                      className="cursor-move"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        select(p.uid);
                        setSelWire(null);
                        setDrag({ kind: "node", uid: p.uid, sx: e.clientX, sy: e.clientY, ox: p.schematic.x, oy: p.schematic.y });
                      }}
                    />
                    <text x={8} y={12} fill="#f4f7fb" fontSize={10} fontWeight={600} fontFamily="Space Grotesk" pointerEvents="none">{p.label}</text>
                    <text x={8} y={22} fill="#95a1b5" fontSize={8} fontFamily="JetBrains Mono" pointerEvents="none">{c.name.slice(0, 30)}</text>
                    {c.pins.map((pin) => {
                      const pp = l.pos.get(pin.id)!;
                      const key = `${p.uid}.${pin.id}`;
                      const connected = graph.netOf.get(key)?.wires.length;
                      const hl = focusPins.has(key);
                      const isPending = pending?.part === p.uid && pending.pin === pin.id;
                      return (
                        <g key={pin.id} onPointerEnter={() => setHoverPin({ part: p, pin })} onPointerLeave={() => setHoverPin(null)}>
                          <line x1={pp.x} y1={pp.y} x2={pp.side === "L" ? pp.x + 8 : pp.x - 8} y2={pp.y} stroke={pinColor(pin)} strokeWidth={1.5} />
                          <text x={pp.side === "L" ? 12 : W - 12} y={pp.y + 3} textAnchor={pp.side === "L" ? "start" : "end"} fill={hl ? "#ff6b1a" : "#cfd6e2"} fontSize={8.5} fontFamily="JetBrains Mono" pointerEvents="none">
                            {pin.label.length > 18 ? pin.label.slice(0, 18) + "…" : pin.label}
                          </text>
                          {hl && <circle cx={pp.x} cy={pp.y} r={9} fill="none" stroke="#ff3b4e" strokeWidth={2}><animate attributeName="r" values="6;12;6" dur="1.2s" repeatCount="indefinite" /></circle>}
                          <circle
                            cx={pp.x}
                            cy={pp.y}
                            r={isPending ? 6 : 4.2}
                            fill={connected ? pinColor(pin) : "#0a0d13"}
                            stroke={issuePins.has(key) ? "#ff3b4e" : pinColor(pin)}
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
            </g>
          </svg>
          <div className="absolute left-3 top-3 flex gap-1">
            <Button size="sm" onClick={() => setView({ ...view, k: Math.min(2.5, view.k * 1.2) })} title="Zoom in"><Plus size={14} /></Button>
            <Button size="sm" onClick={() => setView({ ...view, k: Math.max(0.25, view.k / 1.2) })} title="Zoom out"><Minus size={14} /></Button>
            <Button size="sm" onClick={fit} title="Fit"><Maximize size={14} /></Button>
            <Button size="sm" variant={snap ? "cyan" : "outline"} onClick={() => setSnap(!snap)} title="Grid snapping"><Grid3x3 size={14} /></Button>
            <Button size="sm" onClick={() => exportCircuit(project, graph)} title="Export netlist"><Download size={14} /> Export</Button>
          </div>
          {pending && <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded border border-cyan/50 bg-bg/90 px-3 py-1 text-xs text-cyan">Wiring from {project.parts.find((p) => p.uid === pending.part)?.label}.{pending.pin} — click another pin (Esc to cancel)</div>}
          {hoverPin && (
            <div className="pointer-events-none absolute bottom-3 left-3 max-w-md rounded border border-line bg-bg/95 px-3 py-2 text-xs">
              <span className="font-mono text-cyan">{hoverPin.part.label}.{hoverPin.pin.label}</span> — {pinFunctionText(hoverPin.pin)}
              {hoverPin.pin.note && <div className="text-dim">{hoverPin.pin.note}</div>}
            </div>
          )}
          {focus?.issue && focus.issue.area !== "mechanical" && (
            <div className="absolute bottom-3 right-3 w-[min(480px,90%)]">
              <IssueCard issue={focus.issue} n={1} />
              <button className="mt-1 text-xs text-muted hover:text-text" onClick={clearFocus}>Dismiss</button>
            </div>
          )}
          {!parts.length && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">Add electronic components from the library to start wiring.</div>}
        </div>
        <div className="h-40 border-t border-line bg-bg2">
          <div className="border-b border-line px-3 py-1">
            <Tabs value={bottom} onChange={setBottom} items={[{ value: "connections", label: `Connections (${project.wires.length})` }, { value: "issues", label: `Validation (${issues.length})` }]} />
          </div>
          <div className="h-[calc(100%-34px)] overflow-auto p-2 font-mono text-[11px]">
            {bottom === "connections" &&
              project.wires.map((w) => {
                const a = project.parts.find((p) => p.uid === w.from.part),
                  b = project.parts.find((p) => p.uid === w.to.part);
                return (
                  <button key={w.id} onClick={() => setSelWire(w.id)} className={`flex w-full gap-2 rounded px-2 py-0.5 text-left ${selWire === w.id ? "bg-panel2" : "hover:bg-panel"}`}>
                    <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ background: WIRE_HEX[w.color] }} />
                    <span>{a?.label}.{w.from.pin}</span>
                    <span className="text-dim">→</span>
                    <span>{b?.label}.{w.to.pin}</span>
                    {w.label && <span className="text-dim">“{w.label}”</span>}
                  </button>
                );
              })}
            {bottom === "issues" && (issues.length ? issues.map((i, n) => <IssueCard key={i.id} issue={i} n={n + 1} onFix={() => useWorkspace.getState().focusIssue(i)} />) : <div className="text-muted">Run VALIDATE MY ROBOT to check the circuit.</div>)}
          </div>
        </div>
      </div>

      <aside className="min-h-0 overflow-auto border-l border-line bg-bg2 p-3 text-sm">
        {selectedWire ? (
          <div className="space-y-3">
            <div className="bf-label">Wire</div>
            <div className="font-mono text-xs">
              {project.parts.find((p) => p.uid === selectedWire.from.part)?.label}.{selectedWire.from.pin} → {project.parts.find((p) => p.uid === selectedWire.to.part)?.label}.{selectedWire.to.pin}
            </div>
            <Field label="Colour">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(WIRE_HEX) as WireColor[]).map((c) => (
                  <button key={c} title={c} onClick={() => updateProject(project.id, (p) => ({ ...p, wires: p.wires.map((w) => (w.id === selectedWire.id ? { ...w, color: c } : w)) }))} className={`h-6 w-6 rounded-full border-2 ${selectedWire.color === c ? "border-white" : "border-transparent"}`} style={{ background: WIRE_HEX[c] }} />
                ))}
              </div>
            </Field>
            <Field label="Label">
              <input className="bf-input" value={selectedWire.label ?? ""} onChange={(e) => updateProject(project.id, (p) => ({ ...p, wires: p.wires.map((w) => (w.id === selectedWire.id ? { ...w, label: e.target.value } : w)) }))} />
            </Field>
            <Button variant="danger" size="sm" onClick={() => { updateProject(project.id, (p) => ({ ...p, wires: p.wires.filter((w) => w.id !== selectedWire.id) })); setSelWire(null); }}>
              <Trash2 size={13} /> Remove connection
            </Button>
            <p className="text-[11px] text-dim">Convention: red = positive supply, black = ground, yellow = signal, blue = communication.</p>
          </div>
        ) : selPart && selComp ? (
          <div className="space-y-2">
            <div className="bf-label">Pin inspector</div>
            <div className="font-display text-base font-semibold">{selPart.label} · {selComp.name}</div>
            <div className="text-[11px] text-dim">Pinout: {selComp.pinoutStatus.replace("-", " ")} · {graph.powered.has(selPart.uid) ? <span className="text-ok">powered</span> : <span className="text-warn">not powered</span>}</div>
            {selComp.options.filter((o) => o.type === "boolean").map((o) => (
              <label key={o.key} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={Boolean(selPart.config[o.key] ?? o.default)} onChange={(e) => updateProject(project.id, (p) => ({ ...p, parts: p.parts.map((x) => (x.uid === selPart.uid ? { ...x, config: { ...x.config, [o.key]: e.target.checked } } : x)) }))} />
                {o.label}
              </label>
            ))}
            <table className="w-full text-[11px]">
              <tbody>
                {selComp.pins.map((pin) => {
                  const net = graph.netOf.get(`${selPart.uid}.${pin.id}`);
                  const peers = net?.members.filter((m) => m.part.uid !== selPart.uid) ?? [];
                  return (
                    <tr key={pin.id} className={`border-b border-line/60 align-top ${focusPins.has(`${selPart.uid}.${pin.id}`) ? "bg-bad/10" : ""}`}>
                      <td className="py-1 pr-2 font-mono" style={{ color: pinColor(pin) }}>{pin.label}</td>
                      <td className="py-1 text-muted">
                        <div>{pinFunctionText(pin)}</div>
                        {peers.length > 0 && <div className="text-text">→ {peers.map((m) => `${m.part.label}.${m.pin.label}`).join(", ")}</div>}
                        {net?.voltage != null && !net.isGround && <div className="text-orange">{net.voltage.toFixed(2)} V</div>}
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
              <li>Click the destination pin to connect it.</li>
              <li>Click a wire to recolour, label or delete it (Delete key).</li>
              <li>Drag a component by its title bar; wheel to zoom; drag the background to pan.</li>
              <li>Hover a pin for its function, voltage range and code pin number.</li>
            </ol>
            <p>Every connection is stored in the circuit graph used by the validator, Code Studio and the simulator.</p>
          </div>
        )}
      </aside>
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
