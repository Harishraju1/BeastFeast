/**
 * Controller pin maps. Sources: official Arduino docs (docs.arduino.cc), Espressif ESP32 datasheet,
 * Raspberry Pi Pico datasheet, Microchip ATtiny85 datasheet. Status "datasheet-referenced" until an
 * administrator verifies them in the admin dashboard.
 */
import type { GpioCapability, PinDef } from "@/lib/types";
import { type SpecPatch, gnd, io, pin, vin, vout } from "./dsl";

type Cap = GpioCapability;

/** Arduino "classic" ATmega328P header (Uno R3 / Uno R4 share the numbering). */
function unoHeader(opts: { r4?: boolean }): PinDef[] {
  const pwm = [3, 5, 6, 9, 10, 11];
  const extra: Record<number, Cap[]> = {
    0: ["uart-rx"],
    1: ["uart-tx"],
    2: ["interrupt"],
    3: ["interrupt"],
    10: ["spi-ss"],
    11: ["spi-mosi"],
    12: ["spi-miso"],
    13: ["spi-sck"],
  };
  const iMax = opts.r4 ? 8 : 20;
  const pins: PinDef[] = [];
  for (let d = 0; d <= 13; d++) {
    const caps: Cap[] = [...(pwm.includes(d) ? (["pwm"] as Cap[]) : []), ...(extra[d] ?? [])];
    pins.push(
      io(`D${d}`, d, caps, "R", {
        iMax_mA: iMax,
        logicV: 5,
        codeNames: d === 13 ? ["LED_BUILTIN"] : undefined,
        note: d <= 1 ? "Shared with USB serial (Serial). Avoid for sensors if you use Serial.print." : undefined,
      }),
    );
  }
  for (let a = 0; a <= 5; a++) {
    const caps: Cap[] = ["analog", ...(a === 4 ? (["i2c-sda"] as Cap[]) : a === 5 ? (["i2c-scl"] as Cap[]) : [])];
    if (opts.r4 && a === 0) caps.push("dac");
    pins.push(io(`A${a}`, 14 + a, caps, "L", { codeNames: [`A${a}`], iMax_mA: iMax, logicV: 5 }));
  }
  pins.push(
    io("SDA", 18, ["i2c-sda", "analog"], "R", { label: "SDA", note: "Same signal as A4", logicV: 5 }),
    io("SCL", 19, ["i2c-scl", "analog"], "R", { label: "SCL", note: "Same signal as A5", logicV: 5 }),
    vin("VIN", opts.r4 ? [6, 24] : LINEAR_VIN_RANGE, "L", { note: opts.r4 ? "6–24 V input" : LINEAR_VIN_NOTE }),
    vout("5V", 5, "L", { vRange: [4.8, 5.25], iMax_mA: opts.r4 ? 1200 : 800, note: "Regulated 5 V output when powered from VIN/USB. Feeding 5 V in here bypasses the regulator and its protection." }),
    vout("3V3", 3.3, "L", { iMax_mA: opts.r4 ? 100 : 50 }),
    vout("IOREF", 5, "L", { iMax_mA: 0, note: "Reference only – do not power loads from IOREF" }),
    gnd("GND1", "L"),
    gnd("GND2", "L"),
    gnd("GND3", "R"),
    pin("RESET", "reset", "L"),
    pin("AREF", "nc", "R", { note: "Analog reference input" }),
  );
  return pins;
}
const unoBridges = [["GND1", "GND2", "GND3"], ["A4", "SDA"], ["A5", "SCL"]];

