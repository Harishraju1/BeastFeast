/** Batteries, regulators/power modules, wireless and remote-control modules. */
import type { BatterySimParams, PinDef } from "@/lib/types";
import { type SpecPatch, gnd, inp, moduleVccGnd, out, pin, vin, vout } from "./dsl";

const batPins = (): PinDef[] => [pin("+", "bat+", "R", { label: "+" }), pin("-", "bat-", "R", { label: "−" })];
const bat = (p: Omit<BatterySimParams, "estimated">, estimated = true): BatterySimParams => ({ ...p, estimated });

const cellsOption = (def: number, max = 6) => ({ key: "series", label: "Cells in series", type: "number" as const, default: def, min: 1, max, step: 1, help: "Pack voltage = cells × cell voltage" });
const capOption = (def: number) => ({ key: "capacity", label: "Capacity", type: "number" as const, default: def, min: 50, max: 50000, step: 50, unit: "mAh" });

const liion = (cap: number, rint: number, maxA: number, dims: [number, number]) =>
  ({
    pins: batPins(), pinoutStatus: "generic-convention" as const, options: [cellsOption(2), capOption(cap)],
    specs: { voltage: "3.7 V nominal per cell (4.2 V full, ≈3.0 V empty)", dimensions: { x: dims[1], y: dims[0], z: dims[0] } },
    battery: bat({ nominalVoltage: 3.7, maxVoltage: 4.2, minVoltage: 3.0, capacity_mAh: cap, internalResistance_ohm: rint, maxContinuousA: maxA, perCell: true }),
    simStatus: "green" as const, verification: "generic-convention" as const,
  }) satisfies SpecPatch;

const lipo = (s: number): SpecPatch => ({
  description: `${s}-cell lithium-polymer pack: ${(3.7 * s).toFixed(1)} V nominal, ${(4.2 * s).toFixed(1)} V full. High discharge rate; never discharge below ≈3.3 V/cell under load, always balance-charge.`,
  pins: batPins(), pinoutStatus: "generic-convention", options: [capOption(s <= 2 ? 1000 : 1500)],
  specs: { voltage: `${(3.7 * s).toFixed(1)} V nominal / ${(4.2 * s).toFixed(1)} V full`, extra: { "Cell count": `${s}S` } },
  battery: bat({ nominalVoltage: 3.7 * s, maxVoltage: 4.2 * s, minVoltage: 3.3 * s, capacity_mAh: s <= 2 ? 1000 : 1500, internalResistance_ohm: 0.02 * s, maxContinuousA: 20 }),
  simStatus: "green", verification: "generic-convention",
});

