/**
 * Writes the simulation coverage audit:
 *   src/data/sim-coverage.generated.json  — data for the /library/coverage dashboard
 *   SIM_COVERAGE_REPORT.md                — summary and every failing / limited component
 *
 *   npm run sim:coverage
 */
import fs from "node:fs";
import { coverageTable } from "@/lib/components/coverage";

const rows = coverageTable();
const at = new Date().toISOString();
fs.writeFileSync("src/data/sim-coverage.generated.json", JSON.stringify({ generatedAt: at, rows }, null, 0) + "\n");

const n = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
const L: string[] = [];
L.push("# SIMULATION COVERAGE REPORT", "", `Generated ${at} by \`npm run sim:coverage\` (also checked by \`tests/sim/coverage.test.ts\`).`, "");
L.push("| | Count |", "|---|---:|");
L.push(`| Components in the library | ${rows.length} |`);
L.push(`| Fully supported (working model + functional simulation) | ${n((r) => r.level === "full")} |`);
L.push(`| Partially supported (some behaviour, limits stated) | ${n((r) => r.level === "limited")} |`);
L.push(`| Not yet supported (no functional model) | ${n((r) => r.level === "unsupported")} |`);
L.push(`| Functional self-test passed | ${n((r) => r.selftest === "pass")} |`);
L.push(`| Functional self-test failed | ${n((r) => r.selftest === "fail")} |`);
L.push(`| Fully supported electrical parts without a passing self-test | ${n((r) => r.level === "full" && r.electrical && r.selftest !== "pass")} |`);
L.push(`| 3D model of this exact part / family model / plain block | ${n((r) => r.model3d === "exact")} / ${n((r) => r.model3d === "family")} / ${n((r) => r.model3d === "block")} |`, "");
L.push("Self-test = a minimal real circuit is built and simulated; the part must behave (deliver current, spin, drive, change its output, show text, hold its voltage). Wheels, casters and chassis are covered by the physics tests instead.", "");
const fails = rows.filter((r) => r.selftest === "fail");
L.push("## Failing self-tests", "", fails.length ? fails.map((r) => `- \`${r.id}\` ${r.name}: ${r.selftestDetail}`).join("\n") : "None.", "");
L.push("## Fully supported — self-test results", "", "| Component | Kind | 3D | Self-test |", "|---|---|---|---|");
for (const r of rows.filter((x) => x.level === "full")) L.push(`| ${r.name} | ${r.kind} | ${r.model3d} | ${r.selftest === "pass" ? "✓ " : r.selftest === "fail" ? "✗ " : "— "}${r.selftestDetail.replace(/\|/g, "/")} |`);
L.push("", "## Partially supported and not yet supported", "", "| Component | Level | Limitation | Alternative |", "|---|---|---|---|");
for (const r of rows.filter((x) => x.level !== "full")) L.push(`| ${r.name} | ${r.level === "limited" ? "partial" : "not yet"} | ${(r.limits[0] ?? r.summary).replace(/\|/g, "/")} | ${r.alternative ?? "—"} |`);
fs.writeFileSync("SIM_COVERAGE_REPORT.md", L.join("\n") + "\n");
console.log(`${rows.length} components · full ${n((r) => r.level === "full")} · partial ${n((r) => r.level === "limited")} · not yet ${n((r) => r.level === "unsupported")} · self-test pass ${n((r) => r.selftest === "pass")} fail ${n((r) => r.selftest === "fail")}`);
