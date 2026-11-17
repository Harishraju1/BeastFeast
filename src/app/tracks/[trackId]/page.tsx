"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, FileUp, Minus, Plus, Redo2, RotateCw, Save, Trash2, Undo2 } from "lucide-react";
import { RequireAuth } from "@/components/shell/AppShell";
import { Badge, Button, Field, Tabs } from "@/components/ui";
import { useApp } from "@/lib/store/app";
import type { TrackDef, TrackPiece, TrackPieceType, Vec2 } from "@/lib/sim/types";
import { compileTrack, pieceEndpoints, pieceWorldPolylines } from "@/lib/track/compile";
import { uid } from "@/lib/robot/assembly";
import { THEME } from "@/lib/theme";

const Preview3D = dynamic(() => import("@/components/three/TrackPreview3D"), { ssr: false });

const TOOLS: Record<TrackDef["kind"], { type: TrackPieceType; label: string; params: TrackPiece["params"] }[]> = {
  race: [
    { type: "straight", label: "Straight", params: { length: 0.8, width: 0.35 } },
    { type: "curve", label: "Curve", params: { radius: 0.6, angle: Math.PI / 2, width: 0.35 } },
    { type: "s-curve", label: "S-curve", params: { radius: 0.5, angle: Math.PI / 4, width: 0.35 } },
    { type: "sharp-turn", label: "Sharp turn", params: { length: 0.4, angle: Math.PI / 2, width: 0.35 } },
    { type: "ramp", label: "Ramp", params: { length: 0.5, width: 0.35, slopeDeg: 8 } },
    { type: "obstacle", label: "Obstacle", params: { width: 0.12, depth: 0.12, shape: "box" } },
    { type: "checkpoint", label: "Checkpoint", params: { width: 0.45 } },
    { type: "start", label: "Start line", params: { width: 0.45 } },
    { type: "finish", label: "Finish line", params: { width: 0.45 } },
  ],
  line: [
    { type: "line-straight", label: "Straight line", params: { length: 0.6, lineWidth: 0.019 } },
    { type: "line-curve", label: "Curve", params: { radius: 0.4, angle: Math.PI / 2, lineWidth: 0.019 } },
    { type: "line-sharp", label: "Sharp turn", params: { length: 0.3, angle: Math.PI / 2, lineWidth: 0.019 } },
    { type: "intersection", label: "Intersection", params: { length: 0.4, lineWidth: 0.019 } },
    { type: "loop", label: "Loop", params: { radius: 0.25, lineWidth: 0.019 } },
    { type: "branch", label: "Branch", params: { length: 0.6, angle: Math.PI / 6, lineWidth: 0.019 } },
    { type: "line-free", label: "Free draw", params: { lineWidth: 0.019, points: [] } },
    { type: "checkpoint", label: "Checkpoint", params: { width: 0.3 } },
    { type: "obstacle", label: "Obstacle", params: { width: 0.08, depth: 0.08, shape: "box" } },
  ],
  sumo: [{ type: "obstacle", label: "Obstacle", params: { width: 0.08, depth: 0.08, shape: "cylinder" } }],
};

