/**
 * Component recommendation engine.
 *
 * Judges a placed part against the rest of the robot with real numbers (supply voltage, motor stall and running
 * current, driver ratings and voltage drop, heat, logic levels, PWM pins) and puts it in exactly one category:
 *
 *   compatible          — works as wired
 *   compatible-limited  — works, but something is not ideal (losses, headroom, heat)
 *   needs-extra         — works only after adding something (heatsink, 5 V logic supply, BMS …)
 *   not-recommended     — will run, but is likely to cut out / overheat in normal use
 *   unsafe              — exceeds an absolute limit (over-voltage, far beyond current rating)
 *   unsupported         — the simulator cannot model this part yet
 *
 * "Not the best option" is never reported as "does not work". Better alternatives are searched in the whole
 * catalogue; when none fits, the student is told so and offered a custom component.
 */
import { allComponents, getComponent } from "@/lib/catalogue";
import type { ComponentRecord, PartInstance, Project } from "@/lib/types";
import { batteryPack, buildGraph, type CircuitGraph } from "./nets";
import { DRIVER_WIRING } from "@/lib/robot/drivers";
import { motorParams } from "@/lib/robot/model";
import { supportOf } from "@/lib/components/support";

export type Suitability = "compatible" | "compatible-limited" | "needs-extra" | "not-recommended" | "unsafe" | "unsupported";

export const SUITABILITY_INFO: Record<Suitability, { label: string; tone: "ok" | "info" | "warn" | "bad" }> = {
  compatible: { label: "COMPATIBLE", tone: "ok" },
  "compatible-limited": { label: "COMPATIBLE WITH LIMITATIONS", tone: "info" },
  "needs-extra": { label: "REQUIRES ADDITIONAL COMPONENTS", tone: "warn" },
  "not-recommended": { label: "NOT RECOMMENDED", tone: "warn" },
  unsafe: { label: "ELECTRICALLY UNSAFE", tone: "bad" },
  unsupported: { label: "UNSUPPORTED BY THE SIMULATOR", tone: "bad" },
};

export interface Check {
  label: string;
  ok: boolean | null; // null = information only
  detail: string;
}

export interface Alternative {
  id: string | null;
  name: string;
  why: string;
  /** usable in the simulator right now */
  available: boolean;
}

export interface Recommendation {
  partUid: string;
  componentId: string;
  name: string;
  label: string;
  category: Suitability;
  headline: string;
  summary: string;
  checks: Check[];
  extras: string[];
  alternatives: Alternative[];
  /** true when no catalogue part fits: offer "Create Custom Component" */
  offerCustom: boolean;
}

const RUN_FRACTION = 0.25; // typical driving load ≈ no-load + 25 % of the way to stall (estimate, stated in the UI)

interface MotorLoad {
  label: string;
  stallA: number;
  runA: number;
  nominalV: number;
}

function motorsOnDriver(g: CircuitGraph, d: PartInstance): Map<string, MotorLoad[]> {
  const res = new Map<string, MotorLoad[]>();
  const c = g.comps.get(d.uid)!;
  const wiring = DRIVER_WIRING[c.id];
  if (!wiring) return res;
  for (const ch of wiring.channels) {
    const list: MotorLoad[] = [];
    const seen = new Set<string>();
    for (const o of ch.outs)
      for (const m of g.netOf.get(`${d.uid}.${o}`)?.members ?? []) {
        if (m.pin.fn !== "motor-term" || seen.has(m.part.uid)) continue;
        seen.add(m.part.uid);
        const mp = motorParams(m.part, m.comp);
        if (!mp) continue;
        list.push({ label: m.part.label, stallA: mp.stallCurrentA, runA: mp.noLoadCurrentA + RUN_FRACTION * (mp.stallCurrentA - mp.noLoadCurrentA), nominalV: mp.nominalVoltage });
      }
    if (list.length) res.set(ch.name, list);
  }
  return res;
}

const fmt = (x: number, d = 1) => x.toFixed(d);

