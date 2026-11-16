/**
 * Circuit-aware code validation: compares the pins the student's code uses with the pins
 * actually wired in Circuit Studio.
 */
import type { CompileResult } from "@/lib/arduino/types";
import type { Project, ValidationIssue } from "@/lib/types";
import { type CircuitGraph, buildGraph } from "@/lib/circuit/nets";

export interface WiredPin {
  arduinoPin: number;
  pinLabel: string; // controller pin label e.g. "D5"
  module: string; // part label
  modulePin: string; // e.g. "ENA"
  fn: string; // module pin function
}

export function wiredControllerPins(g: CircuitGraph): WiredPin[] {
  const ctrl = g.parts.find((p) => g.comps.get(p.uid)?.kind === "controller");
  if (!ctrl) return [];
  const comp = g.comps.get(ctrl.uid)!;
  const res: WiredPin[] = [];
  for (const pin of comp.pins) {
    if (pin.fn !== "gpio" || pin.arduinoPin === undefined) continue;
    const net = g.netOf.get(`${ctrl.uid}.${pin.id}`);
    for (const m of net?.members ?? []) {
      if (m.part.uid === ctrl.uid) continue;
      res.push({ arduinoPin: pin.arduinoPin, pinLabel: pin.label, module: m.part.label, modulePin: m.pin.label.split(" ")[0], fn: m.pin.fn });
    }
  }
  // de-duplicate bridged aliases (A4/SDA)
  return res.filter((r, i) => res.findIndex((x) => x.arduinoPin === r.arduinoPin && x.module === r.module && x.modulePin === r.modulePin) === i);
}

const norm = (s: string) => s.toLowerCase().replace(/pin|_|-|\s/g, "");

