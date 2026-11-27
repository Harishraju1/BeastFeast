/**
 * Motor drivers, ESCs and motors.
 * Electrical limits come from the referenced manufacturer datasheets / product pages.
 * Simulation parameters flagged `estimated: true` are typical values used ONLY by the physics engine
 * and are shown to students as estimates; they can be overridden per instance or corrected by admins.
 */
import type { MotorSimParams, PinDef } from "@/lib/types";
import { type SpecPatch, gnd, inp, pin, vin, vout } from "./dsl";

const mo = (id: string, extra: Partial<PinDef> = {}) => pin(id, "motor-out", "R", extra);
const term = (): PinDef[] => [pin("M+", "motor-term", "L", { label: "M+" }), pin("M-", "motor-term", "R", { label: "M−" })];

/** Generic two-input H-bridge IC pinout (IN1/IN2 control). */
function inInBridge(vm: [number, number], note: string): PinDef[] {
  return [vin("VM", vm, "L", { note }), gnd("GND", "L"), inp("IN1", "pwm"), inp("IN2", "pwm"), mo("OUT1"), mo("OUT2")];
}

export const DRIVER_SPECS: Record<string, SpecPatch> = {
  L298N: {
    manufacturer: "STMicroelectronics (L298) – generic red module", model: "L298N dual H-bridge module",
    description:
      "Dual full-bridge driver module built on the ST L298. Bipolar output stage drops roughly 2 V or more, so a 7.4 V battery delivers noticeably less to the motors. Has an on-board 78M05 5 V regulator enabled by the '12V' jumper.",
    pins: [
      vin("VS", [5, 35], "L", { label: "+12V (VS)", note: "Motor supply. With the 5V-regulator jumper fitted keep VS ≤ 12 V." }),
      gnd("GND", "L"),
      vout("5V", 5, "L", { label: "+5V", iMax_mA: 500, note: "OUTPUT (from 78M05) when the regulator jumper is fitted; must be FED 5 V when the jumper is removed." }),
      inp("ENA", "pwm", { note: "PWM speed input for motor A. Remove the ENA jumper to control speed." }),
      inp("IN1"), inp("IN2"), inp("IN3"), inp("IN4"),
      inp("ENB", "pwm", { note: "PWM speed input for motor B." }),
      mo("OUT1"), mo("OUT2"), mo("OUT3"), mo("OUT4"),
    ],
    bridges: [], pinoutStatus: "datasheet-referenced",
    options: [
      { key: "regJumper", label: "5V regulator jumper fitted", type: "boolean", default: true, help: "Fitted: 5V pin is an output. Remove it when VS > 12 V and supply 5 V yourself." },
      { key: "regType", label: "On-board 5 V regulator", type: "select", default: "78m05", choices: [{ value: "78m05", label: "78M05 (common red module)" }, { value: "none", label: "None on my module — +5V is an input only" }], help: "Check your board: most red L298N modules carry a 78M05 next to the jumper; some clones have no regulator." },
      { key: "enaJumper", label: "ENA jumper fitted (always full speed)", type: "boolean", default: false },
      { key: "enbJumper", label: "ENB jumper fitted (always full speed)", type: "boolean", default: false },
    ],
    specs: { voltage: "VS 5–35 V (≤12 V with regulator jumper)", logicVoltage: 5, current: "2 A per channel continuous, 3 A peak (L298 datasheet)", dimensions: { x: 43, y: 43, z: 27 }, weight_g: 30, extra: { "Typical voltage drop": "≈1.8–3.2 V at 1 A (datasheet Vce(sat) total)" } },
    driver: { channels: 2, dropV: 2.0, contCurrentA: 2, peakCurrentA: 3, scheme: "in-in-en", estimated: true },
    datasheetUrl: "https://www.st.com/resource/en/datasheet/l298.pdf", simStatus: "green", verification: "datasheet-referenced",
  },
  L293D: {
    manufacturer: "Texas Instruments / ST", model: "L293D (DIP-16)",
    description: "Quadruple half-H driver with internal flyback diodes: two DC motors at up to 600 mA each. Needs 5 V logic (VCC1) and a separate motor supply (VCC2).",
    pins: [
      inp("EN12", "pwm", { label: "1,2EN (pin 1)" }), inp("1A", "digital", { label: "1A (pin 2)" }), mo("1Y", { label: "1Y (pin 3)" }),
      gnd("GND1", "L", "GND (4,5)"), mo("2Y", { label: "2Y (pin 6)" }), inp("2A", "digital", { label: "2A (pin 7)" }),
      vin("VCC2", [4.5, 36], "L", { label: "VCC2 motor (pin 8)" }), inp("EN34", "pwm", { label: "3,4EN (pin 9)" }),
      inp("3A", "digital", { label: "3A (pin 10)" }), mo("3Y", { label: "3Y (pin 11)" }), gnd("GND2", "R", "GND (12,13)"),
      mo("4Y", { label: "4Y (pin 14)" }), inp("4A", "digital", { label: "4A (pin 15)" }), vin("VCC1", [4.5, 7], "R", { label: "VCC1 logic (pin 16)" }),
    ],
    bridges: [["GND1", "GND2"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "VCC1 4.5–7 V logic, VCC2 4.5–36 V motor", logicVoltage: 5, current: "600 mA per channel, 1.2 A peak", dimensions: { x: 20, y: 7, z: 5 } },
    driver: { channels: 2, dropV: 2.6, contCurrentA: 0.6, peakCurrentA: 1.2, scheme: "in-in-en", estimated: true },
    datasheetUrl: "https://www.ti.com/lit/ds/symlink/l293d.pdf", simStatus: "green", verification: "datasheet-referenced",
  },
  "L293D Motor Shield": {
    manufacturer: "Adafruit Motor Shield v1 (and clones)", model: "L293D shield with 74HC595",
    description: "Uno shield with two L293D chips driven through a 74HC595 shift register (AFMotor library). Motor pins are not directly addressable, so the BEAST interpreter cannot drive it.",
    pins: [vin("EXT_PWR", [4.5, 25], "L", { label: "EXT_PWR +" }), gnd("GND", "L"), mo("M1A"), mo("M1B"), mo("M2A"), mo("M2B"), mo("M3A"), mo("M3B"), mo("M4A"), mo("M4B")],
    bridges: [], pinoutStatus: "generic-convention",
    specs: { voltage: "4.5–25 V motor supply", current: "600 mA per channel" },
    simStatus: "grey", verification: "unverified",
  },
  TB6612FNG: {
    manufacturer: "Toshiba (Pololu #713 / SparkFun breakout)", model: "TB6612FNG dual motor driver carrier",
    description: "Dual MOSFET H-bridge, ~0.5 Ω total on-resistance: far less voltage loss than an L298N. Separate VM (motor) and VCC (logic) supplies; STBY must be HIGH.",
    pins: [
      vin("VM", [4.5, 13.5], "L", { note: "Motor supply 4.5–13.5 V (15 V abs. max)" }), vin("VCC", [2.7, 5.5], "L", { note: "Logic supply" }), gnd("GND", "L"),
      inp("PWMA", "pwm"), inp("AIN1"), inp("AIN2"), inp("STBY", "digital", { note: "Pull HIGH to enable the driver" }), inp("BIN1"), inp("BIN2"), inp("PWMB", "pwm"),
      mo("AO1"), mo("AO2"), mo("BO1"), mo("BO2"),
    ],
    bridges: [], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "VM 4.5–13.5 V, VCC 2.7–5.5 V", logicVoltage: 5, current: "1.2 A per channel continuous, 3.2 A peak", dimensions: { x: 20.3, y: 20.3, z: 3 } },
    driver: { channels: 2, dropV: 0.6, contCurrentA: 1.2, peakCurrentA: 3.2, scheme: "in-in-pwm-standby", estimated: true },
    datasheetUrl: "https://www.pololu.com/product/713", simStatus: "green", verification: "datasheet-referenced",
  },
  DRV8833: {
    manufacturer: "Texas Instruments (Pololu #2130 carrier)", model: "DRV8833 dual motor driver carrier",
    description: "Low-voltage dual H-bridge (2.7–10.8 V). Speed and direction are both set by PWM on the IN pins; no separate logic supply.",
    pins: [
      vin("VIN", [2.7, 10.8], "L", { label: "VIN (VM)" }), gnd("GND", "L"),
      inp("AIN1", "pwm"), inp("AIN2", "pwm"), inp("BIN1", "pwm"), inp("BIN2", "pwm"),
      inp("SLEEP", "digital", { label: "nSLEEP", note: "Driver sleeps when LOW. Check whether your carrier pulls it up." }),
      out("FAULT", "digital", { label: "nFAULT" }),
      mo("AOUT1"), mo("AOUT2"), mo("BOUT1"), mo("BOUT2"),
    ],
    bridges: [], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "2.7–10.8 V", logicVoltage: 5, current: "1.2 A per channel continuous, 2 A peak", dimensions: { x: 20.3, y: 12.7, z: 3 } },
    driver: { channels: 2, dropV: 0.4, contCurrentA: 1.2, peakCurrentA: 2, scheme: "in-in", estimated: true },
    datasheetUrl: "https://www.ti.com/lit/ds/symlink/drv8833.pdf", simStatus: "green", verification: "datasheet-referenced",
  },
  DRV8835: {
    manufacturer: "Texas Instruments (Pololu #2135 carrier)", model: "DRV8835 dual motor driver carrier",
    description: "Dual low-voltage H-bridge (motor 0–11 V, logic 2–7 V). MODE pin selects IN/IN or PHASE/ENABLE control.",
    pins: [
      vin("VIN", [1.5, 11], "L", { label: "VIN (VM)" }), vin("VCC", [2, 7], "L"), gnd("GND", "L"), inp("MODE"),
      inp("AIN1", "pwm", { label: "AIN1/APHASE" }), inp("AIN2", "pwm", { label: "AIN2/AENBL" }), inp("BIN1", "pwm", { label: "BIN1/BPHASE" }), inp("BIN2", "pwm", { label: "BIN2/BENBL" }),
      mo("AOUT1"), mo("AOUT2"), mo("BOUT1"), mo("BOUT2"),
    ],
    bridges: [], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "VM 0–11 V, VCC 2–7 V", current: "1.2 A per channel continuous, 1.5 A peak" },
    driver: { channels: 2, dropV: 0.4, contCurrentA: 1.2, peakCurrentA: 1.5, scheme: "in-in", estimated: true },
    datasheetUrl: "https://www.pololu.com/product/2135", simStatus: "green", verification: "datasheet-referenced",
  },
  DRV8871: {
    manufacturer: "Texas Instruments (Adafruit #3190 breakout)", model: "DRV8871 single brushed motor driver",
    description: "Single H-bridge, 6.5–45 V, current limited by the sense resistor (≈2 A on the Adafruit board, 3.6 A peak IC).",
    pins: inInBridge([6.5, 45], "Motor supply"), bridges: [], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "6.5–45 V", current: "3.6 A peak" },
    driver: { channels: 1, dropV: 0.6, contCurrentA: 2, peakCurrentA: 3.6, scheme: "in-in", estimated: true },
    datasheetUrl: "https://www.ti.com/lit/ds/symlink/drv8871.pdf", simStatus: "green", verification: "datasheet-referenced",
  },
  DRV8876: {
    manufacturer: "Texas Instruments", model: "DRV8876 H-bridge (PH/EN or PWM mode)",
    description: "Single H-bridge 4.5–37 V with current sense. Shown in PWM (IN1/IN2) mode; PH/EN mode is set by the PMODE pin.",
    pins: inInBridge([4.5, 37], "Motor supply"), bridges: [], pinoutStatus: "generic-convention",
    specs: { voltage: "4.5–37 V", current: "3.5 A peak" },
    datasheetUrl: "https://www.ti.com/lit/ds/symlink/drv8876.pdf", simStatus: "blue", verification: "datasheet-referenced",
  },
  MX1508: {
    manufacturer: "Generic module", model: "MX1508 dual H-bridge module",
    description: "Tiny low-cost dual driver for small 2–10 V motors. Direction and speed via PWM on IN1–IN4.",
    pins: [vin("VCC", [2, 10], "L", { label: "+" }), gnd("GND", "L", "−"), inp("IN1", "pwm"), inp("IN2", "pwm"), inp("IN3", "pwm"), inp("IN4", "pwm"), mo("MA1", { label: "MOTOR-A" }), mo("MA2", { label: "MOTOR-A" }), mo("MB1", { label: "MOTOR-B" }), mo("MB2", { label: "MOTOR-B" })],
    bridges: [], pinoutStatus: "generic-convention",
    specs: { voltage: "2–10 V", current: "≈1.5 A per channel (seller rating, unverified)", dimensions: { x: 24, y: 21, z: 5 } },
    driver: { channels: 2, dropV: 0.5, contCurrentA: 1.5, peakCurrentA: 2.5, scheme: "in-in", estimated: true },
    simStatus: "green", verification: "unverified",
  },
  BTS7960: {
    manufacturer: "Infineon BTS7960 (IBT-2 style module)", model: "BTS7960 43 A H-bridge module",
    description: "High-current single-motor driver for heavy robots. Two PWM inputs (RPWM forward, LPWM reverse) and two enables.",
    pins: [
      vin("VCC", [4.5, 5.5], "L", { note: "5 V logic supply" }), gnd("GND", "L"),
      inp("RPWM", "pwm"), inp("LPWM", "pwm"), inp("R_EN"), inp("L_EN"), out("R_IS", "analog", { label: "R_IS (current sense)" }), out("L_IS", "analog", { label: "L_IS (current sense)" }),
      vin("B+", [6, 27], "R", { label: "B+ (motor supply)" }), gnd("B-", "R", "B−"), mo("M+"), mo("M-", { label: "M−" }),
    ],
    bridges: [["GND", "B-"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "6–27 V motor, 5 V logic", current: "43 A peak (IC); continuous depends on cooling", dimensions: { x: 50, y: 50, z: 43 } },
    driver: { channels: 1, dropV: 0.3, contCurrentA: 15, peakCurrentA: 43, scheme: "rpwm-lpwm", estimated: true },
    datasheetUrl: "https://www.infineon.com/dgdl/Infineon-BTS7960-DS-v01_00-EN.pdf?fileId=db3a30433fa9412f013fbe32289b7c17", simStatus: "green", verification: "datasheet-referenced",
  },
};
DRIVER_SPECS["IBT-2"] = { ...DRIVER_SPECS.BTS7960, model: "IBT-2 (BTS7960 module)" };
DRIVER_SPECS["Cytron MD10C"] = {
  manufacturer: "Cytron", model: "MD10C",
  description: "Single-channel 13 A driver with sign-magnitude control: PWM sets speed, DIR sets direction.",
  pins: [gnd("GND", "L", "GND (signal)"), inp("PWM", "pwm"), inp("DIR"), vin("POWER+", [5, 30], "R"), gnd("POWER-", "R", "POWER−"), mo("MA", { label: "MOTOR A" }), mo("MB", { label: "MOTOR B" })],
  bridges: [["GND", "POWER-"]], pinoutStatus: "datasheet-referenced",
  specs: { voltage: "5–30 V", current: "13 A continuous, 30 A peak" },
  driver: { channels: 1, dropV: 0.3, contCurrentA: 13, peakCurrentA: 30, scheme: "pwm-dir", estimated: true },
  datasheetUrl: "https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver", simStatus: "green", verification: "datasheet-referenced",
};
DRIVER_SPECS["Cytron MDD10A"] = {
  manufacturer: "Cytron", model: "MDD10A",
  description: "Dual-channel 10 A sign-magnitude driver (PWM + DIR per channel). Popular for sumo and race robots.",
  pins: [gnd("GND", "L", "GND (signal)"), inp("PWM1", "pwm"), inp("DIR1"), inp("PWM2", "pwm"), inp("DIR2"), vin("POWER+", [5, 30], "R"), gnd("POWER-", "R", "POWER−"), mo("M1A"), mo("M1B"), mo("M2A"), mo("M2B")],
  bridges: [["GND", "POWER-"]], pinoutStatus: "datasheet-referenced",
  specs: { voltage: "5–30 V", current: "10 A continuous, 30 A peak per channel" },
  driver: { channels: 2, dropV: 0.3, contCurrentA: 10, peakCurrentA: 30, scheme: "pwm-dir", estimated: true },
  simStatus: "green", verification: "datasheet-referenced",
};
for (const [name, vm, cur, url] of [
  ["A4950", [8, 40], "3.5 A peak", "https://www.allegromicro.com/-/media/files/datasheets/a4950-datasheet.pdf"],
  ["TB67H450FNG", [4.5, 44], "3.5 A peak", null],
  ["DRV8251", [4.5, 48], "4.1 A peak", "https://www.ti.com/lit/ds/symlink/drv8251.pdf"],
] as const) {
  DRIVER_SPECS[name] = {
    description: `Single brushed-DC H-bridge IC with IN1/IN2 PWM control (${vm[0]}–${vm[1]} V).`,
    pins: inInBridge([vm[0], vm[1]], "Motor supply"), bridges: [], pinoutStatus: "generic-convention",
    specs: { voltage: `${vm[0]}–${vm[1]} V`, current: cur }, datasheetUrl: url, simStatus: "blue", verification: "datasheet-referenced",
  };
}

