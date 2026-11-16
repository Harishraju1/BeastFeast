import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMasterList } from "@/lib/catalogue/parse";
import { buildCatalogue } from "@/lib/catalogue/build";
import { compareCatalogue } from "@/lib/catalogue/report";
import { CATALOGUE, getComponent } from "@/lib/catalogue";
import generated from "@/data/catalogue.generated.json";

const md = readFileSync(path.resolve(__dirname, "../../data/source/components-master-list.md"), "utf8");
const parsed = parseMasterList(md);

describe("TEST 10 — catalogue completeness vs uploaded master list", () => {
  it("parses all 16 component sections and the competition table", () => {
    expect(parsed.sections.map((s) => s.number)).toEqual([...Array(17).keys()].map((i) => i + 1));
    expect(parsed.competitionTable.length).toBe(17);
    expect(parsed.warnings).toEqual([]);
  });

  it("counts every numbered entry per section exactly as printed", () => {
    const expected: Record<number, number> = { 1: 27, 2: 29, 3: 36, 4: 80, 5: 40, 6: 26, 7: 24, 8: 50, 9: 24, 10: 20, 11: 60, 12: 30, 13: 20, 14: 16, 15: 30, 16: 40 };
    for (const [s, n] of Object.entries(expected)) expect(parsed.entries.filter((e) => e.sectionNumber === Number(s)).length, `section ${s}`).toBe(n);
    expect(parsed.entries.length).toBe(552);
  });

  it("the runtime database contains every entry with no missing or duplicate records", () => {
    const rep = compareCatalogue(parsed, CATALOGUE);
    expect(rep.missing).toEqual([]);
    expect(rep.duplicateIds).toEqual([]);
    expect(rep.duplicateSourceRefs).toEqual([]);
    expect(rep.imported).toBe(552);
    expect(rep.complete).toBe(true);
  });

  it("the generated seed file matches a fresh build", () => {
    const fresh = buildCatalogue(parsed);
    expect((generated as { count: number }).count).toBe(fresh.length);
    expect((generated as { records: { id: string }[] }).records.map((r) => r.id)).toEqual(fresh.map((r) => r.id));
  });

  it("preserves exact names and model distinctions", () => {
    const names = new Set(CATALOGUE.map((r) => r.name));
    for (const n of ["Arduino Uno R3", "Arduino Uno R4", "ESP32 DevKit V1", "ESP32-S3", "L298N", "TB6612FNG", "SG90", "MG995", "TCRT5000", "QTR-8RC", "LiPo 2S Battery", "LiPo 3S Battery", "N20 Micro Metal Gear Motor", "TT Yellow Gear Motor"]) expect(names.has(n), n).toBe(true);
    expect(CATALOGUE.some((r) => r.name.startsWith("Raspberry Pi Pico ("))).toBe(true);
    expect(CATALOGUE.some((r) => r.name.startsWith("Raspberry Pi Pico W ("))).toBe(true);
    expect(CATALOGUE.some((r) => /Raspberry Pi [345]\b/.test(r.name))).toBe(false);
    expect(getComponent("arduino-uno-r3")!.id).not.toBe(getComponent("arduino-uno-r4")!.id);
  });

  it("classifies functionality and never claims simulation for workshop tools", () => {
    for (const r of CATALOGUE.filter((r) => r.categoryNumber === 16)) {
      expect(r.functionalityClass).toBe("C");
      expect(r.simStatus).not.toBe("green");
    }
    expect(getComponent("l298n")!.functionalityClass).toBe("A");
    expect(getComponent("2wd-robot-chassis")!.functionalityClass).toBe("B");
  });

  it("GREEN components carry the data the simulator needs", () => {
    for (const r of CATALOGUE.filter((r) => r.simStatus === "green")) {
      if (r.kind === "dc-motor") expect(r.motor, r.name).toBeTruthy();
      if (r.kind === "motor-driver") expect(r.driver, r.name).toBeTruthy();
      if (r.kind === "battery") expect(r.battery, r.name).toBeTruthy();
      if (r.kind === "wheel") expect(r.wheel, r.name).toBeTruthy();
      if (r.kind === "controller") expect(r.board, r.name).toBeTruthy();
    }
  });

  it("L298N pinout distinguishes every control, output and power pin", () => {
    const ids = getComponent("l298n")!.pins.map((p) => p.id);
    for (const p of ["ENA", "IN1", "IN2", "IN3", "IN4", "ENB", "OUT1", "OUT2", "OUT3", "OUT4", "VS", "5V", "GND"]) expect(ids).toContain(p);
  });

  it("maps section 17 competition table onto records", () => {
    expect(getComponent("arduino-uno-r3")!.competitions).toEqual({ race: "required", line: "required", sumo: "required" });
    expect(getComponent("hc-sr04")!.competitions.race).toBe("optional");
    expect(getComponent("hc-05-bluetooth-module")!.competitions.sumo).toBe("rule-dependent");
  });
});
