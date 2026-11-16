import type { ComponentRecord } from "@/lib/types";
import { MASTER_LIST_MD, MASTER_LIST_SHA256 } from "@/data/master-list.generated";
import { buildCatalogue } from "./build";
import { parseMasterList } from "./parse";

export const MASTER_LIST = parseMasterList(MASTER_LIST_MD);
export { MASTER_LIST_MD, MASTER_LIST_SHA256 };

/** Base catalogue built from the bundled master list + curated specs. */
export const CATALOGUE: ComponentRecord[] = buildCatalogue(MASTER_LIST);
const byId = new Map(CATALOGUE.map((r) => [r.id, r]));

/** Admin overrides (images, verified specs, new pinouts) are layered on top at runtime. */
let overrides: Record<string, Partial<ComponentRecord>> = {};
let extra: ComponentRecord[] = [];
export function setCatalogueOverrides(o: Record<string, Partial<ComponentRecord>>, added: ComponentRecord[] = []) {
  overrides = o;
  extra = added;
}

export function getComponent(id: string): ComponentRecord | undefined {
  const base = byId.get(id) ?? extra.find((r) => r.id === id);
  if (!base) return undefined;
  const o = overrides[id];
  return o ? { ...base, ...o } : base;
}

export function allComponents(): ComponentRecord[] {
  return [...CATALOGUE, ...extra].map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r));
}

export function findByName(name: string): ComponentRecord | undefined {
  return CATALOGUE.find((r) => r.name === name);
}
