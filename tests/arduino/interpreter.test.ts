import { describe, expect, it } from "vitest";
import { build, errorsOf, runTo, start } from "./helpers";

describe("BEAST interpreter — timing", () => {
  it("blinks LED_BUILTIN with delay() on the virtual clock", () => {
    const { rt, host } = start(`
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}
void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}`);
    const st = runTo(rt, 4_500_000);
    expect(st.state).toBe("loop");
    expect(host.of("pinMode")[0].args).toEqual([13, "OUTPUT"]);
    const writes = host.of("digitalWrite");
    expect(writes.map((w) => w.args)).toEqual([
      [13, 1],
      [13, 0],
      [13, 1],
      [13, 0],
      [13, 1],
    ]);
    // each write happens ~1 s after the previous one (plus a few µs of instruction cost)
    for (let i = 1; i < writes.length; i++) {
      const dt = writes[i].t - writes[i - 1].t;
      expect(dt).toBeGreaterThanOrEqual(1_000_000);
      expect(dt).toBeLessThan(1_000_050);
    }
    expect(writes[0].t).toBeLessThan(100);
    expect(st.loopCount).toBe(2);
    expect(st.line).toBe(7); // suspended inside the first delay() (4th second: LED on)
  });

  it("suspends inside delay() and resumes exactly where it stopped", () => {
    const { rt, host } = start(`
void setup() { Serial.begin(9600); }
void loop() {
  Serial.print("a");
  delay(50);
  Serial.print("b");
  delay(50);
}`);
    let st = rt.runUntil(20_000);
    expect(host.serial).toBe("a");
    expect(st.nowMicros).toBe(20_000);
    st = rt.runUntil(40_000);
    expect(host.serial).toBe("a");
    st = rt.runUntil(60_000);
    expect(host.serial).toBe("ab");
    st = rt.runUntil(250_000);
    expect(host.serial).toBe("ababa");
    expect(st.throttled).toBe(false);
  });

  it("millis() and micros() follow virtual time", () => {
    const { rt, host } = start(`
unsigned long last = 0;
void setup() { Serial.begin(115200); }
void loop() {
  if (millis() - last >= 250) {
    last = millis();
    Serial.println(last);
  }
}`);
    runTo(rt, 1_010_000);
    expect(host.serial.split("\r\n").filter(Boolean).map(Number)).toEqual([250, 500, 750, 1000]);
  });

  it("an infinite loop without delay is cut by the slice cap (throttled)", () => {
    const { rt } = start(`
void setup() {}
void loop() {
  while (true) { }
}`, "uno", { maxStepsPerSlice: 10_000 });
    const t0 = Date.now();
    const st = rt.runUntil(1e12);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(st.throttled).toBe(true);
    expect(st.state).toBe("loop");
    expect(st.nowMicros).toBeGreaterThan(9_000);
    expect(st.nowMicros).toBeLessThan(11_000);
    // keeps consuming virtual time on the next call
    const st2 = rt.runUntil(1e12);
    expect(st2.nowMicros).toBeGreaterThan(st.nowMicros + 9_000);
  });

  it("an empty loop() keeps running and counts iterations", () => {
    const { rt } = start(`void setup() {} void loop() {}`);
    const st = rt.runUntil(1000);
    expect(st.nowMicros).toBeGreaterThanOrEqual(1000);
    expect(st.loopCount).toBeGreaterThan(100);
    expect(st.throttled).toBe(false);
  });
});