export function checkCodeAgainstCircuit(project: Project, compiled: CompileResult, studentName = "ENGINEER"): ValidationIssue[] {
  const NAME = studentName.toUpperCase();
  const g = buildGraph(project);
  const wired = wiredControllerPins(g);
  const issues: Omit<ValidationIssue, "id">[] = [];
  const pinName = (n: number) => wired.find((w) => w.arduinoPin === n)?.pinLabel ?? `pin ${n}`;
  const labelFor = (n: number) => {
    const ctrl = g.parts.find((p) => g.comps.get(p.uid)?.kind === "controller");
    const p = ctrl && g.comps.get(ctrl.uid)!.pins.find((x) => x.arduinoPin === n && x.fn === "gpio");
    return p?.label ?? `pin ${n}`;
  };

  // 1. Symbol names that clearly refer to a wired module pin but hold a different number.
  for (const sym of compiled.pinSymbols) {
    const s = norm(sym.name);
    if (s.length < 2) continue;
    const candidates = wired.filter((w) => {
      const mp = norm(w.modulePin);
      return mp.length >= 2 && (s === mp || s.endsWith(mp) || s.startsWith(mp)) && !/^(gnd|vcc|5v|vin)$/.test(mp);
    });
    if (!candidates.length) continue;
    if (candidates.some((c) => c.arduinoPin === sym.value)) continue;
    // only flag when the name matches a single wired function unambiguously
    const uniq = [...new Set(candidates.map((c) => c.arduinoPin))];
    if (uniq.length !== 1) continue;
    const c = candidates[0];
    issues.push({
      severity: "critical", area: "code", code: "C_PIN_MISMATCH",
      title: `HEY ${NAME}! YOUR CODE AND CIRCUIT PIN MAPPING DO NOT MATCH.`,
      incorrect: `Circuit: ${c.pinLabel} → ${c.module} ${c.modulePin}. Code (line ${sym.line}): ${sym.name} = ${sym.value} (${labelFor(sym.value)}).`,
      explanation: `In Circuit Studio ${c.module} ${c.modulePin} is wired to ${c.pinLabel}, but your code says ${sym.name} is ${labelFor(sym.value)}. The signal would go to a pin that is not connected to ${c.modulePin}.`,
      fix: `Change line ${sym.line} to use ${c.arduinoPin} (${c.pinLabel}), or move the wire in Circuit Studio to ${labelFor(sym.value)}. Change one side so they match.`,
      pinId: String(sym.line),
    });
  }

  // 2. Per-call checks.
  const usedPins = new Set<number>();
  const outputs = new Set<number>();
  for (const u of compiled.pinUsage) {
    if (u.pin === null) continue;
    usedPins.add(u.pin);
    if (u.call === "pinMode" && u.mode === "OUTPUT") outputs.add(u.pin);
    const targets = wired.filter((w) => w.arduinoPin === u.pin);
    const where = `line ${u.line}`;
    if (!targets.length) {
      if (u.call !== "pinMode")
        issues.push({ severity: "warning", area: "code", code: "C_PIN_UNWIRED", title: `YOUR CODE USES ${pinName(u.pin).toUpperCase()} BUT NOTHING IS WIRED TO IT`, incorrect: `${u.call}(${u.expression}) at ${where}`, explanation: `${labelFor(u.pin)} has no connection in Circuit Studio, so this ${u.call} has no effect on the robot.`, fix: "Check the pin number, or add the missing wire.", pinId: String(u.line) });
      continue;
    }
    for (const t of targets) {
      const isSensorOut = t.fn.startsWith("out-") || t.fn === "uart-tx";
      const isModuleIn = t.fn.startsWith("in-");
      if ((u.call === "digitalWrite" || u.call === "analogWrite") && isSensorOut)
        issues.push({ severity: "critical", area: "code", code: "C_WRITE_TO_SENSOR", title: `HEY ${NAME}! YOUR CODE WRITES TO A SENSOR OUTPUT!`, incorrect: `${u.call}(${u.expression}) at ${where}; ${t.pinLabel} is wired to ${t.module} ${t.modulePin}.`, explanation: `${t.module} ${t.modulePin} is an output — the controller should read it, not drive it.`, fix: `Use ${t.fn === "out-analog" ? "analogRead" : "digitalRead"}(${u.expression}) and pinMode(..., INPUT).`, pinId: String(u.line) });
      if ((u.call === "digitalRead" || u.call === "analogRead" || u.call === "pulseIn") && isModuleIn && t.modulePin !== "ECHO")
        issues.push({ severity: "warning", area: "code", code: "C_READ_FROM_INPUT", title: "READING A PIN THAT DRIVES A MODULE", incorrect: `${u.call}(${u.expression}) at ${where}; ${t.pinLabel} → ${t.module} ${t.modulePin}.`, explanation: `${t.modulePin} is a module input — your code should drive it.`, fix: "Check the pin number.", pinId: String(u.line) });
      if (u.call === "analogRead" && t.fn === "out-digital")
        issues.push({ severity: "suggestion", area: "code", code: "C_ANALOGREAD_DIGITAL", title: "analogRead ON A DIGITAL OUTPUT", incorrect: `${where}`, explanation: `${t.module} ${t.modulePin} is a digital (HIGH/LOW) output; analogRead will only return ≈0 or ≈1023.`, fix: "Use digitalRead, or use the module's analog output.", pinId: String(u.line) });
      if (u.call === "digitalRead" && t.fn === "out-analog")
        issues.push({ severity: "warning", area: "code", code: "C_DIGITALREAD_ANALOG", title: "digitalRead ON AN ANALOG SENSOR", incorrect: where, explanation: `${t.module} ${t.modulePin} outputs a varying voltage; digitalRead only tells you above/below ≈2.5 V.`, fix: "Use analogRead and a threshold you choose.", pinId: String(u.line) });
      if (u.call === "pulseIn" && t.modulePin !== "ECHO" && !t.fn.startsWith("out"))
        issues.push({ severity: "warning", area: "code", code: "C_PULSEIN_PIN", title: "pulseIn IS NOT ON AN ECHO PIN", incorrect: where, explanation: `pulseIn measures a pulse coming FROM a sensor (e.g. HC-SR04 ECHO). ${t.pinLabel} goes to ${t.module} ${t.modulePin}.`, fix: "Use the pin wired to ECHO.", pinId: String(u.line) });
    }
  }

  // 3. Wired control pins never touched by code. Pins accessed through arrays / variables (e.g. sensorPins[i])
  //    cannot be resolved statically, so in that case we do not claim they are unused.
  const dynamicReads = compiled.pinUsage.some((u) => u.pin === null && (u.call === "analogRead" || u.call === "digitalRead" || u.call === "pulseIn"));
  const dynamicWrites = compiled.pinUsage.some((u) => u.pin === null && (u.call === "digitalWrite" || u.call === "analogWrite"));
  for (const w of wired) {
    if (!w.fn.startsWith("in-") && !w.fn.startsWith("out-")) continue;
    if (usedPins.has(w.arduinoPin)) continue;
    if (w.fn.startsWith("out-") && dynamicReads) continue;
    if (w.fn.startsWith("in-") && dynamicWrites) continue;
    issues.push({ severity: "warning", area: "code", code: "C_WIRED_UNUSED", title: `${w.pinLabel} IS WIRED BUT YOUR CODE NEVER USES IT`, incorrect: `${w.pinLabel} → ${w.module} ${w.modulePin}`, explanation: w.fn.startsWith("in-") ? `${w.module} ${w.modulePin} will float or stay LOW, so it can't do its job.` : `You never read ${w.module} ${w.modulePin}.`, fix: w.fn.startsWith("in-") ? `Add pinMode(${w.arduinoPin}, OUTPUT) in setup() and drive it in loop().` : `Read it with ${w.fn === "out-analog" ? "analogRead" : "digitalRead"}(${w.arduinoPin}).` });
  }

  // 4. Outputs written without pinMode(OUTPUT)
  for (const u of compiled.pinUsage) {
    if (u.pin === null || u.call !== "digitalWrite") continue;
    if (!outputs.has(u.pin) && wired.some((w) => w.arduinoPin === u.pin && w.fn.startsWith("in-")))
      issues.push({ severity: "warning", area: "code", code: "C_NO_PINMODE", title: `${labelFor(u.pin).toUpperCase()} IS NEVER SET AS OUTPUT`, incorrect: `digitalWrite(${u.expression}) at line ${u.line} without pinMode(${u.expression}, OUTPUT).`, explanation: "Without pinMode OUTPUT, digitalWrite(HIGH) only enables the weak internal pull-up — far too little current to drive a module input reliably.", fix: `Add pinMode(${u.expression}, OUTPUT); in setup().`, pinId: String(u.line) });
  }
  const seen = new Set<string>();
  return issues
    .filter((i) => {
      const k = i.code + i.incorrect;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((i, n) => ({ ...i, id: `${i.code}-${n}` }));
}
