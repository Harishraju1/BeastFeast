"use client";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/shell/AppShell";
import { Badge, Button, Field, PageHeader, Panel, Tabs } from "@/components/ui";
import { useApp } from "@/lib/store/app";
import { getBackend } from "@/lib/data";
import type { Announcement, Mission, Progress, Video, XpEvent } from "@/lib/data/types";
import type { ComponentRecord, PinDef, Profile, Project, SimStatus, VerificationStatus } from "@/lib/types";
import { allComponents, getComponent } from "@/lib/catalogue";
import { TOPICS, WEEKLY_MISSIONS_DEFAULT } from "@/lib/learning";
import type { QuizQuestion } from "@/lib/learning/types";
import { youtubeId } from "@/lib/youtube";
import { AdminManagement } from "@/components/admin/AdminManagement";
import { XpRulesEditor } from "@/components/admin/XpRulesEditor";
import { ROLE_LABEL, isStaff } from "@/lib/roles";

type Tab = "admins" | "xp" | "students" | "components" | "learning" | "videos" | "missions" | "announcements" | "competitions" | "featured" | "analytics";
const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

function Students() {
  const [list, setList] = useState<Profile[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const load = async () => {
    const b = await getBackend();
    const ps = await b.listProfiles();
    setList(ps);
    const pr: Record<string, Progress> = {};
    for (const p of ps) pr[p.id] = await b.getProgress(p.id).catch(() => null as never);
    setProgress(pr);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/reset local UI state when its source changes
  useEffect(() => void load(), []);
  return (
    <Panel title={`Students (${list.length})`} bodyClass="p-0">
      <table className="w-full text-sm">
        <thead className="bg-bg2"><tr className="bf-label text-left"><th className="px-3 py-2">Name</th><th className="px-3 py-2">Campus / ID</th><th className="px-3 py-2">XP</th><th className="px-3 py-2">Topics</th><th className="px-3 py-2">Quizzes</th><th className="px-3 py-2">Role</th></tr></thead>
        <tbody>
          {list.map((u) => (
            <tr key={u.id} className="border-t border-line">
              <td className="px-3 py-2">{u.name}</td>
              <td className="px-3 py-2 text-muted">{u.campus || "—"} · {u.studentId || "—"}</td>
              <td className="px-3 py-2 font-mono text-accent-ink">{u.xp}</td>
              <td className="px-3 py-2">{progress[u.id]?.completedTopics.length ?? "—"}</td>
              <td className="px-3 py-2">{progress[u.id]?.quizAttempts.length ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge tone={u.role === "super_admin" ? "accent" : u.role === "admin" ? "brand" : "dim"}>{ROLE_LABEL[u.role]}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Components() {
  const { content, saveContent, toast } = useApp();
  const [q, setQ] = useState("");
  const [id, setId] = useState<string | null>(null);
  const comps = useMemo(() => allComponents().filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60), [q, content]);
  const c = id ? getComponent(id) : null;
  const [draft, setDraft] = useState<Partial<ComponentRecord> & { pinsJson?: string }>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/reset local UI state when its source changes
    if (c) setDraft({ manufacturer: c.manufacturer, model: c.model, description: c.description, simStatus: c.simStatus, verification: c.verification, datasheetUrl: c.datasheetUrl, image: c.image, model3d: c.model3d, pinsJson: JSON.stringify(c.pins, null, 1) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const save = async () => {
    if (!c) return;
    const { pinsJson, ...rest } = draft;
    let pins: PinDef[] | undefined;
    try {
      pins = JSON.parse(pinsJson ?? "[]");
      if (!Array.isArray(pins) || pins.some((p) => !p.id || !p.fn || !p.side)) throw new Error("Each pin needs id, fn and side");
    } catch (e) {
      return toast("error", `Pin JSON invalid: ${(e as Error).message}`);
    }
    const changedPins = JSON.stringify(pins) !== JSON.stringify(c.pins);
    await saveContent({ componentOverrides: { ...content.componentOverrides, [c.id]: { ...content.componentOverrides[c.id], ...rest, ...(changedPins ? { pins, pinoutStatus: "datasheet-referenced" as const } : {}) } } });
    toast("success", `${c.name} updated`);
  };
  const addNew = async () => {
    const name = prompt("New component name (it will be added under section 16-style 'Admin-added')");
    if (!name) return;
    const rec: ComponentRecord = { ...getComponent("arduino-uno-r3")!, id: `admin-${rid("c")}`, name, category: "Admin-added components", categoryNumber: 99, subcategory: null, manufacturer: null, model: null, description: "Added by an administrator.", functionalityClass: "A", kind: "sensor", simStatus: "grey", verification: "unverified", sources: [{ sectionNumber: 99, sectionTitle: "Admin-added", subcategory: null, itemNumber: 0, sourceName: name, line: 0 }], crossListedWith: [], image: null, model3d: null, footprint2d: null, pins: [], bridges: [], pinoutStatus: "not-available", options: [], specs: {}, mountingPoints: [], compatibleWith: [], compatibleControllers: [], compatibleDrivers: [], competitions: { race: "not-listed", line: "not-listed", sumo: "not-listed" }, datasheetUrl: null, board: undefined, tags: ["admin-added"], motor: undefined, driver: undefined, battery: undefined, sensor: undefined, wheel: undefined, chassis: undefined };
    await saveContent({ addedComponents: [...content.addedComponents, rec] });
    setId(rec.id);
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      <Panel title="Catalogue" actions={<Button size="sm" onClick={() => void addNew()}>+ Add</Button>}>
        <input className="bf-input mb-2" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[60vh] overflow-auto">
          {comps.map((x) => (
            <button key={x.id} onClick={() => setId(x.id)} className={`flex w-full justify-between rounded px-2 py-1 text-left text-sm ${id === x.id ? "bg-accent/15 text-accent-ink" : "hover:bg-panel2"}`}>
              <span className="truncate">{x.name}</span><span className="font-mono text-[10px] text-dim">{x.simStatus}</span>
            </button>
          ))}
        </div>
      </Panel>
      {c ? (
        <Panel title={`Edit · ${c.name}`} actions={<Button size="sm" variant="primary" onClick={() => void save()}>Save</Button>}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Manufacturer"><input className="bf-input" value={draft.manufacturer ?? ""} onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })} /></Field>
            <Field label="Model"><input className="bf-input" value={draft.model ?? ""} onChange={(e) => setDraft({ ...draft, model: e.target.value })} /></Field>
            <Field label="Simulation status"><select className="bf-input" value={draft.simStatus} onChange={(e) => setDraft({ ...draft, simStatus: e.target.value as SimStatus })}>{["green", "blue", "yellow", "grey"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Verification" hint="Mark 'admin-verified' only after checking the values against the datasheet."><select className="bf-input" value={draft.verification} onChange={(e) => setDraft({ ...draft, verification: e.target.value as VerificationStatus })}>{["admin-verified", "datasheet-referenced", "generic-convention", "unverified"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Datasheet URL"><input className="bf-input" value={draft.datasheetUrl ?? ""} onChange={(e) => setDraft({ ...draft, datasheetUrl: e.target.value || null })} /></Field>
            <Field label="3D model URL (glTF)"><input className="bf-input" value={draft.model3d ?? ""} onChange={(e) => setDraft({ ...draft, model3d: e.target.value || null })} /></Field>
            <Field label="Component image (verified photo, ≤500 KB)">
              <input type="file" accept="image/*" className="text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 500_000) return toast("error", "Image too large"); const r = new FileReader(); r.onload = () => setDraft({ ...draft, image: String(r.result) }); r.readAsDataURL(f); }} />
              {draft.image && <img src={draft.image} alt="" className="mt-2 h-24 rounded border border-line object-contain" />}
            </Field>
            <Field label="Description"><textarea className="bf-input min-h-24" value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          </div>
          <Field label="Pin definitions (JSON: id, label, fn, side, caps, arduinoPin, vRange …)" hint="Saving changed pins marks the pinout as datasheet-referenced. The validator and simulator use these pins immediately.">
            <textarea className="bf-input min-h-64 font-mono text-[11px]" value={draft.pinsJson ?? ""} onChange={(e) => setDraft({ ...draft, pinsJson: e.target.value })} />
          </Field>
        </Panel>
      ) : <Panel title="Select a component"><div className="text-sm text-muted">Choose a component to edit its information, upload a verified image, update the pinout or verify specifications.</div></Panel>}
    </div>
  );
}

function Learning() {
  const { content, saveContent, toast } = useApp();
  const [tid, setTid] = useState(TOPICS[0].id);
  const o = content.topicOverrides[tid] ?? {};
  const [d, setD] = useState(o);
  const [qd, setQd] = useState({ prompt: "", options: "A\nB\nC\nD", answer: 0, explanation: "", difficulty: 1 as 1 | 2 | 3 });
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/reset local UI state when its source changes
  useEffect(() => setD(content.topicOverrides[tid] ?? {}), [tid, content.topicOverrides]);
  const t = TOPICS.find((x) => x.id === tid)!;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Edit lesson" actions={<Button size="sm" variant="primary" onClick={async () => { await saveContent({ topicOverrides: { ...content.topicOverrides, [tid]: d } }); toast("success", "Lesson updated"); }}>Save</Button>}>
        <Field label="Topic"><select className="bf-input" value={tid} onChange={(e) => setTid(e.target.value)}>{TOPICS.map((x) => <option key={x.id} value={x.id}>{x.pathId.toUpperCase()} {x.order}. {x.title}</option>)}</select></Field>
        <div className="mt-3 space-y-3">
          <Field label="Title override"><input className="bf-input" placeholder={t.title} value={d.title ?? ""} onChange={(e) => setD({ ...d, title: e.target.value || undefined })} /></Field>
          <Field label="Summary override"><input className="bf-input" placeholder={t.summary} value={d.summary ?? ""} onChange={(e) => setD({ ...d, summary: e.target.value || undefined })} /></Field>
          <Field label="Instructor notes (shown in the lesson)"><textarea className="bf-input min-h-32" value={d.extraNotes ?? ""} onChange={(e) => setD({ ...d, extraNotes: e.target.value || undefined })} /></Field>
        </div>
      </Panel>
      <Panel title={`Add quiz question to “${t.title}”`}>
        <div className="space-y-3">
          <Field label="Question"><textarea className="bf-input" value={qd.prompt} onChange={(e) => setQd({ ...qd, prompt: e.target.value })} /></Field>
          <Field label="Options (one per line)"><textarea className="bf-input" value={qd.options} onChange={(e) => setQd({ ...qd, options: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Correct option # (0-based)"><input className="bf-input" type="number" min={0} value={qd.answer} onChange={(e) => setQd({ ...qd, answer: Number(e.target.value) })} /></Field>
            <Field label="Difficulty"><select className="bf-input" value={qd.difficulty} onChange={(e) => setQd({ ...qd, difficulty: Number(e.target.value) as 1 | 2 | 3 })}><option value={1}>1 (5 XP)</option><option value={2}>2 (10 XP)</option><option value={3}>3 (15 XP)</option></select></Field>
          </div>
          <Field label="Explanation"><textarea className="bf-input" value={qd.explanation} onChange={(e) => setQd({ ...qd, explanation: e.target.value })} /></Field>
          <Button variant="primary" onClick={async () => {
            const opts = qd.options.split("\n").map((s) => s.trim()).filter(Boolean);
            if (!qd.prompt || opts.length < 2 || qd.answer >= opts.length || !qd.explanation) return toast("error", "Fill in the question, ≥2 options, a valid answer and an explanation.");
            const question: QuizQuestion = { id: `${tid}-admin-${Date.now()}`, type: "mcq", prompt: qd.prompt, options: opts, answerIndex: qd.answer, explanation: qd.explanation, difficulty: qd.difficulty, xp: qd.difficulty * 5 };
            await saveContent({ extraQuestions: [...content.extraQuestions, { topicId: tid, question }] });
            toast("success", "Question added");
          }}>Add question</Button>
          <div className="text-xs text-muted">{content.extraQuestions.filter((e) => e.topicId === tid).length} admin questions on this topic.</div>
        </div>
      </Panel>
    </div>
  );
}

function Videos() {
  const { content, saveContent, toast } = useApp();
  const empty: Video = { id: "", title: "", url: "", description: "", competition: "all", difficulty: "beginner", category: "Electronics" };
  const [v, setV] = useState<Video>(empty);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Add YouTube video">
        <div className="space-y-3">
          <Field label="Title"><input className="bf-input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
          <Field label="YouTube URL"><input className="bf-input" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} /></Field>
          <Field label="Thumbnail URL (optional)"><input className="bf-input" value={v.thumbnail ?? ""} onChange={(e) => setV({ ...v, thumbnail: e.target.value || undefined })} /></Field>
          <Field label="Description"><textarea className="bf-input" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Category"><select className="bf-input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as Video["category"] })}>{["Electronics", "Arduino", "Sensors", "Motor Drivers", "Chassis", "Line Following", "Robo Race", "Robo War", "Advanced Robotics"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Competition"><select className="bf-input" value={v.competition} onChange={(e) => setV({ ...v, competition: e.target.value as Video["competition"] })}>{["all", "race", "line", "sumo"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Difficulty"><select className="bf-input" value={v.difficulty} onChange={(e) => setV({ ...v, difficulty: e.target.value as Video["difficulty"] })}>{["beginner", "intermediate", "advanced"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
          <Field label="Related topic"><select className="bf-input" value={v.topicId ?? ""} onChange={(e) => setV({ ...v, topicId: e.target.value || undefined })}><option value="">—</option>{TOPICS.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
          <Button variant="primary" onClick={async () => {
            if (!v.title || !youtubeId(v.url)) return toast("error", "Enter a title and a valid YouTube URL.");
            await saveContent({ videos: [...content.videos, { ...v, id: rid("vid") }] });
            setV(empty);
            toast("success", "Video added");
          }}>Add video</Button>
        </div>
      </Panel>
      <Panel title={`Videos (${content.videos.length})`}>
        {content.videos.map((x) => (
          <div key={x.id} className="flex items-center justify-between border-b border-line py-2 text-sm">
            <span>{x.title} <Badge>{x.category}</Badge></span>
            <Button size="sm" variant="danger" onClick={() => void saveContent({ videos: content.videos.filter((y) => y.id !== x.id) })}>Remove</Button>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Missions() {
  const { content, saveContent, toast } = useApp();
  const [m, setM] = useState<Mission[]>(content.missions ?? WEEKLY_MISSIONS_DEFAULT);
  return (
    <Panel title="Weekly mission schedule" actions={<><Button size="sm" onClick={() => setM(WEEKLY_MISSIONS_DEFAULT)}>Reset to default</Button><Button size="sm" variant="primary" onClick={async () => { await saveContent({ missions: m }); toast("success", "Schedule saved"); }}>Save</Button></>}>
      <div className="space-y-3">
        {m.map((x, i) => (
          <div key={x.day} className="grid gap-2 rounded border border-line p-3 md:grid-cols-[100px_1fr_1fr]">
            <div className="font-semibold">{x.day}</div>
            <div className="space-y-2">
              <input className="bf-input" value={x.title} onChange={(e) => setM(m.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} />
              <textarea className="bf-input" value={x.description} onChange={(e) => setM(m.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))} />
            </div>
            <select multiple className="bf-input h-28" value={x.topicIds} onChange={(e) => setM(m.map((y, j) => (j === i ? { ...y, topicIds: [...e.target.selectedOptions].map((o) => o.value) } : y)))}>
              {TOPICS.map((t) => <option key={t.id} value={t.id}>{t.pathId.toUpperCase()} · {t.title}</option>)}
            </select>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Announcements() {
  const { content, saveContent } = useApp();
  const [a, setA] = useState<Omit<Announcement, "id" | "at">>({ title: "", body: "", kind: "announcement" });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Publish announcement">
        <div className="space-y-3">
          <Field label="Title"><input className="bf-input" value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} /></Field>
          <Field label="Message"><textarea className="bf-input min-h-28" value={a.body} onChange={(e) => setA({ ...a, body: e.target.value })} /></Field>
          <Field label="Type"><select className="bf-input" value={a.kind} onChange={(e) => setA({ ...a, kind: e.target.value as Announcement["kind"] })}><option value="announcement">Announcement</option><option value="competition">Competition update</option><option value="challenge">Challenge</option></select></Field>
          <Button variant="primary" disabled={!a.title || !a.body} onClick={() => { void saveContent({ announcements: [...content.announcements, { ...a, id: rid("ann"), at: new Date().toISOString() }] }); setA({ title: "", body: "", kind: "announcement" }); }}>Publish</Button>
        </div>
      </Panel>
      <Panel title="Published">
        {[...content.announcements].reverse().map((x) => (
          <div key={x.id} className="flex items-start justify-between gap-2 border-b border-line py-2 text-sm">
            <div><div className="font-semibold">{x.title} <Badge>{x.kind}</Badge></div><div className="text-xs text-muted">{x.body}</div></div>
            <Button size="sm" variant="danger" onClick={() => void saveContent({ announcements: content.announcements.filter((y) => y.id !== x.id) })}>Delete</Button>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Competitions() {
  const { content, saveContent, toast } = useApp();
  const [r, setR] = useState(content.rules);
  const num = (v: string) => Number(v);
  return (
    <Panel title="Competition rules" actions={<Button size="sm" variant="primary" onClick={async () => { await saveContent({ rules: r }); toast("success", "Rules saved — used by validation and the arena"); }}>Save</Button>}>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-2"><div className="bf-label text-accent-ink">Sumo</div>
          <Field label="Max length (mm)"><input className="bf-input" type="number" value={r.sumo.maxLength_mm} onChange={(e) => setR({ ...r, sumo: { ...r.sumo, maxLength_mm: num(e.target.value) } })} /></Field>
          <Field label="Max width (mm)"><input className="bf-input" type="number" value={r.sumo.maxWidth_mm} onChange={(e) => setR({ ...r, sumo: { ...r.sumo, maxWidth_mm: num(e.target.value) } })} /></Field>
          <Field label="Max mass (g)"><input className="bf-input" type="number" value={r.sumo.maxMass_g} onChange={(e) => setR({ ...r, sumo: { ...r.sumo, maxMass_g: num(e.target.value) } })} /></Field>
          <Field label="Match time (s)"><input className="bf-input" type="number" value={r.sumo.matchTimeS} onChange={(e) => setR({ ...r, sumo: { ...r.sumo, matchTimeS: num(e.target.value) } })} /></Field>
          <Field label="Start delay (s)"><input className="bf-input" type="number" value={r.sumo.startDelayS} onChange={(e) => setR({ ...r, sumo: { ...r.sumo, startDelayS: num(e.target.value) } })} /></Field>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={r.bluetoothAllowedInSumo} onChange={(e) => setR({ ...r, bluetoothAllowedInSumo: e.target.checked })} /> Bluetooth / RC allowed in sumo</label>
        </div>
        <div className="space-y-2"><div className="bf-label text-accent-ink">Robo Race</div>
          <Field label="Laps"><input className="bf-input" type="number" value={r.race.laps} onChange={(e) => setR({ ...r, race: { ...r.race, laps: num(e.target.value) } })} /></Field>
          <Field label="Max length (mm)"><input className="bf-input" type="number" value={r.race.maxLength_mm} onChange={(e) => setR({ ...r, race: { ...r.race, maxLength_mm: num(e.target.value) } })} /></Field>
          <Field label="Max width (mm)"><input className="bf-input" type="number" value={r.race.maxWidth_mm} onChange={(e) => setR({ ...r, race: { ...r.race, maxWidth_mm: num(e.target.value) } })} /></Field>
        </div>
        <div className="space-y-2"><div className="bf-label text-accent-ink">Line Following</div>
          <Field label="Time limit (s)"><input className="bf-input" type="number" value={r.line.timeLimitS} onChange={(e) => setR({ ...r, line: { ...r.line, timeLimitS: num(e.target.value) } })} /></Field>
          <Field label="Max length (mm)"><input className="bf-input" type="number" value={r.line.maxLength_mm} onChange={(e) => setR({ ...r, line: { ...r.line, maxLength_mm: num(e.target.value) } })} /></Field>
          <Field label="Max width (mm)"><input className="bf-input" type="number" value={r.line.maxWidth_mm} onChange={(e) => setR({ ...r, line: { ...r.line, maxWidth_mm: num(e.target.value) } })} /></Field>
        </div>
      </div>
    </Panel>
  );
}

function Featured() {
  const { content, saveContent } = useApp();
  const [all, setAll] = useState<Project[]>([]);
  useEffect(() => void getBackend().then(async (b) => setAll(await b.listAllProjects())), []);
  return (
    <Panel title="Feature student projects">
      {all.map((p) => (
        <label key={p.id} className="flex items-center gap-2 border-b border-line py-1.5 text-sm">
          <input type="checkbox" checked={content.featuredProjects.includes(p.id)} onChange={(e) => void saveContent({ featuredProjects: e.target.checked ? [...content.featuredProjects, p.id] : content.featuredProjects.filter((x) => x !== p.id) })} />
          {p.name} <Badge>{p.competition}</Badge> <span className="text-xs text-muted">{p.parts.length} parts · {p.simulations.length} runs</span>
        </label>
      ))}
      {!all.length && <div className="text-sm text-muted">No projects visible.</div>}
    </Panel>
  );
}

function Analytics() {
  const [ev, setEv] = useState<XpEvent[]>([]);
  const [all, setAll] = useState<Project[]>([]);
  useEffect(() => void getBackend().then(async (b) => { setEv(await b.listXpEvents()); setAll(await b.listAllProjects()); }), []);
  const sims = all.flatMap((p) => p.simulations);
  const count = (t: XpEvent["type"]) => ev.filter((e) => e.type === t).length;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Platform activity">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {([["Projects", all.length], ["Validated robots", count("validation-pass")], ["Simulation runs", sims.length], ["Tracks completed", count("lap-complete")], ["Sumo wins", count("sumo-win")], ["Lessons completed", count("lesson-complete")], ["Quiz passes", count("quiz-pass")], ["Tracks designed", count("track-created")]] as [string, number][]).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="font-mono text-accent-ink">{v}</dd></div>)}
        </dl>
      </Panel>
      <Panel title="Simulation statistics">
        <div className="text-sm text-muted">
          <div>Code-controlled runs: {sims.filter((s) => s.controlMode === "code").length} · manual: {sims.filter((s) => s.controlMode === "manual").length}</div>
          <div>Completed: {sims.filter((s) => s.outcome === "completed").length} · wins {sims.filter((s) => s.outcome === "win").length} · losses {sims.filter((s) => s.outcome === "loss").length}</div>
          <div>Average collisions per run: {sims.length ? (sims.reduce((a, s) => a + (s.collisions ?? 0), 0) / sims.length).toFixed(1) : "—"}</div>
          <div>Most common critical issue: {mostCommon(all.flatMap((p) => p.validation?.issues.filter((i) => i.severity === "critical").map((i) => i.code) ?? [])) ?? "—"}</div>
        </div>
      </Panel>
    </div>
  );
}
const mostCommon = (xs: string[]) => {
  const m = new Map<string, number>();
  xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

function Inner() {
  const user = useApp((s) => s.user);
  const [tab, setTab] = useState<Tab>("admins");
  // The server layout already checked the role in cloud mode; this guards local mode and stale client state.
  if (!isStaff(user?.role)) return <div className="p-10 text-center text-bad">Administrator access required.</div>;
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <PageHeader kicker={user?.role === "super_admin" ? "SUPER ADMIN · ROBOTICS CLUB KKH" : "ADMIN · ROBOTICS CLUB KKH"} title="Admin Dashboard" />
      <div className="mb-5 overflow-x-auto">
        <Tabs value={tab} onChange={setTab} items={(["admins", "xp", "students", "components", "learning", "videos", "missions", "announcements", "competitions", "featured", "analytics"] as Tab[]).map((t) => ({ value: t, label: t === "admins" ? "Admin Management" : t === "xp" ? "XP Rules" : t[0].toUpperCase() + t.slice(1) }))} />
      </div>
      {tab === "admins" && <AdminManagement />}
      {tab === "xp" && <XpRulesEditor />}
      {tab === "students" && <Students />}
      {tab === "components" && <Components />}
      {tab === "learning" && <Learning />}
      {tab === "videos" && <Videos />}
      {tab === "missions" && <Missions />}
      {tab === "announcements" && <Announcements />}
      {tab === "competitions" && <Competitions />}
      {tab === "featured" && <Featured />}
      {tab === "analytics" && <Analytics />}
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth>
      <Inner />
    </RequireAuth>
  );
}
