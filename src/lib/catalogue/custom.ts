/**
 * Student-defined custom components.
 *
 * A custom component is stored with the project (project.customComponents) and turned into a normal
 * ComponentRecord, so the circuit graph, validator, recommendation engine and simulator treat it like any other
 * part. What it can do in the simulator depends on the chosen simulation model:
 *
 *   generic          — any pins; wiring, supply-voltage range and ground rules are checked (limited simulation)
 *   dc-motor         — M+ / M−, simulated with the student's motor data (voltage, no-load rpm, stall current/torque)
 *   driver-in-in-en  — dual H-bridge with IN1/IN2/ENA + IN3/IN4/ENB (like an L298N), simulated by the H-bridge engine
 *   driver-in-in     — dual H-bridge with PWM on the IN pins (like a DRV8833), simulated by the H-bridge engine
 *
 * Values are the student's own and are labelled as such everywhere; nothing is presented as verified.
 */
import { z } from "zod";
import type { ComponentKind, ComponentRecord, PinDef, PinFunction } from "@/lib/types";
import { DRIVER_WIRING } from "@/lib/robot/drivers";
import { registerCustomRecords } from "./index";

export const CUSTOM_MODELS = {
  generic: "Generic part — wiring, voltage and ground checks only",
  "dc-motor": "DC motor — spins with your motor data",
  "driver-in-in-en": "Dual H-bridge, IN + EN pins (L298N-style)",
  "driver-in-in": "Dual H-bridge, PWM on IN pins (DRV8833-style)",
} as const;
export type CustomModel = keyof typeof CUSTOM_MODELS;

export const CUSTOM_PIN_TYPES: Record<string, { label: string; fn: PinFunction }> = {
  "power-in": { label: "Power input (VCC/VIN)", fn: "vin" },
  ground: { label: "Ground", fn: "gnd" },
  "digital-in": { label: "Digital input", fn: "in-digital" },
  "pwm-in": { label: "PWM input", fn: "in-pwm" },
  "analog-in": { label: "Analog input", fn: "in-analog" },
  "digital-out": { label: "Digital output", fn: "out-digital" },
  "analog-out": { label: "Analog output", fn: "out-analog" },
  passive: { label: "Passive / other", fn: "passive" },
};

export const CUSTOM_CATEGORIES: { kind: ComponentKind; label: string }[] = [
  { kind: "sensor", label: "Sensor" },
  { kind: "motor-driver", label: "Motor driver" },
  { kind: "dc-motor", label: "DC motor" },
  { kind: "regulator", label: "Power module" },
  { kind: "display", label: "Display" },
  { kind: "wireless", label: "Communication module" },
  { kind: "mechanical", label: "Other" },
];

const pinId = z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9_+\-]+$/, "Pin names: letters, digits, _ + − only");
export const CustomPinSchema = z.object({
  id: pinId,
  type: z.enum(Object.keys(CUSTOM_PIN_TYPES) as [string, ...string[]]),
  description: z.string().trim().max(160).default(""),
});
export const CustomComponentSchema = z
  .object({
    id: z.string().regex(/^custom-[a-z0-9-]{3,60}$/),
    name: z.string().trim().min(2).max(60),
    kind: z.enum(CUSTOM_CATEGORIES.map((c) => c.kind) as [ComponentKind, ...ComponentKind[]]),
    model: z.enum(Object.keys(CUSTOM_MODELS) as [CustomModel, ...CustomModel[]]),
    description: z.string().trim().max(400).default(""),
    vMin: z.number().min(0).max(60),
    vMax: z.number().min(0.1).max(60),
    maxCurrentA: z.number().min(0).max(100),
    constraints: z.string().trim().max(400).default(""),
    pins: z.array(CustomPinSchema).min(1).max(40),
    // model-specific data
    motor: z.object({ nominalVoltage: z.number().min(1).max(48), noLoadRpm: z.number().min(1).max(30000), stallCurrentA: z.number().min(0.05).max(100), stallTorqueKgCm: z.number().min(0.01).max(500) }).optional(),
    driver: z.object({ dropV: z.number().min(0).max(5), contCurrentA: z.number().min(0.05).max(100), peakCurrentA: z.number().min(0.05).max(200) }).optional(),
  })
  .refine((d) => d.vMax >= d.vMin, { message: "Maximum voltage must be at least the minimum", path: ["vMax"] })
  .refine((d) => new Set(d.pins.map((p) => p.id.toUpperCase())).size === d.pins.length, { message: "Pin names must be unique", path: ["pins"] })
  .refine((d) => d.model !== "dc-motor" || !!d.motor, { message: "Enter the motor data", path: ["motor"] })
  .refine((d) => !d.model.startsWith("driver") || !!d.driver, { message: "Enter the driver ratings", path: ["driver"] });
export type CustomComponentDef = z.infer<typeof CustomComponentSchema>;

