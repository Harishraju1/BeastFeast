import { NextResponse } from "next/server";
import sharp from "sharp";
import { SUPABASE_CONFIGURED, serverSupabase } from "@/lib/supabase/server";
import { AVATAR_MAX_BYTES } from "@/lib/validation";

/**
 * Profile picture upload (cloud mode).
 * - The signed-in user is verified with Supabase Auth; the upload runs with *their* session, so Storage RLS
 *   only lets them write inside avatars/<their user id>/.
 * - The file must really be a JPEG, PNG or WebP: sharp decodes it (a renamed executable or SVG fails here),
 *   and the stored file is a freshly encoded 256 × 256 WebP, so no original bytes or metadata are kept.
 * - Size limit 5 MB, rate limited in the database (avatar_upload_allowed), same-origin only.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED = new Set(["jpeg", "png", "webp"]);
const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** Seconds until the hourly rate-limit window (rl_hit: 1000 per user per clock hour, migration 0018) starts again. */
const retryAfterS = () => String(3600 - (Math.floor(Date.now() / 1000) % 3600));

/** Signed-in requests always carry the session cookie; without it there is nothing to check, so no work is done. */
const hasSessionCookie = (req: Request) => /(?:^|;\s*)sb-[^=]*-auth-token(?:\.\d+)?=/.test(req.headers.get("cookie") ?? "");

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches may omit it; the session cookie is SameSite=Lax
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

async function authed(req: Request) {
  if (!SUPABASE_CONFIGURED) return { error: json(400, { error: "Profile pictures are stored on this device in local mode." }) };
  if (!sameOrigin(req)) return { error: json(403, { error: "Permission denied." }) };
  if (!hasSessionCookie(req)) return { error: json(401, { error: "Your session has expired. Please sign in again." }) };
  const sb = await serverSupabase();
  const { data } = await sb.auth.getUser();
  if (!data.user) return { error: json(401, { error: "Your session has expired. Please sign in again." }) };
  return { sb, uid: data.user.id };
}

async function removeOld(sb: Awaited<ReturnType<typeof serverSupabase>>, uid: string, keep?: string) {
  const { data } = await sb.storage.from("avatars").list(uid, { limit: 100 });
  const old = (data ?? []).map((f) => `${uid}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await sb.storage.from("avatars").remove(old);
}

export async function POST(req: Request) {
  const a = await authed(req);
  if ("error" in a) return a.error;
  const { sb, uid } = a;

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > AVATAR_MAX_BYTES + 64 * 1024) return json(413, { error: "The picture must be 5 MB or smaller." });

  const limited = await sb.rpc("avatar_upload_allowed");
  if (limited.error) return json(429, { error: limited.error.message.includes("Too many") ? limited.error.message : "Please try again later." }, { "Retry-After": retryAfterS() });

  let file: File | null = null;
  try {
    const f = (await req.formData()).get("file");
    file = f instanceof File ? f : null;
  } catch {
    file = null;
  }
  if (!file) return json(400, { error: "Choose a picture to upload." });
  if (file.size > AVATAR_MAX_BYTES) return json(413, { error: "The picture must be 5 MB or smaller." });

  let webp: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
    if (!meta.format || !ALLOWED.has(meta.format)) return json(415, { error: "Choose a JPEG, PNG or WebP image." });
    webp = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
  } catch {
    return json(415, { error: "That file is not a valid JPEG, PNG or WebP image." });
  }

  const path = `${uid}/avatar-${Date.now()}.webp`;
  const up = await sb.storage.from("avatars").upload(path, webp, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (up.error) {
    console.error("avatar upload failed", up.error.message);
    return json(500, { error: "Upload failed. Please try again." });
  }
  const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const upd = await sb.from("profiles").update({ avatar: url }).eq("id", uid);
  if (upd.error) {
    console.error("avatar profile update failed", upd.error.message);
    await sb.storage.from("avatars").remove([path]);
    return json(500, { error: "Upload failed. Please try again." });
  }
  await removeOld(sb, uid, path);
  return json(200, { ok: true, avatar: url });
}

export async function DELETE(req: Request) {
  const a = await authed(req);
  if ("error" in a) return a.error;
  const { sb, uid } = a;
  const upd = await sb.from("profiles").update({ avatar: null }).eq("id", uid);
  if (upd.error) {
    console.error("avatar remove failed", upd.error.message);
    return json(500, { error: "Could not remove the picture. Please try again." });
  }
  await removeOld(sb, uid);
  return json(200, { ok: true });
}
