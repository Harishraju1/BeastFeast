"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Plus, Search } from "lucide-react";
import { allComponents, MASTER_LIST } from "@/lib/catalogue";
import type { CompetitionId, ComponentRecord, SimStatus } from "@/lib/types";
import { COMPETITIONS } from "@/lib/types";
import { Badge, Button, SimBadge, SIM_STATUS_INFO, Tabs } from "@/components/ui";
import { PinoutDiagram, pinColor, pinFunctionText } from "./PinoutDiagram";
import type { PreviewView } from "./ComponentPreview";

const ComponentPreview = dynamic(() => import("./ComponentPreview"), { ssr: false, loading: () => <div className="h-full animate-pulse bg-bg2" /> });

interface Filters {
  q: string;
  section: number | null;
  sub: string | null;
  status: SimStatus | "all";
  competition: CompetitionId | "all";
  protocol: string;
  voltage: string;
  cls: "all" | "A" | "B" | "C";
}

function matchesVoltage(c: ComponentRecord, v: number) {
  const ranges = c.pins.filter((p) => p.vRange).map((p) => p.vRange!);
  if (ranges.some(([a, b]) => v >= a && v <= b)) return true;
  if (c.battery) return Math.abs(c.battery.nominalVoltage - v) < 0.5 || !!c.battery.perCell;
  return false;
}

