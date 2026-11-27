/** Wire roles, 18650 chemistry / charge options, battery safety rules and the new 3D model keys. */
import { describe, expect, it } from "vitest";
import { reference2WD, wire } from "@/lib/robot/reference";
import { addPart, newProject } from "@/lib/robot/assembly";
import { batteryPack, buildGraph } from "@/lib/circuit/nets";
import { netRole, WIRE_COLOUR, ROLE_INFO } from "@/lib/circuit/wireRole";
import { validateProject } from "@/lib/circuit/validate";
import { withOption } from "@/lib/circuit/options";
import { BenchSim } from "@/lib/sim/bench";
import { getComponent } from "@/lib/catalogue";
import { PACK_18650_IDS } from "@/lib/catalogue/platform";
import { modelKeyFor } from "@/lib/models/modelKey";
import type { Project } from "@/lib/types";

const add = (p: Project, id: string, label?: string, config?: Record<string, number | boolean | string>) => addPart(p, id, { ...(label ? { label } : {}), ...(config ? { config } : {}) } as never).project;
const NP = () => newProject("race", "t", "local", { drivetrain: "none" });
const uidOf = (p: Project, l: string) => p.parts.find((x) => x.label === l)!.uid;

describe("wire colours: three roles only", () => {
  it("legend has exactly red / black / blue", () => {
    expect(Object.keys(ROLE_INFO).sort()).toEqual(["negative", "positive", "signal"]);
    expect(WIRE_COLOUR.positive).toBe("#D32F2F");
    expect(WIRE_COLOUR.negative).toBe("#1C1C1C");
    expect(WIRE_COLOUR.signal).toBe("#2878B5");
  });
  it("battery + is positive, GND is negative, controller GPIO is signal", () => {
    const p = reference2WD();
    const g = buildGraph(p);
    const bat = uidOf(p, "BAT1");
    const pos = g.netOf.get(`${bat}.+`)!;
    const neg = g.netOf.get(`${bat}.-`)!;
    expect(netRole(g, pos)).toBe("positive");
    expect(netRole(g, neg)).toBe("negative");
    const sig = g.nets.find((n) => n.members.some((m) => m.pin.fn === "gpio") && n.voltage == null && !n.isGround);
    expect(sig && netRole(g, sig)).toBe("signal");
  });
  it("motor outputs follow the live H-bridge state (not a fixed colour)", () => {
    const p = reference2WD();
    const sim = new BenchSim(p);
    const g = sim.graph;
    const outs = new Map<string, "high" | "low" | "off">();
    const drv = uidOf(p, "DRV1");
    const out1 = g.netOf.get(`${drv}.OUT1`)!;
    expect(netRole(g, out1, outs)).toBe("undriven");
    outs.set(`${drv}.OUT1`, "high");
    expect(netRole(g, out1, outs)).toBe("positive");
    outs.set(`${drv}.OUT1`, "low");
    expect(netRole(g, out1, outs)).toBe("negative");
  });
});

describe("18650 chemistry, charge and internal resistance", () => {
  it("LiFePO4 chosen in the inspector gives 3.2 / 3.65 / 2.5 V per cell", () => {
    let p = NP();
    const c = getComponent(PACK_18650_IDS[1])!;
    p = add(p, PACK_18650_IDS[1], "BAT", withOption(c, { arrangement: "2S1P" }, "chemistry", "lifepo4") as never);
    const bp = p.parts.find((x) => x.label === "BAT")!;
    const pk = batteryPack(getComponent(bp.componentId)!, bp)!;
    expect(pk.nominal).toBeCloseTo(6.4, 5);
    expect(pk.max).toBeCloseTo(7.3, 5);
    expect(pk.min).toBeCloseTo(5.0, 5);
  });
  it("choosing a chemistry in the inspector writes the matching voltages", () => {
    const c = getComponent(PACK_18650_IDS[0])!;
    expect(withOption(c, {}, "chemistry", "lifepo4")).toMatchObject({ chemistry: "lifepo4", cellNominal: 3.2, cellMax: 3.65, cellMin: 2.5 });
    expect(withOption(c, {}, "chemistry", "li-ion")).toMatchObject({ cellNominal: 3.6, cellMax: 4.2, cellMin: 3.0 });
  });
  it("internal resistance scales with series / parallel, start charge feeds the bench", () => {
    let p = reference2WD();
    const b = p.parts.find((x) => x.label === "BAT1")!;
    p = { ...p, parts: p.parts.map((x) => (x.uid === b.uid ? { ...x, componentId: PACK_18650_IDS[1], config: { arrangement: "2S1P", cellRint: 100, initialSoc: 40 } as never } : x)) };
    const part = p.parts.find((x) => x.uid === b.uid)!;
    const pk = batteryPack(getComponent(part.componentId)!, part)!;
    expect(pk.rint).toBeCloseTo(0.2, 5);
    const sim = new BenchSim(p);
    sim.advance(0.05);
    expect(sim.state.battery!.soc).toBeLessThanOrEqual(0.4);
    expect(sim.state.battery!.soc).toBeGreaterThan(0.39);
  });
  it("over-charge and over-discharge limits are safety issues", () => {
    let p = NP();
    p = add(p, PACK_18650_IDS[0], "BAT", { chemistry: "lifepo4", cellMax: 4.2, cellMin: 1.5 });
    const r = validateProject(p);
    expect(r.issues.find((i) => i.code === "E_CELL_OVERCHARGE")).toMatchObject({ severity: "critical", area: "safety" });
    expect(r.issues.find((i) => i.code === "W_CELL_OVERDISCHARGE")).toMatchObject({ severity: "warning", area: "safety" });
    let ok = NP();
    ok = add(ok, PACK_18650_IDS[0], "BAT");
    const r2 = validateProject(ok);
    expect(r2.issues.some((i) => i.code === "E_CELL_OVERCHARGE" || i.code === "W_CELL_OVERDISCHARGE")).toBe(false);
  });
});

describe("new 3D model keys", () => {
  const k = (id: string) => modelKeyFor(getComponent(id)!);
  it.each([
    ["1n4007-diode", "diode"],
    ["1n4148-diode", "diode"],
    ["bc547", "transistor"],
    ["tip122", "transistor"],
    ["irfz44n", "transistor"],
    ["ao3400", "transistor"],
    ["seeed-studio-xiao-esp32-c3", "xiao"],
    ["motor-mounting-brackets", "bracket"],
  ])("%s → %s", (id, key) => {
    expect(getComponent(id), id).toBeTruthy();
    expect(k(id).key).toBe(key);
  });
});

void wire;
