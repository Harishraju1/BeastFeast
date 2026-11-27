/**
 * Live, read-only checks for the video library (migration 0016), against the Supabase project in .env.local.
 *   npx tsx scripts/video-smoke.ts
 * Reads only the shared video table and bucket settings — no student data, nothing is written.
 */
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function main() {
  const rows = await service.from("video_items").select("id, provider, source, published");
  check("video_items table exists", !rows.error, rows.error?.message);
  const legacy = await service.from("app_content").select("value").eq("key", "content").maybeSingle();
  const oldList = ((legacy.data?.value as { videos?: { url?: string }[] } | undefined)?.videos ?? []).filter((v) => /youtu\.?be/.test(v.url ?? ""));
  check("earlier YouTube videos were copied into the library", (rows.data?.length ?? 0) >= oldList.length, `${rows.data?.length ?? 0} in library, ${oldList.length} in the old list`);
  const bucket = await service.storage.getBucket("lesson-videos");
  check("lesson-videos bucket is private with a 50 MB limit", !bucket.error && bucket.data?.public === false && bucket.data?.file_size_limit === 52428800, bucket.error?.message ?? JSON.stringify({ public: bucket.data?.public, limit: bucket.data?.file_size_limit }));
  const anon = createClient(URL_, PUB, { auth: { persistSession: false } });
  const anonRead = await anon.from("video_items").select("id");
  check("signed-out visitors cannot read the video table", !!anonRead.error || (anonRead.data?.length ?? 0) === 0, anonRead.error?.message ?? `${anonRead.data?.length} rows`);
  const anonWrite = await anon.from("video_items").insert({ id: "smoke-x", title: "x", source: "url", provider: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" });
  check("signed-out visitors cannot add videos", !!anonWrite.error, anonWrite.error?.message);
  const anonUpload = await anon.storage.from("lesson-videos").upload("videos/smoke-x/a.mp4", new Blob([new Uint8Array(16)], { type: "video/mp4" }));
  check("signed-out visitors cannot upload files", !!anonUpload.error, anonUpload.error?.message);
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll video library checks passed.");
  process.exit(failures ? 1 : 0);
}
void main();
