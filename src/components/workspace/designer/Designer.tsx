"use client";
import { duplicateParts, removeParts } from "@/lib/robot/edit";
import { supportStatus } from "@/lib/components/support";
import { useBench } from "../circuit/BenchPanel";
import { liveParts } from "@/lib/sim/live3d";
import { LiveContext } from "@/components/three/models";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group, Object3D } from "three";
import { Copy, Expand, Move3d, Pause, Play, RotateCw, Shrink, Square, Trash2 } from "lucide-react";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import { useApp } from "@/lib/store/app";
import { useWorkspace } from "@/lib/store/workspace";
import { getComponent, allComponents } from "@/lib/catalogue";
import type { PartInstance, Project } from "@/lib/types";
import { addPart, chassisFrom } from "@/lib/robot/assembly";
import { massSummary, partDims } from "@/lib/mech/geometry";
import { validateMechanics } from "@/lib/mech/validate";
import { ASSEMBLY_ORDER, ChassisMesh, PartMesh, explodeOffset, toThree } from "@/components/three/RobotParts";
import { GENERIC_MODEL_NOTE, modelKeyFor } from "@/lib/models/modelKey";
import { LibraryBrowser } from "@/components/library/LibraryBrowser";
import { Button, Field, SimBadge, Tabs } from "@/components/ui";
import { IssueCard } from "../Validation";
import { DrivetrainPanel, PowerPanel } from "./DrivetrainPanel";
import { isTypingTarget } from "@/lib/keyboard";
import { THEME } from "@/lib/theme";

const MM = 0.001;

function CameraFocus({ target }: { target: [number, number, number] | null }) {
  const controls = useThree((s) => s.controls) as unknown as OrbitImpl | null;
  const camera = useThree((s) => s.camera);
  const goal = useRef<{ t: [number, number, number]; until: number } | null>(null);
  useEffect(() => {
    if (target) goal.current = { t: target, until: performance.now() + 1200 };
  }, [target]);
  useFrame(() => {
    if (!goal.current || !controls) return;
    if (performance.now() > goal.current.until) {
      goal.current = null;
      return;
    }
    const [x, y, z] = goal.current.t;
    controls.target.lerp({ x, y, z } as never, 0.12);
    camera.position.lerp({ x: x + 0.14, y: y + 0.12, z: z + 0.14 } as never, 0.08);
    controls.update();
  });
  return null;
}

