/**
 * Load test: N virtual students autosaving their robot projects at the same time, against the real Supabase
 * project in .env.local — through the same REST + RLS path the app uses (signed-in users, not the service key).
 *
 *   npm run load:test -- --dry                 # 20 students, quick check
 *   npm run load:test                          # ramp to 1000 students
 *   npm run load:test -- --students=500 --sustain=30 --site=https://beast-feast-pi.vercel.app
 *   npm run load:test -- --skip-heavy          # leave out the 1000 × 180 KB stage
 *   npm run load:test -- --cleanup             # remove any leftover load-test accounts
 *
 * Safety:
 *  - creates a few temporary accounts (loadtest-<run>-<n>@example.com, name "LOADTEST …", no NIAT/phone)
 *    and deletes them at the end — deleting the account cascades to its projects and derived rows;
 *  - ramps up and stops the write stages when more than 25 % of requests fail;
 *  - Ctrl+C still cleans up; `--cleanup` removes leftovers from an interrupted run;
 *  - never prints keys or passwords.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { buildFromTemplate, getTemplate } from "@/lib/garage";
import type { Project } from "@/lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may come from the shell */
}
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !ANON || !SERVICE) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const DRY = process.argv.includes("--dry");
const STUDENTS = DRY ? 20 : Number(arg("students", "1000"));
const USERS = DRY ? 2 : Number(arg("users", "10"));
const SUSTAIN_S = DRY ? 10 : Number(arg("sustain", "60"));
const SAVE_EVERY_S = Number(arg("every", "4"));
const SITE = arg("site", "");
const RUN = `${Date.now().toString(36)}`;
const PREFIX = "loadtest-";
const EMAIL_DOMAIN = "example.com";
const ABORT_ERROR_RATE = 0.25;

const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// ─────────────────────────────── stats ───────────────────────────────
interface Stage { name: string; ok: number; fail: number; lat: number[]; wallMs: number; errors: Map<string, number> }
const stages: Stage[] = [];
const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0);
function newStage(name: string): Stage {
  const s = { name, ok: 0, fail: 0, lat: [], wallMs: 0, errors: new Map() };
  stages.push(s);
  return s;
}
async function timed(s: Stage, fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>) {
  const t = performance.now();
  try {
    const { error } = await fn();
    s.lat.push(performance.now() - t);
    if (error) {
      s.fail++;
      const k = `${error.code ?? ""} ${error.message ?? ""}`.trim().slice(0, 120);
      s.errors.set(k, (s.errors.get(k) ?? 0) + 1);
    } else s.ok++;
  } catch (e) {
    s.lat.push(performance.now() - t);
    s.fail++;
    const k = (e as Error).message.slice(0, 120);
    s.errors.set(k, (s.errors.get(k) ?? 0) + 1);
  }
}
function report(s: Stage) {
  const n = s.ok + s.fail;
  const line = `${s.name.padEnd(44)} ${String(n).padStart(5)} req  ok ${String(s.ok).padStart(5)}  fail ${String(s.fail).padStart(4)} (${((s.fail / Math.max(1, n)) * 100).toFixed(1)}%)  p50 ${pct(s.lat, 50).toFixed(0).padStart(5)} ms  p95 ${pct(s.lat, 95).toFixed(0).padStart(5)} ms  p99 ${pct(s.lat, 99).toFixed(0).padStart(5)} ms  max ${Math.max(0, ...s.lat).toFixed(0).padStart(5)} ms  ${(n / (s.wallMs / 1000)).toFixed(0)} req/s`;
  console.log(line);
  for (const [k, v] of s.errors) console.log(`    ${v}× ${k}`);
}
const errorRate = (s: Stage) => s.fail / Math.max(1, s.ok + s.fail);

// ─────────────────────────────── accounts ───────────────────────────────
interface TestUser { id: string; client: SupabaseClient }
const created: string[] = [];

