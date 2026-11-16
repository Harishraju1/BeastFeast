/**
 * Rule-based electrical validation. Every rule inspects the real connection graph;
 * scores are computed from the issues found (never random).
 */
import type { ComponentRecord, PartInstance, PinDef, Project, ValidationIssue, ValidationReport } from "@/lib/types";
import { type CircuitGraph, type Net, type NetMember, batteryPack, buildGraph, isConnected, optionValue } from "./nets";
import { DRIVER_WIRING } from "@/lib/robot/drivers";
import { type SumoLimits, validateMechanics } from "@/lib/mech/validate";

type Issue = Omit<ValidationIssue, "id">;

const SIGNAL_OUT = new Set(["out-digital", "out-analog", "out-pwm", "uart-tx"]);
const SIGNAL_IN = new Set(["in-digital", "in-pwm", "in-analog", "uart-rx"]);

export function validateProject(project: Project, studentName = "ENGINEER", sumoLimits?: SumoLimits): ValidationReport {
  const g = buildGraph(project);
  const issues: Issue[] = [];
  let checks = 0;
  const add = (i: Issue) => issues.push(i);
  const NAME = studentName.toUpperCase();

  checks += ruleMissingComponents(project, g, add, NAME);
  checks += ruleShortsAndConflicts(g, add);
  checks += rulePowerAndGround(g, add, NAME);
  checks += ruleMotors(g, add, NAME);
  checks += ruleDrivers(g, add, NAME);
  checks += ruleSignals(g, add, NAME);
  checks += ruleBuses(g, add);
  checks += ruleCurrent(g, add);
  checks += ruleSuggestions(g, add);

  const mech = validateMechanics(project, NAME, sumoLimits);
  checks += mech.checks;
  issues.push(...mech.issues);

  const withIds: ValidationIssue[] = issues.map((i, n) => ({ ...i, id: `${i.code}-${n}` }));
  const order = { critical: 0, warning: 1, suggestion: 2 };
  withIds.sort((a, b) => order[a.severity] - order[b.severity]);
  return { at: new Date().toISOString(), issues: withIds, scores: score(withIds), passed: !withIds.some((i) => i.severity === "critical"), checksRun: checks };
}

export function score(issues: ValidationIssue[]) {
  const area = (a: ValidationIssue["area"]) => {
    const list = issues.filter((i) => i.area === a);
    const s = 100 - 30 * list.filter((i) => i.severity === "critical").length - 10 * list.filter((i) => i.severity === "warning").length - 2 * list.filter((i) => i.severity === "suggestion").length;
    return Math.max(0, s);
  };
  const electrical = area("electrical"),
    mechanical = area("mechanical"),
    power = area("power"),
    compatibility = area("compatibility");
  return { electrical, mechanical, power, compatibility, overall: Math.round((electrical + mechanical + power + compatibility) / 4) };
}

// ───────────────────────────── helpers ─────────────────────────────

const label = (m: { part: PartInstance; pin?: PinDef }) => (m.pin ? `${m.part.label} ${m.pin.label}` : m.part.label);
const partsOf = (g: CircuitGraph, pred: (c: ComponentRecord) => boolean) => g.parts.filter((p) => pred(g.comps.get(p.uid)!));
const controllerGpioOn = (n: Net | undefined) => n?.members.filter((m) => m.comp.kind === "controller" && m.pin.fn === "gpio") ?? [];
const has = (pin: PinDef, cap: string) => (pin.caps ?? []).includes(cap as never);
const key = (part: PartInstance, pinId: string) => `${part.uid}.${pinId}`;

// ───────────────────────────── rules ─────────────────────────────

function ruleMissingComponents(project: Project, g: CircuitGraph, add: (i: Issue) => void, NAME: string): number {
  const kinds = (k: string) => project.parts.filter((p) => g.comps.get(p.uid)?.kind === k || (!p.inCircuit && false)).length;
  const all = project.parts.map((p) => ({ p, c: g.comps.get(p.uid) ?? null }));
  const count = (pred: (c: ComponentRecord) => boolean) => all.filter((x) => x.c && pred(x.c)).length;
  const need = (ok: boolean, what: string, why: string, sev: Issue["severity"] = "critical") => {
    if (!ok) add({ severity: sev, area: "compatibility", code: "E_MISSING_COMPONENT", title: `HEY ${NAME}! YOUR ROBOT IS MISSING A ${what.toUpperCase()}!`, explanation: why, fix: `Open the component library and add a ${what}.` });
  };
  need(count((c) => c.kind === "controller") > 0, "microcontroller", "Every competition robot needs a controller board to run your code.");
  need(count((c) => c.kind === "battery") > 0, "battery", "Without a battery nothing on the robot has power.");
  const motors = count((c) => c.kind === "dc-motor");
  need(motors >= 2, "second drive motor", `A differential-drive robot needs at least two DC motors (found ${motors}).`);
  if (motors > 0) need(count((c) => c.kind === "motor-driver") > 0, "motor driver", "Motors draw far more current than a controller pin can supply (≈20 mA). A motor driver (H-bridge) switches the battery current and reverses direction.");
  need(!!project.chassis || count((c) => c.kind === "chassis") > 0, "chassis", "The chassis is the mechanical foundation that motors, wheels and electronics mount to.");
  if (project.competition === "line") need(count((c) => c.sensor?.kind?.startsWith("reflectance") ?? false) > 0, "line sensor", "A line follower needs reflectance sensors (TCRT5000, QTR array, IR array) to see the line.");
  if (project.competition === "sumo") {
    need(count((c) => ["ultrasonic", "ir-distance-analog", "tof", "ir-obstacle-digital"].includes(c.sensor?.kind ?? "")) > 0, "opponent sensor", "A sumo robot must find its opponent: add an ultrasonic, Sharp IR, ToF or IR proximity sensor facing forward.");
    need(count((c) => c.sensor?.kind?.startsWith("reflectance") ?? false) > 0, "edge sensor", "Edge sensors (e.g. TCRT5000 facing down) detect the white border so the robot does not drive out of the ring.");
  }
  void kinds;
  return 6;
}

