// Copies Monaco's AMD build into public/ so Code Studio works offline (no CDN).
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
const src = path.resolve("node_modules/monaco-editor/min/vs");
const dst = path.resolve("public/monaco/vs");
if (!existsSync(src)) {
  console.warn("monaco-editor not installed; Code Studio will fall back to the CDN loader.");
  process.exit(0);
}
if (existsSync(dst)) rmSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log("Monaco copied to public/monaco/vs");
