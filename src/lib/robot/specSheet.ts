/**
 * Derived, read-only data sheets for a robot project — used by the Garage "Wiring" and "Specifications" tabs.
 *
 *  - wiringTable(): every wire as a typed connection (power / ground / motor / signal / sensor / communication)
 *    with the net voltage the circuit solver resolves for it.
 *  - specSheet(): dimensions, mass, wheels, battery, motor-driver channel loading (with a current-limit warning
 *    and a recommended alternative), estimated draw and runtime.
 *
 * Nothing here is invented: every number comes from the catalogue record, the project geometry, or the
 * circuit graph. Estimates are labelled as such (see power.ts).
 */
import { getComponent } from "@/lib/catalogue";
import { buildGraph, pinKey } from "@/lib/circuit/nets";
import { massSummary, partDims } from "@/lib/mech/geometry";
import type { ComponentRecord, PinDef, Project, WireColor } from "@/lib/types";
import { motorParams } from "./model";
import { powerSummary, type PowerSummary } from "./power";

export type ConnectionType = "power" | "ground" | "motor" | "signal" | "sensor" | "communication";

export interface WiringRow {
  id: string;
  from: string;
  to: string;
  type: ConnectionType;
  color: WireColor;
  /** resolved nominal net voltage (V) for power nets, logic level for signals, null when unknown */
  voltage: number | null;
  note: string;
}

const COMM_FNS = new Set(["uart-tx", "uart-rx", "i2c-sda", "i2c-scl", "spi-mosi", "spi-miso", "spi-sck", "spi-cs", "spi-ss"]);

function classify(a: PinDef | undefined, b: PinDef | undefined, ca: ComponentRecord | undefined, cb: ComponentRecord | undefined): ConnectionType {
  const fns = [a?.fn, b?.fn];
  if (fns.includes("gnd") || fns.includes("bat-")) return "ground";
  if (fns.includes("motor-out") || fns.includes("motor-term")) return "motor";
  if (fns.includes("vin") || fns.includes("vout") || fns.includes("bat+")) return "power";
  if (fns.some((f) => f && COMM_FNS.has(f)) || ca?.kind === "wireless" || cb?.kind === "wireless") return "communication";
  if (ca?.kind === "sensor" || cb?.kind === "sensor") return "sensor";
  return "signal";
}

/** Logic level of a controller (3.3 V for ESP32 / ESP8266 / RP2040, else 5 V). */
export function logicLevel(c: ComponentRecord | undefined): number {
  if (!c) return 5;
  return /ESP32|ESP8266|NodeMCU|RP2040|Pico|3\.3 ?V/i.test(c.name) ? 3.3 : 5;
}

export function wiringTable(project: Project): WiringRow[] {
  const g = buildGraph(project);
  const part = (uid: string) => project.parts.find((p) => p.uid === uid);
  const ctrl = project.parts.map((p) => getComponent(p.componentId)).find((c) => c?.kind === "controller");
  return project.wires.map((w) => {
    const pa = part(w.from.part), pb = part(w.to.part);
    const ca = pa && getComponent(pa.componentId), cb = pb && getComponent(pb.componentId);
    const pinA = ca?.pins.find((x) => x.id === w.from.pin), pinB = cb?.pins.find((x) => x.id === w.to.pin);
    const type = classify(pinA, pinB, ca, cb);
    const net = g.netOf.get(pinKey(w.from));
    let voltage: number | null = null;
    let note = "";
    if (type === "ground") { voltage = 0; note = "common ground"; }
    else if (type === "power") {
      voltage = net?.voltage ?? null;
      note = voltage == null ? "supply not resolved — check the source" : net?.vMax && net.vMax !== voltage ? `${voltage} V nominal, up to ${net.vMax} V full` : `${voltage} V supply`;
    } else if (type === "motor") { note = "PWM-switched battery voltage from the driver"; }
    else {
      voltage = logicLevel(ctrl);
      note = `${voltage} V logic`;
      if (type === "communication" && (pinA?.fn === "uart-rx" || pinB?.fn === "uart-rx")) note += " · TX→RX crossed";
    }
    return { id: w.id, from: `${pa?.label ?? w.from.part}.${w.from.pin}`, to: `${pb?.label ?? w.to.part}.${w.to.pin}`, type, color: w.color, voltage, note };
  });
}

export interface DriverLoad {
  label: string;
  name: string;
  channels: number;
  motorsPerChannel: number;
  contA: number;
  peakA: number;
  /** stall current of the motors on the busiest channel (A, scaled to the battery voltage) */
  channelStallA: number;
  /** typical driving current on the busiest channel (A, estimate) */
  channelDriveA: number;
  ok: boolean;
  warning: string | null;
}

export interface SpecSheet {
  dimensions: { length_mm: number; width_mm: number; thickness_mm: number; material: string } | null;
  groundClearance_mm: number | null;
  mass_g: number;
  massEstimated: boolean;
  wheels: { count: number; name: string; diameter_mm: number; width_mm: number } | null;
  motors: { count: number; name: string; ratedV: number | null; stallA: number | null; rpm: number | null } | null;
  controller: string | null;
  drivers: DriverLoad[];
  power: PowerSummary;
  sensors: string[];
}

