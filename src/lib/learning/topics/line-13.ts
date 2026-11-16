import { defineTopic } from "../define";
import type { Topic } from "../types";

export const LINE_13: Topic[] = [
  defineTopic("line", 13, {
    slug: "adc",
    title: "ADC",
    minutes: 12,
    summary: "The analog-to-digital converter turns a voltage between 0 and the reference (5 V on the Uno) into a number from 0 to 1023, letting the robot measure sensors and battery voltage.",
    introduction: `Analog line sensors do not just say 'black' or 'white' — they produce a voltage that changes smoothly with how much light is reflected. To use that information, the microcontroller must convert the voltage into a number. That is the job of the ADC.

In this topic you will learn the resolution of the Uno's ADC, how to convert readings to volts, how fast it samples, and the mistakes that make readings wrong.`,
    beginner: `Imagine measuring the height of water in a glass with a ruler that only has marks every millimetre. You cannot say the water is 53.27 mm high — you can only say 'between the 53 and 54 marks'. The ruler turns a smooth, continuous height into a whole number.

An ADC (analog-to-digital converter) is that ruler for voltage. On the Arduino Uno the ruler runs from 0 V to 5 V and has 1024 marks, numbered 0 to 1023. When you call analogRead(A0), the ADC measures the voltage on pin A0 and tells you which mark it is closest to. 0 V gives 0, 5 V gives 1023, and 2.5 V gives about 512.

Each mark is about 5 / 1024 ≈ 0.0049 V, or roughly 4.9 millivolts apart. That is the smallest change the Uno can notice.

For a line follower this is great news. Instead of just 'black' or 'white', each analog sensor gives you a number like 85 over white and 870 over black. Values in between tell you the sensor is over the edge of the line, which lets you steer smoothly instead of jerking left and right. The same ADC, with a voltage divider, also lets the robot check its own battery level.`,
    technical: [
      {
        heading: "Resolution and conversion formula",
        body: `The ATmega328P ADC is 10-bit: 2¹⁰ = 1024 levels, results 0–1023. With the default reference (AVcc ≈ 5 V):

V = reading × V_ref / 1024   (datasheet definition; many sketches use 1023, the difference is under 0.1%)
Step size (1 LSB) = 5 / 1024 ≈ 4.88 mV

Example: reading 512 → 512 × 5 / 1024 = 2.50 V. Reading 800 → 3.91 V.

The ESP32's ADC is 12-bit (0–4095) with a 3.3 V-range input, and is noticeably less linear near the ends of its range.`,
      },
      {
        heading: "Speed and multiplexing",
        body: `The Uno has one ADC shared by A0–A5 through a multiplexer. The Arduino core clocks the ADC at 16 MHz / 128 = 125 kHz; a conversion takes 13 ADC clocks, about 104 µs, so analogRead() takes roughly 0.1 ms. Reading 8 sensors therefore costs about 0.8 ms per loop — fine for line following, but it adds up.

After switching channels, the sampling capacitor needs time to settle. If the source impedance is high (the datasheet recommends about 10 kΩ or less), the first reading after a channel switch can be influenced by the previous channel. A common trick is to read twice and discard the first value.`,
      },
      {
        heading: "Reference voltage and ratiometric sensing",
        body: `analogReference(DEFAULT) uses AVcc (≈5 V); INTERNAL uses a 1.1 V band-gap reference on the ATmega328P (good for small voltages); EXTERNAL uses the AREF pin.

If a sensor's output is proportional to its supply (like a potentiometer or a phototransistor with a pull-up resistor on the same 5 V rail), the reading is ratiometric: when the 5 V rail drifts, both the signal and the reference drift together, so the reading stays stable. For absolute measurements such as battery voltage, a drifting 5 V rail directly causes error.`,
      },
      {
        heading: "Noise and filtering",
        body: `Motor noise couples into analog wires. Techniques:
- Keep sensor wires short and away from motor wires; twist motor leads.
- Average several readings: sum 4 samples and divide by 4 (use an int sum — 4 × 1023 = 4092 fits).
- Use an exponential moving average for smooth, low-memory filtering.
- Add a small capacitor (e.g. 100 nF) from the analog pin to GND for very noisy signals.`,
      },
    ],
    workingPrinciple: `The Uno's ADC is a successive-approximation converter. It first samples the input voltage onto a small internal capacitor, then uses a binary search: it compares the held voltage against an internal DAC set to half the reference, keeps or discards that bit, then tests the next bit, ten times in total. After 10 comparisons it has a 10-bit number representing the input as a fraction of the reference voltage.`,
    diagrams: [
      { kind: "formula", latexish: "V = reading × V_ref / 1024 ;  1 LSB = 5 V / 1024 ≈ 4.88 mV", legend: { reading: "analogRead() result 0–1023", V_ref: "reference voltage (≈5 V by default on the Uno)", LSB: "smallest detectable step" } },
      {
        kind: "signal",
        title: "Quantisation: smooth input vs ADC output (3-bit example for clarity)",
        xLabel: "Input voltage (V)",
        yLabel: "ADC code",
        series: [
          { label: "Ideal", points: [[0, 0], [5, 8]] },
          { label: "Quantised", points: [[0, 0], [0.625, 0], [0.625, 1], [1.25, 1], [1.25, 2], [1.875, 2], [1.875, 3], [2.5, 3], [2.5, 4], [3.125, 4], [3.125, 5], [3.75, 5], [3.75, 6], [4.375, 6], [4.375, 7], [5, 7]] },
        ],
      },
      { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["A0", "A1", "A2", "A3", "A4", "A5", "AREF"] },
    ],
    examples: [
      {
        title: "Reading five analog line sensors with averaging",
        body: "Each sensor is read 4 times and averaged to reduce motor noise. Total time ≈ 5 × 4 × 0.1 ms = 2 ms per loop.",
        code: `const int SENSOR_PINS[5] = {A0, A1, A2, A3, A4};
int values[5];

void setup() {
  Serial.begin(115200);
}

void loop() {
  for (int s = 0; s < 5; s++) {
    int sum = 0;                        // max 4 x 1023 = 4092, fits in int
    for (int k = 0; k < 4; k++) {
      sum += analogRead(SENSOR_PINS[s]);
    }
    values[s] = sum / 4;
    Serial.print(values[s]);
    Serial.print(" ");
  }
  Serial.println();
}`,
      },
      {
        title: "Low-battery warning",
        body: "With a 10 kΩ / 10 kΩ divider on A0 from a 2S Li-ion pack, a reading below about 655 means the battery is below roughly 6.4 V (655 × 5 / 1024 × 2 ≈ 6.4 V), a common 'stop and recharge' level for 2S packs (about 3.2 V per cell).",
        code: `const int BAT_PIN = A0;
const int LOW_RAW = 655; // about 6.4 V with a 1:2 divider

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  int raw = analogRead(BAT_PIN);
  digitalWrite(LED_BUILTIN, raw < LOW_RAW ? HIGH : LOW);
  delay(200);
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Using integer maths for the conversion: raw * (5 / 1024).", why: "5 / 1024 is integer division and equals 0, so the result is always 0.", fix: "Use floating-point constants: raw * 5.0 / 1024.0." },
      { mistake: "Computing raw * 5000 in a 16-bit int.", why: "800 × 5000 = 4 000 000 overflows an int on the Uno.", fix: "Use long arithmetic: (long)raw * 5000 / 1024." },
      { mistake: "Applying more than 5 V (or more than 3.3 V on ESP32) to an analog pin.", why: "Exceeding the supply voltage on an input can damage the chip.", fix: "Use a voltage divider sized for the maximum input." },
      { mistake: "Expecting accurate absolute voltages when powered from USB.", why: "USB 5 V varies between computers, so the reference changes.", fix: "Calibrate with a multimeter, or use the internal 1.1 V reference with a suitable divider." },
    ],
    keyTakeaways: [
      "The Uno's ADC is 10-bit: 0–1023 over 0–5 V, about 4.9 mV per step.",
      "V = reading × 5.0 / 1024 — use float constants.",
      "analogRead takes about 0.1 ms; one ADC is shared by all analog pins.",
      "Ratiometric sensors are immune to supply drift; absolute measurements are not.",
      "Average or filter readings to fight motor noise.",
    ],
    relatedComponents: ["Arduino Uno R3", "TCRT5000", "QTR-8A", "Potentiometer"],
    youtubeSearch: "arduino analogRead ADC 10 bit explained voltage conversion",
    quiz: [
      {
        type: "calculate",
        prompt: "An Arduino Uno with the default 5 V reference returns analogRead(A0) = 512. What voltage is on A0 (to two decimal places)?",
        options: ["0.51 V", "5.12 V", "1.25 V", "2.50 V"],
        answerIndex: 3,
        explanation: "V = 512 × 5 / 1024 = 2.50 V — half of the reference. 5.12 V comes from treating each step as 10 mV instead of about 4.9 mV.",
        difficulty: 1,
      },
      {
        type: "code-output",
        prompt: "What does this sketch print on an Arduino Uno?",
        code: `void setup() {
  Serial.begin(9600);
  int raw = 800;
  long mv = (long)raw * 5000 / 1023;
  Serial.println(mv);
}

void loop() {}`,
        options: ["3910", "3906", "3910.07", "2"],
        answerIndex: 0,
        explanation: "The cast makes the multiplication long: 800 × 5000 = 4 000 000, and 4 000 000 / 1023 = 3910.07, truncated by integer division to 3910. 3906 would be the result of dividing by 1024 instead of 1023; 3910.07 is impossible because mv is an integer type.",
        difficulty: 3,
      },
      {
        type: "debug-code",
        prompt: "This battery monitor always prints 0.00, even though A0 has about 3.7 V on it. What is the bug?",
        code: `void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(A0);
  float volts = raw * (5 / 1024);
  Serial.println(volts);
  delay(500);
}`,
        options: ["analogRead must be called in setup()", "A0 must be written as 0", "float cannot be printed with Serial.println", "5 / 1024 is integer division and equals 0; it should be 5.0 / 1024.0"],
        answerIndex: 3,
        explanation: "Both 5 and 1024 are integers, so 5 / 1024 is evaluated as integer division and equals 0; anything times 0 is 0. Writing 5.0 / 1024.0 forces floating-point division. Serial.println prints floats fine (two decimals by default).",
        difficulty: 2,
      },
      {
        type: "identify-pin",
        prompt: "Which Arduino Uno pins can be used with analogRead() to measure a voltage?",
        options: ["A0–A5", "D3, D5, D6, D9, D10, D11", "Any digital pin D0–D13", "Only AREF"],
        answerIndex: 0,
        explanation: "The Uno's ADC multiplexer is connected only to A0–A5. D3, D5, D6, D9, D10 and D11 are the PWM output pins — a common confusion because analogWrite and analogRead sound related but use different pins.",
        difficulty: 1,
        diagram: { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["A0", "A1", "A2", "A3", "A4", "A5"] },
      },
    ],
  }),

  defineTopic("line", 14, {
    slug: "pwm",
    title: "PWM",
    minutes: 12,
    summary: "Pulse-width modulation switches a pin fully on and off very quickly; the fraction of time it is on (duty cycle) sets the average power delivered to a motor.",
    introduction: `An Arduino pin can only be fully on (5 V) or fully off (0 V), yet you need to run motors at many different speeds. PWM is the trick that solves this, and it is how every club robot controls speed through ENA/ENB on an L298N, PWMA/PWMB on a TB6612FNG or the IN pins of a DRV8833.

This topic explains duty cycle, frequency, analogWrite, and the practical effects you will notice on real motors.`,
    beginner: `Imagine you want a room to be half as bright, but your light switch only has ON and OFF. If you flick the switch on and off extremely quickly — on for half the time, off for half the time — your eyes cannot see the flicker, and the room just looks half as bright. Flick it so it is on only a quarter of the time and the room looks dimmer still.

That is PWM, pulse-width modulation. The Arduino switches a pin between 5 V and 0 V hundreds of times per second. The percentage of time the pin is ON in each cycle is called the duty cycle. 0% means always off, 100% means always on, 50% means on half the time.

A motor reacts to the average power it receives, a bit like your eyes averaging the light. Because the motor and the robot have weight and inertia, they cannot speed up and slow down hundreds of times a second, so they settle at a speed that matches the average. Higher duty cycle means a faster motor.

In Arduino code you use analogWrite(pin, value), where value runs from 0 (0% duty) to 255 (100% duty). So analogWrite(5, 128) gives about 50% duty, which is roughly half the battery voltage on average at the motor.`,
    technical: [
      {
        heading: "Duty cycle and average voltage",
        body: `Duty cycle D = t_on / T, where T is the period (T = 1 / f).
Average voltage V_avg = D × V_supply.

analogWrite(pin, value): D = value / 255.
- analogWrite(ENA, 64) → D ≈ 25%; with an 8 V supply V_avg ≈ 2.0 V.
- analogWrite(ENA, 191) → D ≈ 75%; V_avg ≈ 6.0 V.

Real drivers lose voltage: an L298N typically drops about 2 V at 1 A, so the motor sees less than this ideal value. MOSFET drivers (TB6612FNG, DRV8833) lose much less.`,
      },
      {
        heading: "Frequency on the Uno",
        body: `analogWrite works only on pins 3, 5, 6, 9, 10 and 11. Default frequencies: about 980 Hz on pins 5 and 6 (Timer0) and about 490 Hz on pins 3, 9, 10, 11 (Timer1/Timer2). At 490 Hz the period is about 2.04 ms; at 980 Hz about 1.02 ms.

These frequencies are audible — motors often whine. Higher PWM frequencies are possible by changing timer registers, but changing Timer0 also breaks millis() and delay(), so if you experiment, use Timer1 or Timer2 pins. analogWrite(pin, 0) and analogWrite(pin, 255) are special-cased to plain LOW and HIGH.`,
      },
      {
        heading: "How the motor responds",
        body: `A DC motor's winding inductance smooths current between pulses, and the rotor's inertia smooths speed. Speed is roughly proportional to average voltage minus losses, but not exactly linear:

- Deadband: at low duty cycles the torque cannot overcome static friction and the gearbox, so the motor does not start. Many small gear motors need noticeably more than 0% duty before they move — measure yours.
- Load: under load (climbing, pushing) speed drops for the same duty.
- Battery: the same duty gives less speed as the battery voltage falls. Battery-compensated PWM scales duty by V_nominal / V_measured.`,
      },
      {
        heading: "Mapping speeds in code",
        body: `map(value, fromLow, fromHigh, toLow, toHigh) converts ranges with integer maths (it truncates, it does not round): map(75, 0, 100, 0, 255) = 75 × 255 / 100 = 191.

constrain(x, 0, 255) keeps a computed speed in the valid range — essential with PID, where base speed ± correction can go negative or above 255.`,
      },
    ],
    workingPrinciple: `A hardware timer counts continuously from 0 to 255 and wraps. A compare register holds the duty value. While the counter is below the compare value the pin is HIGH; once it passes, the pin goes LOW until the counter wraps. This produces a fixed-frequency square wave whose high time is proportional to the compare value, entirely in hardware. The motor driver switches the battery voltage with the same pattern, and the motor's inductance and inertia average it into a steady speed.`,
    diagrams: [
      {
        kind: "signal",
        title: "PWM at 25% and 75% duty (one period ≈ 2 ms at 490 Hz)",
        xLabel: "Time (ms)",
        yLabel: "Pin voltage (V)",
        series: [
          { label: "25% (analogWrite 64)", points: [[0, 5], [0.5, 5], [0.5, 0], [2, 0], [2, 5], [2.5, 5], [2.5, 0], [4, 0]] },
          { label: "75% (analogWrite 191)", points: [[0, 5], [1.5, 5], [1.5, 0], [2, 0], [2, 5], [3.5, 5], [3.5, 0], [4, 0]] },
        ],
      },
      { kind: "formula", latexish: "D = t_on / T ;  V_avg = D × V_supply ;  D = value / 255", legend: { D: "duty cycle (0–1)", t_on: "time HIGH per period", T: "period = 1 / frequency", value: "analogWrite argument 0–255" } },
      { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D3", "D5", "D6", "D9", "D10", "D11"] },
    ],
    examples: [
      {
        title: "Soft-start ramp",
        body: "Ramping speed up avoids wheel spin and the current surge that can reset the Arduino. Note the loop variable is an int, not a byte.",
        code: `const int ENA = 5;
const int IN1 = 7;
const int IN2 = 8;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  for (int duty = 0; duty <= 200; duty += 10) {
    analogWrite(ENA, duty);
    delay(30);
  }
}

void loop() {}`,
      },
      {
        title: "Finding your motor's deadband",
        body: "Step the duty cycle up slowly and note when the wheel first turns. Use that value as the minimum non-zero speed in your control code.",
        code: `const int ENA = 5;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(7, OUTPUT);
  pinMode(8, OUTPUT);
  digitalWrite(7, HIGH);
  digitalWrite(8, LOW);
  Serial.begin(9600);
}

void loop() {
  for (int duty = 0; duty <= 255; duty += 5) {
    analogWrite(ENA, duty);
    Serial.println(duty);   // watch the wheel and note when it starts
    delay(400);
  }
  analogWrite(ENA, 0);
  delay(2000);
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Using analogWrite on a non-PWM pin.", why: "On pins without PWM hardware, analogWrite only outputs fully on or fully off.", fix: "Use pins 3, 5, 6, 9, 10 or 11 on the Uno." },
      { mistake: "Passing values above 255 or below 0 to analogWrite.", why: "The value is stored in an 8-bit register, so out-of-range values wrap and give unexpected speeds.", fix: "Use constrain(speed, 0, 255) before analogWrite." },
      { mistake: "Using a byte loop counter with 'duty <= 255'.", why: "A byte can never exceed 255, so the condition is always true and the loop never ends.", fix: "Use an int counter." },
      { mistake: "Changing Timer0's frequency to silence the whine.", why: "Timer0 also drives millis() and delay(), so timing breaks.", fix: "Leave Timer0 alone, or use Timer1/Timer2 pins for custom frequencies." },
    ],
    keyTakeaways: [
      "Duty cycle = on-time / period; average voltage = duty × supply.",
      "analogWrite(pin, 0–255) sets duty on PWM pins 3, 5, 6, 9, 10, 11.",
      "Uno PWM is about 490 Hz (pins 3, 9, 10, 11) and 980 Hz (pins 5, 6).",
      "Motors have a deadband and slow down under load or low battery.",
      "Always constrain computed speeds to 0–255.",
    ],
    relatedComponents: ["Arduino Uno R3", "L298N", "TB6612FNG", "DRV8833", "TT Yellow Gear Motor"],
    youtubeSearch: "PWM explained arduino analogWrite motor speed control duty cycle",
    quiz: [
      {
        type: "identify-pin",
        prompt: "Which pair of Arduino Uno pins produces PWM at about 980 Hz by default (the rest run at about 490 Hz)?",
        options: ["5 and 6", "3 and 11", "9 and 10", "12 and 13"],
        answerIndex: 0,
        explanation: "Pins 5 and 6 use Timer0, which runs PWM at about 980 Hz. Pins 3, 9, 10 and 11 run at about 490 Hz. Pins 12 and 13 have no PWM at all.",
        difficulty: 2,
        diagram: { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D3", "D5", "D6", "D9", "D10", "D11"] },
      },
      {
        type: "code-output",
        prompt: "What does this sketch print?",
        code: `void setup() {
  Serial.begin(9600);
  int speedPercent = 75;
  int pwm = map(speedPercent, 0, 100, 0, 255);
  Serial.println(pwm);
}

void loop() {}`,
        options: ["75", "192", "191", "255"],
        answerIndex: 2,
        explanation: "map computes 75 × 255 / 100 = 19125 / 100 = 191.25, and integer division truncates to 191. 192 would require rounding, which map() does not do.",
        difficulty: 2,
      },
      {
        type: "debug-code",
        prompt: "This soft-start ramp is meant to run once, but the motor keeps accelerating, jumping back to stop, and accelerating again forever. What is the bug?",
        code: `const int ENA = 5;

void setup() {
  pinMode(ENA, OUTPUT);
  for (byte duty = 0; duty <= 255; duty++) {
    analogWrite(ENA, duty);
    delay(10);
  }
}

void loop() {}`,
        options: ["A byte can never exceed 255, so duty <= 255 is always true and the loop never ends", "analogWrite cannot be called inside setup()", "Pin 5 is not a PWM pin", "delay(10) is too short for PWM"],
        answerIndex: 0,
        explanation: "When duty is 255, duty++ wraps it to 0, which is still <= 255, so the loop repeats forever. Declaring duty as int lets it reach 256 and exit. Pin 5 is a PWM pin, and analogWrite works fine in setup().",
        difficulty: 3,
      },
      {
        type: "calculate",
        prompt: "A motor driver is supplied with 8 V. The code calls analogWrite(ENA, 64). Ignoring driver losses, what is the approximate average voltage across the motor?",
        options: ["0.25 V", "6.0 V", "1.25 V", "2.0 V"],
        answerIndex: 3,
        explanation: "Duty = 64 / 255 ≈ 0.25, so V_avg ≈ 0.25 × 8 = 2.0 V. 0.25 V is the duty cycle written as if it were a voltage. (On a real L298N the motor would see even less because of its internal voltage drop.)",
        difficulty: 2,
      },
      {
        type: "predict-movement",
        prompt: "Both motors are set to run forward. The left motor gets analogWrite(ENA, 200) and the right motor gets analogWrite(ENB, 100). The motors are identical. What does the robot do?",
        options: ["Drives straight at medium speed", "Spins on the spot to the left", "Moves forward while curving to the right", "Moves forward while curving to the left"],
        answerIndex: 2,
        explanation: "The left wheel turns faster than the right, so the robot arcs toward the slower side — to the right. It does not spin in place, because both wheels still turn forward.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("line", 15, {
    slug: "digital-analog-signals",
    title: "Digital and Analog Signals",
    minutes: 10,
    summary: "Analog signals vary continuously, digital signals have only two valid levels; robots constantly convert between them with ADCs, comparators and PWM.",
    introduction: `Your line sensors produce analog voltages, your Arduino thinks in digital numbers, and your motors are driven by digital PWM that behaves like an analog voltage. Understanding the difference — and where conversions happen — helps you choose between digital sensor modules and analog arrays, and explains why some robots follow lines smoothly while others wobble.`,
    beginner: `Think of a dimmer knob versus a light switch. A dimmer can be turned to any position — a little bit bright, quite bright, very bright. That is an analog signal: it can take any value within a range. A light switch has only two positions, on and off. That is a digital signal.

A TCRT5000 sensor's phototransistor naturally produces an analog voltage: it changes smoothly as the sensor slides from white floor onto the black line. Many cheap sensor modules add a small chip called a comparator, which turns that smooth voltage into a simple on/off answer: 'line' or 'no line'. You adjust the switching point with the little screw potentiometer on the module.

Digital is simple and robust: a bit of electrical noise will not turn a 5 V 'ON' into an 'OFF'. But you lose information. With a digital output you cannot tell whether the sensor is exactly over the line or only just touching its edge. With an analog output read through the Arduino's ADC, you can — and that extra detail is what makes smooth, fast PID line following possible.

Going the other way, the Arduino cannot output a true in-between voltage, so it fakes one with PWM: a very fast on-off digital signal whose average acts like an analog level.`,
    technical: [
      {
        heading: "Definitions",
        body: `- Analog: continuous in value (and time). Example: phototransistor voltage 0.3–4.5 V depending on reflectance.
- Digital: discrete levels with defined thresholds. For 5 V AVR inputs: LOW < 1.5 V, HIGH > 3.0 V.
- Sampled/quantised: an analog signal measured at discrete times and rounded to discrete levels — what analogRead produces (10-bit, 0–1023).

Noise margin: a digital output HIGH near 5 V can suffer more than 1.5 V of noise before falling below the 3.0 V HIGH threshold. Analog values have no such margin: every millivolt of noise is a measurement error.`,
      },
      {
        heading: "Comparator modules (analog → digital)",
        body: `Most 'TCRT5000 module' boards use an LM393 comparator. The phototransistor voltage goes to one input; a potentiometer sets a reference voltage on the other. The output (DO) switches when the sensor voltage crosses the reference. Many modules also break out the raw analog voltage (AO).

Trade-offs:
- DO: zero CPU work, one digital pin, but the threshold is set by hand per sensor and only gives line / no line.
- AO + ADC: needs analog pins and calibration code, but gives continuous position information and per-sensor software thresholds.

Hysteresis (different on and off thresholds) prevents chattering when the signal sits right at the threshold. You can add it in software: switch to 'black' above 600 but back to 'white' only below 400.`,
      },
      {
        heading: "Sampling rate and aliasing",
        body: `To capture a changing signal you must sample fast enough. The Nyquist criterion says sample at more than twice the highest frequency of interest; in practice much faster. A line edge passing a sensor at 1 m/s across a 2 cm line lasts only 20 ms. If your loop takes 10 ms, you get only about two samples on the line — a sharp corner may be missed entirely. Fast loops (≤ 2 ms) are an important part of high-speed line following.`,
      },
      {
        heading: "Digital → analog: PWM",
        body: `The Uno has no true DAC. PWM plus a filter (the motor's inductance, or an RC filter for signals) produces an average voltage V_avg = D × V_supply. For motors this is ideal; for driving another circuit's analog input, add an RC low-pass filter with a cut-off well below the PWM frequency.`,
      },
    ],
    workingPrinciple: `Physical quantities (light, distance, speed) are inherently analog. Sensors convert them to analog voltages. The robot then digitises them, either with a comparator (one bit: above or below a threshold) or with an ADC (many bits: a number proportional to the voltage). The microcontroller processes digital numbers and outputs digital signals; where an analog effect is needed, such as motor speed, it uses PWM whose average value approximates an analog level.`,
    diagrams: [
      {
        kind: "signal",
        title: "Analog sensor voltage vs comparator digital output while crossing a line",
        xLabel: "Time (ms)",
        yLabel: "Voltage (V)",
        series: [
          { label: "Analog (AO)", points: [[0, 0.4], [5, 0.5], [10, 1.8], [15, 4.2], [20, 4.4], [25, 4.3], [30, 1.9], [35, 0.5], [40, 0.4]] },
          { label: "Digital (DO, threshold 2.5 V)", points: [[0, 0], [12, 0], [12, 5], [28, 5], [28, 0], [40, 0]] },
        ],
      },
      { kind: "flow", steps: ["Reflected IR (physical, analog)", "Phototransistor voltage (analog)", "Comparator → line / no line (1 bit) OR ADC → 0–1023 (10 bits)", "Arduino decision (digital)", "PWM output (digital, averages to analog)", "Motor speed (physical, analog)"] },
    ],
    examples: [
      {
        title: "Software threshold with hysteresis",
        body: "Analog reading with two thresholds stops the 'black/white' decision flickering when the sensor is right on the line edge.",
        code: `const int SENSOR = A0;
bool onBlack = false;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int v = analogRead(SENSOR);
  if (!onBlack && v > 600) onBlack = true;   // must rise above 600
  if (onBlack && v < 400) onBlack = false;   // must fall below 400
  Serial.println(onBlack ? "BLACK" : "WHITE");
  delay(5);
}`,
      },
      {
        title: "Packing digital sensor states into a pattern",
        body: "With five digital sensors, packing the readings into one number makes it easy to use a switch statement for steering decisions (e.g. 0b00100 = centred).",
        code: `const int PINS[5] = {2, 3, 4, 5, 6};

void setup() {
  for (int i = 0; i < 5; i++) pinMode(PINS[i], INPUT);
  Serial.begin(9600);
}

void loop() {
  byte pattern = 0;
  for (int i = 0; i < 5; i++) {
    pattern = pattern << 1;
    if (digitalRead(PINS[i]) == HIGH) pattern = pattern | 1;
  }
  Serial.println(pattern, BIN);
  delay(50);
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Reading an analog sensor output with digitalRead.", why: "digitalRead only reports HIGH/LOW (and is undefined between 1.5 V and 3.0 V), so all the in-between information is lost.", fix: "Connect AO to an analog pin and use analogRead." },
      { mistake: "Setting each module's potentiometer once and never again.", why: "Ambient light, sensor height and track surface change the ideal threshold.", fix: "Re-tune on the actual track, or switch to analog readings with software calibration." },
      { mistake: "Using a single threshold on a noisy analog signal.", why: "The decision flickers when the value hovers near the threshold.", fix: "Add hysteresis (two thresholds) or filtering." },
      { mistake: "Ignoring loop rate when following fast lines.", why: "Slow sampling misses narrow features such as thin lines and sharp corners.", fix: "Keep loop() fast and avoid long delays and heavy Serial printing." },
    ],
    keyTakeaways: [
      "Analog signals are continuous; digital signals have two valid levels.",
      "Comparator modules give one bit per sensor; ADC readings give 1024 levels.",
      "Analog sensing enables smooth position estimates and PID control.",
      "Hysteresis prevents threshold chatter.",
      "PWM is a digital signal whose average behaves like an analog voltage.",
    ],
    relatedComponents: ["TCRT5000", "QTR-8A", "Arduino Uno R3"],
    youtubeSearch: "analog vs digital signals arduino IR sensor module comparator",
    quiz: [
      {
        type: "code-output",
        prompt: "Five analog sensor readings are converted into a bit pattern (threshold 500). What number does the sketch print?",
        code: `void setup() {
  Serial.begin(9600);
  int readings[5] = {120, 640, 880, 300, 510};
  byte pattern = 0;
  for (int i = 0; i < 5; i++) {
    pattern = pattern << 1;
    if (readings[i] > 500) pattern = pattern | 1;
  }
  Serial.println(pattern);
}

void loop() {}`,
        options: ["13", "22", "3", "11"],
        answerIndex: 0,
        explanation: "The bits, from first to last reading, are 0 1 1 0 1 (510 > 500 counts as 1). Shifting left each time puts the first reading in the highest bit: 0b01101 = 8 + 4 + 1 = 13. 22 (0b10110) is what you get if you read the bits in reverse order; 3 is just the count of readings above 500.",
        difficulty: 3,
      },
      {
        type: "debug-code",
        prompt: "A student wants a 0–1023 value to tune the line threshold, but the Serial Monitor only ever shows 0 or 1. The sensor's AO pin is wired to A0. What is wrong?",
        code: `void setup() {
  Serial.begin(9600);
}

void loop() {
  int value = digitalRead(A0);
  Serial.println(value);
  delay(100);
}`,
        options: ["A0 cannot be used as an input", "Serial.begin must use 115200 baud", "The delay is too short for the ADC", "digitalRead only returns HIGH/LOW; analogRead(A0) is needed for 0–1023"],
        answerIndex: 3,
        explanation: "digitalRead converts the pin voltage to a single bit, so only 0 or 1 is possible. analogRead(A0) uses the ADC and returns 0–1023. The baud rate only affects communication speed, not the value range.",
        difficulty: 1,
      },
      {
        type: "identify-driver",
        prompt: "A motor driver board has control pins labelled AIN1, AIN2, PWMA, BIN1, BIN2, PWMB and STBY. Which driver is it?",
        options: ["L298N", "DRV8833", "TB6612FNG", "L293D"],
        answerIndex: 2,
        explanation: "AIN1/AIN2 (direction), PWMA (speed) and the STBY (standby) pin are the signature of the TB6612FNG; STBY must be pulled HIGH for the outputs to work. The DRV8833 uses AIN1/AIN2/BIN1/BIN2 with nSLEEP but has no separate PWM pins; the L298N uses ENA/ENB and IN1–IN4.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "Which of these is a truly analog signal?",
        options: ["The phototransistor voltage of a TCRT5000 that changes smoothly as it moves across the line", "The LM393 comparator output (DO) of a sensor module", "The PWM signal on pin 9", "The TX line of the Serial port"],
        answerIndex: 0,
        explanation: "The phototransistor voltage can take any value in its range, so it is analog. PWM is tempting because it produces an analog-like average, but the signal itself is digital — it only ever switches between 0 V and 5 V.",
        difficulty: 1,
      },
    ],
  }),
];
