/**
 * READ-ONLY audit of the XP ledger for duplicate quiz rewards (Supabase project in .env.local).
 *   npm run xp:audit
 * Changes nothing. Prints candidate duplicates and the potential excess XP so corrections can be reviewed and
 * approved before anything is adjusted. Students are shown by a short id prefix only (no names or emails).
 *
 * A duplicate candidate is any of:
 *   A. two or more ledger rows with the same (student, type, ref) — the same question or quiz-pass bonus twice;
 *   B. two or more reward rows of the same kind inside one attempt;
 *   C. attempts of the same quiz by the same student less than 10 s apart where BOTH earned XP
 *      (a double submission that slipped through). Retakes minutes apart are legitimate and not listed.
 * Also reported, for information: attempts whose stored xp_awarded differs from their ledger rows, and
 * profiles whose lifetime XP differs from the ledger sum.
 */
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

type Ev = { id: string; user_id: string; type: string; ref_id: string; amount: number; at: string; attempt_id: string | null };
type At = { id: string; user_id: string; quiz_id: string; at: string; xp_awarded: number; correct: number; total: number };
type Pr = { id: string; xp: number };

async function all<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}
const who = (id: string) => id.slice(0, 8);
const group = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};

async function main() {
  const [events, attempts, profiles] = await Promise.all([
    all<Ev>("xp_events", "id, user_id, type, ref_id, amount, at, attempt_id"),
    all<At>("quiz_attempts", "id, user_id, quiz_id, at, xp_awarded, correct, total"),
    all<Pr>("profiles", "id, xp"),
  ]);
  const quizRows = events.filter((e) => e.type === "question-correct" || e.type === "quiz-pass");
  console.log(`Ledger: ${events.length} rows (${quizRows.length} quiz rewards) · ${attempts.length} quiz attempts · ${profiles.length} profiles\n`);

  let excess = 0;
  const report: string[] = [];

  // A. same reward recorded more than once for a student
  for (const [, rows] of group(quizRows, (e) => `${e.user_id}|${e.type}|${e.ref_id}`)) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => a.at.localeCompare(b.at));
    const extra = rows.slice(1).reduce((a, r) => a + r.amount, 0);
    excess += extra;
    report.push(`A  student ${who(rows[0].user_id)}  ${rows[0].type} ${rows[0].ref_id}  ×${rows.length}  keep ${rows[0].id}  excess +${extra} XP  (${rows.map((r) => `${r.id} @ ${r.at} +${r.amount} attempt ${r.attempt_id ?? "—"}`).join("; ")})`);
  }
  // B. same reward twice inside one attempt
  for (const [, rows] of group(quizRows.filter((e) => e.attempt_id), (e) => `${e.attempt_id}|${e.type}|${e.ref_id}`)) {
    if (rows.length < 2) continue;
    report.push(`B  attempt ${rows[0].attempt_id}  ${rows[0].type} ${rows[0].ref_id}  ×${rows.length}`);
  }
  // C. near-simultaneous attempts that both earned XP
  for (const [, list] of group(attempts, (a) => `${a.user_id}|${a.quiz_id}`)) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    for (let i = 1; i < list.length; i++) {
      const gap = Date.parse(list[i].at) - Date.parse(list[i - 1].at);
      if (gap < 10_000 && list[i - 1].xp_awarded > 0 && list[i].xp_awarded > 0)
        report.push(`C  student ${who(list[i].user_id)}  ${list[i].quiz_id}  attempts ${list[i - 1].id} (+${list[i - 1].xp_awarded}) and ${list[i].id} (+${list[i].xp_awarded}) ${gap} ms apart`);
    }
  }

  console.log("Duplicate reward candidates");
  console.log(report.length ? report.join("\n") : "  none");
  console.log(`\nPotential excess XP from duplicates: ${excess}`);

  // informational
  const byAttempt = group(quizRows.filter((e) => e.attempt_id), (e) => e.attempt_id!);
  const legacy = quizRows.filter((e) => !e.attempt_id).length;
  const mism = attempts.filter((a) => (byAttempt.get(a.id) ?? []).reduce((s, e) => s + e.amount, 0) !== a.xp_awarded);
  console.log(`\nInformation (not duplicates)`);
  console.log(`  quiz reward rows recorded before attempts were linked (attempt_id empty, migration 0007): ${legacy}`);
  for (const a of mism) {
    const linked = (byAttempt.get(a.id) ?? []).reduce((s, e) => s + e.amount, 0);
    console.log(`  attempt ${a.id} (${a.quiz_id}, ${a.at.slice(0, 16)}) shows +${a.xp_awarded} XP, linked ledger rows +${linked}${linked === 0 ? " — made before rows were linked to attempts" : ""}`);
  }
  for (const p of profiles) {
    const sum = Math.max(0, events.filter((e) => e.user_id === p.id).reduce((s, e) => s + e.amount, 0));
    if (sum !== p.xp) console.log(`  student ${who(p.id)} lifetime XP ${p.xp} ≠ ledger ${sum}`);
  }
  console.log(`\n${report.length ? "Review the candidates above; nothing was changed." : "No duplicate quiz rewards found; nothing to correct."}`);
}

main().catch((e) => {
  console.error("ERROR", (e as Error).message);
  process.exit(1);
});