function ruleShortsAndConflicts(g: CircuitGraph, add: (i: Issue) => void): number {
  let n = 0;
  for (const net of g.nets) {
    n++;
    const real = net.sources.filter((s) => !s.label.includes("IOREF"));
    if (net.isGround && real.length) {
      const src = real[0];
      const bat = net.members.find((m) => m.pin.fn === "bat-");
      add({
        severity: "critical", area: "power", code: "E_SHORT_CIRCUIT", title: "SHORT CIRCUIT DETECTED!",
        partUid: src.key.split(".")[0], pinId: src.key.split(".")[1], wireId: net.wires[0]?.id,
        incorrect: `${src.label} is connected straight to ground${bat ? ` (${label(bat)})` : ""}.`,
        explanation: "A supply connected directly to ground has no load to limit the current. A Li-ion or LiPo pack can deliver tens of amps — wires melt, the battery can swell or catch fire.",
        fix: "Remove the wire that joins the supply to GND. Supply pins go to VIN/VCC/VS inputs; GND goes to GND.",
      });
    }
    const distinct = real.filter((s, i) => real.findIndex((t) => Math.abs(t.v - s.v) < 0.3) === i);
    if (distinct.length > 1) {
      add({
        severity: "critical", area: "power", code: "E_SUPPLY_CONFLICT", title: "POWER SOURCES ARE FIGHTING EACH OTHER!",
        partUid: distinct[1].key.split(".")[0], pinId: distinct[1].key.split(".")[1], wireId: net.wires[0]?.id,
        incorrect: `${distinct.map((s) => s.label).join(" and ")} drive the same wire.`,
        explanation: "Two supplies at different voltages tied together push current into each other. Regulators and controller rails are not designed to be back-fed and can be destroyed.",
        fix: "Give each supply its own net. Only grounds should be shared between supplies.",
      });
    }
    const gpios = controllerGpioOn(net);
    if (gpios.length > 1 && new Set(gpios.map((m) => m.part.uid + (m.pin.arduinoPin ?? m.pin.id))).size > 1) {
      const distinctPins = gpios.filter((m, i) => gpios.findIndex((x) => x.pin.arduinoPin === m.pin.arduinoPin && x.part.uid === m.part.uid) === i);
      if (distinctPins.length > 1)
        add({ severity: "critical", area: "electrical", code: "E_GPIO_SHORT", title: "TWO CONTROLLER PINS ARE SHORTED TOGETHER!", partUid: gpios[0].part.uid, pinId: gpios[1].pin.id, wireId: net.wires[0]?.id, incorrect: distinctPins.map(label).join(" ↔ "), explanation: "If one pin outputs HIGH while the other outputs LOW, they short through each other and can be damaged.", fix: "Each signal should connect to exactly one controller pin." });
    }
    const outs = net.members.filter((m) => SIGNAL_OUT.has(m.pin.fn) && m.comp.kind !== "controller");
    const outParts = new Set(outs.map((m) => m.part.uid));
    if (outParts.size > 1)
      add({ severity: "critical", area: "electrical", code: "E_OUTPUT_CONFLICT", title: "TWO OUTPUTS ARE DRIVING THE SAME WIRE!", partUid: outs[1].part.uid, pinId: outs[1].pin.id, wireId: net.wires[0]?.id, incorrect: outs.map(label).join(" ↔ "), explanation: "Two module outputs connected together fight whenever they disagree, and the controller cannot tell which sensor it is reading.", fix: "Give every sensor output its own controller input pin." });
    if (gpios.length && net.voltage !== null && !net.isGround)
      add({ severity: "critical", area: "electrical", code: "E_GPIO_ON_SUPPLY", title: "A CONTROLLER PIN IS WIRED STRAIGHT TO POWER!", partUid: gpios[0].part.uid, pinId: gpios[0].pin.id, wireId: net.wires[0]?.id, incorrect: `${label(gpios[0])} is on the ${net.voltage.toFixed(1)} V supply.`, explanation: "A GPIO configured as OUTPUT LOW would short the supply; above the pin's logic voltage it is destroyed immediately.", fix: "Connect GPIO pins only to signal pins (IN/OUT/TRIG/ECHO …), never to VCC, VS, VIN or battery +." });
    const nc = net.members.filter((m) => m.pin.fn === "nc" && isConnected(g, m.key));
    for (const m of nc) add({ severity: "warning", area: "electrical", code: "W_NC_PIN", title: "WIRE ON A PIN THAT ISN'T USED", partUid: m.part.uid, pinId: m.pin.id, incorrect: `${label(m)} is connected.`, explanation: `${m.pin.label} is a reference / no-connect pin.${m.pin.note ? " " + m.pin.note : ""}`, fix: "Remove this wire unless you know exactly why it is needed." });
  }
  return n;
}