function Scene({ project, exploded, mode, onCommit, wheelAngles }: { project: Project; exploded: number; mode: "translate" | "rotate"; onCommit: (uid: string, pos: { x: number; y: number; z: number }, rotZ: number) => void; wheelAngles?: Record<string, number> }) {
  const { selected, select, focus, scanPart } = useWorkspace();
  const errors = useMemo(() => new Set(project.validation?.issues.filter((i) => i.severity === "critical" && i.partUid).map((i) => i.partUid!) ?? []), [project.validation]);
  const parts = project.parts.map((p) => ({ p, c: getComponent(p.componentId)! })).filter((x) => x.c && x.c.functionalityClass !== "C");
  const sel = parts.find((x) => x.p.uid === selected);
  const tcRef = useRef<Object3D>(null);
  const groupRef = useRef<Group>(null);
  const focusPart = focus?.partUid ? project.parts.find((p) => p.uid === focus.partUid) : null;
  const ground = Math.min(-60, ...parts.filter((x) => x.c.kind === "wheel").map((x) => x.p.position.z - partDims(x.p, x.c).x / 2)) * MM;

  return (
    <>
      <color attach="background" args={[THEME.sceneBg]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[0.4, 0.8, 0.3]} intensity={2} castShadow />
      <pointLight position={[-0.4, 0.3, -0.4]} intensity={1.6} color={THEME.fillLight} />
      <group position={[0, -ground, 0]}>
        <group position={[0, exploded * -0.1, 0]} onPointerDown={(e) => { e.stopPropagation(); select(null); }}>
          <ChassisMesh project={project} highlight={focus?.issue?.area === "mechanical" && !focus.partUid} />
        </group>
        {parts.map(({ p, c }) =>
          p.uid === selected && exploded === 0 ? null : (
            <PartMesh key={p.uid} part={p} comp={c} selected={p.uid === selected || p.uid === scanPart} error={errors.has(p.uid) || focus?.partUid === p.uid} offset={explodeOffset(c, p, exploded)} wheelAngle={wheelAngles?.[p.uid] ?? 0} onSelect={(id) => select(id)} />
          ),
        )}
        {sel && exploded === 0 && (
          <TransformControls
            ref={tcRef as never}
            mode={mode}
            showX={mode === "translate"}
            showY
            showZ={mode === "translate"}
            translationSnap={0.002}
            rotationSnap={Math.PI / 12}
            size={0.6}
            position={toThree(sel.p.position)}
            rotation={[0, sel.p.rotation.z, 0]}
            onMouseUp={() => {
              const o = tcRef.current as unknown as { object?: Object3D } | null;
              const obj = o?.object;
              if (!obj) return;
              onCommit(sel.p.uid, { x: obj.position.x / MM, y: -obj.position.z / MM, z: obj.position.y / MM }, obj.rotation.y);
            }}
          >
            <group ref={groupRef}>
              <PartMesh part={{ ...sel.p, position: { x: 0, y: 0, z: 0 }, rotation: { ...sel.p.rotation, z: 0 } }} comp={sel.c} selected />
            </group>
          </TransformControls>
        )}
        <ContactShadows position={[0, ground - 0.0005, 0]} opacity={0.5} scale={0.8} blur={2} far={0.2} />
      </group>
      <Grid position={[0, 0, 0]} args={[2, 2]} cellSize={0.01} sectionSize={0.05} cellColor={THEME.gridMinor} sectionColor={THEME.gridMajor} fadeDistance={1.2} infiniteGrid />
      <OrbitControls makeDefault minDistance={0.08} maxDistance={1.5} target={[0, 0.04, 0]} />
      <CameraFocus target={focusPart ? (() => { const t = toThree(focusPart.position); return [t[0], t[1] - ground, t[2]] as [number, number, number]; })() : null} />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.8} />
      </GizmoHelper>
    </>
  );
}

