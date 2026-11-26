/**
 * Automatic repair engine for validation issues.
 *
 * For an issue that can be fixed safely by rewiring or by changing a setting, `planRepair` returns a plan:
 * the ordered, explained steps the student watches (identify → disconnect → select pin → connect → test)
 * and `apply(project)`, which makes exactly those changes. The player animates the steps, applies the plan,
 * re-runs the validator and reports whether the issue is gone — nothing is changed silently.
 *
 * Issues that need a design decision (a motor straight on a GPIO needs a driver, an unsafe battery …) return
 * null: the student gets the explanation and the better-alternative panel instead.
 */
import type { PinDef, Project, ValidationIssue, Wire, WireColor } from "@/lib/types";
import { addPart, uid } from "@/lib/robot/assembly";
import { DRIVER_WIRING } from "@/lib/robot/drivers";
import { type CircuitGraph, type NetMember, buildGraph, isConnected, pinKey, type PinRef } from "./nets";
import { validateProject } from "./validate";

export type RepairStepKind = "identify" | "disconnect" | "select" | "connect" | "configure" | "add" | "test";

export interface RepairStep {
  kind: RepairStepKind;
  title: string;
  explanation: string;
  /** part / pin / wire to highlight in the schematic */
  partUid?: string;
  pins?: PinRef[];
  wireIds?: string[];
  /** wires drawn by a connect step (ids match the wires apply() adds) */
  newWires?: Wire[];
}

export interface RepairPlan {
  issueCode: string;
  /** mentor-style one-liner: what is wrong and that we will show the fix */
  intro: string;
  steps: RepairStep[];
  /** the wires removed and added, for the summary */
  removes: string[];
  adds: Wire[];
  /** one-line code reminder when the fix moves a pin the code uses */
  codeHint?: string;
  apply(project: Project): Project;
}

export function wireColorFor(a: Pick<PinDef, "fn">, b: Pick<PinDef, "fn">): WireColor {
  const fns = [a.fn, b.fn];
  if (fns.some((f) => f === "gnd" || f === "bat-")) return "black";
  if (fns.some((f) => f === "vin" || f === "vout" || f === "bat+")) return "red";
  if (fns.some((f) => f.startsWith("i2c") || f.startsWith("spi") || f.startsWith("uart"))) return "blue";
  if (fns.some((f) => f.startsWith("motor"))) return "orange";
  return "yellow";
}

const PREFER: Record<"pwm" | "digital" | "analog", number[]> = { pwm: [5, 6, 9, 10, 3, 11], digital: [7, 8, 4, 12, 2, 13], analog: [14, 15, 16, 17, 18, 19] };

interface Ctx {
  project: Project;
  g: CircuitGraph;
  taken: Set<string>;
}

const memberOf = (g: CircuitGraph, partUid: string, pinId: string): NetMember | undefined => g.netOf.get(`${partUid}.${pinId}`)?.members.find((m) => m.key === `${partUid}.${pinId}`);
const controller = (g: CircuitGraph) => g.parts.find((p) => g.comps.get(p.uid)!.kind === "controller");

/** Pin number the student's code already uses for a signal name (e.g. "#define ENA 5" or "const int IN1 = 7;"). */
function codePinFor(code: string, name: string): number | null {
  const n = name.replace(/[^A-Za-z0-9_]/g, "");
  const re = new RegExp(`(?:#define\\s+${n}(?:_PIN)?\\s+(\\d+))|(?:int\\s+${n}(?:_PIN)?\\s*=\\s*(\\d+))`, "i");
  const m = re.exec(code);
  return m ? Number(m[1] ?? m[2]) : null;
}

