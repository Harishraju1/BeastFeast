/**
 * Capability-aware pin allocation for robot controllers (Arduino Uno-class AVR boards and the ESP32 DevKit V1).
 *
 * Given a list of needs ("a PWM output for the left motor speed", "an analog input for line sensor 3"…) it
 * assigns real header pins from the catalogue pin map so that:
 *  - every pin does exactly one job (no conflicts),
 *  - speed pins are PWM-capable, line sensors that are read with analogRead() sit on ADC pins,
 *    encoders on interrupt-capable pins and serial modules on the hardware UART,
 *  - ESP32: the flash pins (GPIO 6–11) are never offered, input-only GPIO 34–39 are never outputs,
 *    ADC2 pins are not used for analogRead() while Wi-Fi is on, GPIO 0/12 (boot straps) and GPIO 1/3
 *    (USB serial) are avoided, the remaining strapping pins (2, 5, 15) are only used as a last resort,
 *  - Uno: D0/D1 stay free for USB serial unless a serial module needs them.
 */
import { getComponent } from "@/lib/catalogue";
import type { PinDef } from "@/lib/types";

export type PinNeedKind = "pwm" | "digital-out" | "digital-in" | "analog-in" | "interrupt" | "uart-rx" | "uart-tx";

export interface PinNeed {
  /** unique key, e.g. "LEFT.EN" or "LINE.3" */
  id: string;
  kind: PinNeedKind;
}

export interface AllocatedPin {
  id: string;
  kind: PinNeedKind;
  /** controller header pin id (catalogue), e.g. "D5", "A0", "D25", "RX2" */
  pin: string;
  /** number used in code (Arduino pin number; GPIO number on the ESP32) */
  gpio: number;
}

export interface PinAllocation {
  ok: boolean;
  pins: Record<string, AllocatedPin>;
  errors: string[];
}

export interface AllocateOptions {
  /** Wi-Fi in use (ESP32): ADC2 pins cannot be read with analogRead() */
  wifi?: boolean;
  /** header pin ids that must not be used */
  reserved?: string[];
}

type BoardFamily = "avr" | "esp32";

const ESP32_ADC1 = [36, 39, 34, 35, 32, 33];
const ESP32_ADC2_SAFE = [25, 26, 27, 14, 13, 4]; // ADC2 without the strapping pins 0, 2, 12, 15
const ESP32_INPUT_ONLY = [34, 35, 36, 39];
/** output-capable GPIO in order of preference; strapping pins 5, 15, 2 last; 0 and 12 never */
const ESP32_OUTPUTS = [13, 14, 27, 26, 25, 33, 32, 23, 22, 21, 19, 18, 4, 16, 17, 5, 15, 2];
const ESP32_INPUTS = [34, 35, 36, 39, 32, 33, 25, 26, 27, 14, 13, 4, 23, 22, 21, 19, 18, 16, 17, 5, 15, 2];

/** Uno pin ids in order of preference per need. */
const UNO_ORDER: Record<PinNeedKind, string[]> = {
  "uart-rx": ["D0"],
  "uart-tx": ["D1"],
  interrupt: ["D2", "D3"],
  // timer0 (5/6), timer1 (9/10), timer2 (3/11)
  pwm: ["D5", "D6", "D9", "D10", "D3", "D11"],
  "digital-out": ["D2", "D4", "D7", "D8", "D12", "D13", "D3", "D11", "D10", "D9", "D6", "D5", "A5", "A4", "A3", "A2", "A1", "A0"],
  "digital-in": ["A0", "A1", "A2", "A3", "A4", "A5", "D2", "D4", "D7", "D8", "D12", "D13", "D3", "D11", "D10", "D9", "D6", "D5"],
  "analog-in": ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7"],
};

function familyOf(controllerId: string): BoardFamily | null {
  const c = getComponent(controllerId);
  if (!c || c.kind !== "controller" || !c.board) return null;
  if (c.board === "esp32-devkit-v1") return "esp32";
  if (["uno", "nano", "pro-mini", "generic"].includes(c.board)) return "avr";
  return null;
}

const has = (p: PinDef, cap: string) => (p.caps ?? []).includes(cap as never);

/** Can this header pin do this job? (capability check only — no preference) */
export function pinCanDo(controllerId: string, pin: PinDef, kind: PinNeedKind, opts: AllocateOptions = {}): boolean {
  const fam = familyOf(controllerId);
  if (pin.fn !== "gpio" || pin.arduinoPin === undefined) return false;
  const g = pin.arduinoPin;
  if (fam === "esp32") {
    const out = !ESP32_INPUT_ONLY.includes(g);
    switch (kind) {
      case "uart-rx":
        return g === 16;
      case "uart-tx":
        return g === 17;
      case "analog-in":
        return ESP32_ADC1.includes(g) || (!opts.wifi && ESP32_ADC2_SAFE.includes(g));
      case "pwm":
      case "digital-out":
        return out && ESP32_OUTPUTS.includes(g);
      case "digital-in":
      case "interrupt":
        return ESP32_INPUTS.includes(g);
    }
  }
  switch (kind) {
    case "uart-rx":
      return has(pin, "uart-rx");
    case "uart-tx":
      return has(pin, "uart-tx");
    case "interrupt":
      return has(pin, "interrupt");
    case "pwm":
      return has(pin, "pwm");
    case "analog-in":
      return has(pin, "analog");
    case "digital-out":
      return !has(pin, "analog-only") && !has(pin, "input-only") && !has(pin, "uart-rx") && !has(pin, "uart-tx");
    case "digital-in":
      return !has(pin, "analog-only") && !has(pin, "uart-rx") && !has(pin, "uart-tx");
  }
}

