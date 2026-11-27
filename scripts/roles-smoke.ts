/**
 * Role & admin security test against the Supabase project in .env.local and a running app.
 *   npx tsx scripts/roles-smoke.ts [baseUrl]      (default http://localhost:3210)
 * Creates temporary accounts (student, admin-to-be, two super admins), checks every rule of the role system
 * in the database and on the /admin route, then deletes the accounts and their audit rows.
 * Credentials are generated per run and never printed.
 */
import { randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const BASE = process.argv[2] ?? "http://localhost:3210";
const TAG = "beastfeast-roles";
const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

type Acct = { id: string; email: string; password: string; sb: SupabaseClient; cookie: string };
const made: string[] = [];

async function account(name: string, role: "student" | "super_admin"): Promise<Acct> {
  const email = `${TAG}-${name}-${Date.now()}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { skip_profile_checks: true }, user_metadata: { name: `Roles ${name}` } });
  if (error) throw error;
  made.push(data.user.id);
  if (role === "super_admin") await service.from("profiles").update({ role }).eq("id", data.user.id);
  // sign in the way the app does (cookie session), capturing the cookies for HTTP requests to /admin
  const jar = new Map<string, string>();
  const sb = createServerClient(URL_, PUB, { cookies: { getAll: () => [...jar].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach((c) => jar.set(c.name, c.value)) } });
  const r = await sb.auth.signInWithPassword({ email, password });
  if (r.error) throw r.error;
  const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
  return { id: data.user.id, email, password, sb: sb as unknown as SupabaseClient, cookie };
}

async function adminRoute(cookie?: string) {
  const res = await fetch(`${BASE}/admin`, { redirect: "manual", headers: cookie ? { cookie } : {} });
  const html = res.status === 200 ? await res.text() : "";
  return { status: res.status, location: res.headers.get("location") ?? "", denied: html.includes("Access denied"), dashboard: !html.includes("Access denied") && res.status === 200 };
}

async function main() {
  const student = await account("student", "student");
  const helper = await account("helper", "student");
  const boss = await account("super", "super_admin");
  const boss2 = await account("super2", "super_admin");
  console.log("created 4 temporary accounts");

  // ── database rules: students
  const sFind = await student.sb.rpc("admin_find_user", { p_email: helper.email });
  check("student cannot look up accounts by email", !!sFind.error, sFind.error?.message);
  const sSet = await student.sb.rpc("admin_set_role", { p_user: student.id, p_role: "admin" });
  check("student cannot promote themselves via the function", !!sSet.error, sSet.error?.message);
  await student.sb.from("profiles").update({ role: "super_admin" }).eq("id", student.id);
  const sRole = (await service.from("profiles").select("role").eq("id", student.id).single()).data?.role;
  check("student cannot change their own role with a direct update", sRole === "student", `role is ${sRole}`);
  const sAudit = await student.sb.from("role_audit_log").select("*");
  check("student cannot read the audit log", (sAudit.data?.length ?? 0) === 0);
  const sForge = await student.sb.from("role_audit_log").insert({ new_role: "admin", action: "promote" });
  check("student cannot write audit entries", !!sForge.error);
  const sStaff = await student.sb.rpc("admin_list_staff");
  check("student cannot list staff", !!sStaff.error);

  // ── super admin: email search and promotion
  const found = await boss.sb.rpc("admin_find_user", { p_email: helper.email.toUpperCase() });
  check("Super Admin finds a registered user by email (case-insensitive)", !found.error && found.data?.[0]?.id === helper.id && found.data?.[0]?.role === "student", `${found.data?.[0]?.name} / ${found.data?.[0]?.role}`);
  const none = await boss.sb.rpc("admin_find_user", { p_email: `${TAG}-nobody@example.com` });
  check("searching an unregistered email returns no account", !none.error && none.data?.length === 0);
  const promote = await boss.sb.rpc("admin_set_role", { p_user: helper.id, p_role: "admin", p_note: "roles smoke test" });
  const helperRole = (await service.from("profiles").select("role").eq("id", helper.id).single()).data?.role;
  check("MAKE ADMIN promotes the account", !promote.error && helperRole === "admin", promote.error?.message ?? `role is ${helperRole}`);
  const logged = await service.from("role_audit_log").select("*").eq("target_id", helper.id);
  check("promotion is recorded in the audit log", logged.data?.length === 1 && logged.data[0].action === "promote" && logged.data[0].actor_id === boss.id && logged.data[0].old_role === "student");
  const toSuper = await boss.sb.rpc("admin_set_role", { p_user: student.id, p_role: "super_admin" });
  check("the app cannot grant super_admin", !!toSuper.error, toSuper.error?.message);
  const self = await boss.sb.rpc("admin_set_role", { p_user: boss.id, p_role: "student" });
  check("Super Admin cannot change their own role", !!self.error, self.error?.message);
  const other = await boss.sb.rpc("admin_set_role", { p_user: boss2.id, p_role: "student" });
  check("a Super Admin account is protected from demotion", !!other.error, other.error?.message);

  // ── ordinary admin: dashboard yes, role management no
  const hStaff = await helper.sb.rpc("admin_list_staff");
  check("admin can list staff", !hStaff.error && (hStaff.data ?? []).some((r: { id: string }) => r.id === helper.id));
  const hAudit = await helper.sb.from("role_audit_log").select("*").eq("target_id", helper.id);
  check("admin can read the audit log", (hAudit.data?.length ?? 0) === 1);
  const hFind = await helper.sb.rpc("admin_find_user", { p_email: student.email });
  check("admin cannot look up accounts by email", !!hFind.error);
  const hSet = await helper.sb.rpc("admin_set_role", { p_user: student.id, p_role: "admin" });
  check("admin cannot promote others", !!hSet.error);
  await helper.sb.from("profiles").update({ role: "super_admin" }).eq("id", helper.id);
  const hRole = (await service.from("profiles").select("role").eq("id", helper.id).single()).data?.role;
  check("admin cannot raise their own role", hRole === "admin", `role is ${hRole}`);

  // ── revoke
  const revoke = await boss.sb.rpc("admin_set_role", { p_user: helper.id, p_role: "student" });
  const after = (await service.from("profiles").select("role").eq("id", helper.id).single()).data?.role;
  check("Super Admin can revoke admin access (audited)", !revoke.error && after === "student" && ((await service.from("role_audit_log").select("id").eq("target_id", helper.id)).data?.length ?? 0) === 2);

  // ── /admin route on the server
  const anon = await adminRoute();
  check("/admin redirects signed-out visitors to login", anon.status >= 300 && anon.status < 400 && anon.location.includes("/login"), `${anon.status} → ${anon.location}`);
  const st = await adminRoute(student.cookie);
  check("/admin denies a signed-in student", st.status === 200 && st.denied, `status ${st.status}`);
  await boss.sb.rpc("admin_set_role", { p_user: helper.id, p_role: "admin" });
  const ad = await adminRoute(helper.cookie);
  check("/admin opens for an admin", ad.dashboard, `status ${ad.status}`);
  const su = await adminRoute(boss.cookie);
  check("/admin opens for the Super Admin", su.dashboard, `status ${su.status}`);
}

async function cleanup() {
  if (made.length) {
    await service.from("role_audit_log").delete().in("target_id", made);
    for (const id of made) await service.auth.admin.deleteUser(id);
  }
  const left = await service.from("profiles").select("id", { count: "exact", head: true }).in("id", made.length ? made : ["00000000-0000-0000-0000-000000000000"]);
  console.log(`cleaned up ${made.length} temporary accounts (profiles left: ${left.count ?? 0})`);
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(async () => {
    await cleanup();
    console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll role & admin checks passed.");
    process.exitCode = failures ? 1 : 0;
  });
