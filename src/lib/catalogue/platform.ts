/**
 * Platform additions: components the club added to BEAST FEAST that are NOT in the uploaded master list.
 *
 * They are kept separate from the master-list records so the completeness report stays honest:
 * "552 master-list entries + N platform additions". A platform record has no master-list source
 * (`sources: []`) and carries the tag "platform-addition".
 *
 * Only values that were supplied (or that follow a stated standard convention) are entered. Anything
 * not supplied is shown as "not specified" — never invented.
 */
import type { ComponentRecord, PinDef } from "@/lib/types";
import type { ParsedMasterList } from "./parse";
import { competitionNeeds } from "./build";
import { pin } from "./specs/dsl";

export const PLATFORM_TAG = "platform-addition";
export const NOT_SPECIFIED = "not specified";

/** 11.1 V 2100 mAh 3S LiPo — the club's standard 4WD robot battery. */
export const LIPO_3S_2100_ID = "lipo-3s-2100mah";

const batPins = (): PinDef[] => [
  pin("+", "bat+", "R", { label: "+", note: "Pack positive (red lead)" }),
  pin("-", "bat-", "R", { label: "−", note: "Pack negative (black lead)" }),
];

/** Values for the 11.1 V 2100 mAh 3S LiPo. Energy = 11.1 V × 2.1 Ah = 23.31 Wh. */
export const LIPO_3S_2100 = {
  cells: 3,
  nominalV: 11.1,
  /** standard 3S LiPo convention: 4.2 V per cell when fully charged */
  fullV: 12.6,
  /** standard LiPo convention: 3.0 V per cell minimum (cut-off) */
  cutoffV: 9.0,
  capacity_mAh: 2100,
  capacity_Ah: 2.1,
  energy_Wh: 23.31,
  /** same convention as the catalogue's other LiPo packs (0.02 Ω per cell) — an estimate */
  internalResistance_ohm: 0.06,
} as const;

interface PlatformDef {
  sectionNumber: number;
  subcategory: string;
  record: Omit<ComponentRecord, "category" | "categoryNumber" | "subcategory" | "sources" | "crossListedWith" | "competitions">;
}

const DEFS: PlatformDef[] = [
  {
    sectionNumber: 5,
    subcategory: "Lithium-based batteries",
    record: {
      id: LIPO_3S_2100_ID,
      name: "11.1V 2100mAh LiPo Battery (3S)",
      manufacturer: null,
      model: "3S1P LiPo pack, 2100 mAh",
      description:
        "Three LiPo cells in series (3S): 11.1 V nominal, 12.6 V when fully charged (standard 3S LiPo convention: 4.2 V per cell), 2100 mAh = 2.1 Ah, 23.31 Wh nominal energy (11.1 V × 2.1 Ah). " +
        "The club's standard battery for 4WD robots. Discharge (C) rating, connector type and charging specification were not supplied and are shown as \"not specified\" — check the label on your pack. " +
        "The simulator uses 9.0 V (3.0 V per cell, the standard LiPo minimum) as the empty voltage. Never discharge below that, and always balance-charge.",
      functionalityClass: "A",
      kind: "battery",
      simStatus: "green",
      verification: "generic-convention",
      image: null,
      model3d: null,
      footprint2d: null,
      pins: batPins(),
      bridges: [],
      pinoutStatus: "generic-convention",
      options: [],
      specs: {
        voltage: "11.1 V nominal / 12.6 V full (3S)",
        extra: {
          Chemistry: "LiPo (lithium polymer)",
          "Cell count": "3S (3 cells in series)",
          "Nominal voltage": "11.1 V (3 × 3.7 V)",
          "Fully charged voltage": "12.6 V (3 × 4.2 V — standard 3S LiPo convention)",
          Capacity: "2100 mAh (2.1 Ah)",
          "Nominal energy": "23.31 Wh (11.1 V × 2.1 Ah)",
          "Minimum (cut-off) voltage used by the simulator": "9.0 V (3.0 V per cell — standard LiPo convention)",
          "Internal resistance used by the simulator": "≈0.06 Ω (estimated: 0.02 Ω per cell, same convention as the other LiPo packs)",
          "Max discharge (C) rating": NOT_SPECIFIED,
          "Connector type": NOT_SPECIFIED,
          "Charging specification": NOT_SPECIFIED,
          Dimensions: `${NOT_SPECIFIED} (the 3D model uses a labelled estimate)`,
          Weight: `${NOT_SPECIFIED} (mass is estimated)`,
        },
      },
      mountingPoints: [],
      compatibleWith: [],
      compatibleControllers: [],
      compatibleDrivers: [],
      datasheetUrl: null,
      battery: {
        nominalVoltage: LIPO_3S_2100.nominalV,
        maxVoltage: LIPO_3S_2100.fullV,
        minVoltage: LIPO_3S_2100.cutoffV,
        capacity_mAh: LIPO_3S_2100.capacity_mAh,
        internalResistance_ohm: LIPO_3S_2100.internalResistance_ohm,
        // C rating not supplied: no continuous-current limit is assumed (validation reports it as unknown).
        maxContinuousA: Number.NaN,
        estimated: true,
      },
      tags: [PLATFORM_TAG, "3S", "LiPo", "11.1V", "2100mAh", "4WD standard"],
    },
  },
];

// ───────────── 18650 multi-cell packs (1–5 cells, student-chosen series/parallel arrangement) ─────────────

/** Valid series × parallel arrangements for a pack of n identical cells. */
export function arrangementsFor(n: number): { s: number; p: number }[] {
  const out: { s: number; p: number }[] = [];
  for (let s = n; s >= 1; s--) if (n % s === 0) out.push({ s, p: n / s });
  return out;
}
const WORDS = ["Single", "Double", "Triple", "Four", "Five"];
export const PACK_18650_IDS = [1, 2, 3, 4, 5].map((n) => `18650-battery-${n}-cell`);

