/** Extract a YouTube video id from common URL forms; null if the URL is not a YouTube video. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = /^\/(embed|shorts|live)\/([\w-]{6,})/.exec(u.pathname);
      if (m) return m[2];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export const embedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`;
