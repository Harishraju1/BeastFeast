/** Static, deterministic code explanation built from the compiler's own analysis (no AI guessing). */
import type { CompileResult } from "@/lib/arduino/types";
import type { WiredPin } from "./check";

export interface Explanation {
  title: string;
  body: string;
  line?: number;
}

const CALLS: Record<string, string> = {
  pinMode: "configures the pin's direction once, usually in setup()",
  digitalWrite: "sets the pin HIGH (logic supply voltage) or LOW (0 V)",
  analogWrite: "outputs a PWM signal: the pin switches on/off very fast; the duty cycle (0–255) sets the average power — this is how motor speed is controlled",
  digitalRead: "reads HIGH or LOW from the pin",
  analogRead: "converts the pin voltage to a number (0–1023 on a 10-bit ADC)",
  pulseIn: "waits for a pulse and returns its length in microseconds (HC-SR04: distance cm ≈ µs / 58)",
  attachInterrupt: "runs a function automatically every time the pin changes — ideal for counting encoder pulses",
  "servo.attach": "connects a Servo object to a pin",
  tone: "generates a square-wave tone",
};

export function explainCode(code: string, result: CompileResult | null, wired: WiredPin[]): Explanation[] {
  const out: Explanation[] = [];
  if (!result) return [{ title: "Analysing…", body: "" }];
  const lines = code.split("\n");
  const setupLine = lines.findIndex((l) => /void\s+setup\s*\(/.test(l)) + 1;
  const loopLine = lines.findIndex((l) => /void\s+loop\s*\(/.test(l)) + 1;
  out.push({ title: "Program structure", body: `setup() ${result.hasSetup ? `starts at line ${setupLine} and runs once at power-on` : "is missing"}; loop() ${result.hasLoop ? `starts at line ${loopLine} and then repeats forever` : "is missing"}.` });
  for (const s of result.pinSymbols) {
    const w = wired.filter((x) => x.arduinoPin === s.value);
    out.push({ title: `${s.name} = ${s.value}`, body: w.length ? `In your circuit pin ${s.value} (${w[0].pinLabel}) goes to ${w.map((x) => `${x.module} ${x.modulePin}`).join(", ")}.` : `Nothing in your circuit is wired to pin ${s.value}.`, line: s.line });
  }
  const seen = new Set<string>();
  for (const u of result.pinUsage) {
    const key = `${u.call}:${u.pin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const w = u.pin !== null ? wired.filter((x) => x.arduinoPin === u.pin) : [];
    out.push({ title: `Line ${u.line}: ${u.call}(${u.expression}${u.mode ? `, ${u.mode}` : ""})`, body: `${u.call} ${CALLS[u.call] ?? ""}.${u.pin === null ? " The pin number is computed at run time (e.g. from an array), so it can only be checked during simulation." : w.length ? ` Pin ${u.pin} → ${w.map((x) => `${x.module} ${x.modulePin}`).join(", ")}.` : ` Pin ${u.pin} is not wired to anything.`}`, line: u.line });
  }
  const delays = lines.map((l, i) => ({ l, i })).filter(({ l }) => /\bdelay\s*\(\s*(\d+)/.test(l));
  for (const { l, i } of delays) {
    const ms = Number(/delay\s*\(\s*(\d+)/.exec(l)![1]);
    if (ms >= 200) out.push({ title: `Line ${i + 1}: delay(${ms})`, body: `The robot is blind for ${ms} ms here — it does not read sensors during a delay. ${ms >= 1000 ? "Long delays make line followers and sumo robots react too late." : ""}`, line: i + 1 });
  }
  return out;
}
