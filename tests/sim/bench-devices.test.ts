/**
 * Component simulation models on the circuit bench: capacitors (RC), LDR divider read by analogRead, DHT11 +
 * I²C LCD through the emulated libraries, OLED text, servo positioning, buck converter efficiency, battery
 * discharge / sag / temperature / runtime, and the IR obstacle detection threshold.
 * Everything runs through the real circuit graph, electrical bridge and interpreter.
 */
import { describe, expect, it } from "vitest";
import { addPart, newProject } from "@/lib/robot/assembly";
import { wire } from "@/lib/robot/reference";
import { BenchSim } from "@/lib/sim/bench";
import { PACK_18650_IDS } from "@/lib/catalogue/platform";
import type { Project } from "@/lib/types";

const add = (p: Project, id: string, label: string, config?: Record<string, number | boolean | string>) => addPart(p, id, { label, ...(config ? { config } : {}) } as never).project;
const uidOf = (p: Project, l: string) => p.parts.find((x) => x.label === l)!.uid;
function base(code: string): Project {
  let p = newProject("race", "bench", "local", { drivetrain: "none" });
  p = add(p, "arduino-uno-r3", "U1");
  p = add(p, PACK_18650_IDS[1], "BAT", { arrangement: "2S1P" });
  p = wire(p, "BAT.+", "U1.VIN");
  p = wire(p, "BAT.-", "U1.GND1");
  return { ...p, code };
}
const run = (b: BenchSim, s: number) => { for (let t = 0; t < s; t += 0.05) b.advance(0.05); };

