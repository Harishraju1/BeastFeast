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
import { BOARDS } from "@/lib/arduino/boards";
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
  const hasOhms = c.options.some((o) => o.key === "ohms") || /\d\s*(k|M)?Ω/.test(c.name);
  const simpleSwitch = c.pins.filter((p) => p.fn === "switch").length >= 2 && (c.pins.filter((p) => p.fn === "switch").length === 2 || c.pins.some((p) => p.id === "COM")) && (c.options.some((o) => o.key === "closed") || c.sensor?.kind === "bumper");
  if ((c.kind === "resistor" && hasOhms) || (c.kind === "led" && c.pins.some((p) => p.fn === "anode")) || (c.kind === "switch" && simpleSwitch))
    return mk("full", "Fully simulated in the circuit bench.", c.kind === "resistor" && c.pins.some((p) => p.id === "W") ? "Potentiometer: two resistors split at the wiper position (set in its options), solved with the rest of the circuit." : MODEL[c.kind]!);
  if (c.kind === "switch") return mk("limited", "Its contacts are part of the circuit, but multi-position switching is not modelled.", "Wiring rules only.", ["Multi-position / multi-pole switching (DIP, rotary) is not modelled."], similarSimulated(c));
  if (c.kind === "resistor") return mk("limited", "Its resistance is not defined, so it cannot be solved.", "Wiring rules only.", ["Set a resistance value: use a fixed resistor or a potentiometer instead."], similarSimulated(c));
  if (c.kind === "capacitor" && c.pins.length === 2)
    return mk("full", "Charges and discharges in the circuit bench; polarity and voltage rating are checked.", "RC model: i = C·dv/dt (backward Euler, solved with the rest of the passive network). Reverse polarity on electrolytic/tantalum parts and over-voltage are reported.", ["Leakage, ESR and dielectric effects are not modelled."]);
  if (c.kind === "sensor" && /\bLDR\b|photoresistor/i.test(c.name) && c.pins.length === 2)
    return mk("full", "Its resistance follows the light level you set on the bench.", "R = R₁₀ · (lux / 10)^−0.7 (typical GL55-series curve; R₁₀ is set in its options), solved with the rest of the divider so analogRead() sees the real voltage.", ["Response time (tens of ms) is not modelled."]);
  if (c.kind === "sensor" && /^DHT(11|22)/i.test(c.name))
    return mk("full", "Read with the DHT library: it reports the temperature and humidity you set on the bench.", "DHT library emulation: readTemperature() / readHumidity() return the bench environment (DHT11 in whole units, 0–50 °C / 20–90 %; DHT22 in 0.1 steps). An unwired or unpowered sensor returns NaN, like the real library.", ["The minimum time between readings (1 s DHT11, 2 s DHT22) is not enforced."]);
  if (c.kind === "display" && /LCD/i.test(c.name) && c.pins.length)
    return mk("full", "Shows the text your code prints (LiquidCrystal / LiquidCrystal_I2C).", "Character LCD emulation: init/begin, setCursor, print, clear, backlight — shown on the display that is wired to the pins (or SDA/SCL) your code uses.", ["Custom characters (createChar) and the contrast pin (V0) are not modelled."]);
  if (c.kind === "display" && /OLED/i.test(c.name) && c.pins.length)
    return mk("limited", "Shows text your code draws with Adafruit_SSD1306 (print, text size, cursor, display()).", "SSD1306 text emulation on the wired display (SDA/SCL).", ["Graphics (drawLine, drawRect, bitmaps, fonts) are not rendered — only text."], null);
  if (c.kind === "servo" && c.pins.some((p) => p.fn === "in-pwm") && !/continuous/i.test(c.name))
    return mk("full", "Turns to the angle your code writes, at its rated speed, when its signal is wired and it is powered.", "Servo model: servo.write()/writeMicroseconds() set the target; the horn slews at ≈600 °/s (SG90) or ≈350 °/s (metal gear); current while moving is included in the battery load.", ["Load torque, stalling and continuous-rotation speed control are not modelled."]);
  const setPoint = !c.pins.some((p) => p.id === "ADJ") && (c.options.some((o) => o.key === "vout") || c.pins.some((p) => p.fn === "vout" && p.vOut !== undefined) || c.bridges.length > 0);
  if (c.kind === "regulator" && setPoint && c.pins.some((p) => p.fn === "vout") && c.pins.some((p) => p.fn === "vin"))
    return mk("full", "Output voltage, drop-out, efficiency, current limit and heat are simulated.", "Regulator model: output set point (drops out when the input is too low); buck converters pass power at ≈88 % efficiency, linear regulators pass the same current and turn (Vin − Vout)·I into heat; over-current and over-heat are reported on the bench.", ["Efficiency is a typical value, not a load-dependent curve; ripple is not modelled."]);
  if (c.kind === "regulator") return mk("limited", "Its output is set by external parts (e.g. the LM317's resistor divider), which the simulator does not model.", "Wiring and input-voltage rules only.", ["The output voltage is not simulated."], similarSimulated(c));
  if (c.kind === "controller" && c.board && c.board !== "generic" && Object.prototype.hasOwnProperty.call(BOARDS, c.board))
    return mk("full", "Runs your code with this board's own pin map.", `${MODEL.controller} Board profile: ${c.board} (logic level, PWM and ADC pins, interrupt pins).`, c.board === "uno" || c.board === "nano" ? [] : ["Board-specific extras (Wi-Fi, Bluetooth radio, DAC, touch pins) are not simulated."]);
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
      limits.push(/DS18B20/i.test(c.name) ? "The OneWire / DallasTemperature libraries are not emulated, so it gives no reading. Use a DHT11 or DHT22 for temperature." : "Its readings are not generated from the simulated world.");
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

/** Badge colour that matches the support level (the catalogue's simStatus is only one of its inputs). */
export function supportStatus(c: ComponentRecord): ComponentRecord["simStatus"] {
  const s = supportOf(c);
  if (s.level === "full") return "green";
  if (s.level === "unsupported") return "grey";
  return c.simStatus === "yellow" ? "yellow" : "blue";
}
