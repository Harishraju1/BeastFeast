/** Discrete components, displays, wheels and chassis. */
import type { PinDef } from "@/lib/types";
import { type SpecPatch, gnd, inp, pin, vin } from "./dsl";

const resistor = (ohms: number): SpecPatch => ({
  description: `${ohms >= 1000 ? `${ohms / 1000} kΩ` : `${ohms} Ω`} fixed resistor (¼ W through-hole unless stated).`,
  pins: [pin("1", "passive", "L"), pin("2", "passive", "R")], pinoutStatus: "generic-convention",
  options: [{ key: "ohms", label: "Resistance", type: "number", default: ohms, min: 0.1, max: 10_000_000, step: 1, unit: "Ω" }],
  specs: { power: "0.25 W typical" }, simStatus: "blue", verification: "generic-convention",
});

const bjt = (model: string, type: "NPN" | "PNP", order: string, ic: string, extra = ""): SpecPatch => {
  const map: Record<string, PinDef> = {
    C: pin("C", "passive", "R", { label: "C (collector)" }),
    B: pin("B", "in-digital", "L", { label: "B (base)", note: "Drive through a base resistor (e.g. 1 kΩ)" }),
    E: pin("E", "passive", "R", { label: "E (emitter)" }),
  };
  return {
    model, description: `${type} bipolar transistor, Ic max ${ic}. Pin order (${model.includes("TIP") ? "TO-220, facing the label" : "TO-92, flat face towards you"}): ${order.split("").join("-")}. ${extra}`,
    pins: order.split("").map((k) => map[k]), pinoutStatus: "datasheet-referenced", specs: { current: `Ic ${ic}` }, simStatus: "blue", verification: "datasheet-referenced",
  };
};

const mosfet = (model: string, ch: "N" | "P", vgsLogic: boolean, rating: string, order = "GDS"): SpecPatch => {
  const map: Record<string, PinDef> = {
    G: pin("G", "in-digital", "L", { label: "G (gate)", note: vgsLogic ? "Logic-level gate: fully on at 5 V (check RDS(on) at 4.5 V)" : "Standard gate: needs ≈10 V for full enhancement — NOT ideal straight from a 5 V/3.3 V pin" }),
    D: pin("D", "passive", "R", { label: "D (drain)" }),
    S: pin("S", "passive", "R", { label: "S (source)" }),
  };
  return {
    model, description: `${ch}-channel MOSFET, ${rating}. ${vgsLogic ? "Logic-level gate." : "Standard (10 V) gate drive."}`,
    pins: order.split("").map((k) => map[k]), pinoutStatus: "datasheet-referenced", specs: { extra: { "Gate drive": vgsLogic ? "logic level" : "10 V standard", Rating: rating } },
    simStatus: "blue", verification: "datasheet-referenced", tags: vgsLogic ? ["logic-level"] : ["standard-gate"],
  };
};

const led = (color: string, vf: number): SpecPatch => ({
  description: `${color} 5 mm LED, forward voltage ≈${vf} V, 20 mA max continuous. ALWAYS use a series resistor: R = (Vsupply − Vf) / I.`,
  pins: [pin("A", "anode", "L", { label: "Anode (+, long leg)" }), pin("K", "cathode", "R", { label: "Cathode (−, flat side)" })], pinoutStatus: "generic-convention",
  specs: { current: "20 mA max", extra: { "Forward voltage": `≈${vf} V` } }, simStatus: "blue", verification: "generic-convention",
});

const sw2 = (desc: string): SpecPatch => ({ description: desc, pins: [pin("1", "switch", "L"), pin("2", "switch", "R")], pinoutStatus: "generic-convention", options: [{ key: "closed", label: "Switch closed (ON)", type: "boolean", default: true }], simStatus: "blue", verification: "generic-convention" });
const sw3 = (desc: string): SpecPatch => ({ description: desc, pins: [pin("COM", "switch", "L"), pin("NO", "switch", "R"), pin("NC", "switch", "R")], pinoutStatus: "generic-convention", options: [{ key: "closed", label: "Actuated (COM–NO closed)", type: "boolean", default: false }], simStatus: "blue", verification: "generic-convention" });

