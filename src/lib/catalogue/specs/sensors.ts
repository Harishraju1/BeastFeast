/** Sensor modules. Pinouts follow the common breakout boards named in `model`. */
import type { PinDef } from "@/lib/types";
import { type SpecPatch, gnd, moduleVccGnd, out, pin, vin, inp } from "./dsl";

const arrayOut = (n: number, kind: "digital" | "analog", prefix = "S"): PinDef[] =>
  Array.from({ length: n }, (_, i) => out(`${prefix}${i + 1}`, kind, { label: `${prefix}${i + 1}` }));

const qtrPins = (n: number, kind: "analog" | "rc", ledOn = true): PinDef[] => [
  vin("VCC", [3.3, 5], "L"),
  gnd("GND", "L"),
  ...(ledOn ? [inp("LEDON", "digital", { label: "LEDON (CTRL)", note: "Optional: drive LOW to switch the IR LEDs off" })] : []),
  ...Array.from({ length: n }, (_, i) =>
    kind === "analog"
      ? out(`${i + 1}`, "analog", { label: `OUT${i + 1}` })
      : pin(`${i + 1}`, "out-digital", "R", { label: `OUT${i + 1} (RC)`, note: "RC timing output: charge as OUTPUT, then time the decay as INPUT" }),
  ),
];

