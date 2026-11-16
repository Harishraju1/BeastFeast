import { describe, expect, it } from "vitest";
import { build, errorsOf } from "./helpers";
import { BOARDS, getBoard } from "@/lib/arduino/boards";
import { SUPPORTED_FEATURES, UNSUPPORTED_FEATURES } from "@/lib/arduino/features";

describe("compile — diagnostics", () => {
  it("reports UNSUPPORTED_FEATURE for a class", () => {
    const { result } = build(`
class Motor {
  int pin;
};
void setup() {}
void loop() {}`);
    expect(result.ok).toBe(false);
    const e = errorsOf(result).find((d) => d.code === "UNSUPPORTED_FEATURE")!;
    expect(e).toBeTruthy();
    expect(e.line).toBe(2);
    expect(e.column).toBe(1);
    expect(e.message).toMatch(/Classes/);
  });

  it("reports UNSUPPORTED_FEATURE for a struct", () => {
    const { result } = build(`struct P { int x; };\nvoid setup() {}\nvoid loop() {}`);
    expect(errorsOf(result)[0].code).toBe("UNSUPPORTED_FEATURE");
  });

  it("reports UNSUPPORTED_FEATURE for pointers", () => {
    const { result } = build(`
int value = 5;
void setup() {
  int *p = &value;
}
void loop() {}`);
    expect(result.ok).toBe(false);
    const e = errorsOf(result)[0];
    expect(e.code).toBe("UNSUPPORTED_FEATURE");
    expect(e.line).toBe(4);
    expect(e.message).toMatch(/Pointers/);
  });

  it("reports UNSUPPORTED_FEATURE for references, new, goto and templates", () => {
    for (const src of [
      `void f(int &x) { x++; } void setup() {} void loop() {}`,
      `void setup() { int a = 0; a = *new int; } void loop() {}`,
      `void setup() { start: goto start; } void loop() {}`,
      `template <typename T> T id(T x) { return x; } void setup() {} void loop() {}`,
      `void setup() { long long x = 1; } void loop() {}`,
      `#include <LiquidCrystal.h>\nvoid setup() {} void loop() {}`,
      `void setup() { std::vector<int> v; } void loop() {}`,
    ]) {
      const { result } = build(src);
      expect(result.ok, src).toBe(false);
      expect(errorsOf(result).some((d) => d.code === "UNSUPPORTED_FEATURE"), src).toBe(true);
    }
  });

  it("reports a missing semicolon on the right line", () => {
    const { result } = build(`void setup() {
  int x = 5
  x++;
}
void loop() {}`);
    expect(result.ok).toBe(false);
    const e = errorsOf(result)[0];
    expect(e.code).toBe("SYNTAX");
    expect(e.line).toBe(2);
    expect(e.column).toBe(12);
    expect(e.message).toMatch(/';'/);
  });

  it("reports several syntax errors with their own line numbers", () => {
    const { result } = build(`void setup() {
  pinMode(13, OUTPUT;
}
void loop() {
  digitalWrite(13, HIGH)
  delay(1000);
}`);
    const lines = errorsOf(result).map((d) => d.line);
    expect(lines).toContain(2);
    expect(lines).toContain(5);
  });

  it("reports an undeclared identifier with a suggestion", () => {
    const { result } = build(`void setup() { pinmode(13, OUTPUT); }\nvoid loop() { digitalWrit(13, HIGH); }`);
    const errs = errorsOf(result);
    expect(errs[0]).toMatchObject({ line: 1, code: "UNDECLARED" });
    expect(errs[0].message).toMatch(/did you mean 'pinMode'/);
    expect(errs[1]).toMatchObject({ line: 2, code: "UNDECLARED" });
    expect(errs[1].message).toMatch(/digitalWrite/);
  });

  it("missing loop() is an error", () => {
    const { result } = build(`void setup() { pinMode(13, OUTPUT); }`);
    expect(result.ok).toBe(false);
    expect(result.hasSetup).toBe(true);
    expect(result.hasLoop).toBe(false);
    expect(errorsOf(result).some((d) => d.code === "MISSING_LOOP" && /loop\(\)/.test(d.message))).toBe(true);
  });

  it("missing setup() is an error", () => {
    const { result } = build(`void loop() {}`);
    expect(result.ok).toBe(false);
    expect(result.hasSetup).toBe(false);
    expect(errorsOf(result).some((d) => d.code === "MISSING_SETUP")).toBe(true);
  });

  it("type errors are reported", () => {
    const cases: [string, RegExp][] = [
      [`void setup() { String s = "a"; int x = s; } void loop() {}`, /toInt/],
      [`void setup() { int x = "a" + 1; } void loop() {}`, /pointer arithmetic/],
      [`const int LED = 13; void setup() { LED = 12; } void loop() {}`, /const/],
      [`void setup() { float f = 5.5 % 2; } void loop() {}`, /fmod/],
      [`int f() { return 1; } void setup() { f(2); } void loop() {}`, /takes 0 arguments/],
      [`void setup() { int a[3] = {1, 2, 3, 4}; } void loop() {}`, /Too many/],
    ];
    for (const [src, re] of cases) {
      const { result } = build(src);
      expect(result.ok, src).toBe(false);
      expect(errorsOf(result).map((d) => d.message).join("\n"), src).toMatch(re);
    }
  });

  it("warns about = in a condition and ; after if", () => {
    const { result } = build(`int x = 0;
void setup() {
  if (x = 5) { x = 1; }
  if (x == 1);
}
void loop() {}`);
    expect(result.ok).toBe(true);
    const w = result.diagnostics.filter((d) => d.severity === "warning");
    expect(w.some((d) => d.line === 3 && /==/.test(d.message))).toBe(true);
    expect(w.some((d) => d.line === 4 && /Empty statement/.test(d.message))).toBe(true);
  });

  it("supports simple function-like macros and #ifdef", () => {
    const { result } = build(`
#define DEBUG
#define SQUARE(x) ((x) * (x))
#ifdef DEBUG
#define LED 13
#else
#define LED 12
#endif
void setup() { pinMode(LED, OUTPUT); int a = SQUARE(4); }
void loop() {}`);
    expect(result.ok).toBe(true);
    expect(result.pinUsage[0]).toMatchObject({ pin: 13, symbol: "LED", call: "pinMode", mode: "OUTPUT" });
  });

  it("diagnoses unsupported macro operators", () => {
    const { result } = build(`#define STR(x) #x\nvoid setup() {} void loop() {}`);
    expect(errorsOf(result)[0].code).toBe("UNSUPPORTED_FEATURE");
  });
});

