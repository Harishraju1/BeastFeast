/**
 * Changing one part option can imply others. Today: picking a cell chemistry sets the matching cell voltages, so
 * the inspector shows exactly the values the simulator uses (the student can still edit them afterwards).
 */
import type { ComponentRecord } from "@/lib/types";

const CHEMISTRY: Record<string, { cellNominal: number; cellMax: number; cellMin: number }> = {
  "li-ion": { cellNominal: 3.6, cellMax: 4.2, cellMin: 3.0 },
  lifepo4: { cellNominal: 3.2, cellMax: 3.65, cellMin: 2.5 },
};

export function withOption(comp: ComponentRecord, config: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  const next = { ...config, [key]: value };
  if (key === "chemistry" && comp.battery?.cellCount && typeof value === "string" && CHEMISTRY[value]) Object.assign(next, CHEMISTRY[value]);
  return next;
}
