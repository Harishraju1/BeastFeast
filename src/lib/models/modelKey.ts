/**
 * Which procedural 3D model represents a catalogue component.
 *
 * Pure and framework-free so it can be unit tested: the 3D registry in `src/components/three/models` draws
 * one model per key. `exact` says whether the model was designed for THIS part (its shape, colours and
 * layout) or is a family/generic stand-in; the designer labels non-exact models as generic.
 * Classification uses the component id, name, model string and simulation specs — never one catch-all regex.
 */
import type { ComponentRecord } from "@/lib/types";

export type ModelKey =
  // DC motors
  | "tt"
  | "bo"
  | "bo-l"
  | "n20"
  | "johnson"
  | "ga25"
  | "ga37"
  | "worm"
  | "rs"
  | "motor-generic"
  // servos
  | "servo-micro"
  | "servo-standard"
  // motor drivers
  | "l298n"
  | "l293d"
  | "l293d-shield"
  | "tb6612"
  | "drv8833"
  | "bts7960"
  | "mx1508"
  | "driver-carrier"
  | "driver-generic"
  // controllers
  | "uno"
  | "nano"
  | "mega"
  | "esp32"
  | "esp32s3"
  | "pico"
  | "controller-generic"
  // sensors
  | "ir-module"
  | "ultrasonic"
  | "reflectance-array"
  | "sharp-ir"
  | "tof"
  | "ir-barrel"
  | "imu"
  | "microswitch"
  | "sensor-generic"
  // wheels
  | "wheel-tt"
  | "wheel-rubber"
  | "offroad"
  | "sumo"
  | "foam"
  | "racing"
  | "wheel-metal"
  | "wheel-printed"
  | "wheel-dual"
  | "mecanum"
  | "omni"
  | "wheel-generic"
  // batteries
  | "lipo"
  | "cell-holder"
  | "liion-pack"
  | "aa-holder"
  | "pp3"
  | "lead-acid"
  | "battery-generic"
  // casters
  | "caster"
  // small electronics, displays and power modules
  | "resistor"
  | "capacitor"
  | "led"
  | "switch"
  | "breadboard"
  | "ldr"
  | "dht"
  | "to92"
  | "display"
  | "regulator"
  // every other kind keeps its simple block representation
  | "generic";

export interface ModelInfo {
  key: ModelKey;
  /** true = the model depicts this specific part; false = a family or generic stand-in */
  exact: boolean;
  /** human-readable name of the model that is drawn */
  label: string;
}

/** The phrase the designer shows for every non-exact model. */
export const GENERIC_MODEL_NOTE = "Generic representation — not an exact model of this part";

type Comp = Pick<ComponentRecord, "id" | "name" | "kind"> & Partial<Pick<ComponentRecord, "model" | "description" | "tags" | "sensor" | "battery" | "board" | "subcategory">>;

const m = (key: ModelKey, exact: boolean, label: string): ModelInfo => ({ key, exact, label });

/** Lower-case id + name + model string: the text the rules match against. */
function textOf(c: Comp) {
  return `${c.id} ${c.name} ${c.model ?? ""}`.toLowerCase();
}

