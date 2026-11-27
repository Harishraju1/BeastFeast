"use client";
import { VideoThumb } from "@/components/video/VideoPlayer";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Bell, CheckCircle2, Info, Megaphone, PlayCircle, Sparkles, X } from "lucide-react";
import { useApp, type Toast } from "@/lib/store/app";

/* ── what the student has already seen (per browser) ─────────────────────────────── */
const SEEN_KEY = "bf.seen.v1";
type Seen = { announcementsAt: string; videoIds: string[] };
const listeners = new Set<() => void>();
let cache: Seen | null = null;
function readSeen(): Seen {
  if (cache) return cache;
  try {
    cache = { announcementsAt: "", videoIds: [], ...JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") };
  } catch {
    cache = { announcementsAt: "", videoIds: [] };
  }
  return cache!;
}
function writeSeen(s: Seen) {
  const prev = readSeen();
  if (prev.announcementsAt === s.announcementsAt && prev.videoIds.length === s.videoIds.length && prev.videoIds.every((id, i) => id === s.videoIds[i])) return; // nothing new
  cache = s;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the badge just resets next visit */
  }
  listeners.forEach((l) => l());
}
const EMPTY_SEEN: Seen = { announcementsAt: "", videoIds: [] };
function useSeen(): Seen {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    readSeen,
    () => EMPTY_SEEN,
  );
}

/** Announcements and videos the student hasn't opened yet, plus unread activity notices. */
export function useUnread() {
  const { content, notices } = useApp();
  const seen = useSeen();
  return useMemo(() => {
    const announcements = content.announcements.filter((a) => a.at > seen.announcementsAt).length;
    const videos = content.videos.filter((v) => !seen.videoIds.includes(v.id)).length;
    const activity = notices.filter((n) => !n.read).length;
    return { announcements, videos, activity, total: announcements + videos + activity };
  }, [content.announcements, content.videos, notices, seen]);
}

export function markAnnouncementsSeen() {
  const { content } = useApp.getState();
  const latest = content.announcements.reduce((m, a) => (a.at > m ? a.at : m), readSeen().announcementsAt);
  writeSeen({ ...readSeen(), announcementsAt: latest, videoIds: content.videos.map((v) => v.id) });
}

/* ── notice styling ─────────────────────────────────────────────────────────────── */
const TONE: Record<Toast["kind"], { icon: typeof Info; cls: string }> = {
  xp: { icon: Sparkles, cls: "text-accent-ink" },
  success: { icon: CheckCircle2, cls: "text-ok" },
  error: { icon: AlertTriangle, cls: "text-bad" },
  info: { icon: Info, cls: "text-info" },
};

/**
 * The newest notice, shown inside a bar (page header or workspace toolbar) instead of floating over
 * the canvas. Disappears on its own, like the floating version.
 */
export function InlineNotice({ className = "" }: { className?: string }) {
  const { toasts, dismissToast } = useApp();
  const t = toasts[toasts.length - 1];
  if (!t) return null;
  const { icon: Icon, cls } = TONE[t.kind];
  return (
    <button
      key={t.id}
      onClick={() => dismissToast(t.id)}
      title={`${t.text} (click to dismiss)`}
      aria-live="polite"
      className={`bf-rise flex min-w-0 max-w-[min(28rem,40vw)] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${t.kind === "xp" ? "border-accent bg-accent font-display font-bold text-white" : "border-line2 bg-panel text-text"} ${className}`}
    >
      <Icon size={13} className={`shrink-0 ${t.kind === "xp" ? "text-white" : cls}`} />
      <span className="truncate">{t.text}</span>
      {toasts.length > 1 && <span className="shrink-0 rounded bg-panel2 px-1 font-mono text-[10px] text-muted">+{toasts.length - 1}</span>}
    </button>
  );
}