function nanoHeader(opts: { every?: boolean; proMini?: boolean }): PinDef[] {
  const pwm = opts.every ? [3, 5, 6, 9, 10] : [3, 5, 6, 9, 10, 11];
  const pins: PinDef[] = [];
  for (let d = 0; d <= 13; d++) {
    const caps: Cap[] = [];
    if (pwm.includes(d)) caps.push("pwm");
    if (d === 0) caps.push("uart-rx");
    if (d === 1) caps.push("uart-tx");
    if (opts.every || d === 2 || d === 3) caps.push("interrupt");
    if (d === 10) caps.push("spi-ss");
    if (d === 11) caps.push("spi-mosi");
    if (d === 12) caps.push("spi-miso");
    if (d === 13) caps.push("spi-sck");
    pins.push(io(`D${d}`, d, caps, "R", { iMax_mA: opts.every ? 20 : 20, logicV: 5, codeNames: d === 13 ? ["LED_BUILTIN"] : undefined }));
  }
  for (let a = 0; a <= 7; a++) {
    const caps: Cap[] = ["analog"];
    if (a === 4) caps.push("i2c-sda");
    if (a === 5) caps.push("i2c-scl");
    if (a >= 6 && !opts.every) caps.push("analog-only");
    const p = io(`A${a}`, 14 + a, caps, "L", { codeNames: [`A${a}`], logicV: 5 });
    if (a >= 6 && !opts.every) {
      p.caps = ["analog", "analog-only"];
      p.note = "A6/A7 are analog inputs only – digitalRead/digitalWrite do not work on them.";
    }
    pins.push(p);
  }
  if (opts.proMini) {
    pins.push(
      vin("RAW", [5.5, 12], "L", { note: "Unregulated input to the on-board regulator (5 V/16 MHz version)" }),
      vout("VCC", 5, "L", { vRange: [4.8, 5.25], iMax_mA: 150, note: "Regulated 5 V (or 3.3 V on the 8 MHz version)" }),
      gnd("GND1", "L"),
      gnd("GND2", "R"),
      pin("RST", "reset", "L"),
    );
  } else {
    pins.push(
      vin("VIN", opts.every ? [7, 21] : LINEAR_VIN_RANGE, "L", opts.every ? {} : { note: LINEAR_VIN_NOTE }),
      vout("5V", 5, "L", { vRange: [4.8, 5.25], iMax_mA: 500 }),
      vout("3V3", 3.3, "L", { iMax_mA: opts.every ? 200 : 50 }),
      gnd("GND1", "L"),
      gnd("GND2", "R"),
      pin("RST", "reset", "L"),
      pin("REF", "nc", "R", { label: "AREF" }),
    );
  }
  return pins;
}

function megaHeader(): PinDef[] {
  const pins: PinDef[] = [];
  const pwm = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46];
  const ints = [2, 3, 18, 19, 20, 21];
  const special: Record<number, Cap[]> = {
    0: ["uart-rx"], 1: ["uart-tx"], 14: ["uart-tx"], 15: ["uart-rx"], 16: ["uart-tx"], 17: ["uart-rx"], 18: ["uart-tx"], 19: ["uart-rx"],
    20: ["i2c-sda"], 21: ["i2c-scl"], 50: ["spi-miso"], 51: ["spi-mosi"], 52: ["spi-sck"], 53: ["spi-ss"],
  };
  for (let d = 0; d <= 53; d++) {
    const caps: Cap[] = [...(pwm.includes(d) ? (["pwm"] as Cap[]) : []), ...(ints.includes(d) ? (["interrupt"] as Cap[]) : []), ...(special[d] ?? [])];
    pins.push(io(`D${d}`, d, caps, d < 22 ? "R" : "B", { iMax_mA: 20, logicV: 5, codeNames: d === 13 ? ["LED_BUILTIN"] : undefined }));
  }
  for (let a = 0; a <= 15; a++) pins.push(io(`A${a}`, 54 + a, ["analog"], "L", { codeNames: [`A${a}`], logicV: 5 }));
  pins.push(
    vin("VIN", LINEAR_VIN_RANGE, "L", { note: LINEAR_VIN_NOTE }),
    vout("5V", 5, "L", { vRange: [4.8, 5.25], iMax_mA: 800 }),
    vout("3V3", 3.3, "L", { iMax_mA: 50 }),
    gnd("GND1", "L"),
    gnd("GND2", "L"),
    gnd("GND3", "B"),
    pin("RESET", "reset", "L"),
  );
  return pins;
}

