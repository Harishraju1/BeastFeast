/**
 * Builds the component database from the parsed master list + curated spec patches.
 * One record per numbered source entry — nothing is merged or dropped. Entries whose names
 * appear in more than one section are cross-linked via `crossListedWith`.
 */
import type { CompetitionId, CompetitionNeed, ComponentKind, ComponentRecord, FunctionalityClass, PinDef, SimStatus } from "@/lib/types";
import { type ParsedEntry, type ParsedMasterList, normaliseName, slugify } from "./parse";
import { CONTROLLER_SPECS } from "./specs/controllers";
import { DRIVER_SPECS, MOTOR_DEFAULTS, MOTOR_SPECS } from "./specs/drivers-motors";
import { SENSOR_SPECS } from "./specs/sensors";
import { COMMS_SPECS, POWER_SPECS, RC_SPECS } from "./specs/power-comms";
import { CHASSIS_SPECS, MECH_SPECS, PASSIVE_SPECS } from "./specs/passives-mech";
import { EXTRA_SPECS } from "./specs/extra";
import { type SpecPatch, gnd, inp, pin, vin } from "./specs/dsl";

const ALL_PATCHES: Record<string, SpecPatch>[] = [CONTROLLER_SPECS, DRIVER_SPECS, MOTOR_SPECS, SENSOR_SPECS, POWER_SPECS, COMMS_SPECS, RC_SPECS, PASSIVE_SPECS, MECH_SPECS, CHASSIS_SPECS, EXTRA_SPECS];

/** Same physical part listed in two sections where the per-section spec may differ (e.g. "16×2 LCD Display" vs "16×2 LCD"). */
function patchFor(name: string, section: number): SpecPatch | undefined {
  // Section-specific overrides first
  if (section === 16 && (name === "LiPo Balance Charger" || name === "LiPo Battery Checker")) return undefined;
  for (const table of ALL_PATCHES) if (table[name]) return table[name];
  return undefined;
}

const HANDHELD = /RC Transmitter|Gamepad|Game Controller|Wireless Controller|Handheld Controller|Steering Wheel Controller|Control Panel/;
const CHARGER_OR_TOOL = /Charger$|Battery Checker/;
const CONNECTOR = /Connector|XT30|XT60|JST/;

export function classify(e: ParsedEntry): { kind: ComponentKind; fclass: FunctionalityClass } {
  const n = e.name;
  const sub = (e.subcategory ?? "").toLowerCase();
  switch (e.sectionNumber) {
    case 1: return { kind: "controller", fclass: "A" };
    case 2: return { kind: sub.startsWith("stepper") ? "stepper-driver" : sub.startsWith("brushless") ? "esc" : "motor-driver", fclass: "A" };
    case 3: return { kind: sub.startsWith("servo") ? "servo" : sub.startsWith("stepper") ? "stepper-motor" : "dc-motor", fclass: "A" };
    case 4: return { kind: "sensor", fclass: "A" };
    case 5:
      if (sub.includes("accessor")) {
        if (CHARGER_OR_TOOL.test(n)) return { kind: "tool", fclass: "C" };
        if (CONNECTOR.test(n)) return { kind: "connector", fclass: "A" };
        if (/Holder|Strap/.test(n)) return { kind: "battery-accessory", fclass: "B" };
        return { kind: "battery-accessory", fclass: "A" };
      }
      return { kind: "battery", fclass: "A" };
    case 6: return { kind: "regulator", fclass: "A" };
    case 7:
      if (/Caster|Ball Transfer/.test(n)) return { kind: "caster", fclass: "B" };
      if (/Hubs$/.test(n)) return { kind: "mechanical", fclass: "B" };
      return { kind: "wheel", fclass: "B" };
    case 8: return { kind: sub.startsWith("chassis") ? "chassis" : "mechanical", fclass: "B" };
    case 9: return { kind: "wireless", fclass: "A" };
    case 10: return { kind: "rc-input", fclass: "A" };
    case 11: {
      if (sub.startsWith("resistor")) return { kind: "resistor", fclass: "A" };
      if (sub.startsWith("capacitor")) return { kind: "capacitor", fclass: "A" };
      if (sub.startsWith("diode")) return { kind: n === "LED Diode" ? "led" : "diode", fclass: "A" };
      if (sub.startsWith("transistor")) return { kind: "transistor", fclass: "A" };
      if (sub.startsWith("mosfet")) return { kind: "mosfet", fclass: "A" };
      if (sub.startsWith("switch")) return { kind: "switch", fclass: "A" };
      return { kind: /LCD|OLED|Segment/.test(n) ? "display" : "led", fclass: "A" };
    }
    case 12: return { kind: "connector", fclass: "A" };
    case 13: return { kind: "pcb", fclass: "B" };
    case 14: return { kind: "display", fclass: "A" };
    case 15: return { kind: /Screw|Nut|Washer|Insert/.test(n) ? "fastener" : "material", fclass: "B" };
    case 16: return { kind: "tool", fclass: "C" };
    default: return { kind: "mechanical", fclass: "B" };
  }
}