/** Recommend a fix for a channel carrying `stallA` with `motorsPerChannel` motors on a driver rated `peakA`. */
function recommendDriver(stallA: number, motorsPerChannel: number, peakA: number): string {
  if (motorsPerChannel > 1 && stallA / motorsPerChannel <= peakA) return "a second driver so every motor has its own channel (e.g. 2× TB6612FNG)";
  return `2× BTS7960 (43 A per channel) — one per side, ${motorsPerChannel} motor(s) in parallel on each`;
}

export function specSheet(project: Project): SpecSheet {
  const g = buildGraph(project);
  const parts = project.parts.map((p) => ({ p, c: getComponent(p.componentId) })).filter((x): x is { p: typeof x.p; c: ComponentRecord } => !!x.c);
  const mass = massSummary(project);
  const power = powerSummary(project);
  const scale = (ratedV: number) => (power.battery ? Math.min(1.5, power.battery.nominal_V / ratedV) : 1);

  const wheelParts = parts.filter((x) => x.c.kind === "wheel");
  const w0 = wheelParts[0];
  const motorParts = parts.filter((x) => x.c.kind === "dc-motor");
  const m0 = motorParts[0];
  const mp0 = m0 ? motorParams(m0.p, m0.c) : null;

  const drivers: DriverLoad[] = parts.filter((x) => x.c.kind === "motor-driver" && x.c.driver).map(({ p, c }) => {
    const d = c.driver!;
    // motors per output: count motor terminals sharing each motor-out net, take the busiest output
    let busiest = 0;
    let stallOnBusiest = 0, driveOnBusiest = 0;
    for (const pin of c.pins.filter((x) => x.fn === "motor-out")) {
      const net = g.netOf.get(`${p.uid}.${pin.id}`);
      if (!net) continue;
      const motorUids = [...new Set(net.members.filter((m) => m.comp.kind === "dc-motor").map((m) => m.part.uid))];
      if (motorUids.length >= busiest) {
        let st = 0, dr = 0;
        for (const uid of motorUids) {
          const mx = parts.find((x) => x.p.uid === uid);
          const mp = mx && motorParams(mx.p, mx.c);
          if (!mp) continue;
          const s = scale(mp.nominalVoltage);
          st += mp.stallCurrentA * s;
          dr += mp.noLoadCurrentA * s + 0.25 * (mp.stallCurrentA - mp.noLoadCurrentA) * s;
        }
        if (motorUids.length > busiest || st > stallOnBusiest) { busiest = motorUids.length; stallOnBusiest = st; driveOnBusiest = dr; }
      }
    }
    const over = stallOnBusiest > d.peakCurrentA;
    const driveOver = driveOnBusiest > d.contCurrentA;
    const warning = busiest === 0 ? null
      : driveOver ? `Typical driving current ${driveOnBusiest.toFixed(2)} A per channel exceeds the ${d.contCurrentA} A continuous rating — the driver will overheat. Use ${recommendDriver(stallOnBusiest, busiest, d.peakCurrentA)}.`
      : over ? `Stall current ${stallOnBusiest.toFixed(2)} A per channel exceeds the ${d.peakCurrentA} A peak rating (starts, pushes, stalls). Fine for light loads; for full-power pushing use ${recommendDriver(stallOnBusiest, busiest, d.peakCurrentA)}.`
      : null;
    return { label: p.label, name: c.name, channels: d.channels, motorsPerChannel: busiest, contA: d.contCurrentA, peakA: d.peakCurrentA, channelStallA: round2(stallOnBusiest), channelDriveA: round2(driveOnBusiest), ok: !warning, warning };
  });

  return {
    dimensions: project.chassis ? { length_mm: project.chassis.length_mm, width_mm: project.chassis.width_mm, thickness_mm: project.chassis.thickness_mm, material: project.chassis.material } : null,
    groundClearance_mm: project.chassis?.groundClearance_mm ?? null,
    mass_g: Math.round(mass.totalG),
    massEstimated: mass.estimatedParts.length > 0,
    wheels: w0 ? (() => { const d = partDims(w0.p, w0.c); return { count: wheelParts.length, name: w0.c.name, diameter_mm: Math.round(d.x), width_mm: Math.round(d.y) }; })() : null,
    motors: m0 ? { count: motorParts.length, name: m0.c.name, ratedV: mp0?.nominalVoltage ?? null, stallA: mp0 ? round1(mp0.stallCurrentA) : null, rpm: mp0?.noLoadRpm ?? null } : null,
    controller: parts.find((x) => x.c.kind === "controller")?.c.name ?? null,
    drivers,
    power,
    sensors: parts.filter((x) => x.c.kind === "sensor").map((x) => `${x.p.label} · ${x.c.name}`),
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