function leonardoHeader(): PinDef[] {
  const pins: PinDef[] = [];
  const pwm = [3, 5, 6, 9, 10, 11, 13];
  const ints = [0, 1, 2, 3, 7];
  for (let d = 0; d <= 13; d++) {
    const caps: Cap[] = [...(pwm.includes(d) ? (["pwm"] as Cap[]) : []), ...(ints.includes(d) ? (["interrupt"] as Cap[]) : [])];
    if (d === 0) caps.push("uart-rx");
    if (d === 1) caps.push("uart-tx");
    if (d === 2) caps.push("i2c-sda");
    if (d === 3) caps.push("i2c-scl");
    if ([4, 6, 8, 9, 10, 12].includes(d)) caps.push("analog");
    pins.push(io(`D${d}`, d, caps, "R", { iMax_mA: 20, logicV: 5, note: d <= 1 ? "Serial1 (USB serial is separate on the 32U4)" : undefined }));
  }
  for (let a = 0; a <= 5; a++) pins.push(io(`A${a}`, 18 + a, ["analog"], "L", { codeNames: [`A${a}`], logicV: 5 }));
  pins.push(
    vin("VIN", LINEAR_VIN_RANGE, "L", { note: LINEAR_VIN_NOTE }),
    vout("5V", 5, "L", { vRange: [4.8, 5.25], iMax_mA: 500 }),
    vout("3V3", 3.3, "L", { iMax_mA: 50 }),
    gnd("GND1", "L"),
    gnd("GND2", "R"),
    pin("RESET", "reset", "L"),
  );
  return pins;
}

function esp32DevkitV1(): PinDef[] {
  // DOIT ESP32 DevKit V1 (30-pin). GPIO numbers are used directly in Arduino code.
  const adc1 = [32, 33, 34, 35, 36, 39];
  const adc2 = [0, 2, 4, 12, 13, 14, 15, 25, 26, 27];
  const inputOnly = [34, 35, 36, 39];
  const strap = [0, 2, 5, 12, 15];
  const header: { id: string; gpio: number; side: "L" | "R" }[] = [
    { id: "VP", gpio: 36, side: "L" }, { id: "VN", gpio: 39, side: "L" }, { id: "D34", gpio: 34, side: "L" }, { id: "D35", gpio: 35, side: "L" },
    { id: "D32", gpio: 32, side: "L" }, { id: "D33", gpio: 33, side: "L" }, { id: "D25", gpio: 25, side: "L" }, { id: "D26", gpio: 26, side: "L" },
    { id: "D27", gpio: 27, side: "L" }, { id: "D14", gpio: 14, side: "L" }, { id: "D12", gpio: 12, side: "L" }, { id: "D13", gpio: 13, side: "L" },
    { id: "D15", gpio: 15, side: "R" }, { id: "D2", gpio: 2, side: "R" }, { id: "D4", gpio: 4, side: "R" }, { id: "RX2", gpio: 16, side: "R" },
    { id: "TX2", gpio: 17, side: "R" }, { id: "D5", gpio: 5, side: "R" }, { id: "D18", gpio: 18, side: "R" }, { id: "D19", gpio: 19, side: "R" },
    { id: "D21", gpio: 21, side: "R" }, { id: "RX0", gpio: 3, side: "R" }, { id: "TX0", gpio: 1, side: "R" }, { id: "D22", gpio: 22, side: "R" },
    { id: "D23", gpio: 23, side: "R" },
  ];
  const pins: PinDef[] = header.map(({ id, gpio, side }) => {
    const caps: Cap[] = ["interrupt"];
    if (inputOnly.includes(gpio)) caps.push("input-only");
    else caps.push("pwm");
    if (adc1.includes(gpio) || adc2.includes(gpio)) caps.push("analog");
    if (strap.includes(gpio)) caps.push("boot-strap");
    if (gpio === 25 || gpio === 26) caps.push("dac");
    if (gpio === 21) caps.push("i2c-sda");
    if (gpio === 22) caps.push("i2c-scl");
    if (gpio === 23) caps.push("spi-mosi");
    if (gpio === 19) caps.push("spi-miso");
    if (gpio === 18) caps.push("spi-sck");
    if (gpio === 5) caps.push("spi-ss");
    if (gpio === 1 || gpio === 17) caps.push("uart-tx");
    if (gpio === 3 || gpio === 16) caps.push("uart-rx");
    const notes: string[] = [];
    if (inputOnly.includes(gpio)) notes.push("Input only, no internal pull-up/pull-down.");
    if (adc2.includes(gpio)) notes.push("ADC2 channel: analogRead unavailable while Wi-Fi is active.");
    if (strap.includes(gpio)) notes.push("Strapping pin: external pull-ups/downs can stop the board booting.");
    return io(id, gpio, caps, side, { label: id, logicV: 3.3, iMax_mA: 20, tolerant5V: false, note: notes.join(" ") || undefined, codeNames: [String(gpio)] });
  });
  pins.push(
    vin("VIN", [4.5, 12], "L", { note: "Usually 5 V. Feeds the on-board AMS1117-3.3 regulator; higher inputs heat the regulator." }),
    vout("3V3", 3.3, "R", { iMax_mA: 500, vRange: [3.0, 3.6] }),
    gnd("GND1", "L"),
    gnd("GND2", "R"),
    pin("EN", "reset", "L", { note: "Chip enable / reset" }),
  );
  return pins;
}