/* ── bell + side panel ──────────────────────────────────────────────────────────── */
export function NotificationBell({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const unread = useUnread();
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button className={`relative rounded-md p-2 text-muted hover:bg-panel hover:text-text ${className}`} aria-label={`Notifications${unread.total ? ` (${unread.total} new)` : ""}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Bell size={18} />
        {unread.total > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] font-bold text-white">{unread.total > 9 ? "9+" : unread.total}</span>
        )}
      </button>
      {/* portal: the header's backdrop blur would otherwise clip a fixed panel; in full screen only that element is visible */}
      {open && createPortal(<NotificationPanel onClose={close} />, document.fullscreenElement ?? document.body)}
    </>
  );
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { content, notices, markNoticesRead, clearNotices } = useApp();
  const seen = useSeen();
  // what was new when the panel opened stays highlighted while it is open
  const [snapshot] = useState(seen);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  // once per opening: everything shown now counts as read
  useEffect(() => {
    markNoticesRead();
    markAnnouncementsSeen();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the panel opens, not on every render
  }, []);
  const announcements = [...content.announcements].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  const videos = [...content.videos].reverse().slice(0, 4);

  return (
    <div className="fixed inset-0 z-[80]" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Notifications"
        className="bf-panel bf-raised absolute right-0 top-0 flex h-full w-[min(24rem,100vw)] flex-col rounded-none border-y-0 border-r-0"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold"><Bell size={16} /> Notifications</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:text-text" aria-label="Close notifications"><X size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-sm">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="bf-label flex items-center gap-1.5"><Megaphone size={12} /> Announcements</h3>
              <Link href="/announcements" onClick={onClose} className="text-xs text-accent-ink hover:underline">View all →</Link>
            </div>
            {announcements.length === 0 ? <p className="text-xs text-muted">No announcements yet.</p> : (
              <ul className="space-y-2">
                {announcements.map((a) => (
                  <li key={a.id} className={`rounded-md border px-3 py-2 ${a.at > snapshot.announcementsAt ? "border-accent/60 bg-accent/5" : "border-line"}`}>
                    <div className="font-medium">{a.title}</div>
                    <div className="line-clamp-2 text-xs text-muted">{a.body}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-dim">{new Date(a.at).toLocaleDateString(undefined, { dateStyle: "medium" })}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="bf-label flex items-center gap-1.5"><PlayCircle size={12} /> Videos</h3>
              <Link href="/announcements#videos" onClick={onClose} className="text-xs text-accent-ink hover:underline">All videos →</Link>
            </div>
            {videos.length === 0 ? <p className="text-xs text-muted">No videos yet.</p> : (
              <ul className="space-y-2">
                {videos.map((v) => {
                  return (
                    <li key={v.id}>
                      <Link href={`/announcements?video=${encodeURIComponent(v.id)}#videos`} onClick={onClose} className={`flex items-center gap-2.5 rounded-md border p-1.5 hover:border-accent ${!snapshot.videoIds.includes(v.id) ? "border-accent/60 bg-accent/5" : "border-line"}`}>
                        <VideoThumb video={v} className="h-10 w-16 shrink-0 rounded" iconSize={14} />
                        <span className="line-clamp-2 text-xs font-medium">{v.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="bf-label">Recent activity</h3>
              {notices.length > 0 && <button onClick={clearNotices} className="text-xs text-muted hover:underline">Clear</button>}
            </div>
            {notices.length === 0 ? <p className="text-xs text-muted">Messages such as XP earned, saves and validation results appear here.</p> : (
              <ul className="space-y-1.5">
                {notices.map((n) => {
                  const { icon: Icon, cls } = TONE[n.kind];
                  return (
                    <li key={n.id} className="flex gap-2 rounded px-1 py-1">
                      <Icon size={14} className={`mt-0.5 shrink-0 ${cls}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-xs">{n.text}</span>
                        <span className="font-mono text-[10px] text-dim">{new Date(n.at).toLocaleTimeString(undefined, { timeStyle: "short" })}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