function motorModel(c: Comp, t: string): ModelInfo {
  // order matters: specific families first so e.g. "Johnson" never falls into a TT/BO rule
  if (/johnson/.test(t)) return m("johnson", true, "Johnson side-shaft geared motor");
  if (/\bjgb37|37gb|37 ?mm|jgb-?37|37-?520/.test(t)) return m("ga37", true, "37 mm metal gearmotor (JGB37-520 class)");
  if (/\bjga25|25ga|25 ?mm metal|ga25/.test(t)) return m("ga25", true, "25 mm metal gearmotor (25GA370 / JGA25-370)");
  if (/\bn20\b|n20-|12ga/.test(t)) return m("n20", true, /encoder/.test(t) ? "N20 micro metal gearmotor with encoder" : "N20 micro metal gearmotor");
  if (/\bn10\b|n10-/.test(t)) return m("n20", false, "Micro metal gearmotor (N20 model)");
  if (/\btt\b/.test(t)) return m("tt", true, "TT yellow gear motor (dual shaft)");
  if (/\bbo\b/.test(t)) {
    if (/l[- ]?shape|l[- ]?type|right[- ]?angle|\bbo[- ]?l\b/.test(t)) return m("bo-l", true, "BO gear motor (L-shaped)");
    return m("bo", true, "BO gear motor (straight, single shaft)");
  }
  if (/worm/.test(t)) return m("worm", true, "Worm-gear motor (side output shaft)");
  if (/\brs-?\d{3}\b/.test(t)) return m("rs", true, `${c.name} (bare can motor, axial shaft)`);
  if (/high-torque|high torque/.test(t)) return m("ga37", false, "Round metal gearmotor (37 mm model)");
  if (/planetary/.test(t)) return m("ga37", false, "Round metal gearmotor (37 mm model)");
  if (/micro-dc|coreless|high-rpm|brushed-dc/.test(t)) return m("rs", false, "Bare DC can motor");
  return m("motor-generic", false, "Generic gear motor");
}

function servoModel(c: Comp, t: string): ModelInfo {
  if (/\bsg90\b/.test(t)) return m("servo-micro", true, "SG90 micro servo (blue)");
  if (/mg90s/.test(t)) return m("servo-micro", true, "MG90S metal-gear micro servo");
  if (/mg995|mg996r/.test(t)) return m("servo-standard", true, `${c.name} standard servo`);
  if (/ds3218|ds3225/.test(t)) return m("servo-standard", true, `${c.name} digital servo`);
  return m("servo-standard", false, "Standard servo");
}

function driverModel(c: Comp, t: string): ModelInfo {
  if (/l298/.test(t)) return m("l298n", true, "L298N module (red board, finned heatsink)");
  if (/l293d/.test(t) && /shield/.test(t)) return m("l293d-shield", true, "L293D motor shield");
  if (/l293/.test(t)) return m("l293d", true, "L293D DIP-16 chip");
  if (/tb6612/.test(t)) return m("tb6612", true, "TB6612FNG carrier (purple breakout)");
  if (/drv8833/.test(t)) return m("drv8833", true, "DRV8833 carrier (purple breakout)");
  if (/bts7960|ibt-?2/.test(t)) return m("bts7960", true, "BTS7960 / IBT-2 module (aluminium heatsink)");
  if (/mx1508/.test(t)) return m("mx1508", true, "MX1508 dual H-bridge module");
  if (/drv88|drv82|a4950|tb67|mc33926/.test(t)) return m("driver-carrier", false, "Small motor-driver carrier board");
  return m("driver-generic", false, "Motor driver board");
}

function controllerModel(c: Comp, t: string): ModelInfo {
  const b = c.board ?? "";
  if (/esp32-?s3/.test(t)) return /xiao/.test(t) ? m("controller-generic", false, "Small microcontroller board") : m("esp32s3", true, "ESP32-S3 DevKit (two USB-C ports)");
  if (/xiao|attiny|teensy|stm32|nrf52|rp2040-zero|esp-01\b/.test(t)) return m("controller-generic", false, "Microcontroller board");
  if (b === "esp32-devkit-v1" || /esp32 ?devkit|esp32-devkit/.test(t)) return m("esp32", true, "ESP32 DevKit V1 (WROOM-32 module)");
  if (/esp32|esp8266|nodemcu/.test(t)) return m("esp32", false, "ESP32-style dev board");
  if (b === "pico" || b === "pico-w" || /raspberry-pi-pico/.test(t)) return m("pico", true, /pico-w|pico w/.test(t) ? "Raspberry Pi Pico W" : "Raspberry Pi Pico");
  if (b === "mega" || /mega/.test(t)) return m("mega", true, "Arduino Mega 2560");
  if (/due/.test(t)) return m("mega", false, "Mega-size Arduino board");
  if (b === "nano" || c.id === "arduino-nano") return m("nano", true, "Arduino Nano");
  if (/nano|micro|pro-mini/.test(t)) return m("nano", false, "Nano-size Arduino board");
  if (b === "uno" || /arduino-uno-r3/.test(t)) return m("uno", true, "Arduino Uno R3");
  if (b === "uno-r4" || /uno-r4/.test(t)) return m("uno", true, "Arduino Uno R4 (USB-C)");
  if (/leonardo|uno/.test(t)) return m("uno", false, "Uno-size Arduino board");
  return m("controller-generic", false, "Microcontroller board");
}

