// Starts the Next dev server from the project folder regardless of the caller's cwd.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.argv[2] ?? "3210";
const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "-p", port], { cwd: root, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
child.on("exit", (c) => process.exit(c ?? 0));