function rulePowerAndGround(g: CircuitGraph, add: (i: Issue) => void, NAME: string): number {
  let n = 0;
  const ctrl = partsOf(g, (c) => c.kind === "controller")[0];
  for (const p of g.parts) {
    const c = g.comps.get(p.uid)!;
    const vins = c.pins.filter((x) => x.fn === "vin");
    const gnds = c.pins.filter((x) => x.fn === "gnd");
    if (!vins.length && !(c.kind === "controller")) continue;
    n++;
    // Controllers may be powered from VIN or from their 5V/3V3/VSYS pin.
    const supplyPins = c.kind === "controller" ? c.pins.filter((x) => x.fn === "vin" || (x.fn === "vout" && x.vRange)) : vins;
    const suppliedPins = supplyPins.filter((x) => g.netOf.get(key(p, x.id))?.voltage !== null && g.netOf.get(key(p, x.id))?.voltage !== undefined);

    // reverse polarity: supply input on ground, ground pin on a voltage
    for (const x of supplyPins) {
      const net = g.netOf.get(key(p, x.id));
      if (net?.isGround && isConnected(g, key(p, x.id)) && gnds.some((gp) => (g.netOf.get(key(p, gp.id))?.voltage ?? null) !== null)) {
        add({ severity: "critical", area: "power", code: "E_REVERSE_POLARITY", title: `HEY ${NAME}! ${p.label.toUpperCase()} IS WIRED BACKWARDS!`, partUid: p.uid, pinId: x.id, incorrect: `${x.label} is on ground while GND is on the positive supply.`, explanation: "Reverse polarity forces current backwards through the part. Most modules have no protection and fail instantly.", fix: `Swap the two power wires: + to ${x.label}, − to GND.` });
      }
    }

    const rangeCheck = (x: PinDef, net: Net) => {
      if (net.voltage == null) return;
      if (x.vRange) {
        const vmax = net.vMax ?? net.voltage;
        if (vmax > x.vRange[1] + 0.05)
          add({ severity: "critical", area: "power", code: "E_OVERVOLTAGE", title: "POWER SYSTEM WARNING! VOLTAGE TOO HIGH!", partUid: p.uid, pinId: x.id, incorrect: `${label({ part: p, pin: x })} receives up to ${vmax.toFixed(1)} V; its maximum is ${x.vRange[1]} V.`, explanation: `${p.label} accepts ${x.vRange[0]}–${x.vRange[1]} V on ${x.label}. A fully charged pack measures more than its nominal voltage (${net.voltage.toFixed(1)} V nominal / ${vmax.toFixed(1)} V full).`, fix: `Feed ${x.label} from a regulator set inside ${x.vRange[0]}–${x.vRange[1]} V, or choose a lower-voltage battery.` });
        else if (net.voltage < x.vRange[0] - 0.05)
          add({ severity: "warning", area: "power", code: "W_UNDERVOLTAGE", title: "POWER SYSTEM WARNING! VOLTAGE TOO LOW!", partUid: p.uid, pinId: x.id, incorrect: `${label({ part: p, pin: x })} gets ${net.voltage.toFixed(1)} V; it needs at least ${x.vRange[0]} V.`, explanation: "Below its minimum supply a part may reset, behave erratically or not start.", fix: "Use a higher-voltage battery or a boost converter." });
      }
    };
    if (c.kind === "controller") {
      for (const x of suppliedPins) rangeCheck(x, g.netOf.get(key(p, x.id))!);
      if (!suppliedPins.length)
        add({ severity: "critical", area: "power", code: "E_NO_POWER", title: `HEY ${NAME}! YOUR CONTROLLER HAS NO POWER!`, partUid: p.uid, pinId: supplyPins.find((x) => x.fn === "vin")?.id, incorrect: `Nothing supplies ${supplyPins.map((x) => x.label).join(" / ")}.`, explanation: "On the robot there is no USB cable — the controller must be fed from the battery (VIN, through its regulator) or from a regulated 5 V/3.3 V rail.", fix: "Connect battery + (through the power switch) to VIN, or a buck converter's 5 V output to the 5V pin, and battery − to GND." });
    } else {
      for (const x of vins) {
        const net = g.netOf.get(key(p, x.id));
        if (!isConnected(g, key(p, x.id))) {
          if (c.kind === "regulator" || c.kind === "motor-driver" || c.kind === "sensor" || c.kind === "wireless" || c.kind === "display" || vins.length > 1 || c.kind === "servo" || c.kind === "rc-input")
            add({ severity: "critical", area: "power", code: "E_MISSING_POWER", title: `HEY ${NAME}! ${p.label.toUpperCase()} HAS NO ${x.label.toUpperCase()} SUPPLY!`, partUid: p.uid, pinId: x.id, incorrect: `${x.label} is not connected.`, explanation: `${x.label} must be connected to a supply in the range ${x.vRange ? `${x.vRange[0]}–${x.vRange[1]} V` : "given in the datasheet"}.${x.note ? " " + x.note : ""}`, fix: `Wire ${x.label} to a suitable supply.` });
          continue;
        }
        if (net?.voltage == null) {
          add({ severity: "critical", area: "power", code: "E_UNPOWERED_NET", title: `NO POWER IS REACHING ${p.label.toUpperCase()} ${x.label}!`, partUid: p.uid, pinId: x.id, incorrect: `${x.label} is wired, but that wire carries no supply voltage.`, explanation: "The wire goes somewhere, but not to a powered source — check switches are closed and regulators are themselves powered and grounded.", fix: "Trace the wire back to battery + or a regulator output." });
          continue;
        }
        rangeCheck(x, net);
      }
    }

    // ground
    const groundedPins = gnds.filter((x) => g.netOf.get(key(p, x.id))?.isGround);
    const connectedGnd = gnds.filter((x) => isConnected(g, key(p, x.id)));
    if (gnds.length && suppliedPins.length + vins.filter((x) => isConnected(g, key(p, x.id))).length > 0 && !groundedPins.length) {
      const talksToCtrl = ctrl && ctrl.uid !== p.uid && c.pins.some((x) => controllerGpioOn(g.netOf.get(key(p, x.id))).length > 0);
      const what = c.kind === "motor-driver" ? "MOTOR DRIVER" : c.kind === "controller" ? "CONTROLLER" : p.label.toUpperCase();
      add({
        severity: "critical", area: "electrical", code: talksToCtrl ? "E_NO_COMMON_GROUND" : "E_MISSING_GROUND",
        title: talksToCtrl ? `HEY ${NAME}! YOUR ${what} HAS NO COMMON GROUND!` : `HEY ${NAME}! ${what} HAS NO GROUND!`,
        partUid: p.uid, pinId: gnds[0].id,
        incorrect: connectedGnd.length ? `${p.label} GND is wired, but not to the battery's negative (system ground).` : `${p.label} GND is not connected.`,
        explanation: talksToCtrl
          ? "The controller and this module require a shared ground reference for their signal connections to work correctly. A HIGH signal is only 'high' relative to a common 0 V."
          : "Current must return to the battery through ground. With no ground the part has no complete circuit.",
        fix: `Connect ${p.label} ${gnds[0].label} to battery − / the controller's GND.`,
      });
    }
  }
  return n;
}