/** Drivers in the catalogue that would handle these loads, best first. */
function driverAlternatives(current: ComponentRecord, vMax: number, worstRunA: number, worstStallA: number, channelsNeeded: number): Alternative[] {
  const cands = allComponents().filter((x) => x.kind === "motor-driver" && x.driver && x.id !== current.id);
  const fits = cands.filter((x) => {
    const supply = DRIVER_WIRING[x.id] ? x.pins.find((p) => p.id === DRIVER_WIRING[x.id].motorSupply) : x.pins.find((p) => p.fn === "vin");
    const vOk = !supply?.vRange || vMax <= supply.vRange[1];
    return vOk && x.driver!.contCurrentA >= worstRunA && x.driver!.peakCurrentA >= worstStallA * 0.8 && x.driver!.dropV < current.driver!.dropV - 0.3;
  });
  // right-sized first: enough channels, about 2× headroom over the running current (not a 30 A board for TT motors),
  // then the smallest voltage drop. The TB6612FNG used in the club's reference designs wins ties.
  const fit = (x: ComponentRecord) =>
    (x.driver!.channels < channelsNeeded ? 2 : 0) + 0.5 * Math.abs(Math.log2(x.driver!.contCurrentA / Math.max(0.2, 2 * worstRunA))) + x.driver!.dropV - (x.id === "tb6612fng" ? 0.25 : 0);
  fits.sort((a, b) => fit(a) - fit(b));
  return fits.slice(0, 3).map((x) => {
    const avail = supportOf(x).level === "full";
    const two = x.driver!.channels < channelsNeeded ? ` (single channel — you would use ${channelsNeeded})` : "";
    return {
      id: x.id,
      name: x.name + two,
      available: avail,
      why: `${x.driver!.dropV < 1 ? "MOSFET bridge" : "Bridge"} dropping ≈${x.driver!.dropV} V instead of ≈${current.driver!.dropV} V, rated ${x.driver!.contCurrentA} A continuous / ${x.driver!.peakCurrentA} A peak per channel.`,
    };
  });
}

