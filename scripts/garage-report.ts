/**
 *   npm run garage:report
 * Runs the readiness test and every behaviour scenario for the BEAST PROJECT GARAGE and writes
 * GARAGE_TEST_REPORT.md (configuration, expected behaviour, actual behaviour, result, limitations).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { GARAGE_TEMPLATES } from "../src/lib/garage";
import { runReadiness } from "../src/lib/garage/readiness";
import { allScenarios, runScenario } from "../src/lib/garage/scenarios";
import { familyScenarios } from "../src/lib/garage/familyScenarios";
import { UNSUPPORTED_VARIANTS } from "../src/lib/garage/projects/families";

const L: string[] = [];
const started = Date.now();
L.push("# BEAST PROJECT GARAGE — TEST REPORT", "");
L.push(`Generated ${new Date().toISOString()} by \`npm run garage:report\`. Every scenario runs the real stack: the project's firmware in the sandboxed interpreter → its circuit graph → driver/motor models → planar physics → sensor geometry → back to the firmware. No path following or scripted results are used.`, "");

L.push("## Readiness (14 automated checks per project; spec-driven family templates also run the 9-check template validator)", "", "| Project | Status | Failed checks | Warnings |", "| --- | --- | --- | --- |");
const familyRows: string[] = [];
for (const t of GARAGE_TEMPLATES) {
  const r = runReadiness(t, { simSeconds: 2 });
  const all = [...r.checks, ...(r.template ?? [])];
  L.push(`| ${t.metadata.id} ${t.metadata.name} | **${r.status}** | ${all.filter((c) => !c.ok).map((c) => c.name).join("; ") || "—"} | ${all.filter((c) => c.warning).map((c) => `${c.name}${c.documented ? " (documented)" : ""}: ${c.detail}`).join("; ").replace(/\|/g, "/") || "—"} |`);
  if (t.metadata.family)
    familyRows.push(`| ${t.metadata.family} | ${t.metadata.id} | ${t.metadata.options?.controller} | ${t.metadata.options?.driver} | ${t.metadata.options?.motors} | ${t.metadata.options?.sensors} | ${t.metadata.options?.control} | ${t.firmware.runsInSimulator === false ? "generated + statically checked (Wi-Fi not simulated; arena: Manual mode)" : "generated, runs in the simulator"} | ${(r.template ?? []).filter((c) => c.ok).length}/${(r.template ?? []).length} |`);
}
L.push("", "## Template families (spec-driven: one configuration → parts, wiring, pin map, firmware)", "", "| Family | Variant | Controller | Driver | Motors | Sensors | Control | Firmware | Template checks |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |", ...familyRows);
L.push("", "Not offered:", ...UNSUPPORTED_VARIANTS.map((u) => `- ${u.id}: ${u.reason}`));

const results = [...allScenarios(), ...familyScenarios()].map(runScenario);
const req = results.filter((r) => r.mustPass);
L.push("", "## Summary", "");
L.push(`- Required scenarios: **${req.filter((r) => r.pass).length} / ${req.length} passed**`);
L.push(`- Observed-behaviour scenarios (recorded, not required): ${results.length - req.length}, of which ${results.filter((r) => !r.mustPass && r.pass).length} succeeded`);
for (const cat of ["line", "race", "sumo"] as const) {
  L.push("", `## ${cat === "line" ? "Line following" : cat === "race" ? "Robo Race" : "Robo War / Sumo"}`, "");
  L.push("| Test | Project | Configuration | Expected | Actual | Result |", "| --- | --- | --- | --- | --- | --- |");
  for (const r of results.filter((x) => x.category === cat)) {
    const res = r.pass ? "✅ PASS" : r.mustPass ? "❌ FAIL" : "ℹ️ OBSERVED";
    L.push(`| ${r.name} | ${r.project} | ${r.config} | ${r.expected} | ${r.actual.replace(/\|/g, "/")} | ${res} |`);
  }
  const lims = [...new Set(results.filter((x) => x.category === cat && x.limitation).map((x) => x.limitation!))];
  if (lims.length) {
    L.push("", "Known limitations:");
    lims.forEach((l) => L.push(`- ${l}`));
  }
}
L.push("", `Total runtime ${((Date.now() - started) / 1000).toFixed(0)} s.`);
writeFileSync(path.resolve(__dirname, "../GARAGE_TEST_REPORT.md"), L.join("\n") + "\n");
console.log(`Required ${req.filter((r) => r.pass).length}/${req.length}; observed ${results.length - req.length}`);
if (req.some((r) => !r.pass)) process.exit(1);
