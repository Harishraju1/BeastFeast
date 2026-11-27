/**
 * Live checks for sign-up validation, private contact details, admin user management, profile pictures and
 * rate limiting, against the Supabase project in .env.local and a running app (for the /api/avatar route).
 *   npx tsx scripts/profile-smoke.ts [baseUrl]        (default http://localhost:3210)
 * Uses temporary accounts and removes them (and their pictures) afterwards.
 */
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { type Session, type SupabaseClient, createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const BASE = process.argv[2] ?? "http://localhost:3210";
const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const REF = new URL(URL_).hostname.split(".")[0];
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const made: string[] = [];
const tag = Date.now().toString().slice(-5);
// test NIAT IDs are generated per run so reruns never collide; they are deleted with the accounts
const niat = (n: number) => `N99H01Q${String((Number(tag) * 7 + n) % 10000).padStart(4, "0")}`;

/**
 * An email sign-up that goes through the same database rules as the form, created through the admin API with the
 * email already confirmed: no confirmation email is sent, so the club's hourly email allowance is never used by
 * these checks (public sign-ups spend it even when the database then rejects them). No skip flag is set.
 */
async function signUpViaApi(email: string, password: string, data: Record<string, unknown>) {
  const r = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: data });
  if (r.data.user) made.push(r.data.user.id);
  return r;
}
async function confirmedUser(name: string, meta: Record<string, unknown>): Promise<{ id: string; sb: SupabaseClient; session: Session }> {
  const email = `beastfeast-profile-${name}-${tag}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { skip_profile_checks: true }, user_metadata: { name: `Profile ${name}`, ...meta } });
  if (error) throw error;
  made.push(data.user.id);
  const sb = createClient(URL_, PUB, { auth: { persistSession: false } });
  const r = await sb.auth.signInWithPassword({ email, password });
  if (r.error || !r.data.session) throw r.error ?? new Error("no session");
  return { id: data.user.id, sb, session: r.data.session };
}
/** The cookie @supabase/ssr reads on the server (chunked at 3180 characters). */
function authCookie(session: Session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${REF}-auth-token`;
  if (value.length <= 3180) return `${name}=${value}`;
  const parts: string[] = [];
  for (let i = 0; i * 3180 < value.length; i++) parts.push(`${name}.${i}=${value.slice(i * 3180, (i + 1) * 3180)}`);
  return parts.join("; ");
}