export function recommendDriver(project: Pick<Project, "parts" | "wires">, g: CircuitGraph, d: PartInstance): Recommendation {
  const c = g.comps.get(d.uid)!;
  const base = { partUid: d.uid, componentId: c.id, name: c.name, label: d.label };
  const support = supportOf(c);
  if (support.level !== "full" || !c.driver)
    return { ...base, category: "unsupported", headline: `${c.name} cannot be simulated yet.`, summary: support.summary, checks: [], extras: [], alternatives: support.alternative ? [{ id: support.alternative.id, name: support.alternative.name, why: "Fully simulated driver of the same family.", available: true }] : [], offerCustom: !support.alternative };

  const wiring = DRIVER_WIRING[c.id];
  const loads = motorsOnDriver(g, d);
  const supplyPin = c.pins.find((p) => p.id === wiring.motorSupply);
  const supplyNet = g.netOf.get(`${d.uid}.${wiring.motorSupply}`);
  const vNom = supplyNet?.voltage ?? null;
  const vMax = supplyNet?.vMax ?? vNom;
  const checks: Check[] = [];
  const extras: string[] = [];
  let worst = "compatible" as Suitability;
  const raise = (s: Suitability) => {
    const order: Suitability[] = ["compatible", "compatible-limited", "needs-extra", "not-recommended", "unsafe"];
    if (order.indexOf(s) > order.indexOf(worst)) worst = s;
  };

  // 1. supply voltage
  if (vNom === null || vMax === null) checks.push({ label: "Motor supply voltage", ok: null, detail: `${wiring.motorSupply} is not connected to a supply yet, so the voltage cannot be checked.` });
  else if (supplyPin?.vRange && vMax > supplyPin.vRange[1] + 0.05) {
    checks.push({ label: "Motor supply voltage", ok: false, detail: `Up to ${fmt(vMax)} V on ${wiring.motorSupply}; the absolute maximum is ${supplyPin.vRange[1]} V.` });
    raise("unsafe");
  } else if (supplyPin?.vRange && vNom < supplyPin.vRange[0] - 0.05) {
    checks.push({ label: "Motor supply voltage", ok: false, detail: `${fmt(vNom)} V is below the ${supplyPin.vRange[0]} V minimum: the bridge may not switch fully.` });
    raise("not-recommended");
  } else checks.push({ label: "Motor supply voltage", ok: true, detail: `${fmt(vNom)} V nominal (${fmt(vMax)} V fully charged) is within ${supplyPin?.vRange ? `${supplyPin.vRange[0]}–${supplyPin.vRange[1]} V` : "the rating"}.` });

  // 2. current per channel (parallel motors add up)
  let worstRun = 0, worstStall = 0, channelsUsed = 0;
  for (const [ch, list] of loads) {
    channelsUsed++;
    const run = list.reduce((a, m) => a + m.runA, 0);
    const stall = list.reduce((a, m) => a + m.stallA, 0);
    worstRun = Math.max(worstRun, run);
    worstStall = Math.max(worstStall, stall);
    const who = list.map((m) => m.label).join(" + ");
    const par = list.length > 1 ? ` (${list.length} motors in parallel — their currents add)` : "";
    if (stall > c.driver.peakCurrentA * 2) {
      checks.push({ label: `Channel ${ch} current`, ok: false, detail: `${who}${par}: stall ≈${fmt(stall)} A is more than twice the ${c.driver.peakCurrentA} A peak rating.` });
      raise("unsafe");
    } else if (run > c.driver.contCurrentA) {
      checks.push({ label: `Channel ${ch} current`, ok: false, detail: `${who}${par}: ≈${fmt(run)} A while driving (estimate) exceeds the ${c.driver.contCurrentA} A continuous rating.` });
      raise("not-recommended");
    } else if (stall > c.driver.peakCurrentA) {
      checks.push({ label: `Channel ${ch} current`, ok: false, detail: `${who}${par}: ≈${fmt(run)} A while driving is fine, but stall ≈${fmt(stall)} A exceeds the ${c.driver.peakCurrentA} A peak — it may cut out when the robot stalls or pushes.` });
      raise("compatible-limited");
    } else checks.push({ label: `Channel ${ch} current`, ok: true, detail: `${who}${par}: ≈${fmt(run)} A while driving, ≈${fmt(stall)} A at stall — within ${c.driver.contCurrentA} A continuous / ${c.driver.peakCurrentA} A peak.` });
  }
  if (!loads.size) checks.push({ label: "Motors", ok: null, detail: "No motor is connected to this driver's outputs yet." });

  // 3. voltage drop / efficiency and heat
  if (vNom) {
    const atMotor = Math.max(0, vNom - c.driver.dropV);
    const lostPct = (c.driver.dropV / vNom) * 100;
    const heatW = [...loads.values()].reduce((a, l) => a + c.driver!.dropV * l.reduce((s, m) => s + m.runA, 0), 0);
    checks.push({ label: "Voltage reaching the motors", ok: lostPct <= 20, detail: `≈${fmt(atMotor)} V of ${fmt(vNom)} V (${fmt(lostPct, 0)} % lost across the driver).` });
    if (lostPct > 20) raise("compatible-limited");
    if (heatW > 0) {
      checks.push({ label: "Heat in the driver", ok: heatW <= 4, detail: `≈${fmt(heatW)} W while driving (drop × current, estimate).` });
      if (heatW > 4) {
        raise("needs-extra");
        extras.push(`A heatsink (and airflow): about ${fmt(heatW)} W is turned into heat in the driver.`);
      }
    }
  }

  // 4. logic supply / PWM
  if (c.id === "l298n" && vMax !== null && vMax > 12.05) {
    raise("needs-extra");
    extras.push("Remove the 5V-regulator jumper and feed +5V from the controller or a buck converter (the on-board regulator is only rated up to 12 V).");
    checks.push({ label: "Logic supply", ok: false, detail: `VS reaches ${fmt(vMax)} V: above 12 V the on-board 5 V regulator must be disabled.` });
  } else if (wiring.logicSupply) {
    const lv = g.netOf.get(`${d.uid}.${wiring.logicSupply}`)?.voltage;
    checks.push({ label: "Logic supply", ok: lv != null, detail: lv != null ? `${wiring.logicSupply} receives ${fmt(lv)} V.` : `${wiring.logicSupply} needs a 3.3–5 V logic supply.` });
    if (lv == null) extras.push(`Connect ${wiring.logicSupply} to the controller's 5V (or 3.3V) pin.`);
  } else checks.push({ label: "Logic supply", ok: true, detail: c.id === "l298n" ? "Supplied by the on-board 5 V regulator (jumper fitted)." : "Taken from the motor supply." });

  const pwm = wiring.channels.flatMap((ch) => (loads.has(ch.name) ? ch.speedPins : []));
  if (pwm.length) {
    const ctrlPins = pwm.map((sp) => g.netOf.get(`${d.uid}.${sp}`)?.members.find((m) => m.comp.kind === "controller" && m.pin.fn === "gpio"));
    const bad = pwm.filter((_, i) => ctrlPins[i] && !(ctrlPins[i]!.pin.caps ?? []).includes("pwm"));
    checks.push({ label: "PWM speed control", ok: bad.length === 0, detail: bad.length ? `${bad.join(", ")} not on a PWM pin: speed cannot be varied.` : `Speed pins: ${pwm.join(", ")}${ctrlPins.some((x) => !x) ? " (some are not wired yet)" : " on PWM-capable pins"}.` });
  }

  // alternatives
  const alternatives = c.driver && loads.size ? driverAlternatives(c, vMax ?? vNom ?? 0, worstRun, worstStall, channelsUsed) : [];
  const offerCustom = worst !== "compatible" && worst !== "compatible-limited" && alternatives.filter((a) => a.available).length === 0;
  const best = alternatives.find((a) => a.available);

  const name = c.name.replace(/ Motor Driver.*$/i, "");
  let headline: string;
  let summary: string;
  switch (worst) {
    case "compatible":
    case "compatible-limited":
      headline = `GOOD NEWS! Your ${name} motor driver can work with this robot.`;
      summary = best
        ? `However, if you want better efficiency and less power loss, consider ${best.name}: ${best.why}${vNom ? ` Your motors would get ≈${fmt(Math.max(0, vNom - (getComponent(best.id!)?.driver?.dropV ?? 0)))} V instead of ≈${fmt(Math.max(0, vNom - c.driver.dropV))} V.` : ""}`
        : worst === "compatible" ? "It is a good match for these motors and this battery." : "It works; read the notes below for its limits.";
      break;
    case "needs-extra":
      headline = `Your ${name} can work with this robot — after adding a few things.`;
      summary = extras.join(" ");
      break;
    case "not-recommended":
      headline = `Your motors need more current than the ${name} can comfortably provide.`;
      summary = `It may run, but it will overheat or shut down in normal driving. We recommend a driver with a higher current rating${best ? ` such as the ${best.name}` : ""}.`;
      break;
    case "unsafe":
      headline = `Your ${name} cannot safely drive this robot.`;
      summary = `It is being pushed beyond an absolute limit (see the red checks). Choose a driver rated for this voltage and current${best ? `, e.g. the ${best.name}` : ""}.`;
      break;
    default:
      headline = name;
      summary = "";
  }
  return { ...base, category: worst, headline, summary, checks, extras, alternatives, offerCustom };
}