function ruleMotors(g: CircuitGraph, add: (i: Issue) => void, NAME: string): number {
  let n = 0;
  for (const m of partsOf(g, (c) => c.kind === "dc-motor")) {
    n++;
    const c = g.comps.get(m.uid)!;
    const terms = c.pins.filter((p) => p.fn === "motor-term");
    if (terms.length < 2) continue;
    const nets = terms.map((t) => g.netOf.get(key(m, t.id)));
    const unconnected = terms.filter((t) => !isConnected(g, key(m, t.id)));
    if (unconnected.length) {
      add({ severity: "critical", area: "electrical", code: "E_MOTOR_UNCONNECTED", title: `HEY ${NAME}! ${m.label.toUpperCase()} IS NOT CONNECTED!`, partUid: m.uid, pinId: unconnected[0].id, incorrect: `${unconnected.map((t) => t.label).join(" and ")} not wired.`, explanation: "A DC motor needs both terminals connected to a driver channel's two outputs so the driver can reverse it.", fix: "Wire M+ and M− to OUT1/OUT2 (or OUT3/OUT4) of your motor driver." });
      continue;
    }
    if (nets[0] === nets[1]) {
      add({ severity: "critical", area: "electrical", code: "E_MOTOR_SHORTED", title: "MOTOR TERMINALS ARE SHORTED!", partUid: m.uid, pinId: terms[0].id, incorrect: "Both motor terminals are on the same wire.", explanation: "The motor sees 0 V across it and can never turn.", fix: "Connect each terminal to a different driver output." });
      continue;
    }
    const onGpio = nets.flatMap((nt) => controllerGpioOn(nt));
    if (onGpio.length) {
      add({ severity: "critical", area: "electrical", code: "E_MOTOR_ON_GPIO", title: `HEY ${NAME}! A MOTOR IS WIRED STRAIGHT TO THE CONTROLLER!`, partUid: m.uid, pinId: terms[0].id, incorrect: `${m.label} → ${label(onGpio[0])}`, explanation: `A controller pin can supply about 20 mA; even a small gear motor needs hundreds of milliamps (stall ${c.motor?.stallCurrentA ?? "≥0.5"} A). The pin — or the whole chip — will be damaged, and it cannot reverse the motor.`, fix: "Put a motor driver between the controller and the motor." });
      continue;
    }
    const outs = nets.map((nt) => nt?.members.find((x) => x.pin.fn === "motor-out"));
    if (!outs[0] || !outs[1]) {
      const toSupply = nets.some((nt) => nt?.voltage != null || nt?.isGround);
      add({ severity: toSupply ? "warning" : "critical", area: "electrical", code: "E_MOTOR_NOT_ON_DRIVER", title: toSupply ? "MOTOR IS WIRED DIRECTLY TO POWER" : "MOTOR IS NOT DRIVEN BY A MOTOR DRIVER", partUid: m.uid, pinId: terms[0].id, incorrect: `${m.label} terminals are not both on driver outputs.`, explanation: toSupply ? "Wired straight to the battery the motor always runs at full speed in one direction — your code cannot control it." : "Each motor terminal must go to a motor-driver output.", fix: "Connect M+ and M− to the two outputs of one driver channel." });
      continue;
    }
    if (outs[0].part.uid === outs[1].part.uid) {
      const wiring = DRIVER_WIRING[outs[0].comp.id];
      if (wiring) {
        const ch = wiring.channels.find((ch) => ch.outs.includes(outs[0]!.pin.id));
        if (ch && !ch.outs.includes(outs[1].pin.id))
          add({ severity: "warning", area: "electrical", code: "W_MOTOR_SPLIT_CHANNELS", title: "MOTOR IS SPLIT ACROSS TWO DRIVER CHANNELS", partUid: m.uid, pinId: terms[1].id, incorrect: `${outs[0].pin.label} and ${outs[1].pin.label} belong to different channels.`, explanation: "Each channel is one H-bridge. Using one output from each channel only works if you coordinate both channels in code — usually a wiring mistake.", fix: `Use ${ch.outs.join(" and ")} for this motor.` });
      }
    }
  }
  return n;
}

