import { describe, expect, it } from "vitest";
import { allComponents, getComponent } from "@/lib/catalogue";
import { LIPO_3S_2100_ID } from "@/lib/catalogue/platform";
import { GENERIC_MODEL_NOTE, modelKeyFor } from "@/lib/models/modelKey";
import type { ComponentRecord } from "@/lib/types";

const key = (id: string) => {
  const c = getComponent(id);
  if (!c) throw new Error(`missing component ${id}`);
  return modelKeyFor(c);
};
/** A catalogue-shaped record for names the catalogue does not carry (variants sold under other names). */
const fake = (kind: ComponentRecord["kind"], name: string, extra: Partial<ComponentRecord> = {}) => modelKeyFor({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, kind, ...extra });

const MODEL_KINDS: ComponentRecord["kind"][] = ["dc-motor", "motor-driver", "controller", "sensor", "wheel", "battery", "servo", "caster"];

describe("modelKeyFor — motors", () => {
  it("Johnson motors map to the johnson model, never BO/TT", () => {
    expect(key("johnson-dc-gear-motor")).toMatchObject({ key: "johnson", exact: true });
    for (const n of ["Johnson Geared Motor 12V 100RPM", "Johnson BO-style side shaft motor", "Johnson TT replacement motor"]) {
      const m = fake("dc-motor", n);
      expect(m.key).toBe("johnson");
      expect(["bo", "bo-l", "tt"]).not.toContain(m.key);
    }
  });
  it("BO → bo, TT → tt, N20 → n20, 25GA370 → ga25, 37GB520 → ga37", () => {
    expect(key("bo-gear-motor")).toMatchObject({ key: "bo", exact: true });
    expect(key("tt-yellow-gear-motor")).toMatchObject({ key: "tt", exact: true });
    expect(key("n20-micro-metal-gear-motor")).toMatchObject({ key: "n20", exact: true });
    expect(key("25ga370-gear-motor")).toMatchObject({ key: "ga25", exact: true });
    expect(fake("dc-motor", "JGA25-370 Encoder Gear Motor").key).toBe("ga25");
    expect(key("37gb520-gear-motor")).toMatchObject({ key: "ga37", exact: true });
    expect(fake("dc-motor", "JGB37-520 Gear Motor").key).toBe("ga37");
  });
  it("L-shaped BO motors get their own model, RS motors the bare-can model", () => {
    expect(fake("dc-motor", "BO Motor L-Shape").key).toBe("bo-l");
    expect(key("rs-775-dc-motor").key).toBe("rs");
    expect(key("brushless-dc-motor")).toMatchObject({ key: "motor-generic", exact: false });
  });
});

describe("modelKeyFor — drivers, controllers, sensors, wheels, batteries", () => {
  it("motor drivers", () => {
    expect(key("l298n")).toMatchObject({ key: "l298n", exact: true });
    expect(key("tb6612fng")).toMatchObject({ key: "tb6612", exact: true });
    expect(key("bts7960")).toMatchObject({ key: "bts7960", exact: true });
    expect(key("ibt-2").key).toBe("bts7960");
    expect(key("l293d").key).toBe("l293d");
    expect(key("l293d-motor-shield").key).toBe("l293d-shield");
    expect(key("drv8833").key).toBe("drv8833");
    expect(key("mx1508").key).toBe("mx1508");
  });
  it("controllers", () => {
    expect(key("arduino-uno-r3")).toMatchObject({ key: "uno", exact: true });
    expect(key("esp32-devkit-v1")).toMatchObject({ key: "esp32", exact: true });
    expect(key("esp32-s3")).toMatchObject({ key: "esp32s3", exact: true });
    expect(key("arduino-nano").key).toBe("nano");
    expect(key("arduino-mega-2560").key).toBe("mega");
    expect(key("raspberry-pi-pico").key).toBe("pico");
  });
  it("sensors", () => {
    expect(key("hc-sr04")).toMatchObject({ key: "ultrasonic", exact: true });
    expect(key("tcrt5000").key).toBe("ir-module");
    expect(key("ir-obstacle-avoidance-sensor").key).toBe("ir-module");
    expect(key("qtr-8rc")).toMatchObject({ key: "reflectance-array", exact: true });
    expect(key("sharp-gp2y0a21yk0f")).toMatchObject({ key: "sharp-ir", exact: true });
    expect(key("vl53l0x").key).toBe("tof");
  });
  it("knobby / off-road wheels → offroad", () => {
    expect(key("knobby-tyres")).toMatchObject({ key: "offroad", exact: true });
    expect(fake("wheel", "Off-Road Wheels 85mm").key).toBe("offroad");
    expect(key("sumo-robot-wheels").key).toBe("sumo");
    expect(key("plastic-robot-wheels").key).toBe("wheel-tt");
    expect(key("rubber-robot-wheels").key).toBe("wheel-rubber");
    expect(key("mecanum-wheels").key).toBe("mecanum");
    expect(key("omni-wheels").key).toBe("omni");
  });
  it("the 11.1V 2100mAh 3S battery and every LiPo pack use the LiPo design", () => {
    expect(key(LIPO_3S_2100_ID)).toMatchObject({ key: "lipo", exact: true });
    for (const id of ["lipo-1s-battery", "lipo-2s-battery", "lipo-3s-battery", "lipo-4s-battery", "lipo-6s-battery"]) expect(key(id).key).toBe("lipo");
    expect(key("18650-li-ion-cell").key).toBe("cell-holder");
    expect(key("4-x-aa-battery-pack").key).toBe("aa-holder");
  });
});

describe("modelKeyFor — whole catalogue", () => {
  const all = allComponents();

  it("maps every catalogue component to a key without throwing", () => {
    for (const c of all) {
      const m = modelKeyFor(c);
      expect(typeof m.key).toBe("string");
      expect(m.label.length).toBeGreaterThan(0);
    }
  });

  it("never uses a catch-all for the modelled kinds: each kind has several distinct models", () => {
    for (const k of ["dc-motor", "motor-driver", "controller", "sensor", "wheel", "battery"] as const) {
      const keys = new Set(all.filter((c) => c.kind === k).map((c) => modelKeyFor(c).key));
      expect(keys.size, k).toBeGreaterThan(3);
    }
  });

  it("reports exact vs generic models per kind", () => {
    const rows = MODEL_KINDS.map((k) => {
      const list = all.filter((c) => c.kind === k).map((c) => ({ c, m: modelKeyFor(c) }));
      return { kind: k, total: list.length, exact: list.filter((x) => x.m.exact).length, generic: list.filter((x) => !x.m.exact).length, keys: [...new Set(list.map((x) => x.m.key))].length };
    });
    const lines = rows.map((r) => `${r.kind.padEnd(13)} total ${String(r.total).padStart(3)}  exact ${String(r.exact).padStart(3)}  generic ${String(r.generic).padStart(3)}  models ${r.keys}`);
    console.log(`3D model coverage (non-exact parts show "${GENERIC_MODEL_NOTE}")\n${lines.join("\n")}`);
    for (const r of rows) expect(r.exact + r.generic).toBe(r.total);
    // the parts the club uses most are all exact
    for (const id of ["tt-yellow-gear-motor", "bo-gear-motor", "n20-micro-metal-gear-motor", "25ga370-gear-motor", "37gb520-gear-motor", "johnson-dc-gear-motor", "l298n", "tb6612fng", "arduino-uno-r3", "arduino-nano", "esp32-devkit-v1", "hc-sr04", "rubber-robot-wheels", LIPO_3S_2100_ID]) expect(key(id).exact, id).toBe(true);
  });
});
