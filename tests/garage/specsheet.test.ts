import { describe, expect, it } from "vitest";
import { GARAGE_TEMPLATES, buildFromTemplate, getTemplate } from "@/lib/garage";
import { specSheet, wiringTable } from "@/lib/robot/specSheet";
import { robotFacets } from "@/lib/robot/facets";

const build = (id: string) => buildFromTemplate(getTemplate(id)!, "t", "original");
const current = GARAGE_TEMPLATES.filter((t) => !t.metadata.legacy);

describe("wiring table", () => {
  it.each(current.map((t) => t.metadata.id))("%s: every wire is typed and every supply resolves", (id) => {
    const p = build(id);
    const rows = wiringTable(p);
    expect(rows).toHaveLength(p.wires.length);
    for (const r of rows) expect(["power", "ground", "motor", "signal", "sensor", "communication"]).toContain(r.type);
    expect(rows.filter((r) => r.type === "power" && r.voltage == null)).toEqual([]);
    expect(rows.filter((r) => r.type === "ground").every((r) => r.voltage === 0)).toBe(true);
  });

  it("RR-04 battery feed reads 11.1 V (3S) and logic reads 5 V on the Uno", () => {
    const rows = wiringTable(build("RR-04"));
    expect(rows.find((r) => r.from.startsWith("BAT1.+"))?.voltage).toBe(11.1);
    expect(rows.find((r) => r.type === "signal")?.voltage).toBe(5);
  });
});

describe("spec sheet", () => {
  it.each(current.map((t) => t.metadata.id))("%s: has dimensions, 4 wheels, a battery and a runtime estimate", (id) => {
    const s = specSheet(build(id));
    expect(s.dimensions).not.toBeNull();
    expect(s.wheels?.count).toBe(4);
    expect(s.motors?.count).toBe(4);
    expect(s.power.battery).not.toBeNull();
    expect(s.power.runtime_min).toBeGreaterThan(0);
  });

  it("RR-04: one motor per TB6612FNG channel stays within limits", () => {
    const s = specSheet(build("RR-04"));
    expect(s.drivers).toHaveLength(2);
    for (const d of s.drivers) {
      expect(d.motorsPerChannel).toBe(1);
      expect(d.ok).toBe(true);
    }
  });

  it("LF-01: two TT motors on one L298N channel is flagged with a concrete alternative", () => {
    const d = specSheet(build("LF-01")).drivers[0];
    expect(d.motorsPerChannel).toBe(2);
    expect(d.ok).toBe(false);
    expect(d.warning).toMatch(/exceeds/);
    expect(d.warning).toMatch(/second driver|BTS7960/);
  });
});

describe("robot facets", () => {
  it("RR-04 card facts come from its parts", () => {
    const t = getTemplate("RR-04")!;
    const f = robotFacets(build("RR-04"), { keyboardControl: t.simulation.keyboardViaSerial });
    expect(f.controller).toBe("Arduino Uno R3");
    expect(f.driver).toBe("2× TB6612FNG");
    expect(f.motorCount).toBe(4);
    expect(f.control).toBe("Bluetooth (HC-05)");
  });
  it("line followers report IR reflectance sensors; RR-05 reports ultrasonic", () => {
    expect(robotFacets(build("LF-02")).sensorTypes).toContain("Line (IR reflectance)");
    expect(robotFacets(build("RR-05")).sensorTypes).toContain("Ultrasonic");
  });
});