function ruleDrivers(g: CircuitGraph, add: (i: Issue) => void, NAME: string): number {
  let n = 0;
  for (const d of partsOf(g, (c) => c.kind === "motor-driver")) {
    const c = g.comps.get(d.uid)!;
    const wiring = DRIVER_WIRING[c.id];
    if (!wiring) continue;
    n++;
    if (c.id === "l298n") {
      const jumper = Boolean(optionValue(c, d, "regJumper"));
      const vs = g.netOf.get(key(d, "VS"));
      const vsMax = vs?.vMax ?? vs?.voltage ?? 0;
      if (jumper && vsMax > 12.05)
        add({ severity: "critical", area: "power", code: "E_L298N_JUMPER_OVERVOLT", title: "POWER SYSTEM WARNING! L298N 5V JUMPER WITH >12 V!", partUid: d.uid, pinId: "VS", incorrect: `VS reaches ${vsMax.toFixed(1)} V with the 5V-regulator jumper fitted.`, explanation: "The on-board 78M05 regulator is only meant for up to 12 V. Above that it overheats.", fix: "Remove the 5V-regulator jumper and feed 5 V into the +5V pin from your controller or a buck converter." });
      if (jumper && vs?.voltage != null && vs.voltage < 7)
        add({ severity: "warning", area: "power", code: "W_L298N_LOW_VS", title: "L298N LOGIC MAY NOT GET 5 V", partUid: d.uid, pinId: "5V", incorrect: `VS is only ${vs.voltage.toFixed(1)} V.`, explanation: "The 78M05 needs about 7 V in to produce a stable 5 V for the L298N logic.", fix: "Use a higher-voltage battery, or remove the jumper and supply 5 V to the +5V pin." });
      if (!jumper) {
        const five = g.netOf.get(key(d, "5V"));
        if (!five?.voltage)
          add({ severity: "critical", area: "power", code: "E_L298N_NO_LOGIC", title: `HEY ${NAME}! THE L298N LOGIC HAS NO 5 V!`, partUid: d.uid, pinId: "5V", incorrect: "Regulator jumper removed and nothing supplies the +5V pin.", explanation: "Without the jumper the +5V pin is an INPUT — the L298N logic is unpowered and ignores IN1–IN4.", fix: "Connect the controller's 5V pin to the L298N +5V pin, or refit the jumper (VS ≤ 12 V)." });
      }
    }
    if (wiring.logicSupply) void 0; // logic supply checked by the generic missing-power rule

    const driverMotors = wiring.channels.map((ch) => ({ ch, motor: ch.outs.some((o) => g.netOf.get(key(d, o))?.members.some((m) => m.pin.fn === "motor-term")) }));
    for (const { ch, motor } of driverMotors) {
      if (!motor) continue;
      const ctrlPins = (pin: string) => controllerGpioOn(g.netOf.get(key(d, pin)));
      for (const pinId of [ch.inA, ch.inB]) {
        if (!ctrlPins(pinId).length) {
          const net = g.netOf.get(key(d, pinId));
          const tiedHigh = net?.voltage != null;
          if (wiring.scheme === "in-in" || !tiedHigh)
            add({ severity: "critical", area: "electrical", code: "E_DRIVER_INPUT_UNCONNECTED", title: `HEY ${NAME}! ${d.label.toUpperCase()} ${pinId} IS NOT CONNECTED TO YOUR CONTROLLER!`, partUid: d.uid, pinId, incorrect: `${pinId} (channel ${ch.name}) has no controller pin.`, explanation: `Channel ${ch.name} drives a motor, so ${pinId} must be driven by a controller GPIO to set the direction${wiring.scheme === "in-in" ? " and speed" : ""}. A floating input makes the motor behave randomly.`, fix: `Wire ${pinId} to a free digital pin (e.g. D7) and use digitalWrite() on it.` });
        }
      }
      if (ch.en) {
        const jumper = ch.enJumperOption ? Boolean(optionValue(c, d, ch.enJumperOption)) : false;
        const enCtrl = ctrlPins(ch.en);
        if (jumper && enCtrl.length)
          add({ severity: "warning", area: "electrical", code: "W_EN_JUMPER_AND_WIRE", title: `${ch.en} JUMPER IS STILL FITTED`, partUid: d.uid, pinId: ch.en, incorrect: `${ch.en} is wired to ${label(enCtrl[0])} but the jumper ties it to 5 V.`, explanation: "With the jumper fitted, the enable pin is held HIGH and your PWM is shorted against 5 V.", fix: `Remove the ${ch.en} jumper (set it in the inspector) to use PWM speed control.` });
        if (!jumper && !enCtrl.length) {
          const net = g.netOf.get(key(d, ch.en));
          if (net?.voltage == null)
            add({ severity: "critical", area: "electrical", code: "E_DRIVER_EN_UNCONNECTED", title: `HEY ${NAME}! MOTOR ${ch.name} CAN NEVER BE ENABLED!`, partUid: d.uid, pinId: ch.en, incorrect: `${ch.en} is not connected and the jumper is removed.`, explanation: `${ch.en} enables channel ${ch.name}. Left floating/LOW, the outputs stay off whatever IN pins do.`, fix: `Wire ${ch.en} to a PWM-capable pin (Uno: 3, 5, 6, 9, 10, 11) and use analogWrite(), or refit the jumper for full speed only.` });
        }
      }
      if (ch.stby && !ctrlPins(ch.stby).length && g.netOf.get(key(d, ch.stby))?.voltage == null)
        add({ severity: "critical", area: "electrical", code: "E_STBY_FLOATING", title: `HEY ${NAME}! TB6612FNG STANDBY PIN IS NOT HIGH!`, partUid: d.uid, pinId: ch.stby, incorrect: "STBY is not connected.", explanation: "STBY LOW (or floating) keeps the whole driver in standby: no motor will move.", fix: "Connect STBY to VCC (always on) or to a controller pin set HIGH in setup()." });
      for (const e of ch.enables ?? [])
        if (!ctrlPins(e).length && g.netOf.get(key(d, e))?.voltage == null)
          add({ severity: "critical", area: "electrical", code: "E_DRIVER_EN_UNCONNECTED", title: `${d.label.toUpperCase()} ${e} IS FLOATING`, partUid: d.uid, pinId: e, incorrect: `${e} is not connected.`, explanation: `Both half-bridges must be enabled (${(ch.enables ?? []).join(", ")} HIGH) for the motor to run.`, fix: `Tie ${e} to 5 V or to a controller pin set HIGH.` });

      // PWM capability
      const speed = ch.speedPins.map((sp) => ({ sp, gp: ctrlPins(sp) }));
      const wired = speed.filter((s) => s.gp.length);
      const nonPwm = wired.filter((s) => !s.gp.some((m) => has(m.pin, "pwm")));
      if (wiring.scheme === "in-in") {
        if (wired.length === speed.length && nonPwm.length === speed.length)
          add({ severity: "warning", area: "compatibility", code: "W_NO_PWM_SPEED", title: "NO SPEED CONTROL ON THIS MOTOR", partUid: d.uid, pinId: speed[0].sp, incorrect: `${speed.map((s) => `${s.sp} → ${label(s.gp[0])}`).join(", ")}: none is PWM-capable.`, explanation: "This driver sets speed with PWM on its IN pins. Without at least one PWM pin per channel the motor can only run full speed or stop.", fix: "Move at least one IN pin of each channel to a PWM pin." });
      } else {
        for (const s of nonPwm)
          add({ severity: "critical", area: "compatibility", code: "E_PWM_ASSIGNMENT", title: `HEY ${NAME}! ${s.sp} IS ON A PIN WITHOUT PWM!`, partUid: d.uid, pinId: s.sp, incorrect: `${s.sp} → ${label(s.gp[0])}`, explanation: `${s.sp} controls the motor speed with a PWM signal (analogWrite). ${s.gp[0].pin.label} cannot generate PWM, so the motor will only be fully on or fully off.`, fix: `Move ${s.sp} to a PWM pin${s.gp[0].comp.board === "uno" || s.gp[0].comp.board === "nano" ? " (3, 5, 6, 9, 10 or 11 on this board)" : ""}.` });
      }
    }
  }
  return n;
}