// ── Stepper drivers (design & connection only — steppers are not part of the wheel physics) ──
DRIVER_SPECS.A4988 = {
  manufacturer: "Allegro (Pololu carrier)", model: "A4988 stepper driver carrier",
  description: "Microstepping bipolar stepper driver. STEP/DIR interface, current limit set by the trimmer.",
  pins: [inp("ENABLE"), inp("MS1"), inp("MS2"), inp("MS3"), inp("RESET"), inp("SLEEP"), inp("STEP"), inp("DIR"), vin("VMOT", [8, 35], "R"), gnd("GND1", "R"), mo("2B"), mo("2A"), mo("1A"), mo("1B"), vin("VDD", [3, 5.5], "R"), gnd("GND2", "R")],
  bridges: [["GND1", "GND2"]], pinoutStatus: "datasheet-referenced",
  specs: { voltage: "VMOT 8–35 V, VDD 3–5.5 V", current: "≈1 A per phase without cooling, 2 A with" },
  datasheetUrl: "https://www.pololu.com/product/1182", simStatus: "blue", verification: "datasheet-referenced",
};
DRIVER_SPECS.DRV8825 = {
  manufacturer: "Texas Instruments (Pololu carrier)", model: "DRV8825 stepper driver carrier",
  description: "Up to 1/32 microstepping bipolar stepper driver, STEP/DIR interface.",
  pins: [inp("EN", "digital", { label: "ENABLE" }), inp("M0"), inp("M1"), inp("M2"), inp("RESET"), inp("SLEEP"), inp("STEP"), inp("DIR"), vin("VMOT", [8.2, 45], "R"), gnd("GND1", "R", "GND MOT"), mo("B2"), mo("B1"), mo("A1"), mo("A2"), out("FAULT", "digital"), gnd("GND2", "R", "GND LOGIC")],
  bridges: [["GND1", "GND2"]], pinoutStatus: "datasheet-referenced",
  specs: { voltage: "8.2–45 V", current: "1.5 A per phase without cooling, 2.2 A with" },
  datasheetUrl: "https://www.pololu.com/product/2133", simStatus: "blue", verification: "datasheet-referenced",
};
for (const name of ["TMC2208", "TMC2209"]) {
  DRIVER_SPECS[name] = {
    manufacturer: "Trinamic (StepStick module)", model: `${name} StepStick`,
    description: "Silent StepStick-format stepper driver with STEP/DIR and UART configuration.",
    pins: [inp("EN"), inp("MS1"), inp("MS2"), pin("PDN_UART", "uart-rx", "L"), inp("STEP"), inp("DIR"), vin("VM", [5.5, 28], "R", { note: "Check module rating" }), gnd("GND1", "R"), mo("M2B"), mo("M2A"), mo("M1A"), mo("M1B"), vin("VIO", [3, 5.2], "R"), gnd("GND2", "R")],
    bridges: [["GND1", "GND2"]], pinoutStatus: "generic-convention",
    specs: { voltage: "VM up to ≈28–29 V (module dependent)", current: "≈1.4 A RMS (module dependent)" }, simStatus: "blue", verification: "unverified",
  };
}
DRIVER_SPECS.ULN2003 = {
  manufacturer: "Generic ULN2003 driver board", model: "ULN2003 Darlington array board",
  description: "Seven-channel Darlington sink driver, most often used for the 28BYJ-48 unipolar stepper.",
  pins: [inp("IN1"), inp("IN2"), inp("IN3"), inp("IN4"), vin("V+", [5, 12], "R", { label: "+ (5–12 V)" }), gnd("GND", "R", "−"), mo("A"), mo("B"), mo("C"), mo("D"), pin("COM", "vout", "R", { label: "COM (+)" })],
  bridges: [["V+", "COM"]], pinoutStatus: "generic-convention",
  specs: { voltage: "5–12 V", current: "500 mA per channel" }, simStatus: "blue", verification: "datasheet-referenced",
};
DRIVER_SPECS.TB6600 = {
  manufacturer: "Generic TB6600 module", model: "TB6600 stepper driver",
  description: "Enclosed stepper driver with opto-isolated PUL/DIR/ENA inputs, 9–42 V.",
  pins: [inp("PUL+"), inp("PUL-"), inp("DIR+"), inp("DIR-"), inp("ENA+"), inp("ENA-"), mo("A+"), mo("A-"), mo("B+"), mo("B-"), vin("VCC", [9, 42], "R"), gnd("GND", "R")],
  bridges: [], pinoutStatus: "generic-convention",
  specs: { voltage: "9–42 V", current: "Up to 4 A (switch selectable)" }, simStatus: "blue", verification: "unverified",
};

