/**
 * Secret scan: the working tree, every blob in git history and the production build output.
 *   npx tsx scripts/secret-scan.ts
 * Never prints a secret — only where a match is and what kind it is. JWTs are decoded to tell the public
 * anon key (role "anon", safe to ship) from a service-role key (must never be committed).
 * Exits 1 if anything secret is found.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const findings: string[] = [];
const notes: string[] = [];
const PATTERNS: [string, RegExp][] = [
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{20,}/g],
  ["Postgres URL with password", /postgres(?:ql)?:\/\/[^:\s"'`]+:[^@\s"'`]{6,}@/g],
  ["Private key block", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{30,}/g],
  ["Vercel token", /\bvercel_[A-Za-z0-9]{20,}/gi],
  ["AWS access key", /AKIA[0-9A-Z]{16}/g],
  ["Generic secret assignment", /(?:SERVICE_ROLE_KEY|DB_PASSWORD|SMTP_PASS(?:WORD)?|SECRET_KEY)\s*[=:]\s*["']?[A-Za-z0-9_\-.]{16,}/g],
];
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

// the real secret values from .env.local (if present) are searched for literally
const realSecrets: [string, string][] = [];
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL)=(.+)$/);
    if (m && m[2].trim().length > 12) realSecrets.push([m[1], m[2].trim()]);
  }
}

function scan(where: string, text: string) {
  for (const [name, re] of PATTERNS) {
    const n = text.match(re)?.length ?? 0;
    if (n) findings.push(`${where}: ${name} ×${n}`);
  }
  for (const tok of text.match(JWT) ?? []) {
    try {
      const role = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()).role;
      if (role === "service_role") findings.push(`${where}: service_role JWT`);
      else notes.push(`${where}: JWT with role "${role}" (public anon key — expected in client config)`);
    } catch {
      /* not a JWT */
    }
  }
  for (const [name, val] of realSecrets) if (text.includes(val)) findings.push(`${where}: the real ${name} value`);
}

const SKIP = /(^|\/)(node_modules|\.git|\.next\/cache|public\/monaco)(\/|$)/;
const textFile = (p: string) => !/\.(png|jpe?g|webp|gif|ico|glb|gltf|woff2?|ttf|hex|pdf|zip)$/i.test(p);

// 1. tracked files in the working tree
for (const f of execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean)) {
  if (!textFile(f) || f === "scripts/secret-scan.ts" || !existsSync(f) || !statSync(f).isFile()) continue;
  scan(`tree:${f}`, readFileSync(f, "utf8"));
}
// 2. every blob ever committed (all branches)
const blobs = execSync("git rev-list --all --objects", { encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\n")
  .map((l) => l.split(" "))
  .filter((p) => p.length >= 2 && p[1] && textFile(p[1]) && !p[1].endsWith("secret-scan.ts"));
const seen = new Set<string>();
for (const [sha, path] of blobs) {
  if (seen.has(sha)) continue;
  seen.add(sha);
  let body = "";
  try {
    if (Number(execSync(`git cat-file -s ${sha}`, { encoding: "utf8" })) > 5_000_000) continue;
    body = execSync(`git cat-file -p ${sha}`, { encoding: "utf8", maxBuffer: 1 << 26 });
  } catch {
    continue;
  }
  scan(`history:${path}@${sha.slice(0, 8)}`, body);
}
// 3. production build output that is served to browsers
function walk(dir: string, out: string[] = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (SKIP.test(p.replace(/\\/g, "/"))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|css|html|json|txt|map)$/.test(n)) out.push(p);
  }
  return out;
}
for (const f of walk(".next/static")) scan(`build:${f}`, readFileSync(f, "utf8"));
for (const f of walk("public")) if (textFile(f)) scan(`public:${f}`, readFileSync(f, "utf8"));

const uniqNotes = [...new Set(notes.map((n) => n.replace(/@[0-9a-f]{8}/, "")))];
console.log(`Scanned ${seen.size} history blobs, the working tree, .next/static and public/.`);
console.log(`Public anon-key JWT locations: ${uniqNotes.length}`);
if (findings.length) {
  console.log("\nSECRETS FOUND:");
  for (const f of [...new Set(findings)]) console.log("  " + f);
  process.exitCode = 1;
} else console.log("No secrets found (no service-role key, secret key, database password or private token).");