function ruleSignals(g: CircuitGraph, add: (i: Issue) => void, NAME: string): number {
  let n = 0;
  for (const net of g.nets) {
    const gpios = controllerGpioOn(net);
    if (!gpios.length) continue;
    n++;
    const gp = gpios[0];
    const others = net.members.filter((m) => m.comp.kind !== "controller");
    const outs = others.filter((m) => SIGNAL_OUT.has(m.pin.fn) && m.pin.fn !== "uart-tx");
    const ins = others.filter((m) => SIGNAL_IN.has(m.pin.fn) && m.pin.fn !== "uart-rx");
    // duplicate assignment
    const inParts = new Set(ins.map((m) => `${m.part.uid}.${m.pin.id}`));
    if (outs.length && ins.length)
      add({ severity: "critical", area: "electrical", code: "E_DUPLICATE_GPIO", title: `HEY ${NAME}! ${gp.pin.label} IS DOING TWO JOBS!`, partUid: gp.part.uid, pinId: gp.pin.id, incorrect: `${gp.pin.label} reads ${label(outs[0])} AND drives ${label(ins[0])}.`, explanation: "A pin is either an input (reading a sensor) or an output (controlling a module) — not both at once.", fix: `Move one of them to a free pin.` });
    else if (inParts.size > 1)
      add({ severity: "warning", area: "electrical", code: "W_DUPLICATE_GPIO", title: `${gp.pin.label} DRIVES SEVERAL INPUTS`, partUid: gp.part.uid, pinId: gp.pin.id, incorrect: [...ins].map(label).join(", "), explanation: "One controller pin drives several module inputs, so they can never be set independently (e.g. both motors always spin the same way).", fix: "Unless that is intentional, give each input its own pin." });

    for (const o of outs) {
      if (o.pin.fn === "out-analog" && !has(gp.pin, "analog"))
        add({ severity: "critical", area: "compatibility", code: "E_ANALOG_ON_DIGITAL", title: `HEY ${NAME}! ANALOG SENSOR ON A DIGITAL-ONLY PIN!`, partUid: o.part.uid, pinId: o.pin.id, incorrect: `${label(o)} → ${label(gp)}`, explanation: `${o.pin.label} outputs a varying voltage that must be measured with analogRead(). ${gp.pin.label} has no ADC.`, fix: "Connect it to an analog input (A0–A5 on an Uno)." });
      if (o.pin.fn === "out-digital" && has(gp.pin, "analog-only"))
        add({ severity: "critical", area: "compatibility", code: "E_DIGITAL_ON_ANALOG_ONLY", title: "DIGITAL SIGNAL ON AN ANALOG-ONLY PIN!", partUid: o.part.uid, pinId: o.pin.id, incorrect: `${label(o)} → ${label(gp)}`, explanation: `${gp.pin.label}: ${gp.pin.note ?? "this pin is analog input only"}`, fix: "Use another pin, or read it with analogRead() and a threshold." });
      const outV = o.pin.logicV ?? supplyOf(g, o);
      if (gp.pin.logicV && gp.pin.logicV < 4 && !gp.pin.tolerant5V && outV && outV > gp.pin.logicV + 0.6)
        add({ severity: "critical", area: "compatibility", code: "E_LOGIC_LEVEL", title: "VOLTAGE MISMATCH: 5 V SIGNAL INTO A 3.3 V PIN!", partUid: o.part.uid, pinId: o.pin.id, incorrect: `${label(o)} (${outV.toFixed(1)} V) → ${label(gp)} (${gp.pin.logicV} V logic)`, explanation: `${gp.part.label} pins are not 5 V tolerant; a 5 V HIGH exceeds the pin's absolute maximum.`, fix: "Power the sensor from 3.3 V if it supports it, or add a level shifter / voltage divider (e.g. 1 kΩ + 2 kΩ)." });
    }
    for (const i of ins) {
      if (has(gp.pin, "input-only"))
        add({ severity: "critical", area: "compatibility", code: "E_INPUT_ONLY_PIN", title: "OUTPUT ON AN INPUT-ONLY PIN!", partUid: gp.part.uid, pinId: gp.pin.id, incorrect: `${label(gp)} → ${label(i)}`, explanation: `${gp.pin.label} can only be read (${gp.pin.note ?? "input only"}).`, fix: "Use an output-capable GPIO." });
      if (has(gp.pin, "analog-only"))
        add({ severity: "critical", area: "compatibility", code: "E_OUTPUT_ON_ANALOG_ONLY", title: "OUTPUT ON AN ANALOG-ONLY PIN!", partUid: gp.part.uid, pinId: gp.pin.id, incorrect: `${label(gp)} → ${label(i)}`, explanation: gp.pin.note ?? "This pin cannot be used as a digital output.", fix: "Use a digital pin." });
      if (i.pin.fn === "in-pwm" && i.comp.kind !== "motor-driver" && !has(gp.pin, "pwm") && i.comp.kind !== "servo")
        add({ severity: "warning", area: "compatibility", code: "W_PWM_INPUT_NON_PWM", title: `${i.pin.label} EXPECTS PWM`, partUid: i.part.uid, pinId: i.pin.id, incorrect: `${label(i)} ← ${label(gp)}`, explanation: `${gp.pin.label} has no hardware PWM.`, fix: "Use a PWM-capable pin." });
    }
    if (has(gp.pin, "boot-strap") && (outs.length || ins.length))
      add({ severity: "suggestion", area: "compatibility", code: "S_STRAP_PIN", title: `${gp.pin.label} IS A BOOT STRAPPING PIN`, partUid: gp.part.uid, pinId: gp.pin.id, explanation: gp.pin.note ?? "External circuits on this pin can stop the board booting.", fix: "Prefer a non-strapping GPIO if one is free." });
    if ((gp.pin.arduinoPin === 0 || gp.pin.arduinoPin === 1) && gp.comp.board && ["uno", "nano", "uno-r4", "pro-mini", "mega"].includes(gp.comp.board) && (outs.length || ins.length))
      add({ severity: "suggestion", area: "compatibility", code: "S_SERIAL_PINS", title: "D0/D1 ARE SHARED WITH USB SERIAL", partUid: gp.part.uid, pinId: gp.pin.id, explanation: "Anything on D0/D1 interferes with uploading code and with Serial.print debugging.", fix: "Disconnect it while uploading, or use other pins." });
  }
  // unconnected sensor outputs
  for (const p of partsOf(g, (c) => c.kind === "sensor")) {
    const c = g.comps.get(p.uid)!;
    const outPins = c.pins.filter((x) => x.fn === "out-digital" || x.fn === "out-analog");
    if (!outPins.length) continue;
    const used = outPins.filter((x) => controllerGpioOn(g.netOf.get(key(p, x.id))).length);
    const isArray = (c.sensor?.channels ?? 1) > 1;
    const missingCh = outPins.filter((x) => !used.includes(x) && !(x.fn === "out-analog" && outPins.some((o) => o.fn === "out-digital" && used.includes(o))) && !(x.fn === "out-digital" && outPins.some((o) => o.fn === "out-analog" && used.includes(o))));
    if (used.length && isArray && missingCh.length)
      add({ severity: "warning", area: "electrical", code: "W_SENSOR_OUTPUT_UNCONNECTED", title: `${p.label.toUpperCase()} HAS UNCONNECTED CHANNELS`, partUid: p.uid, pinId: missingCh[0].id, incorrect: `${missingCh.map((x) => x.label).join(", ")} not connected.`, explanation: "Unconnected channels leave blind spots in the array: the robot cannot see the line under them.", fix: "Wire every channel to its own controller input (or remove channels you don't use)." });
    if (!used.length && !(c.sensor?.kind === "bumper"))
      add({ severity: "warning", area: "electrical", code: "W_SENSOR_OUTPUT_UNCONNECTED", title: `${p.label.toUpperCase()} OUTPUT GOES NOWHERE`, partUid: p.uid, pinId: outPins[0].id, incorrect: `None of ${outPins.map((x) => x.label).join(", ")} reaches the controller.`, explanation: "The sensor is powered but your code cannot read it.", fix: `Connect ${outPins[0].label} to a ${outPins[0].fn === "out-analog" ? "analog" : "digital"} input.` });
    // ultrasonic trigger
    const trig = c.pins.find((x) => x.id === "TRIG");
    if (trig && !controllerGpioOn(g.netOf.get(key(p, trig.id))).length)
      add({ severity: "critical", area: "electrical", code: "E_TRIG_UNCONNECTED", title: `HEY ${NAME}! ULTRASONIC TRIG IS NOT CONNECTED!`, partUid: p.uid, pinId: "TRIG", incorrect: "TRIG has no controller pin.", explanation: "The sensor only measures when the controller sends a 10 µs pulse on TRIG.", fix: "Wire TRIG to a digital pin and pulse it in code." });
    // switch-type sensors
    if (c.pins.some((x) => x.fn === "switch")) {
      const com = c.pins.find((x) => x.id === "COM");
      const contacts = c.pins.filter((x) => x.fn === "switch" && x.id !== "COM");
      const toCtrl = [com, ...contacts].filter((x) => x && controllerGpioOn(g.netOf.get(key(p, x.id))).length);
      if (!toCtrl.length) add({ severity: "warning", area: "electrical", code: "W_SWITCH_UNREAD", title: `${p.label.toUpperCase()} IS NOT READ BY THE CONTROLLER`, partUid: p.uid, pinId: contacts[0]?.id, explanation: "Wire COM to GND and NO to a digital pin with INPUT_PULLUP.", fix: "Connect the switch to a controller input." });
    }
  }
  return n;
}