export function LibraryBrowser({ onAdd, compact = false, initialId, competition }: { onAdd?: (id: string) => void; compact?: boolean; initialId?: string | null; competition?: CompetitionId }) {
  const all = useMemo(() => allComponents(), []);
  const [f, setF] = useState<Filters>({ q: "", section: null, sub: null, status: "all", competition: "all", protocol: "", voltage: "", cls: "all" });
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [selId, setSelId] = useState<string | null>(initialId ?? null);
  const [view, setView] = useState<PreviewView | "pinout">("pinout");
  const protocols = useMemo(() => [...new Set(all.flatMap((c) => c.specs.protocols ?? []).map((p) => p.split(" ")[0]))].sort(), [all]);

  const list = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const v = Number(f.voltage);
    return all.filter((c) => {
      if (f.section && c.categoryNumber !== f.section) return false;
      if (f.sub && c.subcategory !== f.sub) return false;
      if (f.status !== "all" && c.simStatus !== f.status) return false;
      if (f.cls !== "all" && c.functionalityClass !== f.cls) return false;
      if (f.competition !== "all" && !["required", "optional"].includes(c.competitions[f.competition])) return false;
      if (f.protocol && !(c.specs.protocols ?? []).some((p) => p.startsWith(f.protocol))) return false;
      if (f.voltage && Number.isFinite(v) && !matchesVoltage(c, v)) return false;
      if (q && !`${c.name} ${c.model ?? ""} ${c.manufacturer ?? ""} ${c.category} ${c.subcategory ?? ""} ${c.tags.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, f]);
  const sel = all.find((c) => c.id === selId) ?? null;

  const tree = (
    <div className="space-y-0.5 text-sm">
      <button onClick={() => setF({ ...f, section: null, sub: null })} className={`w-full rounded px-2 py-1 text-left ${!f.section ? "bg-accent/15 text-accent-ink" : "text-muted hover:text-text"}`}>
        All components <span className="float-right font-mono text-[10px]">{all.length}</span>
      </button>
      {MASTER_LIST.sections
        .filter((s) => s.entryCount > 0)
        .map((s) => {
          const subs = [...new Set(all.filter((c) => c.categoryNumber === s.number && c.subcategory).map((c) => c.subcategory!))];
          const active = f.section === s.number;
          return (
            <div key={s.number}>
              <button
                onClick={() => {
                  setF({ ...f, section: s.number, sub: null });
                  setOpen({ ...open, [s.number]: !open[s.number] || !active });
                }}
                className={`flex w-full items-center gap-1 rounded px-2 py-1 text-left ${active && !f.sub ? "bg-accent/15 text-accent-ink" : "text-muted hover:text-text"}`}
              >
                {subs.length ? open[s.number] ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : <span className="w-3" />}
                <span className="flex-1 truncate">
                  {s.number}. {s.title}
                </span>
                <span className="font-mono text-[10px]">{all.filter((c) => c.categoryNumber === s.number).length}</span>
              </button>
              {open[s.number] &&
                subs.map((sub) => (
                  <button key={sub} onClick={() => setF({ ...f, section: s.number, sub })} className={`block w-full truncate rounded py-0.5 pl-7 pr-2 text-left text-xs ${f.sub === sub ? "text-accent-ink" : "text-dim hover:text-text"}`}>
                    {sub}
                  </button>
                ))}
            </div>
          );
        })}
    </div>
  );

  const filters = (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-2.5 text-dim" />
        <input className="bf-input pl-8" placeholder="Model, category, manufacturer…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search components" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className="bf-input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Filters["status"] })} aria-label="Simulation status">
          <option value="all">Any status</option>
          {(Object.keys(SIM_STATUS_INFO) as SimStatus[]).map((s) => (
            <option key={s} value={s}>
              {s.toUpperCase()} — {SIM_STATUS_INFO[s].full}
            </option>
          ))}
        </select>
        <select className="bf-input" value={f.competition} onChange={(e) => setF({ ...f, competition: e.target.value as Filters["competition"] })} aria-label="Competition">
          <option value="all">Any competition</option>
          {(Object.keys(COMPETITIONS) as CompetitionId[]).map((c) => (
            <option key={c} value={c}>
              {COMPETITIONS[c].name}
            </option>
          ))}
        </select>
        <select className="bf-input" value={f.protocol} onChange={(e) => setF({ ...f, protocol: e.target.value })} aria-label="Protocol">
          <option value="">Any protocol</option>
          {protocols.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <input className="bf-input" placeholder="Works at … V" value={f.voltage} onChange={(e) => setF({ ...f, voltage: e.target.value })} aria-label="Voltage" inputMode="decimal" />
        <select className="bf-input col-span-2" value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value as Filters["cls"] })} aria-label="Class">
          <option value="all">All classes</option>
          <option value="A">Class A — electronically simulatable</option>
          <option value="B">Class B — mechanical</option>
          <option value="C">Class C — workshop equipment</option>
        </select>
      </div>
    </div>
  );

  const grid = (
    <div className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"}`}>
      {list.map((c) => (
        <button
          key={c.id}
          onClick={() => setSelId(c.id)}
          draggable={!!onAdd && c.functionalityClass !== "C"}
          onDragStart={(e) => e.dataTransfer.setData("text/component-id", c.id)}
          className={`group flex items-start gap-3 rounded-lg border p-2.5 text-left transition ${selId === c.id ? "border-accent bg-accent/5" : "border-line bg-bg2 hover:border-line2"}`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-panel2 font-mono text-[9px] uppercase text-dim" aria-hidden>
            {c.kind.replace("-", " ").slice(0, 8)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{c.name}</div>
            <div className="truncate text-[11px] text-dim">{c.model ?? c.subcategory ?? c.category}</div>
            <div className="mt-1 flex items-center gap-1.5">
              <SimBadge status={c.simStatus} />
              <span className="font-mono text-[9px] text-dim">CLASS {c.functionalityClass}</span>
              {competition && c.competitions[competition] === "required" && <span className="font-mono text-[9px] text-accent-ink">★ NEEDED</span>}
            </div>
          </div>
          {onAdd && c.functionalityClass !== "C" && (
            <span
              role="button"
              tabIndex={0}
              title="Add to workspace"
              onClick={(e) => {
                e.stopPropagation();
                onAdd(c.id);
              }}
              className="rounded p-1 text-muted opacity-0 hover:bg-accent hover:text-white group-hover:opacity-100"
            >
              <Plus size={16} />
            </span>
          )}
        </button>
      ))}
      {!list.length && <div className="p-6 text-center text-sm text-muted">No components match these filters.</div>}
    </div>
  );

  const inspector = sel && (
    <div className="space-y-4">
      <div>
        <div className="bf-label">
          {sel.categoryNumber}. {sel.category}
          {sel.subcategory ? ` / ${sel.subcategory}` : ""}
        </div>
        <h2 className="font-display text-xl font-bold">{sel.name}</h2>
        <div className="text-xs text-muted">
          {[sel.manufacturer, sel.model].filter(Boolean).join(" · ") || "Manufacturer / model not verified"}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <SimBadge status={sel.simStatus} full />
          <Badge tone={sel.verification === "unverified" ? "warn" : "brand"}>{sel.verification.replace("-", " ")}</Badge>
          <Badge>Class {sel.functionalityClass}</Badge>
        </div>
      </div>
      <p className="text-sm text-muted">{sel.description}</p>
      {onAdd && sel.functionalityClass !== "C" && (
        <Button variant="primary" className="w-full" onClick={() => onAdd(sel.id)}>
          <Plus size={14} /> ADD TO WORKSPACE
        </Button>
      )}
      {sel.functionalityClass === "C" && <div className="rounded border border-line p-2 text-xs text-muted">Workshop equipment — listed for reference and learning; it is not placed on the robot.</div>}
      <Tabs
        value={view}
        onChange={setView}
        items={[
          { value: "pinout", label: "Pinout" },
          { value: "front", label: "Front" },
          { value: "side", label: "Side" },
          { value: "top", label: "Top" },
          { value: "iso", label: "3D" },
        ]}
      />
      <div className="overflow-hidden rounded-lg border border-line bg-bg2">
        {view === "pinout" ? (
          sel.pins.length ? (
            <div className="p-2">
              <PinoutDiagram comp={sel} compact={compact} />
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-muted">No pinout entered yet{sel.functionalityClass === "A" ? " — pending verification by an administrator." : " (mechanical / workshop item)."}</div>
          )
        ) : (
          <div className="h-48">{sel.functionalityClass === "C" ? <div className="flex h-full items-center justify-center text-xs text-muted">No 3D model — workshop equipment.</div> : <ComponentPreview comp={sel} view={view} />}</div>
        )}
        <div className="border-t border-line px-2 py-1 font-mono text-[9px] text-dim">
          {view === "pinout" ? `PINOUT: ${sel.pinoutStatus.replace("-", " ").toUpperCase()}` : `PROCEDURAL REPRESENTATION FROM ${sel.specs.dimensions ? "LISTED" : "ESTIMATED"} DIMENSIONS · NO VERIFIED CAD MODEL`}
          {sel.image ? "" : " · NO VERIFIED PHOTO YET"}
        </div>
      </div>
      <div>
        <div className="bf-label mb-1">Technical specifications</div>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs">
          {(
            [
              ["Voltage", sel.specs.voltage],
              ["Logic level", sel.specs.logicVoltage ? `${sel.specs.logicVoltage} V` : undefined],
              ["Current", sel.specs.current],
              ["Power", sel.specs.power],
              ["Protocols", sel.specs.protocols?.join(", ")],
              ["Dimensions", sel.specs.dimensions ? `${sel.specs.dimensions.x} × ${sel.specs.dimensions.y} × ${sel.specs.dimensions.z} mm` : undefined],
              ["Weight", sel.specs.weight_g ? `${sel.specs.weight_g} g` : undefined],
              ...Object.entries(sel.specs.extra ?? {}),
            ] as [string, string | undefined][]
          ).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-dim">{k}</dt>
              <dd className={v ? "" : "italic text-dim"}>{v ?? "unverified"}</dd>
            </div>
          ))}
        </dl>
        {sel.motor && (
          <div className="mt-2 rounded border border-line p-2 text-[11px] text-muted">
            Simulation parameters{sel.motor.estimated ? " (ESTIMATED — typical values)" : ""}: {sel.motor.nominalVoltage} V, {sel.motor.noLoadRpm} rpm no-load, stall {(sel.motor.stallTorqueNm / 0.0980665).toFixed(2)} kg·cm / {sel.motor.stallCurrentA} A.
            {sel.motor.source ? ` Source: ${sel.motor.source}.` : ""}
          </div>
        )}
        {sel.datasheetUrl && (
          <a href={sel.datasheetUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-brand hover:underline">
            Datasheet / reference <ExternalLink size={11} />
          </a>
        )}
      </div>
      {sel.pins.length > 0 && (
        <div>
          <div className="bf-label mb-1">Pin definitions ({sel.pins.length})</div>
          <div className="max-h-64 overflow-auto rounded border border-line">
            <table className="w-full text-[11px]">
              <tbody>
                {sel.pins.map((p) => (
                  <tr key={p.id} className="border-b border-line/60 last:border-0">
                    <td className="px-2 py-1 font-mono" style={{ color: pinColor(p) }}>
                      {p.label}
                    </td>
                    <td className="px-2 py-1 text-muted">
                      {pinFunctionText(p)}
                      {p.note && <div className="text-dim">{p.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div>
        <div className="bf-label mb-1">Competition compatibility (from master list §17)</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(COMPETITIONS) as CompetitionId[]).map((k) => (
            <Badge key={k} tone={sel.competitions[k] === "required" ? "accent" : sel.competitions[k] === "optional" ? "brand" : "dim"}>
              {COMPETITIONS[k].short}: {sel.competitions[k]}
            </Badge>
          ))}
        </div>
      </div>
      {(sel.compatibleControllers.length > 0 || sel.compatibleDrivers.length > 0) && (
        <div className="text-xs">
          <div className="bf-label mb-1">Compatibility (derived from electrical data)</div>
          {sel.compatibleDrivers.length > 0 && <div className="text-muted">Drivers: {sel.compatibleDrivers.map((id) => all.find((c) => c.id === id)?.name).join(", ")}</div>}
          {sel.compatibleControllers.length > 0 && <div className="text-muted">Controllers: {sel.compatibleControllers.map((id) => all.find((c) => c.id === id)?.name).join(", ")}</div>}
        </div>
      )}
      {sel.crossListedWith.length > 0 && <div className="text-[11px] text-dim">Also listed in another section of the master list: {sel.crossListedWith.join(", ")}</div>}
      <div className="text-[10px] text-dim">
        {sel.sources[0] ? (
          <>Source: master list §{sel.sources[0].sectionNumber} item {sel.sources[0].itemNumber}, line {sel.sources[0].line}</>
        ) : (
          <>Source: platform addition (not in the master list)</>
        )}{" "}
        · ID <span className="font-mono">{sel.id}</span>
      </div>
    </div>
  );

  if (compact)
    return (
      <div className="flex h-full flex-col">
        <div className="space-y-2 border-b border-line p-2">
          {filters}
          <select className="bf-input" value={f.section ?? ""} onChange={(e) => setF({ ...f, section: e.target.value ? Number(e.target.value) : null, sub: null })} aria-label="Category">
            <option value="">All categories</option>
            {MASTER_LIST.sections.filter((s) => s.entryCount).map((s) => (
              <option key={s.number} value={s.number}>
                {s.number}. {s.title}
              </option>
            ))}
          </select>
          <div className="text-[10px] text-dim">{list.length} components · drag onto the canvas or click +</div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">{sel ? <div className="space-y-3"><button className="text-xs text-brand" onClick={() => setSelId(null)}>← back to list</button>{inspector}</div> : grid}</div>
      </div>
    );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_1fr_380px]">
      <aside className="bf-panel h-fit space-y-4 p-3 lg:sticky lg:top-20">
        {filters}
        <div className="max-h-[50vh] overflow-auto">{tree}</div>
      </aside>
      <section>
        <div className="mb-2 text-xs text-muted">{list.length} of {all.length} components</div>
        {grid}
      </section>
      <aside className="bf-panel h-fit p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-100px)] lg:overflow-auto">{inspector ?? <div className="text-sm text-muted">Select a component to inspect its pinout, specifications and compatibility.</div>}</aside>
    </div>
  );
}
