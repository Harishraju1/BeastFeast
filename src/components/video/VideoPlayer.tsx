"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Film, Loader2, PlayCircle } from "lucide-react";
import { getBackend } from "@/lib/data";
import type { Video } from "@/lib/data/types";
import { PROVIDER_LABEL, parseVideoUrl } from "@/lib/video/providers";

/** Where a video plays: an uploaded file, an official platform embed, or nothing (link-out fallback). */
export function videoKind(v: Video): { kind: "upload" } | { kind: "embed"; src: string; vertical: boolean } | { kind: "link"; href: string | null } {
  if (v.source === "upload" && v.storagePath) return { kind: "upload" };
  const p = parseVideoUrl(v.url);
  if (p?.embed) return { kind: "embed", src: p.embed, vertical: p.vertical || !!v.vertical };
  return { kind: "link", href: p?.canonical ?? (/^https:\/\//.test(v.url) ? v.url : null) };
}

/** Signed / local URL for an uploaded file (null while loading or when it cannot be read). */
function useAssetUrl(path: string | undefined): { url: string | null; failed: boolean } {
  const [st, setSt] = useState<{ path?: string; url: string | null; failed: boolean }>({ url: null, failed: false });
  useEffect(() => {
    if (!path) return;
    let live = true;
    void getBackend()
      .then((b) => b.videoAssetUrl(path))
      .then((url) => live && setSt({ path, url, failed: !url }))
      .catch(() => live && setSt({ path, url: null, failed: true }));
    return () => {
      live = false;
    };
  }, [path]);
  return st.path === path ? st : { url: null, failed: false };
}

function Unavailable({ v, href }: { v: Video; href: string | null }) {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-bg2 p-4 text-center text-sm" data-testid="video-unavailable">
      <Film size={28} className="text-dim" />
      <div>Preview unavailable. Open the original video.</div>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
          Open on {PROVIDER_LABEL[v.provider ?? parseVideoUrl(v.url)?.provider ?? "youtube"]} <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

/**
 * The player. Embeds are sandboxed iframes on a fixed official address (never admin HTML); uploads play in the
 * browser's own video element from a short-lived signed URL. Anything that cannot play shows the fallback.
 */
export function VideoPlayer({ video, className = "" }: { video: Video; className?: string }) {
  const k = videoKind(video);
  const asset = useAssetUrl(k.kind === "upload" ? video.storagePath : undefined);
  const poster = useAssetUrl(k.kind === "upload" ? video.thumbnailPath : undefined);
  const [broken, setBroken] = useState(false);
  if (k.kind === "upload") {
    if (asset.failed || broken) return <div className={className}><Unavailable v={video} href={null} /></div>;
    if (!asset.url) return <div className={`flex aspect-video w-full items-center justify-center bg-bg2 text-sm text-muted ${className}`}><Loader2 size={16} className="mr-2 animate-spin" /> Loading video…</div>;
    return (
      <video className={`aspect-video w-full bg-black ${className}`} src={asset.url} poster={poster.url ?? video.thumbnail} controls playsInline preload="metadata" controlsList="nodownload" onError={() => setBroken(true)} data-testid="video-upload-player">
        Your browser cannot play this video.
      </video>
    );
  }
  if (k.kind === "embed")
    return (
      <div className={`${k.vertical ? "mx-auto aspect-[9/16] max-h-[70vh]" : "aspect-video"} w-full bg-black ${className}`}>
        <iframe
          className="h-full w-full"
          src={k.src}
          title={video.title}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          data-testid="video-embed"
        />
      </div>
    );
  return <div className={className}><Unavailable v={video} href={k.href} /></div>;
}

/** Card image: admin thumbnail, uploaded poster, YouTube still, or a neutral placeholder. */
export function VideoThumb({ video, className = "", iconSize = 34 }: { video: Video; className?: string; iconSize?: number }) {
  const poster = useAssetUrl(video.thumbnailPath);
  const p = video.source === "upload" ? null : parseVideoUrl(video.url);
  const src = poster.url ?? video.thumbnail ?? p?.thumbnail ?? null;
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className={`relative overflow-hidden bg-bg2 ${className}`}>
      {src && failed !== src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote thumbnails from several platforms
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={() => setFailed(src)} />
      ) : (
        <div className="flex h-full w-full items-end justify-start bg-gradient-to-br from-bg2 to-line p-1.5 text-[9px] uppercase tracking-wider text-muted">{PROVIDER_LABEL[video.provider ?? p?.provider ?? "youtube"]}</div>
      )}
      <PlayCircle className="absolute inset-0 m-auto text-white/90 drop-shadow" size={iconSize} />
    </div>
  );
}