function supplyOf(g: CircuitGraph, m: NetMember): number | null {
  const vinPin = m.comp.pins.find((x) => x.fn === "vin");
  if (!vinPin) return null;
  return g.netOf.get(key(m.part, vinPin.id))?.voltage ?? null;
}

function ruleBuses(g: CircuitGraph, add: (i: Issue) => void): number {
  let n = 0;
  const pairs: [string, string, string][] = [["i2c-sda", "i2c-sda", "SDA"], ["i2c-scl", "i2c-scl", "SCL"], ["spi-mosi", "spi-mosi", "MOSI"], ["spi-miso", "spi-miso", "MISO"], ["spi-sck", "spi-sck", "SCK"]];
  for (const net of g.nets) {
    const gpios = controllerGpioOn(net);
    for (const m of net.members.filter((x) => x.comp.kind !== "controller")) {
      for (const [fn, cap, name] of pairs) {
        if (m.pin.fn !== fn) continue;
        n++;
        if (!gpios.length) {
          add({ severity: "warning", area: "electrical", code: "W_BUS_UNCONNECTED", title: `${m.part.label.toUpperCase()} ${name} NOT CONNECTED`, partUid: m.part.uid, pinId: m.pin.id, explanation: `${name} must go to the controller's ${name} pin.`, fix: `Wire ${m.pin.label} to the controller ${name} pin.` });
          continue;
        }
        if (!gpios.some((gp) => has(gp.pin, cap))) {
          const swapped = fn.startsWith("i2c") && gpios.some((gp) => has(gp.pin, fn === "i2c-sda" ? "i2c-scl" : "i2c-sda"));
          add({ severity: "critical", area: "compatibility", code: swapped ? "E_I2C_SWAPPED" : "E_BUS_WRONG_PIN", title: swapped ? "SDA AND SCL ARE SWAPPED!" : `${name} IS ON THE WRONG PIN!`, partUid: m.part.uid, pinId: m.pin.id, incorrect: `${label(m)} → ${label(gpios[0])}`, explanation: `${name} is a hardware bus signal; it only works on the controller's dedicated ${name} pin${gpios[0].comp.board === "uno" ? " (Uno: SDA = A4, SCL = A5)" : ""}.`, fix: `Move it to the controller's ${name} pin.` });
        }
      }
      if (m.pin.fn === "uart-tx" || m.pin.fn === "uart-rx") {
        n++;
        if (!gpios.length) continue;
        const wantCap = m.pin.fn === "uart-tx" ? "uart-rx" : "uart-tx";
        if (gpios.some((gp) => has(gp.pin, m.pin.fn as never)) && !gpios.some((gp) => has(gp.pin, wantCap as never)))
          add({ severity: "critical", area: "compatibility", code: "E_UART_TX_TX", title: `${m.pin.fn === "uart-tx" ? "TX" : "RX"} IS CONNECTED TO ${m.pin.fn === "uart-tx" ? "TX" : "RX"}!`, partUid: m.part.uid, pinId: m.pin.id, incorrect: `${label(m)} → ${label(gpios[0])}`, explanation: "Serial lines cross over: the module's TX (transmit) must go to the controller's RX (receive), and RX to TX.", fix: "Swap the TX and RX wires." });
        else if (!gpios.some((gp) => has(gp.pin, wantCap as never)))
          add({ severity: "warning", area: "compatibility", code: "W_SOFTWARE_SERIAL", title: "SERIAL MODULE ON NON-UART PINS", partUid: m.part.uid, pinId: m.pin.id, incorrect: `${label(m)} → ${label(gpios[0])}`, explanation: "These pins are not the hardware serial port, so you would need SoftwareSerial (not supported by the BEAST interpreter).", fix: `Use the hardware ${wantCap === "uart-rx" ? "RX" : "TX"} pin (Uno D0/D1) for simulation.` });
        if (m.pin.fn === "uart-rx" && m.pin.tolerant5V === false && gpios.some((gp) => (gp.pin.logicV ?? 5) >= 4.5))
          add({ severity: "warning", area: "compatibility", code: "W_UART_LEVEL", title: "5 V TX INTO A 3.3 V RX PIN", partUid: m.part.uid, pinId: m.pin.id, incorrect: `${label(gpios[0])} (5 V) → ${label(m)} (3.3 V logic)`, explanation: "Many modules work like this for a while, but it exceeds the RX pin's rating.", fix: "Add a voltage divider (1 kΩ from TX, 2 kΩ to GND) on this line." });
      }
    }
  }
  return n;
}

