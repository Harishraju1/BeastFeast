/**
 * Template validator for the spec-driven families (used by the readiness test). It checks that the ONE
 * configuration really is consistent: drivetrain, motor → driver channel mapping, pins, pin map vs wiring,
 * voltages, currents, sensor count vs code, code vs controller, and simulation compatibility.
 */
import { getComponent } from "@/lib/catalogue";
import { buildGraph } from "@/lib/circuit/nets";
import { validateProject } from "@/lib/circuit/validate";
import { compile, getBoard } from "@/lib/arduino";
import { checkAllocation, type AllocatedPin, type PinNeedKind } from "@/lib/code/pins";
import { describeDrive } from "@/lib/code/generate";
import { DRIVER_WIRING } from "@/lib/robot/drivers";
import { buildRobotSpec } from "@/lib/robot/model";
import { RobotElectrical } from "@/lib/robot/bridge";
import { check4WD, find4WD } from "@/lib/robot/drivetrain4wd";
import type { Project } from "@/lib/types";
import type { ProjectTemplate, ReadinessCheck } from "./types";

const POWER_CODES = /^(E_OVERVOLTAGE|W_UNDERVOLTAGE|E_LOGIC_LEVEL|W_UART_LEVEL|W_MOTOR_OVERVOLT|E_L298N_JUMPER_OVERVOLT|W_L298N_REG_HEAT|E_BLDC_NEEDS_ESC|W_L298N_LOW_VS|E_L298N_NO_LOGIC|E_NO_POWER|E_MISSING_POWER|E_UNPOWERED_NET|E_REVERSE_POLARITY|E_SHORT_CIRCUIT|E_SUPPLY_CONFLICT|E_MISSING_GROUND|E_NO_COMMON_GROUND)$/;
const CURRENT_CODES = /^(W_DRIVER_CURRENT|W_BATTERY_CURRENT|W_SERVO_ON_5V_PIN)$/;
const PIN_CODES = /^(E_DUPLICATE_GPIO|W_DUPLICATE_GPIO|E_GPIO_SHORT|E_OUTPUT_CONFLICT|E_GPIO_ON_SUPPLY|E_INPUT_ONLY_PIN|E_OUTPUT_ON_ANALOG_ONLY|E_ANALOG_ON_DIGITAL|E_DIGITAL_ON_ANALOG_ONLY|E_PWM_ASSIGNMENT|W_PWM_INPUT_NON_PWM|E_UART_TX_TX|W_SOFTWARE_SERIAL)$/;

