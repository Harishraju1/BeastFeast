import { defineTopic } from "../define";
import type { Topic } from "../types";

export const RACE_13: Topic[] = [
  defineTopic("race", 13, {
    slug: "power-management",
    title: "Power Management",
    minutes: 10,
    summary: "Distributing battery power safely to motors and logic: common ground, regulators, decoupling, brown-outs and battery monitoring.",
    introduction:
      "A race car's motors draw large, rapidly changing currents, while the Arduino and sensors need a clean, steady 5 V. Power management is the art of feeding both from the same battery without the motors disturbing the logic, without wasting energy as heat, and without damaging the battery. Many 'mystery' resets and glitches on race day are power problems.",
    beginner:
      "Imagine a house where the washing machine and a desk lamp share one electricity supply. When the big machine starts, the lights flicker. In a robot, the motors are the washing machine and the Arduino is the desk lamp. When motors start, stop or reverse, they suddenly gulp current, and the battery voltage dips for a moment. If it dips far enough, the Arduino resets, and your robot stops in the middle of the race.\n\nGood power management keeps the 'lamp' steady. We give the electronics their own regulated 5 V supply, add capacitors that act like small water tanks to cover short dips, use thick short wires for the motor current, and connect all the grounds together at one point so every part agrees on what zero volts means.\n\nWe also look after the battery: a switch to turn everything off, a fuse to protect against short circuits, and a simple voltage measurement so the robot can warn you when the battery is getting low. Lithium batteries can be damaged by draining them too far, so knowing their voltage protects both your robot and your battery.",
    technical: [
      {
        heading: "Supply architecture",
        body:
          "Common layouts:\n\n- Single battery, shared: battery → motor driver; battery → Arduino Vin (onboard regulator) or a separate 5 V regulator for logic. Simple and light; needs good decoupling.\n- Two batteries: one for motors, one for logic. Best noise isolation, extra weight.\n\nIn every case all grounds must be connected: battery −, driver GND and Arduino GND. Run the high-current motor wires directly from the battery to the driver (star layout) so motor current does not flow through the Arduino's ground path.",
      },
      {
        heading: "Regulators: linear vs switching",
        body:
          "A linear regulator (7805, or the Uno's onboard regulator) drops the excess voltage as heat: P = (V_in − V_out) · I. From a full 2S pack (8.4 V) at 0.3 A: (8.4 − 5) × 0.3 ≈ 1.0 W of heat. Linear regulators also need some headroom (dropout) above 5 V.\n\nA switching buck converter converts voltage efficiently (often well above 80%), so it runs cool even at higher currents. It is the better choice when logic and sensors draw a lot, for example with an ESP32 and many sensors.",
      },
      {
        heading: "Decoupling and brown-outs",
        body:
          "Motor start-up and reversal currents approach the stall current I = V/R for a few milliseconds, which pulls the battery voltage down through its internal resistance and the wiring. If the Arduino's supply dips too low, the microcontroller resets (brown-out).\n\nCountermeasures:\n- A bulk electrolytic capacitor (a few hundred µF is common) across the driver's motor supply, close to the driver.\n- 0.1 µF ceramic capacitors across motor terminals and near logic supply pins.\n- Avoid instant full-forward to full-reverse switches: brake or ramp first.\n- Short, thick motor supply wires and good connectors.",
      },
      {
        heading: "Battery monitoring and protection",
        body:
          "Measure the battery with a voltage divider so the ADC input never exceeds 5 V: V_out = V_in · R2 / (R1 + R2). With R1 = R2 = 10 kΩ, 8.4 V becomes 4.2 V. The Uno's 10-bit ADC returns 0–1023 for 0–5 V, so V_battery = raw × 5.0 / 1023 × 2.\n\nUse floating-point (5.0, not 5) in the formula, otherwise integer division throws away the fraction. Add a main switch and a fuse near the battery, and stop running at a safe per-cell voltage for lithium packs.",
      },
    ],
    workingPrinciple:
      "The battery feeds two very different loads. The motor path carries large pulsed currents straight from the battery to the driver; the logic path is regulated down to a stable 5 V. Capacitors supply short current bursts locally so the voltage on each path stays steady, a shared ground gives all signals a common reference, and a divider lets the Arduino read the battery voltage to manage its state of charge.",
    diagrams: [
      { kind: "circuit", nodes: [ { id: "bat", label: "2S battery", x: 5, y: 50 }, { id: "fuse", label: "Fuse + switch", x: 25, y: 50 }, { id: "cap", label: "Bulk capacitor", x: 45, y: 25 }, { id: "drv", label: "Motor driver", x: 65, y: 25 }, { id: "reg", label: "5 V regulator / Vin", x: 45, y: 75 }, { id: "uno", label: "Arduino", x: 70, y: 75 }, { id: "div", label: "10k/10k divider → A0", x: 90, y: 75 } ], edges: [ { from: "bat", to: "fuse", color: "red" }, { from: "fuse", to: "cap", color: "red" }, { from: "cap", to: "drv", label: "motor supply", color: "red" }, { from: "fuse", to: "reg", label: "logic supply", color: "orange" }, { from: "reg", to: "uno", label: "5 V" }, { from: "fuse", to: "div", label: "battery sense" }, { from: "drv", to: "uno", label: "common GND", color: "black" } ] },
      { kind: "formula", latexish: "V_out = V_in · R2 / (R1 + R2) ;  P_reg = (V_in − V_out) · I", legend: { V_out: "divider or regulator output (V)", V_in: "input voltage (V)", R1: "top resistor (Ω)", R2: "bottom resistor (Ω)", P_reg: "linear regulator heat (W)", I: "load current (A)" } },
    ],
    examples: [
      {
        title: "Low-battery warning",
        body: "The robot reads its 2S pack through a 10k/10k divider on A0. Below 6.6 V (3.3 V per cell, a conservative example limit) it reduces speed and blinks the onboard LED so you know to swap packs.",
        code: `const int BAT_PIN = A0;
const float LOW_V = 6.6;

float batteryVolts() {
  int raw = analogRead(BAT_PIN);
  return raw * 5.0 / 1023.0 * 2.0;
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  float v = batteryVolts();
  Serial.println(v);
  if (v < LOW_V) {
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
  } else {
    digitalWrite(LED_BUILTIN, LOW);
  }
  delay(250);
}`,
      },
      {
        title: "Safe direction reversal",
        body: "Instead of jumping from +255 to −255 (which draws roughly double the stall current for an instant because back-EMF adds to the battery voltage), brake to zero, pause briefly, then ramp the new direction. This avoids supply dips that reset the Arduino.",
        code: `const int ENA = 5, IN1 = 7, IN2 = 8;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
}

void reverseGently() {
  analogWrite(ENA, 0);
  delay(50);
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
  for (int p = 0; p <= 200; p += 20) {
    analogWrite(ENA, p);
    delay(10);
  }
}

void loop() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  analogWrite(ENA, 200);
  delay(1000);
  reverseGently();
  delay(1000);
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Wiring the battery directly to an analog pin to measure it.", why: "A 2S pack reaches 8.4 V, above the 5 V maximum of the Uno's inputs, which can damage the microcontroller.", fix: "Use a resistor divider (e.g. 10 kΩ/10 kΩ) so the pin sees at most about 4.2 V." },
      { mistake: "Routing motor current through the Arduino's GND pins.", why: "Large currents in thin ground paths shift the Arduino's ground and inject noise.", fix: "Star-wire: battery to driver with thick wires; connect a single ground wire from the driver to the Arduino." },
      { mistake: "Using integer maths for voltage calculations.", why: "raw * 5 / 1023 is integer division and loses the decimal part, giving steps of whole volts.", fix: "Use floating-point constants: raw * 5.0 / 1023.0." },
    ],
    keyTakeaways: [
      "Separate the high-current motor path from the regulated logic path; share one ground.",
      "Linear regulator heat = (V_in − V_out) × I; use a buck converter for high logic current.",
      "Bulk and ceramic capacitors prevent brown-out resets and noise.",
      "Measure battery voltage through a divider; never exceed 5 V on an Uno input.",
      "Fit a switch and fuse, and stop before lithium cells are over-discharged.",
    ],
    relatedComponents: ["7805 Voltage Regulator", "LM2596 Buck Converter", "Electrolytic Capacitor", "18650 Li-ion Cell", "Arduino Uno R3"],
    youtubeSearch: "robot power supply brownout Arduino reset motors capacitor",
    quiz: [
      {
        type: "predict-circuit",
        prompt: "The Arduino is powered from the same 2S pack as the motors (through Vin). Every time the code switches the motors instantly from full forward to full reverse, the Arduino restarts. What is the most likely cause?",
        options: ["A supply-voltage dip from the large reversal current causes a brown-out reset", "The code has an infinite loop", "PWM pins cannot change direction", "The battery voltage rises above 12 V"],
        answerIndex: 0,
        explanation: "Reversing at full speed draws a very large current spike (the back-EMF adds to the supply), so the battery voltage sags and the Arduino browns out. An infinite loop would not reset the board, and direction is set by IN pins, not PWM pins. The pack cannot rise above its charged voltage.",
        difficulty: 2,
      },
      {
        type: "find-wrong-connection",
        prompt: "A team wants to measure their 2S (8.4 V full) battery on A0. Which connection is dangerous?",
        diagram: { kind: "circuit", nodes: [ { id: "bat", label: "2S battery", x: 10, y: 50 }, { id: "drv", label: "L298N", x: 50, y: 15 }, { id: "uno", label: "Arduino Uno", x: 85, y: 50 } ], edges: [ { from: "bat", to: "drv", label: "+ to 12V terminal" }, { from: "bat", to: "uno", label: "− to GND" }, { from: "drv", to: "uno", label: "GND to GND" }, { from: "bat", to: "uno", label: "+ directly to A0" } ] },
        options: ["Battery + to the L298N 12V terminal", "Battery − to Arduino GND", "L298N GND to Arduino GND", "Battery + directly to A0"],
        answerIndex: 3,
        explanation: "A0 must never see more than 5 V (the supply), but a full 2S pack is 8.4 V. Insert a divider such as 10 kΩ/10 kΩ so A0 sees about 4.2 V. The other connections are correct: the shared grounds are actually required.",
        difficulty: 1,
      },
      {
        type: "debug-code",
        prompt: "This battery monitor (10k/10k divider on A0) only ever prints whole numbers such as 8.00 or 6.00. What is the bug?",
        code: `void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(A0);
  float v = raw * 5 / 1023 * 2;
  Serial.println(v);
  delay(500);
}`,
        options: ["analogRead returns a float, so raw should be float", "The divider must be 10k/20k", "raw * 5 / 1023 is integer division; use raw * 5.0 / 1023.0", "Serial.println cannot print floats"],
        answerIndex: 2,
        explanation: "All operands on the right side are integers, so the division truncates before the result is stored in the float (e.g. 860 × 5 / 1023 = 4, × 2 = 8 → 8.00). Using 5.0 and 1023.0 forces floating-point maths. analogRead returns an int, and Serial.println prints floats with two decimals.",
        difficulty: 2,
      },
      {
        type: "code-output",
        prompt: "What does this code print on an Arduino Uno?",
        code: `void setup() {
  Serial.begin(9600);
  int raw = 860;
  float v = raw * 5.0 / 1023.0 * 2.0;
  Serial.println(v);
}

void loop() {
}`,
        options: ["8.41", "8.40", "4.20", "8"],
        answerIndex: 0,
        explanation: "860 × 5.0 / 1023.0 ≈ 4.2033, × 2.0 ≈ 8.4066. Serial.println(float) prints two decimal places with rounding, so it shows 8.41. 8.40 would be truncation instead of rounding, and 4.20 forgets the ×2 for the divider.",
        difficulty: 2,
      },
      {
        type: "identify-driver",
        prompt: "Which driver wastes the least power as heat when each motor draws 1 A?",
        options: ["L298N, because it has a large heatsink", "All drivers waste the same power at the same current", "L298N, because bipolar transistors have no resistance", "TB6612FNG, because its MOSFETs have low on-resistance"],
        answerIndex: 3,
        explanation: "The TB6612FNG's MOSFET switches drop roughly 0.5 V at 1 A (about 0.5 W), while the L298N drops about 2 V (about 2 W). The L298N's big heatsink exists precisely because it wastes more power; it does not reduce the loss.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("race", 14, {
    slug: "pwm",
    title: "PWM",
    minutes: 10,
    summary: "How pulse-width modulation controls motor speed, which Uno pins and frequencies you get, and the integer-maths traps in PWM code.",
    introduction:
      "Pulse-width modulation (PWM) is how a microcontroller that can only output 0 V or 5 V controls motor speed smoothly. By switching the motor driver on and off hundreds of times per second, the Arduino sets the average voltage the motor sees. For a race car, good PWM handling means smooth launches, precise speed matching between sides and predictable cornering.",
    beginner:
      "Imagine turning a light switch on and off very quickly. If the light is on half the time and off half the time, and you do it fast enough, the room looks half as bright. That is PWM: Pulse Width Modulation.\n\nA motor works the same way. The Arduino turns the motor driver fully on, then fully off, again and again, around 490 or 980 times every second on an Uno. The motor is heavy and slow compared with that, so it cannot follow every pulse. It simply responds to the average. On 75% of the time means roughly 75% of the voltage and a faster motor; on 25% of the time means a slower motor.\n\nIn Arduino code you use analogWrite(pin, value) where value goes from 0 (always off) to 255 (always on). So analogWrite(5, 128) is about half power.\n\nOnly some pins can do this on an Uno: 3, 5, 6, 9, 10 and 11, marked with a ~ symbol on the board. Use any other pin and you get only fully on or fully off. Very low PWM values may not be enough to start the motor at all, because the motor needs a minimum push to overcome friction.",
    technical: [
      {
        heading: "Duty cycle and average voltage",
        body:
          "Duty cycle D = t_on / T. With analogWrite, D = value / 255. The average voltage at the motor is V_avg = D · V_supply (minus the driver's drop).\n\nWorked example: 7.4 V supply, analogWrite(pin, 191): D = 191/255 ≈ 74.9%, V_avg ≈ 5.54 V before driver losses. With an L298N dropping about 2 V the motor sees roughly 0.749 × 5.4 ≈ 4.0 V.\n\nThe motor's inductance smooths current between pulses, and the rotor's inertia smooths speed, so speed follows the average.",
      },
      {
        heading: "Uno PWM pins and frequencies",
        body:
          "- Pins 5 and 6 (Timer0): about 980 Hz.\n- Pins 3, 9, 10, 11 (Timer1 and Timer2): about 490 Hz.\n- analogWrite(pin, 0) gives a constant LOW and analogWrite(pin, 255) a constant HIGH.\n- On a non-PWM pin, analogWrite outputs LOW for values below 128 and HIGH for 128 and above.\n- The Servo library uses Timer1 and disables PWM on pins 9 and 10; tone() uses Timer2 and interferes with pins 3 and 11.\n\nThese frequencies are in the audible range, which is why motors whine at low PWM. Changing timer prescalers can move the frequency, but altering Timer0 also changes millis() and delay(), so leave Timer0 alone unless you know exactly what you are doing.",
      },
      {
        heading: "Deadband and non-linearity",
        body:
          "Static friction in the motor and gearbox means a motor often does not start until the duty cycle passes some minimum (the deadband), commonly a noticeable fraction of full scale for small gear motors. Above that, speed rises roughly but not perfectly linearly with duty. Practical code maps a 0–100% command onto [minPWM, 255] instead of [0, 255], with minPWM measured on your robot.",
      },
      {
        heading: "Integer traps in PWM code",
        body:
          "- percent * 255 / 100 with int: fine up to percent = 128 (128 × 255 = 32640), but 150 × 255 = 38250 overflows the 16-bit int.\n- value / 255 * 100 with int truncates to 0 for any value below 255.\n- Always constrain the final value to 0–255 before analogWrite.",
      },
    ],
    workingPrinciple:
      "A hardware timer counts continuously and toggles the output pin when the count passes a compare value set by analogWrite. The output is a square wave with a fixed frequency whose high time is proportional to the value. The motor driver copies this switching onto the motor at battery voltage, and the motor's inductance and inertia average it, so the motor behaves as if it received D × V_supply.",
    diagrams: [
      { kind: "signal", title: "PWM at 25% and 75% duty cycle", xLabel: "Time (fraction of period)", yLabel: "Output (V)", series: [ { label: "25% (analogWrite 64)", points: [[0, 5], [0.25, 5], [0.25, 0], [1, 0], [1, 5], [1.25, 5], [1.25, 0], [2, 0]] }, { label: "75% (analogWrite 191)", points: [[0, 5], [0.75, 5], [0.75, 0], [1, 0], [1, 5], [1.75, 5], [1.75, 0], [2, 0]] } ] },
      { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D3", "D5", "D6", "D9", "D10", "D11"] },
      { kind: "formula", latexish: "D = value / 255 ;  V_avg = D · V_supply", legend: { D: "duty cycle (0–1)", value: "analogWrite argument (0–255)", V_avg: "average motor voltage (V)", V_supply: "driver supply voltage (V)" } },
    ],
    examples: [
      {
        title: "Percent speed with deadband compensation",
        body: "Maps a speed command of 0–100% onto the useful PWM range. MIN_PWM is measured on your robot: raise PWM slowly until the wheels just start turning on the ground.",
        code: `const int ENA = 5, IN1 = 7, IN2 = 8;
const int MIN_PWM = 70;

int percentToPwm(int percent) {
  percent = constrain(percent, 0, 100);
  if (percent == 0) return 0;
  return map(percent, 1, 100, MIN_PWM, 255);
}

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  Serial.begin(9600);
}

void loop() {
  for (int s = 0; s <= 100; s += 10) {
    int p = percentToPwm(s);
    analogWrite(ENA, p);
    Serial.print(s);
    Serial.print("% -> ");
    Serial.println(p);
    delay(300);
  }
}`,
      },
      {
        title: "Finding your deadband",
        body: "Slowly ramp PWM by 1 every 100 ms with the robot on the floor and print the value. Note the value when the robot starts to creep; repeat three times and take the highest. That is MIN_PWM. Repeat with a full and a partly discharged battery: the deadband grows as the battery voltage falls.",
        code: `const int ENA = 5, IN1 = 7, IN2 = 8;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  Serial.begin(9600);
  for (int p = 0; p <= 255; p++) {
    analogWrite(ENA, p);
    Serial.println(p);
    delay(100);
  }
  analogWrite(ENA, 0);
}

void loop() {
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Wiring ENA to a non-PWM pin such as D7.", why: "analogWrite on a non-PWM pin only outputs fully LOW (value < 128) or fully HIGH (value ≥ 128).", fix: "Use pins 3, 5, 6, 9, 10 or 11 for speed control." },
      { mistake: "Using the Servo library while driving motors from pins 9 or 10.", why: "Servo takes over Timer1 and disables analogWrite on pins 9 and 10.", fix: "Move motor PWM to pins 3, 5, 6 or 11 when using Servo (and avoid 3/11 if you use tone())." },
      { mistake: "Doing speed maths in 16-bit int.", why: "Products like 150 × 255 overflow and divisions truncate, giving wrong or negative PWM.", fix: "Use long or float for intermediate maths and constrain the result to 0–255." },
    ],
    keyTakeaways: [
      "PWM sets average voltage: V_avg = (value/255) × V_supply.",
      "Uno PWM pins: 3, 5, 6, 9, 10, 11; ~980 Hz on 5 and 6, ~490 Hz on the others.",
      "Motors have a deadband; map commands onto [MIN_PWM, 255].",
      "Servo disables PWM on 9 and 10; tone() affects 3 and 11.",
      "Watch for integer overflow and truncation in PWM calculations.",
    ],
    relatedComponents: ["Arduino Uno R3", "L298N", "TB6612FNG", "DRV8833", "N20 Micro Metal Gear Motor"],
    youtubeSearch: "Arduino PWM motor speed control analogWrite explained",
    quiz: [
      {
        type: "code-output",
        prompt: "What does this code print on an Arduino Uno?",
        code: `void setup() {
  Serial.begin(9600);
  int duty = 75;
  int pwmVal = duty * 255 / 100;
  Serial.println(pwmVal);
}

void loop() {
}`,
        options: ["191.25", "192", "190", "191"],
        answerIndex: 3,
        explanation: "75 × 255 = 19125, which fits in a 16-bit int, and 19125 / 100 = 191 with integer division (the .25 is discarded, not rounded). An int can never print 191.25, and integer division truncates rather than rounding up to 192.",
        difficulty: 1,
      },
      {
        type: "identify-pin",
        prompt: "Which of these Arduino Uno pins can NOT produce a hardware PWM signal with analogWrite?",
        diagram: { kind: "pinout", componentId: "arduino-uno-r3" },
        options: ["D7", "D3", "D9", "D11"],
        answerIndex: 0,
        explanation: "The Uno's PWM pins are 3, 5, 6, 9, 10 and 11 (marked ~). D7 is a plain digital pin, so analogWrite on it only gives fully LOW or fully HIGH.",
        difficulty: 1,
      },
      {
        type: "debug-code",
        prompt: "With this code the motor does not move at analogWrite(ENA, 100), yet runs at full speed at analogWrite(ENA, 200). The L298N jumper is removed and wiring matches the code. What is wrong?",
        code: `const int ENA = 7;
const int IN1 = 8;
const int IN2 = 9;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
}

void loop() {
  analogWrite(ENA, 100);
  delay(2000);
  analogWrite(ENA, 200);
  delay(2000);
}`,
        options: ["IN1 and IN2 must be swapped", "The delay is too short for the motor to respond", "PWM values must be above 150 for L298N", "ENA is on pin 7, which is not a PWM pin, so analogWrite acts like digitalWrite"],
        answerIndex: 3,
        explanation: "On a non-PWM pin analogWrite outputs LOW for values below 128 and HIGH for 128 and above: 100 → off, 200 → full on. Move ENA to a PWM pin (3, 5, 6, 9, 10 or 11). Swapping IN pins would only reverse direction, and two seconds is plenty of time to respond.",
        difficulty: 2,
      },
      {
        type: "code-output",
        prompt: "What does this code print on an Arduino Uno?",
        code: `void setup() {
  Serial.begin(9600);
  int pwmVal = 200;
  float duty = pwmVal / 255 * 100;
  Serial.println(duty);
}

void loop() {
}`,
        options: ["0.00", "78.43", "78.00", "100.00"],
        answerIndex: 0,
        explanation: "pwmVal / 255 is integer division: 200 / 255 = 0. Then 0 × 100 = 0, converted to float and printed as 0.00. Storing the result in a float does not help because the truncation already happened; writing pwmVal / 255.0 * 100 gives 78.43.",
        difficulty: 3,
      },
      {
        type: "predict-circuit",
        prompt: "A MOSFET motor driver (ignore its small voltage drop) is powered from 8 V. The Arduino calls analogWrite on the driver's PWM input with value 127. What average voltage would a multimeter measure across the motor (approximately)?",
        options: ["8.0 V", "0 V", "4.0 V", "2.0 V"],
        answerIndex: 2,
        explanation: "D = 127/255 ≈ 0.498, so V_avg ≈ 0.498 × 8 ≈ 4.0 V. 8.0 V would be analogWrite 255 (always on); 2.0 V would correspond to about 25% duty.",
        difficulty: 2,
      },
    ],
  }),
];
