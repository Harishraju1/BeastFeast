// Starts the Next dev server from the project folder regardless of the caller's cwd.
//   node scripts/dev.mjs [port] [--local]
// --local ignores the Supabase settings in .env.local and runs in LOCAL MODE (accounts stored in this browser).
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const port = args.find((a) => /^\d+$/.test(a)) ?? "3210";
const local = args.includes("--local");
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
if (local) Object.assign(env, { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" });
const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "-p", port], { cwd: root, stdio: "inherit", env });
child.on("exit", (c) => process.exit(c ?? 0));