export const SENSOR_SPECS: Record<string, SpecPatch> = {
  TCRT5000: {
    manufacturer: "Vishay TCRT5000 (common LM393 comparator module)", model: "TCRT5000 IR reflectance module",
    description:
      "IR LED + phototransistor reflectance sensor. The common module adds an LM393 comparator: D0 goes HIGH over a black line (no reflection) and LOW over white; A0 gives the raw analog level. Best sensing distance ≈2.5 mm (sensor element datasheet).",
    pins: moduleVccGnd([3.3, 5], [out("D0", "digital", { label: "D0" }), out("A0", "analog", { label: "A0" })]),
    pinoutStatus: "datasheet-referenced",
    specs: { voltage: "3.3–5 V (module)", current: "≈20 mA (IR LED)", dimensions: { x: 32, y: 14, z: 10 }, extra: { "Peak sensing distance": "2.5 mm (sensor element)" } },
    sensor: { kind: "reflectance-digital", channels: 1, blackLevel: 1, estimated: true },
    datasheetUrl: "https://www.vishay.com/docs/83760/tcrt5000.pdf", simStatus: "green", verification: "datasheet-referenced",
  },
  CNY70: {
    manufacturer: "Vishay", model: "CNY70 reflective optical sensor (bare part)",
    description: "Bare reflective sensor: needs a series resistor for the IR LED (e.g. 220 Ω at 5 V) and a pull-up on the phototransistor (e.g. 10 kΩ).",
    pins: [pin("A", "anode", "L", { label: "A (LED anode)" }), pin("K", "cathode", "L", { label: "K (LED cathode)" }), pin("C", "passive", "R", { label: "C (collector)" }), pin("E", "passive", "R", { label: "E (emitter)" })],
    pinoutStatus: "datasheet-referenced", specs: { dimensions: { x: 7, y: 7, z: 6 } },
    datasheetUrl: "https://www.vishay.com/docs/83751/cny70.pdf", simStatus: "blue", verification: "datasheet-referenced",
  },
  "QTR-1A": { manufacturer: "Pololu", model: "QTR-1A reflectance sensor", description: "Single analog reflectance sensor: output voltage rises as reflectance falls (black ≈ high).", pins: moduleVccGnd([5, 5], [out("OUT", "analog")], "VIN"), pinoutStatus: "datasheet-referenced", sensor: { kind: "reflectance-analog", channels: 1, estimated: true }, datasheetUrl: "https://www.pololu.com/product/2458", simStatus: "green", verification: "datasheet-referenced" },
  "QTR-1RC": { manufacturer: "Pololu", model: "QTR-1RC reflectance sensor", description: "Single RC-timing reflectance sensor read with a digital pin (longer decay = darker).", pins: moduleVccGnd([5, 5], [pin("OUT", "out-digital", "R", { note: "RC timing output" })], "VIN"), pinoutStatus: "datasheet-referenced", sensor: { kind: "reflectance-array-rc", channels: 1, estimated: true }, datasheetUrl: "https://www.pololu.com/product/2459", simStatus: "blue", verification: "datasheet-referenced" },
  "QTR-3A": { manufacturer: "Pololu", model: "QTR-3A reflectance array", description: "3-channel analog reflectance array.", pins: qtrPins(3, "analog", false), pinoutStatus: "generic-convention", sensor: { kind: "reflectance-array-analog", channels: 3, pitch_mm: 9.525, estimated: true }, simStatus: "green", verification: "unverified" },
  "QTR-3RC": { manufacturer: "Pololu", model: "QTR-3RC reflectance array", description: "3-channel RC-timing reflectance array.", pins: qtrPins(3, "rc", false), pinoutStatus: "generic-convention", sensor: { kind: "reflectance-array-rc", channels: 3, pitch_mm: 9.525, estimated: true }, simStatus: "blue", verification: "unverified" },
  "QTR-5RC": { manufacturer: "Pololu-style", model: "5-channel RC reflectance array", description: "5-channel RC-timing reflectance array.", pins: qtrPins(5, "rc"), pinoutStatus: "generic-convention", sensor: { kind: "reflectance-array-rc", channels: 5, pitch_mm: 9.525, estimated: true }, simStatus: "blue", verification: "unverified" },
  "QTR-8A": {
    manufacturer: "Pololu", model: "QTR-8A reflectance sensor array (#960)",
    description: "8 analog reflectance sensors at 9.525 mm pitch. Each output is 0–VCC: higher voltage = less reflection (black line).",
    pins: qtrPins(8, "analog"), pinoutStatus: "datasheet-referenced",
    specs: { voltage: "3.3–5 V", current: "≈100 mA (LEDs on)", dimensions: { x: 74.9, y: 12.7, z: 3.2 }, weight_g: 3 },
    sensor: { kind: "reflectance-array-analog", channels: 8, pitch_mm: 9.525, estimated: true },
    datasheetUrl: "https://www.pololu.com/product/960", simStatus: "green", verification: "datasheet-referenced",
  },
  "QTR-8RC": {
    manufacturer: "Pololu", model: "QTR-8RC reflectance sensor array (#961)",
    description: "8 RC-timing reflectance sensors at 9.525 mm pitch, read with digital pins (no ADC needed).",
    pins: qtrPins(8, "rc"), pinoutStatus: "datasheet-referenced",
    specs: { voltage: "3.3–5 V", current: "≈100 mA (LEDs on)", dimensions: { x: 74.9, y: 12.7, z: 3.2 }, weight_g: 3 },
    sensor: { kind: "reflectance-array-rc", channels: 8, pitch_mm: 9.525, estimated: true },
    datasheetUrl: "https://www.pololu.com/product/961", simStatus: "blue", verification: "datasheet-referenced",
  },
  "QTRX-HD Sensor Array": { manufacturer: "Pololu", model: "QTRX-HD series", description: "High-density (4 mm pitch) reflectance arrays in several lengths; analog or RC variants.", simStatus: "grey", verification: "unverified" },
  "3-Channel IR Sensor Array": { manufacturer: "Generic module", model: "3-channel digital IR array", description: "Three comparator-based IR reflectance channels with digital outputs.", pins: moduleVccGnd([3.3, 5], arrayOut(3, "digital")), pinoutStatus: "generic-convention", sensor: { kind: "reflectance-array-digital", channels: 3, pitch_mm: 15, blackLevel: 1, estimated: true }, simStatus: "green", verification: "generic-convention" },
  "5-Channel IR Sensor Array": { manufacturer: "Generic module", model: "5-channel digital IR array", description: "Five comparator-based IR reflectance channels with digital outputs.", pins: moduleVccGnd([3.3, 5], arrayOut(5, "digital")), pinoutStatus: "generic-convention", sensor: { kind: "reflectance-array-digital", channels: 5, pitch_mm: 15, blackLevel: 1, estimated: true }, simStatus: "green", verification: "generic-convention" },
  "8-Channel IR Sensor Array": { manufacturer: "Generic module", model: "8-channel analog IR array", description: "Eight-channel IR reflectance array with analog outputs.", pins: moduleVccGnd([3.3, 5], arrayOut(8, "analog")), pinoutStatus: "generic-convention", sensor: { kind: "reflectance-array-analog", channels: 8, pitch_mm: 10, estimated: true }, simStatus: "green", verification: "generic-convention" },
  "Analog IR Sensor": { description: "Single analog IR reflectance sensor (VCC, GND, analog OUT).", pins: moduleVccGnd([3.3, 5], [out("OUT", "analog")]), pinoutStatus: "generic-convention", sensor: { kind: "reflectance-analog", channels: 1, estimated: true }, simStatus: "green", verification: "generic-convention" },
  "Digital IR Sensor": { description: "Single digital IR reflectance sensor with comparator output (HIGH over black).", pins: moduleVccGnd([3.3, 5], [out("OUT", "digital")]), pinoutStatus: "generic-convention", sensor: { kind: "reflectance-digital", channels: 1, blackLevel: 1, estimated: true }, simStatus: "green", verification: "generic-convention" },
  "IR Reflectance Sensor Module": { description: "IR reflectance module with digital (and often analog) output.", pins: moduleVccGnd([3.3, 5], [out("D0", "digital"), out("A0", "analog")]), pinoutStatus: "generic-convention", sensor: { kind: "reflectance-digital", channels: 1, blackLevel: 1, estimated: true }, simStatus: "green", verification: "generic-convention" },

  "HC-SR04": {
    manufacturer: "Generic (Cytron/ElecFreaks datasheet)", model: "HC-SR04 ultrasonic ranging module",
    description: "40 kHz ultrasonic rangefinder. A 10 µs HIGH pulse on TRIG starts a ping; ECHO stays HIGH for the round-trip time (≈58 µs per cm). 5 V module.",
    pins: [vin("VCC", [4.5, 5.5], "L"), inp("TRIG", "digital", { label: "Trig" }), out("ECHO", "digital", { label: "Echo", logicV: 5 }), gnd("GND", "L")],
    pinoutStatus: "datasheet-referenced",
    specs: { voltage: "5 V", current: "15 mA", dimensions: { x: 45, y: 20, z: 15 }, weight_g: 9, extra: { Range: "2–400 cm", "Measuring angle": "≈15°" } },
    sensor: { kind: "ultrasonic", minRange_mm: 20, maxRange_mm: 4000, fovDeg: 15, estimated: false },
    datasheetUrl: "https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf", simStatus: "green", verification: "datasheet-referenced",
  },
  "HC-SR05": { description: "Ultrasonic rangefinder similar to HC-SR04 with an extra OUT pin.", pins: [vin("VCC", [4.5, 5.5], "L"), inp("TRIG"), out("ECHO", "digital"), out("OUT", "digital"), gnd("GND", "L")], pinoutStatus: "generic-convention", sensor: { kind: "ultrasonic", minRange_mm: 20, maxRange_mm: 4000, fovDeg: 15, estimated: true }, simStatus: "green", verification: "unverified" },
  "US-100": { description: "Ultrasonic rangefinder with temperature compensation; pulse (jumper off) or UART (jumper on) mode, 3–5 V.", pins: [vin("VCC", [3, 5.5], "L"), inp("TRIG", "digital", { label: "Trig/TX" }), out("ECHO", "digital", { label: "Echo/RX" }), gnd("GND1", "L"), gnd("GND2", "L")], bridges: [["GND1", "GND2"]], pinoutStatus: "generic-convention", sensor: { kind: "ultrasonic", minRange_mm: 20, maxRange_mm: 4500, fovDeg: 15, estimated: true }, simStatus: "green", verification: "unverified" },
  "JSN-SR04T": { description: "Waterproof ultrasonic sensor with a separate probe; minimum range ≈20–25 cm.", pins: [vin("5V", [4.5, 5.5], "L"), inp("TRIG"), out("ECHO", "digital"), gnd("GND", "L")], pinoutStatus: "generic-convention", sensor: { kind: "ultrasonic", minRange_mm: 250, maxRange_mm: 4500, fovDeg: 45, estimated: true }, simStatus: "green", verification: "unverified" },
  VL53L0X: {
    manufacturer: "STMicroelectronics (common breakout)", model: "VL53L0X time-of-flight sensor",
    description: "Laser ToF distance sensor up to ≈2 m over I2C (address 0x29). Needs a library (not supported by the BEAST interpreter yet).",
    pins: [vin("VIN", [2.6, 5.5], "L", { note: "Breakout with on-board regulator" }), gnd("GND", "L"), pin("SCL", "i2c-scl", "R"), pin("SDA", "i2c-sda", "R"), inp("XSHUT"), out("GPIO1", "digital")],
    pinoutStatus: "generic-convention", specs: { protocols: ["I2C"], extra: { Range: "up to ≈2 m" } },
    sensor: { kind: "tof", minRange_mm: 30, maxRange_mm: 2000, fovDeg: 25, estimated: true },
    datasheetUrl: "https://www.st.com/resource/en/datasheet/vl53l0x.pdf", simStatus: "blue", verification: "datasheet-referenced",
  },
  VL53L1X: { manufacturer: "STMicroelectronics", model: "VL53L1X ToF breakout", description: "Long-range (up to ≈4 m) laser ToF sensor over I2C.", pins: [vin("VIN", [2.6, 5.5], "L"), gnd("GND", "L"), pin("SCL", "i2c-scl", "R"), pin("SDA", "i2c-sda", "R"), inp("XSHUT"), out("GPIO1", "digital")], pinoutStatus: "generic-convention", specs: { protocols: ["I2C"] }, datasheetUrl: "https://www.st.com/resource/en/datasheet/vl53l1x.pdf", simStatus: "blue", verification: "datasheet-referenced" },
  VL53L4CD: { manufacturer: "STMicroelectronics", model: "VL53L4CD ToF breakout", description: "Short-range (≈1 mm–1.3 m) high-accuracy ToF sensor over I2C.", pins: [vin("VIN", [2.6, 5.5], "L"), gnd("GND", "L"), pin("SCL", "i2c-scl", "R"), pin("SDA", "i2c-sda", "R"), inp("XSHUT"), out("GPIO1", "digital")], pinoutStatus: "generic-convention", specs: { protocols: ["I2C"] }, simStatus: "blue", verification: "unverified" },
  "Sharp GP2Y0A21YK0F": {
    manufacturer: "Sharp", model: "GP2Y0A21YK0F",
    description: "Analog IR triangulation distance sensor, 10–80 cm. Output voltage falls non-linearly with distance (≈3.1 V at 10 cm to ≈0.4 V at 80 cm). Readings below 10 cm fold back and look 'far'.",
    pins: [out("VO", "analog", { label: "Vo", logicV: 3.1, note: "Analog output ≈0.4–3.1 V (datasheet), safe for 3.3 V ADCs" }), gnd("GND", "L"), vin("VCC", [4.5, 5.5], "L")],
    pinoutStatus: "datasheet-referenced",
    specs: { voltage: "4.5–5.5 V", current: "≈30 mA", dimensions: { x: 44.5, y: 18.9, z: 13.5 }, extra: { Range: "10–80 cm" } },
    sensor: { kind: "ir-distance-analog", minRange_mm: 100, maxRange_mm: 800, fovDeg: 5, estimated: false },
    datasheetUrl: "https://global.sharp/products/device/lineup/data/pdf/datasheet/gp2y0a21yk_e.pdf", simStatus: "green", verification: "datasheet-referenced",
  },
  "Sharp GP2Y0A02YK0F": {
    manufacturer: "Sharp", model: "GP2Y0A02YK0F",
    description: "Long-range analog IR distance sensor, 20–150 cm.",
    pins: [out("VO", "analog", { label: "Vo", logicV: 3.1, note: "Analog output ≈0.4–3.1 V (datasheet), safe for 3.3 V ADCs" }), gnd("GND", "L"), vin("VCC", [4.5, 5.5], "L")],
    pinoutStatus: "datasheet-referenced", specs: { voltage: "4.5–5.5 V", current: "≈33 mA", extra: { Range: "20–150 cm" } },
    sensor: { kind: "ir-distance-analog", minRange_mm: 200, maxRange_mm: 1500, fovDeg: 5, estimated: false },
    datasheetUrl: "https://global.sharp/products/device/lineup/data/pdf/datasheet/gp2y0a02yk_e.pdf", simStatus: "green", verification: "datasheet-referenced",
  },
  "E18-D80NK": {
    manufacturer: "Generic", model: "E18-D80NK adjustable IR proximity switch",
    description: "Cylindrical IR obstacle switch (≈3–80 cm adjustable) with an NPN output that goes LOW on detection.",
    pins: [vin("VCC", [4.5, 5.5], "L", { label: "Brown (+5 V)" }), gnd("GND", "L", "Blue (GND)"), out("OUT", "digital", { label: "Black (OUT)", note: "NPN open collector – enable INPUT_PULLUP" })],
    pinoutStatus: "generic-convention",
    sensor: { kind: "ir-obstacle-digital", minRange_mm: 30, maxRange_mm: 800, fovDeg: 10, activeLevel: 0, estimated: true }, simStatus: "green", verification: "unverified",
  },
  "IR Obstacle Avoidance Sensor": { description: "IR LED/photodiode module with LM393 comparator; OUT goes LOW when an object is detected (≈2–30 cm, adjustable).", pins: moduleVccGnd([3.3, 5], [out("OUT", "digital")]), pinoutStatus: "generic-convention", sensor: { kind: "ir-obstacle-digital", minRange_mm: 20, maxRange_mm: 300, fovDeg: 35, activeLevel: 0, estimated: true }, simStatus: "green", verification: "generic-convention" },
  "Sharp IR Distance Sensor": { description: "Sharp analog IR distance sensor family (see GP2Y0A21YK0F / GP2Y0A02YK0F for specific models).", pins: [out("VO", "analog", { label: "Vo", logicV: 3.1, note: "Analog output ≈0.4–3.1 V (datasheet), safe for 3.3 V ADCs" }), gnd("GND", "L"), vin("VCC", [4.5, 5.5], "L")], pinoutStatus: "generic-convention", sensor: { kind: "ir-distance-analog", minRange_mm: 100, maxRange_mm: 800, fovDeg: 5, estimated: true }, simStatus: "green", verification: "generic-convention" },
  "TCRT5000 Edge Detection Sensor": { description: "TCRT5000 module mounted facing down at the robot's edge to detect the white dohyo border.", pins: moduleVccGnd([3.3, 5], [out("D0", "digital"), out("A0", "analog")]), pinoutStatus: "datasheet-referenced", sensor: { kind: "reflectance-digital", channels: 1, blackLevel: 1, estimated: true }, datasheetUrl: "https://www.vishay.com/docs/83760/tcrt5000.pdf", simStatus: "green", verification: "datasheet-referenced" },
  "QTR Reflectance Sensor": { description: "Pololu QTR-1A style analog reflectance sensor used for edge detection.", pins: moduleVccGnd([5, 5], [out("OUT", "analog")], "VIN"), pinoutStatus: "generic-convention", sensor: { kind: "reflectance-analog", channels: 1, estimated: true }, simStatus: "green", verification: "generic-convention" },
  "IR Proximity Sensor": { description: "Digital IR proximity module (LOW on detection).", pins: moduleVccGnd([3.3, 5], [out("OUT", "digital")]), pinoutStatus: "generic-convention", sensor: { kind: "ir-obstacle-digital", minRange_mm: 20, maxRange_mm: 300, fovDeg: 30, activeLevel: 0, estimated: true }, simStatus: "green", verification: "generic-convention" },
  "Ultrasonic Sensor": { description: "Generic TRIG/ECHO ultrasonic sensor (HC-SR04 class).", pins: [vin("VCC", [4.5, 5.5], "L"), inp("TRIG"), out("ECHO", "digital"), gnd("GND", "L")], pinoutStatus: "generic-convention", sensor: { kind: "ultrasonic", minRange_mm: 20, maxRange_mm: 4000, fovDeg: 15, estimated: true }, simStatus: "green", verification: "generic-convention" },
  "ToF Distance Sensor": { description: "Generic I2C time-of-flight distance sensor (VL53L0X class).", pins: [vin("VIN", [2.6, 5.5], "L"), gnd("GND", "L"), pin("SCL", "i2c-scl", "R"), pin("SDA", "i2c-sda", "R")], pinoutStatus: "generic-convention", sensor: { kind: "tof", minRange_mm: 30, maxRange_mm: 2000, fovDeg: 25, estimated: true }, simStatus: "blue", verification: "generic-convention" },
  "Bumper Switch": { description: "Mechanical switch that closes when the robot touches something. Wire COM to GND and NO to an INPUT_PULLUP pin.", pins: [pin("COM", "switch", "L"), pin("NO", "switch", "R"), pin("NC", "switch", "R")], pinoutStatus: "generic-convention", sensor: { kind: "bumper", estimated: false }, simStatus: "green", verification: "generic-convention" },
  "Hall Effect Sensor": { description: "Digital Hall sensor module (e.g. A3144): output LOW near a magnet's south pole.", pins: moduleVccGnd([4.5, 5.5], [out("OUT", "digital")]), pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Magnetic Proximity Sensor": { description: "Reed/Hall based magnetic proximity switch.", pins: [pin("COM", "switch", "L"), pin("NO", "switch", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  MPU6050: {
    manufacturer: "TDK InvenSense (GY-521 breakout)", model: "MPU-6050 6-axis IMU",
    description: "3-axis gyroscope + 3-axis accelerometer over I2C (0x68, 0x69 with AD0 high). GY-521 board has a 3.3 V regulator.",
    pins: [vin("VCC", [3.3, 5], "L"), gnd("GND", "L"), pin("SCL", "i2c-scl", "R"), pin("SDA", "i2c-sda", "R"), pin("XDA", "nc", "R"), pin("XCL", "nc", "R"), inp("AD0"), out("INT", "digital")],
    pinoutStatus: "datasheet-referenced", specs: { protocols: ["I2C"], dimensions: { x: 21, y: 16, z: 3 } }, sensor: { kind: "imu", estimated: false },
    simStatus: "blue", verification: "datasheet-referenced",
  },
  "Optical Rotary Encoder": { description: "Slotted-disc optical encoder (VCC, GND, digital pulse output).", pins: moduleVccGnd([3.3, 5], [out("OUT", "digital")]), pinoutStatus: "generic-convention", sensor: { kind: "encoder", estimated: true }, simStatus: "blue", verification: "generic-convention" },
  "Motor Encoder": {
    description: "Hall quadrature encoder on the back of a gear motor (6-wire: M1, M2 motor; VCC, GND, C1/A, C2/B). Counts per output revolution = encoder PPR × gear ratio.",
    pins: [pin("M1", "motor-term", "L"), pin("M2", "motor-term", "L"), vin("VCC", [3.3, 5], "L"), gnd("GND", "L"), out("C1", "digital", { label: "C1 (A)" }), out("C2", "digital", { label: "C2 (B)" })],
    pinoutStatus: "generic-convention",
    options: [{ key: "cpr", label: "Counts per output revolution", type: "number", default: 341, min: 1, max: 100000, step: 1, help: "Check your motor's datasheet" }],
    sensor: { kind: "encoder", estimated: true }, simStatus: "green", verification: "generic-convention",
  },
  "Hall Effect Encoder": { description: "Magnetic Hall quadrature encoder (A/B outputs).", pins: moduleVccGnd([3.3, 5], [out("A", "digital"), out("B", "digital")]), pinoutStatus: "generic-convention", sensor: { kind: "encoder", estimated: true }, simStatus: "green", verification: "generic-convention" },
  "Incremental Encoder": { description: "Incremental quadrature encoder (A/B outputs).", pins: moduleVccGnd([5, 5], [out("A", "digital"), out("B", "digital")]), pinoutStatus: "generic-convention", sensor: { kind: "encoder", estimated: true }, simStatus: "green", verification: "generic-convention" },
  "KY-003 Hall Sensor": { description: "Digital Hall switch module (A3144).", pins: [out("S", "digital", { label: "S" }), vin("VCC", [4.5, 5.5], "L", { label: "+" }), gnd("GND", "L", "−")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Rotary Potentiometer": { description: "Three-terminal potentiometer used as an angle/position sensor.", pins: [pin("1", "passive", "L"), pin("W", "out-analog", "R", { label: "Wiper" }), pin("3", "passive", "L")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  INA219: { manufacturer: "TI (common breakout)", model: "INA219 current/power monitor", description: "High-side current, bus voltage and power monitor over I2C (up to 26 V bus).", pins: [vin("VCC", [3, 5.5], "L"), gnd("GND", "L"), pin("SCL", "i2c-scl", "R"), pin("SDA", "i2c-sda", "R"), pin("VIN+", "passive", "R"), pin("VIN-", "passive", "R")], pinoutStatus: "generic-convention", datasheetUrl: "https://www.ti.com/lit/ds/symlink/ina219.pdf", simStatus: "blue", verification: "datasheet-referenced" },
  ACS712: { manufacturer: "Allegro (common module)", model: "ACS712 Hall current sensor (5/20/30 A)", description: "Analog current sensor: output = VCC/2 at 0 A, ±185/100/66 mV per A for 5/20/30 A versions.", pins: [vin("VCC", [4.5, 5.5], "L"), out("OUT", "analog"), gnd("GND", "L"), pin("IP+", "passive", "R"), pin("IP-", "passive", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "datasheet-referenced" },
  "Voltage Sensor Module": { description: "0–25 V resistive divider module (30 kΩ/7.5 kΩ, ratio 5:1).", pins: [pin("VCC_IN", "passive", "L", { label: "VCC (measured +)" }), gnd("GND_IN", "L", "GND (measured −)"), out("S", "analog", { label: "S" }), pin("PLUS", "nc", "R", { label: "+" }), gnd("MINUS", "R", "−")], bridges: [["GND_IN", "MINUS"]], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  LDR: { description: "Light-dependent resistor; use with a fixed resistor as a divider into an analog pin.", pins: [pin("1", "passive", "L"), pin("2", "passive", "R")], pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  DS18B20: { manufacturer: "Analog Devices / Maxim", model: "DS18B20 1-Wire temperature sensor", description: "Digital temperature sensor on the 1-Wire bus; DQ needs a 4.7 kΩ pull-up.", pins: [gnd("GND", "L"), pin("DQ", "out-digital", "R", { label: "DQ" }), vin("VDD", [3, 5.5], "L")], pinoutStatus: "datasheet-referenced", simStatus: "blue", verification: "datasheet-referenced" },
  DHT11: { description: "Temperature/humidity sensor (single-wire protocol).", pins: [vin("VCC", [3.3, 5.5], "L"), out("DATA", "digital"), pin("NC", "nc", "R"), gnd("GND", "L")], pinoutStatus: "datasheet-referenced", simStatus: "blue", verification: "datasheet-referenced" },
  DHT22: { description: "Higher-accuracy temperature/humidity sensor (single-wire protocol).", pins: [vin("VCC", [3.3, 6], "L"), out("DATA", "digital"), pin("NC", "nc", "R"), gnd("GND", "L")], pinoutStatus: "datasheet-referenced", simStatus: "blue", verification: "datasheet-referenced" },
  "Sound Sensor": { description: "Microphone + comparator module with digital and analog outputs.", pins: moduleVccGnd([3.3, 5], [out("DO", "digital"), out("AO", "analog")]), pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Microphone Module": { description: "Electret microphone amplifier module (analog output).", pins: moduleVccGnd([3.3, 5], [out("OUT", "analog")]), pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Vibration Sensor": { description: "Vibration switch module (digital output).", pins: moduleVccGnd([3.3, 5], [out("DO", "digital")]), pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "SW-420 Vibration Sensor": { description: "SW-420 vibration switch with LM393 comparator, digital output.", pins: moduleVccGnd([3.3, 5], [out("DO", "digital")]), pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Flame Sensor": { description: "IR flame sensor module (760–1100 nm) with digital and analog outputs.", pins: moduleVccGnd([3.3, 5], [out("DO", "digital"), out("AO", "analog")]), pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
  "Rain Sensor": { description: "Rain detection board + comparator module with digital and analog outputs.", pins: moduleVccGnd([3.3, 5], [out("DO", "digital"), out("AO", "analog")]), pinoutStatus: "generic-convention", simStatus: "blue", verification: "generic-convention" },
};

/** "Limit Switch" appears in two sensor subsections and under Switches. */
export const LIMIT_SWITCH: SpecPatch = { description: "Lever micro-switch (COM / NO / NC). Wire COM to GND and NO to an INPUT_PULLUP pin.", pins: [pin("COM", "switch", "L"), pin("NO", "switch", "R"), pin("NC", "switch", "R")], pinoutStatus: "generic-convention", sensor: { kind: "bumper", estimated: false }, simStatus: "green", verification: "generic-convention" };
SENSOR_SPECS["Limit Switch"] = LIMIT_SWITCH;