export default function Designer({ project }: { project: Project }) {
  // live 3D: the same circuit-bench simulation as Circuit Studio (one engine, one loop)
  const bench = useBench(project);
  const live = bench.sim ? liveParts(bench.sim) : null;
  const { updateProject } = useApp();
  const { selected, select, focus } = useWorkspace();
  const [exploded, setExploded] = useState(0);
  const [explodeTarget, setExplodeTarget] = useState(0);
  const [mode, setMode] = useState<"translate" | "rotate">("translate");
  const [bottom, setBottom] = useState<"tree" | "console" | "warnings">("tree");
  const [libOpen, setLibOpen] = useState(true);

  useEffect(() => {
    if (exploded === explodeTarget) return;
    const id = requestAnimationFrame(() => setExploded((e) => (Math.abs(explodeTarget - e) < 0.02 ? explodeTarget : e + (explodeTarget - e) * 0.15)));
    return () => cancelAnimationFrame(id);
  }, [exploded, explodeTarget]);

  const sel = project.parts.find((p) => p.uid === selected);
  const selComp = sel ? getComponent(sel.componentId) : null;
  const mech = useMemo(() => validateMechanics(project, "ENGINEER"), [project]);
  const mass = useMemo(() => massSummary(project), [project]);

  const add = (componentId: string) => {
    const c = getComponent(componentId);
    if (!c || c.functionalityClass === "C") return;
    let created: PartInstance | null = null;
    updateProject(project.id, (p) => {
      const r = addPart(p, componentId);
      created = r.part;
      return r.project;
    });
    if (created) select((created as PartInstance).uid);
  };

  const patchPart = (uidv: string, patch: Partial<PartInstance>) => updateProject(project.id, (p) => ({ ...p, parts: p.parts.map((x) => (x.uid === uidv ? { ...x, ...patch } : x)) }));

  const commit = (uidv: string, pos: { x: number; y: number; z: number }, rotZ: number) => {
    const part = project.parts.find((p) => p.uid === uidv);
    const comp = part && getComponent(part.componentId);
    if (!part || !comp) return;
    let patch: Partial<PartInstance> = { position: { x: round(pos.x), y: round(pos.y), z: round(pos.z) }, rotation: { ...part.rotation, z: rotZ } };
    if (comp.kind === "wheel") {
      // snap onto the nearest motor shaft within 40 mm
      const motors = project.parts.filter((p) => getComponent(p.componentId)?.kind === "dc-motor");
      const near = motors.map((m) => ({ m, d: Math.hypot(m.position.x - pos.x, m.position.y - pos.y, m.position.z - pos.z) })).sort((a, b) => a.d - b.d)[0];
      if (near && near.d < 45) {
        const md = partDims(near.m, getComponent(near.m.componentId)!);
        const wd = partDims(part, comp);
        const side = Math.sign(near.m.position.y) || 1;
        patch = { ...patch, attachedTo: near.m.uid, position: { x: near.m.position.x, y: near.m.position.y + side * (md.y / 2 + wd.y / 2 + 6), z: near.m.position.z }, rotation: { ...part.rotation, z: 0 } };
      } else patch.attachedTo = null;
    }
    patchPart(uidv, patch);
  };

  const remove = (uidv: string) => {
    updateProject(project.id, (p) => removeParts(p, [uidv]));
    select(null);
  };
  const duplicate = (uidv: string) => {
    let created: string[] = [];
    updateProject(project.id, (p) => {
      const r = duplicateParts(p, [uidv]);
      created = r.created;
      return r.project;
    });
    if (created[0]) select(created[0]);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (!selected) return;
      if (e.key === "Delete" || e.key === "Backspace") remove(selected);
      if (e.key.toLowerCase() === "r") setMode("rotate");
      if (e.key.toLowerCase() === "g" || e.key.toLowerCase() === "t") setMode("translate");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate(selected);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const chassisOptions = allComponents().filter((c) => c.kind === "chassis");
  const motors = project.parts.filter((p) => getComponent(p.componentId)?.kind === "dc-motor");
  const ordered = [...project.parts].filter((p) => getComponent(p.componentId)?.functionalityClass !== "C").sort((a, b) => ASSEMBLY_ORDER.indexOf(getComponent(a.componentId)!.kind) - ASSEMBLY_ORDER.indexOf(getComponent(b.componentId)!.kind));

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[auto_1fr_300px]">
      {/* LEFT: library */}
      <aside className={`hidden min-h-0 border-r border-line bg-bg2 md:flex md:flex-col ${libOpen ? "w-[300px]" : "w-10"}`}>
        <button className="border-b border-line px-3 py-2 text-left font-mono text-[10px] tracking-widest text-muted hover:text-text" onClick={() => setLibOpen(!libOpen)}>
          {libOpen ? "◂ COMPONENT LIBRARY" : "▸"}
        </button>
        {libOpen && (
          <div className="min-h-0 flex-1">
            <LibraryBrowser compact onAdd={add} competition={project.competition} />
          </div>
        )}
      </aside>

      {/* CENTRE: canvas + bottom */}
      <div className="flex min-h-0 min-w-0 flex-col">
        <div
          className="relative min-h-0 flex-1"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData("text/component-id");
            if (id) add(id);
          }}
        >
          <Canvas shadows camera={{ position: [0.32, 0.26, 0.32], fov: 40, near: 0.005, far: 20 }} dpr={[1, 2]} onPointerMissed={() => select(null)}>
            <LiveContext.Provider value={live}>
              <Scene project={project} exploded={exploded} mode={mode} onCommit={commit} wheelAngles={bench.wheelAngles} />
            </LiveContext.Provider>
          </Canvas>
          <div className="absolute bottom-3 left-3 flex items-center gap-1" role="toolbar" aria-label="Live simulation">
            {bench.mode === "running" ? (
              <Button size="sm" onClick={bench.pause} title="Pause the live simulation"><Pause size={13} /> Pause</Button>
            ) : (
              <Button size="sm" variant="primary" onClick={bench.run} title="Run your circuit and code: motors, wheels, LEDs, servos and displays move as simulated" data-testid="designer-run"><Play size={13} /> Run live</Button>
            )}
            <Button size="sm" onClick={bench.stop} disabled={bench.mode === "stopped"}><Square size={12} /> Stop</Button>
            <span className="rounded bg-bg/80 px-2 py-0.5 font-mono text-[10px] text-muted">{bench.mode === "running" ? `LIVE · ${bench.sim?.state.t.toFixed(1)} s · same simulation as Circuit Studio` : bench.mode === "paused" ? "PAUSED" : "3D shows the design; press Run live to animate it from the circuit simulation"}</span>
          </div>
          <div className="absolute left-3 top-3 flex gap-1">
            <Button size="sm" variant={mode === "translate" ? "secondary" : "outline"} onClick={() => setMode("translate")} title="Move (G)"><Move3d size={14} /> Move</Button>
            <Button size="sm" variant={mode === "rotate" ? "secondary" : "outline"} onClick={() => setMode("rotate")} title="Rotate (R)"><RotateCw size={14} /> Rotate</Button>
            <Button size="sm" variant={explodeTarget ? "primary" : "outline"} onClick={() => { setExplodeTarget(explodeTarget ? 0 : 1); select(null); }}>
              {explodeTarget ? <Shrink size={14} /> : <Expand size={14} />} {explodeTarget ? "RESTORE ROBOT" : "EXPLODED VIEW"}
            </Button>
          </div>
          {explodeTarget > 0 && (
            <div className="bf-panel absolute right-3 top-3 w-56 p-3 text-xs">
              <div className="bf-label mb-1 text-accent-ink">Assembly order</div>
              <ol className="list-decimal space-y-0.5 pl-4 text-muted">
                <li>Chassis plate ({project.chassis?.material})</li>
                {ordered.map((p) => (
                  <li key={p.uid}>{p.label} — {getComponent(p.componentId)?.name}</li>
                ))}
              </ol>
            </div>
          )}
          <div className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] text-dim">
            DRAG = ORBIT · RIGHT-DRAG = PAN · CLICK PART = SELECT · DROP FROM LIBRARY = ADD · PROCEDURAL MODELS FROM PART DIMENSIONS
          </div>
          {focus?.issue && focus.issue.area === "mechanical" && (
            <div className="absolute bottom-10 left-1/2 w-[min(560px,90%)] -translate-x-1/2">
              <IssueCard issue={focus.issue} n={1} />
            </div>
          )}
        </div>
        <div className="h-48 border-t border-line bg-bg2">
          <div className="flex items-center gap-3 border-b border-line px-3 py-1">
            <Tabs value={bottom} onChange={setBottom} items={[{ value: "tree", label: "Assembly tree" }, { value: "console", label: "Console" }, { value: "warnings", label: `Warnings (${mech.issues.length})` }]} />
          </div>
          <div className="h-[calc(100%-36px)] overflow-auto p-2 text-xs">
            {bottom === "tree" && (
              <ul className="space-y-0.5">
                <li className="text-muted">▾ Chassis — {project.chassis ? `${getComponent(project.chassis.componentId)?.name} (${project.chassis.length_mm}×${project.chassis.width_mm}×${project.chassis.thickness_mm} mm ${project.chassis.material})` : "none"}</li>
                {ordered.map((p) => {
                  const c = getComponent(p.componentId)!;
                  const att = p.attachedTo ? project.parts.find((x) => x.uid === p.attachedTo)?.label : null;
                  return (
                    <li key={p.uid}>
                      <button onClick={() => select(p.uid)} className={`flex w-full items-center gap-2 rounded px-2 py-0.5 text-left ${selected === p.uid ? "bg-accent/15 text-accent-ink" : "hover:bg-panel"}`}>
                        <span className="w-28 truncate font-mono">{p.label}</span>
                        <span className="flex-1 truncate text-muted">{c.name}{att ? ` → on ${att} shaft` : ""}</span>
                        <SimBadge status={supportStatus(c)} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {bottom === "console" && (
              <div className="space-y-1 font-mono text-muted">
                <div>Total mass: <span className="text-text">{mass.totalG.toFixed(0)} g</span>{mass.estimatedParts.length ? ` (estimated for ${mass.estimatedParts.length} parts)` : ""}</div>
                <div>Centre of mass: x={mass.com.x.toFixed(1)} mm, y={mass.com.y.toFixed(1)} mm, z={mass.com.z.toFixed(1)} mm</div>
                <div>Parts: {project.parts.length} · wheels attached: {project.parts.filter((p) => p.attachedTo).length}</div>
                <div>Mechanical checks run: {mech.checks}</div>
              </div>
            )}
            {bottom === "warnings" && (mech.issues.length ? <div className="space-y-1">{mech.issues.map((i, n) => <IssueCard key={n} issue={{ ...i, id: String(n) }} n={n + 1} onFix={() => useWorkspace.getState().focusIssue({ ...i, id: String(n) })} />)}</div> : <div className="text-ok">No mechanical problems detected.</div>)}
          </div>
        </div>
      </div>

      {/* RIGHT: properties */}
      <aside className="min-h-0 overflow-auto border-l border-line bg-bg2 p-3">
        {sel && selComp ? (
          <div className="space-y-3 text-sm">
            <div>
              <div className="bf-label">Selected part</div>
              <div className="font-display text-lg font-semibold">{selComp.name}</div>
              <SimBadge status={supportStatus(selComp)} full />
              {(() => {
                const m = modelKeyFor(selComp);
                return <div className="mt-1 text-[11px] text-dim" data-testid="model-label">{m.exact ? `3D model: ${m.label}` : GENERIC_MODEL_NOTE}</div>;
              })()}
            </div>
            <Field label="Label">
              <input className="bf-input" value={sel.label} onChange={(e) => patchPart(sel.uid, { label: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              {(["x", "y", "z"] as const).map((k) => (
                <Field key={k} label={`${k} (mm)`}>
                  <input className="bf-input" type="number" step={1} value={Math.round(sel.position[k] * 10) / 10} onChange={(e) => patchPart(sel.uid, { position: { ...sel.position, [k]: Number(e.target.value) } })} />
                </Field>
              ))}
            </div>
            <Field label="Rotation (yaw, degrees)">
              <input className="bf-input" type="number" step={15} value={Math.round((sel.rotation.z * 180) / Math.PI)} onChange={(e) => patchPart(sel.uid, { rotation: { ...sel.rotation, z: (Number(e.target.value) * Math.PI) / 180 } })} />
            </Field>
            {selComp.kind === "wheel" && (
              <Field label="Attach to motor shaft">
                <select className="bf-input" value={sel.attachedTo ?? ""} onChange={(e) => {
                  const m = project.parts.find((p) => p.uid === e.target.value);
                  if (!m) return patchPart(sel.uid, { attachedTo: null });
                  const md = partDims(m, getComponent(m.componentId)!);
                  const wd = partDims(sel, selComp);
                  const side = Math.sign(m.position.y) || 1;
                  patchPart(sel.uid, { attachedTo: m.uid, position: { x: m.position.x, y: m.position.y + side * (md.y / 2 + wd.y / 2 + 6), z: m.position.z } });
                }}>
                  <option value="">— not attached —</option>
                  {motors.map((m) => <option key={m.uid} value={m.uid}>{m.label}</option>)}
                </select>
              </Field>
            )}
            {selComp.options.map((o) => (
              <Field key={o.key} label={`${o.label}${o.unit ? ` (${o.unit})` : ""}`} hint={o.help}>
                {o.type === "boolean" ? (
                  <input type="checkbox" checked={Boolean(sel.config[o.key] ?? o.default)} onChange={(e) => patchPart(sel.uid, { config: { ...sel.config, [o.key]: e.target.checked } })} />
                ) : o.type === "select" ? (
                  <select className="bf-input" value={String(sel.config[o.key] ?? o.default)} onChange={(e) => patchPart(sel.uid, { config: { ...sel.config, [o.key]: e.target.value } })}>
                    {o.choices?.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                ) : (
                  <input className="bf-input" type="number" min={o.min} max={o.max} step={o.step} value={Number(sel.config[o.key] ?? o.default)} onChange={(e) => patchPart(sel.uid, { config: { ...sel.config, [o.key]: Number(e.target.value) } })} />
                )}
              </Field>
            ))}
            {selComp.functionalityClass === "A" && selComp.pins.length > 0 && (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={sel.inCircuit} onChange={(e) => patchPart(sel.uid, { inCircuit: e.target.checked })} /> Show in Circuit Studio
              </label>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => duplicate(sel.uid)}><Copy size={13} /> Duplicate</Button>
              <Button size="sm" variant="danger" onClick={() => remove(sel.uid)}><Trash2 size={13} /> Delete</Button>
            </div>
            <div className="text-[11px] text-dim">{selComp.description}</div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="bf-label">Chassis builder</div>
            <Field label="Chassis type">
              <select className="bf-input" value={project.chassis?.componentId ?? ""} onChange={(e) => updateProject(project.id, (p) => ({ ...p, chassis: { ...chassisFrom(e.target.value), mountingHoles: p.chassis?.mountingHoles ?? [] } }))}>
                {chassisOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            {project.chassis && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {([["length_mm", "Length"], ["width_mm", "Width"], ["thickness_mm", "Thickness"]] as const).map(([k, l]) => (
                    <Field key={k} label={`${l} mm`}>
                      <input className="bf-input" type="number" min={k === "thickness_mm" ? 0.5 : 20} max={600} value={project.chassis![k]} onChange={(e) => updateProject(project.id, (p) => ({ ...p, chassis: { ...p.chassis!, [k]: Math.max(0.5, Number(e.target.value)) } }))} />
                    </Field>
                  ))}
                </div>
                <Field label="Material">
                  <select className="bf-input" value={project.chassis.material} onChange={(e) => updateProject(project.id, (p) => ({ ...p, chassis: { ...p.chassis!, material: e.target.value } }))}>
                    {["Acrylic", "Aluminium", "Steel", "Stainless steel", "Carbon fibre", "ABS", "PLA", "PETG", "Nylon", "Polycarbonate", "FR4"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <div className="text-xs text-muted">Mounting holes: {project.chassis.mountingHoles.length}</div>
                <Button size="sm" onClick={() => updateProject(project.id, (p) => {
                  const ch = p.chassis!;
                  const holes = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: sx * (ch.length_mm / 2 - 6), y: sy * (ch.width_mm / 2 - 6) })));
                  return { ...p, chassis: { ...ch, mountingHoles: holes } };
                })}>Add M3 corner mounting holes</Button>
              </>
            )}
            <DrivetrainPanel project={project} />
            <PowerPanel project={project} />
            <div className="border-t border-line pt-3">
              <div className="bf-label mb-1">Quick add</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[["Motor bracket", "motor-mounting-brackets"], ["Sensor bracket", "sensor-mounting-brackets"], ["Battery holder", "battery-mounting-holder"], ["Standoff", "aluminium-standoffs"], ["Front wedge", "front-wedge"]].map(([l, id]) => (
                  <Button key={id} size="sm" variant="ghost" className="justify-start border border-line" onClick={() => add(id)}>+ {l}</Button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-dim">Select a part in the scene or assembly tree to edit it. Use the library on the left to add motors, wheels, electronics and sensors — wheels snap onto the nearest free motor shaft.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

const round = (v: number) => Math.round(v * 10) / 10;