export function validateTemplate(t: ProjectTemplate, project: Project): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  const add = (name: string, ok: boolean, detail: string, warning = false, documented = false) => checks.push({ id: checks.length + 1, name, ok, warning: ok && warning, detail, ...(documented ? { documented: true } : {}) });
  const report = validateProject(project, "Engineer");
  const issues = report.issues;
  const g = buildGraph(project);
  const ctrlPart = g.parts.find((p) => g.comps.get(p.uid)?.kind === "controller");
  const ctrlComp = ctrlPart ? g.comps.get(ctrlPart.uid)! : null;
  const drive = describeDrive(project);
  const code = t.firmware.source;
  const esp = ctrlComp?.board === "esp32-devkit-v1";

  // 1 — drivetrain
  const dt = find4WD(project);
  const { spec } = buildRobotSpec(project);
  const motors = project.parts.filter((p) => getComponent(p.componentId)?.kind === "dc-motor").length;
  const casters = project.parts.filter((p) => getComponent(p.componentId)?.kind === "caster").length;
  const driven = spec.wheels.filter((w) => w.motorId).length;
  add("Four powered wheels, four motors, no caster", !!dt && motors === 4 && casters === 0 && driven === 4 && check4WD(project).length === 0, `${motors} motors, ${driven} driven wheels in the physics model, ${casters} casters${dt ? "" : "; no 4WD layout found"}`);

  // 2 — motor → driver channel, left / right grouping
  const problems: string[] = [...drive.missing.filter((m) => /motor|channel|side/i.test(m))];
  const seen = new Set<string>();
  for (const c of drive.channels) {
    for (const [i, m] of c.motors.entries()) {
      seen.add(m);
      const corner = c.corners[i];
      if (corner && (corner === "FL" || corner === "RL") !== (c.side === "left")) problems.push(`${m} is on the ${c.side} channel ${c.driver} ${c.channel}`);
    }
    const chDef = DRIVER_WIRING[c.driverId]?.channels.find((x) => x.name === c.channel);
    for (const p of c.pins) if ((p.driverPin === chDef?.inA || p.driverPin === chDef?.inB) && p.tie !== "gpio") problems.push(`${c.driver} ${p.driverPin} is not driven by the controller`);
  }
  if (seen.size !== motors) problems.push(`${motors - seen.size} motor(s) not reachable through a driver channel`);
  add("Each motor on a driver channel; left / right grouping correct", !problems.length, problems.length ? problems.join("; ") : drive.channels.map((c) => `${c.driver} ${c.channel} → ${c.motors.join(" + ")} (${c.side})`).join("; "));

  // 3 — pin conflicts and capabilities
  const pinIssues = issues.filter((i) => PIN_CODES.test(i.code) && i.severity !== "suggestion");
  const assigned: AllocatedPin[] = [];
  if (ctrlPart && ctrlComp) {
    for (const pin of ctrlComp.pins) {
      if (pin.fn !== "gpio" || pin.arduinoPin === undefined || /^(SDA|SCL)$/.test(pin.id)) continue;
      const net = g.netOf.get(`${ctrlPart.uid}.${pin.id}`);
      const others = net?.members.filter((m) => m.part.uid !== ctrlPart.uid) ?? [];
      if (!others.length) continue;
      const m = others[0];
      let kind: PinNeedKind = "digital-out";
      if (m.pin.fn === "uart-tx") kind = "uart-rx";
      else if (m.pin.fn === "uart-rx") kind = "uart-tx";
      else if (m.pin.fn === "out-analog") kind = "analog-in";
      else if (m.pin.fn === "out-digital") kind = "digital-in";
      else if (m.comp.kind === "motor-driver" && DRIVER_WIRING[m.comp.id]?.channels.some((c) => c.speedPins.includes(m.pin.id))) kind = "pwm";
      assigned.push({ id: `${m.part.label}.${m.pin.id}`, kind, pin: pin.id, gpio: pin.arduinoPin });
    }
  }
  const allocProblems = ctrlComp ? checkAllocation(ctrlComp.id, assigned, { wifi: t.firmware.control === "wifi" }) : ["no controller"];
  add("No pin conflicts; every pin can do its job", !pinIssues.length && !allocProblems.length, pinIssues.length || allocProblems.length ? [...pinIssues.map((i) => i.incorrect ?? i.title), ...allocProblems].join("; ") : `${assigned.length} controller pins, each used once and capability-correct${esp ? " (no flash or input-only pins as outputs)" : ""}`);

  // 4 — pin map vs wiring
  const mapProblems: string[] = [];
  if (ctrlPart && ctrlComp) {
    const wired = new Map<string, string>();
    for (const pin of ctrlComp.pins) {
      const net = g.netOf.get(`${ctrlPart.uid}.${pin.id}`);
      const others = (net?.members ?? []).filter((m) => m.part.uid !== ctrlPart.uid);
      if (others.length) wired.set(pin.label, others.map((m) => `${m.part.label} ${m.pin.label}`).sort().join(", "));
    }
    for (const e of t.pinMap) {
      const w = wired.get(e.pin);
      if (w === undefined) mapProblems.push(`pin map lists ${e.pin}, which is not wired`);
      else if (w !== e.connectedTo.split(", ").sort().join(", ")) mapProblems.push(`${e.pin}: pin map says "${e.connectedTo}", wiring says "${w}"`);
    }
    const mapped = new Set(t.pinMap.map((e) => e.connectedTo.split(", ").sort().join(", ")));
    for (const [pin, w] of wired) if (!mapped.has(w)) mapProblems.push(`${pin} → ${w} is wired but missing from the pin map`);
  }
  add("Every pin-map entry matches the wiring", !mapProblems.length, mapProblems.length ? mapProblems.join("; ") : `${t.pinMap.length} pin-map entries, all derived from the wiring`);

  // 5 — voltages
  const volt = issues.filter((i) => POWER_CODES.test(i.code));
  add("Voltage compatibility (battery, drivers, controller, logic levels)", !volt.length, volt.length ? volt.map((i) => `${i.code}: ${i.incorrect ?? i.title}`).join("; ") : "Every supply input and signal level is within range");

  // 6 — currents (warnings only where the template documents them)
  const cur = issues.filter((i) => CURRENT_CODES.test(i.code));
  const limText = t.metadata.limitations.join(" ");
  const documented = cur.every((i) => /current/i.test(limText) && /stall/i.test(limText) && (i.code !== "W_DRIVER_CURRENT" || drive.channels.some((c) => limText.includes(getComponent(c.driverId)?.name ?? "§"))));
  add("Current per driver channel", !cur.length || documented, cur.length ? `${cur.length} warning(s)${documented ? " — documented in the limitations" : " NOT documented"}: ${[...new Set(cur.map((i) => i.incorrect ?? i.title))].join("; ")}` : "Every motor's stall current (and parallel pairs' sum) is within its driver channel's peak rating", cur.length > 0, cur.length > 0 && documented);

  // 7 — sensors vs code
  const sensProblems: string[] = [];
  const numMatch = /const int NUM_SENSORS = (\d+);/.exec(code);
  const arrMatch = /const int linePins\[NUM_SENSORS\] = \{([^}]*)\}/.exec(code);
  if (drive.line.length && t.firmware.behaviour === "line") {
    if (!numMatch || Number(numMatch[1]) !== drive.line.length) sensProblems.push(`code NUM_SENSORS = ${numMatch?.[1] ?? "missing"}, array has ${drive.line.length} wired channels`);
    const pins = (arrMatch?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const expected = drive.line.map((l) => (esp ? String(ctrlComp!.pins.find((p) => p.id === l.pin)!.arduinoPin) : /^A\d+$/.test(l.pin) ? l.pin : String(ctrlComp!.pins.find((p) => p.id === l.pin)!.arduinoPin)));
    if (pins.join(",") !== expected.join(",")) sensProblems.push(`linePins {${pins.join(", ")}} ≠ wired {${expected.join(", ")}}`);
  } else if (numMatch) sensProblems.push("code reads a line array but none is wired");
  if (drive.distance && /US_TRIG|US_ECHO|IR_OBSTACLE|IR_DIST/.test(code) === false && t.firmware.behaviour !== "line" && t.firmware.behaviour !== "motor-test") sensProblems.push(`${drive.distance.label} is wired but the code never reads it`);
  if (!drive.distance && /distanceCm\(/.test(code)) sensProblems.push("code reads a distance sensor but none is wired");
  const edgeDefs = (code.match(/#define EDGE_[A-Z0-9_]+ /g) ?? []).length;
  if (t.firmware.behaviour === "sumo" && edgeDefs !== drive.edges.length) sensProblems.push(`code defines ${edgeDefs} edge sensors, ${drive.edges.length} are wired`);
  add("Sensor count matches the code", !sensProblems.length, sensProblems.length ? sensProblems.join("; ") : [drive.line.length ? `${drive.line.length} line channels = NUM_SENSORS ${numMatch?.[1]}` : "", drive.distance ? `${drive.distance.label} read by distanceCm()` : "", drive.edges.length ? `${drive.edges.length} edge sensors` : ""].filter(Boolean).join("; ") || "No sensors, none read");

  // 8 — code vs controller and control link
  const ccProblems: string[] = [];
  if (t.firmware.board !== ctrlComp?.board) ccProblems.push(`firmware board "${t.firmware.board}" ≠ controller board "${ctrlComp?.board}"`);
  const usesEspApi = /\bledc(Attach|Write|Detach)\s*\(|\bSerial2\b|#include\s*<(WiFi|WebServer)\.h>|\banalogReadResolution\s*\(/.test(code);
  if (!esp && usesEspApi) ccProblems.push("ESP32-only API (ledc*/Serial2/WiFi/analogReadResolution) in Uno code");
  if (esp && /\banalogWrite\s*\(/.test(code) && /\bledcAttach\s*\(/.test(code)) ccProblems.push("mixes analogWrite and LEDC on the ESP32");
  const wifiCode = /#include\s*<WiFi\.h>/.test(code);
  const btCode = /\bSerial2?\.parseInt\(\)|readCommands\(\)/.test(code) && !wifiCode;
  if (wifiCode && t.firmware.control !== "wifi") ccProblems.push("Wi-Fi code without Wi-Fi control");
  if (t.firmware.control === "wifi" && (/\bSerial2\b/.test(code) || btCode)) ccProblems.push("HC-05 (serial command) code in a Wi-Fi-only sketch");
  if (t.firmware.control === "hc05") {
    if (!drive.serial) ccProblems.push("HC-05 control without an HC-05 wired to a hardware RX pin");
    else if (!new RegExp(`\\b${drive.serial.port}\\.available\\(\\)`).test(code)) ccProblems.push(`HC-05 is on ${drive.serial.port} but the code does not read ${drive.serial.port}`);
  }
  if (!drive.serial && /\bSerial2\b/.test(code)) ccProblems.push("Serial2 code without a module on RX2");
  const compiledReal = !wifiCode ? compile(code, { board: getBoard(t.firmware.board) }) : null;
  if (compiledReal?.ok && esp) for (const u of compiledReal.pinUsage) if (u.pin !== null && [34, 35, 36, 39].includes(u.pin) && (u.call === "digitalWrite" || u.call === "analogWrite" || (u.call === "pinMode" && u.mode === "OUTPUT"))) ccProblems.push(`GPIO ${u.pin} (input-only) used as an output (line ${u.line})`);
  add("Code matches the controller and the control link", !ccProblems.length, ccProblems.length ? ccProblems.join("; ") : `${getBoard(t.firmware.board).name} code${esp ? " (GPIO numbers, LEDC PWM" + (t.firmware.control === "hc05" ? ", HC-05 on Serial2" : "") + ")" : " (analogWrite PWM" + (t.firmware.control === "hc05" ? ", HC-05 on Serial" : "") + ")"}; control: ${t.firmware.control}`);

  // 9 — simulation compatibility
  const simProblems: string[] = [];
  let simDetail: string;
  if (t.firmware.runsInSimulator === false) {
    if (t.simulation.controlMode !== "manual") simProblems.push("non-simulated firmware must default to Manual mode in the arena");
    const twin = t.firmware.checkSource ? compile(t.firmware.checkSource, { board: getBoard(t.firmware.board) }) : null;
    if (!twin?.ok) simProblems.push("the static-check twin does not compile");
    const drivable = Object.keys(new RobotElectrical(project).drivableMotors()).length;
    if (drivable !== 4) simProblems.push(`only ${drivable} motors are drivable in Manual mode`);
    simDetail = `Firmware not simulated (${t.firmware.simulationNote ?? "uses Wi-Fi"}); twin compiles; ${drivable} motors drivable in Manual mode`;
  } else {
    if (!compiledReal?.ok) simProblems.push("firmware does not compile in the interpreter");
    if (t.simulation.controlMode !== "code") simProblems.push("simulated firmware should run in Code mode");
    simDetail = `Firmware runs in the BEAST interpreter as ${getBoard(t.firmware.board).name} code`;
  }
  add("Simulation compatibility", !simProblems.length, simProblems.length ? simProblems.join("; ") : simDetail);
  return checks;
}
