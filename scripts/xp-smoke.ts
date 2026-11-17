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
  check("XP drops from 290 to 260", (await xpOf(s.id)) === 260, `${await xpOf(s.id)}`);
  const p2 = await s.sb.rpc("apply_inactivity_penalties");
  check("each day is charged only once", p2.data?.[0]?.deducted === 0);
  const pb = await broke.sb.rpc("apply_inactivity_penalties");
  check("a student with 0 XP is not pushed below 0", !pb.error && (await xpOf(broke.id)) === 0, JSON.stringify(pb.data));
  await broke.sb.rpc("award_xp", { p_type: "validation-pass", p_ref: "b1" });
  const pb2 = await broke.sb.rpc("apply_inactivity_penalties");
  check("old days settled at 0 are not charged later", pb2.data?.[0]?.deducted === 0 && (await xpOf(broke.id)) === 60, `${await xpOf(broke.id)} XP`);

  // admins are exempt
  await service.from("profiles").update({ role: "admin" }).eq("id", broke.id);
  const pa = await broke.sb.rpc("apply_inactivity_penalties");
  check("admins are exempt", pa.data?.[0]?.deducted === 0);

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
