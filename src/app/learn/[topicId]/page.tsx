"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { AlertTriangle, Bookmark, CheckCircle2, ExternalLink, Lightbulb } from "lucide-react";
import { getTopic, getTopicsForPath } from "@/lib/learning";
import { findByName } from "@/lib/catalogue";
import { useApp } from "@/lib/store/app";
import { Badge, Button, Panel } from "@/components/ui";
import { Diagram, Prose } from "@/components/learn/Diagram";
import { QuizRunner } from "@/components/learn/QuizRunner";
import { embedUrl, youtubeId } from "@/lib/youtube";

export default function TopicPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const t = getTopic(topicId);
  const { user, progress, updateProgress, award, content } = useApp();
  useEffect(() => {
    if (user && t && progress && progress.lastTopic !== t.id) void updateProgress((p) => ({ ...p, lastTopic: t.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id, user?.id, !!progress]);
  if (!t) return <div className="p-8 text-muted">Topic not found. <Link href="/learn" className="text-orange">Back</Link></div>;
  const list = getTopicsForPath(t.pathId);
  const idx = list.findIndex((x) => x.id === t.id);
  const done = progress?.completedTopics.includes(t.id);
  const marked = progress?.bookmarks.includes(t.id);
  const override = content.topicOverrides[t.id];
  const videos = content.videos.filter((v) => v.topicId === t.id);
  const extraQ = content.extraQuestions.filter((e) => e.topicId === t.id).map((e) => e.question);

  const complete = async () => {
    if (!user) return;
    await updateProgress((p) => ({ ...p, completedTopics: [...new Set([...p.completedTopics, t.id])] }));
    await award("lesson-complete", t.id);
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <Link href={`/learn?path=${t.pathId}`} className="text-xs text-muted hover:text-text">← {t.pathId.toUpperCase()} path</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="bf-label text-orange">TOPIC {t.order} · {t.minutes} MIN</div>
          <h1 className="font-display text-3xl font-bold">{override?.title ?? t.title}</h1>
          <p className="mt-1 text-muted">{override?.summary ?? t.summary}</p>
        </div>
        {user && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void updateProgress((p) => ({ ...p, bookmarks: marked ? p.bookmarks.filter((b) => b !== t.id) : [...p.bookmarks, t.id] }))}><Bookmark size={13} className={marked ? "fill-orange text-orange" : ""} /> {marked ? "Bookmarked" : "Bookmark"}</Button>
            <Button size="sm" variant={done ? "outline" : "primary"} onClick={() => void complete()} disabled={done}><CheckCircle2 size={13} /> {done ? "Completed" : "Mark as completed"}</Button>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-6">
        <section><h2 className="mb-2 font-display text-xl font-semibold">Introduction</h2><Prose text={t.introduction} /></section>
        <Panel title="Beginner explanation"><Prose text={t.beginner} /></Panel>
        <section>
          <h2 className="mb-2 font-display text-xl font-semibold">Detailed technical explanation</h2>
          {t.technical.map((s) => (
            <div key={s.heading} className="mb-4">
              <h3 className="mb-1 font-semibold text-cyan">{s.heading}</h3>
              <Prose text={s.body} />
            </div>
          ))}
        </section>
        {t.diagrams.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">Technical diagrams</h2>
            {t.diagrams.map((d, i) => <Diagram key={i} spec={d} />)}
          </section>
        )}
        <section><h2 className="mb-2 font-display text-xl font-semibold">Working principle</h2><Prose text={t.workingPrinciple} /></section>
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Practical examples</h2>
          {t.examples.map((e) => (
            <div key={e.title} className="rounded-lg border border-line p-3">
              <div className="mb-1 font-semibold">{e.title}</div>
              <Prose text={e.body} />
              {e.code && <pre className="mt-2 overflow-auto rounded bg-black p-3 font-mono text-xs text-[#cfe3ff]">{e.code}</pre>}
            </div>
          ))}
        </section>
        <section>
          <h2 className="mb-2 font-display text-xl font-semibold">Common mistakes</h2>
          <div className="space-y-2">
            {t.commonMistakes.map((m) => (
              <div key={m.mistake} className="rounded-lg border border-warn/30 bg-warn/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold text-warn"><AlertTriangle size={14} /> {m.mistake}</div>
                <div className="mt-1 text-muted"><b className="text-text">Why it fails:</b> {m.why}</div>
                <div className="text-muted"><b className="text-ok">Fix:</b> {m.fix}</div>
              </div>
            ))}
          </div>
        </section>
        {override?.extraNotes && <Panel title="Notes from your instructors"><Prose text={override.extraNotes} /></Panel>}
        <Panel title="Key takeaways">
          <ul className="space-y-1 text-sm">{t.keyTakeaways.map((k) => <li key={k} className="flex gap-2"><Lightbulb size={14} className="mt-0.5 shrink-0 text-orange" />{k}</li>)}</ul>
        </Panel>
        {t.relatedComponents.length > 0 && (
          <section>
            <h2 className="mb-2 font-display text-xl font-semibold">Components in this topic</h2>
            <div className="flex flex-wrap gap-2">
              {t.relatedComponents.map((n) => {
                const c = findByName(n);
                return c ? <Link key={n} href={`/library?c=${c.id}`} className="rounded border border-line px-2.5 py-1 text-xs hover:border-cyan">{n}</Link> : <Badge key={n}>{n}</Badge>;
              })}
            </div>
            <p className="mt-1 text-[11px] text-dim">Verified photos are added by administrators; the library shows generated pinouts and procedural models.</p>
          </section>
        )}
        <section>
          <h2 className="mb-2 font-display text-xl font-semibold">YouTube tutorials</h2>
          {videos.map((v) => youtubeId(v.url) && (
            <div key={v.id} className="mb-3 overflow-hidden rounded-lg border border-line">
              <iframe className="aspect-video w-full" src={embedUrl(youtubeId(v.url)!)} title={v.title} allowFullScreen />
              <div className="p-2 text-sm">{v.title}</div>
            </div>
          ))}
          <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(t.youtubeSearch)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-cyan hover:underline">
            Search YouTube for “{t.youtubeSearch}” <ExternalLink size={12} />
          </a>
        </section>
        <Panel title="Mini quiz">
          <QuizRunner quizId={`topic:${t.id}`} questions={[...t.quiz, ...extraQ]} title={t.title} passPercent={60} />
        </Panel>
        <div className="flex justify-between text-sm">
          {idx > 0 ? <Link className="text-cyan" href={`/learn/${list[idx - 1].id}`}>← {list[idx - 1].title}</Link> : <span />}
          {idx < list.length - 1 && <Link className="text-cyan" href={`/learn/${list[idx + 1].id}`}>{list[idx + 1].title} →</Link>}
        </div>
      </div>
    </div>
  );
}