/** Function-standard pinouts for parts that have no curated pinout (never invents module-specific layouts). */
function genericPins(kind: ComponentKind, name: string): { pins: PinDef[]; status: ComponentRecord["pinoutStatus"] } | null {
  switch (kind) {
    case "dc-motor":
      if (/Brushless/.test(name)) return { pins: [pin("A", "motor-term", "L"), pin("B", "motor-term", "L"), pin("C", "motor-term", "L")], status: "generic-convention" };
      return { pins: MOTOR_DEFAULTS.term(), status: "generic-convention" };
    case "servo": {
      const hi = /MG995|MG996R|DS32/.test(name);
      return { pins: [inp("SIG", "pwm", { label: "Signal (orange/yellow)", note: "50 Hz pulse, 1000–2000 µs" }), vin("V+", hi ? [4.8, 7.2] : [4.8, 6], "L", { label: "V+ (red)" }), gnd("GND", "L", "GND (brown/black)")], status: "generic-convention" };
    }
    case "stepper-motor":
      return { pins: [pin("A+", "motor-term", "L"), pin("A-", "motor-term", "L"), pin("B+", "motor-term", "R"), pin("B-", "motor-term", "R")], status: "generic-convention" };
    case "battery":
      return { pins: [pin("+", "bat+", "R"), pin("-", "bat-", "R")], status: "generic-convention" };
    default:
      return null;
  }
}

function competitionNeeds(rec: { kind: ComponentKind; name: string; sensorKind?: string }, table: ParsedMasterList["competitionTable"]): Record<CompetitionId, CompetitionNeed> {
  const row = (cat: string) => table.find((r) => r.category.toLowerCase() === cat.toLowerCase());
  const conv = (v: string): CompetitionNeed => (/✓|✔|yes/i.test(v) ? "required" : /optional/i.test(v) ? "optional" : /rule/i.test(v) ? "rule-dependent" : "not-listed");
  let cat: string | null = null;
  const sk = rec.sensorKind;
  if (rec.kind === "controller") cat = "Microcontroller";
  else if (rec.kind === "dc-motor") cat = "DC Motor";
  else if (rec.kind === "motor-driver") cat = "Motor Driver";
  else if (rec.kind === "battery") cat = "Battery";
  else if (rec.kind === "chassis") cat = "Chassis";
  else if (rec.kind === "wheel") cat = "Wheels";
  else if (rec.kind === "servo") cat = "Servo";
  else if (rec.kind === "regulator" && /Buck|DC-DC|BEC/i.test(rec.name)) cat = "Buck Converter";
  else if (/Emergency/i.test(rec.name)) cat = "Emergency Switch";
  else if (rec.kind === "wireless" && /Bluetooth|BLE|HC-0|HM-10/i.test(rec.name)) cat = "Bluetooth";
  else if ((rec.kind === "rc-input" || rec.kind === "wireless") && /RC |RC$|Receiver|Transmitter|FlySky|SBUS|PPM|Controller|Gamepad|Joystick/i.test(rec.name)) cat = "RC Controller";
  else if (sk?.startsWith("reflectance")) cat = "IR Array";
  else if (sk === "ultrasonic") cat = "Ultrasonic";
  else if (sk === "ir-distance-analog") cat = "Sharp IR";
  else if (sk === "tof") cat = "ToF Sensor";
  else if (sk === "encoder") cat = "Encoder";
  else if (sk === "imu" || /MPU|ICM|LSM6|BNO|L3G|gyro/i.test(rec.name)) cat = "Gyroscope";
  const r = cat ? row(cat) : undefined;
  if (!r) return { race: "not-listed", line: "not-listed", sumo: "not-listed" };
  return { race: conv(r.race), line: conv(r.line), sumo: conv(r.sumo) };
}

function defaultStatus(fclass: FunctionalityClass, hasPins: boolean): SimStatus {
  if (fclass === "C") return "grey";
  if (fclass === "B") return "yellow";
  return hasPins ? "blue" : "grey";
}

const KIND_DESCRIPTION: Partial<Record<ComponentKind, string>> = {
  tool: "Workshop / fabrication equipment. Listed in the Workshop library — not a circuit module.",
  fastener: "Fastener used in mechanical assembly.",
  material: "Fabrication material.",
  pcb: "PCB / prototyping material used to build circuits.",
  connector: "Wiring accessory. In Circuit Studio, wires are drawn with the wire tool; this entry documents the physical part.",
  mechanical: "Mechanical mounting / structural part used in 3D assembly.",
};

