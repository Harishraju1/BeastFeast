"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { RequireAuth } from "@/components/shell/AppShell";
import { Badge, Button, Field, PageHeader, Panel, Progress, Stat } from "@/components/ui";
import { useApp } from "@/lib/store/app";
import { getBackend } from "@/lib/data";
import { XP_RULES, type XpEvent } from "@/lib/data/types";
import { ACHIEVEMENTS, earnedAchievements, rankFor, streakDays } from "@/lib/gamification";
import { LEARNING_PATHS } from "@/lib/learning";

function Inner() {
  const { user, projects, progress, toast } = useApp();
  const [events, setEvents] = useState<XpEvent[]>([]);
  const [form, setForm] = useState({ name: user!.name, campus: user!.campus, studentId: user!.studentId, avatar: user!.avatar });
  useEffect(() => {
    void getBackend().then(async (b) => setEvents(await b.listXpEvents(user!.id)));
  }, [user]);
  const earned = useMemo(() => earnedAchievements(events, projects, progress), [events, projects, progress]);
  const rank = rankFor(user!.xp);
  const done = new Set(progress?.completedTopics ?? []);

  const save = async () => {
    try {
      const b = await getBackend();
      const p = await b.updateProfile({ id: user!.id, ...form });
      useApp.setState({ user: p });
      toast("success", "Profile saved");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <PageHeader kicker="ENGINEER DOSSIER" title={user!.name}>{user!.campus || "Campus not set"} · Student ID {user!.studentId || "—"} · {user!.role === "admin" ? "Administrator" : "Student"}</PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Profile" className="lg:col-span-1">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-panel2 font-display text-2xl text-brand">{form.avatar ? <img src={form.avatar} alt="" className="h-full w-full object-cover" /> : form.name[0]}</span>
              <label className="cursor-pointer text-xs text-brand">Change picture
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 300_000) return toast("error", "Please choose an image under 300 KB.");
                  const r = new FileReader();
                  r.onload = () => setForm({ ...form, avatar: String(r.result) });
                  r.readAsDataURL(f);
                }} />
              </label>
            </div>
            <Field label="Name"><input className="bf-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Campus"><input className="bf-input" value={form.campus} onChange={(e) => setForm({ ...form, campus: e.target.value })} /></Field>
            <Field label="Student ID"><input className="bf-input" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} /></Field>
            <Button variant="primary" onClick={() => void save()}>Save profile</Button>
          </div>
        </Panel>
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Rank & XP">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="XP" value={user!.xp} tone="accent" />
              <Stat label="Rank" value={rank.name} tone="brand" sub={rank.next ? `${rank.toNext} XP to ${rank.next}` : "Top rank"} />
              <Stat label="Projects" value={projects.length} />
              <Stat label="Streak" value={`${streakDays(events)} d`} />
            </div>
            <div className="mt-3"><Progress value={rank.pct} /></div>
          </Panel>
          <Panel title={`Achievements (${earned.size}/${ACHIEVEMENTS.length})`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ACHIEVEMENTS.map((a) => (
                <div key={a.id} className={`rounded-lg border p-3 ${earned.has(a.id) ? "border-accent bg-accent/10" : "border-line opacity-60"}`}>
                  <Trophy size={18} className={earned.has(a.id) ? "text-accent-ink" : "text-dim"} />
                  <div className="mt-1 text-sm font-semibold">{a.title}</div>
                  <div className="text-[11px] text-muted">{a.description}</div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Learning progress">
            {LEARNING_PATHS.map((p) => {
              const n = p.topicIds.filter((id) => done.has(id)).length;
              return (
                <div key={p.id} className="mb-2">
                  <div className="flex justify-between text-sm"><span>{p.title}</span><span className="text-muted">{n}/{p.topicIds.length}</span></div>
                  <Progress value={(n / p.topicIds.length) * 100} tone="brand" />
                </div>
              );
            })}
            <div className="mt-2 text-xs text-muted"><Link href="/learn/history" className="text-accent-ink hover:underline">{progress?.quizAttempts.length ?? 0} quiz attempts — view history</Link> · {progress?.bookmarks.length ?? 0} bookmarks</div>
          </Panel>
          <Panel title="Project history">
            {projects.length === 0 ? <div className="text-sm text-muted">No projects yet.</div> : projects.map((p) => (
              <Link key={p.id} href={`/workspace/${p.id}/design`} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0 hover:text-accent-ink">
                <span>{p.name}</span>
                <span className="flex gap-2 text-xs text-muted"><Badge>{p.competition}</Badge>{p.simulations.length} runs · {p.codeVersions.length} code versions · {new Date(p.updatedAt).toLocaleDateString()}</span>
              </Link>
            ))}
          </Panel>
          <Panel title="XP history">
            <div className="max-h-64 overflow-auto text-xs">
              {[...events].reverse().map((e) => (
                <div key={e.id} className="flex justify-between border-b border-line/60 py-1">
                  <span>{XP_RULES[e.type].label} <span className="text-dim">({e.refId})</span></span>
                  <span className="font-mono text-accent-ink">+{e.amount}</span>
                </div>
              ))}
              {!events.length && <div className="text-muted">No XP yet. XP is earned for learning, passing quizzes, validating robots and completing simulations — not for visiting pages.</div>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <Inner />
    </RequireAuth>
  );
}