// ── Brushless ESCs (standard 3-wire servo-style signal lead) ──
const escPins = (bec: boolean): PinDef[] => [
  vin("BAT+", [6, 26], "L", { note: "Check the ESC's rated cell count" }), gnd("BAT-", "L", "BAT−"),
  inp("SIG", "pwm", { note: "50 Hz servo-style pulse 1000–2000 µs" }), gnd("SGND", "L", "Signal GND"),
  ...(bec ? [vout("BEC5V", 5, "L", { label: "BEC +5V", iMax_mA: 2000 })] : []),
  mo("A"), mo("B"), mo("C"),
];
DRIVER_SPECS["BLDC ESC"] = { description: "Electronic speed controller for a 3-phase brushless motor. Driven by a servo-style PWM pulse.", pins: escPins(false), bridges: [["BAT-", "SGND"]], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" };
DRIVER_SPECS["Brushless ESC with BEC"] = { description: "ESC with a Battery Eliminator Circuit: the signal lead's red wire SUPPLIES ≈5 V.", pins: escPins(true), bridges: [["BAT-", "SGND"]], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" };
DRIVER_SPECS["Brushless ESC without BEC"] = { description: "ESC without BEC (opto): you must power the receiver/controller separately.", pins: escPins(false), bridges: [["BAT-", "SGND"]], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" };

function out(id: string, kind: "digital" | "analog", extra: Partial<PinDef> = {}): PinDef {
  return pin(id, kind === "digital" ? "out-digital" : "out-analog", "R", extra);
}

// ───────────────────────────── Motors ─────────────────────────────

const est = (p: Omit<MotorSimParams, "estimated">): MotorSimParams => ({ ...p, estimated: true });

const motorCustomOptions = [
  { key: "customParams", label: "Use my own motor parameters", type: "boolean" as const, default: false, help: "Enter values from YOUR motor's datasheet. Used by the simulator." },
  { key: "nominalVoltage", label: "Rated voltage", type: "number" as const, default: 6, min: 1, max: 48, step: 0.1, unit: "V" },
  { key: "noLoadRpm", label: "No-load speed (output shaft)", type: "number" as const, default: 200, min: 1, max: 30000, step: 1, unit: "rpm" },
  { key: "stallTorqueKgCm", label: "Stall torque", type: "number" as const, default: 0.8, min: 0.01, max: 100, step: 0.01, unit: "kg·cm" },
  { key: "stallCurrentA", label: "Stall current", type: "number" as const, default: 1.5, min: 0.05, max: 100, step: 0.05, unit: "A" },
  { key: "invert", label: "Mounted reversed", type: "boolean" as const, default: false },
];

export const MOTOR_SPECS: Record<string, SpecPatch> = {
  "TT Yellow Gear Motor": {
    manufacturer: "Generic (Adafruit #3777 reference)", model: "TT DC gearbox motor 1:48",
    description: "Plastic-gearbox hobby motor used in most beginner 2WD kits. Double D-shaft, 3–6 V.",
    specs: { voltage: "3–6 V", current: "≈150–200 mA no-load", dimensions: { x: 70, y: 22.5, z: 18.8 }, weight_g: 30, extra: { "Gear ratio": "1:48", "Speed @6 V": "≈200 rpm no-load", "Stall torque @6 V": "≈0.8 kg·cm" } },
    motor: est({ nominalVoltage: 6, noLoadRpm: 200, stallTorqueNm: 0.078, stallCurrentA: 1.5, noLoadCurrentA: 0.17, source: "Adafruit #3777 product data (speed, torque); stall current estimated" }),
    datasheetUrl: "https://www.adafruit.com/product/3777", simStatus: "green", verification: "datasheet-referenced",
  },
  "BO Gear Motor": {
    manufacturer: "Generic", model: "BO (battery-operated) plastic gear motor",
    description: "Low-cost plastic gear motor common in Indian robotics kits; sold in many RPM variants (60–300 rpm).",
    specs: { voltage: "3–12 V (variant dependent)", dimensions: { x: 65, y: 22, z: 19 }, weight_g: 30 },
    motor: est({ nominalVoltage: 6, noLoadRpm: 150, stallTorqueNm: 0.1, stallCurrentA: 1.0, noLoadCurrentA: 0.12, source: "Typical 150 rpm variant – estimated" }),
    simStatus: "green", verification: "unverified",
  },
  "N20 Micro Metal Gear Motor": {
    manufacturer: "Generic (N20 / 12GA)", model: "N20 micro metal gearmotor",
    description: "12 mm metal-gear micro motor with 3 mm D-shaft — compact and light, ideal for line followers and mini-sumo. Many ratio variants.",
    specs: { voltage: "3–12 V (variant dependent)", dimensions: { x: 24, y: 12, z: 10 }, weight_g: 10 },
    motor: est({ nominalVoltage: 6, noLoadRpm: 300, stallTorqueNm: 0.04, stallCurrentA: 0.7, noLoadCurrentA: 0.06, source: "Typical 6 V 300 rpm variant – estimated" }),
    simStatus: "green", verification: "unverified",
  },
  "25GA370 Gear Motor": {
    manufacturer: "Generic (JGA25-370)", model: "25 mm metal gearmotor",
    description: "25 mm metal gearbox motor, often with a Hall encoder. Strong enough for medium race and sumo robots.",
    specs: { voltage: "6–12 V (variant dependent)", dimensions: { x: 70, y: 25, z: 25 }, weight_g: 95 },
    motor: est({ nominalVoltage: 12, noLoadRpm: 300, stallTorqueNm: 0.4, stallCurrentA: 2.0, noLoadCurrentA: 0.1, source: "Typical 12 V 300 rpm variant – estimated" }),
    simStatus: "green", verification: "unverified",
  },
  "37GB520 Gear Motor": {
    manufacturer: "Generic (JGB37-520)", model: "37 mm metal gearmotor",
    description: "37 mm gearbox motor with high torque; common in sumo and heavier robots.",
    specs: { voltage: "12 V typical", dimensions: { x: 85, y: 37, z: 37 }, weight_g: 180 },
    motor: est({ nominalVoltage: 12, noLoadRpm: 330, stallTorqueNm: 0.9, stallCurrentA: 3.0, noLoadCurrentA: 0.15, source: "Typical 12 V 330 rpm variant – estimated" }),
    simStatus: "green", verification: "unverified",
  },
  "Johnson DC Gear Motor": {
    manufacturer: "Johnson Electric style", model: "Johnson geared DC motor",
    description: "Heavy-duty side-shaft geared motor used in large robots.",
    specs: { voltage: "12 V typical", weight_g: 250 },
    motor: est({ nominalVoltage: 12, noLoadRpm: 300, stallTorqueNm: 1.2, stallCurrentA: 5.0, noLoadCurrentA: 0.3, source: "Typical 12 V 300 rpm – estimated" }),
    simStatus: "green", verification: "unverified",
  },
  SG90: { manufacturer: "TowerPro", model: "SG90 micro servo", description: "9 g plastic-gear micro servo, ≈180° travel.", specs: { voltage: "4.8–6 V", weight_g: 9, extra: { "Stall torque": "≈1.8 kg·cm @4.8 V" }, dimensions: { x: 23, y: 12.2, z: 29 } }, verification: "datasheet-referenced" },
  MG90S: { manufacturer: "TowerPro", model: "MG90S metal-gear micro servo", description: "Metal-gear version of the micro servo.", specs: { voltage: "4.8–6 V", weight_g: 13.4, extra: { "Stall torque": "≈1.8–2.2 kg·cm" }, dimensions: { x: 22.8, y: 12.2, z: 28.5 } }, verification: "datasheet-referenced" },
  MG995: { manufacturer: "TowerPro", model: "MG995 standard servo", description: "Standard-size metal-gear servo.", specs: { voltage: "4.8–7.2 V", weight_g: 55, extra: { "Stall torque": "≈8.5–10 kg·cm" }, dimensions: { x: 40.7, y: 19.7, z: 42.9 } }, verification: "datasheet-referenced" },
  MG996R: { manufacturer: "TowerPro", model: "MG996R high-torque servo", description: "Upgraded MG995; stall current can exceed 2 A — never power it from the Arduino 5V pin.", specs: { voltage: "4.8–7.2 V", weight_g: 55, current: "Stall ≈2.5 A", extra: { "Stall torque": "≈9.4–11 kg·cm" }, dimensions: { x: 40.7, y: 19.7, z: 42.9 } }, verification: "datasheet-referenced" },
  DS3218: { manufacturer: "DSSERVO", model: "DS3218 digital servo", description: "20 kg·cm class digital servo.", specs: { voltage: "4.8–6.8 V", weight_g: 60, extra: { "Stall torque": "≈20 kg·cm" } }, verification: "datasheet-referenced" },
  DS3225: { manufacturer: "DSSERVO", model: "DS3225 digital servo", description: "25 kg·cm class digital servo.", specs: { voltage: "4.8–6.8 V", weight_g: 60, extra: { "Stall torque": "≈25 kg·cm" } }, verification: "datasheet-referenced" },
  "NEMA 17": { description: "42 mm frame bipolar stepper (typically 1.8°/step).", specs: { dimensions: { x: 42.3, y: 42.3, z: 40 } }, verification: "generic-convention" },
  "NEMA 23": { description: "57 mm frame bipolar stepper (typically 1.8°/step).", specs: { dimensions: { x: 56.4, y: 56.4, z: 56 } }, verification: "generic-convention" },
  "NEMA 14": { description: "35 mm frame bipolar stepper.", specs: { dimensions: { x: 35, y: 35, z: 28 } }, verification: "generic-convention" },
  "28BYJ-48": {
    description: "5 V unipolar geared stepper (≈1:64), usually driven with a ULN2003 board. 2048 full steps per output revolution.",
    pins: [pin("BLUE", "motor-term", "L", { label: "Blue (A)" }), pin("PINK", "motor-term", "L", { label: "Pink (B)" }), pin("YELLOW", "motor-term", "R", { label: "Yellow (C)" }), pin("ORANGE", "motor-term", "R", { label: "Orange (D)" }), pin("RED", "vin", "L", { label: "Red (+5 V common)", vRange: [4.5, 5.5] })],
    pinoutStatus: "datasheet-referenced",
    specs: { voltage: "5 V", dimensions: { x: 28, y: 28, z: 19 }, weight_g: 30 }, verification: "datasheet-referenced",
  },
};

export const MOTOR_DEFAULTS = { term, motorCustomOptions };