function picoHeader(w: boolean): PinDef[] {
  const pins: PinDef[] = [];
  const exposed = [...Array(23).keys(), 26, 27, 28];
  for (const g of exposed) {
    const caps: Cap[] = ["pwm", "interrupt"];
    if (g >= 26) caps.push("analog");
    if (g === 4) caps.push("i2c-sda");
    if (g === 5) caps.push("i2c-scl");
    if (g === 0) caps.push("uart-tx");
    if (g === 1) caps.push("uart-rx");
    if (g === 16) caps.push("spi-miso");
    if (g === 17) caps.push("spi-ss");
    if (g === 18) caps.push("spi-sck");
    if (g === 19) caps.push("spi-mosi");
    pins.push(
      io(`GP${g}`, g, caps, g < 16 ? "L" : "R", {
        label: `GP${g}`,
        logicV: 3.3,
        tolerant5V: false,
        iMax_mA: 12,
        codeNames: g >= 26 ? [`A${g - 26}`, String(g)] : [String(g)],
      }),
    );
  }
  pins.push(
    vin("VSYS", [1.8, 5.5], "R", { note: "Main system input (1.8–5.5 V)" }),
    vout("VBUS", 5, "R", { note: "USB 5 V when powered over USB" }),
    vout("3V3", 3.3, "R", { iMax_mA: 300, note: "On-board buck-boost output; keep load under 300 mA" }),
    gnd("GND1", "L"),
    gnd("GND2", "L"),
    gnd("GND3", "R"),
    gnd("AGND", "R", "AGND"),
    pin("RUN", "reset", "R"),
  );
  if (w) pins.find((p) => p.id === "GP22")!.note = "GPIO23–25 and 29 are used by the wireless chip on Pico W.";
  return pins;
}

function nodemcu(): PinDef[] {
  const map: [string, number, Cap[], string?][] = [
    ["D0", 16, [], "GPIO16: no PWM/interrupt; used for deep-sleep wake"],
    ["D1", 5, ["pwm", "interrupt", "i2c-scl"]],
    ["D2", 4, ["pwm", "interrupt", "i2c-sda"]],
    ["D3", 0, ["pwm", "interrupt", "boot-strap"], "GPIO0: boot mode pin, must be HIGH at boot"],
    ["D4", 2, ["pwm", "interrupt", "boot-strap"], "GPIO2: on-board LED, must be HIGH at boot"],
    ["D5", 14, ["pwm", "interrupt", "spi-sck"]],
    ["D6", 12, ["pwm", "interrupt", "spi-miso"]],
    ["D7", 13, ["pwm", "interrupt", "spi-mosi"]],
    ["D8", 15, ["pwm", "interrupt", "spi-ss", "boot-strap"], "GPIO15: must be LOW at boot"],
    ["RX", 3, ["uart-rx", "interrupt"]],
    ["TX", 1, ["uart-tx", "interrupt"]],
  ];
  const pins: PinDef[] = map.map(([id, g, caps, note], i) =>
    io(id, g, caps, i < 6 ? "R" : "R", { label: id, logicV: 3.3, tolerant5V: false, iMax_mA: 12, note, codeNames: [id, String(g)] }),
  );
  pins.push(
    io("A0", 17, ["analog", "analog-only"], "L", { codeNames: ["A0"], note: "Single ADC input; NodeMCU board divider gives a 0–3.3 V range", logicV: 3.3 }),
    vin("VIN", [4.5, 10], "L", { note: "Usually 5 V into the on-board 3.3 V regulator" }),
    vout("3V3", 3.3, "L", { iMax_mA: 300 }),
    gnd("GND1", "L"),
    gnd("GND2", "R"),
    pin("RST", "reset", "L"),
    pin("EN", "nc", "L"),
  );
  return pins;
}