function recommendBattery(g: CircuitGraph, b: PartInstance): Recommendation {
  const c = g.comps.get(b.uid)!;
  const pack = batteryPack(c, b)!;
  const base = { partUid: b.uid, componentId: c.id, name: c.name, label: b.label };
  const checks: Check[] = [];
  const extras: string[] = [];
  let cat: Suitability = "compatible";
  const motors = g.parts.filter((p) => g.comps.get(p.uid)!.kind === "dc-motor").map((p) => motorParams(p, g.comps.get(p.uid)!)).filter((x): x is NonNullable<typeof x> => !!x);
  const stall = motors.reduce((a, m) => a + m.stallCurrentA, 0);
  const run = motors.reduce((a, m) => a + m.noLoadCurrentA + RUN_FRACTION * (m.stallCurrentA - m.noLoadCurrentA), 0);
  const wh = (pack.nominal * pack.capacity) / 1000;
  checks.push({ label: "Pack", ok: null, detail: `${pack.cells}S${pack.parallel ?? 1}P: ${fmt(pack.nominal)} V nominal, ${fmt(pack.max)} V full, ${pack.capacity} mAh, ${fmt(wh)} Wh.` });
  if (motors.length) {
    const vRated = Math.max(...motors.map((m) => m.nominalVoltage));
    const ok = pack.nominal <= vRated * 1.6 && pack.nominal >= vRated * 0.5;
    checks.push({ label: "Voltage for the motors", ok, detail: `Motors are rated ${vRated} V; the pack gives ${fmt(pack.nominal)} V (before driver losses).` });
    if (!ok) cat = pack.nominal > vRated * 1.6 ? "not-recommended" : "compatible-limited";
    if (Number.isFinite(pack.maxA)) {
      const okA = stall <= pack.maxA * 1.2;
      checks.push({ label: "Current capability", ok: okA, detail: `Motors draw ≈${fmt(run)} A driving / ≈${fmt(stall)} A at stall; the pack is good for ≈${fmt(pack.maxA)} A continuous.` });
      if (!okA) cat = "not-recommended";
    } else checks.push({ label: "Current capability", ok: null, detail: "Discharge rating not specified: check the C rating on the pack." });
    if (run > 0) checks.push({ label: "Estimated runtime", ok: null, detail: `≈${Math.round(((pack.capacity / 1000) * 0.8 / run) * 60)} min of continuous driving (80 % usable capacity, estimate).` });
  }
  if (c.battery?.cellCount && pack.cells >= 2 && !b.config.bms) {
    extras.push("A BMS / protection board rated for this pack (over-charge, over-discharge, over-current, balancing).");
    if (cat === "compatible") cat = "needs-extra";
  }
  const headline = cat === "compatible" ? `Your ${c.name} suits this robot.` : cat === "needs-extra" ? `Your ${c.name} can power this robot once it is protected.` : `Your ${c.name} is not a good match for these motors.`;
  return { ...base, category: cat, headline, summary: extras.join(" ") || (checks.find((x) => x.ok === false)?.detail ?? ""), checks, extras, alternatives: [], offerCustom: false };
}

