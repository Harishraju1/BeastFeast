/**
 * Component support registry — one honest answer to "what does the simulator do with this part?".
 *
 * Every catalogue record maps to exactly one of three levels (there is no open-ended "pending" state):
 *   full        — Fully simulated: its electrical behaviour drives the simulation (H-bridges, motors, batteries,
 *                 sensors, controllers running code, LEDs/resistors through the DC solver, switches).
 *   limited     — Supported with limited simulation: wiring, power and pin rules are checked and some
 *                 behaviour is shown, but part of its function is not modelled (said explicitly).
 *   unsupported — Not yet supported: no verified pinout / model yet. A simulated alternative is suggested.
 *
 * Derived from the catalogue record itself (kind, simStatus, simulation parameters, pins) — never from a
 * hand-kept list of ids — so new parts are classified automatically.
 */
import { allComponents } from "@/lib/catalogue";
import type { ComponentRecord } from "@/lib/types";

export type SupportLevel = "full" | "limited" | "unsupported";

export interface SupportInfo {
  level: SupportLevel;
  /** short badge text */
  label: string;
  /** one-sentence explanation shown to students */
  summary: string;
  /** what the simulation engine does with it */
  model: string;
  /** what is NOT modelled (empty for full support) */
  limits: string[];
  /** a fully simulated part that can be used instead (for limited / unsupported) */
  alternative: { id: string; name: string } | null;
}

export const SUPPORT_LABEL: Record<SupportLevel, string> = { full: "FULLY SIMULATED", limited: "LIMITED SIMULATION", unsupported: "NOT YET SUPPORTED" };

const MECHANICAL = new Set(["wheel", "caster", "chassis", "mechanical", "fastener", "material", "pcb", "tool", "connector"]);

/** Functional models per kind (what the engine does when the part is fully simulated). */
const MODEL: Partial<Record<ComponentRecord["kind"], string>> = {
  controller: "Runs your Arduino code (BEAST interpreter, or the AVR emulator for Uno/Nano .hex files): digital and PWM outputs, analogRead through the ADC, Serial, interrupts and timing.",
  "motor-driver": "H-bridge model: each channel turns its input levels (IN/EN/PWM) into an output voltage across the motor, minus the driver's voltage drop; enable LOW = outputs off (coast), equal inputs = brake.",
  "dc-motor": "Brushed DC motor model: speed follows the voltage across its terminals, current and torque come from its stall/no-load data, direction follows polarity.",
  battery: "Battery model: voltage from cell count and chemistry, sags with load through internal resistance, capacity drains with current; series adds voltage, parallel adds capacity and current.",
  sensor: "Sensor model: reads the simulated world (line darkness, distance, bumpers, encoders) and puts the matching voltage on its output pin for your code to read.",
  resistor: "Ohm's law in the DC solver: current = voltage ÷ resistance, power = I²R (overload above the ¼ W rating is reported).",
  led: "Diode model in the DC solver: conducts above its forward voltage, brightness follows current (20 mA = full), over 30 mA it is reported as burnt.",
  switch: "Open / closed contact: when closed its pins join the same wire, when open the circuit is broken.",
  regulator: "Output rail is simulated (set voltage, drop-out when the input is too low); efficiency and heat are not.",
};

let cache: Map<string, SupportInfo> | null = null;

function tokens(s: string) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1));
}

/** Most similar fully-simulated part of the same kind (shared name/subcategory words, then closest current rating). */
export function similarSimulated(c: ComponentRecord): { id: string; name: string } | null {
  const pool = allComponents().filter((x) => x.kind === c.kind && x.id !== c.id && x.simStatus === "green" && x.functionalityClass !== "C");
  if (!pool.length) return null;
  const t = tokens(`${c.name} ${c.subcategory ?? ""} ${c.model ?? ""}`);
  const amps = c.driver?.contCurrentA ?? Number(/([\d.]+)\s*A\b/.exec(c.specs.current ?? "")?.[1] ?? NaN);
  const score = (x: ComponentRecord) => {
    let s = 0;
    for (const w of tokens(`${x.name} ${x.subcategory ?? ""}`)) if (t.has(w)) s += 2;
    if (x.board && c.board && x.board === c.board) s += 5;
    if (Number.isFinite(amps) && x.driver) s -= Math.abs(Math.log((x.driver.contCurrentA + 0.1) / (amps + 0.1)));
    if (x.id === "arduino-uno-r3" || x.id === "tt-yellow-gear-motor") s += 0.5; // the club kit parts break ties
    return s;
  };
  const best = [...pool].sort((a, b) => score(b) - score(a))[0];
  return { id: best.id, name: best.name };
}

