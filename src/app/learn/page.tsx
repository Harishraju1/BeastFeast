"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Bookmark, CheckCircle2, PlayCircle } from "lucide-react";
import { LEARNING_PATHS, TOPICS, getTopicsForPath, type PathId } from "@/lib/learning";
import { useApp } from "@/lib/store/app";
import { Badge, LinkButton, PageHeader, Panel, Progress, Tabs } from "@/components/ui";
import { History } from "lucide-react";
import { embedUrl, youtubeId } from "@/lib/youtube";

function Inner() {
  const sp = useSearchParams();
  const { progress, content, updateProgress, user } = useApp();
  const [tab, setTab] = useState<"topics" | "videos">(sp.get("tab") === "videos" ? "videos" : "topics");
  const [path, setPath] = useState<PathId>((sp.get("path") as PathId) ?? "line");
  const [vcat, setVcat] = useState("All");
  const [playing, setPlaying] = useState<string | null>(sp.get("v"));
  const done = new Set(progress?.completedTopics ?? []);
  const marks = new Set(progress?.bookmarks ?? []);
  const topics = getTopicsForPath(path);
  const cont = progress?.lastTopic ? TOPICS.find((t) => t.id === progress.lastTopic) : null;
  const videos = content.videos.filter((v) => vcat === "All" || v.category === vcat);
  const playingVideo = content.videos.find((v) => v.id === playing);

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <PageHeader kicker="ROBOTICS LEARNING ACADEMY" title="Beast Topics" actions={<><LinkButton href="/learn/history" variant="outline" size="sm"><History size={14} /> Quiz history</LinkButton><Tabs value={tab} onChange={setTab} items={[{ value: "topics", label: "Learning paths" }, { value: "videos", label: `Video library (${content.videos.length})` }]} /></>}>
        84 topics across three competition paths — each with beginner and technical explanations, diagrams, examples, common mistakes and a mini quiz.
      </PageHeader>

      {tab === "topics" && (
        <>
          {cont && (
            <Link href={`/learn/${cont.id}`} className="mb-5 flex items-center justify-between rounded-lg border border-accent/50 bg-accent/5 px-4 py-3 hover:bg-accent/10">
              <span className="text-sm">Continue reading: <b>{cont.title}</b></span>
              <span className="text-accent-ink">→</span>
            </Link>
          )}
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            {LEARNING_PATHS.map((p) => {
              const ids = p.topicIds;
              const pct = (ids.filter((id) => done.has(id)).length / ids.length) * 100;
              return (
                <button key={p.id} onClick={() => setPath(p.id)} className={`bf-panel p-4 text-left transition ${path === p.id ? "bf-glow-accent border-accent" : "hover:border-line2"}`}>
                  <div className="bf-label">PATH {p.id === "line" ? "A" : p.id === "race" ? "B" : "C"}</div>
                  <div className="font-display text-lg font-bold">{p.title}</div>
                  <div className="mb-3 text-xs text-muted">{p.tagline}</div>
                  <Progress value={pct} tone={pct >= 100 ? "ok" : "accent"} />
                  <div className="mt-1 text-[11px] text-dim">{ids.filter((id) => done.has(id)).length} / {ids.length} topics completed</div>
                </button>
              );
            })}
          </div>
          <Panel title={LEARNING_PATHS.find((p) => p.id === path)!.title} bodyClass="p-0">
            <ol>
              {topics.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0 hover:bg-panel2/50">
                  <span className="w-7 font-mono text-xs text-dim">{String(t.order).padStart(2, "0")}</span>
                  {done.has(t.id) ? <CheckCircle2 size={16} className="text-ok" /> : <span className="h-4 w-4 rounded-full border border-line2" />}
                  <Link href={`/learn/${t.id}`} className="flex-1 hover:text-accent-ink">
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-muted">{t.summary}</div>
                  </Link>
                  <span className="hidden text-xs text-dim sm:inline">{t.minutes} min · {t.quiz.length} Qs</span>
                  {user && (
                    <button title={marks.has(t.id) ? "Remove bookmark" : "Bookmark"} onClick={() => void updateProgress((p) => ({ ...p, bookmarks: marks.has(t.id) ? p.bookmarks.filter((b) => b !== t.id) : [...p.bookmarks, t.id] }))}>
                      <Bookmark size={15} className={marks.has(t.id) ? "fill-accent text-accent-ink" : "text-dim"} />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </Panel>
        </>
      )}

      {tab === "videos" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {["All", "Electronics", "Arduino", "Sensors", "Motor Drivers", "Chassis", "Line Following", "Robo Race", "Robo War", "Advanced Robotics"].map((c) => (
              <button key={c} onClick={() => setVcat(c)} className={`rounded-full border px-3 py-1 text-xs ${vcat === c ? "border-accent text-accent-ink" : "border-line text-muted"}`}>{c}</button>
            ))}
          </div>
          {playingVideo && youtubeId(playingVideo.url) && (
            <div className="overflow-hidden rounded-xl border border-line">
              <iframe className="aspect-video w-full" src={embedUrl(youtubeId(playingVideo.url)!)} title={playingVideo.title} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="p-3">
                <div className="font-semibold">{playingVideo.title}</div>
                <div className="text-xs text-muted">{playingVideo.description}</div>
              </div>
            </div>
          )}
          {videos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line2 p-8 text-center text-sm text-muted">No videos in this category yet. Administrators add tutorial videos from the Admin dashboard.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {videos.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setPlaying(v.id);
                    if (user) void updateProgress((p) => ({ ...p, watchedVideos: [...new Set([...p.watchedVideos, v.id])] }));
                  }}
                  className="overflow-hidden rounded-lg border border-line text-left hover:border-accent"
                >
                  <div className="relative aspect-video bg-bg2">
                    {youtubeId(v.url) && <img src={v.thumbnail || `https://i.ytimg.com/vi/${youtubeId(v.url)}/hqdefault.jpg`} alt="" className="h-full w-full object-cover" />}
                    <PlayCircle className="absolute inset-0 m-auto text-white/90" size={34} />
                  </div>
                  <div className="space-y-1 p-2">
                    <div className="text-sm font-medium">{v.title}</div>
                    <div className="flex gap-1"><Badge>{v.category}</Badge><Badge tone="brand">{v.difficulty}</Badge>{progress?.watchedVideos.includes(v.id) && <Badge tone="ok">watched</Badge>}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LearnPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
