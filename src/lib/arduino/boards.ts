/**
 * Board profiles: real Arduino pin numbering and capabilities.
 *
 * Pin numbers are the numbers you pass to pinMode()/digitalWrite() in the official cores
 * (for ESP32 / Pico / ESP8266 that is the GPIO number). Where a value is a convention rather
 * than a hardware fact it is marked with a "convention" comment.
 */
import type { BoardProfile } from "./types";

const range = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
};

function analogConstants(firstPin: number, count: number): Record<string, number> {
  const c: Record<string, number> = {};
  for (let i = 0; i < count; i++) c[`A${i}`] = firstPin + i;
  return c;
}

const uno: BoardProfile = {
  key: "uno",
  name: "Arduino Uno R3 (ATmega328P)",
  constants: {
    ...analogConstants(14, 6),
    LED_BUILTIN: 13,
    SDA: 18,
    SCL: 19,
    SS: 10,
    MOSI: 11,
    MISO: 12,
    SCK: 13,
  },
  digitalPins: range(0, 19),
  analogPins: range(14, 19),
  pwmPins: [3, 5, 6, 9, 10, 11],
  interruptPins: [2, 3], // INT0 = D2, INT1 = D3
  adcMax: 1023,
  pwmMax: 255,
  vRef: 5,
  logicV: 5,
};

const unoR4: BoardProfile = {
  key: "uno-r4",
  name: "Arduino Uno R4 Minima / WiFi (Renesas RA4M1)",
  constants: { ...analogConstants(14, 6), LED_BUILTIN: 13, SDA: 18, SCL: 19 },
  digitalPins: range(0, 19),
  analogPins: range(14, 19),
  // The six pins marked "~" on the header. (The R4 core can drive PWM on more pins.)
  pwmPins: [3, 5, 6, 9, 10, 11],
  // Conservative: D2 and D3 are interrupt-capable as on the R3; the R4 core supports more pins.
  interruptPins: [2, 3],
  // The ADC is 14-bit capable (analogReadResolution(14)); default analogRead() resolution is 10-bit.
  adcMax: 1023,
  pwmMax: 255,
  vRef: 5,
  logicV: 5,
};

const nano: BoardProfile = {
  key: "nano",
  name: "Arduino Nano (ATmega328P)",
  constants: { ...analogConstants(14, 8), LED_BUILTIN: 13, SDA: 18, SCL: 19, SS: 10, MOSI: 11, MISO: 12, SCK: 13 },
  digitalPins: range(0, 19), // A6 / A7 (20, 21) are analog-input only
  analogPins: range(14, 21),
  pwmPins: [3, 5, 6, 9, 10, 11],
  interruptPins: [2, 3],
  adcMax: 1023,
  pwmMax: 255,
  vRef: 5,
  logicV: 5,
};

const nanoEvery: BoardProfile = {
  key: "nano-every",
  name: "Arduino Nano Every (ATmega4809)",
  constants: { ...analogConstants(14, 8), LED_BUILTIN: 13 },
  // Conservative: A6/A7 (20, 21) are treated as analog inputs only.
  digitalPins: range(0, 19),
  analogPins: range(14, 21),
  pwmPins: [3, 5, 6, 9, 10],
  interruptPins: range(0, 19), // every digital pin can trigger an interrupt on the 4809
  adcMax: 1023,
  pwmMax: 255,
  vRef: 5,
  logicV: 5,
};

const proMini: BoardProfile = {
  ...nano,
  key: "pro-mini",
  // There is also a 3.3 V / 8 MHz variant; this profile is the 5 V / 16 MHz one.
  name: "Arduino Pro Mini 5V (ATmega328P)",
};

const leonardo: BoardProfile = {
  key: "leonardo",
  name: "Arduino Leonardo (ATmega32U4)",
  constants: { ...analogConstants(18, 6), LED_BUILTIN: 13 },
  digitalPins: [...range(0, 13), ...range(18, 23)],
  analogPins: range(18, 23), // A6..A11 (on D4, D6, D8, D9, D10, D12) are not modelled
  pwmPins: [3, 5, 6, 9, 10, 11, 13],
  // In interrupt-number order: INT0 = D3, INT1 = D2, INT2 = D0, INT3 = D1, INT4(INT6) = D7
  interruptPins: [3, 2, 0, 1, 7],
  adcMax: 1023,
  pwmMax: 255,
  vRef: 5,
  logicV: 5,
};

const micro: BoardProfile = { ...leonardo, key: "micro", name: "Arduino Micro (ATmega32U4)" };

const mega: BoardProfile = {
  key: "mega",
  name: "Arduino Mega 2560",
  constants: { ...analogConstants(54, 16), LED_BUILTIN: 13, SDA: 20, SCL: 21, SS: 53, MOSI: 51, MISO: 50, SCK: 52 },
  digitalPins: range(0, 69),
  analogPins: range(54, 69),
  pwmPins: [...range(2, 13), 44, 45, 46],
  // In interrupt-number order: int.0 = 2, int.1 = 3, int.2 = 21, int.3 = 20, int.4 = 19, int.5 = 18
  interruptPins: [2, 3, 21, 20, 19, 18],
  adcMax: 1023,
  pwmMax: 255,
  vRef: 5,
  logicV: 5,
};

// ESP32 DevKit V1 (30-pin, ESP32-WROOM-32). GPIO 6..11 are wired to the flash chip and are omitted.
const ESP32_GPIO = [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39];
const ESP32_INPUT_ONLY = [34, 35, 36, 39];
const ESP32_ADC1 = [32, 33, 34, 35, 36, 39];
const ESP32_ADC2 = [0, 2, 4, 12, 13, 14, 15, 25, 26, 27]; // ADC2 cannot be used while WiFi is active

