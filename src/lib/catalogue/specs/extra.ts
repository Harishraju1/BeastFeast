/** Remaining entries that have a function-standard interface (I2C breakouts, 3-wire industrial sensors, etc.). */
import type { PinDef } from "@/lib/types";
import { type SpecPatch, gnd, io, out, pin, vin, vout } from "./dsl";
import { COMMS_SPECS } from "./power-comms";

const i2cBreakout = (desc: string, range: [number, number] = [3.3, 5]): SpecPatch => ({
  description: `${desc} Pins shown are the four common to I2C breakouts (VCC, GND, SCL, SDA) — check your board for extra pins. Needs a library the BEAST interpreter does not run yet.`,
  pins: [vin("VCC", range, "L"), gnd("GND", "L"), pin("SCL", "i2c-scl", "R"), pin("SDA", "i2c-sda", "R")],
  pinoutStatus: "generic-convention", specs: { protocols: ["I2C"] }, sensor: { kind: "imu", estimated: true }, simStatus: "blue", verification: "generic-convention",
});

const npn3wire = (desc: string): SpecPatch => ({
  description: `${desc} Typical 3-wire NPN industrial sensor: brown +V (often 6–36 V), blue 0 V, black output (open collector — needs a pull-up to the controller's logic voltage).`,
  pins: [vin("BROWN", [6, 36], "L", { label: "Brown (+V)" }), gnd("BLUE", "L", "Blue (0 V)"), out("BLACK", "digital", { label: "Black (OUT, NPN)" })],
  pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention",
});

function duePins(): PinDef[] {
  const pins: PinDef[] = [];
  for (let d = 0; d <= 53; d++) {
    const caps: ("pwm" | "interrupt" | "uart-rx" | "uart-tx" | "i2c-sda" | "i2c-scl")[] = ["interrupt"];
    if (d >= 2 && d <= 13) caps.push("pwm");
    if (d === 0) caps.push("uart-rx");
    if (d === 1) caps.push("uart-tx");
    if (d === 20) caps.push("i2c-sda");
    if (d === 21) caps.push("i2c-scl");
    pins.push(io(`D${d}`, d, caps, d < 22 ? "R" : "B", { logicV: 3.3, tolerant5V: false, iMax_mA: 15 }));
  }
  for (let a = 0; a <= 11; a++) pins.push(io(`A${a}`, 54 + a, ["analog"], "L", { codeNames: [`A${a}`], logicV: 3.3, tolerant5V: false }));
  pins.push(
    pin("DAC0", "out-analog", "L"), pin("DAC1", "out-analog", "L"),
    vin("VIN", [7, 12], "L"), vout("5V", 5, "L", { iMax_mA: 800 }), vout("3V3", 3.3, "L", { iMax_mA: 800 }),
    gnd("GND1", "L"), gnd("GND2", "B"), pin("RESET", "reset", "L"),
  );
  return pins;
}

export const EXTRA_SPECS: Record<string, SpecPatch> = {
  "Arduino Due": {
    manufacturer: "Arduino", model: "Due (A000062)", board: "generic",
    description: "Atmel SAM3X8E Arm Cortex-M3 (84 MHz) on the Mega footprint. 3.3 V logic — applying 5 V to any I/O pin can damage it.",
    pins: duePins(), bridges: [["GND1", "GND2"]], pinoutStatus: "datasheet-referenced",
    specs: { voltage: "7–12 V on VIN", logicVoltage: 3.3, protocols: ["UART×4", "I2C×2", "SPI", "CAN", "USB"], dimensions: { x: 101.5, y: 53.3, z: 15 } },
    datasheetUrl: "https://docs.arduino.cc/hardware/due/", simStatus: "blue", verification: "datasheet-referenced",
  },
  "NRF24L01+ PA/LNA Module": { ...COMMS_SPECS["NRF24L01 Module"], model: "nRF24L01+ with PA/LNA and antenna", description: "Long-range nRF24L01+ with power amplifier. 3.3 V only; draws ≈115 mA peaks — use a dedicated 3.3 V regulator and a capacitor." },
  "FlySky Receiver": { ...COMMS_SPECS["RC Receiver"], manufacturer: "FlySky", description: "FlySky receiver (e.g. FS-iA6): per-channel servo PWM outputs, some models also i-BUS/PPM." },
  MPU9250: i2cBreakout("9-axis IMU (gyro, accelerometer, magnetometer)."),
  MPU6500: i2cBreakout("6-axis IMU (gyro + accelerometer)."),
  "ICM-20948": i2cBreakout("9-axis IMU."),
  "ICM-42688": i2cBreakout("High-performance 6-axis IMU."),
  LSM6DS3: i2cBreakout("6-axis IMU."),
  ADXL345: i2cBreakout("3-axis accelerometer."),
  BNO055: i2cBreakout("9-axis absolute orientation sensor with on-chip fusion."),
  BNO085: i2cBreakout("9-axis orientation sensor with on-chip fusion."),
  LIS3DH: i2cBreakout("3-axis accelerometer."),
  L3G4200D: i2cBreakout("3-axis gyroscope."),
  INA226: { ...i2cBreakout("Current/power monitor (36 V bus)."), sensor: undefined },
  "TFmini-S LiDAR": {
    manufacturer: "Benewake", model: "TFmini-S",
    description: "Single-point LiDAR, 0.1–12 m, UART (115200 baud) or I2C. 5 V supply, 3.3 V TTL signals.",
    pins: [vin("5V", [4.5, 6], "L", { label: "Red (+5 V)" }), gnd("GND", "L", "Black (GND)"), pin("TX", "uart-tx", "R", { label: "Green (TX)", logicV: 3.3 }), pin("RX", "uart-rx", "R", { label: "White (RX)", logicV: 3.3 })],
    pinoutStatus: "datasheet-referenced", specs: { protocols: ["UART", "I2C"], extra: { Range: "0.1–12 m" } }, simStatus: "blue", verification: "datasheet-referenced",
  },
  "Inductive Proximity Sensor": npn3wire("Detects metal objects at short range."),
  "Capacitive Proximity Sensor": npn3wire("Detects most materials at short range."),
  "Photoelectric Sensor": npn3wire("Optical presence detector."),
  "18650 Single Cell Holder": { description: "Holds one 18650 cell (1S, 3.7 V). Mechanical part — set the series count on the cell itself.", simStatus: "yellow", verification: "generic-convention" },
  "18650 Dual Cell Holder": { description: "Holds two 18650 cells in series (2S, 7.4 V nominal).", simStatus: "yellow", verification: "generic-convention" },
  "18650 Triple Cell Holder": { description: "Holds three 18650 cells in series (3S, 11.1 V nominal).", simStatus: "yellow", verification: "generic-convention" },
  "18650 Four Cell Holder": { description: "Holds four 18650 cells in series (4S, 14.8 V nominal).", simStatus: "yellow", verification: "generic-convention" },
};