describe("compile — pin usage", () => {
  it("resolves #define, const, board constants and unmodified globals", () => {
    const { result } = build(`
#define ENA 11
const int trig = A0;
const int echo = 7;
int ledPin = 13;
int movingPin = 4;
void setup() {
  pinMode(trig, OUTPUT);
  pinMode(echo, INPUT);
  pinMode(ledPin, OUTPUT);
  movingPin = 5;
  pinMode(movingPin, OUTPUT);
  attachInterrupt(digitalPinToInterrupt(2), onEdge, FALLING);
}
void onEdge() {}
void drive(int pin, int speed) { analogWrite(pin, speed); }
void loop() {
  analogWrite(ENA, 200);
  int d = analogRead(A3);
  long t = pulseIn(echo, HIGH);
  tone(8, 440);
  digitalWrite(LED_BUILTIN, HIGH);
}`);
    expect(result.ok).toBe(true);
    const u = result.pinUsage;
    const find = (call: string, expr: string) => u.find((x) => x.call === call && x.expression === expr)!;
    expect(find("analogWrite", "ENA")).toMatchObject({ pin: 11, symbol: "ENA", line: 18 });
    expect(find("pinMode", "trig")).toMatchObject({ pin: 14, symbol: "trig", mode: "OUTPUT", line: 8 });
    expect(find("pinMode", "echo")).toMatchObject({ pin: 7, symbol: "echo", mode: "INPUT" });
    expect(find("pinMode", "ledPin")).toMatchObject({ pin: 13, symbol: "ledPin" });
    expect(find("pinMode", "movingPin").pin).toBeNull();
    expect(find("attachInterrupt", "2")).toMatchObject({ pin: 2 });
    expect(find("analogWrite", "pin").pin).toBeNull();
    expect(find("analogRead", "A3")).toMatchObject({ pin: 17, symbol: "A3" });
    expect(find("pulseIn", "echo")).toMatchObject({ pin: 7 });
    expect(find("tone", "8")).toMatchObject({ pin: 8 });
    expect(find("digitalWrite", "LED_BUILTIN")).toMatchObject({ pin: 13, symbol: "LED_BUILTIN" });
    expect(result.pinSymbols).toEqual([
      { name: "ENA", value: 11, line: 2 },
      { name: "trig", value: 14, line: 3 },
      { name: "echo", value: 7, line: 4 },
    ]);
  });

  it("extracts servo.attach pins and uses board-specific constants", () => {
    const { result } = build(`
#include <Servo.h>
Servo arm;
#define ARM_PIN 9
void setup() { arm.attach(ARM_PIN); pinMode(A0, INPUT); }
void loop() {}`);
    expect(result.pinUsage[0]).toMatchObject({ call: "servo.attach", pin: 9, symbol: "ARM_PIN" });
    const mega = build(`void setup() { pinMode(A0, INPUT); } void loop() {}`, "mega").result;
    expect(mega.pinUsage[0].pin).toBe(54);
    const esp = build(`void setup() { pinMode(A0, INPUT); } void loop() {}`, "esp32-devkit-v1").result;
    expect(esp.pinUsage[0].pin).toBe(36);
  });
});

