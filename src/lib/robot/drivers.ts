/**
 * Channel wiring of each simulated motor driver (by catalogue id).
 * Used by the validation engine (which control pins a channel needs) and by the
 * electrical bridge (how input levels become output terminal voltages).
 */
import type { DriverSimParams } from "@/lib/types";

export interface DriverChannel {
  name: string; // "A", "B"
  outs: [string, string];
  /** inputs that set each output HIGH (in-in style); for pwm-dir: [PWM, DIR]; for rpwm-lpwm: [RPWM, LPWM] */
  inA: string;
  inB: string;
  /** enable / speed pin (in-in-en style), may be replaced by a jumper option */
  en?: string;
  enJumperOption?: string;
  /** standby pin (TB6612) */
  stby?: string;
  /** extra enables that must be HIGH (BTS7960 R_EN/L_EN) */
  enables?: string[];
  /** pins that carry speed (must be PWM capable for speed control) */
  speedPins: string[];
}

export interface DriverWiring {
  scheme: DriverSimParams["scheme"];
  channels: DriverChannel[];
  /** vin pin that feeds the motors */
  motorSupply: string;
  /** separate logic supply pin, if any */
  logicSupply?: string;
}

export const DRIVER_WIRING: Record<string, DriverWiring> = {
  l298n: {
    scheme: "in-in-en", motorSupply: "VS",
    channels: [
      { name: "A", outs: ["OUT1", "OUT2"], inA: "IN1", inB: "IN2", en: "ENA", enJumperOption: "enaJumper", speedPins: ["ENA"] },
      { name: "B", outs: ["OUT3", "OUT4"], inA: "IN3", inB: "IN4", en: "ENB", enJumperOption: "enbJumper", speedPins: ["ENB"] },
    ],
  },
  l293d: {
    scheme: "in-in-en", motorSupply: "VCC2", logicSupply: "VCC1",
    channels: [
      { name: "1-2", outs: ["1Y", "2Y"], inA: "1A", inB: "2A", en: "EN12", speedPins: ["EN12"] },
      { name: "3-4", outs: ["3Y", "4Y"], inA: "3A", inB: "4A", en: "EN34", speedPins: ["EN34"] },
    ],
  },
  tb6612fng: {
    scheme: "in-in-pwm-standby", motorSupply: "VM", logicSupply: "VCC",
    channels: [
      { name: "A", outs: ["AO1", "AO2"], inA: "AIN1", inB: "AIN2", en: "PWMA", stby: "STBY", speedPins: ["PWMA"] },
      { name: "B", outs: ["BO1", "BO2"], inA: "BIN1", inB: "BIN2", en: "PWMB", stby: "STBY", speedPins: ["PWMB"] },
    ],
  },
  drv8833: {
    scheme: "in-in", motorSupply: "VIN",
    channels: [
      { name: "A", outs: ["AOUT1", "AOUT2"], inA: "AIN1", inB: "AIN2", speedPins: ["AIN1", "AIN2"] },
      { name: "B", outs: ["BOUT1", "BOUT2"], inA: "BIN1", inB: "BIN2", speedPins: ["BIN1", "BIN2"] },
    ],
  },
  drv8835: {
    scheme: "in-in", motorSupply: "VIN", logicSupply: "VCC",
    channels: [
      { name: "A", outs: ["AOUT1", "AOUT2"], inA: "AIN1", inB: "AIN2", speedPins: ["AIN1", "AIN2"] },
      { name: "B", outs: ["BOUT1", "BOUT2"], inA: "BIN1", inB: "BIN2", speedPins: ["BIN1", "BIN2"] },
    ],
  },
  drv8871: { scheme: "in-in", motorSupply: "VM", channels: [{ name: "A", outs: ["OUT1", "OUT2"], inA: "IN1", inB: "IN2", speedPins: ["IN1", "IN2"] }] },
  mx1508: {
    scheme: "in-in", motorSupply: "VCC",
    channels: [
      { name: "A", outs: ["MA1", "MA2"], inA: "IN1", inB: "IN2", speedPins: ["IN1", "IN2"] },
      { name: "B", outs: ["MB1", "MB2"], inA: "IN3", inB: "IN4", speedPins: ["IN3", "IN4"] },
    ],
  },
  bts7960: { scheme: "rpwm-lpwm", motorSupply: "B+", logicSupply: "VCC", channels: [{ name: "A", outs: ["M+", "M-"], inA: "RPWM", inB: "LPWM", enables: ["R_EN", "L_EN"], speedPins: ["RPWM", "LPWM"] }] },
  "ibt-2": { scheme: "rpwm-lpwm", motorSupply: "B+", logicSupply: "VCC", channels: [{ name: "A", outs: ["M+", "M-"], inA: "RPWM", inB: "LPWM", enables: ["R_EN", "L_EN"], speedPins: ["RPWM", "LPWM"] }] },
  "cytron-md10c": { scheme: "pwm-dir", motorSupply: "POWER+", channels: [{ name: "A", outs: ["MA", "MB"], inA: "PWM", inB: "DIR", speedPins: ["PWM"] }] },
  "cytron-mdd10a": {
    scheme: "pwm-dir", motorSupply: "POWER+",
    channels: [
      { name: "1", outs: ["M1A", "M1B"], inA: "PWM1", inB: "DIR1", speedPins: ["PWM1"] },
      { name: "2", outs: ["M2A", "M2B"], inA: "PWM2", inB: "DIR2", speedPins: ["PWM2"] },
    ],
  },
};