async function createUsers(n: number): Promise<TestUser[]> {
  const users: TestUser[] = [];
  for (let i = 0; i < n; i++) {
    const email = `${PREFIX}${RUN}-${i}@${EMAIL_DOMAIN}`;
    const password = `${randomBytes(18).toString("base64url")}Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `LOADTEST ${RUN} ${i}` } });
    if (error || !data.user) throw new Error(`could not create test account ${i}: ${error?.message}`);
    created.push(data.user.id);
    const client = createClient(SB_URL!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } });
    for (let attempt = 0; ; attempt++) {
      const { error: e } = await client.auth.signInWithPassword({ email, password });
      if (!e) break;
      if (attempt >= 3) throw new Error(`sign-in failed for test account ${i}: ${e.message}`);
      console.log(`  sign-in ${i} rate-limited (${e.message}) — waiting 20 s`);
      await new Promise((r) => setTimeout(r, 20000));
    }
    users.push({ id: data.user.id, client });
  }
  return users;
}

/** Deletes the accounts (cascading to their projects). Retries with back-off, because right after a heavy
 *  stage the database may still be working through its backlog. */
async function deleteUsers(ids: string[]) {
  let pending = [...ids];
  for (let attempt = 0; attempt < 6 && pending.length; attempt++) {
    if (attempt) {
      console.log(`  ${pending.length} account(s) not deleted yet — retrying in ${attempt * 15} s`);
      await new Promise((r) => setTimeout(r, attempt * 15000));
    }
    const still: string[] = [];
    for (const id of pending) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error && !/not found/i.test(error.message)) still.push(id);
    }
    pending = still;
  }
  return pending.length;
}

async function cleanupLeftovers() {
  let page = 1;
  const ids: string[] = [];
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    ids.push(...data.users.filter((u) => u.email?.startsWith(PREFIX) && u.email.endsWith(`@${EMAIL_DOMAIN}`)).map((u) => u.id));
    if (data.users.length < 1000) break;
    page++;
  }
  const failed = await deleteUsers(ids);
  console.log(`cleanup: ${ids.length} leftover load-test account(s) found, ${ids.length - failed} deleted${failed ? `, ${failed} FAILED` : ""}`);
}

// ─────────────────────────────── payloads ───────────────────────────────
/** typical = a Garage copy with one saved code version (~26 KB, the live median is ~25 KB);
 *  heavy = + 5 code versions and 3 recorded runs with replay paths (~180 KB, the live max is ~186 KB). */
function payload(owner: string, n: number, heavy: boolean): Project {
  const p = buildFromTemplate(getTemplate("RR-04")!, owner, "copy");
  const ghost = Array.from({ length: 600 }, (_, i) => ({ t: i / 10, x: Math.cos(i / 50) * 1.234567, y: Math.sin(i / 50) * 2.345678, h: (i / 600) * 6.283 }));
  return {
    ...p,
    id: `${PREFIX}${RUN}-p${n}`,
    name: `LOADTEST ${n}`,
    codeVersions: Array.from({ length: heavy ? 5 : 1 }, (_, i) => ({ id: `cv_${i}`, at: new Date().toISOString(), source: p.code, note: "Saved" })),
    simulations: heavy ? Array.from({ length: 3 }, (_, i) => ({ id: `sim_${i}`, at: new Date().toISOString(), mode: "race", trackId: p.trackId ?? "x", controlMode: "code", lapTimeS: 30 + i, bestLapS: 30, avgSpeed: 1.2, maxSpeed: 2.1, distanceM: 40, collisions: 0, completion: 1, outcome: "completed", ghost })) as Project["simulations"] : [],
  } as Project;
}

interface Student { user: TestUser; project: Project; edits: number }
function save(st: Student) {
  st.edits++;
  const p = { ...st.project, updatedAt: new Date().toISOString(), code: `${st.project.code}\n// edit ${st.edits}` };
  return st.user.client.from("projects").upsert({ id: p.id, owner_id: p.ownerId, name: p.name, competition: p.competition, data: p, thumbnail: null, updated_at: p.updatedAt });
}

// ─────────────────────────────── stages ───────────────────────────────
async function burst(name: string, students: Student[]) {
  const s = newStage(name);
  const t = performance.now();
  await Promise.all(students.map((st) => timed(s, () => save(st))));
  s.wallMs = performance.now() - t;
  report(s);
  return s;
}

async function sustained(name: string, students: Student[], seconds: number, everyS: number) {
  const s = newStage(name);
  const t = performance.now();
  const end = t + seconds * 1000;
  await Promise.all(
    students.map(async (st) => {
      await new Promise((r) => setTimeout(r, Math.random() * everyS * 1000));
      while (performance.now() < end) {
        await timed(s, () => save(st));
        await new Promise((r) => setTimeout(r, everyS * 1000 * (0.7 + Math.random() * 0.6)));
      }
    }),
  );
  s.wallMs = performance.now() - t;
  report(s);
  return s;
}

async function reads(name: string, students: Student[]) {
  const s = newStage(name);
  const t = performance.now();
  await Promise.all(students.map((st) => timed(s, () => st.user.client.from("projects").select("data").eq("id", st.project.id))));
  s.wallMs = performance.now() - t;
  report(s);
  return s;
}

async function pages(name: string, n: number, concurrency: number) {
  const s = newStage(name);
  const urls = ["/", "/garage", "/learn", "/login"];
  let next = 0;
  const t = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < n) {
        const i = next++;
        await timed(s, async () => {
          const r = await fetch(SITE + urls[i % urls.length], { headers: { "user-agent": "beast-feast-load-test" } });
          await r.arrayBuffer();
          return { error: r.ok ? null : { code: String(r.status), message: r.statusText } };
        });
      }
    }),
  );
  s.wallMs = performance.now() - t;
  report(s);
  return s;
}