function attiny85(): PinDef[] {
  return [
    io("PB0", 0, ["pwm", "i2c-sda", "spi-mosi"], "R", { label: "PB0 (pin 5)", logicV: 5 }),
    io("PB1", 1, ["pwm", "spi-miso"], "R", { label: "PB1 (pin 6)", logicV: 5 }),
    io("PB2", 2, ["analog", "interrupt", "i2c-scl", "spi-sck"], "R", { label: "PB2 (pin 7)", codeNames: ["A1"], logicV: 5 }),
    io("PB3", 3, ["analog"], "L", { label: "PB3 (pin 2)", codeNames: ["A3"], logicV: 5 }),
    io("PB4", 4, ["analog", "pwm"], "L", { label: "PB4 (pin 3)", codeNames: ["A2"], logicV: 5 }),
    pin("PB5", "reset", "L", { label: "PB5/RESET (pin 1)" }),
    vin("VCC", [2.7, 5.5], "R", { label: "VCC (pin 8)" }),
    gnd("GND", "L", "GND (pin 4)"),
  ];
}

/**
 * VIN of ATmega boards with an on-board linear 5 V regulator (Uno R3, Nano, Mega, Leonardo, Micro).
 * Arduino: 7–12 V recommended, 6–20 V limits. The accepted range reaches 13 V so a fully charged 3S LiPo
 * (12.6 V, the club's standard 4WD battery) is accepted — validation adds a suggestion above 12 V because the
 * regulator runs warm. Higher voltages (e.g. 4S, 16.8 V) overheat the linear regulator under robot loads and
 * stay flagged as over-voltage.
 */
export const LINEAR_VIN_RANGE: [number, number] = [7, 13];
export const LINEAR_VIN_NOTE = "7–12 V recommended (6–20 V absolute limits). A fully charged 3S LiPo (12.6 V) is accepted; above ≈13 V the on-board linear regulator overheats.";
/** Boards whose VIN feeds a linear regulator: VIN above this is accepted but flagged as a suggestion. */
export const LINEAR_VIN_RECOMMENDED_MAX: Record<string, number> = { uno: 12, nano: 12, mega: 12, leonardo: 12, micro: 12 };

const docs = (s: string) => `https://docs.arduino.cc/hardware/${s}/`;

