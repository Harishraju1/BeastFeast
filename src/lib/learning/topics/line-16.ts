import { defineTopic } from "../define";
import type { Topic } from "../types";

export const LINE_16: Topic[] = [
  defineTopic("line", 16, {
    slug: "ir-sensors",
    title: "IR Sensors",
    minutes: 12,
    summary: "How reflective infrared sensors tell a black line from a white floor, and how to wire and read them.",
    introduction:
      "Every line follower is only as good as its eyes. Almost all club robots use reflective infrared (IR) sensors: a tiny IR LED shines down at the track, and a light detector next to it measures how much of that light bounces back. In this topic you will learn why black and white surfaces look so different in infrared, what the electronics inside the sensor do, and how the signal reaches your Arduino.",
    beginner:
      "Imagine standing in a dark room with a torch pointed at the floor. If the floor is a white tile, the room lights up because the light bounces back at you. If the floor is a black carpet, the light seems to disappear, because the carpet soaks it up. A reflective IR sensor does exactly this, just with light your eyes cannot see.\n\nThe sensor has two parts sitting side by side. The first is an IR LED, which is the torch. The second is a phototransistor, which is like an eye that lets more electric current through when more light hits it. Over a white surface lots of IR comes back, so the eye 'opens' and current flows. Over black tape almost nothing comes back, so the eye stays 'closed'.\n\nWe turn that change in current into a change in voltage with a single resistor, and the Arduino reads the voltage. A high reading means one colour and a low reading means the other. Because the sensor uses invisible infrared and sits very close to the floor, it is cheap, fast and works well, as long as you keep it at the right height and shield it from strong sunlight, which also contains infrared.",
    technical: [
      {
        heading: "Emitter and detector",
        body:
          "The emitter is an IR LED, typically around 940–950 nm wavelength. Like any LED it needs a series resistor: R = (Vsupply − Vf) / I. With a 5 V supply, a forward voltage of roughly 1.2 V and a target of about 20 mA, R = 3.8 V / 0.02 A = 190 Ω, so the nearest common values of 200 Ω or 220 Ω are used (220 Ω gives about 17 mA).\n\nThe detector is a phototransistor: its base is the light-sensitive region, so collector current rises with the amount of IR that reaches it. It behaves like a light-controlled current source.",
      },
      {
        heading: "Turning light into a voltage",
        body:
          "The usual circuit puts a pull-up resistor (often 10 kΩ) from 5 V to the collector and connects the emitter to GND. The output is taken at the collector.\n\n- Lots of reflected IR (white): large collector current, large drop across the pull-up, output near 0 V.\n- Little reflected IR (black): tiny current, almost no drop, output near 5 V.\n\nSo with this wiring black reads HIGH and white reads LOW. Increasing the pull-up value makes the sensor more sensitive (a smaller current produces a bigger voltage swing) but also slower and more affected by ambient light.",
      },
      {
        heading: "Analog vs digital modules",
        body:
          "Many hobby modules add an LM393 comparator and a potentiometer. The comparator compares the sensor voltage with the pot voltage and gives a clean digital output (DO). The raw voltage is often also available on an analog pin (AO).\n\n- DO: easy to read with digitalRead(), but you lose information about 'how much' black is under the sensor.\n- AO: read with analogRead() (0–1023 on the Uno's 10-bit ADC), which allows calibration and smooth position estimates for PID.\n\nCompetitive robots almost always use the analog signal.",
      },
      {
        heading: "Height, angle and ambient light",
        body:
          "Reflective sensors are short-range devices. If the sensor is too high, the reflected spot spreads out and the difference between black and white shrinks. If it is too low or touching, the emitter light cannot reflect into the detector. Keep all sensors at the same small height (a few millimetres) and fixed rigidly.\n\nSunlight and some lamps contain a lot of IR, which can raise readings on both colours. Shrouding the sensors, keeping them close to the floor and recalibrating at the venue all reduce this effect.",
      },
    ],
    workingPrinciple:
      "An IR LED illuminates the surface. White surfaces reflect most of the IR back into the phototransistor, which then conducts strongly and pulls its collector (the output) towards 0 V through the pull-up resistor. Black surfaces absorb most of the IR, the phototransistor barely conducts, and the pull-up resistor holds the output near 5 V. The microcontroller reads this voltage with analogRead() or, after a comparator, with digitalRead().",
    diagrams: [
      {
        kind: "circuit",
        nodes: [
          { id: "v5", label: "5 V", x: 0, y: 0 },
          { id: "rled", label: "220 Ω", x: 0, y: 1 },
          { id: "led", label: "IR LED", x: 0, y: 2 },
          { id: "rpu", label: "10 kΩ pull-up", x: 2, y: 1 },
          { id: "pt", label: "Phototransistor (C)", x: 2, y: 2 },
          { id: "a0", label: "Arduino A0", x: 3, y: 2 },
          { id: "gnd", label: "GND", x: 1, y: 3 },
        ],
        edges: [
          { from: "v5", to: "rled" },
          { from: "rled", to: "led", label: "anode" },
          { from: "led", to: "gnd", label: "cathode" },
          { from: "v5", to: "rpu" },
          { from: "rpu", to: "pt", label: "collector" },
          { from: "pt", to: "a0", label: "signal" },
          { from: "pt", to: "gnd", label: "emitter" },
        ],
      },
      {
        kind: "signal",
        title: "Sensor output while sliding across a black line",
        xLabel: "Position (mm)",
        yLabel: "Output voltage (V)",
        series: [
          { label: "Pull-up wiring", points: [[0, 0.4], [5, 0.4], [8, 2.5], [10, 4.5], [25, 4.6], [27, 2.5], [30, 0.4], [40, 0.4]] },
        ],
      },
    ],
    examples: [
      {
        title: "Read one analog IR sensor",
        body: "Wire the sensor as in the circuit diagram with the signal on A0. Open the Serial Monitor at 9600 baud and slide the sensor from white paper onto black tape. With pull-up wiring the number should jump from a low value to a high value.",
        code: `const int SENSOR_PIN = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(SENSOR_PIN);   // 0..1023
  Serial.println(raw);
  delay(100);
}`,
      },
      {
        title: "Digital module with an indicator LED",
        body: "For a comparator module, connect VCC to 5 V, GND to GND and DO to pin 2. Turn the potentiometer until the module's LED switches cleanly when the sensor crosses the tape edge. Then print the state. Many modules pull DO LOW over a reflective (white) surface, but check yours with this sketch rather than assuming.",
        code: `const int DO_PIN = 2;

void setup() {
  pinMode(DO_PIN, INPUT);
  Serial.begin(9600);
}

void loop() {
  int state = digitalRead(DO_PIN);
  if (state == HIGH) {
    Serial.println("HIGH");
  } else {
    Serial.println("LOW");
  }
  delay(100);
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Driving the IR LED without a series resistor.",
        why: "An LED has almost no internal resistance once it conducts, so the current is limited only by the supply and wiring. It overheats and fails, and can overload the 5 V rail.",
        fix: "Always use a series resistor sized with R = (Vsupply − Vf) / I, e.g. 220 Ω on 5 V.",
      },
      {
        mistake: "Mounting sensors at different heights or on a flexible strip.",
        why: "Reflected intensity depends strongly on distance, so each sensor sees a different 'white' and 'black' level and the robot steers wrongly.",
        fix: "Mount every sensor on one rigid board at the same small height, and calibrate each sensor individually.",
      },
      {
        mistake: "Assuming black always reads HIGH.",
        why: "Whether black is HIGH or LOW depends on the circuit (pull-up vs pull-down, comparator polarity). Different modules behave differently.",
        fix: "Test with the Serial Monitor over black and white before writing your steering logic.",
      },
      {
        mistake: "Testing near a sunny window and calibrating in a dark room.",
        why: "Ambient IR adds to the reflected light and shifts all readings, so thresholds set in one place fail in another.",
        fix: "Shroud the sensors and recalibrate on the actual track lighting.",
      },
    ],
    keyTakeaways: [
      "A reflective IR sensor is an IR LED plus a phototransistor looking at the same spot.",
      "White reflects IR, black absorbs it; with a pull-up on the collector, white reads low and black reads high.",
      "The IR LED needs a series resistor; 200–220 Ω is typical on 5 V.",
      "Analog outputs give more information than comparator outputs and enable smooth PID control.",
      "Height, rigidity and ambient IR strongly affect readings, so mount carefully and calibrate on site.",
    ],
    relatedComponents: ["TCRT5000", "QTR-8A", "Arduino Uno R3"],
    youtubeSearch: "how reflective IR sensor phototransistor works line follower",
    quiz: [
      {
        type: "mcq",
        prompt: "Why does a black line give a different IR sensor reading from a white floor?",
        options: [
          "Black surfaces emit their own infrared light",
          "Black surfaces absorb most of the IR, so less light reaches the phototransistor",
          "White surfaces block the IR LED from turning on",
          "Black tape is electrically conductive",
        ],
        answerIndex: 1,
        explanation: "The sensor measures reflected IR. Black absorbs most of it, so the phototransistor receives little light; white reflects a lot. Black tape does not emit IR or conduct electricity in a way the sensor can detect — the sensor never touches the tape.",
        difficulty: 1,
      },
      {
        type: "identify-component",
        prompt: "Which component combines an IR LED and a phototransistor in one housing, specifically for short-range reflective sensing?",
        options: ["HC-SR04", "LM393", "TCRT5000", "1N4007"],
        answerIndex: 2,
        explanation: "The TCRT5000 is a reflective optical sensor: emitter and detector side by side in a blocking housing. The HC-SR04 is ultrasonic, the LM393 is only a comparator chip often placed on the same module, and the 1N4007 is a rectifier diode.",
        difficulty: 1,
      },
      {
        type: "predict-circuit",
        prompt: "A phototransistor's collector goes to A0 and to 5 V through a 10 kΩ pull-up; its emitter goes to GND. The sensor is moved from black tape onto white paper. What happens to the voltage on A0?",
        options: [
          "It rises towards 5 V",
          "It stays the same; only current changes",
          "It drops towards 0 V",
          "It becomes negative",
        ],
        answerIndex: 2,
        explanation: "White reflects more IR, the phototransistor conducts more, and the larger current through the 10 kΩ pull-up drops more voltage across it, pulling A0 towards 0 V. The tempting answer 'rises' is what happens with the opposite (pull-down, emitter-output) wiring. The output can never go below GND in this circuit.",
        difficulty: 2,
      },
      {
        type: "calculate",
        prompt: "An IR LED with a forward voltage of about 1.2 V is powered from 5 V through a 220 Ω resistor. Approximately what current flows?",
        diagram: { kind: "formula", latexish: "I = (V_s - V_f) / R", legend: { I: "LED current (A)", V_s: "supply voltage (V)", V_f: "LED forward voltage (V)", R: "series resistance (Ω)" } },
        options: ["About 5.5 mA", "About 17 mA", "About 23 mA", "About 1.2 A"],
        answerIndex: 1,
        explanation: "I = (5 − 1.2) / 220 = 3.8 / 220 ≈ 0.0173 A ≈ 17 mA. 23 mA comes from forgetting the LED's forward voltage (5 / 220), which overestimates the current.",
        difficulty: 2,
      },
    ],
  }),

  defineTopic("line", 17, {
    slug: "tcrt5000",
    title: "TCRT5000",
    minutes: 12,
    summary: "Pinout, wiring, operating distance and reading techniques for the TCRT5000 reflective sensor and its modules.",
    introduction:
      "The TCRT5000 is the most common reflective sensor in school robotics. You will find it bare (four legs) or on small breakout modules with a comparator, potentiometer and indicator LED. This topic covers its pins, how to wire both versions, what height to mount it at, and how to turn its reading into a voltage you can reason about.",
    beginner:
      "Think of the TCRT5000 as a tiny pair of glasses glued together: one lens is a lamp and the other lens is an eye. Both look down at the same spot on the floor through a black plastic housing that stops the lamp shining straight into the eye. The only way light can reach the eye is by bouncing off the floor first.\n\nThe bare part has four legs. Two belong to the lamp (an infrared LED) and two belong to the eye (a phototransistor). On a module, the board maker has already added the resistors and a little chip called a comparator, so you just see VCC, GND and one or two signal pins. The module's small blue potentiometer is like a sensitivity knob: you turn it until the onboard LED switches exactly when the sensor crosses from white to black.\n\nThe sensor likes to be very close to the floor, only a few millimetres away. Too high and it can no longer tell the difference between black and white, just like a torch that is too far from a wall gives a dim, blurry spot. Get the height right and the TCRT5000 is one of the cheapest, most reliable sensors you can buy.",
    technical: [
      {
        heading: "Pinout of the bare sensor",
        body:
          "The bare TCRT5000 has four pins, usually marked on the body or identified by the two coloured windows (the emitter window is often blue-tinted, the detector black):\n\n- A (anode) and K (cathode) of the IR emitter.\n- C (collector) and E (emitter) of the phototransistor.\n\nTypical wiring: A to 5 V through 220 Ω, K to GND; C to 5 V through 10 kΩ and to an analog pin; E to GND. Swapping anode and cathode simply leaves the LED off (it is reverse biased), which is a very common reason a sensor 'never changes'.",
      },
      {
        heading: "Module pins and the comparator",
        body:
          "Typical modules expose VCC, GND, DO and sometimes AO.\n\n- AO is the raw phototransistor voltage.\n- DO is the output of an LM393 comparator that compares AO with the potentiometer voltage.\n\nThe LM393 has an open-collector output, so the module includes a pull-up resistor on DO. The comparator turns a slowly changing voltage into a sharp HIGH/LOW. On many modules DO is LOW and the indicator LED is lit when enough IR is reflected (white surface), but polarity varies between manufacturers, so always test.",
      },
      {
        heading: "Distance and the reading in numbers",
        body:
          "The Vishay datasheet gives a peak operating distance of about 2.5 mm, with useful response over roughly a fraction of a millimetre up to around 15 mm. In practice robots mount the sensor a few millimetres above the floor.\n\nThe Arduino Uno ADC converts 0–5 V into 0–1023: value ≈ V × 1023 / 5. For example, 3.2 V gives about 655, and 0.5 V gives about 102. A good mount typically gives a spread of several hundred counts between black and white; a spread of under about 100 counts suggests the sensor is too high, tilted, or affected by ambient light.",
      },
    ],
    workingPrinciple:
      "The emitter LED shines IR at the surface; the black housing blocks direct light, so only reflected IR reaches the phototransistor. More reflection gives more collector current, which (with a collector pull-up) lowers the output voltage. On a module, an LM393 comparator compares this voltage with a potentiometer-set threshold to create a digital output.",
    diagrams: [
      { kind: "pinout", componentId: "tcrt5000", highlight: ["VCC", "GND", "D0", "A0"] },
      {
        kind: "circuit",
        nodes: [
          { id: "mod", label: "TCRT5000 module", x: 0, y: 1 },
          { id: "vcc", label: "Uno 5V", x: 2, y: 0 },
          { id: "gnd", label: "Uno GND", x: 2, y: 1 },
          { id: "a0", label: "Uno A0", x: 2, y: 2 },
          { id: "d2", label: "Uno D2", x: 2, y: 3 },
        ],
        edges: [
          { from: "mod", to: "vcc", label: "VCC", color: "red" },
          { from: "mod", to: "gnd", label: "GND", color: "black" },
          { from: "mod", to: "a0", label: "AO", color: "yellow" },
          { from: "mod", to: "d2", label: "DO", color: "green" },
        ],
      },
    ],
    examples: [
      {
        title: "Convert a reading to volts correctly",
        body: "Use floating-point maths so the result is not truncated. Note the 5.0 and 1023.0: if both operands were integers the division would throw away the fraction.",
        code: `const int AO_PIN = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(AO_PIN);
  float volts = raw * 5.0 / 1023.0;
  Serial.print(raw);
  Serial.print("  ");
  Serial.println(volts);
  delay(200);
}`,
      },
      {
        title: "Find the best mounting height",
        body: "Hold the sensor over white and then black at 2, 5, 8 and 12 mm (use stacked coins or card as spacers). Write down raw readings for each. Choose the height with the largest black–white difference that the chassis can hold reliably. Record the result so every sensor on the bar is set identically.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Reversing the emitter's anode and cathode on the bare sensor.",
        why: "A reverse-biased LED does not emit, so the phototransistor only ever sees ambient light and the reading barely changes.",
        fix: "Identify A and K from the datasheet or test the LED through a phone camera, which often shows the IR glow.",
      },
      {
        mistake: "Using only DO and expecting smooth steering.",
        why: "DO gives just two states, so the robot can only zig-zag between hard corrections.",
        fix: "Read AO with analogRead() for proportional or PID control.",
      },
      {
        mistake: "Writing volts = raw * 5 / 1023 with integers.",
        why: "Integer division discards the fractional part, so 512 becomes 2 instead of about 2.5.",
        fix: "Use floating-point constants: raw * 5.0 / 1023.0.",
      },
    ],
    keyTakeaways: [
      "Bare TCRT5000 pins: A and K for the IR LED, C and E for the phototransistor.",
      "Modules add an LM393 comparator: AO is analog, DO is a thresholded digital output.",
      "The datasheet peak operating distance is about 2.5 mm; mount a few millimetres above the floor.",
      "ADC value ≈ V × 1023 / 5 on a 5 V Uno.",
      "Always confirm output polarity (white LOW or HIGH) by testing.",
    ],
    relatedComponents: ["TCRT5000", "Arduino Uno R3", "Arduino Nano"],
    youtubeSearch: "TCRT5000 module Arduino tutorial analog digital output",
    quiz: [
      {
        type: "identify-pin",
        prompt: "On a 4-pin TCRT5000 module (VCC, GND, DO, AO), which pin gives only a clean HIGH/LOW signal set by the potentiometer threshold?",
        diagram: { kind: "pinout", componentId: "tcrt5000" },
        options: ["AO", "VCC", "DO", "GND"],
        answerIndex: 2,
        explanation: "DO is the LM393 comparator output: it switches between HIGH and LOW depending on whether the sensor voltage is above or below the pot setting. AO is the raw analog voltage, which varies continuously, so it is the one to use for PID but not the clean digital signal asked for.",
        difficulty: 1,
      },
      {
        type: "calculate",
        prompt: "A TCRT5000's AO pin measures 3.2 V on an Arduino Uno running at 5 V. Approximately what will analogRead() return?",
        options: ["640", "655", "819", "3200"],
        answerIndex: 1,
        explanation: "value ≈ 3.2 × 1023 / 5 ≈ 655. 819 would be 4.0 V, and 3200 is the millivolt value, which the 10-bit ADC (maximum 1023) can never return.",
        difficulty: 2,
      },
      {
        type: "code-output",
        prompt: "What does this code print on an Arduino Uno?",
        code: `void setup() {
  Serial.begin(9600);
  int raw = 512;
  float v = raw * 5 / 1023;
  Serial.println(v);
}

void loop() {}`,
        options: ["2.50", "2.00", "2.502", "0.00"],
        answerIndex: 1,
        explanation: "raw * 5 is the integer 2560 and 2560 / 1023 is integer division, giving 2. Only then is it stored in the float, so v is 2.0 and Serial.println prints a float with two decimals: 2.00. To get about 2.50 you must write raw * 5.0 / 1023.0.",
        difficulty: 3,
      },
      {
        type: "find-wrong-connection",
        prompt: "A bare TCRT5000 is wired as shown. Which connection is wrong and will damage the emitter?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "v5", label: "5 V", x: 0, y: 0 },
            { id: "a", label: "Anode (A)", x: 0, y: 1 },
            { id: "k", label: "Cathode (K)", x: 0, y: 2 },
            { id: "r10k", label: "10 kΩ", x: 2, y: 0 },
            { id: "c", label: "Collector (C)", x: 2, y: 1 },
            { id: "e", label: "Emitter (E)", x: 2, y: 2 },
            { id: "a0", label: "A0", x: 3, y: 1 },
            { id: "gnd", label: "GND", x: 1, y: 3 },
          ],
          edges: [
            { from: "v5", to: "a", label: "direct wire", wrong: true },
            { from: "k", to: "gnd" },
            { from: "v5", to: "r10k" },
            { from: "r10k", to: "c" },
            { from: "c", to: "a0" },
            { from: "e", to: "gnd" },
          ],
        },
        options: [
          "5 V wired directly to the anode (A) with no series resistor",
          "Collector (C) connected to A0",
          "Emitter (E) connected to GND",
          "10 kΩ pull-up between 5 V and the collector",
        ],
        answerIndex: 0,
        explanation: "The IR LED needs a current-limiting resistor (about 220 Ω on 5 V). Without it, the current is limited only by wiring resistance and the LED burns out. The collector-to-A0, emitter-to-GND and 10 kΩ pull-up connections are the standard correct phototransistor circuit.",
        difficulty: 2,
      },
    ],
  }),

  defineTopic("line", 18, {
    slug: "qtr-sensor-arrays",
    title: "QTR Sensor Arrays",
    minutes: 14,
    summary: "Using multi-sensor reflectance arrays such as the QTR-8A and QTR-8RC to compute a precise line position.",
    introduction:
      "Two or three single sensors can follow a line, but fast robots use arrays of six to eight sensors spaced evenly across a bar. Pololu's QTR family is the classic example. With an array you stop asking 'is this sensor on the line?' and start asking 'exactly where is the line under the robot?', which is what PID control needs.",
    beginner:
      "Picture a row of eight people standing shoulder to shoulder, each looking down at the floor through a small window. A black stripe is painted somewhere under them. If you ask each person 'how dark is your patch of floor?', the ones directly above the stripe say 'very dark', their neighbours say 'a bit dark', and everyone else says 'bright'. From their answers you can work out where the stripe is, even if it lies between two people.\n\nA QTR sensor array is exactly that row of people. It is one circuit board with several reflective IR sensors in a straight line, all at the same height. The QTR-8A gives each sensor's answer as a voltage. The QTR-8RC gives it as a time: the darker the floor, the longer a tiny capacitor takes to discharge.\n\nThe robot combines all the answers into a single number called the line position, for example 0 when the line is under the leftmost sensor and 7000 when it is under the rightmost one. The middle, 3500, means 'perfectly centred'. Steering then becomes simple: if the number is bigger than the middle, the line is to one side; if smaller, it is to the other.",
    technical: [
      {
        heading: "QTR-8A vs QTR-8RC",
        body:
          "- QTR-8A: each phototransistor has a pull-up so its output is an analog voltage (lower when more light reflects). It needs one ADC channel per sensor.\n- QTR-8RC: each output connects to a small capacitor. The microcontroller drives the pin HIGH to charge the capacitor, switches the pin to input, and times how long it takes to fall below the logic threshold. More reflected light means faster discharge; black gives long times.\n\nBoth boards have the sensors on a fixed pitch (0.375 in, about 9.5 mm) and an LEDON pin that lets the controller switch the emitters on and off to save power or measure ambient light.",
      },
      {
        heading: "Pin budget on Uno vs Nano",
        body:
          "The Arduino Uno has six analog inputs (A0–A5). That means a QTR-8A cannot have all eight channels read by a Uno; you either use six sensors or choose the QTR-8RC, which uses ordinary digital pins. The Arduino Nano has eight analog inputs (A0–A7; A6 and A7 are analog-only), which is one reason the Nano is popular for line followers.",
      },
      {
        heading: "Weighted-average line position",
        body:
          "After calibration each sensor gives a value v_i from 0 (white) to 1000 (black). The line position is the weighted average of sensor indices:\n\nposition = Σ(v_i × i × 1000) / Σ v_i\n\nWith eight sensors the result runs from 0 to 7000, centred at 3500. Example with three sensors reading 0, 800, 400: numerator = 800×1000 + 400×2000 = 1 600 000, denominator = 1200, position ≈ 1333 — a bit right of sensor 1. Use long variables: the numerator easily exceeds the 16-bit int limit of 32 767.\n\nThe error for PID is error = position − centre. Because sensors are about 9.5 mm apart, an error of 1000 corresponds to roughly 9.5 mm of physical offset.",
      },
    ],
    workingPrinciple:
      "Each element of the array is a reflective IR sensor. All are read in quick succession; after calibration their values are combined into a weighted average whose result is a continuous line position. Because neighbouring sensors both see part of the line, the position can be resolved between sensors, giving much finer information than any single sensor.",
    diagrams: [
      { kind: "pinout", componentId: "qtr-8a", highlight: ["LEDON", "1", "8"] },
      {
        kind: "formula",
        latexish: "position = \\frac{\\sum_i v_i \\cdot i \\cdot 1000}{\\sum_i v_i}",
        legend: { v_i: "calibrated reading of sensor i (0 = white, 1000 = black)", i: "sensor index starting at 0", position: "0 … (N−1)×1000; centre is (N−1)×500" },
      },
    ],
    examples: [
      {
        title: "Weighted position from six analog sensors on a Uno",
        body: "This sketch assumes the readings are already calibrated to 0–1000 by a function you write (see Sensor Calibration). It shows the long arithmetic needed for the weighted average and returns the previous position if no sensor sees the line.",
        code: `const int N = 6;
const int pins[N] = {A0, A1, A2, A3, A4, A5};
int calibrated[N];
long lastPosition = 2500;

void setup() {
  Serial.begin(9600);
}

void readCalibrated() {
  for (int i = 0; i < N; i++) {
    int raw = analogRead(pins[i]);
    calibrated[i] = map(raw, 100, 900, 0, 1000);   // replace with your own min/max
    calibrated[i] = constrain(calibrated[i], 0, 1000);
  }
}

long linePosition() {
  long num = 0;
  long den = 0;
  for (int i = 0; i < N; i++) {
    num += (long)calibrated[i] * i * 1000;
    den += calibrated[i];
  }
  if (den < 200) {
    return lastPosition;   // line lost: keep last value
  }
  lastPosition = num / den;
  return lastPosition;
}

void loop() {
  readCalibrated();
  Serial.println(linePosition());
  delay(50);
}`,
      },
      {
        title: "Choosing sensor count and spacing",
        body: "For a typical 18–20 mm wide tape, a 9.5 mm pitch means the line usually covers two sensors at once, which is ideal for interpolation. If you build your own bar with TCRT5000s, aim for a spacing that is roughly half the line width to the full line width; much wider spacing creates 'blind spots' where no sensor sees the line.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Buying a QTR-8A and planning to read all eight channels on an Uno.",
        why: "The Uno has only six analog inputs, so two sensors cannot be read.",
        fix: "Use six sensors, switch to a Nano (A0–A7), or use the QTR-8RC with digital pins.",
      },
      {
        mistake: "Computing the weighted sum with int variables.",
        why: "Values like 1000 × 7 × 1000 exceed 32 767 and wrap around on the Uno's 16-bit int, giving nonsense positions.",
        fix: "Declare numerator and denominator as long and cast before multiplying.",
      },
      {
        mistake: "Using raw readings in the weighted average without calibration.",
        why: "Each sensor has a different offset and gain, so the 'centre' drifts and the robot follows the line off-centre.",
        fix: "Calibrate each sensor to a common 0–1000 scale before computing position.",
      },
    ],
    keyTakeaways: [
      "An array gives a continuous line position, not just on/off states.",
      "QTR-8A outputs analog voltages; QTR-8RC outputs a discharge time read on digital pins.",
      "The Uno has six analog inputs; the Nano has eight.",
      "Position = Σ(v_i × i × 1000) / Σ v_i; with eight sensors it spans 0–7000 with centre 3500.",
      "Use long arithmetic for the weighted sum to avoid 16-bit overflow.",
    ],
    relatedComponents: ["QTR-8A", "QTR-8RC", "Arduino Nano", "Arduino Uno R3", "TCRT5000"],
    youtubeSearch: "QTR-8A QTR-8RC reflectance sensor array line position weighted average",
    quiz: [
      {
        type: "identify-component",
        prompt: "A sensor board has eight reflectance sensors in a row, an LEDON pin, and each output is an analog voltage read with analogRead(). Which board is it?",
        options: ["QTR-8RC", "HC-SR04", "QTR-8A", "L298N"],
        answerIndex: 2,
        explanation: "The QTR-8A gives analog voltage outputs. The QTR-8RC looks almost identical but its outputs are read by timing a capacitor discharge on digital pins. HC-SR04 is an ultrasonic sensor and L298N a motor driver.",
        difficulty: 1,
      },
      {
        type: "code-output",
        prompt: "What does this code print?",
        code: `void setup() {
  Serial.begin(9600);
  int v[3] = {0, 800, 400};
  long num = 0;
  long den = 0;
  for (int i = 0; i < 3; i++) {
    num += (long)v[i] * i * 1000;
    den += v[i];
  }
  Serial.println(num / den);
}

void loop() {}`,
        options: ["1000", "1333", "1500", "1334"],
        answerIndex: 1,
        explanation: "num = 0 + 800×1×1000 + 400×2×1000 = 1 600 000; den = 1200. 1 600 000 / 1200 = 1333.33…, and long division truncates to 1333 (it does not round up to 1334). 1500 would be the simple midpoint of sensors 1 and 2, ignoring that sensor 1 is darker.",
        difficulty: 2,
      },
      {
        type: "calculate",
        prompt: "A QTR-8 array has a sensor pitch of about 9.5 mm. The position reading is 5000 and the centre is 3500. Roughly how far is the line from the centre of the array?",
        options: ["About 9.5 mm", "About 14 mm", "About 28 mm", "About 50 mm"],
        answerIndex: 1,
        explanation: "Error = 5000 − 3500 = 1500, i.e. 1.5 sensor pitches. 1.5 × 9.5 mm ≈ 14 mm. 9.5 mm would be an error of only 1000, and 28 mm doubles the pitch count.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "Why do many builders choose an Arduino Nano instead of an Uno for an 8-sensor analog array?",
        options: [
          "The Nano's ADC is 12-bit",
          "The Nano has eight analog inputs (A0–A7) while the Uno has six",
          "The Nano runs at a higher clock speed",
          "The Uno cannot read analog voltages",
        ],
        answerIndex: 1,
        explanation: "The classic Nano uses the same ATmega328P as the Uno (10-bit ADC, 16 MHz) but its package exposes A6 and A7, giving eight analog inputs. The Uno only breaks out A0–A5. The ADC resolution and clock are the same.",
        difficulty: 1,
      },
    ],
  }),
];
