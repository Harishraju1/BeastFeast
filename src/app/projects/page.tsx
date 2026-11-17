"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Copy, Gauge, Pencil, Route, Swords, Trash2 } from "lucide-react";
import { RequireAuth } from "@/components/shell/AppShell";
import { Badge, Button, Empty, Field, Modal, PageHeader } from "@/components/ui";
import { useApp } from "@/lib/store/app";
import { COMPETITIONS, type CompetitionId, type Project } from "@/lib/types";
import { newProject, uid } from "@/lib/robot/assembly";
import { reference2WD, referenceLineFollower, referenceSumo } from "@/lib/robot/reference";

const CARDS: { id: CompetitionId; icon: typeof Gauge; color: string; desc: string; features: string[] }[] = [
  { id: "race", icon: Gauge, color: "accent", desc: "Build a high-performance robot car capable of navigating racing tracks.", features: ["2WD & 4WD designs", "Motor, wheel & driver selection", "Speed & turning mechanics", "Custom tracks & lap timing", "Keyboard control", "Obstacle simulation"] },
  { id: "line", icon: Route, color: "brand", desc: "Build an autonomous robot that detects and follows a line using reflectance sensors.", features: ["TCRT5000 & QTR arrays", "Analog & digital sensors", "Calibration & PID", "Real-time sensor view", "Track configuration", "Speed optimisation"] },
  { id: "sumo", icon: Swords, color: "red", desc: "Build an intelligent robot that detects, attacks and pushes an opponent out of the arena.", features: ["Sumo chassis & wedge", "Torque & high-grip wheels", "Opponent & edge detection", "Ultrasonic, Sharp IR, bumpers", "Attack & defence algorithms", "AI opponents"] },
];

