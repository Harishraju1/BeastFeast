"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Megaphone, PlayCircle, Swords, Trophy, X } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { useApp } from "@/lib/store/app";
import type { Announcement } from "@/lib/data/types";
import { embedUrl, youtubeId } from "@/lib/youtube";
import { markAnnouncementsSeen } from "@/components/shell/Notifications";
import { COMPETITIONS } from "@/lib/types";

const KIND: Record<Announcement["kind"], { label: string; icon: typeof Megaphone; tone: "accent" | "brand" | "dim" }> = {
  announcement: { label: "Announcement", icon: Megaphone, tone: "accent" },
  competition: { label: "Competition", icon: Trophy, tone: "brand" },
  challenge: { label: "Challenge", icon: Swords, tone: "dim" },
};

function Inner() {
  const { content, ready, recordActivity, user } = useApp();
  const params = useSearchParams();
  const [kind, setKind] = useState<Announcement["kind"] | "">("");
  const [playing, setPlaying] = useState<string | null>(params.get("video"));

  // opening this page counts as having seen everything on it
  useEffect(() => {
    if (ready) markAnnouncementsSeen();
  }, [ready, content.announcements.length, content.videos.length]);

  const list = useMemo(() => [...content.announcements].sort((a, b) => b.at.localeCompare(a.at)).filter((a) => !kind || a.kind === kind), [content.announcements, kind]);
  const videos = useMemo(() => [...content.videos].reverse(), [content.videos]);
  const current = videos.find((v) => v.id === playing);
  const currentYt = current ? youtubeId(current.url) : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <PageHeader kicker="ROBOTICS CLUB KKH" title="Announcements">
        Club news, competition updates and new learning videos — the bell at the top of every page shows what&apos;s new.
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel
          title={`Announcements (${list.length})`}
          actions={
            <select className="bf-input !w-auto !py-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value as Announcement["kind"] | "")} aria-label="Filter announcements">
              <option value="">All types</option>
              {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          }
        >
          {list.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted">
              No announcements yet. When the club posts news, competition dates or challenges, they appear here and in the bell.
            </div>
          ) : (
            <ul className="space-y-3">
              {list.map((a) => {
                const k = KIND[a.kind] ?? KIND.announcement;
                const Icon = k.icon;
                return (
                  <li key={a.id} className="rounded-lg border border-line bg-panel2/40 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon size={16} className="text-accent-ink" />
                      <h2 className="font-display text-base font-semibold">{a.title}</h2>
                      <Badge tone={k.tone}>{k.label}</Badge>
                      <span className="ml-auto font-mono text-[11px] text-dim">{new Date(a.at).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-muted">{a.body}</p>
                  </li>
                );
              })}
            </ul>
          )}
          {user && (user.role === "admin" || user.role === "super_admin") && (
            <p className="mt-4 text-xs text-dim">Admins post announcements and videos from <Link href="/admin" className="text-accent-ink hover:underline">Admin → Announcements / Videos</Link>.</p>
          )}
        </Panel>

        <div id="videos" className="scroll-mt-20">
          <Panel title={`Videos (${videos.length})`}>
            {current && (
              <div className="mb-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{current.title}</div>
                    <div className="text-xs text-muted">{current.description}</div>
                  </div>
                  <button onClick={() => setPlaying(null)} className="rounded p-1 text-muted hover:text-text" aria-label="Close video"><X size={16} /></button>
                </div>
                {currentYt ? (
                  <iframe className="aspect-video w-full rounded-md" src={embedUrl(currentYt)} title={current.title} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                ) : (
                  <a href={current.url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-ink hover:underline">Open video ↗</a>
                )}
              </div>
            )}
            {videos.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted">No videos yet. Lesson videos are also inside each <Link href="/learn" className="text-accent-ink hover:underline">Beast Topic</Link>.</div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {videos.map((v) => {
                  const yt = youtubeId(v.url);
                  return (
                    <li key={v.id}>
                      <button
                        onClick={() => {
                          setPlaying(v.id);
                          void recordActivity("video", v.id);
                        }}
                        className={`group w-full overflow-hidden rounded-md border text-left hover:border-accent ${playing === v.id ? "border-accent" : "border-line"}`}
                      >
                        <span className="relative block aspect-video bg-bg2">
                          {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail */}
                          {yt && <img src={v.thumbnail || `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-80 group-hover:opacity-100" />}
                          <PlayCircle className="absolute inset-0 m-auto text-white/90" size={34} />
                        </span>
                        <span className="block p-2">
                          <span className="block text-xs font-medium">{v.title}</span>
                          <span className="font-mono text-[10px] text-dim">{v.competition === "all" ? "All competitions" : COMPETITIONS[v.competition].short} · {v.difficulty}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function AnnouncementsPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