/** A free controller pin with the needed capability (preferring the pin the code expects). */
function freeGpio(ctx: Ctx, need: "pwm" | "digital" | "analog", signal?: string): NetMember | null {
  const ctrl = controller(ctx.g);
  if (!ctrl) return null;
  const comp = ctx.g.comps.get(ctrl.uid)!;
  const cands = comp.pins.filter((p) => {
    if (p.fn !== "gpio" || p.arduinoPin === undefined) return false;
    if (p.arduinoPin === 0 || p.arduinoPin === 1) return false;
    const caps = p.caps ?? [];
    if (need === "pwm" && !caps.includes("pwm")) return false;
    if (need === "analog" && !caps.includes("analog")) return false;
    if (need !== "analog" && (caps.includes("analog-only") || caps.includes("input-only"))) return false;
    const key = `${ctrl.uid}.${p.id}`;
    return !ctx.taken.has(key) && !isConnected(ctx.g, key);
  });
  if (!cands.length) return null;
  const wanted = signal ? codePinFor(ctx.project.code ?? "", signal) : null;
  const pref = PREFER[need];
  const rank = (p: PinDef) => {
    if (wanted !== null && p.arduinoPin === wanted) return -100;
    const i = pref.indexOf(p.arduinoPin!);
    const keepPwmFree = need === "digital" && (p.caps ?? []).includes("pwm") ? 20 : 0;
    const analogLast = need !== "analog" && (p.caps ?? []).includes("analog") ? 40 : 0;
    return (i === -1 ? 10 + p.arduinoPin! / 100 : i) + keepPwmFree + analogLast;
  };
  const best = [...cands].sort((a, b) => rank(a) - rank(b))[0];
  ctx.taken.add(`${ctrl.uid}.${best.id}`);
  return memberOf(ctx.g, ctrl.uid, best.id) ?? null;
}

/** A pin on system ground: the controller's grounded GND if there is one, else battery −. */
function groundPin(ctx: Ctx, exceptPart?: string): NetMember | null {
  const ctrl = controller(ctx.g);
  if (ctrl && ctrl.uid !== exceptPart) {
    const gp = ctx.g.comps.get(ctrl.uid)!.pins.filter((p) => p.fn === "gnd").map((p) => memberOf(ctx.g, ctrl.uid, p.id)!);
    const grounded = gp.filter((m) => ctx.g.netOf.get(m.key)?.isGround);
    if (grounded.length) return grounded.find((m) => !isConnected(ctx.g, m.key)) ?? grounded[0];
  }
  for (const n of ctx.g.nets) {
    if (!n.isGround) continue;
    const bat = n.members.find((m) => m.pin.fn === "bat-");
    if (bat) return bat;
  }
  return null;
}