export const CONTROLLER_SPECS: Record<string, SpecPatch> = {
  "Arduino Uno R3": {
    manufacturer: "Arduino", model: "UNO R3 (A000066)", board: "uno",
    description: "ATmega328P 5 V board, 14 digital I/O (6 PWM), 6 analog inputs, 16 MHz. The reference board for most workshops.",
    pins: unoHeader({}), bridges: unoBridges, pinoutStatus: "datasheet-referenced",
    specs: { voltage: "7–12 V on VIN (USB 5 V)", logicVoltage: 5, current: "20 mA per I/O pin recommended (40 mA abs. max)", protocols: ["UART", "I2C", "SPI"], dimensions: { x: 68.6, y: 53.4, z: 15 }, weight_g: 25 },
    datasheetUrl: docs("uno-rev3"), simStatus: "green", verification: "datasheet-referenced",
  },
  "Arduino Uno R4": {
    manufacturer: "Arduino", model: "UNO R4 Minima / WiFi", board: "uno-r4",
    description: "Renesas RA4M1 (Arm Cortex-M4, 48 MHz) on the classic UNO header, 5 V logic, 6–24 V VIN, DAC on A0.",
    pins: unoHeader({ r4: true }), bridges: unoBridges, pinoutStatus: "datasheet-referenced",
    specs: { voltage: "6–24 V on VIN", logicVoltage: 5, current: "8 mA per I/O pin", protocols: ["UART", "I2C", "SPI", "CAN"], dimensions: { x: 68.6, y: 53.4, z: 15 } },
    datasheetUrl: docs("uno-r4-minima"), simStatus: "green", verification: "datasheet-referenced",
  },
  "Arduino Nano": {
    manufacturer: "Arduino", model: "Nano (A000005)", board: "nano",
    description: "Breadboard-friendly ATmega328P board. Same core as the Uno with two extra analog-only inputs (A6, A7).",
    pins: nanoHeader({}), bridges: [["GND1", "GND2"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "7–12 V on VIN (USB 5 V)", logicVoltage: 5, current: "20 mA per I/O pin recommended", protocols: ["UART", "I2C", "SPI"], dimensions: { x: 45, y: 18, z: 8 }, weight_g: 7 },
    datasheetUrl: docs("nano"), simStatus: "green", verification: "datasheet-referenced",
  },
  "Arduino Nano Every": {
    manufacturer: "Arduino", model: "Nano Every (ABX00028)", board: "nano-every",
    description: "ATmega4809 board in Nano form factor. 5 PWM pins (3, 5, 6, 9, 10), 7–21 V VIN.",
    pins: nanoHeader({ every: true }), bridges: [["GND1", "GND2"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "7–21 V on VIN", logicVoltage: 5, protocols: ["UART", "I2C", "SPI"], dimensions: { x: 45, y: 18, z: 8 }, weight_g: 5 },
    datasheetUrl: docs("nano-every"), simStatus: "green", verification: "datasheet-referenced",
  },
  "Arduino Pro Mini": {
    manufacturer: "Arduino / SparkFun", model: "Pro Mini 5 V 16 MHz", board: "pro-mini",
    description: "Minimal ATmega328P board without USB (program with a USB-to-TTL adapter). Choose 5 V/16 MHz or 3.3 V/8 MHz.",
    pins: nanoHeader({ proMini: true }), bridges: [["GND1", "GND2"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "RAW up to 12 V", logicVoltage: 5, protocols: ["UART", "I2C", "SPI"], dimensions: { x: 33, y: 18, z: 4 } },
    datasheetUrl: docs("pro-mini"), simStatus: "green", verification: "datasheet-referenced",
  },
  "Arduino Micro": {
    manufacturer: "Arduino", model: "Micro (A000053)", board: "micro",
    description: "ATmega32U4 board with native USB in a small form factor; PWM on 3, 5, 6, 9, 10, 11, 13.",
    pins: leonardoHeader(), bridges: [["GND1", "GND2"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "7–12 V on VIN", logicVoltage: 5, protocols: ["UART", "I2C", "SPI", "USB"], dimensions: { x: 48, y: 18, z: 8 } },
    datasheetUrl: docs("micro"), simStatus: "green", verification: "datasheet-referenced",
  },
  "Arduino Leonardo": {
    manufacturer: "Arduino", model: "Leonardo (A000057)", board: "leonardo",
    description: "ATmega32U4 board on the Uno footprint; I2C is on D2/D3 and Serial1 on D0/D1.",
    pins: leonardoHeader(), bridges: [["GND1", "GND2"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "7–12 V on VIN", logicVoltage: 5, protocols: ["UART", "I2C", "SPI", "USB"], dimensions: { x: 68.6, y: 53.3, z: 15 } },
    datasheetUrl: docs("leonardo"), simStatus: "green", verification: "datasheet-referenced",
  },
  "Arduino Mega 2560": {
    manufacturer: "Arduino", model: "Mega 2560 Rev3 (A000067)", board: "mega",
    description: "ATmega2560 board: 54 digital I/O (15 PWM), 16 analog inputs, 4 hardware UARTs.",
    pins: megaHeader(), bridges: [["GND1", "GND2", "GND3"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "7–12 V on VIN", logicVoltage: 5, current: "20 mA per I/O pin recommended", protocols: ["UART×4", "I2C", "SPI"], dimensions: { x: 101.5, y: 53.3, z: 15 }, weight_g: 37 },
    datasheetUrl: docs("mega-2560"), simStatus: "green", verification: "datasheet-referenced",
  },
  "ESP32 DevKit V1": {
    manufacturer: "DOIT (Espressif ESP32-WROOM-32)", model: "ESP32 DevKit V1 (30-pin)", board: "esp32-devkit-v1",
    description: "Dual-core 240 MHz Wi-Fi + Bluetooth board. 3.3 V logic — its pins are NOT 5 V tolerant.",
    pins: esp32DevkitV1(), bridges: [["GND1", "GND2"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "5 V via USB/VIN", logicVoltage: 3.3, current: "≈20 mA per pin recommended (40 mA abs. max per Espressif)", protocols: ["UART", "I2C", "SPI", "Wi-Fi", "Bluetooth", "ESP-NOW"], dimensions: { x: 51.5, y: 28, z: 10 } },
    datasheetUrl: "https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf", simStatus: "blue", verification: "datasheet-referenced",
  },
  "Raspberry Pi Pico (RP2040 microcontroller board, not an SBC)": {
    manufacturer: "Raspberry Pi", model: "Pico (RP2040)", board: "pico",
    description: "RP2040 dual Cortex-M0+ microcontroller board (not a Linux computer). 3.3 V logic, 26 usable GPIO, 3 ADC inputs.",
    pins: picoHeader(false), bridges: [["GND1", "GND2", "GND3", "AGND"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "VSYS 1.8–5.5 V", logicVoltage: 3.3, protocols: ["UART×2", "I2C×2", "SPI×2", "PIO"], dimensions: { x: 51, y: 21, z: 4 }, weight_g: 3 },
    datasheetUrl: "https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf", simStatus: "blue", verification: "datasheet-referenced",
  },
  "Raspberry Pi Pico W (RP2040 microcontroller board, not an SBC)": {
    manufacturer: "Raspberry Pi", model: "Pico W (RP2040 + CYW43439)", board: "pico-w",
    description: "Pico with 2.4 GHz Wi-Fi/Bluetooth. Same header as the Pico.",
    pins: picoHeader(true), bridges: [["GND1", "GND2", "GND3", "AGND"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "VSYS 1.8–5.5 V", logicVoltage: 3.3, protocols: ["UART", "I2C", "SPI", "Wi-Fi", "Bluetooth"], dimensions: { x: 51, y: 21, z: 4 } },
    datasheetUrl: "https://datasheets.raspberrypi.com/picow/pico-w-datasheet.pdf", simStatus: "blue", verification: "datasheet-referenced",
  },
  "ESP8266 NodeMCU": {
    manufacturer: "NodeMCU (Espressif ESP8266)", model: "NodeMCU v2/v3 (ESP-12E)", board: "nodemcu",
    description: "ESP8266 Wi-Fi board. 3.3 V logic, a single ADC input, several boot-strapping pins.",
    pins: nodemcu(), bridges: [["GND1", "GND2"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "5 V via USB/VIN", logicVoltage: 3.3, protocols: ["UART", "I2C (software)", "SPI", "Wi-Fi"], dimensions: { x: 49, y: 26, z: 7 } },
    datasheetUrl: "https://www.espressif.com/sites/default/files/documentation/0a-esp8266ex_datasheet_en.pdf", simStatus: "blue", verification: "datasheet-referenced",
  },
  ATtiny85: {
    manufacturer: "Microchip", model: "ATtiny85 (DIP-8)", board: "generic",
    description: "8-pin AVR microcontroller: 5 usable I/O, 3 PWM, 4 ADC channels. Needs an external programmer.",
    pins: attiny85(), bridges: [], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "2.7–5.5 V (ATtiny85)", logicVoltage: 5, protocols: ["USI (I2C/SPI)"], dimensions: { x: 9.8, y: 7.6, z: 4.5 } },
    datasheetUrl: "https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-2586-AVR-8-bit-Microcontroller-ATtiny25-ATtiny45-ATtiny85_Datasheet.pdf", simStatus: "blue", verification: "datasheet-referenced",
  },
  "ESP-01": {
    manufacturer: "Ai-Thinker (Espressif ESP8266)", model: "ESP-01", board: "generic",
    description: "Tiny ESP8266 module with 8 pins. 3.3 V only — 5 V on VCC or RX damages it.",
    pins: [
      pin("GND", "gnd", "L"), pin("GPIO2", "gpio", "L", { arduinoPin: 2, caps: ["digital", "boot-strap"], logicV: 3.3 }),
      pin("GPIO0", "gpio", "L", { arduinoPin: 0, caps: ["digital", "boot-strap"], logicV: 3.3 }),
      pin("RX", "uart-rx", "L", { logicV: 3.3, tolerant5V: false }), pin("TX", "uart-tx", "R", { logicV: 3.3 }),
      pin("EN", "in-digital", "R", { label: "CH_PD/EN", note: "Must be pulled HIGH to run" }), pin("RST", "reset", "R"), vin("VCC", [3.0, 3.6], "R"),
    ],
    bridges: [], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "3.0–3.6 V", logicVoltage: 3.3, current: "Up to ≈170 mA peaks during Wi-Fi TX", protocols: ["UART", "Wi-Fi"], dimensions: { x: 24.8, y: 14.3, z: 10 } },
    simStatus: "blue", verification: "datasheet-referenced",
  },
};

/** Section 9 lists the same hardware as "ESP-01 Wi-Fi Module". */
CONTROLLER_SPECS["ESP-01 Wi-Fi Module"] = { ...CONTROLLER_SPECS["ESP-01"], board: undefined, simStatus: "blue" };