function pack18650(n: number): PlatformDef {
  const arr = arrangementsFor(n);
  const label = (a: { s: number; p: number }) => `${a.s}S${a.p}P — ${(3.6 * a.s).toFixed(1)} V nominal, ${a.p}× capacity`;
  return {
    sectionNumber: 5,
    subcategory: "Lithium-based batteries",
    record: {
      id: PACK_18650_IDS[n - 1],
      name: `18650 ${WORDS[n - 1]} Cell Battery`,
      manufacturer: null,
      model: `${n} × 18650 Li-ion cell${n > 1 ? "s" : ""} in a holder / pack`,
      description:
        `${n} cylindrical 18650 Li-ion cell${n > 1 ? "s" : ""}. Choose how they are connected: in SERIES the voltages add, in PARALLEL the capacities and current add. ` +
        "Pack values are calculated from the cell ratings you set (standard Li-ion convention: 3.6–3.7 V nominal, 4.2 V full, 3.0 V cut-off). " +
        (n > 1 ? "A real multi-cell lithium pack must use matched cells and a BMS/protection board — the simulator does not make an unprotected pack safe." : "Use a protected cell or a protection board in a real robot."),
      functionalityClass: "A",
      kind: "battery",
      simStatus: "green",
      verification: "generic-convention",
      image: null,
      model3d: null,
      footprint2d: null,
      pins: batPins(),
      bridges: [],
      pinoutStatus: "generic-convention",
      options: [
        { key: "arrangement", label: "Cell arrangement", type: "select", default: `${n}S1P`, choices: arr.map((a) => ({ value: `${a.s}S${a.p}P`, label: label(a) })), help: "S = cells in series (adds voltage), P = cells in parallel (adds capacity and current)." },
        { key: "cellNominal", label: "Cell nominal voltage", type: "number", default: 3.6, min: 3.2, max: 3.8, step: 0.05, unit: "V", help: "Printed on the cell (3.6 V or 3.7 V for most 18650s)." },
        { key: "cellMax", label: "Cell full-charge voltage", type: "number", default: 4.2, min: 3.6, max: 4.35, step: 0.05, unit: "V" },
        { key: "capacity", label: "Cell capacity", type: "number", default: 2500, min: 500, max: 4000, step: 50, unit: "mAh" },
        { key: "cellMaxA", label: "Cell max continuous discharge", type: "number", default: 10, min: 1, max: 30, step: 0.5, unit: "A", help: "From the cell datasheet (e.g. 10 A for a typical 2500 mAh high-drain cell)." },
        { key: "bms", label: "BMS / protection board fitted", type: "boolean", default: false, help: "Protects against over-charge, over-discharge, over-current and short circuit." },
      ],
      specs: {
        voltage: `Depends on arrangement: ${arr.map((a) => `${a.s}S${a.p}P ${(3.6 * a.s).toFixed(1)} V`).join(", ")} (3.6 V cells)`,
        dimensions: { x: 77, y: Math.max(21, 20 * n), z: 21 },
        weight_g: 47 * n,
        extra: {
          Chemistry: "Li-ion (18650)",
          "Cells": String(n),
          "Nominal voltage": "cell nominal × series cells",
          "Fully charged voltage": "cell full voltage × series cells (4.2 V per cell)",
          Capacity: "cell capacity × parallel cells",
          "Max continuous current": "cell rating × parallel cells",
          Energy: "nominal voltage × capacity (Wh)",
          "Internal resistance used by the simulator": "≈0.05 Ω per cell (estimate) × series ÷ parallel",
        },
      },
      mountingPoints: [],
      compatibleWith: [],
      compatibleControllers: [],
      compatibleDrivers: [],
      datasheetUrl: null,
      battery: { nominalVoltage: 3.6, maxVoltage: 4.2, minVoltage: 3.0, capacity_mAh: 2500, internalResistance_ohm: 0.05, maxContinuousA: 10, cellCount: n, estimated: true },
      tags: [PLATFORM_TAG, "18650", "Li-ion", `${n}-cell`],
    },
  };
}
DEFS.push(...[1, 2, 3, 4, 5].map(pack18650));

/** Builds the platform-addition records, filling the section title and competition needs from the master list. */
export function buildPlatformAdditions(parsed: ParsedMasterList): ComponentRecord[] {
  return DEFS.map((d) => {
    const section = parsed.sections.find((s) => s.number === d.sectionNumber);
    const rec: ComponentRecord = {
      ...d.record,
      category: section?.title ?? `Section ${d.sectionNumber}`,
      categoryNumber: d.sectionNumber,
      subcategory: d.subcategory,
      sources: [],
      crossListedWith: [],
      competitions: { race: "not-listed", line: "not-listed", sumo: "not-listed" },
    };
    rec.competitions = competitionNeeds({ kind: rec.kind, name: rec.name, sensorKind: rec.sensor?.kind }, parsed.competitionTable);
    return rec;
  });
}

export const isPlatformAddition = (r: Pick<ComponentRecord, "sources" | "tags">) => r.sources.length === 0 || r.tags.includes(PLATFORM_TAG);

/** Number of cells in series for a battery record (cell-based parts use the instance option). */
export function seriesCellsOf(comp: Pick<ComponentRecord, "specs" | "name">): number | null {
  const extra = comp.specs.extra?.["Cell count"];
  const m = /(\d+)\s*S\b/.exec(extra ?? "") ?? /\b(\d+)S\b/.exec(comp.name);
  return m ? Number(m[1]) : null;
}