/** Fixed pin sets for the simulated templates. */
export function templatePins(model: CustomModel): CustomComponentDef["pins"] | null {
  const p = (id: string, type: string, description: string) => ({ id, type, description });
  switch (model) {
    case "dc-motor":
      return [p("M+", "passive", "Motor terminal +"), p("M-", "passive", "Motor terminal −")];
    case "driver-in-in-en":
      return [p("VM", "power-in", "Motor supply"), p("GND", "ground", "Ground"), p("VCC", "power-in", "Logic supply (3.3–5 V)"), p("ENA", "pwm-in", "Channel A enable / speed (PWM)"), p("IN1", "digital-in", "Channel A direction"), p("IN2", "digital-in", "Channel A direction"), p("ENB", "pwm-in", "Channel B enable / speed (PWM)"), p("IN3", "digital-in", "Channel B direction"), p("IN4", "digital-in", "Channel B direction"), p("OUT1", "passive", "Motor A output"), p("OUT2", "passive", "Motor A output"), p("OUT3", "passive", "Motor B output"), p("OUT4", "passive", "Motor B output")];
    case "driver-in-in":
      return [p("VM", "power-in", "Motor supply"), p("GND", "ground", "Ground"), p("AIN1", "pwm-in", "Channel A input 1 (PWM)"), p("AIN2", "pwm-in", "Channel A input 2 (PWM)"), p("BIN1", "pwm-in", "Channel B input 1 (PWM)"), p("BIN2", "pwm-in", "Channel B input 2 (PWM)"), p("AOUT1", "passive", "Motor A output"), p("AOUT2", "passive", "Motor A output"), p("BOUT1", "passive", "Motor B output"), p("BOUT2", "passive", "Motor B output")];
    default:
      return null;
  }
}

export function newCustomId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "part";
  return `custom-${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Converts a (validated) definition into a catalogue record. */
export function customToRecord(d: CustomComponentDef): ComponentRecord {
  const model = d.model;
  const kind: ComponentKind = model === "dc-motor" ? "dc-motor" : model.startsWith("driver") ? "motor-driver" : d.kind;
  const pins: PinDef[] = d.pins.map((p, i) => {
    let fn = CUSTOM_PIN_TYPES[p.type]?.fn ?? "passive";
    if (model === "dc-motor") fn = "motor-term";
    if (model.startsWith("driver") && /OUT/.test(p.id)) fn = "motor-out";
    const def: PinDef = { id: p.id, label: p.id, fn, side: fn === "vin" || fn === "gnd" || fn.startsWith("in-") || i % 2 === 0 ? "L" : "R", note: p.description || undefined };
    if (fn === "vin") def.vRange = p.id === "VCC" && model.startsWith("driver") ? [3, 5.5] : [d.vMin, d.vMax];
    return def;
  });
  const rec: ComponentRecord = {
    id: d.id,
    name: d.name,
    category: "Custom components",
    categoryNumber: 99,
    subcategory: "Student-defined",
    manufacturer: null,
    model: "Custom (student-defined)",
    description: `${d.description || "Custom component."} Values were entered by the student and are not verified.${d.constraints ? ` Constraints: ${d.constraints}` : ""}`,
    functionalityClass: "A",
    kind,
    simStatus: model === "generic" ? "blue" : "green",
    verification: "unverified",
    sources: [],
    crossListedWith: [],
    image: null,
    model3d: null,
    footprint2d: null,
    pins,
    bridges: [],
    pinoutStatus: "generic-convention",
    options: [],
    specs: { voltage: `${d.vMin}–${d.vMax} V`, current: `${d.maxCurrentA} A max`, extra: { Source: "Entered by the student (not verified)" } },
    mountingPoints: [],
    compatibleWith: [],
    compatibleControllers: [],
    compatibleDrivers: [],
    competitions: { race: "optional", line: "optional", sumo: "optional" },
    datasheetUrl: null,
    tags: ["custom"],
  };
  if (model === "dc-motor" && d.motor)
    rec.motor = { nominalVoltage: d.motor.nominalVoltage, noLoadRpm: d.motor.noLoadRpm, stallCurrentA: d.motor.stallCurrentA, stallTorqueNm: d.motor.stallTorqueKgCm * 0.0980665, noLoadCurrentA: d.motor.stallCurrentA * 0.08, estimated: false, source: "student-entered" };
  if (model.startsWith("driver") && d.driver) rec.driver = { channels: 2, dropV: d.driver.dropV, contCurrentA: d.driver.contCurrentA, peakCurrentA: d.driver.peakCurrentA, scheme: model === "driver-in-in-en" ? "in-in-en" : "in-in", estimated: false };
  return rec;
}

/** Registers a project's custom components (idempotent; also wires up H-bridge channels for custom drivers). */
export function registerCustomComponents(defs: unknown[] | undefined) {
  if (!defs?.length) return;
  const recs: ComponentRecord[] = [];
  for (const raw of defs) {
    const parsed = CustomComponentSchema.safeParse(raw);
    if (!parsed.success) continue;
    const d = parsed.data;
    recs.push(customToRecord(d));
    if (d.model === "driver-in-in-en")
      DRIVER_WIRING[d.id] = { scheme: "in-in-en", motorSupply: "VM", logicSupply: "VCC", channels: [{ name: "A", outs: ["OUT1", "OUT2"], inA: "IN1", inB: "IN2", en: "ENA", speedPins: ["ENA"] }, { name: "B", outs: ["OUT3", "OUT4"], inA: "IN3", inB: "IN4", en: "ENB", speedPins: ["ENB"] }] };
    if (d.model === "driver-in-in")
      DRIVER_WIRING[d.id] = { scheme: "in-in", motorSupply: "VM", channels: [{ name: "A", outs: ["AOUT1", "AOUT2"], inA: "AIN1", inB: "AIN2", speedPins: ["AIN1", "AIN2"] }, { name: "B", outs: ["BOUT1", "BOUT2"], inA: "BIN1", inB: "BIN2", speedPins: ["BIN1", "BIN2"] }] };
  }
  registerCustomRecords(recs);
}