/** Recommendation for one placed part (drivers and batteries get the full analysis, other parts their support status). */
export function recommendForPart(project: Pick<Project, "parts" | "wires">, partUid: string): Recommendation | null {
  const g = buildGraph(project);
  const p = g.parts.find((x) => x.uid === partUid) ?? project.parts.find((x) => x.uid === partUid);
  if (!p) return null;
  const c = g.comps.get(p.uid) ?? getComponent(p.componentId);
  if (!c) return null;
  if (c.kind === "motor-driver" && g.comps.has(p.uid)) return recommendDriver(project, g, p);
  if (c.battery && g.comps.has(p.uid)) return recommendBattery(g, p);
  const s = supportOf(c);
  const cat: Suitability = s.level === "unsupported" ? "unsupported" : s.level === "limited" ? "compatible-limited" : "compatible";
  return {
    partUid: p.uid, componentId: c.id, name: c.name, label: p.label, category: cat,
    headline: s.level === "full" ? `${c.name} is fully simulated.` : s.level === "limited" ? `${c.name} works in your design, with limited simulation.` : `${c.name} is not currently available in our simulator.`,
    summary: [s.summary, ...s.limits].join(" "),
    checks: [], extras: [],
    alternatives: s.alternative ? [{ id: s.alternative.id, name: s.alternative.name, why: "A fully simulated part of the same type.", available: true }] : [],
    offerCustom: s.level === "unsupported",
  };
}

export function recommendAll(project: Pick<Project, "parts" | "wires">): Recommendation[] {
  return project.parts.filter((p) => p.inCircuit).map((p) => recommendForPart(project, p.uid)).filter((r): r is Recommendation => !!r);
}