/** A pin that carries a supply within [lo, hi] volts (full-charge voltage must not exceed hi). */
function supplyPin(ctx: Ctx, lo: number, hi: number, preferRail: boolean, exceptPart?: string): NetMember | null {
  const cands: { m: NetMember; score: number }[] = [];
  for (const n of ctx.g.nets) {
    if (n.isGround || n.voltage === null) continue;
    const vmax = n.vMax ?? n.voltage;
    if (n.voltage < lo - 0.05 || vmax > hi + 0.05) continue;
    for (const m of n.members) {
      if (m.part.uid === exceptPart) continue;
      const isRail = m.comp.kind === "controller" && m.pin.fn === "vout";
      const isBat = m.pin.fn === "bat+";
      const afterSwitch = n.members.some((x) => x.pin.fn === "switch");
      if (!isRail && !isBat && !(afterSwitch && m.pin.fn === "switch")) continue;
      let score = 0;
      if (preferRail && isRail) score += 10;
      if (!preferRail && afterSwitch && m.pin.fn === "switch") score += 8; // stay behind the power switch
      if (!preferRail && isBat) score += 5;
      if (m.pin.id === "5V") score += 2;
      cands.push({ m, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  return cands[0]?.m ?? null;
}

const label = (m: { part: { label: string }; pin: { label: string } }) => `${m.part.label} ${m.pin.label}`;
const gpioName = (m: NetMember) => (m.pin.arduinoPin !== undefined && m.pin.arduinoPin >= 14 && m.comp.board && ["uno", "nano"].includes(m.comp.board) ? `A${m.pin.arduinoPin - 14}` : `${m.pin.arduinoPin}`);

function mkWire(a: NetMember, b: NetMember): Wire {
  return { id: uid("w"), from: { part: a.part.uid, pin: a.pin.id }, to: { part: b.part.uid, pin: b.pin.id }, color: wireColorFor(a.pin, b.pin) };
}

/** Wires that touch a pin directly. */
const wiresAt = (p: Project, key: string) => p.wires.filter((w) => pinKey(w.from) === key || pinKey(w.to) === key);

function build(issue: ValidationIssue, intro: string, parts: { removes?: Wire[]; adds?: Wire[]; configure?: { partUid: string; key: string; value: boolean | number | string; text: string }[]; addPart?: { componentId: string; label: string; near: string }; identify: RepairStep; select?: RepairStep; connectText: string; codeHint?: string }): RepairPlan {
  const steps: RepairStep[] = [parts.identify];
  const removes = parts.removes ?? [];
  const adds = parts.adds ?? [];
  if (removes.length)
    steps.push({ kind: "disconnect", title: removes.length > 1 ? "Disconnect the incorrect wires" : "Disconnect the incorrect wire", explanation: `We remove ${removes.length > 1 ? "these wires" : "this wire"} because ${removes.length > 1 ? "they connect" : "it connects"} the wrong pins.`, wireIds: removes.map((w) => w.id), pins: removes.flatMap((w) => [w.from, w.to]) });
  for (const c of parts.configure ?? []) steps.push({ kind: "configure", title: "Change a setting", explanation: c.text, partUid: c.partUid });
  if (parts.select) steps.push(parts.select);
  if (adds.length) steps.push({ kind: "connect", title: adds.length > 1 ? "Connect the new wires" : "Connect the new wire", explanation: parts.connectText, newWires: adds, pins: adds.flatMap((w) => [w.from, w.to]) });
  steps.push({ kind: "test", title: "Test the circuit", explanation: "We run the validator again on the repaired circuit to confirm the problem is gone." });
  return {
    issueCode: issue.code,
    intro,
    steps,
    removes: removes.map((w) => w.id),
    adds,
    codeHint: parts.codeHint,
    apply(project: Project): Project {
      let p: Project = { ...project, wires: project.wires.filter((w) => !removes.some((r) => r.id === w.id)) };
      for (const c of parts.configure ?? []) p = { ...p, parts: p.parts.map((x) => (x.uid === c.partUid ? { ...x, config: { ...x.config, [c.key]: c.value } } : x)) };
      p = { ...p, wires: [...p.wires, ...adds.map((w) => ({ ...w }))], codeCheck: p.codeCheck ? { ...p.codeCheck, ok: false } : null };
      return p;
    },
  };
}

/** Disconnect-step wording that names the wire's ends. */
function describeRemoves(project: Project, wires: Wire[], why: string): string {
  const nm = (r: PinRef) => `${project.parts.find((p) => p.uid === r.part)?.label ?? "?"}.${r.pin}`;
  return `${wires.map((w) => `${nm(w.from)} → ${nm(w.to)}`).join(", ")}: ${why}`;
}

export function planRepair(project: Project, issue: ValidationIssue): RepairPlan | null {
  const g = buildGraph(project);
  const ctx: Ctx = { project, g, taken: new Set() };
  const part = issue.partUid ? g.parts.find((p) => p.uid === issue.partUid) : undefined;
  const comp = part ? g.comps.get(part.uid) : undefined;
  const target = part && issue.pinId ? memberOf(g, part.uid, issue.pinId) : undefined;
  const identify = (text: string): RepairStep => ({ kind: "identify", title: "Identify the issue", explanation: text, partUid: part?.uid, pins: target ? [{ part: target.part.uid, pin: target.pin.id }] : [] });
  const select = (m: NetMember, text: string): RepairStep => ({ kind: "select", title: "Select the correct pin", explanation: text, partUid: m.part.uid, pins: [{ part: m.part.uid, pin: m.pin.id }] });
  const withRemoveText = (plan: RepairPlan | null, why: string) => {
    if (plan) for (const s of plan.steps) if (s.kind === "disconnect") s.explanation = describeRemoves(project, project.wires.filter((w) => s.wireIds?.includes(w.id)), why);
    return plan;
  };

  switch (issue.code) {
    // ── motor driver enable / speed pins ──
    case "E_DRIVER_EN_UNCONNECTED": {
      if (!part || !comp || !target) return null;
      const wiring = DRIVER_WIRING[comp.id];
      const ch = wiring?.channels.find((c) => c.en === target.pin.id);
      if (ch) {
        const gp = freeGpio(ctx, "pwm", target.pin.id);
        if (!gp) return null;
        const motor = ch.name;
        return build(issue, `Your motor driver is not receiving an enable signal on ${target.pin.label}. Let me show you how to fix it.`, {
          identify: identify(`${part.label} ${target.pin.label} controls the speed of motor ${motor}. It is not connected and its jumper is removed, so channel ${motor} can never switch on.`),
          select: select(gp, `Arduino pin ${gpioName(gp)} can produce PWM (the ~ mark on the board), so analogWrite() on it sets the motor speed.`),
          adds: [mkWire(gp, target)],
          connectText: `Your ${comp.name.replace(/ .*/, "")} motor driver's ${target.pin.label} pin controls the speed of motor ${motor}. Without an enable signal, the motor channel cannot operate. We are connecting ${target.pin.label} to Arduino PWM pin ${gpioName(gp)} so that you can control the motor speed.`,
          codeHint: `#define ${target.pin.id} ${gpioName(gp)}   // then analogWrite(${target.pin.id}, 0…255) sets the speed`,
        });
      }
      // BTS7960-style R_EN / L_EN: tie HIGH from the 5 V rail
      const rail = supplyPin(ctx, 3, 5.5, true, part.uid);
      if (!rail) return null;
      return build(issue, `${target.pin.label} is floating, so that half of the bridge stays off. Let me show you how to fix it.`, {
        identify: identify(`${target.pin.label} must be HIGH for the motor to run.`),
        select: select(rail, `${label(rail)} is a steady 5 V logic supply.`),
        adds: [mkWire(rail, target)],
        connectText: `We tie ${target.pin.label} to ${label(rail)} so the half-bridge is always enabled.`,
      });
    }
    case "E_PWM_ASSIGNMENT": {
      if (!part || !target) return null;
      const removes = wiresAt(project, target.key);
      const gp = freeGpio(ctx, "pwm", target.pin.id);
      if (!gp || !removes.length) return null;
      return withRemoveText(
        build(issue, `${target.pin.label} sets the motor speed, but it is on a pin that cannot make PWM. Let me show you how to fix it.`, {
          identify: identify(`${target.pin.label} needs a PWM signal (analogWrite). Its controller pin can only be fully ON or OFF.`),
          removes,
          select: select(gp, `Pin ${gpioName(gp)} is free and PWM-capable.`),
          adds: [mkWire(gp, target)],
          connectText: `We move ${target.pin.label} to PWM pin ${gpioName(gp)}: analogWrite() now changes the motor speed smoothly.`,
          codeHint: `#define ${target.pin.id} ${gpioName(gp)}`,
        }),
        "this pin has no PWM.",
      );
    }
    case "E_DRIVER_INPUT_UNCONNECTED":
    case "E_TRIG_UNCONNECTED": {
      if (!part || !target) return null;
      const gp = freeGpio(ctx, "digital", target.pin.id);
      if (!gp) return null;
      const isTrig = issue.code === "E_TRIG_UNCONNECTED";
      return build(issue, `${part.label} ${target.pin.label} is not connected to your controller. Let me show you how to fix it.`, {
        identify: identify(isTrig ? "The ultrasonic sensor only measures when the controller sends a short pulse on TRIG." : `${target.pin.label} sets the direction of its motor channel. A floating input makes the motor behave randomly.`),
        select: select(gp, `Digital pin ${gpioName(gp)} is free (PWM pins are kept for speed signals).`),
        adds: [mkWire(gp, target)],
        connectText: `We connect ${target.pin.label} to pin ${gpioName(gp)} so your code can set it with ${isTrig ? "digitalWrite() pulses" : "digitalWrite(HIGH/LOW)"}.`,
        codeHint: `#define ${target.pin.id} ${gpioName(gp)}`,
      });
    }
    case "E_STBY_FLOATING": {
      if (!part || !target) return null;
      const rail = supplyPin(ctx, 2.7, 5.5, true, part.uid);
      if (!rail) return null;
      return build(issue, "The TB6612FNG is in standby, so no motor can move. Let me show you how to fix it.", {
        identify: identify("STBY LOW (or floating) keeps the whole driver asleep."),
        select: select(rail, `${label(rail)} provides a steady HIGH level.`),
        adds: [mkWire(rail, target)],
        connectText: `We tie STBY to ${label(rail)} so the driver is always awake.`,
      });
    }

    // ── grounds and supplies ──
    case "E_NO_COMMON_GROUND":
    case "E_MISSING_GROUND": {
      if (!part || !target) return null;
      const gnd = groundPin(ctx, part.uid);
      if (!gnd) return null;
      return build(issue, `${part.label} has no ${issue.code === "E_NO_COMMON_GROUND" ? "common " : ""}ground. Let me show you how to fix it.`, {
        identify: identify(issue.code === "E_NO_COMMON_GROUND" ? `${part.label} and the controller do not share 0 V, so a HIGH signal from the controller means nothing to it.` : `Current cannot return to the battery from ${part.label}.`),
        select: select(gnd, `${label(gnd)} is on system ground (battery −).`),
        adds: [mkWire(target, gnd)],
        connectText: `We connect ${part.label} ${target.pin.label} to ${label(gnd)}: every part now shares the same 0 V reference.`,
      });
    }
    case "E_MISSING_POWER":
    case "E_NO_POWER": {
      if (!part || !comp) return null;
      const pinId = issue.pinId ?? comp.pins.find((p) => p.fn === "vin")?.id;
      const t = pinId ? memberOf(g, part.uid, pinId) : undefined;
      if (!t?.pin.vRange) return null;
      const isMotorSupply = comp.kind === "motor-driver" && DRIVER_WIRING[comp.id]?.motorSupply === t.pin.id;
      const lo = t.pin.vRange[0], hi = comp.kind === "controller" ? Math.min(t.pin.vRange[1], 12.6) : t.pin.vRange[1];
      const src = supplyPin(ctx, lo, hi, !isMotorSupply && hi <= 6, part.uid);
      if (!src) return null;
      return build(issue, `${part.label} ${t.pin.label} has no power. Let me show you how to fix it.`, {
        identify: { kind: "identify", title: "Identify the issue", explanation: `${t.pin.label} needs ${lo}–${t.pin.vRange[1]} V and nothing supplies it.`, partUid: part.uid, pins: [{ part: part.uid, pin: t.pin.id }] },
        select: select(src, `${label(src)} carries ${(g.netOf.get(src.key)?.voltage ?? 0).toFixed(1)} V (up to ${(g.netOf.get(src.key)?.vMax ?? 0).toFixed(1)} V fully charged) — inside the allowed range.`),
        adds: [mkWire(src, t)],
        connectText: `We connect ${t.pin.label} to ${label(src)}.`,
      });
    }
    case "E_L298N_NO_LOGIC":
    case "E_L298N_JUMPER_OVERVOLT": {
      if (!part || !comp) return null;
      const t = memberOf(g, part.uid, "5V");
      const ctrl = controller(g);
      const rail = ctrl ? memberOf(g, ctrl.uid, "5V") : undefined;
      if (!t || !rail || !g.powered.has(ctrl!.uid)) return null;
      // the controller must not itself be powered from this L298N's regulator
      if (g.netOf.get(rail.key) === g.netOf.get(t.key) && issue.code === "E_L298N_JUMPER_OVERVOLT") return null;
      return build(issue, issue.code === "E_L298N_NO_LOGIC" ? "The L298N's logic has no 5 V, so it ignores IN1–IN4. Let me show you how to fix it." : "The L298N's on-board regulator would overheat at this voltage. Let me show you how to fix it.", {
        identify: identify(issue.code === "E_L298N_NO_LOGIC" ? "Without the regulator jumper (or with too little VS for it) the +5V pin must be FED 5 V." : "Above 12 V the 78M05 regulator on the module overheats. It has to be switched off with the jumper."),
        configure: Boolean(part.config.regJumper ?? true) ? [{ partUid: part.uid, key: "regJumper", value: false, text: "Remove the 5V-regulator jumper: the +5V pin becomes a 5 V INPUT." }] : [],
        select: select(rail, `${label(rail)} supplies a regulated 5 V.`),
        adds: [mkWire(rail, t)],
        connectText: `We feed the L298N logic from ${label(rail)}.`,
      });
    }
    case "W_EN_JUMPER_AND_WIRE": {
      if (!part || !target) return null;
      const key = target.pin.id === "ENA" ? "enaJumper" : "enbJumper";
      return build(issue, `The ${target.pin.id} jumper is still fitted, so your PWM fights a fixed 5 V. Let me show you how to fix it.`, {
        identify: identify(`${target.pin.id} is wired to the controller AND held HIGH by the jumper.`),
        configure: [{ partUid: part.uid, key, value: false, text: `Remove the ${target.pin.id} jumper so the controller's PWM sets the speed.` }],
        connectText: "",
      });
    }
    case "E_REVERSE_POLARITY": {
      if (!part || !comp || !target) return null;
      const gndPin = comp.pins.find((p) => p.fn === "gnd");
      if (!gndPin) return null;
      const gKey = `${part.uid}.${gndPin.id}`;
      const onSupply = wiresAt(project, target.key), onGnd = wiresAt(project, gKey);
      if (!onSupply.length || !onGnd.length) return null;
      const other = (w: Wire, key: string) => (pinKey(w.from) === key ? w.to : w.from);
      const gm = memberOf(g, part.uid, gndPin.id)!;
      const adds: Wire[] = [
        ...onSupply.map((w) => { const o = other(w, target.key); const om = memberOf(g, o.part, o.pin)!; return mkWire(om, gm); }),
        ...onGnd.map((w) => { const o = other(w, gKey); const om = memberOf(g, o.part, o.pin)!; return mkWire(om, target); }),
      ];
      return withRemoveText(
        build(issue, `${part.label} is wired backwards. Let me show you how to fix it.`, {
          identify: identify(`${target.pin.label} is on ground and GND is on the positive supply: current would flow backwards through ${part.label}.`),
          removes: [...onSupply, ...onGnd],
          adds,
          connectText: `We swap the two power wires: positive to ${target.pin.label}, ground to ${gndPin.label}.`,
        }),
        "the polarity is reversed.",
      );
    }
    case "E_SHORT_CIRCUIT":
    case "E_GPIO_ON_SUPPLY": {
      // find the single wire whose removal clears the fault
      const net = issue.wireId ? g.netOf.get(pinKey(project.wires.find((w) => w.id === issue.wireId)?.from ?? { part: "", pin: "" })) : target ? g.netOf.get(target.key) : undefined;
      const cands = net ? net.wires : project.wires;
      const culprit = cands.find((w) => {
        const p2 = { ...project, wires: project.wires.filter((x) => x.id !== w.id) };
        return !validateProject(p2).issues.some((i) => i.code === issue.code && (i.partUid === issue.partUid || issue.code === "E_SHORT_CIRCUIT"));
      });
      if (!culprit) return null;
      return withRemoveText(
        build(issue, issue.code === "E_SHORT_CIRCUIT" ? "There is a short circuit: the battery's + is connected straight to −. Let me show you where." : "A controller pin is wired straight to a power supply. Let me show you where.", {
          identify: { kind: "identify", title: "Identify the issue", explanation: issue.code === "E_SHORT_CIRCUIT" ? "A supply joined directly to ground has nothing to limit the current — a lithium battery can deliver tens of amps, melting wires." : "A GPIO on a supply rail is damaged as soon as it is driven LOW, or by any voltage above its logic level.", partUid: issue.partUid, wireIds: [culprit.id], pins: [culprit.from, culprit.to] },
          removes: [culprit],
          connectText: "",
        }),
        issue.code === "E_SHORT_CIRCUIT" ? "this wire joins the supply directly to ground." : "this wire puts a controller pin on a power rail.",
      );
    }
    case "E_MOTOR_UNCONNECTED": {
      if (!part || !comp) return null;
      // one terminal already on a driver channel: complete that channel with its sibling output
      const termPins = comp.pins.filter((p) => p.fn === "motor-term");
      for (const tp of termPins) {
        const out = g.netOf.get(`${part.uid}.${tp.id}`)?.members.find((m) => m.pin.fn === "motor-out");
        const wiring = out && DRIVER_WIRING[out.comp.id];
        const ch = wiring?.channels.find((c) => c.outs.includes(out!.pin.id));
        const otherTerm = termPins.find((x) => x.id !== tp.id);
        if (!out || !ch || !otherTerm || isConnected(g, `${part.uid}.${otherTerm.id}`)) continue;
        const sib = memberOf(g, out.part.uid, ch.outs.find((o) => o !== out.pin.id)!)!;
        const t2 = memberOf(g, part.uid, otherTerm.id)!;
        return build(issue, `${part.label} has only one wire. Let me show you how to fix it.`, {
          identify: { kind: "identify", title: "Identify the issue", explanation: `${tp.label} is on ${out.part.label} ${out.pin.label}, but ${otherTerm.label} goes nowhere: no current can flow through the motor.`, partUid: part.uid, pins: [{ part: part.uid, pin: otherTerm.id }] },
          select: select(sib, `${sib.pin.label} is the other output of channel ${ch.name} — the H-bridge drives the motor between ${ch.outs.join(" and ")}.`),
          adds: [mkWire(sib, t2)],
          connectText: `We connect ${otherTerm.label} to ${sib.pin.label}: channel ${ch.name} can now push current through the motor in either direction.`,
        });
      }
      // a driver channel with no motor yet
      for (const d of g.parts) {
        const dc = g.comps.get(d.uid)!;
        const wiring = DRIVER_WIRING[dc.id];
        if (!wiring) continue;
        for (const ch of wiring.channels) {
          const free = ch.outs.every((o) => !g.netOf.get(`${d.uid}.${o}`)?.members.some((m) => m.pin.fn === "motor-term"));
          if (!free) continue;
          const terms = comp.pins.filter((p) => p.fn === "motor-term");
          if (terms.length < 2) return null;
          const o1 = memberOf(g, d.uid, ch.outs[0])!, o2 = memberOf(g, d.uid, ch.outs[1])!;
          const t1 = memberOf(g, part.uid, terms[0].id)!, t2 = memberOf(g, part.uid, terms[1].id)!;
          const removes = [...wiresAt(project, t1.key), ...wiresAt(project, t2.key)];
          return withRemoveText(
            build(issue, `${part.label} is not connected to a motor driver. Let me show you how to fix it.`, {
              identify: identify(`A DC motor needs both terminals on one driver channel so the driver can reverse it.`),
              removes,
              select: { kind: "select", title: "Select the correct pins", explanation: `Channel ${ch.name} of ${d.label} (${ch.outs.join(" / ")}) is free.`, partUid: d.uid, pins: [{ part: d.uid, pin: o1.pin.id }, { part: d.uid, pin: o2.pin.id }] },
              adds: [mkWire(o1, t1), mkWire(o2, t2)],
              connectText: `We connect ${terms[0].label} to ${ch.outs[0]} and ${terms[1].label} to ${ch.outs[1]}: channel ${ch.name} now drives ${part.label} forwards and backwards.`,
            }),
            "only one terminal was connected.",
          );
        }
      }
      return null;
    }
    case "E_ANALOG_ON_DIGITAL": {
      if (!part || !target) return null;
      const removes = wiresAt(project, target.key);
      const gp = freeGpio(ctx, "analog", target.pin.id);
      if (!gp) return null;
      return withRemoveText(
        build(issue, `${part.label} gives a varying voltage, but it is on a pin that can only read HIGH/LOW. Let me show you how to fix it.`, {
          identify: identify("An analog sensor must be read with analogRead() on a pin that has an ADC."),
          removes,
          select: select(gp, `${gp.pin.label} has an analog-to-digital converter.`),
          adds: [mkWire(target, gp)],
          connectText: `We move the sensor output to ${gp.pin.label}; read it with analogRead(${gp.pin.label}).`,
          codeHint: `analogRead(${gp.pin.label})`,
        }),
        "that pin has no ADC.",
      );
    }
    case "E_I2C_SWAPPED":
    case "E_UART_TX_TX": {
      if (!part || !comp) return null;
      const pairs = issue.code === "E_I2C_SWAPPED" ? [["i2c-sda", "i2c-sda"], ["i2c-scl", "i2c-scl"]] : [["uart-tx", "uart-rx"], ["uart-rx", "uart-tx"]];
      const ctrl = controller(g);
      if (!ctrl) return null;
      const cc = g.comps.get(ctrl.uid)!;
      const removes: Wire[] = [];
      const adds: Wire[] = [];
      for (const [fn, cap] of pairs) {
        const mp = comp.pins.find((p) => p.fn === fn);
        const cp = cc.pins.find((p) => (p.caps ?? []).includes(cap as never));
        if (!mp || !cp) return null;
        const mk = `${part.uid}.${mp.id}`;
        removes.push(...wiresAt(project, mk).filter((w) => w.from.part === ctrl.uid || w.to.part === ctrl.uid));
        adds.push(mkWire(memberOf(g, part.uid, mp.id)!, memberOf(g, ctrl.uid, cp.id)!));
      }
      return withRemoveText(
        build(issue, issue.code === "E_I2C_SWAPPED" ? "SDA and SCL are swapped. Let me show you how to fix it." : "TX is connected to TX. Let me show you how to fix it.", {
          identify: identify(issue.code === "E_I2C_SWAPPED" ? "SDA carries data and SCL the clock: each must go to the controller pin with the same name." : "Serial lines cross over: one side's transmit (TX) goes to the other's receive (RX)."),
          removes,
          adds,
          connectText: issue.code === "E_I2C_SWAPPED" ? "We connect SDA→SDA and SCL→SCL." : "We cross the lines: module TX → controller RX, module RX → controller TX.",
        }),
        "the lines are swapped.",
      );
    }
    case "E_LED_NO_RESISTOR": {
      if (!part || !comp) return null;
      const aKey = `${part.uid}.A`;
      const removes = wiresAt(project, aKey);
      if (!removes.length) return null;
      const w0 = removes[0];
      const src = pinKey(w0.from) === aKey ? w0.to : w0.from;
      const srcM = memberOf(g, src.part, src.pin);
      if (!srcM) return null;
      const r = addPart({ ...project, parts: [] } as Project, "220-resistor", { label: `R_${part.label}` } as never).part;
      if (!r) return null;
      const rUid = r.uid;
      const rw1: Wire = { id: uid("w"), from: { part: srcM.part.uid, pin: srcM.pin.id }, to: { part: rUid, pin: "1" }, color: "yellow" };
      const rw2: Wire = { id: uid("w"), from: { part: rUid, pin: "2" }, to: { part: part.uid, pin: "A" }, color: "yellow" };
      const v = g.netOf.get(srcM.key)?.voltage ?? 5;
      const plan = build(issue, "Your LED has no current-limiting resistor. Let me show you how to fix it.", {
        identify: identify("An LED's current rises steeply once its forward voltage is reached. Without a resistor it (or the pin driving it) burns out."),
        removes,
        adds: [rw1, rw2],
        connectText: `We add a 220 Ω resistor in series: I = (${v.toFixed(1)} V − ≈2 V) ÷ 220 Ω ≈ ${(((v - 2) / 220) * 1000).toFixed(0)} mA, a safe LED current.`,
      });
      plan.steps.splice(plan.steps.findIndex((s) => s.kind === "connect"), 0, { kind: "add", title: "Add a 220 Ω resistor", explanation: "R = (V supply − V forward) ÷ I. For 5 V and a red LED: (5 − 2) ÷ 0.015 ≈ 200 Ω → the nearest standard value 220 Ω.", partUid: part.uid });
      const base = plan.apply;
      plan.apply = (project0: Project) => {
        const led = project0.parts.find((x) => x.uid === part.uid)!;
        const placed = { ...r, uid: rUid, inCircuit: true, schematic: { x: led.schematic.x - 200, y: led.schematic.y + 10 } };
        return base({ ...project0, parts: [...project0.parts, placed] });
      };
      return withRemoveText(plan, "the LED is fed directly.");
    }
    case "W_PACK_NO_BMS": {
      if (!part) return null;
      return build(issue, "Your multi-cell lithium pack has no protection. Let me show you what to add.", {
        identify: identify("Cells in series drift apart; without a BMS one cell can be over-charged or over-discharged, and a short has nothing to stop it."),
        configure: [{ partUid: part.uid, key: "bms", value: true, text: "Fit a BMS / protection board rated for this pack's series count and current (set in the pack's options)." }],
        connectText: "",
      });
    }
    default:
      return null;
  }
}

/** Codes the engine can repair (used to show / hide the FIX IT button without building a plan). */
export const REPAIRABLE = new Set([
  "E_DRIVER_EN_UNCONNECTED", "E_PWM_ASSIGNMENT", "E_DRIVER_INPUT_UNCONNECTED", "E_TRIG_UNCONNECTED", "E_STBY_FLOATING",
  "E_NO_COMMON_GROUND", "E_MISSING_GROUND", "E_MISSING_POWER", "E_NO_POWER", "E_L298N_NO_LOGIC", "E_L298N_JUMPER_OVERVOLT",
  "W_EN_JUMPER_AND_WIRE", "E_REVERSE_POLARITY", "E_SHORT_CIRCUIT", "E_GPIO_ON_SUPPLY", "E_MOTOR_UNCONNECTED",
  "E_ANALOG_ON_DIGITAL", "E_I2C_SWAPPED", "E_UART_TX_TX", "E_LED_NO_RESISTOR", "W_PACK_NO_BMS",
]);

/** Apply a plan and check the result: is the same issue (code + part + pin) gone? */
export function applyAndVerify(project: Project, issue: ValidationIssue, plan: RepairPlan) {
  const after = plan.apply(project);
  const report = validateProject(after);
  const still = report.issues.find((i) => i.code === issue.code && i.partUid === issue.partUid && (i.pinId ?? null) === (issue.pinId ?? null));
  return { project: after, report, resolved: !still, remaining: still ?? null };
}