export function supportOf(c: ComponentRecord): SupportInfo {
  cache ??= new Map();
  // keyed on the fields that decide the level, so admin edits (status, pinout, motor data) are picked up
  const key = `${c.id}|${c.simStatus}|${c.pins.length}|${c.motor ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const info = classify(c);
  cache.set(key, info);
  return info;
}

function classify(c: ComponentRecord): SupportInfo {
  const mk = (level: SupportLevel, summary: string, model: string, limits: string[] = [], alternative: SupportInfo["alternative"] = null): SupportInfo => ({ level, label: SUPPORT_LABEL[level], summary, model, limits, alternative });

  if (MECHANICAL.has(c.kind)) {
    const physical = c.kind === "wheel" || c.kind === "caster" || c.kind === "chassis";
    return physical
      ? mk("full", "Used by the 3D designer and the physics engine (size, mass, grip).", "Rigid-body physics: dimensions, mass and friction feed the arena simulation.", ["It has no electrical connections."])
      : mk("limited", "A mechanical or workshop item: it appears in the library and the 3D designer, but it has no electrical behaviour to simulate.", "Shown in the build (bill of materials / 3D) only.", ["Not part of the electrical simulation."]);
  }

  if (!c.pins.length || c.simStatus === "grey")
    return mk(
      "unsupported",
      "This part does not have a verified pinout and simulation model yet, so the simulator cannot use it in a circuit.",
      "Listed in the library with its specifications only.",
      ["No pin definitions yet (an administrator can add them).", "Not simulated."],
      similarSimulated(c),
    );

  // fully modelled kinds
  if (c.kind === "resistor" || (c.kind === "led" && c.pins.some((p) => p.fn === "anode")) || (c.kind === "switch" && c.pins.filter((p) => p.fn === "switch").length >= 2))
    return mk("full", "Fully simulated in the circuit bench.", MODEL[c.kind]!);
  if (c.kind === "regulator") return mk("limited", "Its output voltage is simulated; efficiency, heat and current limit are not.", MODEL.regulator!, ["Efficiency, heat and current limit are not modelled."]);
  if (c.simStatus === "green") {
    if (c.kind === "dc-motor" && !c.motor) return mk("limited", "Wiring is checked, but this motor has no speed/torque data yet.", "Connection rules only.", ["No motor data: enter stall current, no-load speed and voltage as custom parameters to simulate it."], similarSimulated(c));
    return mk("full", "Fully simulated.", MODEL[c.kind] ?? "Its pins and electrical behaviour take part in the simulation.");
  }

  // limited (blue = connections & validation, yellow = visual)
  const limits: string[] = [];
  let model = "Wiring, supply voltage, ground and pin-capability rules are checked by the validator.";
  switch (c.kind) {
    case "dc-motor":
      limits.push("No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor.");
      break;
    case "controller":
      limits.push("Your code is not executed on this board in the simulator yet.");
      break;
    case "motor-driver":
      limits.push("Its outputs are not driven in the simulator, so motors on it will not move.");
      break;
    case "servo":
      model += " The angle your code sets with servo.write() is shown.";
      limits.push("Servo torque, speed and load are not modelled.");
      break;
    case "sensor":
      limits.push("Its readings are not generated from the simulated world.");
      break;
    case "display":
      limits.push("Pixels / characters are not rendered.");
      break;
    case "wireless":
    case "rc-input":
      limits.push("Radio links are not simulated (Bluetooth serial modules on the UART pins are).");
      break;
    case "led":
      limits.push("Addressable / protocol-driven LEDs are not rendered.");
      break;
    default:
      limits.push("Its internal behaviour (switching, amplification, filtering …) is not modelled.");
  }
  if (c.simStatus === "yellow") return mk("limited", "Visual / mechanical representation only.", "Shown in 3D and the bill of materials.", limits, similarSimulated(c));
  return mk("limited", "Wiring and power are checked, but part of its behaviour is not simulated.", model, limits, similarSimulated(c));
}

/** For tests / reports: count of records per level. */
export function supportSummary(): Record<SupportLevel, number> {
  const r: Record<SupportLevel, number> = { full: 0, limited: 0, unsupported: 0 };
  for (const c of allComponents()) r[supportOf(c).level]++;
  return r;
}
