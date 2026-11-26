import type { ComponentRecord } from "@/lib/types";
import { MASTER_LIST_MD, MASTER_LIST_SHA256 } from "@/data/master-list.generated";
import { buildCatalogue } from "./build";
import { parseMasterList } from "./parse";
import { buildPlatformAdditions } from "./platform";

export const MASTER_LIST = parseMasterList(MASTER_LIST_MD);
export { MASTER_LIST_MD, MASTER_LIST_SHA256 };

/** Base catalogue built from the bundled master list + curated specs (exactly one record per master-list entry). */
export const CATALOGUE: ComponentRecord[] = buildCatalogue(MASTER_LIST);
/**
 * Components the platform adds on top of the master list (see ./platform.ts). They are part of the
 * library and the designer, but are counted separately: "552 master-list entries + N platform additions".
 */
export const PLATFORM_COMPONENTS: ComponentRecord[] = buildPlatformAdditions(MASTER_LIST);
const byId = new Map([...CATALOGUE, ...PLATFORM_COMPONENTS].map((r) => [r.id, r]));

/** Admin overrides (images, verified specs, new pinouts) are layered on top at runtime. */
let overrides: Record<string, Partial<ComponentRecord>> = {};
let extra: ComponentRecord[] = [];
export function setCatalogueOverrides(o: Record<string, Partial<ComponentRecord>>, added: ComponentRecord[] = []) {
  overrides = o;
  extra = added;
}

/** Student-defined components (see ./custom.ts), registered when a project that uses them is opened. */
const custom = new Map<string, ComponentRecord>();
export function registerCustomRecords(recs: ComponentRecord[]) {
  for (const r of recs) custom.set(r.id, r);
}
export function customRecords(): ComponentRecord[] {
  return [...custom.values()];
}

export function getComponent(id: string): ComponentRecord | undefined {
  const base = byId.get(id) ?? extra.find((r) => r.id === id) ?? custom.get(id);
  if (!base) return undefined;
  const o = overrides[id];
  return o ? { ...base, ...o } : base;
}

export function allComponents(): ComponentRecord[] {
  return [...CATALOGUE, ...PLATFORM_COMPONENTS, ...extra].map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r));
}

export function findByName(name: string): ComponentRecord | undefined {
  return CATALOGUE.find((r) => r.name === name) ?? PLATFORM_COMPONENTS.find((r) => r.name === name);
}