describe("bench component models", () => {
  it("RC: a 100 µF capacitor charges through 10 kΩ with τ = RC = 1 s", () => {
    let p = base("void setup(){pinMode(9,OUTPUT);digitalWrite(9,HIGH);}\nvoid loop(){}");
    p = add(p, "10k-resistor", "R1");
    p = add(p, "electrolytic-capacitor", "C1", { uf: 100, vrating: 16 });
    p = wire(p, "U1.D9", "R1.1");
    p = wire(p, "R1.2", "C1.+");
    p = wire(p, "C1.-", "U1.GND2");
    const b = new BenchSim(p);
    run(b, 1.0);
    const v1 = b.state.dc.find((e) => e.kind === "capacitor")!.voltage;
    expect(v1 / 5).toBeGreaterThan(0.55); // 1 − e⁻¹ ≈ 0.63 (backward Euler at 50 ms steps lags slightly)
    expect(v1 / 5).toBeLessThan(0.7);
    run(b, 4);
    expect(b.state.dc.find((e) => e.kind === "capacitor")!.voltage).toBeGreaterThan(4.85);
  });

  it("LDR divider: analogRead falls as the light rises", () => {
    const code = "int v=0;\nvoid setup(){Serial.begin(9600);}\nvoid loop(){v=analogRead(A0);Serial.println(v);delay(50);}";
    let p = base(code);
    p = add(p, "ldr", "LDR1");
    p = add(p, "10k-resistor", "R1");
    p = wire(p, "U1.5V", "LDR1.1");
    p = wire(p, "LDR1.2", "U1.A0");
    p = wire(p, "U1.A0", "R1.1");
    p = wire(p, "R1.2", "U1.GND2");
    const b = new BenchSim(p);
    const last = () => Number(b.state.serial.trim().split(/\r?\n/).at(-1));
    b.setEnv(uidOf(p, "LDR1"), { lux: 1 });
    run(b, 0.5);
    const dark = last();
    b.setEnv(uidOf(p, "LDR1"), { lux: 1000 });
    run(b, 0.5);
    const bright = last();
    expect(dark).toBeLessThan(300); // ≈50 kΩ LDR over 10 kΩ → ≈0.8 V
    expect(bright).toBeGreaterThan(900); // ≈400 Ω → ≈4.8 V (A0 sits low on the divider = reading rises with light)
  });

  it("DHT11 + I²C LCD: the wired sensor is read and the text appears on the wired display", () => {
    const code = `#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
DHT dht(2, DHT11);
void setup(){ lcd.init(); lcd.backlight(); dht.begin(); }
void loop(){ float t = dht.readTemperature(); lcd.setCursor(0,0); lcd.print("T="); lcd.print(t,0); lcd.print(" C"); delay(200); }`;
    let p = base(code);
    p = add(p, "dht11", "DHT1");
    p = add(p, "16x2-lcd", "LCD1");
    for (const [a, c] of [["U1.5V", "DHT1.VCC"], ["U1.GND2", "DHT1.GND"], ["DHT1.DATA", "U1.D2"], ["U1.5V", "LCD1.VCC"], ["U1.GND3", "LCD1.GND"], ["LCD1.SDA", "U1.A4"], ["LCD1.SCL", "U1.A5"]]) p = wire(p, a, c);
    const b = new BenchSim(p);
    expect(b.compileResult?.ok).toBe(true);
    b.setEnv(uidOf(p, "DHT1"), { temperature: 31.6 });
    run(b, 0.6);
    const d = b.state.displays[0];
    expect(d.partUid).toBe(uidOf(p, "LCD1"));
    expect(d.reason).toBeUndefined();
    expect(d.lines[0].startsWith("T=32 C")).toBe(true); // DHT11 reports whole degrees
  });

  it("an unwired DHT reads NaN and an unwired LCD shows nothing with the reason", () => {
    const code = `#include <LiquidCrystal_I2C.h>
#include <DHT.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
DHT dht(2, DHT22);
void setup(){ lcd.init(); dht.begin(); }
void loop(){ lcd.setCursor(0,0); lcd.print(dht.readHumidity()); delay(200); }`;
    let p = base(code);
    p = add(p, "16x2-lcd", "LCD1");
    p = wire(p, "U1.5V", "LCD1.VCC");
    p = wire(p, "U1.GND3", "LCD1.GND");
    const b = new BenchSim(p);
    run(b, 0.5);
    expect(b.state.displays[0].lines).toEqual([]);
    expect(b.state.displays[0].reason).toMatch(/SDA and SCL/);
  });

  it("OLED text appears only after display()", () => {
    const code = `#include <Wire.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
void setup(){ oled.begin(SSD1306_SWITCHCAPVCC, 0x3C); oled.clearDisplay(); oled.setTextSize(2); oled.setCursor(0,0); oled.println("GO"); }
void loop(){ delay(100); }`;
    let p = base(code);
    p = add(p, "0_96-inch-oled-display", "OLED1");
    for (const [a, c] of [["U1.5V", "OLED1.VCC"], ["U1.GND3", "OLED1.GND"], ["OLED1.SDA", "U1.A4"], ["OLED1.SCL", "U1.A5"]]) p = wire(p, a, c);
    const b = new BenchSim(p);
    run(b, 0.3);
    expect(b.state.displays[0].runs).toEqual([]); // drawn into the buffer but display() never called
    const p2 = { ...p, code: code.replace('oled.println("GO"); }', 'oled.println("GO"); oled.display(); }') };
    const b2 = new BenchSim(p2);
    run(b2, 0.3);
    expect(b2.state.displays[0].runs.map((r) => r.ch).join("")).toBe("GO");
    expect(b2.state.displays[0].runs[0].size).toBe(2);
  });

  it("servo turns to the commanded angle at its rated speed, only when wired and powered", () => {
    const code = "#include <Servo.h>\nServo s;\nvoid setup(){ s.attach(9); s.write(170); }\nvoid loop(){}";
    let p = base(code);
    p = add(p, "sg90", "SV1");
    p = wire(p, "U1.5V", "SV1.V+");
    p = wire(p, "U1.GND2", "SV1.GND");
    const b0 = new BenchSim(p);
    run(b0, 0.5);
    expect(b0.state.servos[uidOf(p, "SV1")].angle).toBe(90); // signal not wired: stays where it is
    p = wire(p, "U1.D9", "SV1.SIG");
    const b = new BenchSim(p);
    b.advance(0.05);
    const early = b.state.servos[uidOf(p, "SV1")].angle;
    expect(early).toBeGreaterThan(90);
    expect(early).toBeLessThan(170); // 80° takes ≈0.13 s at 600 °/s
    run(b, 0.4);
    expect(b.state.servos[uidOf(p, "SV1")].angle).toBeCloseTo(170, 0);
  });

  it("buck converter: input current follows the power balance (≈88 % efficient), not the output current", () => {
    let p = base("void setup(){}\nvoid loop(){}");
    p = add(p, "lm2596-buck-converter", "BUCK", { vout: 5 });
    p = add(p, "100-resistor", "RL"); // ≈50 mA load on the 5 V output
    for (const [a, c] of [["BAT.+", "BUCK.IN+"], ["BAT.-", "BUCK.IN-"], ["BUCK.OUT+", "RL.1"], ["RL.2", "BUCK.OUT-"]]) p = wire(p, a, c);
    const b = new BenchSim(p);
    run(b, 0.2);
    const r = b.state.regulators[uidOf(p, "BUCK")];
    expect(r.vout).toBeCloseTo(5, 1);
    expect(r.ioutA).toBeCloseTo(0.05, 2);
    expect(r.iinA).toBeLessThan(r.ioutA); // stepping ≈8 V down to 5 V draws less than the output current
    expect(r.efficiency).toBeCloseTo(0.88, 2);
  });

  it("battery: discharge, sag under load, temperature and runtime from the simulated current only", () => {
    let p = base("void setup(){pinMode(5,OUTPUT);pinMode(7,OUTPUT);pinMode(8,OUTPUT);}\nvoid loop(){digitalWrite(7,HIGH);digitalWrite(8,LOW);analogWrite(5,255);delay(10);}");
    p = add(p, "l298n", "DRV");
    p = add(p, "tt-yellow-gear-motor", "M1");
    for (const [a, c] of [["BAT.+", "DRV.VS"], ["BAT.-", "DRV.GND"], ["U1.D5", "DRV.ENA"], ["U1.D7", "DRV.IN1"], ["U1.D8", "DRV.IN2"], ["DRV.OUT1", "M1.M+"], ["DRV.OUT2", "M1.M-"]]) p = wire(p, a, c);
    const idle = new BenchSim(base("void setup(){}\nvoid loop(){}"));
    run(idle, 2);
    const b = new BenchSim(p);
    run(b, 2);
    const bat = b.state.battery!;
    expect(bat.currentA).toBeGreaterThan(idle.state.battery!.currentA + 0.1); // the motor load is what drains it
    expect(bat.volts).toBeLessThan(idle.state.battery!.volts); // I·R sag
    expect(bat.soc).toBeLessThan(idle.state.battery!.soc);
    expect(bat.runtimeMin).toBeGreaterThan(0);
    expect(bat.tempC).toBeGreaterThanOrEqual(25);
    expect(bat.energyWh).toBeCloseTo(7.2 * 2.5, 5);
  });

  it("IR obstacle sensor: a target beyond its range is not detected (its detection threshold)", () => {
    let p = base("void setup(){}\nvoid loop(){}");
    p = add(p, "ir-obstacle-avoidance-sensor", "IR1");
    const b = new BenchSim(p);
    b.setReading(uidOf(p, "IR1"), { kind: "distance", distance: 5 });
    expect(b.readings[uidOf(p, "IR1")]).toEqual({ kind: "distance", distance: null });
    b.setReading(uidOf(p, "IR1"), { kind: "distance", distance: 0.05 });
    expect(b.readings[uidOf(p, "IR1")]).toEqual({ kind: "distance", distance: 0.05 });
  });
});
