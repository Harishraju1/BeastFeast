/**
 * Live checks for migration 0013 (lighter saves + monitoring) against the Supabase project in .env.local.
 *   npm run monitoring:smoke
 * Creates temporary accounts (student, admin, super admin), checks access control on every admin_monitoring_*
 * function, checks that the save trigger only rebuilds what changed, then deletes the accounts.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { buildFromTemplate, getTemplate } from "@/lib/garage";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env from shell */
}
const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const RUN = Date.now().toString(36);
const made: string[] = [];
let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? `  — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 160)}` : ""}`);
}

async function account(tag: string, role: "student" | "admin" | "super_admin"): Promise<{ id: string; sb: SupabaseClient }> {
  const email = `monsmoke-${RUN}-${tag}@example.com`;
  const password = `${randomBytes(18).toString("base64url")}Aa1!`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `MONSMOKE ${tag}` } });
  if (error || !data.user) throw new Error(`create ${tag}: ${error?.message}`);
  made.push(data.user.id);
  if (role !== "student") await service.from("profiles").update({ role }).eq("id", data.user.id);
  const sb = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await sb.auth.signInWithPassword({ email, password });
  if (s.error) throw new Error(`sign in ${tag}: ${s.error.message}`);
  return { id: data.user.id, sb };
}

const now = new Date();
const from = new Date(now.getTime() - 7 * 86400e3).toISOString();
const to = now.toISOString();
const day = (d: Date) => d.toISOString().slice(0, 10);
const CALLS: { fn: string; args: Record<string, unknown>; superOnly: boolean }[] = [
  { fn: "admin_monitoring_overview", args: {}, superOnly: false },
  { fn: "admin_monitoring_series", args: { p_from: from, p_to: to }, superOnly: false },
  { fn: "admin_monitoring_emails", args: { p_from: from, p_to: to }, superOnly: false },
  { fn: "admin_monitoring_jobs", args: { p_from: from, p_to: to }, superOnly: false },
  { fn: "admin_monitoring_rate_limits", args: { p_from: day(new Date(from)), p_to: day(now) }, superOnly: false },
  { fn: "admin_monitoring_statements", args: { p_order: "total", p_limit: 5 }, superOnly: true },
  { fn: "admin_monitoring_tables", args: {}, superOnly: true },
  { fn: "admin_monitoring_usage_by_user", args: { p_limit: 5 }, superOnly: true },
];

async function main() {
  const before = (await service.from("projects").select("id", { count: "exact", head: true })).count;
  const student = await account("student", "student");
  const admin = await account("admin", "admin");
  const boss = await account("super", "super_admin");
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });

  for (const c of CALLS) {
    const a = await anon.rpc(c.fn, c.args);
    check(`anonymous visitor cannot call ${c.fn}`, !!a.error);
    const s = await student.sb.rpc(c.fn, c.args);
    check(`student cannot call ${c.fn}`, !!s.error, s.error?.message);
    const ad = await admin.sb.rpc(c.fn, c.args);
    check(c.superOnly ? `admin cannot call super-admin-only ${c.fn}` : `admin can call ${c.fn}`, c.superOnly ? !!ad.error : !ad.error, ad.error?.message);
    const su = await boss.sb.rpc(c.fn, c.args);
    check(`super admin can call ${c.fn}`, !su.error, su.error?.message ?? (Array.isArray(su.data) ? `${su.data.length} rows` : "ok"));
  }

  const ov = await boss.sb.rpc("admin_monitoring_overview");
  const o = ov.data as Record<string, unknown> | null;
  check("overview reports real connections and size", !!o && Number(o.connections) > 0 && Number(o.db_size_bytes) > 0, { connections: o?.connections, size: o?.db_size_bytes, max: o?.max_connections });
  check("capture job is scheduled every 5 minutes", (o?.capture_job as { schedule?: string } | null)?.schedule === "*/5 * * * *", o?.capture_job);
  check("pg_stat_statements available", o?.pg_stat_statements === true, o?.pg_stat_statements);
  const series = await boss.sb.rpc("admin_monitoring_series", { p_from: new Date(now.getTime() - 86400e3).toISOString(), p_to: new Date(now.getTime() + 60e3).toISOString() });
  check("at least one snapshot captured", Array.isArray(series.data) && series.data.length >= 1, `${(series.data as unknown[] | null)?.length} snapshots`);
  const tooLong = await boss.sb.rpc("admin_monitoring_series", { p_from: "2020-01-01T00:00:00Z", p_to: to });
  check("series refuses ranges over 120 days", !!tooLong.error, tooLong.error?.message);

  const setLow = await boss.sb.rpc("admin_monitoring_set", { p_key: "refresh_seconds", p_value: 5 });
  check("auto-refresh below 15 s is refused", !!setLow.error, setLow.error?.message);
  const setOk = await boss.sb.rpc("admin_monitoring_set", { p_key: "refresh_seconds", p_value: 60 });
  check("super admin can change a monitoring setting", !setOk.error, setOk.error?.message);
  const setAdmin = await admin.sb.rpc("admin_monitoring_set", { p_key: "refresh_seconds", p_value: 30 });
  check("admin cannot change monitoring settings", !!setAdmin.error, setAdmin.error?.message);
  const setBad = await boss.sb.rpc("admin_monitoring_set", { p_key: "db_password", p_value: 1 });
  check("unknown settings are refused", !!setBad.error, setBad.error?.message);
  const direct = await boss.sb.from("monitoring_snapshots").select("*").limit(1);
  check("monitoring tables are not readable directly (only via checked functions)", !!direct.error || (direct.data ?? []).length === 0, direct.error?.message ?? "0 rows");

  // ── lighter saves: an update that only changes the code must not rebuild parts/wires
  const p = buildFromTemplate(getTemplate("RR-04")!, student.id, "copy");
  const id = `monsmoke-${RUN}`;
  const row = (d: typeof p) => ({ id, owner_id: student.id, name: d.name, competition: d.competition, data: { ...d, id }, updated_at: new Date().toISOString() });
  const ins = await student.sb.from("projects").upsert(row(p));
  check("student can create a project", !ins.error, ins.error?.message);
  const parts1 = (await service.from("mechanical_assemblies").select("id").eq("project_id", id)).data ?? [];
  const wires1 = (await service.from("circuit_connections").select("id").eq("project_id", id)).data ?? [];
  check("derived parts and wires were built on insert", parts1.length > 0 && wires1.length === p.wires.length, `${parts1.length} parts, ${wires1.length}/${p.wires.length} wires`);
  await student.sb.from("projects").upsert(row({ ...p, code: p.code + "\n// edit" }));
  const parts2 = (await service.from("mechanical_assemblies").select("id").eq("project_id", id)).data ?? [];
  check("code-only save leaves the derived part rows untouched", JSON.stringify(parts2.map((r) => r.id).sort()) === JSON.stringify(parts1.map((r) => r.id).sort()));
  await student.sb.from("projects").upsert(row({ ...p, parts: p.parts.slice(0, -1) }));
  const parts3 = (await service.from("mechanical_assemblies").select("id").eq("project_id", id)).data ?? [];
  check("changing the parts rebuilds them", parts3.length !== parts1.length || parts3[0]?.id !== parts1[0]?.id, `${parts1.length} → ${parts3.length}`);
  const wires3 = (await service.from("circuit_connections").select("id").eq("project_id", id)).data ?? [];
  check("wires stay correct", wires3.length === p.wires.length, `${wires3.length}`);

  return before;
}

main()
  .then(async (before) => {
    for (const uid of made) await service.auth.admin.deleteUser(uid);
    const after = (await service.from("projects").select("id", { count: "exact", head: true })).count;
    check("existing projects unchanged after cleanup", after === before, `${before} → ${after}`);
  })
  .catch(async (e) => {
    fail++;
    console.error("smoke stopped:", (e as Error).message);
    for (const uid of made) await service.auth.admin.deleteUser(uid);
  })
  .finally(() => {
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) process.exitCode = 1;
  });