function sensorModel(c: Comp, t: string): ModelInfo {
  const k = c.sensor?.kind ?? "";
  if (k === "ultrasonic" || /hc-sr0|ultrason/.test(t)) {
    if (/jsn-sr04t/.test(t)) return m("ultrasonic", false, "Ultrasonic module (HC-SR04 model)");
    if (/us-100/.test(t)) return m("ultrasonic", false, "Ultrasonic module (HC-SR04 model)");
    return m("ultrasonic", true, "HC-SR04-style ultrasonic module");
  }
  if (k === "ir-distance-analog" || /sharp|gp2y/.test(t)) return m("sharp-ir", true, "Sharp GP2Y IR distance sensor");
  if (/vl53/.test(t)) return m("tof", true, `${c.name} time-of-flight breakout`);
  if (k === "tof") return m("tof", false, "Time-of-flight breakout");
  if (/e18-d80nk|inductive-proximity|capacitive-proximity/.test(t)) return m("ir-barrel", true, "M18 barrel proximity sensor");
  if (/photoelectric/.test(t)) return m("ir-barrel", false, "Barrel proximity sensor");
  if (k.startsWith("reflectance-array") || /qtr|sensor-array|channel-ir/.test(t)) {
    const exact = !!c.sensor?.channels && k.startsWith("reflectance");
    return m("reflectance-array", exact, `${c.sensor?.channels ?? "multi"}-channel reflectance array`);
  }
  if (k === "reflectance-digital" || k === "reflectance-analog" || k === "ir-obstacle-digital" || /tcrt5000/.test(t)) {
    if (/qtr/.test(t)) return m("reflectance-array", true, "1-channel reflectance board");
    return m("ir-module", true, k === "ir-obstacle-digital" ? "IR obstacle module (LED pair, trimmer)" : "IR line module (TCRT5000, trimmer)");
  }
  if (/cny70/.test(t)) return m("ir-module", false, "IR reflectance module");
  if (/mpu6050/.test(t)) return m("imu", true, "MPU-6050 (GY-521) breakout");
  if (k === "imu") return m("imu", false, "IMU breakout board");
  if (/limit-switch/.test(t)) return m("microswitch", true, "Lever micro-switch");
  if (/\bldr\b|photoresistor/.test(t)) return m("ldr", true, "Photoresistor (LDR)");
  if (/\bdht(11|22)\b/.test(t)) return m("dht", true, /22/.test(t) ? "DHT22 (white grille)" : "DHT11 (blue grille)");
  if (/ds18b20|lm35|tmp36/.test(t)) return m("to92", true, `${c.name} (TO-92 package)`);
  if (k === "bumper") return m("microswitch", false, "Micro-switch bumper");
  return m("sensor-generic", false, "Sensor module");
}

function wheelModel(c: Comp, t: string): ModelInfo {
  if (/mecanum/.test(t)) return m("mecanum", true, "Mecanum wheel (45° rollers)");
  if (/omni/.test(t)) return m("omni", true, "Omni wheel (perpendicular rollers)");
  if (/knobby|off-?road|all-?terrain/.test(t)) return m("offroad", true, "Off-road knobby tyre");
  if (/sumo|silicone/.test(t)) return m("sumo", true, "Silicone sumo wheel (wide, smooth)");
  if (/foam/.test(t)) return m("foam", true, "Foam wheel");
  if (/racing/.test(t)) return m("racing", true, "Low-profile racing wheel");
  if (/aluminium|aluminum|metal/.test(t)) return m("wheel-metal", true, "Machined metal wheel");
  if (/tpu/.test(t)) return m("wheel-printed", true, "3D-printed wheel with TPU tyre");
  if (/3d-printed|printed/.test(t)) return m("wheel-printed", false, "3D-printed wheel");
  if (/dual-wheel/.test(t)) return m("wheel-dual", true, "Dual wheel assembly");
  if (/plastic-robot-wheel|\btt\b/.test(t)) return m("wheel-tt", true, "TT-style plastic hub with rubber tyre");
  if (/rubber/.test(t)) return m("wheel-rubber", true, "Rubber robot wheel");
  return m("wheel-generic", false, "Wheel");
}

