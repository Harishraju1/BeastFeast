/**
 * XP rework test against the Supabase project in .env.local.
 *   npx tsx scripts/xp-smoke.ts
 * Temporary accounts (deleted afterwards). The penalty start date is moved back for a few seconds to test
 * past days and then restored — real accounts are protected because penalties never cover a user's
 * sign-up day or anything before it.
 */
import { randomBytes } from "node:crypto";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const made: string[] = [];
const dayIST = (offset: number) => {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000 + offset * 86400000);
  return d.toISOString().slice(0, 10);
};

async function user(name: string, daysOld: number): Promise<{ id: string; sb: SupabaseClient }> {
  const email = `beastfeast-xp-${name}-${Date.now()}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `XP ${name}` } });
  if (error) throw error;
  made.push(data.user.id);
  await service.from("profiles").update({ created_at: new Date(Date.now() - daysOld * 86400000).toISOString() }).eq("id", data.user.id);
  const sb = createClient(URL_, PUB, { auth: { persistSession: false } });
  const r = await sb.auth.signInWithPassword({ email, password });
  if (r.error) throw r.error;
  return { id: data.user.id, sb };
}
const xpOf = async (id: string) => (await service.from("profiles").select("xp").eq("id", id).single()).data?.xp as number;
const prof = async (id: string) => (await service.from("profiles").select("xp, daily_xp, rank_level").eq("id", id).single()).data as { xp: number; daily_xp: number; rank_level: number };
const ledgerSince = async (id: string, since: string) =>
  ((await service.from("xp_events").select("amount").eq("user_id", id).gte("at", since)).data ?? []).reduce((a, r) => a + (r.amount as number), 0);

let savedPenalty: unknown = null;
async function main() {
  const s = await user("student", 5);
  const broke = await user("broke", 5);

  // amounts come from xp_rules on the server
  const created = await s.sb.rpc("award_xp", { p_type: "project-created", p_ref: "p1" });
  const simmed = await s.sb.rpc("award_xp", { p_type: "simulation-first", p_ref: "p1" });
  check("creating a project earns 0 XP", !created.error && created.data?.[0]?.awarded === 0);
  check("just starting a simulation earns 0 XP", !simmed.error && simmed.data?.[0]?.awarded === 0);
  const design = await s.sb.rpc("award_xp", { p_type: "validation-pass", p_ref: "p1" });
  const code = await s.sb.rpc("award_xp", { p_type: "code-check-pass", p_ref: "p1" });
  const lap = await s.sb.rpc("award_xp", { p_type: "lap-complete", p_ref: "p1:t1" });
  check("own design passing validation earns 60", design.data?.[0]?.awarded === 60, JSON.stringify(design.data ?? design.error?.message));
  check("own code matching the circuit earns 80", code.data?.[0]?.awarded === 80);
  check("completing a track with own code earns 150", lap.data?.[0]?.awarded === 150);
  check("XP total is 290", (await xpOf(s.id)) === 290, `${await xpOf(s.id)}`);
  const ev = (await service.from("xp_events").select("type, source, description").eq("user_id", s.id).eq("type", "validation-pass").single()).data;
  check("ledger rows carry a source", ev?.source === "build", JSON.stringify(ev));
  const p290 = await prof(s.id);
  check("rank is calculated on the server (290 XP = Explorer, level 2)", p290.rank_level === 2, JSON.stringify(p290));
  check("today's XP counts everything earned since 11:15 PM IST", p290.daily_xp === 290, JSON.stringify(p290));
  const hist = (await s.sb.from("rank_history").select("id, old_level, new_level, seen")).data ?? [];
  const promo = hist.find((h) => h.old_level === 1 && h.new_level === 2);
  check("the promotion is saved in rank history, not yet seen", !!promo && promo.seen === false, JSON.stringify(hist));
  const forged = await s.sb.from("rank_history").insert({ user_id: s.id, old_level: 2, new_level: 16, xp_at: 0 }).select("id");
  check("students cannot write rank history", !!forged.error || (forged.data?.length ?? 0) === 0);
  await s.sb.from("profiles").update({ rank_level: 16, xp: 99999, daily_xp: 99999 }).eq("id", s.id);
  const pTamper = await prof(s.id);
  check("students cannot change their own XP, daily XP or rank", pTamper.xp === 290 && pTamper.rank_level === 2 && pTamper.daily_xp === 290, JSON.stringify(pTamper));
  if (promo) await s.sb.rpc("mark_rank_seen", { p_ids: [promo.id] });
  const seen = (await service.from("rank_history").select("seen").eq("id", promo?.id ?? -1).single()).data;
  check("the rank-up animation is marked as seen (shown once)", seen?.seen === true);
  const rec = await s.sb.rpc("award_xp", { p_type: "record-improved", p_ref: "p1:t1:1" });
  const p315 = await prof(s.id);
  check("315 XP promotes to Apprentice (level 3)", rec.data?.[0]?.awarded === 25 && p315.rank_level === 3, JSON.stringify(p315));
  const selfPenalty = await s.sb.rpc("award_xp", { p_type: "inactivity-penalty", p_ref: "x" });
  check("students cannot award or remove penalties themselves", !!selfPenalty.error);
  const tamper = await s.sb.from("xp_rules").update({ amount: 9999 }).eq("type", "lap-complete").select("type");
  check("students cannot change XP amounts", (tamper.data?.length ?? 0) === 0 && (await service.from("xp_rules").select("amount").eq("type", "lap-complete").single()).data?.amount === 150);

  // learning activity on one past day (as if they studied 2 days ago) + one today
  await service.from("learning_activity").insert({ user_id: s.id, day: dayIST(-2), kind: "topic", ref: "line-1-intro-robotics" });
  const act = await s.sb.rpc("record_learning_activity", { p_kind: "topic", p_ref: "line-2" });
  check("students can record today's learning activity", !act.error, act.error?.message);

  // move the penalty start back 5 days for this test only
  savedPenalty = (await service.from("xp_settings").select("value").eq("key", "penalty").single()).data?.value;
  await service.from("xp_settings").update({ value: { ...(savedPenalty as object), start: dayIST(-5) } }).eq("key", "penalty");
  const p1 = await s.sb.rpc("apply_inactivity_penalties");
  // account made 5 days ago → charged from day −4; day −2 had activity → days −4, −3, −1 inactive
  check("3 missed days cost 3 × 10 XP", p1.data?.[0]?.deducted === 30 && p1.data?.[0]?.days === 3, JSON.stringify(p1.data ?? p1.error?.message));
  check("XP drops from 315 to 285", (await xpOf(s.id)) === 285, `${await xpOf(s.id)}`);
  check("a penalty never lowers an earned rank (285 XP, still Apprentice)", (await prof(s.id)).rank_level === 3);
  const p2 = await s.sb.rpc("apply_inactivity_penalties");
  check("each day is charged only once", p2.data?.[0]?.deducted === 0);
  const pb = await broke.sb.rpc("apply_inactivity_penalties");
  check("a student with 0 XP is not pushed below 0", !pb.error && (await xpOf(broke.id)) === 0, JSON.stringify(pb.data));
  await broke.sb.rpc("award_xp", { p_type: "validation-pass", p_ref: "b1" });
  const pb2 = await broke.sb.rpc("apply_inactivity_penalties");
  check("old days settled at 0 are not charged later", pb2.data?.[0]?.deducted === 0 && (await xpOf(broke.id)) === 60, `${await xpOf(broke.id)} XP`);

  // scheduled daily reset: idempotent, never touches lifetime XP
  const before = await prof(s.id);
  const anon = createClient(URL_, PUB, { auth: { persistSession: false } });
  const r1 = await anon.rpc("reset_daily_xp", { p_trigger: "xp-smoke" });
  const r2 = await anon.rpc("reset_daily_xp", { p_trigger: "xp-smoke" });
  const after = await prof(s.id);
  const period = (await service.rpc("xp_period_start")).data as string;
  check("a second reset in the same XP day does nothing", !r1.error && r2.data === -1, `${r1.data} then ${r2.data}`);
  check("the reset keeps lifetime XP and rank", after.xp === before.xp && after.rank_level === before.rank_level);
  check("daily XP equals the ledger since the last 11:15 PM IST", after.daily_xp === Math.max(0, await ledgerSince(s.id, period)), `${after.daily_xp} vs ${await ledgerSince(s.id, period)} since ${period}`);
  check("the XP day starts at 17:45 UTC (11:15 PM IST)", new Date(period).toISOString().slice(11, 16) === "17:45", period);

  // leaderboard: strictly more than 50 lifetime XP, filtered in the database
  const fifty = await user("fifty", 1);
  await service.from("profiles").update({ xp: 50 }).eq("id", fifty.id);
  const lb50 = (await s.sb.from("profiles").select("id").gt("xp", 50)).data ?? [];
  const view50 = (await s.sb.from("leaderboard_eligible").select("id")).data ?? [];
  check("exactly 50 XP is not on the leaderboard", !lb50.some((r) => r.id === fifty.id) && !view50.some((r) => r.id === fifty.id));
  check("a student above 50 XP is on the leaderboard", lb50.some((r) => r.id === s.id) && view50.some((r) => r.id === s.id));
  await service.from("profiles").update({ xp: 51 }).eq("id", fifty.id);
  const lb51 = (await s.sb.from("leaderboard_eligible").select("id")).data ?? [];
  check("51 XP appears on the leaderboard", lb51.some((r) => r.id === fifty.id));

  // admins are exempt
  await service.from("profiles").update({ role: "admin" }).eq("id", broke.id);
  const pa = await broke.sb.rpc("apply_inactivity_penalties");
  check("admins are exempt", pa.data?.[0]?.deducted === 0);
  const studentRecalc = await s.sb.rpc("admin_recalculate_rank", { p_user: s.id });
  check("students cannot run the admin rank recalculation", !!studentRecalc.error);
  const recalc = await broke.sb.rpc("admin_recalculate_rank", { p_user: s.id });
  const pr = await prof(s.id);
  check("an admin recalculation follows the ledger (285 XP → Explorer)", recalc.data === 2 && pr.rank_level === 2 && pr.xp === 285, JSON.stringify({ data: recalc.data, err: recalc.error?.message, pr }));

  // the admin can change amounts (RLS) and the server uses them immediately
  const adminUpd = await broke.sb.from("xp_rules").update({ amount: 175 }).eq("type", "sumo-win").select("type");
  const win = await s.sb.rpc("award_xp", { p_type: "sumo-win", p_ref: "arena:beast" });
  check("an admin's new amount applies to the next award", (adminUpd.data?.length ?? 0) === 1 && win.data?.[0]?.awarded === 175, `${win.data?.[0]?.awarded}`);
  await service.from("xp_rules").update({ amount: 150 }).eq("type", "sumo-win");
}

async function cleanup() {
  if (savedPenalty) await service.from("xp_settings").update({ value: savedPenalty }).eq("key", "penalty");
  await service.from("xp_rules").update({ amount: 150 }).eq("type", "sumo-win");
  for (const id of made) await service.auth.admin.deleteUser(id);
  const st = (await service.from("xp_settings").select("value").eq("key", "penalty").single()).data?.value as { start: string };
  console.log(`cleaned up ${made.length} temporary accounts; penalty start restored to ${st?.start}`);
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(async () => {
    await cleanup();
    console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll XP checks passed.");
    process.exitCode = failures ? 1 : 0;
  });
