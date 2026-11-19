/**
 * Quiz XP idempotency test against the Supabase project in .env.local.
 *   npm run quiz-xp:smoke
 * Creates temporary confirmed accounts (deleted afterwards, even on failure) and checks that one quiz attempt
 * awards its XP exactly once: double clicks, repeated requests, retries after a timeout, simultaneous requests,
 * revisiting the result, genuinely new attempts and two different students.
 * Credentials are never printed.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { TOPICS, QUIZZES, getQuestion } from "../src/lib/learning";

process.loadEnvFile(".env.local");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const TAG = "beastfeast-quizxp";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const made: string[] = [];

async function student(name: string): Promise<{ id: string; sb: SupabaseClient }> {
  const email = `${TAG}-${name}-${Date.now()}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `Quiz XP ${name}` } });
  if (error) throw error;
  made.push(data.user.id);
  const sb = createClient(URL_, PUB, { auth: { persistSession: false } });
  const r = await sb.auth.signInWithPassword({ email, password });
  if (r.error) throw r.error;
  return { id: data.user.id, sb };
}

type Row = { id: string; xp_awarded: number; client_attempt_id?: string | null };
/** One submission, the way the app sends it (with a client attempt id when given). */
async function submit(sb: SupabaseClient, quiz: string, answers: Record<string, number>, attempt?: string) {
  const args: Record<string, unknown> = { p_quiz: quiz, p_answers: answers };
  if (attempt && !process.env.QUIZ_XP_BASELINE) args.p_attempt = attempt; // baseline = the pre-fix API
  const r = await sb.rpc("submit_quiz", args);
  if (r.error) throw new Error(r.error.message);
  return r.data as Row;
}
const xpOf = async (id: string) => (await service.from("profiles").select("xp, daily_xp").eq("id", id).single()).data as { xp: number; daily_xp: number };
const ledger = async (id: string) => ((await service.from("xp_events").select("type, ref_id, amount, attempt_id").eq("user_id", id)).data ?? []) as { type: string; ref_id: string; amount: number; attempt_id: string | null }[];
const attempts = async (id: string) => ((await service.from("quiz_attempts").select("id, quiz_id, xp_awarded").eq("user_id", id)).data ?? []) as Row[];
const sum = (rows: { amount: number }[]) => rows.reduce((a, r) => a + r.amount, 0);
/** Every (type, ref) and every attempt reward appears at most once in the ledger. */
function ledgerUnique(rows: { type: string; ref_id: string }[]) {
  const keys = rows.map((r) => `${r.type}|${r.ref_id}`);
  return new Set(keys).size === keys.length;
}