function ruleCurrent(g: CircuitGraph, add: (i: Issue) => void): number {
  let n = 0;
  // motor stall vs driver peak
  for (const m of partsOf(g, (c) => c.kind === "dc-motor" && !!c.motor)) {
    n++;
    const c = g.comps.get(m.uid)!;
    const stall = Boolean(m.config.customParams) ? Number(m.config.stallCurrentA) : c.motor!.stallCurrentA;
    const out = c.pins.map((t) => g.netOf.get(key(m, t.id))?.members.find((x) => x.pin.fn === "motor-out")).find(Boolean);
    if (!out?.comp.driver) continue;
    if (stall > out.comp.driver.peakCurrentA)
      add({ severity: "warning", area: "compatibility", code: "W_DRIVER_CURRENT", title: "MOTOR CAN DRAW MORE THAN THE DRIVER ALLOWS", partUid: out.part.uid, incorrect: `${m.label} stall ≈${stall} A > ${out.comp.name} peak ${out.comp.driver.peakCurrentA} A.`, explanation: "At start-up, when stalled or when pushing (sumo!) the motor draws its stall current. The driver may overheat or shut down.", fix: "Choose a driver with a higher current rating or a smaller motor." });
    const vm = g.netOf.get(key(out.part, DRIVER_WIRING[out.comp.id]?.motorSupply ?? ""))?.voltage;
    const nominal = Boolean(m.config.customParams) ? Number(m.config.nominalVoltage) : c.motor!.nominalVoltage;
    if (vm && vm - (out.comp.driver.dropV ?? 0) > nominal * 1.5)
      add({ severity: "warning", area: "compatibility", code: "W_MOTOR_OVERVOLT", title: "MOTOR VOLTAGE TOO HIGH", partUid: m.uid, incorrect: `${m.label} is rated ${nominal} V but can receive ≈${(vm - out.comp.driver.dropV).toFixed(1)} V.`, explanation: "Over-volting a motor makes it faster but shortens its life dramatically and raises the stall current.", fix: "Limit the PWM duty in code, or use a lower-voltage supply." });
  }
  // servo on controller 5V, battery capability
  for (const s of partsOf(g, (c) => c.kind === "servo")) {
    n++;
    const net = g.netOf.get(key(s, "V+"));
    if (net?.sources.some((src) => g.comps.get(src.key.split(".")[0])?.kind === "controller"))
      add({ severity: "warning", area: "power", code: "W_SERVO_ON_5V_PIN", title: "SERVO POWERED FROM THE CONTROLLER'S 5V PIN", partUid: s.uid, pinId: "V+", explanation: "Servos draw hundreds of mA to several amps when moving; the controller's regulator can brown out and reset the board.", fix: "Power servos from a separate 5–6 V BEC/buck converter, with grounds shared." });
  }
  for (const b of partsOf(g, (c) => !!c.battery)) {
    n++;
    const c = g.comps.get(b.uid)!;
    const pack = batteryPack(c, b)!;
    const stallTotal = partsOf(g, (x) => x.kind === "dc-motor" && !!x.motor).reduce((a, m) => a + (g.comps.get(m.uid)!.motor!.stallCurrentA ?? 0), 0);
    if (stallTotal > pack.maxA * 1.2)
      add({ severity: "warning", area: "power", code: "W_BATTERY_CURRENT", title: "BATTERY CANNOT DELIVER THE MOTOR CURRENT", partUid: b.uid, incorrect: `Motors can draw ≈${stallTotal.toFixed(1)} A; ${b.label} is good for ≈${pack.maxA} A.`, explanation: "The voltage will sag heavily under load, causing resets and weak motors.", fix: "Use a higher-discharge battery (Li-ion/LiPo) instead." });
  }
  // LEDs without resistors
  for (const l of partsOf(g, (c) => c.kind === "led" && c.pins.some((p) => p.fn === "anode"))) {
    n++;
    const a = g.netOf.get(key(l, "A"));
    const k = g.netOf.get(key(l, "K"));
    if (!a || !k) continue;
    const driven = a.voltage != null || controllerGpioOn(a).length > 0;
    if (driven && k.isGround)
      add({ severity: a.voltage != null && a.voltage > 3.3 ? "critical" : "warning", area: "electrical", code: "E_LED_NO_RESISTOR", title: "LED HAS NO CURRENT-LIMITING RESISTOR!", partUid: l.uid, pinId: "A", explanation: "An LED's current rises steeply above its forward voltage. Without a resistor it (or the pin driving it) burns out.", fix: "Add a series resistor, e.g. 220–330 Ω at 5 V." });
  }
  return n;
}

function ruleSuggestions(g: CircuitGraph, add: (i: Issue) => void): number {
  const batteries = partsOf(g, (c) => !!c.battery);
  if (!batteries.length) return 1;
  const hasSwitch = g.parts.some((p) => g.comps.get(p.uid)!.kind === "switch" || /Emergency|Toggle|Rocker/.test(g.comps.get(p.uid)!.name));
  if (!hasSwitch) add({ severity: "suggestion", area: "power", code: "S_POWER_SWITCH", title: "ADD A POWER / EMERGENCY SWITCH", explanation: "Most competition rules require a way to cut power quickly, and it saves your battery between runs.", fix: "Put a toggle or emergency-stop switch in series with battery +." });
  const lithium = batteries.some((b) => /Li|LiPo|18650|21700|26650/.test(g.comps.get(b.uid)!.name));
  if (lithium && !g.parts.some((p) => /Fuse|Protection|BMS/.test(g.comps.get(p.uid)!.name)))
    add({ severity: "suggestion", area: "power", code: "S_FUSE", title: "PROTECT YOUR LITHIUM BATTERY", explanation: "Lithium packs can deliver huge short-circuit currents.", fix: "Add an inline fuse or a protection/BMS board." });
  for (const d of partsOf(g, (c) => c.id === "l298n")) {
    const vs = g.netOf.get(key(d, "VS"))?.voltage;
    if (vs && vs <= 8.5) add({ severity: "suggestion", area: "compatibility", code: "S_L298N_DROP", title: "YOUR L298N WASTES A LOT OF YOUR BATTERY VOLTAGE", partUid: d.uid, explanation: `The L298N's bipolar transistors drop ≈2 V, so of ${vs.toFixed(1)} V only ≈${(vs - 2).toFixed(1)} V reaches the motors.`, fix: "A MOSFET driver such as the TB6612FNG or DRV8833 loses only a few tenths of a volt." });
  }
  const enc = partsOf(g, (c) => c.sensor?.kind === "encoder");
  for (const e of enc) {
    const outPin = g.comps.get(e.uid)!.pins.find((p) => p.fn === "out-digital");
    const gp = outPin ? controllerGpioOn(g.netOf.get(key(e, outPin.id)))[0] : undefined;
    if (gp && !has(gp.pin, "interrupt")) add({ severity: "warning", area: "compatibility", code: "W_ENCODER_NO_INTERRUPT", title: "ENCODER IS NOT ON AN INTERRUPT PIN", partUid: e.uid, pinId: outPin!.id, explanation: "Encoder pulses are fast; polling with digitalRead() misses counts. Use attachInterrupt().", fix: "Use an interrupt pin (Uno: D2 or D3)." });
  }
  return 4;
}