const esp32: BoardProfile = {
  key: "esp32-devkit-v1",
  name: "ESP32 DevKit V1 (ESP32-WROOM-32)",
  constants: {
    // From the ESP32 Arduino core pins_arduino.h
    A0: 36, A3: 39, A4: 32, A5: 33, A6: 34, A7: 35,
    A10: 4, A11: 0, A12: 2, A13: 15, A14: 13, A15: 12, A16: 14, A17: 27, A18: 25, A19: 26,
    DAC1: 25, DAC2: 26,
    SDA: 21, SCL: 22, TX: 1, RX: 3,
    LED_BUILTIN: 2, // convention: the blue on-board LED of DevKit V1 clones is on GPIO2
  },
  digitalPins: ESP32_GPIO,
  analogPins: [...ESP32_ADC1, ...ESP32_ADC2].sort((a, b) => a - b),
  // analogWrite() (core 2.x+) uses LEDC and works on every output-capable GPIO
  pwmPins: ESP32_GPIO.filter((p) => !ESP32_INPUT_ONLY.includes(p)),
  interruptPins: ESP32_GPIO,
  adcMax: 4095, // 12-bit
  pwmMax: 255,
  vRef: 3.3,
  logicV: 3.3,
};

const PICO_GPIO = [...range(0, 22), 26, 27, 28];

const pico: BoardProfile = {
  key: "pico",
  name: "Raspberry Pi Pico (RP2040)",
  constants: { A0: 26, A1: 27, A2: 28, LED_BUILTIN: 25 },
  digitalPins: [...PICO_GPIO, 25].sort((a, b) => a - b),
  analogPins: [26, 27, 28],
  pwmPins: [...PICO_GPIO, 25].sort((a, b) => a - b),
  interruptPins: PICO_GPIO,
  adcMax: 1023, // default analogRead() resolution is 10-bit (hardware ADC is 12-bit)
  pwmMax: 255,
  vRef: 3.3,
  logicV: 3.3,
};

const picoW: BoardProfile = {
  ...pico,
  key: "pico-w",
  name: "Raspberry Pi Pico W (RP2040 + CYW43439)",
  // convention: in the arduino-pico core the LED is driven by the WiFi chip and exposed as virtual pin 64
  constants: { A0: 26, A1: 27, A2: 28, LED_BUILTIN: 64 },
  digitalPins: [...PICO_GPIO, 64],
  pwmPins: PICO_GPIO,
};

const nodemcu: BoardProfile = {
  key: "nodemcu",
  name: "NodeMCU v1.0 (ESP8266 ESP-12E)",
  constants: {
    D0: 16, D1: 5, D2: 4, D3: 0, D4: 2, D5: 14, D6: 12, D7: 13, D8: 15, D9: 3, D10: 1,
    A0: 17,
    // convention: NodeMCU has LEDs on GPIO2 (ESP-12 module) and GPIO16 (board); GPIO2 used here
    LED_BUILTIN: 2,
    SDA: 4, SCL: 5,
  },
  digitalPins: [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16],
  analogPins: [17],
  pwmPins: [0, 1, 2, 3, 4, 5, 12, 13, 14, 15], // GPIO16 has no PWM
  interruptPins: [0, 1, 2, 3, 4, 5, 12, 13, 14, 15], // GPIO16 has no interrupt
  adcMax: 1023,
  pwmMax: 255, // default analogWriteRange() is 255 since ESP8266 core 3.0
  vRef: 3.3, // the NodeMCU board divides 3.3 V down to the module's 1.0 V ADC range
  logicV: 3.3,
};

const generic: BoardProfile = {
  // convention: an Uno-compatible fallback used when the board is unknown
  ...uno,
  key: "generic",
  name: "Generic Arduino (Uno-compatible)",
};

export const BOARDS: Record<string, BoardProfile> = {
  uno,
  "uno-r4": unoR4,
  nano,
  "nano-every": nanoEvery,
  "pro-mini": proMini,
  leonardo,
  micro,
  mega,
  "esp32-devkit-v1": esp32,
  pico,
  "pico-w": picoW,
  nodemcu,
  generic,
};

/** Returns the profile for `key`, or the generic profile if unknown. */
export function getBoard(key: string | undefined | null): BoardProfile {
  if (key && Object.prototype.hasOwnProperty.call(BOARDS, key)) return BOARDS[key];
  return BOARDS.generic;
}

export type BoardArch = "avr" | "renesas" | "esp32" | "rp2040" | "esp8266";

const ARCH: Record<string, BoardArch> = {
  uno: "avr",
  nano: "avr",
  "nano-every": "avr",
  "pro-mini": "avr",
  leonardo: "avr",
  micro: "avr",
  mega: "avr",
  generic: "avr",
  "uno-r4": "renesas",
  "esp32-devkit-v1": "esp32",
  pico: "rp2040",
  "pico-w": "rp2040",
  nodemcu: "esp8266",
};

/** CPU architecture of a board (unknown keys are treated as AVR). */
export function boardArch(board: BoardProfile): BoardArch {
  return ARCH[board.key] ?? "avr";
}

/** Width of C `int` on the board: 16 on 8-bit AVR, 32 elsewhere. `double` is 32-bit on AVR too. */
export function intBitsFor(board: BoardProfile): 16 | 32 {
  return boardArch(board) === "avr" ? 16 : 32;
}

/**
 * Maps an interrupt number (what digitalPinToInterrupt() returns) back to a pin.
 * On AVR boards interrupt numbers index `interruptPins` (which is stored in interrupt-number order);
 * on the other cores digitalPinToInterrupt(pin) == pin.
 */
export function usesInterruptNumbers(board: BoardProfile): boolean {
  return boardArch(board) === "avr" && board.key !== "nano-every";
}