export function buildCatalogue(parsed: ParsedMasterList): ComponentRecord[] {
  const usedIds = new Set<string>();
  const byNorm = new Map<string, string[]>();
  const records: ComponentRecord[] = [];

  for (const e of parsed.entries) {
    const { kind, fclass } = classify(e);
    let id = slugify(e.name);
    if (usedIds.has(id)) id = `${id}--s${e.sectionNumber}`;
    if (usedIds.has(id)) id = `${id}-${e.itemNumber}`;
    usedIds.add(id);

    const patch = patchFor(e.name, e.sectionNumber) ?? {};
    const generic = patch.pins ? null : genericPins(kind, e.name);
    const pins = patch.pins ?? generic?.pins ?? [];
    let options = patch.options ?? [];
    if (kind === "dc-motor" && !/Brushless/.test(e.name)) options = [...options, ...MOTOR_DEFAULTS.motorCustomOptions];

    const rec: ComponentRecord = {
      id,
      name: e.name,
      category: e.sectionTitle,
      categoryNumber: e.sectionNumber,
      subcategory: e.subcategory,
      manufacturer: patch.manufacturer ?? null,
      model: patch.model ?? null,
      description: patch.description ?? KIND_DESCRIPTION[kind] ?? `${e.name} (${e.subcategory ?? e.sectionTitle}). Detailed specifications have not been verified yet.`,
      functionalityClass: fclass,
      kind,
      simStatus: patch.simStatus ?? (HANDHELD.test(e.name) ? "yellow" : defaultStatus(fclass, pins.length > 0)),
      verification: patch.verification ?? "unverified",
      sources: [{ sectionNumber: e.sectionNumber, sectionTitle: e.sectionTitle, subcategory: e.subcategory, itemNumber: e.itemNumber, sourceName: e.name, line: e.line }],
      crossListedWith: [],
      image: null,
      model3d: null,
      footprint2d: null,
      pins,
      bridges: patch.bridges ?? [],
      pinoutStatus: patch.pinoutStatus ?? generic?.status ?? (pins.length ? "generic-convention" : "not-available"),
      options,
      specs: patch.specs ?? {},
      mountingPoints: patch.mountingPoints ?? [],
      compatibleWith: patch.compatibleWith ?? [],
      compatibleControllers: patch.compatibleControllers ?? [],
      compatibleDrivers: patch.compatibleDrivers ?? [],
      competitions: { race: "not-listed", line: "not-listed", sumo: "not-listed" },
      datasheetUrl: patch.datasheetUrl ?? null,
      motor: patch.motor,
      driver: patch.driver,
      battery: patch.battery,
      sensor: patch.sensor,
      wheel: patch.wheel,
      chassis: patch.chassis,
      board: patch.board,
      tags: patch.tags ?? [],
    };
    if (HANDHELD.test(e.name)) rec.description += " In the simulator your keyboard / on-screen controller stands in for this handheld controller.";
    rec.competitions = competitionNeeds({ kind, name: e.name, sensorKind: rec.sensor?.kind }, parsed.competitionTable);
    records.push(rec);
    const norm = normaliseName(e.name);
    byNorm.set(norm, [...(byNorm.get(norm) ?? []), id]);
  }

  for (const ids of byNorm.values()) {
    if (ids.length < 2) continue;
    for (const r of records) if (ids.includes(r.id)) r.crossListedWith = ids.filter((x) => x !== r.id);
  }
  deriveCompatibility(records);
  return records;
}

/** Compatibility lists derived from electrical data (not hand-typed). */
function deriveCompatibility(records: ComponentRecord[]) {
  const controllers = records.filter((r) => r.kind === "controller" && r.pins.length);
  const drivers = records.filter((r) => r.kind === "motor-driver" && r.driver);
  for (const r of records) {
    if (r.kind === "dc-motor" && r.motor) {
      r.compatibleDrivers = drivers.filter((d) => d.driver!.peakCurrentA >= r.motor!.stallCurrentA * 0.6 && maxVin(d) >= r.motor!.nominalVoltage).map((d) => d.id);
    }
    if (r.kind === "motor-driver" || r.kind === "sensor" || r.kind === "wireless" || r.kind === "display") {
      const needsPwm = r.pins.some((p) => p.fn === "in-pwm");
      const needsAnalog = r.pins.some((p) => p.fn === "out-analog");
      const needsI2c = r.pins.some((p) => p.fn === "i2c-sda");
      const supply = r.pins.find((p) => p.fn === "vin")?.vRange;
      r.compatibleControllers = controllers
        .filter((c) => {
          const caps = new Set(c.pins.flatMap((p) => p.caps ?? []));
          if (needsPwm && !caps.has("pwm")) return false;
          if (needsAnalog && !caps.has("analog")) return false;
          if (needsI2c && !caps.has("i2c-sda")) return false;
          if (supply) {
            const outs = c.pins.filter((p) => p.fn === "vout" && p.vOut).map((p) => p.vOut!);
            if (!outs.some((v) => v >= supply[0] - 0.05 && v <= supply[1] + 0.05) && supply[0] > 3.6) return false;
          }
          return true;
        })
        .map((c) => c.id);
    }
  }
}

function maxVin(r: ComponentRecord) {
  return Math.max(0, ...r.pins.filter((p) => p.fn === "vin" && p.vRange).map((p) => p.vRange![1]));
}
