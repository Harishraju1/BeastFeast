import { describe, expect, it } from "vitest";
import { AvrRunner, AVR_SUPPORTED_BOARDS } from "@/lib/arduino/avr";
import { MockHost } from "./helpers";

/** Build Intel HEX from 16-bit AVR instruction words (little-endian in flash). */
function toIntelHex(words: number[]): string {
  const bytes: number[] = [];
  for (const w of words) bytes.push(w & 0xff, (w >> 8) & 0xff);
  const lines: string[] = [];
  for (let addr = 0; addr < bytes.length; addr += 16) {
    const chunk = bytes.slice(addr, addr + 16);
    const rec = [chunk.length, (addr >> 8) & 0xff, addr & 0xff, 0, ...chunk];
    const sum = rec.reduce((a, b) => a + b, 0);
    rec.push((0x100 - (sum & 0xff)) & 0xff);
    lines.push(":" + rec.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(""));
  }
  lines.push(":00000001FF");
  return lines.join("\n");
}

// Hand-assembled ATmega328P programs (I/O addresses: DDRB=0x04, PORTB=0x05, DDRD=0x0A)
const BLINK = [
  0x9a25, // sbi DDRB, 5        ; pin 13 output
  0x9a2d, // loop: sbi PORTB, 5 ; pin 13 HIGH
  0x982d, //       cbi PORTB, 5 ; pin 13 LOW
  0xcffd, //       rjmp loop
];

const PWM_D6 = [
  0xe803, // ldi r16, 0x83       ; COM0A1 | WGM01 | WGM00 (fast PWM, non-inverting)
  0xbd04, // out TCCR0A, r16
  0xe001, // ldi r16, 1          ; CS00: clock / 1
  0xbd05, // out TCCR0B, r16
  0xe800, // ldi r16, 128
  0xbd07, // out OCR0A, r16
  0x9a56, // sbi DDRD, 6         ; D6 output
  0xcfff, // rjmp .
];

const UART_TX = [
  0xe008, // ldi r16, 0x08      ; TXEN0
  0x9300, 0x00c1, // sts UCSR0B, r16
  0xe401, // ldi r16, 'A'
  0x9300, 0x00c6, // sts UDR0, r16
  0xcfff, // rjmp .
];

const ADC_TO_PORTB = [
  0xef0f, // ldi r16, 0xFF
  0xb904, // out DDRB, r16          ; port B all outputs
  0xe400, // ldi r16, 0x40          ; REFS0 (AVcc), channel 0
  0x9300, 0x007c, // sts ADMUX, r16
  0xec07, // ldi r16, 0xC7          ; ADEN | ADSC | prescaler 128
  0x9300, 0x007a, // sts ADCSRA, r16
  0x9110, 0x007a, // wait: lds r17, ADCSRA
  0xfd16, // sbrc r17, 6            ; ADSC still set?
  0xcffc, // rjmp wait
  0x9130, 0x0078, // lds r19, ADCL
  0x9130, 0x0079, // lds r19, ADCH
  0xb935, // out PORTB, r19
  0xcfff, // rjmp .
];

describe("AvrRunner", () => {
  it("lists the supported boards", () => {
    expect(AVR_SUPPORTED_BOARDS).toEqual(["uno", "nano"]);
  });

  it("parses Intel HEX and validates checksums", () => {
    const hex = toIntelHex(BLINK);
    const bytes = AvrRunner.parseIntelHex(hex);
    expect(Array.from(bytes)).toEqual([0x25, 0x9a, 0x2d, 0x9a, 0x2d, 0x98, 0xfd, 0xcf]);
    const bad = hex.replace(/..\n/, (m) => (m.startsWith("00") ? "01" : "00") + "\n");
    expect(() => AvrRunner.parseIntelHex(bad)).toThrow(/line 1: checksum mismatch/);
    expect(() => AvrRunner.parseIntelHex("hello")).toThrow(/must start with ':'/);
    expect(() => AvrRunner.parseIntelHex(hex.replace(":00000001FF", ""))).toThrow(/end-of-file/);
    expect(() => AvrRunner.parseIntelHex(":0400000025\n:00000001FF")).toThrow(/byte count/);
  });

  it("toggles pin 13 through host.digitalWrite", () => {
    const host = new MockHost();
    const avr = new AvrRunner(toIntelHex(BLINK), host);
    const st = avr.runUntil(10);
    expect(st.nowMicros).toBeGreaterThanOrEqual(10);
    expect(host.of("pinMode")[0].args).toEqual([13, "OUTPUT"]);
    const writes = host.of("digitalWrite").map((c) => c.args);
    expect(writes.length).toBeGreaterThan(20);
    // DDRB bit 5 set → output driving LOW, then HIGH/LOW alternating
    writes.forEach((w, i) => expect(w).toEqual([13, i % 2 === 0 ? 0 : 1]));
  });

  it("reports timer0 PWM on D6 as analogWrite", () => {
    const host = new MockHost();
    const avr = new AvrRunner(toIntelHex(PWM_D6), host);
    avr.runUntil(200);
    expect(host.of("analogWrite").map((c) => c.args)).toEqual([[6, 128]]);
    // the fast PWM toggling is not forwarded as digitalWrite
    expect(host.of("digitalWrite").filter((c) => c.args[0] === 6).length).toBeLessThan(2);
    avr.runUntil(400);
    expect(host.of("analogWrite").length).toBe(1); // unchanged duty is not re-reported
  });

  it("sends USART bytes to host.serialWrite", () => {
    const host = new MockHost();
    const avr = new AvrRunner(toIntelHex(UART_TX), host);
    avr.runUntil(100);
    expect(host.serial).toBe("A");
    expect(avr.serialLog).toBe("A");
  });

  it("feeds host.analogRead into the ADC", () => {
    for (const [value, pin] of [[512, 9], [256, 8]] as const) {
      const host = new MockHost();
      host.analog.set(14, value);
      const avr = new AvrRunner(toIntelHex(ADC_TO_PORTB), host);
      avr.runUntil(500); // one conversion = 13 ADC clocks * 128 = 104 µs
      expect(host.of("analogRead")[0].args).toEqual([14]);
      const high = host.of("digitalWrite").filter((c) => c.args[1] === 1).map((c) => c.args[0]);
      expect(high).toEqual([pin]); // ADCH = value >> 8
    }
  });
});