/** Header pins able to do `kind`, best first. */
export function pinCandidates(controllerId: string, kind: PinNeedKind, opts: AllocateOptions = {}): PinDef[] {
  const c = getComponent(controllerId);
  const fam = familyOf(controllerId);
  if (!c || !fam) return [];
  const gpioPins = c.pins.filter((p) => p.fn === "gpio" && p.arduinoPin !== undefined && !/^(SDA|SCL)$/.test(p.id));
  const reserved = new Set(opts.reserved ?? []);
  let ordered: PinDef[];
  if (fam === "esp32") {
    const order = kind === "analog-in" ? [...ESP32_ADC1, ...ESP32_ADC2_SAFE] : kind === "digital-in" || kind === "interrupt" ? ESP32_INPUTS : kind === "uart-rx" ? [16] : kind === "uart-tx" ? [17] : ESP32_OUTPUTS;
    ordered = order.map((g) => gpioPins.find((p) => p.arduinoPin === g)).filter((p): p is PinDef => !!p);
  } else {
    ordered = UNO_ORDER[kind].map((id) => gpioPins.find((p) => p.id === id)).filter((p): p is PinDef => !!p);
  }
  return ordered.filter((p) => !reserved.has(p.id) && pinCanDo(controllerId, p, kind, opts));
}

const KIND_RANK: Record<PinNeedKind, number> = { "uart-rx": 0, "uart-tx": 1, interrupt: 2, "analog-in": 3, pwm: 4, "digital-out": 5, "digital-in": 6 };

/**
 * Assigns a pin to every need. Most constrained needs go first (fewest candidates, then by kind), needs of the
 * same kind keep their order — so the channels of a sensor array get consecutive pins, left to right.
 */
export function allocatePins(controllerId: string, needs: PinNeed[], opts: AllocateOptions = {}): PinAllocation {
  const errors: string[] = [];
  const fam = familyOf(controllerId);
  if (!fam) return { ok: false, pins: {}, errors: [`No pin map for controller "${controllerId}" (supported: Arduino Uno / Nano class boards and the ESP32 DevKit V1).`] };
  const ids = new Set<string>();
  for (const n of needs) {
    if (ids.has(n.id)) errors.push(`Duplicate pin need "${n.id}".`);
    ids.add(n.id);
  }
  const cands = new Map(needs.map((n) => [n.id, pinCandidates(controllerId, n.kind, opts)]));
  const order = needs
    .map((n, i) => ({ n, i }))
    .sort((a, b) => cands.get(a.n.id)!.length - cands.get(b.n.id)!.length || KIND_RANK[a.n.kind] - KIND_RANK[b.n.kind] || a.i - b.i);
  // keep same-kind needs in their given order (arrays left → right)
  const used = new Set<string>();
  const pins: Record<string, AllocatedPin> = {};
  const kindOrder = [...new Set(order.map((o) => o.n.kind))];
  for (const k of kindOrder) {
    const list = needs.filter((n) => n.kind === k);
    for (const n of list) {
      const pick = cands.get(n.id)!.find((p) => !used.has(p.id));
      if (!pick) {
        errors.push(`No free ${describe(n.kind)} pin left for ${n.id} on ${getComponent(controllerId)?.name}.`);
        continue;
      }
      used.add(pick.id);
      pins[n.id] = { id: n.id, kind: n.kind, pin: pick.id, gpio: pick.arduinoPin! };
    }
  }
  return { ok: errors.length === 0, pins, errors };
}

export function describe(kind: PinNeedKind): string {
  return { pwm: "PWM-capable output", "digital-out": "digital output", "digital-in": "digital input", "analog-in": "analog (ADC) input", interrupt: "interrupt-capable input", "uart-rx": "hardware serial RX", "uart-tx": "hardware serial TX" }[kind];
}

/** Checks an existing assignment: every pin used once and able to do its job. */
export function checkAllocation(controllerId: string, pins: AllocatedPin[], opts: AllocateOptions = {}): string[] {
  const c = getComponent(controllerId);
  if (!c) return [`Unknown controller ${controllerId}`];
  const out: string[] = [];
  const seen = new Map<string, string>();
  for (const a of pins) {
    const def = c.pins.find((p) => p.id === a.pin);
    if (!def) {
      out.push(`${a.id}: ${a.pin} is not a pin of ${c.name}`);
      continue;
    }
    if (seen.has(a.pin)) out.push(`${a.pin} is used twice (${seen.get(a.pin)} and ${a.id})`);
    seen.set(a.pin, a.id);
    if (!pinCanDo(controllerId, def, a.kind, opts)) out.push(`${a.id}: ${a.pin} is not a ${describe(a.kind)}`);
  }
  return out;
}