// ─────────────────────────────── main ───────────────────────────────
async function main() {
  if (process.argv.includes("--cleanup")) return cleanupLeftovers();
  console.log(`BEAST FEAST load test · run ${RUN} · ${STUDENTS} students on ${USERS} temporary accounts · Supabase ${new URL(SB_URL!).host}${DRY ? " · DRY RUN" : ""}\n`);
  let stopped = false;
  const onSig = async () => {
    if (stopped) return;
    stopped = true;
    console.log("\ninterrupted — cleaning up…");
    const failed = await deleteUsers(created);
    console.log(`deleted ${created.length - failed}/${created.length} test accounts`);
    process.exit(130);
  };
  process.on("SIGINT", onSig);
  try {
    const users = await createUsers(USERS);
    console.log(`created and signed in ${users.length} temporary accounts\n`);
    const students: Student[] = Array.from({ length: STUDENTS }, (_, n) => {
      const user = users[n % users.length];
      return { user, project: payload(user.id, n, false), edits: 0 };
    });
    console.log(`typical project ≈ ${(Buffer.byteLength(JSON.stringify(students[0].project)) / 1024).toFixed(0)} KB · heavy ≈ ${(Buffer.byteLength(JSON.stringify(payload(users[0].id, 0, true))) / 1024).toFixed(0)} KB\n`);

    // first save = project creation, done in calm batches of 50
    const create = newStage("create projects (batches of 50)");
    const tc = performance.now();
    for (let i = 0; i < students.length; i += 50) await Promise.all(students.slice(i, i + 50).map((st) => timed(create, () => save(st))));
    create.wallMs = performance.now() - tc;
    report(create);
    if (errorRate(create) > ABORT_ERROR_RATE) throw new Error("too many failures creating projects — stopping");

    // everyone presses save at the same moment, ramping up
    const steps = DRY ? [STUDENTS] : [100, 250, 500, 1000].filter((x) => x <= STUDENTS);
    if (!DRY && !steps.includes(STUDENTS)) steps.push(STUDENTS);
    let ok = true;
    for (const n of steps) {
      const s = await burst(`burst: ${n} saves at the same instant`, students.slice(0, n));
      if (errorRate(s) > ABORT_ERROR_RATE) {
        console.log(`  >${ABORT_ERROR_RATE * 100}% failed — not ramping further`);
        ok = false;
        break;
      }
    }

    // everyone opening their project at the same moment (typical size — keeps download traffic small)
    await reads(`read: ${STUDENTS} projects opened at once`, students);

    if (ok) {
      // a lab session: everyone actively editing, autosave every ~4 s each
      const s = await sustained(`sustained: ${STUDENTS} editing, save every ~${SAVE_EVERY_S}s, ${SUSTAIN_S}s`, students, SUSTAIN_S, SAVE_EVERY_S);
      if (errorRate(s) <= ABORT_ERROR_RATE && !process.argv.includes("--skip-heavy")) {
        // worst case: big projects (versions + replays); upload only, nothing is downloaded
        for (const st of students) st.project = payload(st.user.id, Number(st.project.id.split("-p")[1]), true);
        await burst(`burst: ${STUDENTS} HEAVY (~180 KB) saves at once`, students);
      }
    }

    if (SITE) await pages(`site: ${STUDENTS} page loads, 200 at a time`, STUDENTS, Math.min(200, STUDENTS));
  } finally {
    if (!stopped) {
      process.off("SIGINT", onSig);
      const failed = await deleteUsers(created);
      const { count } = await admin.from("projects").select("id", { count: "exact", head: true }).like("id", `${PREFIX}${RUN}-%`);
      console.log(`\ncleanup: deleted ${created.length - failed}/${created.length} temporary accounts; ${count ?? "?"} test projects left in the database`);
    }
  }
}

main().catch((e) => {
  console.error("load test stopped:", (e as Error).message);
  process.exitCode = 1;
});
