import { NextResponse } from "next/server";
import { SUPABASE_CONFIGURED, getServerSession } from "@/lib/supabase/server";
import { isStaff } from "@/lib/roles";
import { oembedEndpoint, parseVideoUrl } from "@/lib/video/providers";

/**
 * Title / author / thumbnail for a video link, for the admin "Add by URL" form.
 * - Administrators only (role checked in the database on the server).
 * - The URL must parse as a supported platform link; the request goes only to that platform's fixed public oEmbed
 *   endpoint (no arbitrary URLs are fetched, so this cannot be used to reach internal addresses).
 * - Only three plain strings are returned; the provider's HTML (which would include scripts) is discarded.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const hits = new Map<string, number[]>();
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : null);

export async function GET(req: Request) {
  if (SUPABASE_CONFIGURED) {
    const { userId, role } = await getServerSession();
    if (!userId) return json(401, { error: "Your session has expired. Please sign in again." });
    if (!isStaff(role)) return json(403, { error: "Administrator access required." });
    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 30) return json(429, { error: "Too many lookups. Wait a minute." });
    hits.set(userId, [...recent, now]);
  }
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  const parsed = parseVideoUrl(raw);
  if (!parsed) return json(400, { error: "This is not a supported video link." });
  const endpoint = oembedEndpoint(parsed);
  if (!endpoint) return json(200, { provider: parsed.provider, title: null, author: null, thumbnail: parsed.thumbnail });
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000), redirect: "error", headers: { accept: "application/json" } });
    if (!res.ok) return json(200, { provider: parsed.provider, title: null, author: null, thumbnail: parsed.thumbnail, note: res.status === 401 || res.status === 403 || res.status === 404 ? "The video is private, removed or does not allow embedding." : null });
    const text = await res.text();
    if (text.length > 64 * 1024) return json(200, { provider: parsed.provider, title: null, author: null, thumbnail: parsed.thumbnail });
    const o = JSON.parse(text) as Record<string, unknown>;
    const thumb = clean(o.thumbnail_url, 500);
    return json(200, {
      provider: parsed.provider,
      title: clean(o.title, 140),
      author: clean(o.author_name, 80),
      thumbnail: thumb && /^https:\/\//.test(thumb) ? thumb : parsed.thumbnail,
    });
  } catch {
    return json(200, { provider: parsed.provider, title: null, author: null, thumbnail: parsed.thumbnail });
  }
}
