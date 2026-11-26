/**
 * Workshop accounts without email: creates CONFIRMED student accounts from a CSV, so 1,000 students can sign in
 * without a single confirmation email (the email allowance is then only needed for password resets).
 *
 *   npm run accounts:bulk -- students.csv                      # dry run: validates every row, creates nothing
 *   npm run accounts:bulk -- students.csv --apply              # creates the accounts
 *   npm run accounts:bulk -- students.csv --apply --out=D:/secure/credentials.csv
 *   npm run accounts:bulk -- --delete=emails.txt               # removes accounts listed one email per line
 *
 * students.csv — header row, then one student per line:
 *   name,email,niat_id,phone
 *   Asha Kumar,asha@example.com,N24H01A0001,9876543210
 *
 * Every account gets a random temporary password (12 characters). The credentials file is written OUTSIDE the
 * repository (default: ../beast-feast-backups/) and must be handed out privately; students change the password
 * from their profile. Existing emails are skipped, never overwritten. NIAT IDs and phones are checked by the
 * same rules as the sign-up form and by the database trigger.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env.local — this key never leaves this machine and is never printed.
 */
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { mobileError, niatIdError, normalizeNiatId, toE164India } from "@/lib/validation";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may come from the shell */
}
const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const APPLY = process.argv.includes("--apply");
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
function tempPassword() {
  let p = "";
  while (!(/[a-z]/i.test(p) && /\d/.test(p)) || p.length < 12) {
    p = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  }
  return p;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

async function deleteListed(listFile: string) {
  const emails = new Set(fs.readFileSync(listFile, "utf8").split(/\r?\n/).map((x) => x.trim().toLowerCase()).filter(Boolean));
  let deleted = 0;
  for (let page = 1; emails.size && page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      if (!u.email || !emails.has(u.email.toLowerCase())) continue;
      const { error: e } = await admin.auth.admin.deleteUser(u.id);
      if (!e) {
        deleted++;
        emails.delete(u.email.toLowerCase());
      }
    }
    if (data.users.length < 1000) break;
  }
  console.log(`deleted ${deleted} account(s); not found: ${emails.size}`);
}

async function main() {
  const del = arg("delete");
  if (del) return deleteListed(del);
  if (!file) {
    console.error("Usage: npm run accounts:bulk -- students.csv [--apply] [--out=path]");
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  const head = rows.shift()?.map((h) => h.toLowerCase()) ?? [];
  const col = (n: string) => head.indexOf(n);
  if (col("email") < 0 || col("name") < 0) throw new Error("The CSV needs a header with at least: name,email (optional: niat_id,phone)");

  const seen = new Set<string>();
  const good: { line: number; name: string; email: string; niat: string | null; phone: string | null }[] = [];
  const bad: string[] = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    const name = r[col("name")] ?? "";
    const email = (r[col("email")] ?? "").toLowerCase();
    const niatRaw = col("niat_id") >= 0 ? r[col("niat_id")] ?? "" : "";
    const phoneRaw = col("phone") >= 0 ? r[col("phone")] ?? "" : "";
    if (!name || name.length > 80) return bad.push(`line ${line}: name missing or longer than 80 characters`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad.push(`line ${line}: invalid email`);
    if (seen.has(email)) return bad.push(`line ${line}: duplicate email in the file`);
    if (niatRaw && niatIdError(niatRaw)) return bad.push(`line ${line}: ${niatIdError(niatRaw)}`);
    if (phoneRaw && mobileError(phoneRaw)) return bad.push(`line ${line}: ${mobileError(phoneRaw)}`);
    seen.add(email);
    good.push({ line, name, email, niat: niatRaw ? normalizeNiatId(niatRaw) : null, phone: phoneRaw ? toE164India(phoneRaw) : null });
  });
  const niats = good.map((g) => g.niat).filter(Boolean);
  if (new Set(niats).size !== niats.length) bad.push("duplicate NIAT IDs in the file");
  console.log(`${good.length} valid row(s), ${bad.length} problem(s)`);
  for (const b of bad.slice(0, 50)) console.log(`  ✗ ${b}`);
  if (!APPLY) {
    console.log("\nDry run — nothing was created. Fix the problems above, then add --apply.");
    return;
  }
  if (bad.length) throw new Error("fix the problems in the CSV first (nothing was created)");

  const out = arg("out") ?? path.resolve("..", "beast-feast-backups", `accounts-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const lines = ["name,email,temporary_password,status"];
  let created = 0, skipped = 0, failed = 0;
  // small batches: Auth admin calls are rate limited
  for (let i = 0; i < good.length; i += 5) {
    await Promise.all(
      good.slice(i, i + 5).map(async (g) => {
        const password = tempPassword();
        const { error } = await admin.auth.admin.createUser({ email: g.email, password, email_confirm: true, user_metadata: { name: g.name, niat_id: g.niat, phone: g.phone } });
        if (!error) {
          created++;
          lines.push([g.name, g.email, password, "created"].map(csvCell).join(","));
        } else if (/already (been )?registered|already exists/i.test(error.message)) {
          skipped++;
          lines.push([g.name, g.email, "", "already registered — unchanged"].map(csvCell).join(","));
        } else {
          failed++;
          lines.push([g.name, g.email, "", `failed: ${/database error/i.test(error.message) ? "NIAT ID / phone rejected (already registered?)" : error.message}`].map(csvCell).join(","));
        }
      }),
    );
    await new Promise((r) => setTimeout(r, 250));
  }
  fs.writeFileSync(out, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(`\ncreated ${created}, skipped ${skipped} (already registered), failed ${failed}`);
  console.log(`credentials written to ${out} — hand them out privately and delete the file afterwards.`);
}

main().catch((e) => {
  console.error("bulk accounts stopped:", (e as Error).message);
  process.exitCode = 1;
});
