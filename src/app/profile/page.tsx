"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { RequireAuth } from "@/components/shell/AppShell";
import { Badge, Button, Field, PageHeader, Panel, Progress, Stat } from "@/components/ui";
import { useApp } from "@/lib/store/app";
import { getBackend } from "@/lib/data";
import type { XpEvent } from "@/lib/data/types";
import { RankCard } from "@/components/ranks/RankCard";
import { XpHistory } from "@/components/xp/XpHistory";
import { ACHIEVEMENTS, earnedAchievements, streakDays } from "@/lib/gamification";
import { LEARNING_PATHS } from "@/lib/learning";
import { AvatarEditor } from "@/components/profile/AvatarEditor";
import { AccountDetails } from "@/components/profile/AccountDetails";

function Inner() {
  const { user, projects, progress, toast } = useApp();
  const [events, setEvents] = useState<XpEvent[]>([]);
  const [form, setForm] = useState({ name: user!.name, campus: user!.campus });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void getBackend().then(async (b) => setEvents(await b.listXpEvents(user!.id)));
  }, [user]);
  const earned = useMemo(() => earnedAchievements(events, projects, progress), [events, projects, progress]);
  const done = new Set(progress?.completedTopics ?? []);

  const save = async () => {
    if (saving) return;
    if (form.name.trim().length < 2) return toast("error", "Enter your full name.");
    setSaving(true);
    try {
      const b = await getBackend();
      const p = await b.updateProfile({ id: user!.id, name: form.name.trim(), campus: form.campus.trim() });
      useApp.setState({ user: p });
      toast("success", "Profile updated successfully");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <PageHeader kicker="ENGINEER DOSSIER" title={user!.name}>{user!.campus || "Campus not set"} · {user!.role === "super_admin" ? "Super Admin" : user!.role === "admin" ? "Administrator" : "Student"}</PageHeader>
      <div className="mb-6"><RankCard userId={user!.id} xp={user!.xp} rankLevel={user!.rankLevel} dailyXp={user!.dailyXp} /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Profile" className="lg:col-span-1">
          <div className="space-y-3">
            <AvatarEditor />
            <Field label="Name"><input className="bf-input" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Campus"><input className="bf-input" value={form.campus} maxLength={60} onChange={(e) => setForm({ ...form, campus: e.target.value })} /></Field>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button>
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <div className="bf-label mb-2">Account details</div>
            <AccountDetails />
          </div>
        </Panel>
        <div className="space-y-6 lg:col-span-2">
          <Panel title="At a glance">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Lifetime XP" value={user!.xp.toLocaleString()} tone="accent" />
              <Stat label="Today" value={(user!.dailyXp ?? 0).toLocaleString()} sub="since 11:15 PM" />
              <Stat label="Projects" value={projects.length} />
              <Stat label="Streak" value={`${streakDays(events)} d`} />
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs"><Link href="/learn/performance" className="text-accent-ink hover:underline">My performance analysis →</Link><Link href="/learn/history" className="text-accent-ink hover:underline">Quiz history →</Link></div>
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
        </div>
      </div>
      <div className="mt-6" id="xp-history"><XpHistory events={events} lifetimeXp={user!.xp} dailyXp={user!.dailyXp ?? 0} title="XP history" /></div>
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
