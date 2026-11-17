/**
 *   npm run admin:bootstrap -- someone@example.com
 * Makes a registered account the Super Admin. Uses the server-side secret key from .env.local, so it can only
 * be run by someone who controls the Supabase project — the web app can never grant super_admin.
 * The change is recorded in role_audit_log (action "bootstrap").
 */
import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* variables may come from the environment */
}
const email = (process.argv[2] ?? "").trim().toLowerCase();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error("Usage: npm run admin:bootstrap -- <email>   (needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local)");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  let page = 1;
  let user: { id: string; email?: string } | undefined;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user || data.users.length < 200) break;
    page++;
  }
  if (!user) throw new Error(`No registered account uses ${email}. Sign up in the app first.`);
  const { data: before } = await admin.from("profiles").select("name, role").eq("id", user.id).single();
  if (!before) throw new Error("That account has no profile row.");
  if (before.role === "super_admin") {
    console.log(`${before.name} is already the Super Admin.`);
    return;
  }
  const upd = await admin.from("profiles").update({ role: "super_admin" }).eq("id", user.id);
  if (upd.error) throw upd.error;
  const log = await admin.from("role_audit_log").insert({ actor_id: null, actor_email: null, target_id: user.id, target_email: email, old_role: before.role, new_role: "super_admin", action: "bootstrap", note: "Set from the server with npm run admin:bootstrap" });
  if (log.error) throw log.error;
  console.log(`${before.name}: ${before.role} → super_admin (audited)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
