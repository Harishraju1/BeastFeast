/**
 * AVR emulation back-end (avr8js) for compiled sketches on the ATmega328P (Arduino Uno R3 / Nano).
 *
 * What works (and is tested in tests/arduino/avr.test.ts):
 *  - Intel HEX parsing with checksum / record validation (AvrRunner.parseIntelHex).
 *  - CPU at 16 MHz with timer0/1/2, USART0 and the ADC peripherals of avr8js.
 *  - GPIO ports B/C/D mapped to Arduino pins (PD0-7 = D0-7, PB0-5 = D8-13, PC0-5 = A0-A5 = 14-19).
 *    DDR/PORT changes are reported as host.pinMode (OUTPUT / INPUT / INPUT_PULLUP) and output level
 *    changes as host.digitalWrite.
 *  - Inputs: before every slice each pin configured as input is set from host.digitalRead(pin), so
 *    PIN registers, INT0/INT1 and pin-change interrupts see the host state (resolution = one slice).
 *  - PWM: after every slice the duty of pins 3,5,6,9,10,11 is derived from the timer registers
 *    (OCR0A→D6, OCR0B→D5, OCR1A→D9, OCR1B→D10, OCR2A→D11, OCR2B→D3) when the COMnx1 bit enables a
 *    (non-)inverting PWM output and the WGM mode is a PWM mode; host.analogWrite(pin, duty 0..255)
 *    is called when it changes. While a pin is under PWM its fast GPIO toggling is not forwarded
 *    as digitalWrite. Timer1 TOP is honoured for the 8/9/10-bit, ICR1 and OCR1A modes.
 *  - ADC: every conversion asks host.analogRead(14 + channel) (0..1023) and converts it to volts
 *    against the 5 V reference.
 *  - USART: transmitted bytes → host.serialWrite; bytes from host.serialRead() are fed into RX one
 *    character-time apart.
 * Not modelled: EEPROM, SPI, TWI (I2C), watchdog, sleep modes, analog comparator, Servo-library timing
 * as servo angles (a servo pulse appears as ordinary digital toggling on its pin).
 */
import {
  AVRADC,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  ADCMuxInputType,
  CPU,
  adcConfig,
  avrInstruction,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
  type ADCMuxInput,
} from "avr8js";
import type { ArduinoHost, PinModeValue, RuntimeStatus } from "./types";

export const AVR_SUPPORTED_BOARDS: string[] = ["uno", "nano"];

const FREQ_HZ = 16_000_000;
const FLASH_BYTES = 32 * 1024;

interface PwmChannel {
  pin: number;
  timer: 0 | 1 | 2;
  tccrA: number;
  tccrB: number;
  ocr: number; // low byte address
  comShift: number; // 6 for channel A, 4 for channel B
}

const PWM_CHANNELS: PwmChannel[] = [
  { pin: 6, timer: 0, tccrA: 0x44, tccrB: 0x45, ocr: 0x47, comShift: 6 },
  { pin: 5, timer: 0, tccrA: 0x44, tccrB: 0x45, ocr: 0x48, comShift: 4 },
  { pin: 9, timer: 1, tccrA: 0x80, tccrB: 0x81, ocr: 0x88, comShift: 6 },
  { pin: 10, timer: 1, tccrA: 0x80, tccrB: 0x81, ocr: 0x8a, comShift: 4 },
  { pin: 11, timer: 2, tccrA: 0xb0, tccrB: 0xb1, ocr: 0xb3, comShift: 6 },
  { pin: 3, timer: 2, tccrA: 0xb0, tccrB: 0xb1, ocr: 0xb4, comShift: 4 },
];

type Reported = { kind: "digital"; level: 0 | 1 } | { kind: "pwm"; duty: number } | null;

export interface AvrRunnerOptions {
  /** cap on CPU cycles per runUntil call (default 1.6 M = 100 ms of AVR time) */
  maxCyclesPerSlice?: number;
}

export class AvrRunner {
  readonly cpu: CPU;
  serialLog = "";
  private readonly ports: { port: AVRIOPort; pins: number[]; ddr: number; portReg: number }[];
  private readonly usart: AVRUSART;
  private readonly adc: AVRADC;
  private readonly timers: AVRTimer[];
  private readonly modes = new Map<number, PinModeValue>();
  private readonly reported = new Map<number, Reported>();
  private readonly maxCycles: number;
  private lastThrottled = false;