describe("boards and feature lists", () => {
  it("has correct key pin facts", () => {
    expect(BOARDS.uno.pwmPins).toEqual([3, 5, 6, 9, 10, 11]);
    expect(BOARDS.uno.constants.A0).toBe(14);
    expect(BOARDS.nano.constants.A7).toBe(21);
    expect(BOARDS["nano-every"].pwmPins).toEqual([3, 5, 6, 9, 10]);
    expect(BOARDS.leonardo.constants.A0).toBe(18);
    expect(BOARDS.leonardo.pwmPins).toContain(13);
    expect(BOARDS.mega.constants.A15).toBe(69);
    expect(BOARDS.mega.interruptPins.slice().sort((a, b) => a - b)).toEqual([2, 3, 18, 19, 20, 21]);
    expect(BOARDS["esp32-devkit-v1"].adcMax).toBe(4095);
    expect(BOARDS["esp32-devkit-v1"].pwmPins).not.toContain(34);
    expect(BOARDS.pico.constants.A2).toBe(28);
    expect(BOARDS.nodemcu.constants.D1).toBe(5);
    expect(BOARDS.nodemcu.constants.A0).toBe(17);
    expect(getBoard("nope").key).toBe("generic");
    for (const b of Object.values(BOARDS)) {
      for (const p of b.pwmPins) expect(b.digitalPins, `${b.key} pwm ${p}`).toContain(p);
      expect(b.pwmMax).toBe(255);
    }
  });

  it("exports honest feature lists", () => {
    expect(SUPPORTED_FEATURES.length).toBeGreaterThan(10);
    expect(UNSUPPORTED_FEATURES.join(" ")).toMatch(/Pointers/);
    expect(UNSUPPORTED_FEATURES.join(" ")).toMatch(/Classes/);
  });
});

describe("sandbox", () => {
  it("never reaches JavaScript globals from student code", () => {
    for (const src of [
      `void setup() { eval("1"); } void loop() {}`,
      `void setup() { window.alert(1); } void loop() {}`,
      `void setup() { int x = globalThis; } void loop() {}`,
      `void setup() { constructor(); } void loop() {}`,
      `void setup() { int x = __proto__; } void loop() {}`,
      `void setup() { toString(); } void loop() {}`,
    ]) {
      const { result } = build(src);
      expect(result.ok, src).toBe(false);
    }
  });
});