async function main() {
  // ── sign-up validation in the database (the form can be bypassed; the trigger cannot) ──
  const bad1 = await signUpViaApi(`beastfeast-bad1-${tag}@example.com`, randomBytes(12).toString("hex"), { name: "Bad", niat_id: "N24H1AB0001", campus: "KKH", phone: "9876543210" });
  check("sign-up with an invalid NIAT ID is rejected by the database", !!bad1.error && !bad1.data.user, bad1.error?.message);
  const bad2 = await signUpViaApi(`beastfeast-bad2-${tag}@example.com`, randomBytes(12).toString("hex"), { name: "Bad", niat_id: niat(1), campus: "KKH", phone: "5876543210" });
  check("sign-up with an invalid mobile number is rejected", !!bad2.error && !bad2.data.user, bad2.error?.message);
  const noCampus = await signUpViaApi(`beastfeast-bad3-${tag}@example.com`, randomBytes(12).toString("hex"), { name: "Bad", niat_id: niat(4), phone: "9876543212" });
  check("sign-up without a campus name is rejected", !!noCampus.error && !noCampus.data.user, noCampus.error?.message);
  const noNiat = await signUpViaApi(`beastfeast-bad4-${tag}@example.com`, randomBytes(12).toString("hex"), { name: "Bad", campus: "KKH", phone: "9876543213" });
  check("sign-up without a NIAT ID is rejected", !!noNiat.error && !noNiat.data.user, noNiat.error?.message);
  const svcNoChecks = await service.auth.admin.createUser({ email: `beastfeast-bad5-${tag}@example.com`, password: randomBytes(12).toString("hex"), email_confirm: true, user_metadata: { name: "Bad" } });
  if (svcNoChecks.data.user) made.push(svcNoChecks.data.user.id);
  check("an email account without NIAT ID and campus is rejected even through the service API (unless flagged)", !!svcNoChecks.error, svcNoChecks.error?.message);
  const anonFmt = createClient(URL_, PUB, { auth: { persistSession: false } });
  // unused test IDs in both official shapes (N99 is not a real intake year) — available ⇒ the format was accepted
  const four = String(Number(tag) % 10000).padStart(4, "0");
  for (const [id, want] of [[`N99H018${four}`, true], [`N99H01B${four}`, true], [`n99h01b${four}`, true], [`N99H01AB${four.slice(1)}`, false], [`N99H018${four.slice(1)}`, false]] as const) {
    const r = await anonFmt.rpc("niat_id_available", { p_niat: id });
    check(`NIAT ID ${id} is ${want ? "accepted" : "rejected"} by the server`, r.data === want, String(r.data ?? r.error?.message));
  }

  const a = await confirmedUser("a", { niat_id: niat(2).toLowerCase() + " ", phone: "98765 43210" });
  const pa = (await service.from("profile_private").select("*").eq("user_id", a.id).single()).data;
  check("valid sign-up stores the NIAT ID upper-cased and trimmed, phone as +91…", pa?.niat_id === niat(2) && pa?.phone === "+919876543210", JSON.stringify({ niat: pa?.niat_id, phone: pa?.phone }));
  const dup = await signUpViaApi(`beastfeast-dup-${tag}@example.com`, randomBytes(12).toString("hex"), { name: "Dup", niat_id: niat(2), phone: "9876543211" });
  check("a duplicate NIAT ID is rejected", !!dup.error && !dup.data.user, dup.error?.message);
  const anon = createClient(URL_, PUB, { auth: { persistSession: false } });
  check("the availability check reports a taken NIAT ID", (await anon.rpc("niat_id_available", { p_niat: niat(2) })).data === false);

  // ── privacy ──
  const b = await confirmedUser("b", { niat_id: niat(3), phone: "9123456780" });
  const seenByB = (await b.sb.from("profile_private").select("user_id")).data ?? [];
  check("a student reads only their own private details", seenByB.length === 1 && seenByB[0].user_id === b.id, `${seenByB.length} rows`);
  const pubRow = (await b.sb.from("profiles").select("*").eq("id", a.id).single()).data as Record<string, unknown>;
  check("the public profile row carries no NIAT ID or phone", pubRow && !pubRow.student_id && !("phone" in pubRow) && !("niat_id" in pubRow), JSON.stringify(Object.keys(pubRow ?? {})));
  const write = await b.sb.from("profile_private").update({ niat_id: niat(9) }).eq("user_id", b.id).select("user_id");
  check("students cannot write private details directly", (write.data?.length ?? 0) === 0);
  const change = await b.sb.rpc("complete_my_details", { p_niat: niat(8), p_phone: null });
  check("a NIAT ID cannot be changed by the student once set", !!change.error, change.error?.message);
  const phoneUpd = await b.sb.rpc("complete_my_details", { p_niat: null, p_phone: "9988776655" });
  check("the student can update their mobile number", !phoneUpd.error && phoneUpd.data?.phone === "+919988776655", phoneUpd.error?.message);
  const list = await b.sb.rpc("admin_list_users", {});
  check("students cannot list users or see contact details", !!list.error);
  const badCampus = await b.sb.from("profiles").update({ campus: "<script>" }).eq("id", b.id).select("campus");
  check("an invalid campus name is rejected by the database", !!badCampus.error, badCampus.error?.message);
  const goodCampus = await b.sb.from("profiles").update({ campus: "  Chevella   Campus " }).eq("id", b.id).select("campus").single();
  check("a campus name is trimmed and stored", goodCampus.data?.campus === "Chevella Campus", goodCampus.error?.message ?? goodCampus.data?.campus);
  // streak: a positive XP event marks today (Asia/Kolkata, day ends 23:59); a repeat is idempotent
  await service.from("xp_events").insert({ user_id: b.id, type: "lesson-complete", ref_id: `streak-smoke-${tag}`, amount: 1, source: "learning", description: "streak smoke" });
  const st = await b.sb.rpc("my_streak");
  const sr = (st.data ?? [])[0] as { current_streak: number; active_today: boolean; timezone: string } | undefined;
  check("my_streak counts today's activity", !st.error && sr?.current_streak === 1 && sr?.active_today === true && sr?.timezone === "Asia/Kolkata", st.error?.message ?? JSON.stringify(sr));
  const days = (await service.from("streak_days").select("day").eq("user_id", b.id)).data ?? [];
  check("one streak row per day (no duplicates)", days.length === 1, `${days.length}`);
  const peek = await a.sb.from("streak_days").select("day").eq("user_id", b.id);
  check("a student cannot read another student's streak days", (peek.data?.length ?? 0) === 0);
  const avatarTamper = await b.sb.from("profiles").update({ avatar: "javascript:alert(1)" }).eq("id", b.id).select("avatar");
  check("profile avatar must be an https URL (no javascript:/data: URLs)", !!avatarTamper.error, avatarTamper.error?.message);

  // ── admin ──
  await service.from("profiles").update({ role: "admin" }).eq("id", a.id);
  const found = await a.sb.rpc("admin_list_users", { p_search: niat(3) });
  const row = (found.data ?? [])[0] as Record<string, unknown> | undefined;
  check("an admin finds a student by NIAT ID with email, phone and NIAT ID", !found.error && row?.niat_id === niat(3) && row?.phone === "+919988776655" && String(row?.email).includes("profile-b"), found.error?.message);
  const byPhone = await a.sb.rpc("admin_list_users", { p_search: "99887" });
  check("an admin can search by phone digits", (byPhone.data ?? []).some((r: { id: string }) => r.id === b.id));
  check("admin rows include the campus", row?.campus === "Chevella Campus", String(row?.campus));
  const byCampus = await a.sb.rpc("admin_list_users", { p_campus: "chevella" });
  check("an admin can filter by campus", (byCampus.data ?? []).some((r: { id: string }) => r.id === b.id), byCampus.error?.message);
  const setC = await a.sb.rpc("admin_set_campus", { p_user: b.id, p_campus: "SMRU" });
  check("an admin can correct a campus name (logged)", !setC.error && setC.data === "SMRU", setC.error?.message);
  const studentSet = await b.sb.rpc("admin_set_campus", { p_user: a.id, p_campus: "KKH" });
  check("a student cannot use the admin campus editor", !!studentSet.error);
  const review = await a.sb.rpc("admin_niat_review");
  check("the NIAT review list loads for admins", !review.error, review.error?.message);
  const leak = JSON.stringify(found.data ?? []);
  check("no password hashes or tokens are returned", !/encrypted_password|\$2[aby]\$|refresh_token|access_token/.test(leak));

  // ── profile picture through the app's /api/avatar route ──
  const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 242, g: 11, b: 11 } } }).png().toBuffer();
  const post = async (bytes: Buffer, name: string, type: string, cookie: string | null) => {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
    const res = await fetch(`${BASE}/api/avatar`, { method: "POST", body: fd, headers: cookie ? { cookie, origin: BASE } : { origin: BASE } });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as { error?: string; avatar?: string } };
  };
  const noAuth = await post(png, "a.png", "image/png", null);
  check("uploading without signing in is refused", noAuth.status === 401, `${noAuth.status}`);
  const fake = await post(Buffer.from("<svg onload=alert(1)>"), "x.png", "image/png", authCookie(b.session));
  check("a file that is not really an image is rejected", fake.status === 415, `${fake.status} ${fake.body.error ?? ""}`);
  const ok = await post(png, "me.png", "image/png", authCookie(b.session));
  check("a real PNG is accepted and stored as a 256×256 WebP", ok.status === 200 && !!ok.body.avatar?.endsWith(".webp"), `${ok.status} ${ok.body.error ?? ""}`);
  if (ok.body.avatar) {
    const img = await fetch(ok.body.avatar);
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    check("the stored picture is public, WebP, 256×256", img.ok && meta.format === "webp" && meta.width === 256 && meta.height === 256, `${meta.format} ${meta.width}×${meta.height}`);
  }
  const prof = (await service.from("profiles").select("avatar").eq("id", b.id).single()).data;
  check("the profile points at the new picture", prof?.avatar === ok.body.avatar);
  const other = await b.sb.storage.from("avatars").upload(`${a.id}/hijack.webp`, png, { contentType: "image/webp" });
  check("a student cannot write into another user's picture folder", !!other.error, other.error?.message);
  const cross = await fetch(`${BASE}/api/avatar`, { method: "DELETE", headers: { cookie: authCookie(b.session), origin: "https://evil.example" } });
  check("cross-site requests to the upload route are refused", cross.status === 403, `${cross.status}`);
  const del = await fetch(`${BASE}/api/avatar`, { method: "DELETE", headers: { cookie: authCookie(b.session), origin: BASE } });
  const after = (await service.from("profiles").select("avatar").eq("id", b.id).single()).data;
  const left = (await service.storage.from("avatars").list(b.id)).data ?? [];
  check("removing the picture clears the profile and deletes the file", del.status === 200 && after?.avatar === null && left.length === 0, `${del.status}, ${left.length} files left`);

  // ── rate limiting (database-backed) ──
  // checks the limiter's setting without using the limit up (exhausting it would block this network for an hour)
  await anon.rpc("niat_id_available", { p_niat: niat(50) });
  const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();
  const lim = (await service.from("rate_limits").select("hits, limit_max, window_start").eq("bucket", "niat-check").eq("window_start", hour)).data ?? [];
  check("anonymous NIAT checks are counted against a 1000-per-hour limit", lim.length > 0 && lim.every((r) => r.limit_max === 1000), JSON.stringify(lim.map((r) => ({ hits: r.hits, limit: r.limit_max }))));
}

async function cleanup() {
  for (const id of made) {
    const files = (await service.storage.from("avatars").list(id)).data ?? [];
    if (files.length) await service.storage.from("avatars").remove(files.map((f) => `${id}/${f.name}`));
    await service.auth.admin.deleteUser(id);
  }
  // reset this machine's anonymous rate-limit window so the real sign-up form isn't blocked
  await service.from("rate_limits").delete().like("key", "ip:%").eq("bucket", "niat-check");
  console.log(`cleaned up ${made.length} temporary accounts`);
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(async () => {
    await cleanup();
    console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll profile & privacy checks passed.");
    process.exitCode = failures ? 1 : 0;
  });
