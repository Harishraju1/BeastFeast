/**
 * Video links: detect the platform and build its *official* embed address. Only these fixed templates are ever
 * placed in an iframe (each id is checked against a strict pattern first), so an admin-entered URL can never
 * inject its own iframe source. Platforms without a script-free official player (X / Twitter) and anything that
 * does not match get no iframe: the page shows "Preview unavailable. Open the original video." with a link.
 */

export type VideoProvider = "youtube" | "youtube-shorts" | "vimeo" | "dailymotion" | "instagram" | "facebook" | "x" | "upload";

export interface ParsedVideo {
  provider: Exclude<VideoProvider, "upload">;
  /** platform id (YouTube / Vimeo / Dailymotion id, Instagram shortcode, tweet id; Facebook: the canonical URL) */
  id: string;
  /** cleaned https link to the original page */
  canonical: string;
  /** official embed URL, or null when the platform has none we can use safely */
  embed: string | null;
  /** portrait player (Shorts, Reels, Instagram) */
  vertical: boolean;
  /** YouTube's still image (other platforms: from oEmbed or an admin-supplied thumbnail) */
  thumbnail: string | null;
}

export const PROVIDER_LABEL: Record<VideoProvider, string> = {
  youtube: "YouTube",
  "youtube-shorts": "YouTube Shorts",
  vimeo: "Vimeo",
  dailymotion: "Dailymotion",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X (Twitter)",
  upload: "Uploaded video",
};

/** iframe origins the embeds above use — the CSP frame-src list is built from the same hosts. */
export const EMBED_ORIGINS = ["https://www.youtube-nocookie.com", "https://www.youtube.com", "https://player.vimeo.com", "https://www.dailymotion.com", "https://geo.dailymotion.com", "https://www.instagram.com", "https://www.facebook.com"];

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const host = (u: URL) => u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");

