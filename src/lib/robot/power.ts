/**
 * Power summary for the Robot Designer: battery voltage (nominal / full / cut-off), capacity, energy, an
 * ESTIMATED current draw from the configured motors and electronics, and an ESTIMATED runtime.
 *
 * Every current is a labelled estimate. The runtime is only given when there is enough data
 * (a battery with a known capacity and every motor has simulation parameters).
 */
import { getComponent } from "@/lib/catalogue";
import { NOT_SPECIFIED } from "@/lib/catalogue/platform";
import { batteryPack } from "@/lib/circuit/nets";
import type { ComponentRecord, PartInstance, Project } from "@/lib/types";
import { motorParams } from "./model";

/** Fraction of the stall-current range assumed for a motor while driving (between no-load and stall). */
export const DRIVING_LOAD_FRACTION = 0.25;
/** Fraction of the rated capacity treated as usable before the cut-off voltage. */
export const USABLE_CAPACITY = 0.8;

export interface PowerLoad {
  uid: string;
  label: string;
  kind: ComponentRecord["kind"];
  current_A: number;
  basis: string;
}

export interface PowerSummary {
  battery: {
    uid: string;
    label: string;
    name: string;
    chemistry: string | null;
    cells: number;
    nominal_V: number;
    full_V: number;
    cutoff_V: number;
    capacity_mAh: number;
    capacity_Ah: number;
    energy_Wh: number;
    estimated: boolean;
    notSpecified: string[];
  } | null;
  loads: PowerLoad[];
  /** typical total draw while driving (estimate) */
  totalCurrent_A: number;
  /** all motors stalled (worst case) */
  stallCurrent_A: number;
  /** minutes; null = not enough data */
  runtime_min: number | null;
  missing: string[];
}

/** Typical supply current of the electronics (A) — order-of-magnitude datasheet values, shown as estimates. */
function electronicsCurrent(c: ComponentRecord): { a: number; basis: string } | null {
  const n = c.name;
  switch (c.kind) {
    case "controller":
      return /ESP32/.test(n) ? { a: 0.12, basis: "ESP32 board, Wi-Fi off (typical)" } : /ESP8266|NodeMCU/.test(n) ? { a: 0.08, basis: "ESP8266 board (typical)" } : { a: 0.05, basis: "Arduino-class board (typical)" };
    case "motor-driver":
      return c.id === "l298n" ? { a: 0.036, basis: "L298N logic supply (typical)" } : { a: 0.002, basis: "MOSFET driver logic (typical)" };
    case "wireless":
      return /HC-0|HM-10|Bluetooth/i.test(n) ? { a: 0.04, basis: "Bluetooth module, connected (typical)" } : { a: 0.08, basis: "radio module (typical)" };
    case "sensor": {
      const k = c.sensor?.kind ?? "";
      if (k === "ultrasonic") return { a: 0.015, basis: "ultrasonic sensor (HC-SR04 ≈15 mA)" };
      if (k === "ir-distance-analog") return { a: 0.03, basis: "Sharp IR distance sensor (≈30 mA)" };
      if (k.startsWith("reflectance-array")) return { a: 0.02 * (c.sensor?.channels ?? 5), basis: "IR array, ≈20 mA per emitter" };
      if (k.startsWith("reflectance") || k === "ir-obstacle-digital") return { a: 0.02, basis: "IR emitter module (≈20 mA)" };
      if (k === "encoder") return { a: 0.01, basis: "Hall encoder (typical)" };
      return { a: 0.01, basis: "sensor module (typical)" };
    }
    case "display":
      return { a: 0.02, basis: "display module (typical)" };
    case "regulator":
      return { a: 0.005, basis: "regulator quiescent current (typical)" };
    case "servo":
      return { a: 0.15, basis: "servo, moving occasionally (typical)" };
    case "led":
      return { a: 0.01, basis: "indicator LED" };
    default:
      return null;
  }
}

export function powerSummary(project: Project): PowerSummary {
  const parts = project.parts.map((p) => ({ p, c: getComponent(p.componentId) })).filter((x): x is { p: PartInstance; c: ComponentRecord } => !!x.c);
  const missing: string[] = [];
  const bat = parts.find((x) => x.c.battery);
  let battery: PowerSummary["battery"] = null;
  if (bat) {
    const pack = batteryPack(bat.c, bat.p)!;
    const extra = bat.c.specs.extra ?? {};
    const chemistry = extra.Chemistry ?? (/LiPo/.test(bat.c.name) ? "LiPo" : /LiFePO4/.test(bat.c.name) ? "LiFePO4" : /Li-ion|18650|21700|26650/.test(bat.c.name) ? "Li-ion" : /NiMH/.test(bat.c.name) ? "NiMH" : /Alkaline|AA/.test(bat.c.name) ? "Alkaline" : /Lead/.test(bat.c.name) ? "Lead-acid" : null);
    battery = {
      uid: bat.p.uid,
      label: bat.p.label,
      name: bat.c.name,
      chemistry,
      cells: pack.cells,
      nominal_V: round2(pack.nominal),
      full_V: round2(pack.max),
      cutoff_V: round2(pack.min),
      capacity_mAh: pack.capacity,
      capacity_Ah: round3(pack.capacity / 1000),
      energy_Wh: round2((pack.nominal * pack.capacity) / 1000),
      estimated: !!bat.c.battery?.estimated,
      notSpecified: Object.entries(extra).filter(([, v]) => v.startsWith(NOT_SPECIFIED)).map(([k]) => k),
    };
  } else missing.push("No battery placed.");

  const loads: PowerLoad[] = [];
  let stall = 0;
  let motorsWithoutData = 0;
  for (const { p, c } of parts) {
    if (c.kind === "dc-motor") {
      const mp = motorParams(p, c);
      if (!mp) {
        motorsWithoutData++;
        continue;
      }
      // the motor sees roughly the battery voltage through its driver: scale the currents by V / V_rated
      const scale = battery ? Math.min(1.5, battery.nominal_V / mp.nominalVoltage) : 1;
      const noLoad = mp.noLoadCurrentA * scale;
      const st = mp.stallCurrentA * scale;
      stall += st;
      loads.push({ uid: p.uid, label: p.label, kind: c.kind, current_A: round3(noLoad + DRIVING_LOAD_FRACTION * (st - noLoad)), basis: `${c.name}: no-load ${noLoad.toFixed(2)} A + ${Math.round(DRIVING_LOAD_FRACTION * 100)} % of the way to stall (${st.toFixed(1)} A)${mp.estimated ? " — motor data estimated" : ""}` });
      continue;
    }
    if (!p.inCircuit) continue;
    const e = electronicsCurrent(c);
    if (e) loads.push({ uid: p.uid, label: p.label, kind: c.kind, current_A: e.a, basis: e.basis });
  }
  if (motorsWithoutData) missing.push(`${motorsWithoutData} motor(s) have no current data — enable "Use my own motor parameters".`);
  if (!loads.some((l) => l.kind === "dc-motor") && !motorsWithoutData) missing.push("No motors placed.");
  const total = loads.reduce((a, l) => a + l.current_A, 0);
  const enough = !!battery && battery.capacity_mAh > 0 && motorsWithoutData === 0 && loads.some((l) => l.kind === "dc-motor");
  return {
    battery,
    loads,
    totalCurrent_A: round3(total),
    stallCurrent_A: round2(stall),
    runtime_min: enough ? Math.round(((battery!.capacity_Ah * USABLE_CAPACITY) / total) * 60) : null,
    missing,
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