const i2cDisplay = (desc: string): SpecPatch => ({
  description: desc,
  pins: [gnd("GND", "L"), vin("VCC", [3.3, 5], "L"), pin("SCL", "i2c-scl", "R"), pin("SDA", "i2c-sda", "R")], pinoutStatus: "generic-convention", specs: { protocols: ["I2C"] }, simStatus: "blue", verification: "generic-convention",
});

export const PASSIVE_SPECS: Record<string, SpecPatch> = {
  "100Ω Resistor": resistor(100), "220Ω Resistor": resistor(220), "330Ω Resistor": resistor(330), "470Ω Resistor": resistor(470),
  "1kΩ Resistor": resistor(1000), "4.7kΩ Resistor": resistor(4700), "10kΩ Resistor": resistor(10000), "100kΩ Resistor": resistor(100000),
  "Variable Resistor": { description: "Two-terminal variable resistor (rheostat).", pins: [pin("1", "passive", "L"), pin("2", "passive", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  Potentiometer: { description: "Three-terminal potentiometer: ends to 5 V and GND, wiper gives 0–5 V.", pins: [pin("1", "passive", "L"), pin("W", "out-analog", "R", { label: "Wiper" }), pin("3", "passive", "L")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Trimmer Potentiometer": { description: "Small PCB-mount adjustable potentiometer.", pins: [pin("1", "passive", "L"), pin("W", "out-analog", "R", { label: "Wiper" }), pin("3", "passive", "L")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "SMD Resistor": resistor(1000),
  "Ceramic Capacitor": { description: "Non-polarised ceramic capacitor — use 100 nF close to IC supply pins for decoupling.", pins: [pin("1", "passive", "L"), pin("2", "passive", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Electrolytic Capacitor": { description: "Polarised bulk capacitor: + to the higher voltage. Reverse polarity can make it vent. Voltage rating must exceed the rail.", pins: [pin("+", "anode", "L", { label: "+" }), pin("-", "cathode", "R", { label: "− (stripe)" })], pinoutStatus: "generic-convention", options: [{ key: "vrating", label: "Voltage rating", type: "number", default: 16, min: 6.3, max: 450, step: 0.1, unit: "V" }], simStatus: "blue", verification: "generic-convention" },
  "Tantalum Capacitor": { description: "Polarised tantalum capacitor (+ marked). Fails short if reversed or over-volted.", pins: [pin("+", "anode", "L", { label: "+" }), pin("-", "cathode", "R", { label: "−" })], pinoutStatus: "generic-convention", options: [{ key: "vrating", label: "Voltage rating", type: "number", default: 16, min: 2.5, max: 50, step: 0.1, unit: "V" }], simStatus: "blue", verification: "generic-convention" },
  "Film Capacitor": { description: "Non-polarised film capacitor.", pins: [pin("1", "passive", "L"), pin("2", "passive", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "SMD Capacitor": { description: "Surface-mount ceramic capacitor.", pins: [pin("1", "passive", "L"), pin("2", "passive", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "1N4007 Diode": { model: "1N4007", description: "1 A, 1000 V rectifier diode (≈0.9–1 V drop). Good for reverse-polarity protection.", pins: [pin("A", "anode", "L", { label: "Anode" }), pin("K", "cathode", "R", { label: "Cathode (band)" })], pinoutStatus: "datasheet-referenced", simStatus: "blue", verification: "datasheet-referenced" },
  "1N4148 Diode": { model: "1N4148", description: "Small-signal fast switching diode (≈200 mA).", pins: [pin("A", "anode", "L"), pin("K", "cathode", "R", { label: "Cathode (band)" })], pinoutStatus: "datasheet-referenced", simStatus: "blue", verification: "datasheet-referenced" },
  "Schottky Diode": { description: "Low forward drop (≈0.3–0.5 V) diode, e.g. 1N5819/SS34. Best for reverse-polarity protection and flyback.", pins: [pin("A", "anode", "L"), pin("K", "cathode", "R", { label: "Cathode (band)" })], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Zener Diode": { description: "Diode that conducts in reverse at its Zener voltage — simple voltage clamp.", pins: [pin("A", "anode", "L"), pin("K", "cathode", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "TVS Diode": { description: "Transient voltage suppressor for spike protection.", pins: [pin("A", "anode", "L"), pin("K", "cathode", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "LED Diode": led("Generic", 2),
  "Flyback Diode": { description: "Diode across an inductive load (relay coil, motor) to clamp the turn-off spike. Cathode to +.", pins: [pin("A", "anode", "L"), pin("K", "cathode", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  BC547: bjt("BC547", "NPN", "CBE", "100 mA"),
  BC557: bjt("BC557", "PNP", "CBE", "100 mA"),
  "2N2222": bjt("2N2222 (TO-92)", "NPN", "EBC", "600 mA", "Metal-can (TO-18) versions use a different order."),
  TIP122: bjt("TIP122", "NPN", "BCE", "5 A", "Darlington: ≈2 V saturation drop."),
  TIP127: bjt("TIP127", "PNP", "BCE", "5 A", "Darlington: ≈2 V saturation drop."),
  "NPN Transistor": bjt("Generic NPN", "NPN", "CBE", "see datasheet", "Check the pin order for your exact part."),
  "PNP Transistor": bjt("Generic PNP", "PNP", "CBE", "see datasheet", "Check the pin order for your exact part."),
  IRFZ44N: mosfet("IRFZ44N", "N", false, "55 V, 49 A"),
  IRLZ44N: mosfet("IRLZ44N", "N", true, "55 V, 47 A"),
  IRF540N: mosfet("IRF540N", "N", false, "100 V, 33 A"),
  AO3400: mosfet("AO3400 (SOT-23)", "N", true, "30 V, 5.7 A", "GSD"),
  IRLZ34N: mosfet("IRLZ34N", "N", true, "55 V, 30 A"),
  "N-Channel MOSFET": mosfet("Generic N-channel", "N", false, "see datasheet"),
  "P-Channel MOSFET": mosfet("Generic P-channel", "P", false, "see datasheet"),
  "Red LED": led("Red", 2.0), "Green LED": led("Green", 2.1), "Blue LED": led("Blue", 3.0), "Yellow LED": led("Yellow", 2.1), "White LED": led("White", 3.1),
  "RGB LED": { description: "Common-cathode RGB LED: one resistor per colour.", pins: [pin("R", "anode", "L"), pin("K", "cathode", "L", { label: "Common cathode" }), pin("G", "anode", "R"), pin("B", "anode", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "WS2812B LED Strip": { description: "Addressable RGB LEDs (5 V). ≈60 mA per LED at full white — power the strip directly, not from the Arduino 5V pin.", pins: [vin("5V", [4.5, 5.5], "L"), gnd("GND", "L"), inp("DIN", "digital", { note: "Add a 330 Ω series resistor" })], pinoutStatus: "datasheet-referenced", simStatus: "blue", verification: "datasheet-referenced" },
  "LED Indicator Module": { description: "LED on a small board with resistor.", pins: [inp("S", "digital"), gnd("GND", "L")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Seven-Segment Display": { description: "Single-digit 7-segment LED display (common cathode shown). One resistor per segment.", pins: ["a", "b", "c", "d", "e", "f", "g", "dp"].map((s) => pin(s, "anode", "L", { label: s })).concat([pin("COM", "cathode", "R", { label: "COM (−)" })]), pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "16×2 LCD Display": { description: "HD44780 character LCD (16 pins, parallel). Most kits add an I2C backpack.", pins: [gnd("VSS", "L", "VSS"), vin("VDD", [4.5, 5.5], "L"), pin("V0", "in-analog", "L", { label: "V0 (contrast)" }), inp("RS"), inp("RW"), inp("E"), ...[0, 1, 2, 3, 4, 5, 6, 7].map((d) => inp(`D${d}`)), pin("A", "anode", "R", { label: "A (backlight +)" }), pin("K", "cathode", "R", { label: "K (backlight −)" })], pinoutStatus: "datasheet-referenced", simStatus: "blue", verification: "datasheet-referenced" },
  "20×4 LCD Display": { description: "HD44780 20×4 character LCD (same 16-pin interface as the 16×2).", pins: [gnd("VSS", "L", "VSS"), vin("VDD", [4.5, 5.5], "L"), pin("V0", "in-analog", "L"), inp("RS"), inp("RW"), inp("E"), ...[0, 1, 2, 3, 4, 5, 6, 7].map((d) => inp(`D${d}`)), pin("A", "anode", "R"), pin("K", "cathode", "R")], pinoutStatus: "datasheet-referenced", simStatus: "blue", verification: "datasheet-referenced" },
  "0.96-inch OLED Display": i2cDisplay("128×64 SSD1306 OLED, I2C version (address 0x3C)."),
  "1.3-inch OLED Display": i2cDisplay("128×64 SH1106 OLED, I2C version."),
  "Push Button Switch": sw2("Momentary push button. With INPUT_PULLUP: wire between the pin and GND (reads LOW when pressed)."),
  "Toggle Switch": sw2("SPST toggle switch — e.g. the main power switch in series with battery +."),
  "Rocker Switch": sw2("Rocker power switch (SPST)."),
  "Slide Switch": { description: "SPDT slide switch.", pins: [pin("COM", "switch", "L"), pin("A", "switch", "R"), pin("B", "switch", "R")], pinoutStatus: "generic-convention", options: [{ key: "closed", label: "Slid to A (COM–A closed)", type: "boolean", default: true }], simStatus: "blue", verification: "generic-convention" },
  "DIP Switch": { description: "Row of small SPST switches (4-way shown).", pins: [1, 2, 3, 4].flatMap((n) => [pin(`${n}A`, "switch", "L"), pin(`${n}B`, "switch", "R")]), pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Emergency Stop Switch": { description: "Latching emergency stop with normally-closed contacts: wire it in series with battery +.", pins: [pin("1", "switch", "L"), pin("2", "switch", "R")], pinoutStatus: "generic-convention", options: [{ key: "closed", label: "Released (circuit closed)", type: "boolean", default: true }], simStatus: "green", verification: "generic-convention" },
  "Micro Switch": sw3("Snap-action micro switch (COM / NO / NC)."),
  "Rotary Switch": { description: "Multi-position rotary switch (4 positions shown).", pins: [pin("COM", "switch", "L"), ...[1, 2, 3, 4].map((n) => pin(`P${n}`, "switch", "R"))], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "16×2 LCD": i2cDisplay("16×2 character LCD with I2C backpack (PCF8574, address 0x27 or 0x3F)."),
  "20×4 LCD": i2cDisplay("20×4 character LCD with I2C backpack."),
  "0.96-inch OLED": i2cDisplay("128×64 SSD1306 OLED (I2C)."),
  "1.3-inch OLED": i2cDisplay("128×64 SH1106 OLED (I2C)."),
  "1.5-inch OLED": i2cDisplay("1.5-inch OLED module (SSD1327/SSD1351 depending on version) — confirm interface."),
  "I2C LCD Module": i2cDisplay("Character LCD with I2C backpack."),
  "Four-Digit Seven-Segment Display": { description: "4-digit display with TM1637 driver (CLK/DIO).", pins: [inp("CLK"), pin("DIO", "in-digital", "L"), vin("VCC", [3.3, 5], "L"), gnd("GND", "L")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "WS2812B LED Matrix": { description: "Matrix of WS2812B addressable LEDs.", pins: [vin("5V", [4.5, 5.5], "L"), gnd("GND", "L"), inp("DIN")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Digital Voltage Display": { description: "Panel voltmeter (2-wire: powered from the measured voltage).", pins: [vin("+", [4.5, 30], "L"), gnd("-", "L", "−")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Battery Level Display": { description: "Battery level bar display.", pins: [vin("+", [3, 30], "L"), gnd("-", "L", "−")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
};

// ───────────────────────────── Wheels & chassis ─────────────────────────────

const wheel = (d: number, w: number, mu: number, desc: string): SpecPatch => ({
  description: desc,
  wheel: { diameter_mm: d, width_mm: w, mu, estimated: true },
  options: [
    { key: "diameter", label: "Diameter", type: "number", default: d, min: 10, max: 300, step: 1, unit: "mm" },
    { key: "width", label: "Width", type: "number", default: w, min: 3, max: 120, step: 1, unit: "mm" },
  ],
  specs: { dimensions: { x: d, y: w, z: d } }, simStatus: "green", verification: "unverified",
});

export const MECH_SPECS: Record<string, SpecPatch> = {
  "Plastic Robot Wheels": wheel(65, 26, 0.5, "Hard plastic wheel — low grip. Friction coefficient is an estimate."),
  "Rubber Robot Wheels": wheel(65, 26, 0.9, "Rubber-tyred wheel (TT-motor style, 65 mm). Friction coefficient is an estimate."),
  "Silicone Robot Wheels": wheel(30, 12, 1.1, "Soft silicone tyre — high grip on smooth floors. Friction coefficient is an estimate."),
  "Foam Wheels": wheel(40, 15, 0.8, "Light foam wheel. Friction coefficient is an estimate."),
  "High-Grip Racing Wheels": wheel(45, 20, 1.2, "Racing wheel with soft compound. Friction coefficient is an estimate."),
  "High-Speed Racing Wheels": wheel(70, 18, 0.85, "Large-diameter low-rolling-resistance racing wheel. Friction coefficient is an estimate."),
  "Sumo Robot Wheels": wheel(40, 20, 1.3, "Sticky urethane/silicone sumo wheel. Friction coefficient is an estimate."),
  "Aluminium Wheels": wheel(50, 20, 0.35, "Bare aluminium wheel — low grip unless tyred. Friction coefficient is an estimate."),
  "Metal Wheels": wheel(50, 20, 0.3, "Bare metal wheel. Friction coefficient is an estimate."),
  "TPU 3D-Printed Wheels": wheel(45, 18, 0.9, "Flexible TPU printed wheel. Friction coefficient is an estimate."),
  "Knobby Tyres": wheel(70, 30, 0.8, "Off-road knobby tyre. Friction coefficient is an estimate."),
  "Custom 3D-Printed Tyres": wheel(45, 18, 0.9, "Custom printed tyre. Friction coefficient is an estimate."),
  "Hub Wheels": wheel(65, 26, 0.8, "Wheel with integrated hub. Friction coefficient is an estimate."),
  "Dual Wheel Assemblies": wheel(65, 52, 0.9, "Paired wheels on one axle for more contact area. Friction coefficient is an estimate."),
  "Caster Wheels": { description: "Swivel caster: supports weight, rolls freely in any direction.", specs: { dimensions: { x: 25, y: 25, z: 30 } }, simStatus: "green", verification: "generic-convention" },
  "Ball Caster Wheels": { description: "Ball caster (e.g. Pololu 3/8\" or 1/2\") — low friction support point.", specs: { dimensions: { x: 20, y: 20, z: 15 } }, simStatus: "green", verification: "generic-convention" },
  "Ball Transfer Units": { description: "Ball transfer unit used as an omnidirectional support.", simStatus: "green", verification: "generic-convention" },
  "Front Caster Wheels": { description: "Caster mounted at the front of the robot.", simStatus: "green", verification: "generic-convention" },
  "Rear Caster Wheels": { description: "Caster mounted at the rear of the robot.", simStatus: "green", verification: "generic-convention" },
};

const chassis = (l: number, w: number, t: number, density: number, material: string, wheels: number | undefined, desc: string): SpecPatch => ({
  description: desc,
  chassis: { length_mm: l, width_mm: w, thickness_mm: t, density_g_cm3: density, material, wheelCount: wheels },
  specs: { dimensions: { x: l, y: w, z: t }, weight_g: Math.round(((l * w * t) / 1000) * density) },
  simStatus: "green", verification: "generic-convention",
});

/** Densities are standard material values (g/cm³). Sizes are editable defaults, not product specs. */
export const CHASSIS_SPECS: Record<string, SpecPatch> = {
  "2WD Robot Chassis": chassis(200, 140, 3, 1.18, "Acrylic", 2, "Two driven wheels plus a caster (differential drive)."),
  "4WD Robot Chassis": chassis(220, 150, 3, 1.18, "Acrylic", 4, "Four driven wheels, skid-steer."),
  "6WD Robot Chassis": chassis(260, 160, 3, 2.7, "Aluminium", 6, "Six driven wheels, skid-steer."),
  "Acrylic Robot Chassis": chassis(200, 140, 3, 1.18, "Acrylic", 2, "Laser-cut acrylic (PMMA) plate."),
  "Aluminium Robot Chassis": chassis(200, 140, 2, 2.7, "Aluminium", 2, "Aluminium plate: stiff and light for its strength."),
  "Steel Robot Chassis": chassis(180, 140, 2, 7.85, "Steel", 2, "Steel plate: heavy — good for sumo traction."),
  "Stainless Steel Chassis": chassis(180, 140, 2, 8.0, "Stainless steel", 2, "Stainless steel plate."),
  "Carbon Fibre Chassis": chassis(200, 140, 2, 1.6, "Carbon fibre", 2, "Carbon-fibre plate: very stiff and light."),
  "ABS Plastic Chassis": chassis(200, 140, 3, 1.05, "ABS", 2, "ABS plastic plate."),
  "PLA 3D-Printed Chassis": chassis(200, 140, 4, 1.24, "PLA", 2, "3D-printed PLA (solid-equivalent density; real prints with infill are lighter)."),
  "PETG 3D-Printed Chassis": chassis(200, 140, 4, 1.27, "PETG", 2, "3D-printed PETG."),
  "Nylon Chassis": chassis(200, 140, 3, 1.15, "Nylon", 2, "Nylon plate: tough and slightly flexible."),
  "Polycarbonate Chassis": chassis(200, 140, 3, 1.2, "Polycarbonate", 2, "Polycarbonate: very impact resistant (combat robots)."),
  "FR4 Chassis": chassis(150, 100, 1.6, 1.85, "FR4", 2, "FR4 glass-epoxy (PCB material) chassis."),
  "Mini Sumo Robot Chassis": chassis(100, 100, 3, 2.7, "Aluminium", 2, "10 × 10 cm footprint for mini-sumo (check your rules for size and 500 g mass limits)."),
  "Micro Sumo Robot Chassis": chassis(50, 50, 2, 2.7, "Aluminium", 2, "5 × 5 cm micro-sumo footprint."),
  "Racing Robot Chassis": chassis(220, 120, 2, 1.6, "Carbon fibre", 2, "Long, narrow, low chassis for stability at speed."),
  "Line Follower Chassis": chassis(160, 120, 2, 1.85, "FR4", 2, "Light chassis with a sensor boom at the front."),
  "Tank Robot Chassis": chassis(230, 160, 3, 2.7, "Aluminium", 4, "Tracked chassis (simulated as 4-wheel skid steer)."),
  "Custom Fabricated Chassis": chassis(200, 140, 3, 1.18, "Acrylic", 2, "Your own design — set the dimensions and material."),
};

/** Section 8 mechanical parts with a specific simulated role. */
MECH_SPECS["Front Wedge"] = { description: "Angled sumo wedge that gets under the opponent and reduces its traction (simulated as a load transfer on frontal contact).", simStatus: "green", verification: "generic-convention" };
MECH_SPECS["Replaceable Sumo Blade"] = { description: "Thin hardened blade on the wedge edge (simulated as part of the wedge).", simStatus: "green", verification: "generic-convention" };
MECH_SPECS["Protective Bumper"] = { description: "Bumper around the chassis that takes collisions.", simStatus: "yellow", verification: "generic-convention" };