export function parseVideoUrl(raw: string): ParsedVideo | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const h = host(u);
  const parts = u.pathname.split("/").filter(Boolean);

  // ── YouTube ──
  if (h === "youtu.be" || h === "youtube.com" || h === "youtube-nocookie.com" || h === "music.youtube.com") {
    let id: string | null = null;
    let shorts = false;
    if (h === "youtu.be") id = parts[0] ?? null;
    else if (u.pathname === "/watch") id = u.searchParams.get("v");
    else if (["embed", "live", "v", "shorts"].includes(parts[0] ?? "")) {
      id = parts[1] ?? null;
      shorts = parts[0] === "shorts";
    }
    if (!id || !YT_ID.test(id)) return null;
    return {
      provider: shorts ? "youtube-shorts" : "youtube", id,
      canonical: shorts ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
      embed: `https://www.youtube-nocookie.com/embed/${id}`, vertical: shorts,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }

  // ── Vimeo: vimeo.com/123456789[/hash], player.vimeo.com/video/123456789?h=hash ──
  if (h === "vimeo.com" || h === "player.vimeo.com") {
    const i = h === "player.vimeo.com" ? (parts[0] === "video" ? 1 : -1) : parts.findIndex((p) => /^\d{6,12}$/.test(p));
    const id = i >= 0 ? parts[i] : null;
    if (!id || !/^\d{6,12}$/.test(id)) return null;
    const hashRaw = u.searchParams.get("h") ?? (h === "vimeo.com" ? parts[i + 1] : undefined);
    const hash = hashRaw && /^[0-9a-f]{6,20}$/i.test(hashRaw) ? hashRaw : null;
    return {
      provider: "vimeo", id, canonical: `https://vimeo.com/${id}${hash ? `/${hash}` : ""}`,
      embed: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`, vertical: false, thumbnail: null,
    };
  }

  // ── Dailymotion: dailymotion.com/video/x8abcd, dai.ly/x8abcd ──
  if (h === "dailymotion.com" || h === "dai.ly") {
    const id = h === "dai.ly" ? parts[0] : parts[0] === "video" ? parts[1] : parts[0] === "embed" && parts[1] === "video" ? parts[2] : null;
    const clean = id?.split("_")[0];
    if (!clean || !/^x[0-9a-z]{4,12}$/i.test(clean)) return null;
    return { provider: "dailymotion", id: clean, canonical: `https://www.dailymotion.com/video/${clean}`, embed: `https://www.dailymotion.com/embed/video/${clean}`, vertical: false, thumbnail: `https://www.dailymotion.com/thumbnail/video/${clean}` };
  }

  // ── Instagram: /p/{code}, /reel/{code}, /reels/{code}, /tv/{code} (public posts only) ──
  if (h === "instagram.com") {
    const kind = parts[0] === "reels" ? "reel" : parts[0];
    const code = parts[1];
    if (!["p", "reel", "tv"].includes(kind ?? "") || !code || !/^[A-Za-z0-9_-]{5,40}$/.test(code)) return null;
    return { provider: "instagram", id: code, canonical: `https://www.instagram.com/${kind}/${code}/`, embed: `https://www.instagram.com/${kind}/${code}/embed`, vertical: true, thumbnail: null };
  }

  // ── Facebook: /…/videos/{id}, /watch?v={id}, /reel/{id}, fb.watch/{code} → the official video plugin ──
  if (h === "facebook.com" || h === "fb.watch" || h === "web.facebook.com") {
    let canonical: string | null = null;
    let id: string | null = null;
    let vertical = false;
    if (h === "fb.watch" && parts[0] && /^[A-Za-z0-9_-]{4,20}$/.test(parts[0])) {
      id = parts[0];
      canonical = `https://fb.watch/${id}/`;
    } else if (u.pathname === "/watch" || u.pathname === "/watch/") {
      const v = u.searchParams.get("v");
      if (v && /^\d{5,25}$/.test(v)) {
        id = v;
        canonical = `https://www.facebook.com/watch/?v=${v}`;
      }
    } else if (parts[0] === "reel" && /^\d{5,25}$/.test(parts[1] ?? "")) {
      id = parts[1];
      canonical = `https://www.facebook.com/reel/${id}`;
      vertical = true;
    } else {
      const i = parts.indexOf("videos");
      const v = i >= 0 ? parts.slice(i + 1).find((p) => /^\d{5,25}$/.test(p)) : undefined;
      if (v && parts.slice(0, i).every((p) => /^[A-Za-z0-9._-]{1,80}$/.test(p))) {
        id = v;
        canonical = `https://www.facebook.com/${[...parts.slice(0, i), "videos", v].join("/")}/`;
      }
    }
    if (!id || !canonical) return null;
    return { provider: "facebook", id, canonical, embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(canonical)}&show_text=false`, vertical, thumbnail: null };
  }

  // ── X / Twitter: no script-free official player → link only ──
  if (h === "x.com" || h === "twitter.com" || h === "mobile.twitter.com") {
    const i = parts.indexOf("status");
    const user = parts[0];
    const id = i > 0 ? parts[i + 1] : null;
    if (!id || !/^\d{5,25}$/.test(id) || !user || !/^[A-Za-z0-9_]{1,15}$/.test(user)) return null;
    return { provider: "x", id, canonical: `https://x.com/${user}/status/${id}`, embed: null, vertical: false, thumbnail: null };
  }
  return null;
}

/** Hosts whose public oEmbed endpoints the server may ask for a title / thumbnail (no keys needed). */
export function oembedEndpoint(p: ParsedVideo): string | null {
  const q = encodeURIComponent(p.canonical);
  switch (p.provider) {
    case "youtube":
    case "youtube-shorts":
      return `https://www.youtube.com/oembed?format=json&url=${q}`;
    case "vimeo":
      return `https://vimeo.com/api/oembed.json?url=${q}`;
    case "dailymotion":
      return `https://www.dailymotion.com/services/oembed?format=json&url=${q}`;
    case "x":
      return `https://publish.twitter.com/oembed?omit_script=1&url=${q}`;
    default:
      return null; // Instagram and Facebook oEmbed need an app access token
  }
}

/** Uploaded files: type and size limits (the storage bucket enforces the same). */
export const VIDEO_UPLOAD = {
  maxBytes: 50 * 1024 * 1024,
  types: ["video/mp4", "video/webm", "video/quicktime"] as const,
  thumbTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  thumbMaxBytes: 2 * 1024 * 1024,
};

export function videoFileError(f: { size: number; type: string; name: string }): string | null {
  const type = f.type || (/\.mp4$/i.test(f.name) ? "video/mp4" : /\.webm$/i.test(f.name) ? "video/webm" : /\.mov$/i.test(f.name) ? "video/quicktime" : "");
  if (!(VIDEO_UPLOAD.types as readonly string[]).includes(type)) return "Choose an MP4, WebM or MOV video.";
  if (f.size === 0) return "That file is empty.";
  if (f.size > VIDEO_UPLOAD.maxBytes) return `The video is ${(f.size / 1048576).toFixed(0)} MB; the limit is 50 MB. Compress it, or upload it to YouTube and add it by URL.`;
  return null;
}

/** Checks the first bytes really are MP4/MOV ("ftyp") or WebM (EBML) — a renamed file is refused. */
export function sniffVideo(head: Uint8Array): "video/mp4" | "video/quicktime" | "video/webm" | null {
  if (head.length >= 12 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "video/webm";
  return null;
}
