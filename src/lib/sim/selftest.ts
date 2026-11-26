/**
 * Functional self-test for one catalogue component: builds the smallest real circuit that exercises it
 * (battery, Arduino Uno, the part, wires), runs it through the same circuit graph, electrical bridge, DC solver,
 * interpreter and bench the students use, and checks that the part BEHAVES — not that it renders.
 *
 *   battery      delivers V/R into a resistor and loses charge
 *   dc-motor     spins forward from an L298N channel
 *   motor-driver drives a motor from its own control scheme
 *   controller   runs a blink sketch on its own pin map
 *   sensors      output changes when the simulated input changes (line, distance, bumper, encoder, light, DHT)
 *   passives     Ohm's law (resistor), LED current, RC charging (capacitor), open/closed contact (switch)
 *   regulator    output sits at its set point from a suitable battery
 *   display      shows text the sketch prints
 *   servo        turns to the commanded angle
 *
 * Used by tests/sim/coverage.test.ts and by `npm run sim:coverage` (which writes the coverage dashboard data).
 */
import { getComponent } from "@/lib/catalogue";
import { PACK_18650_IDS } from "@/lib/catalogue/platform";
import { buildGraph } from "@/lib/circuit/nets";
import { addPart, newProject } from "@/lib/robot/assembly";
import { DRIVER_WIRING } from "@/lib/robot/drivers";
import { motorParams } from "@/lib/robot/model";
import { wire } from "@/lib/robot/reference";
import type { ComponentRecord, PinDef, Project } from "@/lib/types";
import { BenchSim } from "./bench";
import { supportOf } from "@/lib/components/support";

export type SelfTestStatus = "pass" | "fail" | "n/a";
export interface SelfTestResult {
  status: SelfTestStatus;
  detail: string;
}

const add = (p: Project, id: string, label: string, config?: Record<string, number | boolean | string>) => addPart(p, id, { label, ...(config ? { config } : {}) } as never).project;
const pinBy = (c: ComponentRecord, pred: (p: PinDef) => boolean) => c.pins.find(pred);
const run = (b: BenchSim, s: number) => { for (let t = 0; t < s - 1e-9; t += 0.05) b.advance(0.05); };
/** Smallest 18650 series count whose voltage fits [lo, hi] (nominal ≥ lo, full ≤ hi). */
function cellsFor(lo: number, hi: number): number | null {
  for (let s = 1; s <= 5; s++) if (3.6 * s >= lo && 4.2 * s <= hi) return s;
  return null;
}
function base(code = "void setup(){}\nvoid loop(){}", cells = 2): Project {
  let p = newProject("race", "selftest", "local", { drivetrain: "none" });
  p = add(p, "arduino-uno-r3", "U1");
  p = add(p, PACK_18650_IDS[cells - 1], "BAT", { arrangement: `${cells}S1P` });
  p = wire(p, "BAT.-", "U1.GND1");
  if (4.2 * cells <= 20) p = wire(p, "BAT.+", "U1.VIN");
  return { ...p, code };
}
const ok = (detail: string): SelfTestResult => ({ status: "pass", detail });
const bad = (detail: string): SelfTestResult => ({ status: "fail", detail });
const na = (detail: string): SelfTestResult => ({ status: "n/a", detail });

/** Wires the module's supply (VCC/VIN → Uno 5V) and grounds (→ Uno GND). */
function powerModule(p: Project, c: ComponentRecord, label: string): Project {
  for (const x of c.pins) {
    if (x.fn === "vin" && (!x.vRange || (x.vRange[0] <= 5 && x.vRange[1] >= 5))) p = wire(p, "U1.5V", `${label}.${x.id}`);
    else if (x.fn === "vin" && x.vRange && x.vRange[1] < 5) p = wire(p, "U1.3V3", `${label}.${x.id}`);
    if (x.fn === "gnd") p = wire(p, "U1.GND2", `${label}.${x.id}`);
  }
  return p;
}

export function selfTest(c: ComponentRecord): SelfTestResult {
  try {
    return selfTestInner(c);
  } catch (e) {
    return bad(`self-test crashed: ${(e as Error).message}`);
  }
}

