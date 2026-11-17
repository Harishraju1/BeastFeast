/**
 *   npm run db:push
 * Applies supabase/migrations/*.sql to the database in SUPABASE_DB_URL (from .env.local) with the Supabase CLI.
 * Use the "Session pooler" connection string from Supabase → Connect; it works on IPv4 networks.
 */
import { spawnSync } from "node:child_process";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* variables may come from the environment instead */
}
const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Set SUPABASE_DB_URL in .env.local (Supabase → Connect → Session pooler connection string, with your database password).");
  process.exit(1);
}
const r = spawnSync("npx", ["--yes", "supabase@2", "db", "push", "--db-url", dbUrl, "--include-all"], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
