"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { LibraryBrowser } from "@/components/library/LibraryBrowser";

// the audit table (≈560 rows) is only loaded when its tab is opened
const SimCoverage = dynamic(() => import("@/components/library/SimCoverage"), { ssr: false });
import { Badge, PageHeader, Panel, Tabs } from "@/components/ui";
import { MASTER_LIST, MASTER_LIST_SHA256, allComponents } from "@/lib/catalogue";
import { compareCatalogue } from "@/lib/catalogue/report";
import { parseMasterList } from "@/lib/catalogue/parse";

function Completeness() {
  const [uploaded, setUploaded] = useState<{ name: string; text: string } | null>(null);
  const parsed = useMemo(() => (uploaded ? parseMasterList(uploaded.text) : MASTER_LIST), [uploaded]);
  const rep = useMemo(() => compareCatalogue(parsed, allComponents()), [parsed]);
  const rows: [string, string | number, ("ok" | "bad" | "dim")?][] = [
    ["Total source entries", rep.totalSource],
    ["Imported entries", rep.imported],
    ["Platform additions (not in the master list)", rep.platformAdditions.length ? `${rep.platformAdditions.length} — ${rep.platformAdditions.map((p) => p.name).join(", ")}` : 0, "dim"],
    ["Missing entries", rep.missing.length, rep.missing.length ? "bad" : "ok"],
    ["Duplicate database IDs", rep.duplicateIds.length, rep.duplicateIds.length ? "bad" : "ok"],
    ["Source entries imported twice", rep.duplicateSourceRefs.length, rep.duplicateSourceRefs.length ? "bad" : "ok"],
    ["Names cross-listed in two sections", `${rep.crossListed.length} groups (kept as separate linked records)`],
    ["Entries with verified images", rep.withImages, "dim"],
    ["Pinouts from datasheets", rep.verifiedPinouts],
    ["Function-standard pinouts", rep.genericPinouts],
    ["No pinout yet", rep.noPinout, "dim"],
    ["Entries with accurate 3D models", `${rep.with3dModels} (procedural representations otherwise)`, "dim"],
    ["Entries with simulation models (GREEN)", rep.bySimStatus.green],
    ["Entries with unverified specifications", rep.unverifiedSpecs, "dim"],
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
      <Panel title="Catalogue completeness validation" actions={<Badge tone={rep.complete ? "ok" : "bad"}>{rep.complete ? "COMPLETE" : "INCOMPLETE"}</Badge>}>
        <p className="mb-3 text-xs text-muted">
          Compares the master list ({uploaded ? `uploaded: ${uploaded.name}` : `bundled copy, sha256 ${MASTER_LIST_SHA256.slice(0, 12)}…`}) against the application database, entry by entry (section, number and exact name).
        </p>
        <label className="mb-3 block text-xs">
          <span className="bf-label">Compare a newly uploaded master list (.md)</span>
          <input
            type="file"
            accept=".md,text/markdown,text/plain"
            className="mt-1 block text-xs"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setUploaded({ name: file.name, text: await file.text() });
            }}
          />
        </label>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([k, v, tone]) => (
              <tr key={k} className="border-t border-line">
                <td className="py-1.5 text-muted">{k}</td>
                <td className={`py-1.5 text-right font-mono ${tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : tone === "dim" ? "text-dim" : ""}`}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rep.missing.length > 0 && (
          <div className="mt-3 rounded border border-bad/40 p-2 text-xs text-bad">
            Missing: {rep.missing.map((m) => `§${m.section}.${m.item} ${m.name}`).join("; ")}
          </div>
        )}
      </Panel>
      <Panel title="Per section · simulation coverage">
        <table className="w-full text-xs">
          <thead>
            <tr className="bf-label text-left">
              <th>Section</th>
              <th className="text-right">Source</th>
              <th className="text-right">Imported</th>
            </tr>
          </thead>
          <tbody>
            {rep.bySection.map((s) => (
              <tr key={s.number} className="border-t border-line">
                <td className="py-1">
                  {s.number}. {s.title}
                </td>
                <td className="text-right font-mono">{s.source}</td>
                <td className={`text-right font-mono ${s.source === s.imported ? "text-ok" : "text-bad"}`}>{s.imported}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          {(["green", "blue", "yellow", "grey"] as const).map((s) => (
            <div key={s} className="rounded border border-line p-2">
              <div className="bf-label">{s}</div>
              <div className="font-display text-xl">{rep.bySimStatus[s]}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-dim">Section 17 is the competition table; it is applied as compatibility data to every record rather than imported as components.</p>
      </Panel>
    </div>
  );
}

function Inner() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"browse" | "workshop" | "report" | "coverage">(sp.get("tab") === "report" ? "report" : sp.get("tab") === "coverage" ? "coverage" : "browse");
  return (
    <div className="mx-auto max-w-[1600px] px-5 py-8">
      <PageHeader kicker="COMPLETE ROBOTICS COMPONENTS MASTER LIST" title="Component Library" actions={<Tabs value={tab} onChange={setTab} items={[{ value: "browse", label: "Browse" }, { value: "workshop", label: "Workshop equipment" }, { value: "report", label: "Completeness report" }, { value: "coverage", label: "Simulation coverage" }]} />}>
        Every numbered entry from the club&apos;s master list, with honest simulation status. GREEN parts are used by the simulator, BLUE parts support design and wiring, YELLOW are visual/mechanical, GREY are pending verification.
      </PageHeader>
      {tab === "browse" && <LibraryBrowser initialId={sp.get("c")} />}
      {tab === "workshop" && <WorkshopList />}
      {tab === "report" && <Completeness />}
      {tab === "coverage" && <SimCoverage />}
    </div>
  );
}

function WorkshopList() {
  const tools = allComponents().filter((c) => c.functionalityClass === "C");
  return (
    <Panel title={`Workshop & fabrication equipment (${tools.length})`}>
      <p className="mb-3 text-sm text-muted">Class C items are tools for building real robots. They are documented here for learning and kit planning and are never placed into circuits.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {tools.map((t) => (
          <div key={t.id} className="rounded border border-line bg-bg2 p-3">
            <div className="text-sm font-medium">{t.name}</div>
            <div className="text-[11px] text-dim">{t.category}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function LibraryPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