function batteryModel(c: Comp, t: string): ModelInfo {
  const b = c.battery;
  if (/lipo/.test(t) && b && !b.perCell) return m("lipo", true, "LiPo pack (wrapped, printed label)");
  if (/18650|21700|26650/.test(t)) return m("cell-holder", true, "Cylindrical cell holder");
  if (/li-ion-battery-pack|li-ion battery pack/.test(t)) return m("liion-pack", true, "Shrink-wrapped Li-ion pack");
  if (/lifepo4|nicd/.test(t)) return m("liion-pack", false, "Shrink-wrapped cell pack");
  if (/\baaa?\b|aa-|aaa-|× aa|x-aa/.test(t)) return m("aa-holder", true, "AA/AAA cell holder");
  if (/pp3|9v-pp3/.test(t)) return m("pp3", true, "9 V PP3 battery");
  if (/lead-acid|lead acid/.test(t)) return m("lead-acid", true, "Sealed lead-acid battery");
  return m("battery-generic", false, "Battery");
}

function casterModel(c: Comp, t: string): ModelInfo {
  return /ball/.test(t) ? m("caster", true, "Ball caster") : m("caster", false, "Ball caster");
}

/** Maps a catalogue component to the 3D model that represents it. Never throws. */
export function modelKeyFor(c: Comp): ModelInfo {
  const t = textOf(c);
  switch (c.kind) {
    case "dc-motor":
      return motorModel(c, t);
    case "servo":
      return servoModel(c, t);
    case "motor-driver":
      return driverModel(c, t);
    case "controller":
      return controllerModel(c, t);
    case "sensor":
      return sensorModel(c, t);
    case "wheel":
      return wheelModel(c, t);
    case "battery":
      return batteryModel(c, t);
    case "caster":
      return casterModel(c, t);
    case "resistor":
      return /variable|potentiometer|trimmer/.test(t) ? m("generic", false, "Block representation") : m("resistor", true, "Axial resistor with colour bands");
    case "capacitor":
      return m("capacitor", true, /electrolytic|tantalum/.test(t) ? "Radial electrolytic capacitor" : "Ceramic disc capacitor");
    case "led":
      return c.name && /^(red|green|blue|yellow|white) led$|^led diode$/i.test(c.name) ? m("led", true, "5 mm LED") : m("generic", false, "Block representation");
    case "switch":
      return /push|tactile|button/.test(t) ? m("switch", true, "6 × 6 mm tactile push button") : /toggle/.test(t) ? m("switch", true, "Toggle switch (bat lever)") : m("generic", false, "Block representation");
    case "pcb":
      return /breadboard/.test(t) ? m("breadboard", true, "Solderless breadboard") : m("generic", false, "Block representation");
    case "display":
      return /lcd|oled/.test(t) ? m("display", true, /oled/.test(t) ? "0.96\"/1.3\" OLED module" : /20x4|20×4/.test(t) ? "20×4 character LCD" : "16×2 character LCD") : m("generic", false, "Block representation");
    case "regulator":
      return m("regulator", /buck|lm2596|xl40|mp1584|mp2307|tps5430|ams1117|1117|7805|7812|lm317/.test(t), /buck|lm2596|xl40|mp1584|mp2307|tps5430/.test(t) ? "Buck converter module" : /1117/.test(t) ? "AMS1117 regulator board" : "TO-220 linear regulator");
    default:
      return m("generic", false, "Block representation");
  }
}