function ProjectsInner() {
  const { user, projects, createProject, deleteProject, duplicateProject, updateProject } = useApp();
  const router = useRouter();
  const nextTab = useSearchParams().get("next") ?? "design";
  const [creating, setCreating] = useState<CompetitionId | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState<"blank" | "example" | string>("blank");
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [confirmDel, setConfirmDel] = useState<Project | null>(null);

  async function create() {
    if (!user || !creating) return;
    let p: Project;
    if (start === "example") {
      const ex = creating === "line" ? referenceLineFollower(user.id) : creating === "sumo" ? referenceSumo(user.id) : reference2WD("race", user.id);
      p = { ...ex, id: uid("prj"), ownerId: user.id, name: name || ex.name };
    } else if (start !== "blank") {
      const src = projects.find((x) => x.id === start)!;
      const now = new Date().toISOString();
      p = { ...structuredClone(src), id: uid("prj"), name: name || `${src.name} → ${COMPETITIONS[creating].short}`, competition: creating, createdAt: now, updatedAt: now, validation: null, codeCheck: null, simulations: [], versions: [], trackId: null };
    } else p = newProject(creating, name || `My ${COMPETITIONS[creating].name} Robot`, user.id);
    await createProject(p);
    router.push(`/workspace/${p.id}/${nextTab}`);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <PageHeader kicker="SELECT YOUR BATTLEFIELD" title="My Projects">
        Choose a competition to start a new robot, or continue one you are building. Compatible designs can be reused between Robo Race and Line Following.
      </PageHeader>

      <div className="mb-10 grid gap-5 md:grid-cols-3">
        {CARDS.map((c) => {
          const Icon = c.icon;
          const glow = c.color === "accent" ? "hover:bf-glow-accent hover:border-accent" : c.color === "brand" ? "hover:border-brand" : "hover:border-bad";
          return (
            <button key={c.id} onClick={() => { setCreating(c.id); setName(""); setStart("blank"); }} className={`group bf-panel relative overflow-hidden p-6 text-left transition duration-300 hover:-translate-y-1 ${glow}`} style={{ perspective: 800 }}>
              <div className="bf-grid pointer-events-none absolute inset-0 opacity-40" />
              <div className="relative">
                <Icon size={36} className={c.color === "accent" ? "text-accent-ink" : c.color === "brand" ? "text-brand" : "text-bad"} />
                <div className="mt-4 font-display text-2xl font-bold uppercase">{COMPETITIONS[c.id].name}</div>
                <p className="mt-2 text-sm text-muted">{c.desc}</p>
                <ul className="mt-4 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted">
                  {c.features.map((f) => (
                    <li key={f}>▸ {f}</li>
                  ))}
                </ul>
                <div className="mt-5 font-mono text-xs tracking-widest text-accent-ink opacity-70 group-hover:opacity-100">NEW PROJECT →</div>
              </div>
            </button>
          );
        })}
      </div>

      <h2 className="mb-3 font-display text-xl font-semibold">Saved projects</h2>
      {projects.length === 0 ? (
        <Empty title="No robots yet">Pick a competition above to create your first project.</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-left">
              <tr className="bf-label">
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">Competition</th>
                <th className="hidden px-4 py-2 md:table-cell">Parts / wires</th>
                <th className="hidden px-4 py-2 md:table-cell">Validation</th>
                <th className="hidden px-4 py-2 lg:table-cell">Last edited</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-line hover:bg-panel/50">
                  <td className="px-4 py-2">
                    <Link href={`/workspace/${p.id}/design`} className="font-medium hover:text-accent-ink">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone="brand">{COMPETITIONS[p.competition].short}</Badge>
                  </td>
                  <td className="hidden px-4 py-2 font-mono text-xs text-muted md:table-cell">
                    {p.parts.length} / {p.wires.length}
                  </td>
                  <td className="hidden px-4 py-2 md:table-cell">{p.validation ? <span className={p.validation.passed ? "text-ok" : "text-bad"}>{p.validation.passed ? "Verified" : "Needs fixes"}</span> : <span className="text-dim">—</span>}</td>
                  <td className="hidden px-4 py-2 text-xs text-muted lg:table-cell">{new Date(p.updatedAt).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Link href={`/workspace/${p.id}/design`} className="rounded px-2 py-1 text-xs text-accent-ink hover:bg-accent/10">Open</Link>
                      <Link href={`/workspace/${p.id}/arena`} className="rounded px-2 py-1 text-xs text-brand hover:bg-brand/10">Simulate</Link>
                      <button title="Rename" className="rounded p-1.5 text-muted hover:text-text" onClick={() => setRenaming(p)}><Pencil size={14} /></button>
                      <button title="Duplicate" className="rounded p-1.5 text-muted hover:text-text" onClick={() => void duplicateProject(p.id)}><Copy size={14} /></button>
                      <button title="Delete" className="rounded p-1.5 text-muted hover:text-bad" onClick={() => setConfirmDel(p)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!creating} onClose={() => setCreating(null)} title={creating ? `New ${COMPETITIONS[creating].name} project` : ""}>
        <div className="space-y-4">
          <Field label="Project name">
            <input className="bf-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={creating ? `My ${COMPETITIONS[creating].name} Robot` : ""} autoFocus />
          </Field>
          <Field label="Start from" hint="Building from scratch is the best way to learn. Examples are fully wired reference robots you can inspect and break on purpose.">
            <select className="bf-input" value={start} onChange={(e) => setStart(e.target.value)}>
              <option value="blank">Empty project (recommended)</option>
              <option value="example">Inspect a fully wired example robot</option>
              {projects
                .filter((p) => creating && p.competition !== "sumo" && creating !== "sumo")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    Reuse my design: {p.name} ({COMPETITIONS[p.competition].short})
                  </option>
                ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => void create()}>Create &amp; open</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename project">
        {renaming && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget).get("name") as string;
              if (v.trim()) updateProject(renaming.id, (p) => ({ ...p, name: v.trim() }));
              setRenaming(null);
            }}
            className="space-y-4"
          >
            <input name="name" className="bf-input" defaultValue={renaming.name} autoFocus />
            <div className="flex justify-end">
              <Button variant="primary">Save</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete project?">
        {confirmDel && (
          <div className="space-y-4 text-sm">
            <p>
              <b>{confirmDel.name}</b> and all its circuits, code and simulation results will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDel(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => { void deleteProject(confirmDel.id); setConfirmDel(null); }}>Delete permanently</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <RequireAuth>
      <Suspense>
        <ProjectsInner />
      </Suspense>
    </RequireAuth>
  );
}