function selfTestInner(c: ComponentRecord): SelfTestResult {
  const support = supportOf(c);
  if (["wheel", "caster", "chassis"].includes(c.kind)) return na("Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test.");
  if (support.level === "unsupported") return na("Not supported yet — nothing to test.");
  if (support.level === "limited") return na(`Limited simulation: ${support.limits[0] ?? support.summary}`);
  const id = c.id;

  // ── batteries ──
  if (c.battery) {
    let p = newProject("race", "selftest", "local", { drivetrain: "none" });
    p = add(p, id, "BAT");
    p = add(p, "100-resistor", "RL");
    p = wire(p, "BAT.+", "RL.1");
    p = wire(p, "RL.2", "BAT.-");
    const b = new BenchSim(p);
    run(b, 0.5);
    const bat = b.state.battery;
    if (!bat) return bad("not recognised as a power source");
    const expect = bat.volts / 100;
    if (Math.abs(bat.currentA - expect) > Math.max(0.005, expect * 0.25)) return bad(`delivers ${bat.currentA.toFixed(3)} A into 100 Ω, expected ≈${expect.toFixed(3)} A`);
    if (!(bat.soc < 0.95)) return bad("charge did not decrease under load");
    return ok(`${bat.volts.toFixed(2)} V, ${(bat.currentA * 1000).toFixed(0)} mA into 100 Ω, charge falling`);
  }

  // ── DC motors ──
  if (c.kind === "dc-motor") {
    const mp = motorParams({ config: {} } as never, c);
    if (!mp) return support.level === "full" ? bad("fully simulated but has no motor data") : na(support.limits[0] ?? "no motor data");
    const terms = c.pins.filter((x) => x.fn === "motor-term");
    if (terms.length !== 2) return na("three-phase motor: needs an ESC (not simulated)");
    const cells = Math.max(2, Math.min(5, Math.ceil((mp.nominalVoltage + 2) / 3.6)));
    let p = base("void setup(){pinMode(5,OUTPUT);pinMode(7,OUTPUT);pinMode(8,OUTPUT);}\nvoid loop(){digitalWrite(7,HIGH);digitalWrite(8,LOW);analogWrite(5,255);delay(10);}", cells);
    p = add(p, "l298n", "DRV", { regJumper: 4.2 * cells <= 12 });
    p = add(p, id, "M");
    for (const [a, b] of [["BAT.+", "DRV.VS"], ["BAT.-", "DRV.GND"], ["U1.D5", "DRV.ENA"], ["U1.D7", "DRV.IN1"], ["U1.D8", "DRV.IN2"], ["DRV.OUT1", `M.${terms[0].id}`], ["DRV.OUT2", `M.${terms[1].id}`]]) p = wire(p, a, b);
    if (4.2 * cells > 12) p = wire(p, "U1.5V", "DRV.5V");
    const b = new BenchSim(p);
    run(b, 0.8);
    const m = Object.values(b.state.motors)[0];
    if (!m || m.rpm < mp.noLoadRpm * 0.05) return bad(`motor did not spin (rpm ${m?.rpm.toFixed(1)})`);
    return ok(`${m.volts?.toFixed(1)} V → ${Math.round(m.rpm)} rpm, ${Math.abs(m.currentA).toFixed(2)} A`);
  }

  // ── motor drivers ──
  if (c.kind === "motor-driver") {
    const w = DRIVER_WIRING[id];
    if (!w || !c.driver) return support.level === "full" ? bad("fully simulated but has no H-bridge wiring") : na(support.limits[0] ?? "outputs not simulated");
    const supply = pinBy(c, (x) => x.id === w.motorSupply)!;
    const cells = cellsFor(Math.max(supply.vRange?.[0] ?? 0, id === "l298n" ? 7 : 0) + 0.3, supply.vRange?.[1] ?? 99);
    if (!cells) return bad(`no 18650 pack fits the motor supply range ${supply.vRange?.join("–")} V`);
    const ch = w.channels[0];
    const outs: string[] = [];
    const pins: [string, string][] = [];
    const code: string[] = [];
    const out = (pin: number, ctrl: string, dut: string, how: string) => { pins.push([`U1.${ctrl}`, `DRV.${dut}`]); outs.push(`pinMode(${pin},OUTPUT);`); code.push(how); };
    switch (w.scheme) {
      case "in-in-en":
        out(7, "D7", ch.inA, "digitalWrite(7,HIGH);");
        out(8, "D8", ch.inB, "digitalWrite(8,LOW);");
        if (ch.en) out(5, "D5", ch.en, "analogWrite(5,220);");
        break;
      case "in-in-pwm-standby":
        out(7, "D7", ch.inA, "digitalWrite(7,HIGH);");
        out(8, "D8", ch.inB, "digitalWrite(8,LOW);");
        out(5, "D5", ch.en!, "analogWrite(5,220);");
        out(4, "D4", ch.stby!, "digitalWrite(4,HIGH);");
        break;
      case "in-in":
        out(5, "D5", ch.inA, "analogWrite(5,220);");
        out(8, "D8", ch.inB, "digitalWrite(8,LOW);");
        break;
      case "pwm-dir":
        out(5, "D5", ch.inA, "analogWrite(5,220);");
        out(8, "D8", ch.inB, "digitalWrite(8,LOW);");
        break;
      case "rpwm-lpwm":
        out(5, "D5", ch.inA, "analogWrite(5,220);");
        out(6, "D6", ch.inB, "analogWrite(6,0);");
        (ch.enables ?? []).forEach((e, i) => out([2, 4][i], ["D2", "D4"][i], e, `digitalWrite(${[2, 4][i]},HIGH);`));
        break;
    }
    let p = base(`void setup(){${outs.join("")}}\nvoid loop(){${code.join("")}delay(10);}`, Math.min(cells, 4));
    if (4.2 * cells > 20) p = { ...p, wires: p.wires.filter((x) => x.to.pin !== "VIN" && x.from.pin !== "VIN") };
    p = add(p, id, "DRV");
    p = add(p, "tt-yellow-gear-motor", "M");
    p = { ...p, parts: p.parts.map((x) => (x.label === "BAT" ? { ...x, componentId: PACK_18650_IDS[cells - 1], config: { ...x.config, arrangement: `${cells}S1P` } } : x)) };
    p = wire(p, "BAT.+", `DRV.${w.motorSupply}`);
    for (const g of c.pins.filter((x) => x.fn === "gnd")) p = wire(p, "BAT.-", `DRV.${g.id}`);
    if (w.logicSupply) p = wire(p, "U1.5V", `DRV.${w.logicSupply}`);
    if (id === "l298n" && 4.2 * cells > 12) p = wire(p, "U1.5V", "DRV.5V");
    for (const [a, b2] of pins) p = wire(p, a, b2);
    p = wire(p, `DRV.${ch.outs[0]}`, "M.M+");
    p = wire(p, `DRV.${ch.outs[1]}`, "M.M-");
    if (id === "l298n" && 4.2 * cells > 12) p = { ...p, parts: p.parts.map((x) => (x.label === "DRV" ? { ...x, config: { ...x.config, regJumper: false } } : x)) };
    const b = new BenchSim(p);
    run(b, 0.6);
    const m = Object.values(b.state.motors)[0];
    if (!m || m.volts === null || Math.abs(m.volts) < 0.5) return bad(`channel ${ch.name} did not drive the motor (${m?.trace ?? "no motor"})`);
    return ok(`channel ${ch.name}: ${m.volts.toFixed(1)} V to the motor from a ${cells}S pack`);
  }

  // ── controllers ──
  if (c.kind === "controller") {
    if (support.level !== "full") return na(support.limits[0] ?? "code not executed");
    const gp = c.pins.find((x) => x.fn === "gpio" && x.arduinoPin !== undefined && x.arduinoPin > 1 && !(x.caps ?? []).some((k) => k === "input-only" || k === "analog-only"));
    if (!gp) return bad("no output-capable pin found");
    let p = newProject("race", "selftest", "local", { drivetrain: "none" });
    p = add(p, id, "U1");
    const n = gp.arduinoPin!;
    p = { ...p, code: `void setup(){pinMode(${n},OUTPUT);}\nvoid loop(){digitalWrite(${n},HIGH);delay(20);digitalWrite(${n},LOW);delay(20);}` };
    const b = new BenchSim(p);
    if (!b.compileResult?.ok) return bad(`blink sketch did not compile: ${b.compileResult?.diagnostics.find((d) => d.severity === "error")?.message}`);
    run(b, 0.3);
    if (b.state.runtime?.error) return bad(`runtime error: ${b.state.runtime.error.message}`);
    const snap = b.bridge.pinSnapshot().find((x) => x.pin === n);
    if (!snap || snap.mode !== "OUTPUT") return bad(`pin ${n} was not driven`);
    return ok(`blink on pin ${n} (${gp.label}) ran ${b.state.runtime?.loopCount ?? 0} loops`);
  }

  // ── sensors ──
  if (c.kind === "sensor" || (c.kind === "switch" && c.sensor?.kind === "bumper")) {
    const s = c.sensor;
    if (/\bLDR\b|photoresistor/i.test(c.name)) {
      let p = base();
      p = add(p, id, "S");
      p = add(p, "10k-resistor", "R");
      for (const [a, b2] of [["U1.5V", "S.1"], ["S.2", "U1.A0"], ["U1.A0", "R.1"], ["R.2", "U1.GND2"]]) p = wire(p, a, b2);
      const b = new BenchSim(p);
      const uid = p.parts.find((x) => x.label === "S")!.uid;
      b.setEnv(uid, { lux: 1 });
      run(b, 0.1);
      const dark = b.readPin(14).analog;
      b.setEnv(uid, { lux: 1000 });
      run(b, 0.1);
      const bright = b.readPin(14).analog;
      return bright > dark + 300 ? ok(`analogRead ${dark} (1 lux) → ${bright} (1000 lux)`) : bad(`reading did not follow the light (${dark} → ${bright})`);
    }
    if (/^DHT/i.test(c.name)) {
      let p = powerModule(base(), c, "S");
      p = add(p, id, "S");
      p = powerModule(p, c, "S");
      p = wire(p, "S.DATA", "U1.D2");
      const b = new BenchSim(p);
      const uid = p.parts.find((x) => x.label === "S")!.uid;
      b.setEnv(uid, { temperature: 30, humidity: 40 });
      run(b, 0.05);
      const r = b.bridge.readDht(2, /22/.test(c.name) ? 22 : 11);
      return r && Math.abs(r.temperature - 30) < 0.6 && Math.abs(r.humidity - 40) < 0.6 ? ok(`reads ${r.temperature} °C / ${r.humidity} %`) : bad(`DHT read gave ${JSON.stringify(r)}`);
    }
    if (!s) return support.level === "full" ? bad("fully simulated but has no sensor model") : na(support.limits[0] ?? "readings not generated");
    let p = base();
    p = add(p, id, "S");
    p = powerModule(p, c, "S");
    const b0 = (q: Project) => new BenchSim(q);
    const uidOf = (q: Project) => q.parts.find((x) => x.label === "S")!.uid;
    if (s.kind === "ultrasonic") {
      p = wire(p, "U1.D11", "S.TRIG");
      p = wire(p, "S.ECHO", "U1.D12");
      const b = b0(p);
      b.bridge.pinMode(11, "OUTPUT");
      const at = (d: number) => { b.setReading(uidOf(p), { kind: "distance", distance: d }); b.advance(0.01); return b.bridge.pulseIn(12, 1, 30000); };
      const near = at(0.2), far = at(1.0);
      return near > 0 && far > near * 3 ? ok(`echo ${near} µs at 20 cm, ${far} µs at 1 m`) : bad(`echo did not follow distance (${near} / ${far} µs)`);
    }
    const outsP = c.pins.filter((x) => x.fn === "out-digital" || x.fn === "out-analog");
    const switchPins = c.pins.filter((x) => x.fn === "switch");
    if (s.kind === "bumper" && switchPins.length) {
      p = wire(p, "S.COM", "U1.GND2");
      p = wire(p, "S.NO", "U1.D2");
      const b = b0(p);
      b.bridge.pinMode(2, "INPUT_PULLUP");
      b.setReading(uidOf(p), { kind: "bumper", pressed: false });
      b.advance(0.01);
      const up = b.bridge.digitalRead(2);
      b.setReading(uidOf(p), { kind: "bumper", pressed: true });
      b.advance(0.01);
      const down = b.bridge.digitalRead(2);
      return up === 1 && down === 0 ? ok("reads HIGH released, LOW pressed (INPUT_PULLUP)") : bad(`pressed/released read ${down}/${up}`);
    }
    if (!outsP.length) return bad("no output pin");
    const analogPins = ["A0", "A1", "A2", "A3", "A4", "A5"];
    const digitalPins = ["D2", "D3", "D4", "D7", "D8", "D12", "D13"];
    outsP.slice(0, 6).forEach((o, i) => { p = wire(p, `S.${o.id}`, `U1.${o.fn === "out-analog" ? analogPins[i] : digitalPins[i]}`); });
    const read = (b: BenchSim) => outsP.slice(0, 6).map((o, i) => (o.fn === "out-analog" ? b.readPin(14 + i).analog : b.readPin([2, 3, 4, 7, 8, 12, 13][i]).digital * 1023));
    const b = b0(p);
    const u = uidOf(p);
    let a: number[], z: number[];
    if (s.kind.startsWith("reflectance")) {
      const ch = s.channels ?? 1;
      b.setReading(u, { kind: "reflectance", darkness: Array(ch).fill(0) });
      b.advance(0.01);
      a = read(b);
      b.setReading(u, { kind: "reflectance", darkness: Array(ch).fill(1) });
      b.advance(0.01);
      z = read(b);
    } else if (s.kind === "ir-distance-analog" || s.kind === "ir-obstacle-digital" || s.kind === "tof") {
      b.setReading(u, { kind: "distance", distance: 0.15 });
      b.advance(0.01);
      a = read(b);
      b.setReading(u, { kind: "distance", distance: s.kind === "ir-obstacle-digital" ? null : 0.6 });
      b.advance(0.01);
      z = read(b);
    } else if (s.kind === "encoder") {
      b.setReading(u, { kind: "encoder", count: 0, rpm: 0 });
      b.advance(0.002);
      a = read(b);
      b.setReading(u, { kind: "encoder", count: 1, rpm: 10 });
      b.advance(0.002);
      z = read(b);
    } else return na(`sensor kind ${s.kind}: no self-test defined`);
    const changed = a.some((v, i) => Math.abs(v - z[i]) > 100);
    return changed ? ok(`output ${a.join("/")} → ${z.join("/")}`) : bad(`output did not change with the input (${a.join("/")} vs ${z.join("/")})`);
  }

  // ── passives ──
  if (c.kind === "resistor" && c.pins.some((x) => x.id === "W")) {
    let p = base();
    p = add(p, id, "P", { position: 0.25 });
    for (const [a, b2] of [["U1.5V", "P.3"], ["P.1", "U1.GND2"], ["P.W", "U1.A0"]]) p = wire(p, a, b2);
    const b = new BenchSim(p);
    run(b, 0.1);
    const v = b.readPin(14).analog;
    // wiper at 25 % from pin 1 (GND) → ≈1.25 V → ≈256 counts
    return Math.abs(v - 256) < 25 ? ok(`wiper at 25 % reads ${v} (≈1.25 V)`) : bad(`wiper reads ${v}, expected ≈256`);
  }
  if (c.kind === "resistor" && c.pins.length === 2) {
    let p = base();
    p = add(p, id, "R");
    p = wire(p, "U1.5V", "R.1");
    p = wire(p, "R.2", "U1.GND2");
    const b = new BenchSim(p);
    run(b, 0.1);
    const e = b.state.dc.find((x) => x.kind === "resistor");
    const ohms = Number(c.options.find((o) => o.key === "ohms")?.default ?? NaN);
    if (!e) return bad("not solved");
    const expect = 5 / ohms;
    return Math.abs(e.current - expect) < expect * 0.02 ? ok(`${(e.current * 1000).toFixed(3)} mA at 5 V (Ohm's law)`) : bad(`${e.current} A, expected ${expect} A`);
  }
  if (c.kind === "led" && c.pins.some((x) => x.fn === "anode")) {
    let p = base();
    p = add(p, id, "L");
    p = add(p, "220-resistor", "R");
    const anode = c.pins.find((x) => x.fn === "anode")!, cath = c.pins.find((x) => x.fn === "cathode")!;
    for (const [a, b2] of [["U1.5V", "R.1"], ["R.2", `L.${anode.id}`], [`L.${cath.id}`, "U1.GND2"]]) p = wire(p, a, b2);
    const b = new BenchSim(p);
    run(b, 0.1);
    const e = b.state.dc.find((x) => x.kind === "led");
    return e && (e.brightness ?? 0) > 0.3 ? ok(`${(e.current * 1000).toFixed(1)} mA through 220 Ω, lit`) : bad(`LED not lit (${e?.current})`);
  }
  if (c.kind === "capacitor" && c.pins.length === 2) {
    let p = base();
    p = add(p, id, "C");
    p = add(p, "1k-resistor", "R");
    for (const [a, b2] of [["U1.5V", "R.1"], ["R.2", `C.${c.pins[0].id}`], [`C.${c.pins[1].id}`, "U1.GND2"]]) p = wire(p, a, b2);
    const b = new BenchSim(p);
    run(b, 2);
    const e = b.state.dc.find((x) => x.kind === "capacitor");
    const uf = Number(c.options.find((o) => o.key === "uf")?.default ?? 1);
    // τ = R·C = 1 kΩ × C; after 2 s every default value here (≤ 1000 µF → τ ≤ 1 s) is ≥ 86 % charged
    return e && e.voltage > 5 * (1 - Math.exp(-2 / Math.max(1e-6, 1000 * uf * 1e-6))) - 0.5 ? ok(`charged to ${e.voltage.toFixed(2)} V through 1 kΩ (τ = ${(uf).toPrecision(2)} ms)`) : bad(`did not charge (${e?.voltage})`);
  }
  if (c.pins.filter((x) => x.fn === "switch").length >= 2 && c.options.some((o) => o.key === "closed")) {
    let p = base();
    p = add(p, id, "SW", { closed: true });
    const sp = c.pins.filter((x) => x.fn === "switch");
    const [a, z] = sp.some((x) => x.id === "COM") ? ["COM", sp.some((x) => x.id === "NO") ? "NO" : sp.find((x) => x.id !== "COM")!.id] : [sp[0].id, sp[1].id];
    const joined = (q: Project) => { const g = buildGraph(q); const u = q.parts.find((x) => x.label === "SW")!.uid; return g.netOf.get(`${u}.${a}`) === g.netOf.get(`${u}.${z}`); };
    const closed = joined(p);
    const open = joined({ ...p, parts: p.parts.map((x) => (x.label === "SW" ? { ...x, config: { ...x.config, closed: false } } : x)) });
    return closed && !open ? ok(`${a}–${z} joined when closed, open otherwise`) : bad(`closed ${closed}, open ${open}`);
  }

  // ── regulators ──
  if (c.kind === "regulator") {
    const inP = c.pins.find((x) => x.fn === "vin"), outP = c.pins.find((x) => x.fn === "vout");
    if (!inP || !outP) return na("no input/output pins");
    const passThrough = c.bridges.some((g) => g.includes(inP.id) && g.includes(outP.id));
    const set = passThrough ? NaN : Number(c.options.find((o) => o.key === "vout")?.default ?? outP.vOut ?? NaN);
    if (!passThrough && !Number.isFinite(set)) return na("output depends on external resistors (not modelled)");
    const boost = /boost/i.test(c.name);
    const cells = cellsFor(Math.max(inP.vRange?.[0] ?? 0, boost || passThrough ? 0 : set + 2) + 0.2, inP.vRange?.[1] ?? 99);
    // 5 V-input modules are fed from the Uno's regulated 5 V rail instead
    const fromRail = !cells && !!inP.vRange && inP.vRange[0] <= 5 && inP.vRange[1] >= 5;
    if (!cells && !fromRail) return bad(`no supply fits the input range ${inP.vRange?.join("–")} V`);
    let p = fromRail ? base() : newProject("race", "selftest", "local", { drivetrain: "none" });
    if (!fromRail) p = add(p, PACK_18650_IDS[cells! - 1], "BAT", { arrangement: `${cells}S1P` });
    p = add(p, id, "REG");
    p = add(p, "1k-resistor", "RL");
    p = wire(p, fromRail ? "U1.5V" : "BAT.+", `REG.${inP.id}`);
    for (const g of c.pins.filter((x) => x.fn === "gnd")) p = wire(p, fromRail ? "U1.GND2" : "BAT.-", `REG.${g.id}`);
    p = wire(p, `REG.${outP.id}`, "RL.1");
    p = wire(p, "RL.2", fromRail ? "U1.GND3" : "BAT.-");
    const vin = fromRail ? 5 : 3.6 * cells!;
    const g = buildGraph(p);
    const u = p.parts.find((x) => x.label === "REG")!.uid;
    const v = g.netOf.get(`${u}.${outP.id}`)?.voltage ?? null;
    if (v === null) return bad("no output voltage");
    const b = new BenchSim(p);
    run(b, 0.1);
    const r = b.state.regulators[u];
    if (passThrough) return Math.abs(v - vin) < 0.05 ? ok(`passes ${v.toFixed(2)} V straight through`) : bad(`pass-through gives ${v} V from ${vin} V`);
    return Math.abs(v - set) < 0.35 && r ? ok(`${vin.toFixed(1)} V in → ${v.toFixed(2)} V out, ${Math.round(r.ioutA * 1000)} mA, ${Math.round(r.efficiency * 100)} %`) : bad(`output ${v} V, set point ${set} V`);
  }

  // ── displays ──
  if (c.kind === "display" && /LCD|OLED/i.test(c.name)) {
    const oled = /OLED/i.test(c.name);
    const i2c = c.pins.some((x) => x.fn === "i2c-sda");
    const code = oled
      ? "#include <Wire.h>\n#include <Adafruit_SSD1306.h>\nAdafruit_SSD1306 d(128, 64, &Wire, -1);\nvoid setup(){ d.begin(SSD1306_SWITCHCAPVCC, 0x3C); d.clearDisplay(); d.setCursor(0,0); d.print(\"OK\"); d.display(); }\nvoid loop(){}"
      : i2c
        ? "#include <LiquidCrystal_I2C.h>\nLiquidCrystal_I2C lcd(0x27, 16, 2);\nvoid setup(){ lcd.init(); lcd.backlight(); lcd.print(\"OK\"); }\nvoid loop(){}"
        : "#include <LiquidCrystal.h>\nLiquidCrystal lcd(12, 11, 5, 4, 3, 2);\nvoid setup(){ lcd.begin(16, 2); lcd.print(\"OK\"); }\nvoid loop(){}";
    let p = base(code);
    p = add(p, id, "D");
    p = powerModule(p, c, "D");
    if (i2c) {
      p = wire(p, `D.${c.pins.find((x) => x.fn === "i2c-sda")!.id}`, "U1.A4");
      p = wire(p, `D.${c.pins.find((x) => x.fn === "i2c-scl")!.id}`, "U1.A5");
    } else {
      for (const [dp, up] of [["RS", "D12"], ["E", "D11"], ["D4", "D5"], ["D5", "D4"], ["D6", "D3"], ["D7", "D2"]]) {
        if (!c.pins.some((x) => x.id === dp)) return bad(`parallel LCD without pin ${dp}`);
        p = wire(p, `D.${dp}`, `U1.${up}`);
      }
      for (const g of c.pins.filter((x) => x.fn === "gnd" || x.id === "VSS" || x.id === "RW")) if (!p.wires.some((w) => w.to.pin === g.id && w.to.part === p.parts.find((y) => y.label === "D")!.uid)) p = wire(p, "U1.GND3", `D.${g.id}`);
    }
    const b = new BenchSim(p);
    if (!b.compileResult?.ok) return bad(`sketch did not compile: ${b.compileResult?.diagnostics.find((d) => d.severity === "error")?.message}`);
    run(b, 0.2);
    const d = b.state.displays[0];
    const text = d ? (oled ? d.runs.map((r) => r.ch).join("") : d.lines.join("")) : "";
    return d && !d.reason && text.includes("OK") ? ok(`shows “${text.trim().slice(0, 16)}”`) : bad(d?.reason ?? "no display output");
  }

  // ── servos ──
  if (c.kind === "servo") {
    if (support.level !== "full") return na(support.limits[0] ?? "not fully simulated");
    let p = base("#include <Servo.h>\nServo s;\nvoid setup(){ s.attach(9); s.write(30); }\nvoid loop(){}");
    p = add(p, id, "SV");
    p = powerModule(p, c, "SV");
    p = wire(p, "U1.D9", `SV.${c.pins.find((x) => x.fn === "in-pwm")!.id}`);
    const b = new BenchSim(p);
    run(b, 0.8);
    const sv = Object.values(b.state.servos)[0];
    return sv && Math.abs(sv.angle - 30) < 1 ? ok(`turned to ${sv.angle.toFixed(0)}°`) : bad(`servo at ${sv?.angle}°`);
  }

  // ── serial radios (HC-05/06 …) ──
  if (c.kind === "wireless" && c.pins.some((x) => x.fn === "uart-tx")) {
    let p = base();
    p = add(p, id, "BT");
    p = powerModule(p, c, "BT");
    p = wire(p, `BT.${c.pins.find((x) => x.fn === "uart-tx")!.id}`, "U1.D0");
    const b = new BenchSim(p);
    return b.bridge.hasSerialModule() ? ok("TX reaches the controller's RX: keyboard/phone commands arrive on Serial") : bad("serial link not detected");
  }
  return na(support.level === "full" ? "No electrical self-test defined for this kind." : support.limits[0] ?? "Limited simulation");
}

void getComponent;
