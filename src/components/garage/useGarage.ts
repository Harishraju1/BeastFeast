"use client";
import { useEffect, useMemo, useState } from "react";
import { GARAGE_TEMPLATES, buildFromTemplate, type ProjectTemplate, type ReadinessReport } from "@/lib/garage";
import { runReadiness } from "@/lib/garage/readiness";
import type { Project } from "@/lib/types";

/** Built (read-only) preview projects for every template — the exact objects the loader creates. */
export function usePreviewProjects(): Record<string, Project> {
  return useMemo(() => Object.fromEntries(GARAGE_TEMPLATES.map((t) => [t.metadata.id, buildFromTemplate(t, "preview", "original")])), []);
}

const cache: Record<string, ReadinessReport> = {};

/** Runs the automated readiness test in the browser, one project at a time, so the page stays responsive. */
export function useReadiness(templates: ProjectTemplate[] = GARAGE_TEMPLATES): Record<string, ReadinessReport> {
  const [reports, setReports] = useState<Record<string, ReadinessReport>>({ ...cache });
  useEffect(() => {
    let cancelled = false;
    const todo = templates.filter((t) => !cache[t.metadata.id]);
    const next = () => {
      const t = todo.shift();
      if (!t || cancelled) return;
      cache[t.metadata.id] = runReadiness(t, { simSeconds: 1.5 });
      setReports({ ...cache });
      setTimeout(next, 30);
    };
    const id = setTimeout(next, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [templates]);
  return reports;
}

export function invalidateReadiness(id?: string) {
  if (id) delete cache[id];
  else for (const k of Object.keys(cache)) delete cache[k];
}