function Editor() {
  const { trackId } = useParams<{ trackId: string }>();
  const projectId = useSearchParams().get("project");
  const { tracks, saveTrack, toast } = useApp();
  const stored = tracks.find((t) => t.id === trackId);
  const [def, setDef] = useState<TrackDef | null>(stored ? structuredClone(stored) : null);
  const [past, setPast] = useState<TrackDef[]>([]);
  const [future, setFuture] = useState<TrackDef[]>([]);
  const [tool, setTool] = useState<number | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 160 }); // px per metre
  const [drag, setDrag] = useState<{ kind: "pan" | "piece" | "start"; id?: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [freePts, setFreePts] = useState<Vec2[] | null>(null);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [dirty, setDirty] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/reset local UI state when its source changes
    if (!def && stored) setDef(structuredClone(stored));
  }, [stored, def]);
  useEffect(() => {
    const r = svg.current?.getBoundingClientRect();
    if (r && def) setView({ k: Math.min(r.width / (def.size.w + 0.4), r.height / (def.size.h + 0.4)), x: r.width / 2, y: r.height / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def?.id, mode]);

  const compiled = useMemo(() => (def ? safeCompile(def) : null), [def]);
  if (!def) return <div className="p-8 text-muted">Track not found. <Link className="text-accent-ink" href="/tracks">Back</Link></div>;
  const tools = TOOLS[def.kind];

  const change = (fn: (d: TrackDef) => TrackDef) => {
    setPast((p) => [...p.slice(-60), def]);
    setFuture([]);
    setDef(fn(def));
    setDirty(true);
  };
  const undo = () => past.length && (setFuture([def, ...future]), setDef(past[past.length - 1]), setPast(past.slice(0, -1)));
  const redo = () => future.length && (setPast([...past, def]), setDef(future[0]), setFuture(future.slice(1)));
  const save = async () => {
    await saveTrack({ ...def, updatedAt: new Date().toISOString() });
    setDirty(false);
    toast("success", "Track saved");
  };

  const toWorld = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: -(cy - r.top - view.y) / view.k };
  };
  const sx = (x: number) => view.x + x * view.k;
  const sy = (y: number) => view.y - y * view.k;
  const pts = (p: Vec2[]) => p.map((q) => `${sx(q.x)},${sy(q.y)}`).join(" ");

  /** snap a new piece's origin to the nearest free path endpoint (and align its heading) */
  const snapPlace = (w: Vec2, type: TrackPieceType) => {
    let best: { x: number; y: number; heading: number; d: number } | null = null;
    for (const p of def.pieces) {
      const ep = pieceEndpoints(p);
      if (!ep) continue;
      const d = Math.hypot(ep.end.x - w.x, ep.end.y - w.y);
      if (d < 0.15 && (!best || d < best.d)) best = { ...ep.end, d };
    }
    const pathy = !["obstacle", "checkpoint", "start", "finish"].includes(type);
    return best && pathy ? { x: best.x, y: best.y, rotation: best.heading } : { x: round(w.x), y: round(w.y), rotation: 0 };
  };

  const selPiece = def.pieces.find((p) => p.id === sel);
  const setParam = (k: keyof TrackPiece["params"], v: number | string) => change((d) => ({ ...d, pieces: d.pieces.map((p) => (p.id === sel ? { ...p, params: { ...p.params, [k]: v } } : p)) }));

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-bg2 px-3 py-1.5">
        <Link href="/tracks" className="text-xs text-muted hover:text-text">← Tracks</Link>
        <input className="bf-input !w-56 !py-1" value={def.name} onChange={(e) => change((d) => ({ ...d, name: e.target.value }))} aria-label="Track name" />
        <Badge tone="brand">{def.kind}</Badge>
        <select className="bf-input !w-auto !py-1 text-xs" value={def.difficulty} onChange={(e) => change((d) => ({ ...d, difficulty: e.target.value as TrackDef["difficulty"] }))} aria-label="Difficulty">
          {["beginner", "intermediate", "advanced", "beast"].map((x) => <option key={x} value={x}>{x === "beast" ? "BEAST MODE" : x.toUpperCase()}</option>)}
        </select>
        <Button size="sm" variant="ghost" disabled={!past.length} onClick={undo}><Undo2 size={14} /></Button>
        <Button size="sm" variant="ghost" disabled={!future.length} onClick={redo}><Redo2 size={14} /></Button>
        <Button size="sm" variant="ghost" onClick={() => setView({ ...view, k: view.k * 1.2 })}><Plus size={14} /></Button>
        <Button size="sm" variant="ghost" onClick={() => setView({ ...view, k: view.k / 1.2 })}><Minus size={14} /></Button>
        <Tabs value={mode} onChange={setMode} items={[{ value: "2d", label: "Plan (edit)" }, { value: "3d", label: "3D preview" }]} />
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(def, null, 2)], { type: "application/json" })); a.download = `${def.name.replace(/\W+/g, "_")}.track.json`; a.click(); }}><Download size={13} /> Export</Button>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-line2 px-2.5 py-1 text-xs hover:border-brand"><FileUp size={13} /> Import
            <input type="file" accept=".json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const t = JSON.parse(await f.text()) as TrackDef; if (!t.pieces || !t.kind) throw new Error(); change(() => ({ ...t, id: def.id, ownerId: def.ownerId })); } catch { toast("error", "Not a valid track file"); } }} />
          </label>
          <Button size="sm" variant="primary" onClick={() => void save()}><Save size={13} /> {dirty ? "Save*" : "Saved"}</Button>
          {projectId && <Link href={`/workspace/${projectId}/arena`} className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-on-brand">Test in arena →</Link>}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[200px_1fr_270px]">
        <aside className="space-y-1 overflow-auto border-r border-line bg-bg2 p-2">
          <div className="bf-label mb-1">{def.kind} tools</div>
          {tools.map((t, i) => (
            <button key={t.type + i} onClick={() => { setTool(tool === i ? null : i); setFreePts(t.type === "line-free" ? [] : null); }} className={`block w-full rounded px-2 py-1.5 text-left text-sm ${tool === i ? "bg-accent text-black" : "text-muted hover:bg-panel hover:text-text"}`}>{t.label}</button>
          ))}
          <button onClick={() => setTool(-1)} className={`block w-full rounded px-2 py-1.5 text-left text-sm ${tool === -1 ? "bg-ok text-white" : "text-muted hover:bg-panel"}`}>Set start position</button>
          <p className="pt-2 text-[11px] text-dim">Pick a tool, then click on the plan. Path pieces snap to the end of the nearest piece. Drag to move, R to rotate 15°, Del to delete. Free draw: click points, double-click to finish.</p>
        </aside>
        <div className="relative min-h-0">
          {mode === "3d" && compiled ? <Preview3D track={compiled} /> : (
            <svg
              ref={svg}
              className="h-full w-full touch-none select-none"
              style={{ background: THEME.sceneBg }}
              onWheel={(e) => { const k = Math.max(30, Math.min(800, view.k * (e.deltaY < 0 ? 1.1 : 0.9))); const r = svg.current!.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; setView({ k, x: mx - ((mx - view.x) / view.k) * k, y: my - ((my - view.y) / view.k) * k }); }}
              onDoubleClick={() => { if (freePts && freePts.length > 1) { const t = tools[tool!]; change((d) => ({ ...d, pieces: [...d.pieces, { id: uid("pc"), type: "line-free", x: 0, y: 0, rotation: 0, params: { ...t.params, points: freePts } }] })); setFreePts([]); } }}
              onPointerDown={(e) => {
                const w = toWorld(e.clientX, e.clientY);
                if (tool === -1) { change((d) => ({ ...d, start: { ...d.start, x: round(w.x), y: round(w.y) } })); setTool(null); return; }
                if (tool !== null && tool >= 0) {
                  const t = tools[tool];
                  if (t.type === "line-free") { setFreePts([...(freePts ?? []), { x: round(w.x), y: round(w.y) }]); return; }
                  const place = snapPlace(w, t.type);
                  const piece: TrackPiece = { id: uid("pc"), type: t.type, ...place, params: structuredClone(t.params) };
                  change((d) => ({ ...d, pieces: [...d.pieces, piece] }));
                  setSel(piece.id);
                  return;
                }
                setSel(null);
                setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y });
              }}
              onPointerMove={(e) => {
                if (!drag) return;
                if (drag.kind === "pan") setView({ ...view, x: drag.ox + e.clientX - drag.sx, y: drag.oy + e.clientY - drag.sy });
                else {
                  const dx = (e.clientX - drag.sx) / view.k, dy = -(e.clientY - drag.sy) / view.k;
                  if (drag.kind === "piece") setDef({ ...def, pieces: def.pieces.map((p) => (p.id === drag.id ? { ...p, x: round(drag.ox + dx), y: round(drag.oy + dy) } : p)) });
                  else setDef({ ...def, start: { ...def.start, x: round(drag.ox + dx), y: round(drag.oy + dy) } });
                  setDirty(true);
                }
              }}
              onPointerUp={() => setDrag(null)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (!selPiece) return;
                if (e.key === "Delete" || e.key === "Backspace") { change((d) => ({ ...d, pieces: d.pieces.filter((p) => p.id !== sel) })); setSel(null); }
                if (e.key.toLowerCase() === "r") change((d) => ({ ...d, pieces: d.pieces.map((p) => (p.id === sel ? { ...p, rotation: p.rotation + (e.shiftKey ? -1 : 1) * (Math.PI / 12) } : p)) }));
              }}
            >
              {/* floor */}
              <rect x={sx(-def.size.w / 2)} y={sy(def.size.h / 2)} width={def.size.w * view.k} height={def.size.h * view.k} fill={def.kind === "line" ? "#fbfbf8" : THEME.sageDeeper} stroke={THEME.hairline2} />
              {/* metre grid */}
              {Array.from({ length: Math.ceil(def.size.w * 10) + 1 }, (_, i) => -def.size.w / 2 + i * 0.1).map((x) => <line key={`gx${x}`} x1={sx(x)} x2={sx(x)} y1={sy(def.size.h / 2)} y2={sy(-def.size.h / 2)} stroke={def.kind === "line" ? "#e5e5e0" : "rgba(241,238,227,0.05)"} />)}
              {compiled?.arena?.shape === "circle" && <><circle cx={sx(0)} cy={sy(0)} r={compiled.arena.radius! * view.k} fill="#f4f4f4" /><circle cx={sx(0)} cy={sy(0)} r={(compiled.arena.radius! - compiled.arena.border) * view.k} fill="#0b0b0b" /></>}
              {compiled?.roads.map((r, i) => <polyline key={`r${i}`} points={pts(r.points)} fill="none" stroke={def.surface.color} strokeWidth={r.width * view.k} strokeLinejoin="round" />)}
              {compiled?.lines.map((l, i) => <polyline key={`l${i}`} points={pts(l.points)} fill="none" stroke="#111" strokeWidth={Math.max(1.5, l.width * view.k)} strokeLinejoin="round" />)}
              {compiled?.ramps.map((r, i) => <polygon key={`ra${i}`} points={pts(r.polygon)} fill="#8E9A9088" stroke="#B9BEB2" />)}
              {compiled?.obstacles.map((o, i) => o.kind === "box" ? <rect key={`o${i}`} x={sx(o.cx) - (o.w * view.k) / 2} y={sy(o.cy) - (o.h * view.k) / 2} width={o.w * view.k} height={o.h * view.k} fill={THEME.accent} transform={`rotate(${(-o.rotation * 180) / Math.PI} ${sx(o.cx)} ${sy(o.cy)})`} /> : <circle key={`o${i}`} cx={sx(o.cx)} cy={sy(o.cy)} r={o.r * view.k} fill={THEME.accent} />)}
              {compiled?.checkpoints.map((c) => <line key={`c${c.index}`} x1={sx(c.seg.a.x)} y1={sy(c.seg.a.y)} x2={sx(c.seg.b.x)} y2={sy(c.seg.b.y)} stroke={THEME.warn} strokeWidth={3} strokeDasharray="6 4" />)}
              {compiled?.startLine && <line x1={sx(compiled.startLine.a.x)} y1={sy(compiled.startLine.a.y)} x2={sx(compiled.startLine.b.x)} y2={sy(compiled.startLine.b.y)} stroke={THEME.ok} strokeWidth={4} />}
              {compiled?.finishLine && <line x1={sx(compiled.finishLine.a.x)} y1={sy(compiled.finishLine.a.y)} x2={sx(compiled.finishLine.b.x)} y2={sy(compiled.finishLine.b.y)} stroke="#fff" strokeWidth={4} strokeDasharray="4 4" />}
              {/* hit areas */}
              {def.pieces.map((p) => {
                const polys = pieceWorldPolylines(p);
                const isSel = sel === p.id;
                const hit = polys.length ? polys : [[{ x: p.x - 0.05, y: p.y }, { x: p.x + 0.05, y: p.y }]];
                return (
                  <g key={p.id} onPointerDown={(e) => { if (tool !== null) return; e.stopPropagation(); setSel(p.id); setPast((h) => [...h.slice(-60), def]); setDrag({ kind: "piece", id: p.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y }); }} className="cursor-move">
                    {hit.map((pl, i) => <polyline key={i} points={pts(pl)} fill="none" stroke={isSel ? THEME.accent : "transparent"} strokeOpacity={isSel ? 0.5 : 0} strokeWidth={Math.max(14, 0.06 * view.k)} />)}
                    <circle cx={sx(p.x)} cy={sy(p.y)} r={isSel ? 6 : 4} fill={isSel ? THEME.accent : THEME.warn} />
                  </g>
                );
              })}
              {freePts && freePts.length > 0 && <polyline points={pts(freePts)} fill="none" stroke={THEME.accent} strokeWidth={3} strokeDasharray="5 4" />}
              {/* start pose */}
              <g onPointerDown={(e) => { e.stopPropagation(); setPast((h) => [...h.slice(-60), def]); setDrag({ kind: "start", sx: e.clientX, sy: e.clientY, ox: def.start.x, oy: def.start.y }); }} className="cursor-move">
                <circle cx={sx(def.start.x)} cy={sy(def.start.y)} r={9} fill={THEME.ok} />
                <line x1={sx(def.start.x)} y1={sy(def.start.y)} x2={sx(def.start.x + Math.cos(def.start.heading) * 0.12)} y2={sy(def.start.y + Math.sin(def.start.heading) * 0.12)} stroke={THEME.ok} strokeWidth={3} />
                <text x={sx(def.start.x) + 12} y={sy(def.start.y) - 10} fill={THEME.ok} fontSize={11} fontFamily="JetBrains Mono">START</text>
              </g>
            </svg>
          )}
          {compiled === null && <div className="absolute left-3 top-3 rounded bg-bad/20 px-2 py-1 text-xs text-bad">This track has invalid geometry.</div>}
        </div>
        <aside className="space-y-3 overflow-auto border-l border-line bg-bg2 p-3 text-sm">
          {selPiece ? (
            <>
              <div className="bf-label">Piece · {selPiece.type}</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="x (m)"><input className="bf-input" type="number" step={0.01} value={selPiece.x} onChange={(e) => change((d) => ({ ...d, pieces: d.pieces.map((p) => (p.id === sel ? { ...p, x: Number(e.target.value) } : p)) }))} /></Field>
                <Field label="y (m)"><input className="bf-input" type="number" step={0.01} value={selPiece.y} onChange={(e) => change((d) => ({ ...d, pieces: d.pieces.map((p) => (p.id === sel ? { ...p, y: Number(e.target.value) } : p)) }))} /></Field>
              </div>
              <Field label="Rotation (°)"><input className="bf-input" type="number" step={15} value={Math.round((selPiece.rotation * 180) / Math.PI)} onChange={(e) => change((d) => ({ ...d, pieces: d.pieces.map((p) => (p.id === sel ? { ...p, rotation: (Number(e.target.value) * Math.PI) / 180 } : p)) }))} /></Field>
              {(["length", "radius", "width", "depth", "lineWidth", "slopeDeg"] as const).filter((k) => selPiece.params[k] !== undefined).map((k) => (
                <Field key={k} label={k === "lineWidth" ? "Line thickness (m)" : k === "slopeDeg" ? "Slope (°)" : `${k} (m)`}>
                  <input className="bf-input" type="number" step={k === "slopeDeg" ? 1 : k === "lineWidth" ? 0.001 : 0.01} min={0} value={selPiece.params[k] as number} onChange={(e) => setParam(k, Number(e.target.value))} />
                </Field>
              ))}
              {selPiece.params.angle !== undefined && <Field label="Angle (°, + = left)"><input className="bf-input" type="number" step={15} value={Math.round((selPiece.params.angle * 180) / Math.PI)} onChange={(e) => setParam("angle", (Number(e.target.value) * Math.PI) / 180)} /></Field>}
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => change((d) => ({ ...d, pieces: d.pieces.map((p) => (p.id === sel ? { ...p, rotation: p.rotation + Math.PI / 12 } : p)) }))}><RotateCw size={13} /> 15°</Button>
                <Button size="sm" onClick={() => { const c = { ...structuredClone(selPiece), id: uid("pc"), x: selPiece.x + 0.1, y: selPiece.y - 0.1 }; change((d) => ({ ...d, pieces: [...d.pieces, c] })); setSel(c.id); }}><Copy size={13} /> Duplicate</Button>
                <Button size="sm" variant="danger" onClick={() => { change((d) => ({ ...d, pieces: d.pieces.filter((p) => p.id !== sel) })); setSel(null); }}><Trash2 size={13} /></Button>
              </div>
            </>
          ) : (
            <>
              <div className="bf-label">Track settings</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Floor width (m)"><input className="bf-input" type="number" step={0.1} min={0.5} value={def.size.w} onChange={(e) => change((d) => ({ ...d, size: { ...d.size, w: Number(e.target.value) } }))} /></Field>
                <Field label="Floor depth (m)"><input className="bf-input" type="number" step={0.1} min={0.5} value={def.size.h} onChange={(e) => change((d) => ({ ...d, size: { ...d.size, h: Number(e.target.value) } }))} /></Field>
              </div>
              <Field label="Surface friction μ" hint="1.0 = typical; 0.5 = slippery"><input className="bf-input" type="number" step={0.05} min={0.1} max={2} value={def.surface.mu} onChange={(e) => change((d) => ({ ...d, surface: { ...d.surface, mu: Number(e.target.value) } }))} /></Field>
              {def.kind === "race" && <Field label="Road colour"><input type="color" value={def.surface.color} onChange={(e) => change((d) => ({ ...d, surface: { ...d.surface, color: e.target.value } }))} /></Field>}
              {def.kind !== "sumo" && <Field label="Laps"><input className="bf-input" type="number" min={1} max={10} value={def.laps ?? 1} onChange={(e) => change((d) => ({ ...d, laps: Number(e.target.value) }))} /></Field>}
              <Field label="Start heading (°)"><input className="bf-input" type="number" step={15} value={Math.round((def.start.heading * 180) / Math.PI)} onChange={(e) => change((d) => ({ ...d, start: { ...d.start, heading: (Number(e.target.value) * Math.PI) / 180 } }))} /></Field>
              {def.kind === "sumo" && def.arena && (
                <>
                  <Field label="Arena shape"><select className="bf-input" value={def.arena.shape} onChange={(e) => change((d) => ({ ...d, arena: { ...d.arena!, shape: e.target.value as "circle" | "rect", w: d.arena!.w ?? 1.2, h: d.arena!.h ?? 0.8 } }))}><option value="circle">Circular dohyo</option><option value="rect">Rectangular</option></select></Field>
                  {def.arena.shape === "circle" ? <Field label="Radius (m)"><input className="bf-input" type="number" step={0.005} value={def.arena.radius} onChange={(e) => change((d) => ({ ...d, arena: { ...d.arena!, radius: Number(e.target.value) } }))} /></Field> : (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Width (m)"><input className="bf-input" type="number" step={0.05} value={def.arena.w} onChange={(e) => change((d) => ({ ...d, arena: { ...d.arena!, w: Number(e.target.value) } }))} /></Field>
                      <Field label="Depth (m)"><input className="bf-input" type="number" step={0.05} value={def.arena.h} onChange={(e) => change((d) => ({ ...d, arena: { ...d.arena!, h: Number(e.target.value) } }))} /></Field>
                    </div>
                  )}
                  <Field label="Border (m)"><input className="bf-input" type="number" step={0.005} value={def.arena.border} onChange={(e) => change((d) => ({ ...d, arena: { ...d.arena!, border: Number(e.target.value) } }))} /></Field>
                  <Field label="Match time (s)"><input className="bf-input" type="number" step={10} value={def.arena.timeLimitS} onChange={(e) => change((d) => ({ ...d, arena: { ...d.arena!, timeLimitS: Number(e.target.value) } }))} /></Field>
                </>
              )}
              <div className="text-xs text-muted">{def.pieces.length} pieces · {compiled ? `${compiled.roads.length} roads, ${compiled.lines.length} lines, ${compiled.checkpoints.length} checkpoints` : "invalid"}</div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function safeCompile(def: TrackDef) {
  try {
    return compileTrack(def);
  } catch {
    return null;
  }
}
const round = (v: number) => Math.round(v * 1000) / 1000;

export default function TrackEditorPage() {
  return (
    <RequireAuth>
      <Suspense>
        <Editor />
      </Suspense>
    </RequireAuth>
  );
}