describe("BEAST interpreter — I/O", () => {
  it("#define pins + analogWrite with map/constrain", () => {
    const { rt, host, result } = start(`
#define ENA 11
#define POT A0
void setup() {
  pinMode(ENA, OUTPUT);
}
void loop() {
  int v = analogRead(POT);
  int speed = constrain(map(v, 0, 1023, 0, 255), 0, 200);
  analogWrite(ENA, speed);
  delay(10);
}`);
    host.analog.set(14, 512);
    rt.runUntil(5_000);
    expect(host.of("analogRead")[0].args).toEqual([14]);
    expect(host.of("analogWrite").at(-1)!.args).toEqual([11, 127]);
    host.analog.set(14, 1023);
    rt.runUntil(20_000);
    expect(host.of("analogWrite").at(-1)!.args).toEqual([11, 200]);
    host.analog.set(14, 0);
    rt.runUntil(35_000);
    expect(host.of("analogWrite").at(-1)!.args).toEqual([11, 0]);
    expect(rt.warnings).toEqual([]);
    expect(result.pinSymbols).toEqual([
      { name: "ENA", value: 11, line: 2 },
      { name: "POT", value: 14, line: 3 },
    ]);
  });

  it("analogRead costs ~112 µs and digitalWrite ~4 µs", () => {
    const { rt, host } = start(`
void setup() { pinMode(7, OUTPUT); }
void loop() {
  int v = analogRead(A1);
  digitalWrite(7, v > 100);
  digitalWrite(7, LOW);
  delay(1000);
}`);
    rt.runUntil(10_000);
    const r = host.of("analogRead")[0];
    const [w1, w2] = host.of("digitalWrite");
    expect(w1.t - r.t).toBeGreaterThanOrEqual(112);
    expect(w1.t - r.t).toBeLessThan(140);
    expect(w2.t - w1.t).toBeGreaterThanOrEqual(4);
    expect(w2.t - w1.t).toBeLessThan(20);
  });

  it("analogWrite on a non-PWM pin behaves like Arduino and warns once", () => {
    const { rt, host } = start(`
void setup() { pinMode(7, OUTPUT); }
void loop() {
  analogWrite(7, 200);
  delay(10);
  analogWrite(7, 50);
  delay(10);
}`);
    runTo(rt, 100_000);
    expect(host.of("analogWrite")).toEqual([]);
    const w = host.of("digitalWrite").map((c) => c.args);
    expect(w.slice(0, 4)).toEqual([[7, 1], [7, 0], [7, 1], [7, 0]]);
    // de-duplicated: one warning per call site, however many times the loop runs
    expect(rt.warnings.length).toBe(2);
    expect(rt.warnings[0]).toMatch(/pin 7 has no PWM/);
    expect(rt.warnings[0]).toMatch(/^Line 4:/);
    expect(rt.warnings[1]).toMatch(/^Line 6:/);
  });

  it("warns about digitalWrite without pinMode(OUTPUT)", () => {
    const { rt } = start(`void setup() {} void loop() { digitalWrite(8, HIGH); delay(5); }`);
    rt.runUntil(20_000);
    expect(rt.warnings.some((w) => /without pinMode\(8, OUTPUT\)/.test(w))).toBe(true);
  });

  it("digitalRead and INPUT_PULLUP", () => {
    const { rt, host } = start(`
const int button = 2;
void setup() { pinMode(button, INPUT_PULLUP); pinMode(13, OUTPUT); }
void loop() { digitalWrite(13, digitalRead(button) == LOW ? HIGH : LOW); delay(1); }`);
    host.digital.set(2, 1);
    rt.runUntil(500);
    expect(host.of("pinMode")[0].args).toEqual([2, "INPUT_PULLUP"]);
    expect(host.of("digitalWrite").at(-1)!.args).toEqual([13, 0]);
    host.digital.set(2, 0);
    rt.runUntil(3000);
    expect(host.of("digitalWrite").at(-1)!.args).toEqual([13, 1]);
  });

  it("pulseIn passes through to the host and blocks for the pulse length", () => {
    const { rt, host } = start(`
const int trigPin = 9;
const int echoPin = 10;
float distance;
void setup() { Serial.begin(9600); pinMode(trigPin, OUTPUT); pinMode(echoPin, INPUT); }
void loop() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH);
  distance = duration * 0.034 / 2;
  Serial.println(distance);
  long d2 = pulseIn(echoPin, LOW, 30000);
  Serial.println(d2);
  delay(100);
}`);
    host.pulseValue = 580;
    rt.runUntil(50_000);
    const p = host.of("pulseIn");
    expect(p[0].args.slice(0, 3)).toEqual([10, 1, 1_000_000]);
    expect(p[0].args[3]).toBe(p[0].t);
    expect(p[1].args.slice(0, 3)).toEqual([10, 0, 30_000]);
    expect(p[1].t - p[0].t).toBeGreaterThanOrEqual(580);
    expect(host.serial.startsWith("9.86\r\n580\r\n")).toBe(true);
  });

  it("Servo attach/write/read go through host.servoWrite", () => {
    const { rt, host } = start(`
#include <Servo.h>
Servo myServo;
void setup() {
  Serial.begin(9600);
  myServo.attach(9);
  myServo.write(45);
  Serial.println(myServo.read());
}
void loop() {
  myServo.write(180);
  delay(100);
  myServo.write(0);
  delay(100);
}`);
    rt.runUntil(150_000);
    expect(host.of("servoWrite").map((c) => c.args)).toEqual([
      [9, 90],
      [9, 45],
      [9, 180],
      [9, 0],
    ]);
    expect(host.serial).toBe("45\r\n");
  });

  it("Servo without #include <Servo.h> is a compile error", () => {
    const { result } = build(`Servo s; void setup() { s.attach(9); } void loop() {}`);
    expect(result.ok).toBe(false);
    expect(errorsOf(result)[0].message).toMatch(/#include <Servo.h>/);
  });

  it("tone() with duration calls noTone() later", () => {
    const { rt, host } = start(`void setup() { tone(8, 440, 200); } void loop() { delay(1000); }`);
    runTo(rt, 500_000);
    expect(host.of("tone")[0].args).toEqual([8, 440]);
    const nt = host.of("noTone")[0];
    expect(nt.args).toEqual([8]);
    expect(nt.t).toBeGreaterThanOrEqual(200_000);
    expect(nt.t).toBeLessThan(217_000);
  });
});

describe("BEAST interpreter — language", () => {
  const overflowSketch = `
int a = 32767;
void setup() {
  Serial.begin(9600);
  a = a + 1;
  Serial.println(a);
  int b = 1000 * 60;
  Serial.println(b);
  unsigned int u = 0;
  u--;
  Serial.println(u);
  byte by = 250;
  by += 10;
  Serial.println(by);
  long big = 1000L * 60;
  Serial.println(big);
  int x = 300;
  char c = x;
  Serial.println((int)c);
}
void loop() {}`;

  it("int is 16-bit on the Uno and wraps on overflow", () => {
    const { rt, host, result } = start(overflowSketch, "uno");
    rt.runUntil(10_000);
    expect(host.serial.split("\r\n").slice(0, 6)).toEqual(["-32768", "-5536", "65535", "4", "60000", "44"]);
    expect(result.diagnostics.some((d) => d.code === "OVERFLOW" && d.line === 7)).toBe(true);
  });

  it("int is 32-bit on the ESP32", () => {
    const { rt, host, result } = start(overflowSketch, "esp32-devkit-v1");
    rt.runUntil(10_000);
    expect(host.serial.split("\r\n").slice(0, 6)).toEqual(["32768", "60000", "4294967295", "4", "60000", "44"]);
    expect(result.diagnostics.some((d) => d.code === "OVERFLOW")).toBe(false);
  });

  it("control flow, arrays, functions and recursion", () => {
    const { rt, host } = start(`
int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }
long fib(int n) {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}
int arr[] = {5, 3, 8, 1};
int grid[2][3] = {{1, 2, 3}, {4, 5, 6}};
int total(int values[], int n) {
  int s = 0;
  for (int i = 0; i < n; i++) s += values[i];
  return s;
}
void setup() {
  Serial.begin(9600);
  int sum = 0;
  for (int i = 0; i < sizeof(arr) / sizeof(arr[0]); i++) sum += arr[i];
  Serial.println(sum);
  int k = 0;
  while (k < 10) { k += 3; if (k == 6) continue; }
  Serial.println(k);
  int g = 0;
  for (int r = 0; r < 2; r++) for (int c = 0; c < 3; c++) g += grid[r][c];
  Serial.println(g);
  for (int d = 0; d < 4; d++) {
    switch (d) {
      case 0: Serial.print("a");
      case 1: Serial.print("b"); break;
      case 2: Serial.print("c"); break;
      default: Serial.print("d");
    }
  }
  Serial.println();
  Serial.println(fact(7));
  Serial.println(fib(15));
  int x = 5;
  int y = x > 3 ? 10 : 20;
  Serial.println(y);
  int j = 0;
  do { j++; } while (j < 5);
  Serial.println(j);
  Serial.println(7 / 2);
  Serial.println(-7 / 2);
  Serial.println(-7 % 3);
  Serial.println(7.0 / 2);
  Serial.println(total(arr, 4));
  int m = 0;
  for (int i = 0, q = 10; i < q; i++, q--) m++;
  Serial.println(m);
  Serial.println((0x0F << 4) | 0b1010 ^ B11);
  Serial.println(bitRead(5, 2));
  int flags = 0;
  bitSet(flags, 3);
  Serial.println(flags);
  Serial.println(highByte(0x1234));
  Serial.println(lowByte(0x1234));
  float f = 7 / 2;
  Serial.println(f);
  int t = 9.99;
  Serial.println(t);
  Serial.println(++x + x++);
  Serial.println(x);
}
void loop() {}`);
    rt.runUntil(200_000);
    expect(host.serial.split("\r\n")).toEqual([
      "17", "12", "21", "abbcd", "5040", "610", "10", "5", "3", "-3", "-1", "3.50", "17", "5",
      "249", "1", "8", "18", "52", "3.00", "9", "12", "7", "",
    ]);
  });

  it("enum, static locals, String and global initialisers", () => {
    const { rt, host } = start(`
enum State { IDLE, RUNNING = 5, DONE };
State state = IDLE;
int counter() {
  static int n = 0;
  n++;
  return n;
}
String name = "BEAST";
void setup() {
  Serial.begin(9600);
  counter(); counter();
  Serial.println(counter());
  Serial.println(DONE);
  String msg = "Hi " + name + "! " + 42;
  msg += '!';
  Serial.println(msg);
  Serial.println(msg.length());
  Serial.println(name == "BEAST");
  Serial.println(name.substring(1, 3));
  Serial.println(String("123").toInt() + 1);
  Serial.println(String(255, HEX));
  String t = "  pad  ";
  t.trim();
  t.toUpperCase();
  Serial.println(t);
  if (state == IDLE) state = RUNNING;
  Serial.println(state);
}
void loop() {}`);
    rt.runUntil(50_000);
    expect(host.serial.split("\r\n")).toEqual(["3", "6", "Hi BEAST! 42!", "13", "1", "EA", "124", "ff", "PAD", "5", ""]);
  });

  it("Serial.println formatting matches Arduino", () => {
    const { rt, host } = start(`
void setup() {
  Serial.begin(9600);
  Serial.println(3.14159);
  Serial.println(3.14159, 4);
  Serial.println(255, HEX);
  Serial.println(5, BIN);
  Serial.println(8, OCT);
  Serial.println(-1, HEX);
  Serial.println('A');
  Serial.println((byte)65);
  Serial.println("text");
  Serial.println(F("flash"));
  Serial.print(true);
  Serial.println(-2.5);
  Serial.println(10 / 3.0, 0);
  Serial.println(1e10);
  Serial.println(String(1.5));
  Serial.println(String(2.25, 1));
  char buf[] = "chars";
  Serial.println(buf);
  Serial.write(66);
  Serial.println();
  unsigned long big = 4000000000UL;
  Serial.println(big);
}
void loop() {}`);
    rt.runUntil(50_000);
    expect(host.serial).toBe(
      ["3.14", "3.1416", "FF", "101", "10", "FFFFFFFF", "A", "65", "text", "flash", "1-2.50", "3", "ovf", "1.50", "2.3", "chars", "B", "4000000000", ""].join("\r\n"),
    );
  });

  it("Serial input: available/read/parseInt/readStringUntil", () => {
    const { rt, host } = start(`
void setup() { Serial.begin(9600); }
void loop() {
  if (Serial.available() > 0) {
    int n = Serial.parseInt();
    String rest = Serial.readStringUntil('\\n');
    Serial.print(n * 2);
    Serial.print("|");
    Serial.println(rest);
  }
}`);
    host.sendSerial("speed 21 fast\n");
    rt.runUntil(5_000);
    expect(host.serial).toBe("42| fast\r\n");
  });

  it("random() is deterministic (avr-libc sequence) and respects ranges", () => {
    const src = `
void setup() {
  Serial.begin(9600);
  randomSeed(42);
  for (int i = 0; i < 20; i++) { Serial.print(random(10, 20)); Serial.print(","); }
}
void loop() {}`;
    const a = start(src);
    a.rt.runUntil(50_000);
    const b = start(src);
    b.rt.runUntil(50_000);
    expect(a.host.serial).toBe(b.host.serial);
    const nums = a.host.serial.split(",").filter(Boolean).map(Number);
    expect(nums.length).toBe(20);
    expect(nums.every((n) => n >= 10 && n < 20)).toBe(true);
    expect(new Set(nums).size).toBeGreaterThan(3);
  });

  it("PID line follower: motor outputs respond to the 5 sensors", () => {
    const { rt, host } = start(`
const int sensorPins[5] = {A0, A1, A2, A3, A4};
#define ENA 5
#define ENB 6
float Kp = 25, Ki = 0.5, Kd = 15;
float lastError = 0, integral = 0;
int baseSpeed = 150;

float readPosition() {
  long weighted = 0;
  long total = 0;
  for (int i = 0; i < 5; i++) {
    int v = analogRead(sensorPins[i]);
    weighted += (long)v * (i * 1000);
    total += v;
  }
  if (total == 0) return 2000;
  return (float)weighted / total;
}

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);
}

void loop() {
  float pos = readPosition();
  float error = (pos - 2000) / 1000.0;
  integral = constrain(integral + error, -50, 50);
  float derivative = error - lastError;
  lastError = error;
  float correction = Kp * error + Ki * integral + Kd * derivative;
  int left = constrain(baseSpeed + correction, 0, 255);
  int right = constrain(baseSpeed - correction, 0, 255);
  analogWrite(ENA, left);
  analogWrite(ENB, right);
  delay(5);
}`);
    const setLine = (vals: number[]) => vals.forEach((v, i) => host.analog.set(14 + i, v));
    const lastOut = () => {
      const w = host.of("analogWrite");
      const l = [...w].reverse().find((c) => c.args[0] === 5)!.args[1] as number;
      const r = [...w].reverse().find((c) => c.args[0] === 6)!.args[1] as number;
      return { l, r };
    };
    setLine([0, 0, 1000, 0, 0]);
    runTo(rt, 100_000);
    expect(lastOut()).toEqual({ l: 150, r: 150 });
    // line under the right-most sensor → steer: left motor faster
    setLine([0, 0, 0, 200, 900]);
    runTo(rt, 200_000);
    const right = lastOut();
    expect(right.l).toBeGreaterThan(190);
    expect(right.r).toBeLessThan(110);
    // line under the left-most sensor → right motor faster
    setLine([900, 200, 0, 0, 0]);
    runTo(rt, 400_000);
    const left = lastOut();
    expect(left.r).toBeGreaterThan(left.l + 50);
    expect(host.of("analogRead").slice(0, 5).map((c) => c.args[0])).toEqual([14, 15, 16, 17, 18]);
    expect(rt.status.state).toBe("loop");
  });
});

describe("BEAST interpreter — interrupts", () => {
  it("attachInterrupt + triggerInterrupt counts pulses, also during delay()", () => {
    const { rt, host } = start(`
volatile int count = 0;
void onPulse() {
  count++;
}
void setup() {
  Serial.begin(9600);
  attachInterrupt(digitalPinToInterrupt(2), onPulse, RISING);
}
void loop() {
  delay(100);
  Serial.println(count);
}`);
    rt.runUntil(10_000);
    for (let i = 0; i < 5; i++) {
      rt.triggerInterrupt(2);
      rt.runUntil(20_000 + i * 10_000);
    }
    rt.triggerInterrupt(3); // nothing attached on pin 3
    runTo(rt, 105_000);
    expect(host.serial).toBe("5\r\n");
    expect(rt.attachedInterrupts).toEqual([{ pin: 2, mode: 3 }]);
  });

  it("noInterrupts() defers ISRs until interrupts()", () => {
    const { rt, host } = start(`
volatile int hits = 0;
void isr() { hits++; }
void setup() {
  Serial.begin(9600);
  attachInterrupt(digitalPinToInterrupt(3), isr, CHANGE);
  noInterrupts();
}
void loop() {
  delay(10);
  Serial.println(hits);
  if (hits == 0) interrupts();
}`);
    rt.runUntil(1_000);
    rt.triggerInterrupt(3);
    rt.runUntil(10_500);
    rt.runUntil(30_000);
    expect(host.serial.split("\r\n").slice(0, 2)).toEqual(["0", "1"]);
  });

  it("attachInterrupt on a non-interrupt pin warns", () => {
    const { rt } = start(`void f() {} void setup() { attachInterrupt(digitalPinToInterrupt(7), f, RISING); } void loop() {}`);
    rt.runUntil(1000);
    expect(rt.warnings.join(" ")).toMatch(/not a valid interrupt number|cannot trigger interrupts/);
  });
});

describe("BEAST interpreter — runtime errors", () => {
  it("array index out of bounds stops with line and message", () => {
    const { rt } = start(`
int a[3];
void setup() {
  for (int i = 0; i <= 3; i++) {
    a[i] = i * 2;
  }
}
void loop() {}`);
    const st = rt.runUntil(10_000);
    expect(st.state).toBe("error");
    expect(st.error!.line).toBe(5);
    expect(st.error!.message).toMatch(/out of bounds: a\[3\]/);
    expect(st.line).toBe(5);
    // stays in error
    expect(rt.runUntil(20_000).state).toBe("error");
  });

  it("integer division by zero", () => {
    const { rt } = start(`
int zero = 0;
void setup() {
  int x = 10;
  int y = x / zero;
}
void loop() {}`);
    const st = rt.runUntil(10_000);
    expect(st.state).toBe("error");
    expect(st.error!.line).toBe(5);
    expect(st.error!.message).toMatch(/Division by zero/);
  });

  it("runaway recursion → stack overflow (maxCallDepth)", () => {
    const { rt } = start(`
int down(int n) {
  return down(n + 1);
}
void setup() { down(0); }
void loop() {}`, "uno", { maxCallDepth: 32 });
    const st = rt.runUntil(1_000_000);
    expect(st.state).toBe("error");
    expect(st.error!.message).toMatch(/Stack overflow/);
    expect(st.error!.line).toBe(3);
  });

  it("reset() returns to power-on state", () => {
    const { rt, host } = start(`void setup() { Serial.begin(9600); Serial.print("x"); } void loop() { delay(1000); }`);
    rt.runUntil(1000);
    rt.reset();
    expect(rt.status.state).toBe("ready");
    expect(rt.status.nowMicros).toBe(0);
    rt.runUntil(1000);
    expect(host.serial).toBe("xx");
  });
});
