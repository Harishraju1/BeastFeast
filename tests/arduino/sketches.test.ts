import { describe, expect, it } from "vitest";
import { runTo, start } from "./helpers";

/** Typical student sketches must compile and run without errors. */
const SKETCHES: Record<string, string> = {
  blinkWithoutDelay: `
const int ledPin = LED_BUILTIN;
int ledState = LOW;
unsigned long previousMillis = 0;
const long interval = 1000;
void setup() { pinMode(ledPin, OUTPUT); }
void loop() {
  unsigned long currentMillis = millis();
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;
    if (ledState == LOW) ledState = HIGH; else ledState = LOW;
    digitalWrite(ledPin, ledState);
  }
}`,
  ultrasonic: `
#define TRIG_PIN 9
#define ECHO_PIN 10
long duration;
int distance;
void setup() {
  Serial.begin(9600);
  while (!Serial) ;
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
}
void loop() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  duration = pulseIn(ECHO_PIN, HIGH);
  distance = duration * 0.034 / 2;
  Serial.print("Distance: ");
  Serial.print(distance);
  Serial.println(" cm");
  delay(100);
}`,
  servoSweep: `
#include <Servo.h>
Servo myservo;
int pos = 0;
void setup() { myservo.attach(9); }
void loop() {
  for (pos = 0; pos <= 180; pos += 1) { myservo.write(pos); delay(15); }
  for (pos = 180; pos >= 0; pos -= 1) { myservo.write(pos); delay(15); }
}`,
  motorFunctions: `
const int IN1 = 7, IN2 = 8, ENA = 5;
const int IN3 = 12, IN4 = 13, ENB = 6;
byte leds[] = {2, 3, 4};
void motor(int left, int right) {
  digitalWrite(IN1, left >= 0 ? HIGH : LOW);
  digitalWrite(IN2, left >= 0 ? LOW : HIGH);
  analogWrite(ENA, abs(left));
  digitalWrite(IN3, right >= 0);
  digitalWrite(IN4, right < 0);
  analogWrite(ENB, min(abs(right), 255));
}
void setup() {
  int pins[] = {IN1, IN2, ENA, IN3, IN4, ENB};
  for (int i = 0; i < 6; i++) pinMode(pins[i], OUTPUT);
  for (byte i = 0; i < sizeof(leds); i++) pinMode(leds[i], OUTPUT);
}
void loop() {
  float voltage = analogRead(A0) * (5.0 / 1023.0);
  char c = 'a' + 1;
  if (voltage > 2.5 && c == 'b') motor(200, -150); else motor(-100, 100);
  for (int i = 0; i < 3; i++) digitalWrite(leds[i], !digitalRead(leds[i]));
  delay(20);
}`,
  serialEvent: `
String inputString = "";
boolean stringComplete = false;
void setup() { Serial.begin(9600); inputString.reserve(200); }
void loop() {
  if (stringComplete) {
    Serial.println(inputString);
    inputString = "";
    stringComplete = false;
  }
}
void serialEvent() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    inputString += inChar;
    if (inChar == '\\n') stringComplete = true;
  }
}`,
  stateMachine: `
enum Mode { FORWARD, TURN, STOP };
Mode mode = FORWARD;
unsigned long modeStart;
void setup() { Serial.begin(115200); modeStart = millis(); }
void loop() {
  unsigned long elapsed = millis() - modeStart;
  switch (mode) {
    case FORWARD:
      if (elapsed > 300) { mode = TURN; modeStart = millis(); Serial.println("turn"); }
      break;
    case TURN:
      if (elapsed > 100) { mode = STOP; Serial.println("stop"); }
      break;
    case STOP:
      break;
  }
}`,
};

describe("typical student sketches", () => {
  for (const [name, src] of Object.entries(SKETCHES)) {
    it(`${name} compiles and runs on uno and esp32`, () => {
      for (const board of ["uno", "esp32-devkit-v1", "pico", "mega"]) {
        const { rt, host } = start(src, board);
        host.pulseValue = 1000;
        host.analog.set(board === "esp32-devkit-v1" ? 36 : board === "pico" ? 26 : board === "mega" ? 54 : 14, 800);
        host.sendSerial("hello\n");
        const st = runTo(rt, 2_000_000);
        expect(st.state, `${name} on ${board}: ${st.error?.message}`).toBe("loop");
      }
    });
  }

  it("serialEvent() is called between loop() iterations when data arrives", () => {
    const { rt, host } = start(SKETCHES.serialEvent);
    host.sendSerial("ping\n");
    rt.runUntil(10_000);
    expect(host.serial).toBe("ping\n\r\n");
  });

  it("state machine with enum + millis()", () => {
    const { rt, host } = start(SKETCHES.stateMachine);
    runTo(rt, 1_000_000);
    expect(host.serial).toBe("turn\r\nstop\r\n");
  });

  it("ultrasonic distance prints with text", () => {
    const { rt, host } = start(SKETCHES.ultrasonic);
    host.pulseValue = 1000;
    rt.runUntil(50_000);
    expect(host.serial.startsWith("Distance: 17 cm\r\n")).toBe(true);
  });
});

describe("performance", () => {
  it("executes a busy loop at a useful speed", () => {
    const { rt } = start(`
long counter = 0;
float acc = 0;
void setup() {}
void loop() {
  for (int i = 0; i < 100; i++) {
    counter += i * 3;
    acc = acc * 0.5 + i;
  }
}`, "uno", { maxStepsPerSlice: 2_000_000 });
    const t0 = performance.now();
    let steps = 0;
    for (let k = 0; k < 5; k++) {
      const before = rt.nowMicros;
      rt.runUntil(1e12);
      steps += rt.nowMicros - before; // 1 µs per step
    }
    const ms = performance.now() - t0;
    const perSec = (steps / ms) * 1000;
    console.log(`BEAST VM: ${(perSec / 1e6).toFixed(1)} M steps/s (${steps} steps in ${ms.toFixed(0)} ms)`);
    expect(perSec).toBeGreaterThan(1_000_000);
  });
});
