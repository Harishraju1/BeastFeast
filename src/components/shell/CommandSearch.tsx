"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { allComponents } from "@/lib/catalogue";
import { TOPICS } from "@/lib/learning";
import { useApp } from "@/lib/store/app";

export function CommandSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const projects = useApp((s) => s.projects);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => ref.current?.focus(), 10);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/reset local UI state when its source changes
    else setQ("");
  }, [open]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const comps = allComponents()
      .filter((c) => c.name.toLowerCase().includes(s) || (c.model ?? "").toLowerCase().includes(s) || (c.manufacturer ?? "").toLowerCase().includes(s))
      .slice(0, 8)
      .map((c) => ({ kind: "Component", label: c.name, sub: c.category, href: `/library?c=${c.id}` }));
    const topics = TOPICS.filter((t) => t.title.toLowerCase().includes(s)).slice(0, 6).map((t) => ({ kind: "Topic", label: t.title, sub: t.pathId.toUpperCase(), href: `/learn/${t.id}` }));
    const prj = projects.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 5).map((p) => ({ kind: "Project", label: p.name, sub: p.competition.toUpperCase(), href: `/workspace/${p.id}/design` }));
    return [...prj, ...comps, ...topics];
  }, [q, projects]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="bf-panel w-full max-w-xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && results[0]) {
              router.push(results[0].href);
              onClose();
            }
          }}
          placeholder="Search 552 components, 84 topics and your projects…"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-base outline-none"
        />
        <ul className="max-h-[50vh] overflow-auto">
          {results.map((r, i) => (
            <li key={i}>
              <button
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-panel2"
                onClick={() => {
                  router.push(r.href);
                  onClose();
                }}
              >
                <span className="w-20 shrink-0 font-mono text-[10px] uppercase text-orange">{r.kind}</span>
                <span className="flex-1 truncate text-sm">{r.label}</span>
                <span className="text-xs text-dim">{r.sub}</span>
              </button>
            </li>
          ))}
          {q && !results.length && <li className="px-4 py-6 text-center text-sm text-muted">No matches.</li>}
        </ul>
      </div>
    </div>
  );
}
