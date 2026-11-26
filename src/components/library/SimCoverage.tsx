"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, CircleSlash, XCircle } from "lucide-react";
import data from "@/data/sim-coverage.generated.json";
import type { CoverageRow } from "@/lib/components/coverage";
import { Panel, Stat } from "@/components/ui";

const rowsAll = (data as { generatedAt: string; rows: CoverageRow[] }).rows;
const LEVEL = { full: { label: "FULLY SUPPORTED", cls: "text-ok" }, limited: { label: "PARTIALLY SUPPORTED", cls: "text-info" }, unsupported: { label: "NOT YET SUPPORTED", cls: "text-muted" } } as const;

/** Simulation coverage dashboard: what is really simulated, for every component in the library. */
export default function SimCoverage() {
  const [level, setLevel] = useState<"all" | CoverageRow["level"]>("all");
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const kinds = useMemo(() => [...new Set(rowsAll.map((r) => r.kind))].sort(), []);
  const rows = rowsAll.filter((r) => (level === "all" || r.level === level) && (kind === "all" || r.kind === kind) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  const n = (f: (r: CoverageRow) => boolean) => rowsAll.filter(f).length;
  const tick = (v: boolean) => (v ? <CheckCircle2 size={14} className="text-ok" aria-label="yes" /> : <CircleSlash size={14} className="text-dim" aria-label="no" />);
  return (
    <div className="space-y-4" data-testid="sim-coverage">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Fully supported" value={n((r) => r.level === "full")} sub="model + functional simulation" tone="ok" />
        <Stat label="Partially supported" value={n((r) => r.level === "limited")} sub="limits stated per part" />
        <Stat label="Not yet supported" value={n((r) => r.level === "unsupported")} sub="alternative suggested" />
        <Stat label="Self-tests passed" value={n((r) => r.selftest === "pass")} sub={`${n((r) => r.selftest === "fail")} failed`} tone="brand" />
        <Stat label="Exact 3D models" value={n((r) => r.model3d === "exact")} sub={`${n((r) => r.model3d === "family")} family · ${n((r) => r.model3d === "block")} block`} />
      </div>
      <Panel title="Component simulation audit" actions={<span className="font-mono text-[10px] text-dim">generated {new Date((data as { generatedAt: string }).generatedAt).toLocaleString()}</span>}>
        <p className="mb-3 text-xs text-muted">
          “Self-test” builds a small real circuit with the part (battery, Arduino, wires), runs the simulator and checks that the part behaves — delivers current, spins, drives a motor, changes its output, shows text, holds its voltage. A part is never counted as working just because it renders.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <input className="bf-input max-w-xs" placeholder="Search components" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search components" />
          <select className="bf-input max-w-[200px]" value={level} onChange={(e) => setLevel(e.target.value as typeof level)} aria-label="Support level">
            <option value="all">All levels</option>
            <option value="full">Fully supported</option>
            <option value="limited">Partially supported</option>
            <option value="unsupported">Not yet supported</option>
          </select>
          <select className="bf-input max-w-[200px]" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
            <option value="all">All kinds</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <span className="self-center text-xs text-dim">{rows.length} shown</span>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg2 text-left">
              <tr className="border-b border-line">
                <th className="py-1 pr-2">Component</th>
                <th className="pr-2">Level</th>
                <th className="pr-2" title="3D model of this exact part / a family model / plain block">3D</th>
                <th className="pr-2">Electrical</th>
                <th className="pr-2">Functional sim</th>
                <th className="pr-2">Validation</th>
                <th>Self-test / limitation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/50 align-top">
                  <td className="py-1 pr-2"><div className="font-semibold">{r.name}</div><div className="font-mono text-[10px] text-dim">{r.kind}</div></td>
                  <td className={`pr-2 font-mono text-[10px] ${LEVEL[r.level].cls}`}>{LEVEL[r.level].label}</td>
                  <td className="pr-2 text-[10px]" title={r.model3dLabel}>{r.model3d === "exact" ? "exact" : r.model3d === "family" ? "family" : "block"}</td>
                  <td className="pr-2">{tick(r.electrical)}</td>
                  <td className="pr-2">{tick(r.functional)}</td>
                  <td className="pr-2">{tick(r.validation)}</td>
                  <td>
                    <div className="flex items-start gap-1">
                      {r.selftest === "pass" ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-ok" /> : r.selftest === "fail" ? <XCircle size={13} className="mt-0.5 shrink-0 text-bad" /> : <CircleSlash size={13} className="mt-0.5 shrink-0 text-dim" />}
                      <span className={r.selftest === "n/a" ? "text-muted" : ""}>{r.selftestDetail}</span>
                    </div>
                    {r.level !== "full" && r.alternative && <div className="text-[10px] text-dim">Alternative: {r.alternative}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
