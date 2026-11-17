/**
 * Cloud-mode smoke test against the Supabase project in .env.local.
 *   npx tsx scripts/cloud-smoke.ts setup     creates two confirmed test accounts and runs the checks
 *   npx tsx scripts/cloud-smoke.ts cleanup   deletes the test accounts (their profiles, projects, XP … cascade)
 * Test credentials are kept in .env.test.local (gitignored) and never printed.
 */
import { randomBytes } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { SupabaseBackend } from "../src/lib/data/supabase";
import { buildFromTemplate, getTemplate } from "../src/lib/garage";
import { TOPICS } from "../src/lib/learning";

process.loadEnvFile(".env.local");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CREDS = ".env.test.local";
const TAG = "beastfeast-smoke";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const mine = (data?.users ?? []).filter((u) => u.email?.startsWith(TAG));
  for (const u of mine) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    console.log(error ? `could not delete ${u.id}: ${error.message}` : `deleted test account ${u.id}`);
  }
  const left = await admin.from("profiles").select("id", { count: "exact", head: true }).in("id", mine.map((u) => u.id));
  console.log(`profiles left for test accounts: ${left.count ?? 0}`);
  if (existsSync(CREDS)) rmSync(CREDS);
}

async function setup() {
  const mk = async (name: string) => {
    const email = `${TAG}-${name.toLowerCase()}-${Date.now()}@example.com`;
    const password = randomBytes(18).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `Smoke ${name}`, campus: "KKH", student_id: `T-${name}` } });
    if (error) throw new Error(`createUser ${name}: ${error.message}`);
    return { id: data.user.id, email, password };
  };
  const A = await mk("A");
  const B = await mk("B");
  writeFileSync(CREDS, `# temporary cloud smoke-test accounts — deleted by: npx tsx scripts/cloud-smoke.ts cleanup\nTEST_A_EMAIL=${A.email}\nTEST_A_PASSWORD=${A.password}\nTEST_B_EMAIL=${B.email}\nTEST_B_PASSWORD=${B.password}\n`);
  console.log("created two confirmed test accounts (credentials in .env.test.local)");

  // ── student A through the app's own SupabaseBackend
  const be = new SupabaseBackend(URL_, PUB);
  const me = await be.signIn(A.email, A.password);
  check("sign-in returns the trigger-created profile", me.id === A.id && me.name === "Smoke A" && me.role === "student" && me.xp === 0, `${me.name}, ${me.role}, ${me.xp} XP`);

  const t = getTemplate("LF-03")!;
  const proj = buildFromTemplate(t, A.id, "copy");
  await be.saveProject(proj);
  const listed = await be.listProjects(A.id);
  const back = listed.find((p) => p.id === proj.id);
  check("Garage LF-03 copy saves and loads intact", !!back && back.parts.length === proj.parts.length && back.wires.length === proj.wires.length && back.code === proj.code && back.origin?.templateId === "LF-03", back ? `${back.parts.length} parts, ${back.wires.length} wires` : "missing");
  const asm = await admin.from("mechanical_assemblies").select("id", { count: "exact", head: true }).eq("project_id", proj.id);
  const wires = await admin.from("circuit_connections").select("id", { count: "exact", head: true }).eq("project_id", proj.id);
  check("project trigger fills the normalised tables", (asm.count ?? 0) === proj.parts.length && (wires.count ?? 0) === proj.wires.length, `${asm.count} assemblies, ${wires.count} connections`);

  const x1 = await be.awardXp(A.id, "project-created", proj.id);
  const x2 = await be.awardXp(A.id, "project-created", proj.id);
  check("award_xp uses server amount and ignores duplicates", x1.awarded === 10 && x2.awarded === 0 && x2.total === 10, `${x1.awarded} then ${x2.awarded}, total ${x2.total}`);
  let refused = false;
  try {
    await be.awardXp(A.id, "quiz-pass", "fake");
  } catch {
    refused = true;
  }
  check("client cannot award quiz XP directly", refused);

  const topic = TOPICS[0];
  const right = Object.fromEntries(topic.quiz.map((q) => [q.id, q.answerIndex]));
  const q1 = await be.submitQuiz(A.id, `topic:${topic.id}`, right);
  const q2 = await be.submitQuiz(A.id, `topic:${topic.id}`, right);
  check("submit_quiz grades against hidden keys", q1.correct === topic.quiz.length && q1.passed, `${q1.correct}/${q1.total}, +${q1.xpAwarded} XP`);
  check("re-submitting a quiz earns no extra XP", q2.xpAwarded === 0);
  const wrong = Object.fromEntries(topic.quiz.map((q) => [q.id, (q.answerIndex + 1) % q.options.length]));
  const q3 = await be.submitQuiz(A.id, `topic:${topic.id}`, wrong);
  check("wrong answers fail", q3.correct === 0 && !q3.passed, `${q3.correct}/${q3.total}`);

  const l1 = await be.awardXp(A.id, "lesson-complete", topic.id);
  const l2 = await be.awardXp(A.id, "lesson-complete", topic.id);
  check("lesson completion awards 20 XP once", l1.awarded === 20 && l2.awarded === 0);
  const prog = await be.getProgress(A.id);
  check("progress records topic and correct answers", prog.completedTopics.includes(topic.id) && prog.correctQuestions.length === topic.quiz.length && prog.quizAttempts.length === 3);

  await be.updateProfile({ id: A.id, name: "Smoke A2" });
  const sbA = (be as unknown as { sb: SupabaseClient }).sb;
  await sbA.from("profiles").update({ role: "admin", xp: 99999 }).eq("id", A.id);
  const after = await be.currentUser();
  const expectedXp = 10 + q1.xpAwarded + 20;
  check("student can rename but not make themselves admin or set XP", after?.name === "Smoke A2" && after.role === "student" && after.xp === expectedXp, `${after?.role}, ${after?.xp} XP (expected ${expectedXp})`);

  await be.saveTrack({ id: `trk-smoke-${Date.now()}`, ownerId: A.id, name: "Smoke loop", kind: "line", difficulty: "beginner" } as never);
  check("student can save a track", (await be.listTracks(A.id)).length === 1);

  // ── student B with a separate client: must not see or change A's data
  const sbB = createClient(URL_, PUB, { auth: { persistSession: false } });
  await sbB.auth.signInWithPassword({ email: B.email, password: B.password });
  const peek = await sbB.from("projects").select("id").eq("id", proj.id);
  check("another student cannot read A's project", !peek.error && peek.data?.length === 0);
  const tamper = await sbB.from("projects").update({ name: "hacked" }).eq("id", proj.id).select("id");
  const still = await admin.from("projects").select("name").eq("id", proj.id).single();
  check("another student cannot change A's project", (tamper.data?.length ?? 0) === 0 && still.data?.name === proj.name);
  const forge = await sbB.from("projects").insert({ id: "forged", owner_id: A.id, name: "x", competition: "line", data: {} });
  check("another student cannot create projects as A", !!forge.error);
  const keys = await sbB.from("quiz_answer_keys").select("*").limit(1);
  check("students cannot read quiz answer keys", !!keys.error || keys.data?.length === 0);
  const forgeXp = await sbB.from("xp_events").insert({ user_id: B.id, type: "competition-win", ref_id: "x", amount: 5000 });
  check("students cannot insert XP events", !!forgeXp.error);
  const board = await sbB.from("profiles").select("id,xp").eq("id", A.id).single();
  check("leaderboard shows A's server-side XP to B", board.data?.xp === expectedXp, `${board.data?.xp} XP`);
  const comps = await sbB.from("components").select("id", { count: "exact", head: true });
  check("signed-in students can read the catalogue", comps.count === 552, `${comps.count} components`);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll cloud checks passed.");
  process.exitCode = failures ? 1 : 0;
}

const mode = process.argv[2];
(mode === "cleanup" ? cleanup() : mode === "setup" ? setup() : Promise.resolve(console.log("usage: tsx scripts/cloud-smoke.ts setup|cleanup"))).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
