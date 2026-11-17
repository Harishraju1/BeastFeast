"use client";
import Image from "next/image";
import logo from "@/assets/brand/beast-feast-logo.webp";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Award, Flame, PlayCircle, Trophy } from "lucide-react";
import { useApp } from "@/lib/store/app";
import { getBackend } from "@/lib/data";
import type { Profile } from "@/lib/types";
import type { XpEvent } from "@/lib/data/types";
import { COMPETITIONS } from "@/lib/types";
import { LEARNING_PATHS, TOPICS, WEEKLY_MISSIONS_DEFAULT, getTopic } from "@/lib/learning";
import { ACHIEVEMENTS, earnedAchievements, rankFor, streakDays } from "@/lib/gamification";
import { Badge, LinkButton, Panel, Progress, Stat } from "@/components/ui";
import { youtubeId } from "@/lib/youtube";

const HeroRobot = dynamic(() => import("@/components/three/HeroRobot"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-bg2" /> });

const HIGHLIGHTS = [
  { kind: "controller", label: "Arduino Uno R3 — the brain" },
  { kind: "motor-driver", label: "L298N — the muscle switch" },
  { kind: "dc-motor", label: "TT gear motors — the drive" },
  { kind: "battery", label: "2S Li-ion — the power" },
  { kind: "wheel", label: "Rubber wheels — the grip" },
];

export default function Home() {
  const { user, projects, progress, content, ready } = useApp();
  const [hi, setHi] = useState(0);
  const [events, setEvents] = useState<XpEvent[]>([]);
  const [leaders, setLeaders] = useState<Profile[]>([]);
  useEffect(() => {
    const t = setInterval(() => setHi((h) => (h + 1) % HIGHLIGHTS.length), 2600);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!user) return;
    void getBackend().then(async (b) => {
      setEvents(await b.listXpEvents(user.id));
      setLeaders((await b.listProfiles()).sort((a, b) => b.xp - a.xp).slice(0, 5));
    });
  }, [user]);

  const missions = content.missions ?? WEEKLY_MISSIONS_DEFAULT;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long" });
  const done = new Set(progress?.completedTopics ?? []);
  const earned = useMemo(() => earnedAchievements(events, projects, progress), [events, projects, progress]);
  const rank = rankFor(user?.xp ?? 0);
  const stats = {
    projects: projects.length,
    circuits: projects.filter((p) => p.wires.length > 0).length,
    sims: projects.reduce((a, p) => a + p.simulations.length, 0),
    topics: done.size,
    quiz: progress?.quizAttempts.length ? Math.round(progress.quizAttempts.reduce((a, q) => a + q.percent, 0) / progress.quizAttempts.length) : null,
  };
  const nextTopic = TOPICS.find((t) => !done.has(t.id));
  const missionPct = (m: (typeof missions)[number]) => (m.topicIds.length ? (m.topicIds.filter((id) => done.has(id)).length / m.topicIds.length) * 100 : 0);

  return (
    <div>
      {/* HERO */}
      <section className="bf-grid relative overflow-hidden border-b border-line">
        <div className="mx-auto grid max-w-7xl items-center gap-6 px-5 py-10 lg:grid-cols-2 lg:py-14">
          <div className="relative z-10">
            <Image src={logo} alt="BEAST FEAST 5.0 — Robotics Club KKH. Build · Code · Simulate · Dominate." priority className="bf-rise -ml-4 mb-2 h-auto w-[300px] drop-shadow-[0_18px_30px_rgba(20,26,22,0.35)] md:w-[400px]" sizes="(min-width: 768px) 400px, 300px" />
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              YOUR ROBOTICS JOURNEY <span className="text-accent-ink">STARTS HERE.</span>
            </h1>
            <p className="mt-4 max-w-lg text-base text-muted md:text-lg">Design your machine. Master your circuits. Write your intelligence. Enter the arena.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LinkButton href={user ? "/projects" : "/login?next=/projects"} variant="primary" size="lg">
                START BUILDING <ArrowRight size={16} />
              </LinkButton>
              <LinkButton href={user ? (projects[0] ? `/workspace/${projects[0].id}/arena` : "/projects?next=arena") : "/login"} variant="secondary" size="lg">
                ENTER SIMULATOR
              </LinkButton>
              <LinkButton href="/learn" size="lg">
                EXPLORE BEAST TOPICS
              </LinkButton>
            </div>
            <div className="mt-6 font-mono text-xs tracking-widest text-dim">BUILD. CODE. SIMULATE. DOMINATE.</div>
          </div>
          <div className="relative h-[340px] overflow-hidden rounded-xl border border-line md:h-[440px]">
            <HeroRobot highlight={HIGHLIGHTS[hi].kind} />
            <div className="pointer-events-none absolute left-3 top-3 rounded border border-brand/40 bg-bg/70 px-2.5 py-1 font-mono text-[11px] text-brand backdrop-blur">◉ {HIGHLIGHTS[hi].label}</div>
            <div className="pointer-events-none absolute bottom-3 right-3 font-mono text-[10px] text-dim">DRAG TO ROTATE · PROCEDURAL MODEL</div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-8">
        {ready && !user && (
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display text-lg font-semibold">Sign in to save robots, earn XP and climb the leaderboard.</div>
                <div className="text-sm text-muted">Browse components and Beast Topics without an account.</div>
              </div>
              <LinkButton href="/login" variant="primary">
                Sign in / Create account
              </LinkButton>
            </div>
          </Panel>
        )}

        {/* A. workspace stats */}
        {user && (
          <Panel title="My Engineering Workspace" actions={<Badge tone="accent">{rank.name}</Badge>}>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4 lg:grid-cols-7">
              <Stat label="Projects" value={stats.projects} />
              <Stat label="Circuits" value={stats.circuits} />
              <Stat label="Simulations" value={stats.sims} />
              <Stat label="Topics done" value={`${stats.topics}/${TOPICS.length}`} />
              <Stat label="Avg quiz" value={stats.quiz === null ? "—" : `${stats.quiz}%`} />
              <Stat label="XP" value={user.xp} tone="accent" />
              <Stat label="Rank" value={rank.name} tone="brand" sub={rank.next ? `${rank.toNext} XP to ${rank.next}` : "Top rank"} />
            </div>
            <div className="mt-4">
              <Progress value={rank.pct} />
            </div>
          </Panel>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* B. continue building */}
          <Panel title="Continue Building" className="lg:col-span-2" actions={<LinkButton href="/projects" size="sm">All projects</LinkButton>}>
            {!user || projects.length === 0 ? (
              <div className="text-sm text-muted">No projects yet. Pick a competition and start your first robot.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {projects.slice(0, 4).map((p) => (
                  <Link key={p.id} href={`/workspace/${p.id}/design`} className="group rounded-lg border border-line bg-bg2 p-3 transition hover:border-accent">
                    <div className="flex items-center justify-between">
                      <span className="font-display font-semibold">{p.name}</span>
                      <Badge tone="brand">{COMPETITIONS[p.competition].short}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {p.parts.length} parts · {p.wires.length} wires · edited {new Date(p.updatedAt).toLocaleString()}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      {p.validation ? <span className={p.validation.passed ? "text-ok" : "text-bad"}>{p.validation.passed ? "✔ Validated" : `✖ ${p.validation.issues.filter((i) => i.severity === "critical").length} critical`}</span> : <span className="text-dim">Not validated</span>}
                      <span className="text-accent-ink group-hover:underline">Continue →</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          {/* F. leaderboard preview */}
          <Panel title="Leaderboard" actions={<LinkButton href="/leaderboard" size="sm">View</LinkButton>}>
            {leaders.length === 0 ? (
              <div className="text-sm text-muted">Sign in to see the leaderboard.</div>
            ) : (
              <ol className="space-y-2">
                {leaders.map((l, i) => (
                  <li key={l.id} className="flex items-center gap-3 text-sm">
                    <span className={`w-5 font-mono ${i === 0 ? "text-accent-ink" : "text-dim"}`}>{i + 1}</span>
                    <span className="flex-1 truncate">{l.name}</span>
                    <span className="font-mono text-accent-ink">{l.xp}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* C. weekly missions */}
          <Panel title="Weekly Missions" className="lg:col-span-2" actions={nextTopic && <LinkButton href={`/learn/${nextTopic.id}`} size="sm" variant="primary">Next: {nextTopic.title}</LinkButton>}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {missions.map((m) => (
                <div key={m.day} className={`rounded-lg border p-3 ${m.day === today ? "border-accent bg-accent/5" : "border-line bg-bg2"}`}>
                  <div className="bf-label">{m.day}</div>
                  <div className="text-sm font-semibold">{m.title}</div>
                  <div className="mb-2 line-clamp-2 text-xs text-muted">{m.description}</div>
                  <Progress value={missionPct(m)} tone={missionPct(m) >= 100 ? "ok" : "accent"} />
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.topicIds.slice(0, 3).map((id) => (
                      <Link key={id} href={`/learn/${id}`} className={`text-[10px] hover:underline ${done.has(id) ? "text-ok" : "text-brand"}`}>
                        {getTopic(id)?.title ?? id}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* D. become a robot beast */}
          <Panel title="Become a Robot Beast">
            <div className="mb-3 flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-accent-ink">
                <Flame size={16} /> {streakDays(events)}-day streak
              </span>
              <span className="flex items-center gap-1 text-brand">
                <Award size={16} /> {earned.size}/{ACHIEVEMENTS.length}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {ACHIEVEMENTS.map((a) => (
                <div key={a.id} title={a.description} className={`rounded-md border p-2 text-center text-[10px] leading-tight ${earned.has(a.id) ? "border-accent bg-accent/10 text-accent-ink" : "border-line text-dim"}`}>
                  <Trophy size={16} className="mx-auto mb-1" />
                  {a.title}
                </div>
              ))}
            </div>
            {user && Object.keys(progress?.records ?? {}).length > 0 && (
              <div className="mt-3 border-t border-line pt-2 text-xs text-muted">
                <div className="bf-label mb-1">Personal records</div>
                {Object.entries(progress!.records).slice(0, 3).map(([k, r]) => (
                  <div key={k}>
                    {k}: {r.bestLapS ? `${r.bestLapS.toFixed(2)} s lap` : ""} {r.wins ? `${r.wins} wins` : ""}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* E. featured tutorials */}
          <Panel title="Featured Tutorials" className="lg:col-span-2" actions={<LinkButton href="/learn?tab=videos" size="sm">Video library</LinkButton>}>
            {content.videos.length === 0 ? (
              <div className="text-sm text-muted">Administrators haven&apos;t added tutorial videos yet. Each Beast Topic links to a YouTube search for its subject in the meantime.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {content.videos.slice(0, 3).map((v) => (
                  <Link key={v.id} href={`/learn?tab=videos&v=${v.id}`} className="group overflow-hidden rounded-lg border border-line">
                    <div className="relative aspect-video bg-bg2">
                      {youtubeId(v.url) && <img src={v.thumbnail || `https://i.ytimg.com/vi/${youtubeId(v.url)}/hqdefault.jpg`} alt="" className="h-full w-full object-cover opacity-80 group-hover:opacity-100" />}
                      <PlayCircle className="absolute inset-0 m-auto text-white/90" size={36} />
                    </div>
                    <div className="p-2 text-xs font-medium">{v.title}</div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          {/* G. competition updates */}
          <Panel title="Competition Updates">
            {content.announcements.length === 0 ? (
              <div className="space-y-2 text-sm text-muted">
                <div>No announcements yet.</div>
                <div className="grid gap-2">
                  {LEARNING_PATHS.map((p) => (
                    <Link key={p.id} href={`/learn?path=${p.id}`} className="rounded border border-line px-3 py-2 hover:border-brand">
                      <div className="text-xs font-semibold text-text">{COMPETITIONS[p.id].name}</div>
                      <div className="text-[11px]">{p.tagline}</div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="space-y-3">
                {content.announcements.slice(-5).reverse().map((a) => (
                  <li key={a.id} className="border-l-2 border-accent pl-3">
                    <div className="text-sm font-semibold">{a.title}</div>
                    <div className="text-xs text-muted">{a.body}</div>
                    <div className="font-mono text-[10px] text-dim">{new Date(a.at).toLocaleDateString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
