"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Link2, Loader2, Pencil, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { getBackend } from "@/lib/data";
import { VIDEO_CATEGORIES, type Video } from "@/lib/data/types";
import { useApp } from "@/lib/store/app";
import { Badge, Button, Field, Panel } from "@/components/ui";
import { TOPICS } from "@/lib/learning";
import { PROVIDER_LABEL, VIDEO_UPLOAD, parseVideoUrl, sniffVideo, videoFileError } from "@/lib/video/providers";
import { UploadCancelled } from "@/lib/video/upload";
import { VideoPlayer, VideoThumb } from "@/components/video/VideoPlayer";

const newId = () => `vid-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const blank = (): Video => ({ id: newId(), title: "", url: "", description: "", competition: "all", difficulty: "beginner", category: "Electronics", published: true });
const mb = (n?: number) => (n ? `${(n / 1048576).toFixed(1)} MB` : "");

type UploadState = { phase: "idle" } | { phase: "uploading"; fraction: number; what: string } | { phase: "failed"; message: string } | { phase: "done" };

/**
 * Admin → Videos. One library for uploaded files and platform links. Every write goes through the backend, which
 * the database authorises (administrators only); nothing here is trusted on its own.
 */
export function VideoManager() {
  const { toast, refreshContent } = useApp();
  const [list, setList] = useState<Video[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [v, setV] = useState<Video>(blank);
  const [editing, setEditing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [up, setUp] = useState<UploadState>({ phase: "idle" });
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<{ loading: boolean; note?: string | null; author?: string | null }>({ loading: false });
  const abort = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    try {
      setList(await (await getBackend()).adminListVideos());
      setLoadErr(null);
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the library from the server once
    void reload();
  }, [reload]);

  const parsed = mode === "url" && v.url ? parseVideoUrl(v.url) : null;
  const urlErr = mode === "url" && v.url.trim() && !parsed ? "This link is not a supported video (YouTube, Shorts, Vimeo, Dailymotion, Instagram, Facebook or X)." : null;

  // title / thumbnail suggestions from the platform (server-side oEmbed, admins only)
  useEffect(() => {
    if (mode !== "url" || !parsed) return;
    const t = setTimeout(() => {
      setMeta({ loading: true });
      void fetch(`/api/oembed?url=${encodeURIComponent(parsed.canonical)}`, { credentials: "same-origin" })
        .then((r) => r.json() as Promise<{ title?: string | null; author?: string | null; thumbnail?: string | null; note?: string | null }>)
        .then((o) => {
          setMeta({ loading: false, note: o.note, author: o.author });
          setV((cur) => ({ ...cur, title: cur.title || o.title || "", thumbnail: cur.thumbnail || o.thumbnail || undefined }));
        })
        .catch(() => setMeta({ loading: false }));
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the canonical link changes
  }, [mode, parsed?.canonical]);

  const reset = () => {
    setV(blank());
    setFile(null);
    setThumb(null);
    setFileErr(null);
    setUp({ phase: "idle" });
    setEditing(false);
    setMeta({ loading: false });
  };

  const chooseFile = async (f: File | undefined) => {
    setFileErr(null);
    setUp({ phase: "idle" });
    if (!f) return setFile(null);
    const e = videoFileError(f);
    if (e) return setFileErr(e), setFile(null);
    const kind = sniffVideo(new Uint8Array(await f.slice(0, 16).arrayBuffer()));
    if (!kind) return setFileErr("This file is not a real MP4, WebM or MOV video."), setFile(null);
    setFile(f);
    if (!v.title) setV((cur) => ({ ...cur, title: f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 140) }));
  };
  const chooseThumb = (f: File | undefined) => {
    if (!f) return setThumb(null);
    if (!(VIDEO_UPLOAD.thumbTypes as readonly string[]).includes(f.type)) return toast("error", "Thumbnails must be JPEG, PNG or WebP.");
    if (f.size > VIDEO_UPLOAD.thumbMaxBytes) return toast("error", "Thumbnails must be 2 MB or smaller.");
    setThumb(f);
  };

  const save = async () => {
    if (saving || up.phase === "uploading") return;
    const title = v.title.trim();
    if (title.length < 2) return toast("error", "Enter a title (at least 2 characters).");
    if (v.thumbnail && !/^https:\/\//.test(v.thumbnail)) return toast("error", "The thumbnail link must start with https://");
    const b = await getBackend();
    let next: Video = { ...v, title };
    if (mode === "url") {
      if (!parsed) return toast("error", urlErr ?? "Enter a video link.");
      next = { ...next, source: "url", provider: parsed.provider, url: parsed.canonical, vertical: parsed.vertical, storagePath: undefined, mime: undefined, sizeBytes: undefined };
    } else if (!editing || file) {
      if (!file) return toast("error", "Choose a video file to upload.");
      abort.current = new AbortController();
      setUp({ phase: "uploading", fraction: 0, what: "video" });
      try {
        const path = await b.uploadVideoAsset("video", v.id, file, { signal: abort.current.signal, onProgress: (fraction) => setUp({ phase: "uploading", fraction, what: "video" }) });
        next = { ...next, source: "upload", provider: "upload", url: "", storagePath: path, mime: file.type || "video/mp4", sizeBytes: file.size };
      } catch (e) {
        setUp(e instanceof UploadCancelled ? { phase: "idle" } : { phase: "failed", message: (e as Error).message });
        if (e instanceof UploadCancelled) toast("info", "Upload cancelled. Nothing was saved.");
        return;
      }
    }
    if (thumb) {
      abort.current = new AbortController();
      setUp({ phase: "uploading", fraction: 0, what: "thumbnail" });
      try {
        next = { ...next, thumbnailPath: await b.uploadVideoAsset("thumb", v.id, thumb, { signal: abort.current.signal, onProgress: (fraction) => setUp({ phase: "uploading", fraction, what: "thumbnail" }) }), thumbnail: undefined };
      } catch (e) {
        setUp(e instanceof UploadCancelled ? { phase: "idle" } : { phase: "failed", message: (e as Error).message });
        return;
      }
    }
    setSaving(true);
    try {
      await b.saveVideo(next);
      setUp({ phase: "done" });
      toast("success", editing ? "Video updated" : next.published === false ? "Saved as a draft (not visible to students)" : "Video published");
      reset();
      await Promise.all([reload(), refreshContent()]);
    } catch (e) {
      setUp({ phase: "failed", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const edit = (x: Video) => {
    setV(x);
    setEditing(true);
    setMode(x.source === "upload" ? "upload" : "url");
    setFile(null);
    setThumb(null);
    setUp({ phase: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const togglePublish = async (x: Video) => {
    try {
      await (await getBackend()).saveVideo({ ...x, published: x.published === false });
      await Promise.all([reload(), refreshContent()]);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const remove = async (x: Video) => {
    if (!window.confirm(`Delete "${x.title}"?${x.source === "upload" ? " The uploaded file is deleted too." : ""} This cannot be undone.`)) return;
    try {
      await (await getBackend()).deleteVideo(x);
      toast("success", "Video deleted");
      await Promise.all([reload(), refreshContent()]);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const busy = saving || up.phase === "uploading";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={editing ? "Edit video" : "Add a video"} actions={editing ? <Button size="sm" onClick={reset}><X size={13} /> Cancel edit</Button> : undefined}>
        <div className="space-y-3">
          <div className="flex gap-1" role="tablist" aria-label="How to add the video">
            <Button size="sm" variant={mode === "upload" ? "primary" : "outline"} aria-pressed={mode === "upload"} disabled={editing || busy} onClick={() => setMode("upload")}><Upload size={13} /> Upload from device</Button>
            <Button size="sm" variant={mode === "url" ? "primary" : "outline"} aria-pressed={mode === "url"} disabled={editing || busy} onClick={() => setMode("url")}><Link2 size={13} /> Add by URL</Button>
          </div>

          {mode === "upload" ? (
            <Field key="f-file" label={editing ? "Replace the video file (optional)" : "Video file"} hint="MP4, WebM or MOV, up to 50 MB.">
              <input key="video-file" type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" className="bf-input" disabled={busy} onChange={(e) => void chooseFile(e.target.files?.[0])} data-testid="video-file" />
              {file && <div className="mt-1 text-xs text-muted">{file.name} · {mb(file.size)}</div>}
              {editing && !file && v.sizeBytes && <div className="mt-1 text-xs text-muted">Current file: {mb(v.sizeBytes)}</div>}
              {fileErr && <div role="alert" className="mt-1 text-xs text-accent-ink">{fileErr}</div>}
            </Field>
          ) : (
            <Field key="f-url" label="Video link" hint="YouTube, YouTube Shorts, Vimeo, Dailymotion, Instagram, Facebook or X.">
              <input key="video-url" className="bf-input" value={v.url} disabled={busy} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => setV({ ...v, url: e.target.value.trim() })} data-testid="video-url" />
              {urlErr && <div role="alert" className="mt-1 text-xs text-accent-ink">{urlErr}</div>}
              {parsed && (
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                  <Badge tone="brand">{PROVIDER_LABEL[parsed.provider]}</Badge>
                  {parsed.embed ? "plays inside BEAST FEAST" : "no embeddable player — students get a link to open it"}
                  {meta.loading && <Loader2 size={12} className="animate-spin" />}
                  {meta.author && <span>· by {meta.author}</span>}
                  {meta.note && <span className="text-warn">· {meta.note}</span>}
                </div>
              )}
            </Field>
          )}

          <Field label="Title"><input className="bf-input" value={v.title} maxLength={140} disabled={busy} onChange={(e) => setV({ ...v, title: e.target.value })} data-testid="video-title" /></Field>
          <Field label="Description"><textarea className="bf-input" value={v.description} maxLength={2000} disabled={busy} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Thumbnail image (optional)"><input type="file" accept="image/jpeg,image/png,image/webp" className="bf-input" disabled={busy} onChange={(e) => chooseThumb(e.target.files?.[0])} /></Field>
            <Field label="…or thumbnail link"><input className="bf-input" value={v.thumbnail ?? ""} disabled={busy || !!thumb} placeholder="https://…" onChange={(e) => setV({ ...v, thumbnail: e.target.value.trim() || undefined })} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Category"><select className="bf-input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as Video["category"] })}>{VIDEO_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Competition"><select className="bf-input" value={v.competition} onChange={(e) => setV({ ...v, competition: e.target.value as Video["competition"] })}>{["all", "race", "line", "sumo"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Difficulty"><select className="bf-input" value={v.difficulty} onChange={(e) => setV({ ...v, difficulty: e.target.value as Video["difficulty"] })}>{["beginner", "intermediate", "advanced"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
          <Field label="Related topic"><select className="bf-input" value={v.topicId ?? ""} onChange={(e) => setV({ ...v, topicId: e.target.value || undefined })}><option value="">—</option>{TOPICS.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.published !== false} onChange={(e) => setV({ ...v, published: e.target.checked })} /> Published (visible to students)</label>

          {up.phase === "uploading" && (
            <div className="space-y-1" role="status" aria-live="polite" data-testid="video-progress">
              <div className="flex justify-between text-xs"><span>Uploading {up.what}…</span><span className="font-mono">{Math.round(up.fraction * 100)} %</span></div>
              <div className="h-2 overflow-hidden rounded bg-line"><div className="h-full bg-brand transition-all" style={{ width: `${up.fraction * 100}%` }} /></div>
              <Button size="sm" onClick={() => abort.current?.abort()}><X size={13} /> Cancel upload</Button>
            </div>
          )}
          {up.phase === "failed" && (
            <div role="alert" className="flex items-center justify-between gap-2 rounded border border-accent/50 bg-accent/10 px-2 py-1.5 text-xs text-accent-ink">
              <span>{up.message}</span>
              <Button size="sm" onClick={() => void save()}><RotateCcw size={13} /> Retry</Button>
            </div>
          )}
          <Button variant="primary" onClick={() => void save()} disabled={busy} data-testid="video-save">
            {busy ? <><Loader2 size={14} className="mr-1 animate-spin" /> Working…</> : editing ? "Save changes" : v.published === false ? "Save draft" : "Publish video"}
          </Button>

          {mode === "url" && parsed && (
            <div className="overflow-hidden rounded-lg border border-line">
              <div className="bf-label bg-bg2 px-2 py-1">Preview</div>
              <VideoPlayer video={{ ...v, source: "url", provider: parsed.provider, url: parsed.canonical }} />
            </div>
          )}
        </div>
      </Panel>

      <Panel title={`Video library (${list?.length ?? "…"})`}>
        {loadErr && <div role="alert" className="mb-2 rounded border border-accent/50 bg-accent/10 px-2 py-1.5 text-xs text-accent-ink">{loadErr}</div>}
        {list === null && !loadErr && <div className="text-sm text-muted"><Loader2 size={14} className="mr-1 inline animate-spin" /> Loading…</div>}
        {list?.length === 0 && <div className="text-sm text-muted">No videos yet. Upload one or add a link.</div>}
        <ul className="divide-y divide-line" data-testid="video-library">
          {list?.map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-2 text-sm">
              <VideoThumb video={x} className="aspect-video w-24 shrink-0 rounded" iconSize={18} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{x.title}</div>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  <Badge tone="brand">{PROVIDER_LABEL[x.provider ?? "youtube"]}</Badge>
                  <Badge>{x.category}</Badge>
                  {x.published === false && <Badge tone="warn">draft</Badge>}
                  {x.sizeBytes ? <span className="text-dim">{mb(x.sizeBytes)}</span> : null}
                </div>
              </div>
              <Button size="sm" onClick={() => edit(x)} aria-label={`Edit ${x.title}`}><Pencil size={13} /></Button>
              <Button size="sm" onClick={() => void togglePublish(x)} aria-label={x.published === false ? `Publish ${x.title}` : `Unpublish ${x.title}`} title={x.published === false ? "Publish" : "Unpublish (hide from students)"}>{x.published === false ? <Eye size={13} /> : <EyeOff size={13} />}</Button>
              <Button size="sm" variant="danger" onClick={() => void remove(x)} aria-label={`Delete ${x.title}`}><Trash2 size={13} /></Button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
