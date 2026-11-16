import type { ComponentRecord, GpioCapability, PinDef, PinFunction, PinSide } from "@/lib/types";

/** Partial record merged onto a source-derived catalogue entry. Keyed by the exact master-list name. */
export type SpecPatch = Partial<Omit<ComponentRecord, "id" | "name" | "sources" | "category" | "categoryNumber" | "subcategory" | "crossListedWith">>;

export function pin(id: string, fn: PinFunction, side: PinSide, extra: Partial<PinDef> = {}): PinDef {
  return { id, label: extra.label ?? id, fn, side, ...extra };
}

export const gnd = (id = "GND", side: PinSide = "L", label?: string) => pin(id, "gnd", side, { label: label ?? "GND" });
export const vin = (id: string, range: [number, number], side: PinSide = "L", extra: Partial<PinDef> = {}) =>
  pin(id, "vin", side, { vRange: range, ...extra });
export const vout = (id: string, v: number, side: PinSide = "L", extra: Partial<PinDef> = {}) => pin(id, "vout", side, { vOut: v, ...extra });

/** Controller GPIO helper. */
export function io(
  id: string,
  arduinoPin: number,
  caps: GpioCapability[],
  side: PinSide,
  extra: Partial<PinDef> = {},
): PinDef {
  return pin(id, "gpio", side, { arduinoPin, caps: ["digital", ...caps.filter((c) => c !== "digital")].filter((c, i, a) => a.indexOf(c) === i) as GpioCapability[], ...extra });
}

/** Two-terminal parts. */
export const twoTerminal = (a = "1", b = "2", fn: PinFunction = "passive"): PinDef[] => [pin(a, fn, "L"), pin(b, fn, "R")];

/** Pins for a sensor/module that exposes VCC, GND and a list of outputs. */
export function moduleVccGnd(range: [number, number], outputs: PinDef[], vccId = "VCC"): PinDef[] {
  return [vin(vccId, range, "L"), gnd("GND", "L"), ...outputs];
}

export const out = (id: string, kind: "digital" | "analog" = "digital", extra: Partial<PinDef> = {}) =>
  pin(id, kind === "digital" ? "out-digital" : "out-analog", "R", extra);
export const inp = (id: string, kind: "digital" | "pwm" | "analog" = "digital", extra: Partial<PinDef> = {}) =>
  pin(id, kind === "digital" ? "in-digital" : kind === "pwm" ? "in-pwm" : "in-analog", "L", extra);