async function main() {
  const topic = TOPICS[0];
  const quiz = `topic:${topic.id}`;
  const right = Object.fromEntries(topic.quiz.map((q) => [q.id, q.answerIndex]));
  const expected = topic.quiz.reduce((a, q) => a + q.xp, 0) + 25; // question XP + quiz-pass bonus (xp_rules default)

  // 1. submit once
  const s1 = await student("single");
  const a1 = await submit(s1.sb, quiz, right, randomUUID());
  const p1 = await xpOf(s1.id);
  check("one submission awards XP once", a1.xp_awarded === expected && p1.xp === expected, `attempt +${a1.xp_awarded}, profile ${p1.xp}, expected ${expected}`);
  check("daily XP matches the single award", p1.daily_xp === expected, `${p1.daily_xp}`);

  // 2. double click / repeated clicks / duplicate API requests for the same attempt (same attempt id)
  const s2 = await student("double");
  const att2 = randomUUID();
  const seq = [await submit(s2.sb, quiz, right, att2), await submit(s2.sb, quiz, right, att2), await submit(s2.sb, quiz, right, att2)];
  const p2 = await xpOf(s2.id);
  const l2 = await ledger(s2.id);
  check("same attempt sent 3× in a row awards XP once", p2.xp === expected && sum(l2) === expected, `profile ${p2.xp}, ledger ${sum(l2)}`);
  check("repeated requests return the same attempt and the same result", seq.every((r) => r.id === seq[0].id && r.xp_awarded === expected), seq.map((r) => `${r.id.slice(0, 8)}:+${r.xp_awarded}`).join(" "));
  check("only one attempt row is stored for that attempt", (await attempts(s2.id)).length === 1, `${(await attempts(s2.id)).length}`);

  // 3. two (and five) simultaneous requests for the same attempt
  const s3 = await student("parallel");
  const att3 = randomUUID();
  const par = await Promise.allSettled(Array.from({ length: 5 }, () => submit(s3.sb, quiz, right, att3)));
  const ok3 = par.filter((r): r is PromiseFulfilledResult<Row> => r.status === "fulfilled").map((r) => r.value);
  const p3 = await xpOf(s3.id);
  const l3 = await ledger(s3.id);
  check("5 simultaneous requests for one attempt award XP once", p3.xp === expected && sum(l3) === expected && ledgerUnique(l3), `profile ${p3.xp}, ledger ${sum(l3)} in ${l3.length} rows`);
  check("every simultaneous request gets the same confirmed result", ok3.length === 5 && ok3.every((r) => r.id === ok3[0].id && r.xp_awarded === expected), `${ok3.length}/5 ok, ${par.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason.message).join("; ")}`);
  check("one attempt row for the simultaneous requests", (await attempts(s3.id)).length === 1);

  // 4. retry after a timeout (the first request reached the server, the response was lost)
  const s4 = await student("retry");
  const att4 = randomUUID();
  await submit(s4.sb, quiz, right, att4); // "lost" response
  const retry = await submit(s4.sb, quiz, right, att4);
  const p4 = await xpOf(s4.id);
  check("retry with the same attempt id awards nothing extra and returns the original result", p4.xp === expected && retry.xp_awarded === expected, `profile ${p4.xp}, retry shows +${retry.xp_awarded}`);

  // 5. refresh / reopen the result: reading history must not award anything
  const before5 = (await xpOf(s4.id)).xp;
  const hist = await s4.sb.from("quiz_attempts").select("*").eq("user_id", s4.id);
  const prog = await s4.sb.from("progress").select("*").eq("user_id", s4.id).maybeSingle();
  check("reopening results/history awards no XP", !hist.error && !prog.error && (await xpOf(s4.id)).xp === before5);

  // 6. a genuinely new attempt: questions already earned give no XP again (existing rule), a new quiz does
  const att6 = randomUUID();
  const again = await submit(s4.sb, quiz, right, att6);
  check("new attempt of an already-earned quiz is a separate attempt", again.id !== retry.id && again.xp_awarded === 0, `+${again.xp_awarded}`);
  const t2 = TOPICS[1];
  const right2 = Object.fromEntries(t2.quiz.map((q) => [q.id, q.answerIndex]));
  const exp2 = t2.quiz.reduce((a, q) => a + q.xp, 0) + 25;
  const other = await submit(s4.sb, `topic:${t2.id}`, right2, randomUUID());
  check("new eligible attempt on another quiz is rewarded once", other.xp_awarded === exp2 && (await xpOf(s4.id)).xp === expected + exp2, `+${other.xp_awarded}, profile ${(await xpOf(s4.id)).xp}`);
  // partial first attempt, then a better new attempt earns only the newly correct questions
  const s6 = await student("improve");
  const half = Object.fromEntries(topic.quiz.map((q, i) => [q.id, i === 0 ? q.answerIndex : (q.answerIndex + 1) % q.options.length]));
  const first = await submit(s6.sb, quiz, half, randomUUID());
  const better = await submit(s6.sb, quiz, right, randomUUID());
  check("improved new attempt earns the remaining eligible XP once", first.xp_awarded + better.xp_awarded === expected && (await xpOf(s6.id)).xp === expected, `+${first.xp_awarded} then +${better.xp_awarded}`);

  // 7. challenge quiz (non-topic) with simultaneous requests
  const ch = QUIZZES.find((q) => q.kind === "weekly") ?? QUIZZES[0];
  const chRight = Object.fromEntries(ch.questionIds.map((id) => [id, getQuestion(id)!.answerIndex]));
  const s7 = await student("challenge");
  const att7 = randomUUID();
  const chPar = await Promise.allSettled([submit(s7.sb, ch.id, chRight, att7), submit(s7.sb, ch.id, chRight, att7)]);
  const l7 = await ledger(s7.id);
  const chExp = ch.questionIds.reduce((a, id) => a + getQuestion(id)!.xp, 0) + 25;
  check("challenge: two simultaneous requests award XP once", sum(l7) === chExp && (await xpOf(s7.id)).xp === chExp && ledgerUnique(l7), `ledger ${sum(l7)} (expected ${chExp}), ${chPar.filter((r) => r.status === "fulfilled").length}/2 ok`);

  // 8. two different students each get their own reward
  const s8a = await student("pair-a");
  const s8b = await student("pair-b");
  await Promise.all([submit(s8a.sb, quiz, right, randomUUID()), submit(s8b.sb, quiz, right, randomUUID())]);
  check("two students each receive their own reward", (await xpOf(s8a.id)).xp === expected && (await xpOf(s8b.id)).xp === expected);

  // 9. a client may not reuse another student's attempt id to read or block their result
  const stolen = await s8b.sb.rpc("submit_quiz", { p_quiz: quiz, p_answers: right, p_attempt: att2 });
  check("another student's attempt id is refused", !!stolen.error, stolen.error?.message ?? "accepted");

  // 10. ledger: every attempt reward row points at exactly one attempt
  const all = (await Promise.all(made.map((id) => ledger(id)))).flat().filter((r) => r.type === "question-correct" || r.type === "quiz-pass");
  check("every quiz ledger row carries its attempt id", all.every((r) => !!r.attempt_id), `${all.filter((r) => !r.attempt_id).length} without`);
}

async function cleanup() {
  for (const id of made) await service.auth.admin.deleteUser(id);
  // leftovers from an interrupted earlier run
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) if (u.email?.startsWith(TAG)) await service.auth.admin.deleteUser(u.id);
}

main()
  .catch((e) => {
    failures++;
    console.error("ERROR", (e as Error).message);
  })
  .finally(async () => {
    await cleanup();
    console.log(failures ? `\n${failures} check(s) failed` : "\nAll quiz XP checks passed");
    process.exit(failures ? 1 : 0);
  });
