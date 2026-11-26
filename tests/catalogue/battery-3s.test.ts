import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGUE, PLATFORM_COMPONENTS, allComponents, getComponent } from "@/lib/catalogue";
import { parseMasterList } from "@/lib/catalogue/parse";
import { compareCatalogue, reportToMarkdown } from "@/lib/catalogue/report";
import { LIPO_3S_2100, LIPO_3S_2100_ID, NOT_SPECIFIED } from "@/lib/catalogue/platform";
import { batteryPack, buildGraph } from "@/lib/circuit/nets";
import { validateProject } from "@/lib/circuit/validate";
import { reference2WD, wire } from "@/lib/robot/reference";
import { addPart, newProject } from "@/lib/robot/assembly";
import { buildRobotSpec } from "@/lib/robot/model";
import { powerSummary } from "@/lib/robot/power";
import type { Project } from "@/lib/types";

const md = readFileSync(path.resolve(__dirname, "../../data/source/components-master-list.md"), "utf8");
const parsed = parseMasterList(md);

/** reference 2WD (Uno + L298N + 2× 6 V TT motors) with its 2S pack swapped for the 3S 2100 mAh LiPo */
function on3S(base: Project = reference2WD()): Project {
  return { ...base, parts: base.parts.map((x) => (x.label === "BAT1" ? { ...x, componentId: LIPO_3S_2100_ID, config: {} } : x)) };
}
const issues = (p: Project) => validateProject(p, "Asha").issues;

describe("11.1V 2100mAh LiPo Battery (3S)", () => {
  const bat = getComponent(LIPO_3S_2100_ID)!;

  it("is in the catalogue with the supplied values", () => {
    expect(bat.name).toBe("11.1V 2100mAh LiPo Battery (3S)");
    expect(bat.kind).toBe("battery");
    expect(bat.simStatus).toBe("green");
    expect(bat.battery).toMatchObject({ nominalVoltage: 11.1, maxVoltage: 12.6, minVoltage: 9.0, capacity_mAh: 2100, estimated: true });
    expect(LIPO_3S_2100).toMatchObject({ cells: 3, nominalV: 11.1, fullV: 12.6, capacity_mAh: 2100, capacity_Ah: 2.1, energy_Wh: 23.31 });
    expect(LIPO_3S_2100.nominalV * LIPO_3S_2100.capacity_Ah).toBeCloseTo(23.31, 6);
    expect(bat.specs.extra?.Chemistry).toMatch(/LiPo/);
    expect(bat.specs.extra?.["Fully charged voltage"]).toMatch(/12\.6 V.*standard 3S LiPo convention/);
    expect(bat.specs.extra?.["Minimum (cut-off) voltage used by the simulator"]).toMatch(/9\.0 V.*3\.0 V per cell.*convention/);
  });

  it("does not invent the values that were not supplied", () => {
    for (const k of ["Max discharge (C) rating", "Connector type", "Charging specification"]) expect(bat.specs.extra?.[k]).toBe(NOT_SPECIFIED);
    expect(Number.isFinite(bat.battery!.maxContinuousA)).toBe(false);
    // internal resistance follows the existing LiPo convention (0.02 Ω per cell) and is marked as an estimate
    expect(bat.battery!.internalResistance_ohm).toBeCloseTo(getComponent("lipo-3s-battery")!.battery!.internalResistance_ohm, 6);
    expect(bat.specs.extra?.["Internal resistance used by the simulator"]).toMatch(/estimated/);
  });

  it("has + and − power pins for Circuit Studio", () => {
    expect(bat.pins.map((p) => [p.id, p.fn])).toEqual([["+", "bat+"], ["-", "bat-"]]);
  });

  it("battery pack maths: 3 cells, 11.1 V nominal, 12.6 V full, 9.0 V cut-off, 2100 mAh", () => {
    const p = addPart(newProject("race", "x", "me", { drivetrain: "none" }), LIPO_3S_2100_ID).part;
    const pack = batteryPack(bat, p)!;
    expect(pack).toMatchObject({ nominal: 11.1, max: 12.6, min: 9.0, capacity: 2100, cells: 3 });
  });

  it("is a platform addition: listed in the library but the master-list report stays 552/552", () => {
    expect(CATALOGUE.some((r) => r.id === LIPO_3S_2100_ID)).toBe(false);
    expect(PLATFORM_COMPONENTS.map((r) => r.id)).toContain(LIPO_3S_2100_ID);
    expect(allComponents().some((r) => r.id === LIPO_3S_2100_ID)).toBe(true);
    expect(bat.sources).toEqual([]);
    expect(bat.categoryNumber).toBe(5);
    const rep = compareCatalogue(parsed, allComponents());
    expect(rep.totalSource).toBe(552);
    expect(rep.imported).toBe(552);
    expect(rep.missing).toEqual([]);
    expect(rep.duplicateIds).toEqual([]);
    expect(rep.complete).toBe(true);
    expect(rep.platformAdditions).toContainEqual({ id: LIPO_3S_2100_ID, name: bat.name });
    expect(rep.platformAdditions).toHaveLength(6); // 3S LiPo + five 18650 packs (1–5 cells)
    expect(reportToMarkdown(rep, CATALOGUE, "x".repeat(64))).toContain("Platform additions (not in the master list, counted separately) | 6");
  });

  it("is placed on the chassis and powers the simulator", () => {
    let p = newProject("race", "x", "me");
    p = addPart(p, LIPO_3S_2100_ID, { label: "BAT1" }).project;
    const part = p.parts.find((x) => x.label === "BAT1")!;
    expect(part.position.z).toBeGreaterThan(0); // on top of the plate (battery mounting area)
    expect(part.inCircuit).toBe(true);
    const { spec, notes } = buildRobotSpec(p);
    expect(spec.battery).toMatchObject({ nominalVoltage: 11.1, maxVoltage: 12.6, minVoltage: 9.0, capacity_mAh: 2100 });
    expect(spec.battery.internalResistance).toBeCloseTo(0.06, 6);
    expect(notes.problems).not.toContain("No battery — motors receive no power.");
  });

  it("power summary: voltage, capacity, energy and an estimated runtime", () => {
    let p = newProject("race", "x", "me");
    p = addPart(p, LIPO_3S_2100_ID, { label: "BAT1" }).project;
    const s = powerSummary(p);
    expect(s.battery).toMatchObject({ nominal_V: 11.1, full_V: 12.6, cutoff_V: 9, capacity_mAh: 2100, capacity_Ah: 2.1, energy_Wh: 23.31, cells: 3 });
    expect(s.battery!.notSpecified).toEqual(expect.arrayContaining(["Max discharge (C) rating", "Connector type", "Charging specification"]));
    expect(s.loads.filter((l) => l.kind === "dc-motor")).toHaveLength(4);
    expect(s.totalCurrent_A).toBeGreaterThan(0);
    expect(s.runtime_min).toBeGreaterThan(0);
    // no battery → no runtime
    expect(powerSummary(newProject("race", "x", "me")).runtime_min).toBeNull();
  });
});

