/**
 * Backs up every application table to JSON files OUTSIDE the repository:
 *   D:\Claude Folder\beast-feast-backups\<timestamp>\<table>.json   (override with --out=<dir>)
 * Read-only (service role, paginated). Run before every migration:  npm run db:backup
 * Auth accounts and Storage files are managed by Supabase and are not part of this export.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may come from the shell */
}
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const TABLES = [
  "profiles", "profile_private", "projects", "tracks", "progress", "xp_events", "xp_rules", "xp_settings", "xp_reset_runs",
  "quiz_attempts", "learning_activity", "rank_history", "ranks", "role_audit_log", "user_achievements", "achievements",
  "announcements", "app_content", "videos", "weekly_missions", "learning_paths", "topics", "lessons", "quizzes",
  "quiz_questions", "quiz_membership", "quiz_answer_keys", "components", "component_pins", "component_specifications",
  "monitoring_settings", "rate_limit_daily",
];

async function main() {
  const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? resolve("..", "beast-feast-backups", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(out, { recursive: true });
  let total = 0;
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(t).select("*").range(from, from + 999);
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) break; // table not created yet on this database
        throw new Error(`${t}: ${error.message}`);
      }
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    writeFileSync(join(out, `${t}.json`), JSON.stringify(rows));
    total += rows.length;
    console.log(`${t.padEnd(26)} ${rows.length}`);
  }
  console.log(`\nbackup complete: ${total} rows → ${out}`);
}
main().catch((e) => {
  console.error("backup FAILED:", (e as Error).message);
  process.exit(1);
});