  /** Parse Intel HEX text into a flash image. Throws an Error naming the bad line on any problem. */
  static parseIntelHex(text: string): Uint8Array {
    const lines = text.split(/\r?\n/);
    const bytes = new Uint8Array(FLASH_BYTES);
    let maxAddr = 0;
    let base = 0;
    let sawEof = false;
    lines.forEach((raw, i) => {
      const lineNo = i + 1;
      const line = raw.trim();
      if (!line || sawEof) return;
      if (line[0] !== ":") throw new Error(`Intel HEX line ${lineNo}: records must start with ':'`);
      const hex = line.slice(1);
      if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) throw new Error(`Intel HEX line ${lineNo}: invalid hexadecimal characters or odd length`);
      if (hex.length < 10) throw new Error(`Intel HEX line ${lineNo}: record too short`);
      const rec: number[] = [];
      for (let k = 0; k < hex.length; k += 2) rec.push(parseInt(hex.slice(k, k + 2), 16));
      const count = rec[0];
      if (rec.length !== count + 5) throw new Error(`Intel HEX line ${lineNo}: byte count says ${count} data bytes but the record has ${rec.length - 5}`);
      const sum = rec.slice(0, -1).reduce((a, b) => a + b, 0);
      const expected = (0x100 - (sum & 0xff)) & 0xff;
      const actual = rec[rec.length - 1];
      if (expected !== actual) {
        throw new Error(`Intel HEX line ${lineNo}: checksum mismatch (expected ${expected.toString(16).padStart(2, "0").toUpperCase()}, found ${actual.toString(16).padStart(2, "0").toUpperCase()})`);
      }
      const addr = (rec[1] << 8) | rec[2];
      const type = rec[3];
      const data = rec.slice(4, 4 + count);
      switch (type) {
        case 0x00: {
          const start = base + addr;
          if (start + count > FLASH_BYTES) throw new Error(`Intel HEX line ${lineNo}: address 0x${(start + count).toString(16)} is beyond the 32 KB flash of the ATmega328P`);
          bytes.set(data, start);
          maxAddr = Math.max(maxAddr, start + count);
          break;
        }
        case 0x01:
          sawEof = true;
          break;
        case 0x02:
          if (count !== 2) throw new Error(`Intel HEX line ${lineNo}: extended segment address record must have 2 data bytes`);
          base = ((data[0] << 8) | data[1]) * 16;
          break;
        case 0x04:
          if (count !== 2) throw new Error(`Intel HEX line ${lineNo}: extended linear address record must have 2 data bytes`);
          base = ((data[0] << 8) | data[1]) << 16;
          break;
        case 0x03:
        case 0x05:
          break; // start address records: not needed for AVR
        default:
          throw new Error(`Intel HEX line ${lineNo}: unknown record type ${type}`);
      }
    });
    if (!sawEof) throw new Error("Intel HEX: missing end-of-file record (:00000001FF)");
    if (maxAddr === 0) throw new Error("Intel HEX: the file contains no program data");
    return bytes.slice(0, maxAddr + (maxAddr % 2));
  }

  constructor(hexText: string, private host: ArduinoHost, opts: AvrRunnerOptions = {}) {
    const image = AvrRunner.parseIntelHex(hexText);
    const progMem = new Uint16Array(FLASH_BYTES / 2);
    new Uint8Array(progMem.buffer).set(image);
    this.maxCycles = opts.maxCyclesPerSlice ?? 1_600_000;
    this.cpu = new CPU(progMem, 0x800);
    const cpu = this.cpu;
    this.timers = [new AVRTimer(cpu, timer0Config), new AVRTimer(cpu, timer1Config), new AVRTimer(cpu, timer2Config)];
    this.usart = new AVRUSART(cpu, usart0Config, FREQ_HZ);
    this.adc = new AVRADC(cpu, adcConfig);
    const portB = new AVRIOPort(cpu, portBConfig);
    const portC = new AVRIOPort(cpu, portCConfig);
    const portD = new AVRIOPort(cpu, portDConfig);
    this.ports = [
      { port: portD, pins: [0, 1, 2, 3, 4, 5, 6, 7], ddr: portDConfig.DDR, portReg: portDConfig.PORT },
      { port: portB, pins: [8, 9, 10, 11, 12, 13, -1, -1], ddr: portBConfig.DDR, portReg: portBConfig.PORT },
      { port: portC, pins: [14, 15, 16, 17, 18, 19, -1, -1], ddr: portCConfig.DDR, portReg: portCConfig.PORT },
    ];
    for (const p of this.ports) p.port.addListener((value) => this.onPortChange(p, value));

    this.usart.onByteTransmit = (b) => {
      const ch = String.fromCharCode(b);
      this.serialLog += ch;
      if (this.serialLog.length > 65536) this.serialLog = this.serialLog.slice(-65536);
      this.host.serialWrite(ch);
    };
    this.usart.onRxComplete = () => this.feedRx();

    const defaultRead = this.adc.onADCRead;
    this.adc.onADCRead = (input: ADCMuxInput) => {
      if (input.type === ADCMuxInputType.SingleEnded) {
        const raw = Number(this.host.analogRead(14 + input.channel));
        const v = Number.isFinite(raw) ? Math.max(0, Math.min(1023, raw)) : 0;
        this.adc.channelValues[input.channel] = (v / 1023) * 5;
      }
      defaultRead(input);
    };
  }

  get nowMicros(): number {
    return this.cpu.cycles / (FREQ_HZ / 1_000_000);
  }

  get status(): RuntimeStatus {
    return { state: "loop", nowMicros: this.nowMicros, line: null, throttled: this.lastThrottled, loopCount: 0 };
  }

  /** Run the CPU until `untilMicros` of AVR time (or maxCyclesPerSlice cycles) have elapsed. */
  runUntil(untilMicros: number): RuntimeStatus {
    const cpu = this.cpu;
    const wanted = Math.floor(untilMicros * (FREQ_HZ / 1_000_000));
    const target = Math.min(wanted, cpu.cycles + this.maxCycles);
    this.syncInputs();
    this.feedRx();
    while (cpu.cycles < target) {
      avrInstruction(cpu);
      cpu.tick();
    }
    this.lastThrottled = target < wanted;
    this.scanPwm();
    return this.status;
  }

  // ---------------------------------------------------------------------------------------------

  private feedRx() {
    if (this.usart.rxBusy || !this.usart.rxEnable) return;
    if (this.host.serialAvailable() > 0) {
      const b = this.host.serialRead();
      if (b >= 0) this.usart.writeByte(b & 0xff);
    }
  }

  private syncInputs() {
    for (const p of this.ports) {
      const ddr = this.cpu.data[p.ddr];
      p.pins.forEach((pin, bit) => {
        if (pin < 0 || ddr & (1 << bit)) return;
        p.port.setPin(bit, this.host.digitalRead(pin) === 1);
      });
    }
  }

  private onPortChange(p: { pins: number[]; ddr: number; portReg: number }, value: number) {
    const ddr = this.cpu.data[p.ddr];
    const portVal = this.cpu.data[p.portReg];
    p.pins.forEach((pin, bit) => {
      if (pin < 0) return;
      const mask = 1 << bit;
      const mode: PinModeValue = ddr & mask ? "OUTPUT" : portVal & mask ? "INPUT_PULLUP" : "INPUT";
      if (this.modes.get(pin) !== mode) {
        // the reset state (INPUT) is not reported until something changes
        if (this.modes.has(pin) || mode !== "INPUT") this.host.pinMode(pin, mode);
        this.modes.set(pin, mode);
        if (mode !== "OUTPUT") this.reported.set(pin, null);
      }
      if (mode !== "OUTPUT") return;
      if (this.pwm(pin) !== null) return; // under PWM: reported as analogWrite after the slice
      const level: 0 | 1 = value & mask ? 1 : 0;
      const prev = this.reported.get(pin);
      if (!prev || prev.kind !== "digital" || prev.level !== level) {
        this.reported.set(pin, { kind: "digital", level });
        this.host.digitalWrite(pin, level);
      }
    });
  }

  /** Duty 0..255 if `pin` currently outputs hardware PWM, else null. */
  private pwm(pin: number): number | null {
    const ch = PWM_CHANNELS.find((c) => c.pin === pin);
    if (!ch) return null;
    const d = this.cpu.data;
    const com = (d[ch.tccrA] >> ch.comShift) & 3;
    if (com < 2) return null;
    let top: number;
    let ocr: number;
    if (ch.timer === 1) {
      const wgm = (((d[ch.tccrB] >> 3) & 3) << 2) | (d[ch.tccrA] & 3);
      switch (wgm) {
        case 1: case 5: top = 0xff; break;
        case 2: case 6: top = 0x1ff; break;
        case 3: case 7: top = 0x3ff; break;
        case 8: case 10: case 14: top = (d[0x87] << 8) | d[0x86]; break;
        case 9: case 11: case 15: top = (d[0x89] << 8) | d[0x88]; break;
        default: return null;
      }
      ocr = (d[ch.ocr + 1] << 8) | d[ch.ocr];
    } else {
      const wgm = (((d[ch.tccrB] >> 3) & 1) << 2) | (d[ch.tccrA] & 3);
      switch (wgm) {
        case 1: case 3: top = 0xff; break;
        case 5: case 7: top = d[ch.tccrA + 3]; break; // OCRnA is TOP
        default: return null;
      }
      ocr = d[ch.ocr];
    }
    if (top <= 0) return null;
    let duty = Math.round((Math.min(ocr, top) * 255) / top);
    if (com === 3) duty = 255 - duty;
    return duty;
  }

  private scanPwm() {
    const d = this.cpu.data;
    for (const ch of PWM_CHANNELS) {
      const port = ch.pin < 8 ? this.ports[0] : this.ports[1];
      const bit = ch.pin < 8 ? ch.pin : ch.pin - 8;
      if (!(d[port.ddr] & (1 << bit))) continue;
      const duty = this.pwm(ch.pin);
      if (duty === null) continue;
      const prev = this.reported.get(ch.pin);
      if (!prev || prev.kind !== "pwm" || prev.duty !== duty) {
        this.reported.set(ch.pin, { kind: "pwm", duty });
        this.host.analogWrite(ch.pin, duty);
      }
    }
  }
}