describe("validation with 11.1–12.6 V", () => {
  it("6 V TT motors on the 3S pack are flagged as over-voltage", () => {
    const motorWarn = issues(on3S()).filter((i) => i.code === "W_MOTOR_OVERVOLT");
    expect(motorWarn).toHaveLength(2);
    expect(motorWarn[0].incorrect).toMatch(/12\.6 V fully charged/);
  });

  it("a 5 V-only module wired to the battery is flagged", () => {
    let p = on3S();
    p = addPart(p, "hc-sr04", { label: "US1" }).project;
    p = wire(p, "SW1.2", "US1.VCC", "red");
    p = wire(p, "BAT1.-", "US1.GND", "black");
    const e = issues(p).find((i) => i.code === "E_OVERVOLTAGE" && i.partUid === p.parts.find((x) => x.label === "US1")!.uid);
    expect(e?.severity).toBe("critical");
    expect(e?.incorrect).toMatch(/12\.6 V/);
  });

  it("a DRV8833 (10.8 V max) on the 3S pack is flagged", () => {
    let p = on3S();
    p = addPart(p, "drv8833", { label: "DRV9" }).project;
    p = wire(p, "SW1.2", "DRV9.VIN", "red");
    p = wire(p, "BAT1.-", "DRV9.GND", "black");
    expect(issues(p).some((i) => i.code === "E_OVERVOLTAGE" && i.pinId === "VIN" && i.partUid === p.parts.find((x) => x.label === "DRV9")!.uid)).toBe(true);
  });

  it("the Arduino Uno's VIN accepts the 3S pack (with a regulator-heat suggestion)", () => {
    const p = on3S();
    const uno = p.parts.find((x) => x.label === "U1")!;
    const iss = issues(p);
    expect(iss.filter((i) => i.partUid === uno.uid && i.code === "E_OVERVOLTAGE")).toEqual([]);
    expect(iss.find((i) => i.code === "S_VIN_ABOVE_RECOMMENDED")?.severity).toBe("suggestion");
    expect(buildGraph(p).powered.has(uno.uid)).toBe(true);
  });

  it("the battery's unknown C rating is reported as a suggestion, not guessed", () => {
    const s = issues(on3S()).find((i) => i.code === "S_BATTERY_RATING_UNKNOWN");
    expect(s?.severity).toBe("suggestion");
    expect(issues(on3S()).some((i) => i.code === "W_BATTERY_CURRENT")).toBe(false);
  });

  it("existing 2S robots get no new warnings", () => {
    const codes = issues(reference2WD()).map((i) => i.code);
    expect(codes).not.toContain("W_MOTOR_OVERVOLT");
    expect(codes).not.toContain("S_VIN_ABOVE_RECOMMENDED");
  });
});