export const POWER_SPECS: Record<string, SpecPatch> = {
  "18650 Li-ion Cell": { description: "Cylindrical 18 × 65 mm Li-ion cell. Use 2 in series (2S, 7.4 V) for most 2WD robots — with a holder and protection.", ...liion(2500, 0.05, 10, [18, 65]) },
  "21700 Li-ion Cell": { description: "Cylindrical 21 × 70 mm Li-ion cell with higher capacity than 18650.", ...liion(4000, 0.03, 15, [21, 70]) },
  "26650 Li-ion Cell": { description: "Cylindrical 26 × 65 mm Li-ion cell.", ...liion(5000, 0.03, 15, [26, 65]) },
  "Li-ion Battery Pack": { description: "Pre-built Li-ion pack; choose the number of series cells.", ...liion(2500, 0.05, 10, [36, 70]) },
  "LiPo 1S Battery": lipo(1), "LiPo 2S Battery": lipo(2), "LiPo 3S Battery": lipo(3), "LiPo 4S Battery": lipo(4), "LiPo 6S Battery": lipo(6),
  "LiFePO4 Battery": {
    description: "Lithium iron phosphate cell: 3.2 V nominal, 3.65 V full, very safe chemistry.", pins: batPins(), pinoutStatus: "generic-convention", options: [cellsOption(2, 8), capOption(1500)],
    specs: { voltage: "3.2 V nominal per cell (3.65 V full)" },
    battery: bat({ nominalVoltage: 3.2, maxVoltage: 3.65, minVoltage: 2.5, capacity_mAh: 1500, internalResistance_ohm: 0.03, maxContinuousA: 10, perCell: true }), simStatus: "green", verification: "generic-convention",
  },
  "AA Alkaline Battery": { description: "1.5 V primary cell with high internal resistance — sags badly under motor loads.", pins: batPins(), pinoutStatus: "generic-convention", options: [cellsOption(4, 8)], battery: bat({ nominalVoltage: 1.5, maxVoltage: 1.6, minVoltage: 1.0, capacity_mAh: 2000, internalResistance_ohm: 0.2, maxContinuousA: 1, perCell: true }), simStatus: "green", verification: "generic-convention" },
  "AAA Alkaline Battery": { description: "1.5 V primary cell, smaller capacity.", pins: batPins(), pinoutStatus: "generic-convention", options: [cellsOption(4, 8)], battery: bat({ nominalVoltage: 1.5, maxVoltage: 1.6, minVoltage: 1.0, capacity_mAh: 1000, internalResistance_ohm: 0.3, maxContinuousA: 0.5, perCell: true }), simStatus: "green", verification: "generic-convention" },
  "AA NiMH Rechargeable Battery": { description: "1.2 V rechargeable cell, lower internal resistance than alkaline.", pins: batPins(), pinoutStatus: "generic-convention", options: [cellsOption(6, 10)], battery: bat({ nominalVoltage: 1.2, maxVoltage: 1.4, minVoltage: 1.0, capacity_mAh: 2000, internalResistance_ohm: 0.03, maxContinuousA: 4, perCell: true }), simStatus: "green", verification: "generic-convention" },
  "AAA NiMH Rechargeable Battery": { description: "1.2 V rechargeable cell.", pins: batPins(), pinoutStatus: "generic-convention", options: [cellsOption(6, 10)], battery: bat({ nominalVoltage: 1.2, maxVoltage: 1.4, minVoltage: 1.0, capacity_mAh: 800, internalResistance_ohm: 0.05, maxContinuousA: 2, perCell: true }), simStatus: "green", verification: "generic-convention" },
  "4 × AA Battery Pack": { description: "Four AA cells in series: 6 V with alkaline, 4.8 V with NiMH.", pins: batPins(), pinoutStatus: "generic-convention", battery: bat({ nominalVoltage: 6, maxVoltage: 6.4, minVoltage: 4, capacity_mAh: 2000, internalResistance_ohm: 0.8, maxContinuousA: 1 }), simStatus: "green", verification: "generic-convention" },
  "6 × AA Battery Pack": { description: "Six AA cells in series: 9 V with alkaline.", pins: batPins(), pinoutStatus: "generic-convention", battery: bat({ nominalVoltage: 9, maxVoltage: 9.6, minVoltage: 6, capacity_mAh: 2000, internalResistance_ohm: 1.2, maxContinuousA: 1 }), simStatus: "green", verification: "generic-convention" },
  "9V PP3 Battery": { description: "9 V rectangular battery. Low capacity and high internal resistance: unsuitable for driving motors.", pins: batPins(), pinoutStatus: "generic-convention", battery: bat({ nominalVoltage: 9, maxVoltage: 9.5, minVoltage: 6, capacity_mAh: 500, internalResistance_ohm: 1.7, maxContinuousA: 0.3 }), simStatus: "green", verification: "generic-convention" },
  "6V Lead Acid Battery": { description: "Sealed lead-acid 6 V battery: heavy but robust.", pins: batPins(), pinoutStatus: "generic-convention", battery: bat({ nominalVoltage: 6, maxVoltage: 6.4, minVoltage: 5.25, capacity_mAh: 4500, internalResistance_ohm: 0.05, maxContinuousA: 10 }), specs: { weight_g: 700 }, simStatus: "green", verification: "generic-convention" },
  "12V Lead Acid Battery": { description: "Sealed lead-acid 12 V battery: heavy but robust.", pins: batPins(), pinoutStatus: "generic-convention", battery: bat({ nominalVoltage: 12, maxVoltage: 12.8, minVoltage: 10.5, capacity_mAh: 7000, internalResistance_ohm: 0.03, maxContinuousA: 20 }), specs: { weight_g: 2100 }, simStatus: "green", verification: "generic-convention" },
  "NiCd Battery Pack": { description: "Nickel-cadmium pack, 1.2 V per cell.", pins: batPins(), pinoutStatus: "generic-convention", options: [cellsOption(6, 12)], battery: bat({ nominalVoltage: 1.2, maxVoltage: 1.4, minVoltage: 1.0, capacity_mAh: 1000, internalResistance_ohm: 0.02, maxContinuousA: 10, perCell: true }), simStatus: "green", verification: "generic-convention" },

  // ── battery accessories with electrical function ──
  "Battery Protection Circuit": { description: "Protection board: disconnects the load on over-discharge, over-current or short circuit.", pins: [pin("B+", "vin", "L", { vRange: [2.5, 26] }), pin("B-", "gnd", "L"), pin("P+", "vout", "R"), pin("P-", "gnd", "R")], bridges: [["B+", "P+"]], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Battery Management System (BMS)": { description: "Multi-cell BMS: balancing plus over/under-voltage and over-current protection.", pins: [pin("B+", "vin", "L", { vRange: [2.5, 30] }), pin("B-", "gnd", "L"), pin("P+", "vout", "R"), pin("P-", "gnd", "R")], bridges: [["B+", "P+"]], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "TP4056 Charging Module": { description: "Single-cell Li-ion charger (1 A) — many versions include DW01 protection (OUT+/OUT−).", pins: [vin("IN+", [4.5, 5.5], "L"), gnd("IN-", "L", "IN−"), pin("B+", "passive", "R"), pin("B-", "passive", "R"), pin("OUT+", "passive", "R"), pin("OUT-", "passive", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Battery Voltage Indicator": { description: "Voltage display/indicator for the battery.", pins: [vin("+", [3, 30], "L"), gnd("-", "L", "−")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Battery Level Monitor": { description: "Battery level monitor board.", pins: [vin("+", [3, 30], "L"), gnd("-", "L", "−")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Battery Fuse": { description: "Inline fuse protecting the battery wiring from short circuits.", pins: [pin("1", "switch", "L"), pin("2", "switch", "R")], bridges: [["1", "2"]], pinoutStatus: "generic-convention", options: [{ key: "rating", label: "Rating", type: "number", default: 5, min: 0.5, max: 60, step: 0.5, unit: "A" }], simStatus: "blue", verification: "generic-convention" },

  // ── regulators ──
  "LM2596 Buck Converter": buck("TI LM2596 (module)", [4.5, 40], 3, "https://www.ti.com/lit/ds/symlink/lm2596.pdf", "Step-down module, adjustable 1.25–37 V. 3 A switch rating; ≈2 A continuous without a heatsink."),
  "XL4015 Buck Converter": buck("XLSEMI XL4015 (module)", [8, 36], 5, null, "Step-down 5 A module, adjustable 1.25–32 V."),
  "XL4016 Buck Converter": buck("XLSEMI XL4016 (module)", [8, 40], 8, null, "Step-down 8 A module, adjustable 1.25–36 V."),
  "MP1584 Buck Converter": buck("MPS MP1584 (mini module)", [4.5, 28], 3, null, "Tiny 3 A step-down module, 0.8–20 V output."),
  "MP2307 Buck Converter": buck("MPS MP2307 (mini module)", [4.75, 23], 3, null, "Tiny 3 A synchronous step-down module."),
  "TPS5430 Buck Converter": buck("TI TPS5430", [5.5, 36], 3, "https://www.ti.com/lit/ds/symlink/tps5430.pdf", "3 A step-down converter."),
  "LM2577 Boost Converter": boost("TI LM2577 (module)", [3.5, 30], 3, "Step-up module (output must be higher than input)."),
  "MT3608 Boost Converter": boost("Aerosemi MT3608 (module)", [2, 24], 2, "Small step-up module up to 28 V. 2 A is the switch current, not the output current."),
  "XL6009 Boost Converter": boost("XLSEMI XL6009 (module)", [3, 32], 4, "Step-up module 5–35 V."),
  "AMS1117 3.3V Regulator": ldo("AMS1117-3.3", 3.3, 15, 1, 1.3, "http://www.advanced-monolithic.com/pdf/ds1117.pdf"),
  "AMS1117 5V Regulator": ldo("AMS1117-5.0", 5, 15, 1, 1.3, "http://www.advanced-monolithic.com/pdf/ds1117.pdf"),
  "1117-3.3 Regulator": ldo("1117-3.3 (generic)", 3.3, 15, 0.8, 1.3, null),
  "1117-5.0 Regulator": ldo("1117-5.0 (generic)", 5, 15, 0.8, 1.3, null),
  "7805 Voltage Regulator": ldo("LM7805 (TO-220)", 5, 35, 1.5, 2, "https://www.ti.com/lit/ds/symlink/lm7800.pdf"),
  "7812 Voltage Regulator": ldo("LM7812 (TO-220)", 12, 35, 1.5, 2, "https://www.ti.com/lit/ds/symlink/lm7800.pdf"),
  "LM317 Adjustable Regulator": {
    manufacturer: "TI / ST", model: "LM317 (TO-220)", description: "Adjustable linear regulator 1.25–37 V, 1.5 A. Output set by two resistors: Vout = 1.25 × (1 + R2/R1).",
    pins: [pin("ADJ", "passive", "L"), pin("OUT", "vout", "R", { vOut: 5, iMax_mA: 1500 }), vin("IN", [4.25, 40], "L")], pinoutStatus: "datasheet-referenced",
    options: [{ key: "vout", label: "Set output voltage", type: "number", default: 5, min: 1.25, max: 37, step: 0.05, unit: "V" }],
    datasheetUrl: "https://www.ti.com/lit/ds/symlink/lm317.pdf", simStatus: "blue", verification: "datasheet-referenced",
  },
  "BEC Module": {
    description: "Battery Eliminator Circuit: supplies a regulated 5 V (or 6 V) from the drive battery.",
    pins: [vin("IN+", [6, 26], "L"), gnd("IN-", "L", "IN−"), vout("OUT+", 5, "R", { iMax_mA: 3000 }), gnd("OUT-", "R", "OUT−")], bridges: [["IN-", "OUT-"]], pinoutStatus: "generic-convention",
    options: [{ key: "vout", label: "Output voltage", type: "select", default: "5", choices: [{ value: "5", label: "5 V" }, { value: "6", label: "6 V" }] }], simStatus: "blue", verification: "generic-convention",
  },
  "UBEC Module": {
    description: "Switching ('universal') BEC, typically 5 V/6 V at 3 A from 2–6S LiPo.",
    pins: [vin("IN+", [6, 26], "L"), gnd("IN-", "L", "IN−"), vout("OUT+", 5, "R", { iMax_mA: 3000 }), gnd("OUT-", "R", "OUT−")], bridges: [["IN-", "OUT-"]], pinoutStatus: "generic-convention",
    options: [{ key: "vout", label: "Output voltage", type: "select", default: "5", choices: [{ value: "5", label: "5 V" }, { value: "6", label: "6 V" }] }], simStatus: "blue", verification: "generic-convention",
  },
  "DC-DC Converter": { ...buck("Generic", [4.5, 30], 2, null, "Generic DC-DC converter module — set the input range and output to match your module."), simStatus: "blue", verification: "generic-convention" },
  "Isolated DC-DC Converter": {
    description: "Isolated converter: output ground is NOT connected to input ground (galvanic isolation).",
    pins: [vin("VIN+", [4.5, 5.5], "L"), gnd("VIN-", "L", "VIN−"), vout("VOUT+", 5, "R", { iMax_mA: 200 }), pin("VOUT-", "bat-", "R", { label: "VOUT− (isolated)" })], bridges: [], pinoutStatus: "generic-convention",
    options: [{ key: "vout", label: "Output voltage", type: "number", default: 5, min: 1, max: 24, step: 0.1, unit: "V" }], simStatus: "blue", verification: "generic-convention",
  },
  "Power Distribution Board": { description: "Splits one battery input into several outputs (all outputs share the input's + and −).", pins: [vin("IN+", [3, 30], "L"), gnd("IN-", "L", "IN−"), pin("OUT1+", "vout", "R"), gnd("OUT1-", "R", "OUT1−"), pin("OUT2+", "vout", "R"), gnd("OUT2-", "R", "OUT2−")], bridges: [["IN+", "OUT1+", "OUT2+"], ["IN-", "OUT1-", "OUT2-"]], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "USB Power Module": { description: "Breaks out USB 5 V and GND.", pins: [vout("5V", 5, "R", { iMax_mA: 500 }), gnd("GND", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "DC Power Jack Module": { description: "Barrel jack breakout (pass-through).", pins: [pin("JACK+", "vin", "L", { vRange: [0, 30] }), gnd("JACK-", "L", "JACK−"), pin("OUT+", "vout", "R"), gnd("OUT-", "R", "OUT−")], bridges: [["JACK+", "OUT+"], ["JACK-", "OUT-"]], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
};

function buck(model: string, vinR: [number, number], amps: number, url: string | null, desc: string): SpecPatch {
  return {
    model, description: desc,
    pins: [vin("IN+", vinR, "L"), gnd("IN-", "L", "IN−"), vout("OUT+", 5, "R", { iMax_mA: amps * 1000 }), gnd("OUT-", "R", "OUT−")],
    bridges: [["IN-", "OUT-"]], pinoutStatus: "generic-convention",
    options: [{ key: "vout", label: "Output voltage (set with the trimmer)", type: "number", default: 5, min: 0.8, max: 36, step: 0.05, unit: "V", help: "Always measure with a multimeter before connecting electronics!" }],
    specs: { voltage: `Input ${vinR[0]}–${vinR[1]} V`, current: `${amps} A max` }, datasheetUrl: url, simStatus: "blue", verification: url ? "datasheet-referenced" : "unverified",
  };
}
function boost(model: string, vinR: [number, number], amps: number, desc: string): SpecPatch {
  return { ...buck(model, vinR, amps, null, desc), options: [{ key: "vout", label: "Output voltage (must be above input)", type: "number", default: 12, min: 5, max: 35, step: 0.1, unit: "V" }] };
}
function ldo(model: string, v: number, vmax: number, amps: number, dropout: number, url: string | null): SpecPatch {
  return {
    model, description: `Linear regulator, fixed ${v} V output, ${amps} A. Needs at least ≈${dropout} V headroom (input ≥ ${(v + dropout).toFixed(1)} V) and burns (Vin − Vout) × I as heat.`,
    pins: [vin("IN", [v + dropout, vmax], "L"), gnd("GND", "L"), vout("OUT", v, "R", { iMax_mA: amps * 1000 })], pinoutStatus: "datasheet-referenced",
    specs: { voltage: `Input ${(v + dropout).toFixed(1)}–${vmax} V`, current: `${amps} A` }, datasheetUrl: url, simStatus: "blue", verification: url ? "datasheet-referenced" : "unverified",
  };
}

// ───────────────────────────── Wireless & RC ─────────────────────────────

export const COMMS_SPECS: Record<string, SpecPatch> = {
  "HC-05 Bluetooth Module": {
    manufacturer: "Generic (HC-05 on ZS-040 breakout)", model: "HC-05 Bluetooth SPP module",
    description: "Classic Bluetooth serial (SPP) module, master/slave. Breakout runs from 3.6–6 V but RXD is 3.3 V logic — use a divider from a 5 V Arduino TX.",
    pins: [inp("EN", "digital", { label: "EN/KEY" }), vin("VCC", [3.6, 6], "L"), gnd("GND", "L"), pin("TXD", "uart-tx", "R", { logicV: 3.3 }), pin("RXD", "uart-rx", "R", { logicV: 3.3, tolerant5V: false }), out("STATE", "digital")],
    pinoutStatus: "datasheet-referenced", specs: { protocols: ["UART 9600 baud default (data mode)", "Bluetooth SPP"] }, simStatus: "green", verification: "datasheet-referenced",
  },
  "HC-06 Bluetooth Module": {
    manufacturer: "Generic", model: "HC-06 Bluetooth SPP module (slave only)",
    description: "Slave-only classic Bluetooth serial module. RXD is 3.3 V logic.",
    pins: [vin("VCC", [3.6, 6], "L"), gnd("GND", "L"), pin("TXD", "uart-tx", "R", { logicV: 3.3 }), pin("RXD", "uart-rx", "R", { logicV: 3.3, tolerant5V: false })],
    pinoutStatus: "datasheet-referenced", specs: { protocols: ["UART", "Bluetooth SPP"] }, simStatus: "green", verification: "datasheet-referenced",
  },
  "HM-10 BLE Module": {
    manufacturer: "Jinan Huamao (and clones)", model: "HM-10 BLE 4.0 module", description: "Bluetooth Low Energy serial module (not compatible with classic SPP apps).",
    pins: [vin("VCC", [3.6, 6], "L"), gnd("GND", "L"), pin("TX", "uart-tx", "R", { logicV: 3.3 }), pin("RX", "uart-rx", "R", { logicV: 3.3, tolerant5V: false }), out("STATE", "digital"), inp("BRK")],
    pinoutStatus: "generic-convention", specs: { protocols: ["UART", "BLE 4.0"] }, simStatus: "blue", verification: "datasheet-referenced",
  },
  "NRF24L01 Module": {
    manufacturer: "Nordic Semiconductor (module)", model: "nRF24L01+ 2.4 GHz transceiver",
    description: "2.4 GHz SPI transceiver. VCC is 1.9–3.6 V ONLY — 5 V destroys it. Logic inputs are 5 V tolerant. Add a 10 µF capacitor across VCC/GND.",
    pins: [gnd("GND", "L"), vin("VCC", [1.9, 3.6], "L"), inp("CE"), pin("CSN", "spi-cs", "L"), pin("SCK", "spi-sck", "L"), pin("MOSI", "spi-mosi", "L"), pin("MISO", "spi-miso", "R"), out("IRQ", "digital")],
    pinoutStatus: "datasheet-referenced", specs: { voltage: "1.9–3.6 V", protocols: ["SPI", "2.4 GHz"] }, simStatus: "blue", verification: "datasheet-referenced",
  },
  "HC-12 RF Module": {
    manufacturer: "Generic (Si4463)", model: "HC-12 433 MHz serial module", description: "Long-range 433 MHz transparent serial link.",
    pins: [vin("VCC", [3.2, 5.5], "L"), gnd("GND", "L"), pin("RXD", "uart-rx", "R"), pin("TXD", "uart-tx", "R"), inp("SET")], pinoutStatus: "generic-convention", specs: { protocols: ["UART", "433 MHz"] }, simStatus: "blue", verification: "unverified",
  },
  "433MHz RF Transmitter": { description: "ASK/OOK 433 MHz transmitter (FS1000A type).", pins: [inp("DATA"), vin("VCC", [3, 12], "L"), gnd("GND", "L")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "433MHz RF Receiver": { description: "ASK/OOK 433 MHz receiver (XY-MK-5V type, 5 V).", pins: [vin("VCC", [4.5, 5.5], "L"), out("DATA", "digital"), gnd("GND", "L")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "IR Transmitter Module": { description: "IR LED transmitter module for remote-control codes.", pins: moduleVccGnd([3.3, 5], [], "VCC").concat([inp("SIG")]), pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "IR Receiver Module": { description: "38 kHz IR receiver (VS1838B type): OUT idles HIGH, pulses LOW.", pins: [out("OUT", "digital"), gnd("GND", "L"), vin("VCC", [2.7, 5.5], "L")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "RC Receiver": { description: "Hobby RC receiver: one servo-style PWM output per channel; powered at ≈5 V (often from an ESC's BEC).", pins: [vin("V+", [4, 8.4], "L"), gnd("GND", "L"), out("CH1", "digital", { note: "50 Hz pulse 1000–2000 µs" }), out("CH2", "digital"), out("CH3", "digital"), out("CH4", "digital")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "SBUS Receiver": { description: "Receiver with inverted serial S.BUS output (100 kbaud, 8E2, inverted).", pins: [vin("V+", [4, 8.4], "L"), gnd("GND", "L"), pin("SBUS", "uart-tx", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "PPM Receiver": { description: "Receiver that outputs all channels on one PPM pulse train.", pins: [vin("V+", [4, 8.4], "L"), gnd("GND", "L"), out("PPM", "digital")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "ESP-NOW Communication": { description: "ESP-NOW is Espressif's connection-less peer-to-peer protocol for ESP32/ESP8266 — a software capability, not a separate module.", simStatus: "grey", verification: "unverified" },
};

export const RC_SPECS: Record<string, SpecPatch> = {
  "HW-504 Joystick Module": {
    manufacturer: "Generic", model: "HW-504 dual-axis joystick", description: "Two 10 kΩ potentiometers (X, Y) plus a push switch that pulls SW to GND.",
    pins: [gnd("GND", "L"), vin("+5V", [3.3, 5], "L"), out("VRX", "analog", { label: "VRx" }), out("VRY", "analog", { label: "VRy" }), out("SW", "digital", { note: "Needs INPUT_PULLUP" })], pinoutStatus: "datasheet-referenced", simStatus: "blue", verification: "generic-convention",
  },
  "Dual-Axis Joystick": { description: "Two-axis analog joystick.", pins: [gnd("GND", "L"), vin("VCC", [3.3, 5], "L"), out("X", "analog"), out("Y", "analog"), out("SW", "digital")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Single-Axis Joystick": { description: "One-axis analog joystick.", pins: [gnd("GND", "L"), vin("VCC", [3.3, 5], "L"), out("OUT", "analog")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "PS2 Joystick Controller": { description: "PlayStation 2 wireless controller receiver (SPI-like protocol, 3.3 V).", pins: [out("DAT", "digital", { label: "DATA" }), inp("CMD"), gnd("GND", "L"), vin("VCC", [3.3, 3.6], "L"), inp("ATT"), inp("CLK")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "unverified" },
  "Potentiometer Speed Controller": { description: "Potentiometer used as a speed knob (analog voltage).", pins: [pin("1", "passive", "L"), out("W", "analog", { label: "Wiper" }), pin("3", "passive", "L")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Speed Control Knob": { description: "Potentiometer knob giving an analog speed setpoint.", pins: [pin("1", "passive", "L"), out("W", "analog", { label: "Wiper" }), pin("3", "passive", "L")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Emergency Stop Button": { description: "Latching mushroom switch, normally-closed contacts in series with the battery positive.", pins: [pin("1", "switch", "L"), pin("2", "switch", "R")], pinoutStatus: "generic-convention", options: [{ key: "closed", label: "Released (circuit closed)", type: "boolean", default: true }], simStatus: "green", verification: "generic-convention" },
  "Start Button": { description: "Momentary push button used to start the robot (e.g. sumo 5-second start).", pins: [pin("1", "switch", "L"), pin("2", "switch", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Stop Button": { description: "Momentary push button used to stop the robot.", pins: [pin("1", "switch", "L"), pin("2", "switch", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Direction Control Switch": { description: "SPDT switch used to select direction.", pins: [pin("COM", "switch", "L"), pin("A", "switch", "R"), pin("B", "switch", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
};
