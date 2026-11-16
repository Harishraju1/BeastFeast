import { defineTopic } from "../define";
import type { Topic } from "../types";

export const LINE_04: Topic[] = [
  defineTopic("line", 4, {
    slug: "voltage-current-resistance",
    title: "Voltage, Current and Resistance",
    minutes: 10,
    summary: "Voltage pushes, current flows, and resistance opposes the flow — and you measure each one differently with a multimeter.",
    introduction: `Voltage, current and resistance are the three quantities you will measure and calculate more than any others in robotics. Understanding what each one physically means — and how to measure it without damaging your meter or your circuit — makes every later topic easier.

This lesson also introduces power and explains why motors, batteries and wires get warm.`,
    beginner: `Go back to the water-pipe picture. Voltage is like water pressure: the push that tries to move water through the pipes. A 7.4 V battery pushes harder than a 3.7 V battery. Current is how much water actually flows past a point every second. Resistance is how narrow or blocked the pipe is: a narrow pipe lets less water through for the same pressure.

So if you increase the pressure (voltage) and keep the pipe the same, more water flows (more current). If you squeeze the pipe (more resistance) and keep the pressure the same, less flows.

These three ideas have units: volts (V) for voltage, amperes or amps (A) for current, and ohms (Ω) for resistance. Robots deal with small and large values, so you will often see millivolts (mV), milliamps (mA, a thousandth of an amp) and kilo-ohms (kΩ, a thousand ohms).

A multimeter can measure all three, but each one is measured differently. Voltage is measured across two points, like checking the pressure difference between two ends of a pipe. Current is measured by breaking the pipe and putting the meter in the flow, so all the water passes through it. Mixing these up is the classic way to blow a multimeter fuse.`,
    technical: [
      {
        heading: "Definitions and units",
        body: `- Voltage V (volt): energy per unit charge between two points; 1 V = 1 J/C.
- Current I (ampere): charge per unit time; 1 A = 1 C/s. 1 mA = 0.001 A.
- Resistance R (ohm): opposition to current; R = V / I. 1 kΩ = 1000 Ω, 1 MΩ = 1 000 000 Ω.
- Power P (watt): P = V × I = I² × R = V² / R.

Typical robot values: Arduino logic 5 V (ESP32 3.3 V), one Li-ion cell 3.7 V nominal (4.2 V full), a 2S pack 7.4 V nominal (8.4 V full), an I/O pin current up to 20 mA recommended, a small gear motor hundreds of mA running and much more at stall.`,
      },
      {
        heading: "Measuring with a multimeter",
        body: `Voltage: select DC volts, black probe on GND (COM jack), red probe on the point of interest (V/Ω jack). The meter has very high input resistance, so it barely disturbs the circuit — it is connected in parallel.

Current: the circuit must be broken and the meter inserted in series. Move the red lead to the mA or 10 A jack. In current mode the meter is almost a short circuit (very low resistance). If you then touch the probes across a battery, a huge current flows and the meter's fuse blows — or worse.

Resistance: only measure with the power off and ideally with the component removed from the circuit, because other parallel paths change the reading.`,
      },
      {
        heading: "Where voltage drops and power is lost",
        body: `Every wire and connector has a small resistance. With 2 A flowing through 0.1 Ω of thin jumper wire and connectors, the drop is V = I × R = 2 × 0.1 = 0.2 V and the wasted power is P = I²R = 4 × 0.1 = 0.4 W. That is why motor power wiring should be short and thick, and why a sagging battery voltage under load (caused by the battery's internal resistance) can make the Arduino reset when motors start.

Motor drivers also drop voltage: an L298N typically loses around 2 V at 1 A, so a 7.4 V pack delivers only about 5.4 V to the motor.`,
      },
    ],
    workingPrinciple: `A voltage source creates an electric field that pushes charge through a conductor. The resistance of the path determines how much current results from a given voltage. As current passes through a resistance, electrical energy is converted to heat at a rate of I²R. Measuring instruments either sit across a component (voltmeter, high resistance, parallel) or in the current path (ammeter, low resistance, series).`,
    diagrams: [
      { kind: "formula", latexish: "P = V × I = I² × R = V² / R", legend: { P: "power in watts (W)", V: "voltage in volts (V)", I: "current in amperes (A)", R: "resistance in ohms (Ω)" } },
      {
        kind: "circuit",
        nodes: [
          { id: "bat", label: "Battery 7.4 V", x: 60, y: 120 },
          { id: "am", label: "Ammeter (in series)", x: 260, y: 40 },
          { id: "mot", label: "Motor", x: 460, y: 120 },
          { id: "vm", label: "Voltmeter (across motor)", x: 460, y: 260 },
        ],
        edges: [
          { from: "bat", to: "am", label: "+" },
          { from: "am", to: "mot" },
          { from: "mot", to: "bat", label: "−" },
          { from: "vm", to: "mot", label: "parallel probes", color: "blue" },
        ],
      },
    ],
    examples: [
      {
        title: "Checking battery sag",
        body: "Measure your 2S pack with the robot idle: 8.0 V. Hold the wheels and run the motors: 7.1 V. The 0.9 V drop is caused by the battery's internal resistance and wiring. If the Arduino is powered from the same pack and its regulator input falls too low, it may reset. Fix: thicker wires, a healthier battery, or a separate logic supply.",
      },
      {
        title: "Measuring motor current safely",
        body: "1. Turn the robot off.\n2. Move the red lead to the 10 A jack and select DC A.\n3. Disconnect one motor wire from the driver output and connect the meter between the driver terminal and the motor wire.\n4. Power on and read the running current; briefly hold the wheel to estimate stall current.\n5. Move the red lead back to V/Ω immediately afterwards.",
      },
    ],
    commonMistakes: [
      { mistake: "Measuring voltage with the red lead still in the current jack.", why: "In current mode the meter is nearly a short circuit, so a huge current flows and the fuse blows.", fix: "Always return the red lead to the V/Ω jack after measuring current." },
      { mistake: "Measuring resistance in a powered circuit.", why: "The meter injects a small current to measure resistance; external voltage corrupts the reading and can damage the meter.", fix: "Power off and isolate the component before measuring resistance." },
      { mistake: "Using thin jumper wires for motor power.", why: "Their resistance causes voltage drop and heat at amp-level currents.", fix: "Use short, thicker wires (e.g. 22 AWG or thicker) for battery and motor connections." },
      { mistake: "Confusing mA and A in calculations.", why: "A factor-of-1000 error gives absurd answers, such as a 0.22 Ω resistor instead of 220 Ω.", fix: "Convert everything to base units (V, A, Ω) before calculating." },
    ],
    keyTakeaways: [
      "Voltage is the push, current is the flow, resistance opposes the flow.",
      "Voltmeters go across (parallel); ammeters go in the path (series).",
      "P = V × I; wasted power in wires is I²R.",
      "Batteries and drivers drop voltage under load — measure while the motors run.",
      "Convert mA to A and kΩ to Ω before calculating.",
    ],
    relatedComponents: ["Digital Multimeter", "18650 Li-ion Cell", "L298N", "Male-to-Male Jumper Wires"],
    youtubeSearch: "how to measure voltage and current with a multimeter beginners",
    quiz: [
      {
        type: "calculate",
        prompt: "A motor draws 0.6 A from a 7.4 V battery. How much power does it consume?",
        options: ["12.3 W", "0.08 W", "8.0 W", "4.44 W"],
        answerIndex: 3,
        explanation: "P = V × I = 7.4 × 0.6 = 4.44 W. 12.3 W comes from dividing 7.4 by 0.6, which is the formula for resistance (V / I), not power.",
        difficulty: 1,
      },
      {
        type: "predict-circuit",
        prompt: "A student leaves the multimeter's red lead in the 10 A jack (current mode) and touches the probes across a charged 2S LiPo to 'check its voltage'. What is the most likely result?",
        options: ["A very large current flows, likely blowing the meter fuse or sparking", "The meter correctly shows about 7.4 V", "The meter shows 0 V and nothing else happens", "The battery charges from the meter"],
        answerIndex: 0,
        explanation: "In current mode the meter has very low resistance, so connecting it across the battery is almost a short circuit — the current is limited only by the battery, and the fuse blows. It will not show 7.4 V, because it is not measuring voltage in this configuration.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "How must an ammeter be connected to measure the current through a motor?",
        options: ["Across the motor terminals", "Across the battery terminals", "In series with the motor, so all motor current passes through the meter", "Between the motor and the chassis"],
        answerIndex: 2,
        explanation: "Current must flow through the meter, so it goes in series. Connecting it across the motor (parallel) would short out the motor and push a large current through the meter.",
        difficulty: 1,
      },
      {
        type: "find-wrong-connection",
        prompt: "To measure motor current a student sets the meter to DC A (red lead in 10 A jack) and clips the probes onto the two motor terminals while the motor is still wired to the driver. The meter fuse blows. What was wrong?",
        options: ["The meter should have been on AC A", "The meter was placed in parallel with the motor instead of in series", "The black lead should have been in the 10 A jack", "Motors cannot be measured with a multimeter"],
        answerIndex: 1,
        explanation: "In current mode the meter is nearly a short; placing it across the motor shorted the driver output through the meter. It must be inserted in series by disconnecting one motor wire. AC mode is wrong for a DC motor circuit and would not have prevented the short.",
        difficulty: 2,
      },
    ],
  }),

  defineTopic("line", 5, {
    slug: "ohms-law",
    title: "Ohm's Law",
    minutes: 10,
    summary: "V = I × R links voltage, current and resistance, and lets you size resistors, predict currents and spot dangerous designs before you build them.",
    introduction: `Ohm's law is the single most useful equation in hobby electronics. With it you can choose the right resistor for an LED, work out how much current a sensor will draw, predict a motor's stall current and check whether an Arduino pin is safe.

In this topic you will practise rearranging the equation, working with real units, and doing the maths safely in Arduino code.`,
    beginner: `Ohm's law says: voltage equals current times resistance, written V = I × R. Think of pushing a shopping trolley through sand. How hard you push is the voltage. How fast the trolley moves is the current. How thick the sand is is the resistance. Push harder and the trolley goes faster; make the sand thicker and it slows down.

The equation can be rearranged three ways, and a handy memory trick is the triangle with V on top and I and R at the bottom. Cover the one you want:

- Cover V and you see I × R, so V = I × R.
- Cover I and you see V over R, so I = V / R.
- Cover R and you see V over I, so R = V / I.

Here is a real robot example. You want an LED to show when your robot is powered. The Arduino supplies 5 V. The LED itself 'uses up' about 2 V. That leaves 3 V across a resistor. If you want 15 mA (0.015 A) through the LED, the resistor should be R = 3 / 0.015 = 200 Ω. You pick the next standard value up, 220 Ω, and the LED is safe and bright.`,
    technical: [
      {
        heading: "The equation and its forms",
        body: `V = I × R, I = V / R, R = V / I. Always use base units: volts, amperes, ohms. Useful shortcut: volts ÷ kilo-ohms = milliamps (5 V / 10 kΩ = 0.5 mA).

Ohm's law applies exactly to resistors (linear components). Diodes, LEDs and transistors are non-linear: you handle them by subtracting their roughly constant forward voltage and applying Ohm's law to the remaining resistor.`,
      },
      {
        heading: "Worked example: LED resistor",
        body: `Supply 5 V, red LED forward voltage about 2.0 V, target current 15 mA.

V_R = 5 − 2.0 = 3.0 V
R = V_R / I = 3.0 / 0.015 = 200 Ω → choose 220 Ω (E12 series).
Actual current: I = 3.0 / 220 ≈ 13.6 mA — under the 20 mA recommended pin current.
Resistor power: P = I²R = 0.0136² × 220 ≈ 0.041 W — a standard 1/4 W resistor is fine.`,
      },
      {
        heading: "Worked example: motor stall current",
        body: `A DC motor at standstill behaves roughly like its winding resistance, because it generates no back-EMF while not turning. If a small motor has a winding resistance of 5 Ω and receives 6 V, the stall current is about I = 6 / 5 = 1.2 A. Once the motor spins, back-EMF opposes the supply and the running current falls well below this.

This is why a stalled robot (pushed against a wall or an opponent) draws far more current than when it is driving freely — and why drivers and batteries get hot in sumo pushing matches. (Measure your own motor's winding resistance with a multimeter; values vary widely between motor models.)`,
      },
      {
        heading: "Doing Ohm's law on an Arduino",
        body: `On an Arduino Uno an int is 16-bit (−32768 to 32767). Working in millivolts and milliamps keeps numbers as integers, but beware:

- Integer division truncates: 5000 / 220 = 22, not 22.7.
- Products can overflow: 5000 * 10 = 50000 does not fit in an int. Cast to long first: (long)5000 * 10.
- Use float when you need decimals, accepting that it is slower on an 8-bit chip.`,
      },
    ],
    workingPrinciple: `In a resistor, current is directly proportional to the voltage across it, with resistance as the constant of proportionality. Doubling the voltage doubles the current; doubling the resistance halves it. For non-linear parts, you subtract their characteristic voltage drop first, then apply V = I × R to the linear part of the circuit.`,
    diagrams: [
      { kind: "formula", latexish: "V = I × R    I = V / R    R = V / I", legend: { V: "voltage across the resistor (V)", I: "current through it (A)", R: "resistance (Ω)" } },
      {
        kind: "signal",
        title: "Current vs voltage for a 220 Ω resistor",
        xLabel: "Voltage (V)",
        yLabel: "Current (mA)",
        series: [{ label: "220 Ω", points: [[0, 0], [1, 4.5], [2, 9.1], [3, 13.6], [4, 18.2], [5, 22.7]] }],
      },
    ],
    examples: [
      {
        title: "Pull-up resistor current",
        body: "A push button uses a 10 kΩ pull-up to 5 V. When the button is pressed, the pin is connected to GND and current flows through the resistor: I = 5 / 10 000 = 0.5 mA. That is tiny, which is why 10 kΩ is a popular pull-up value: it wastes almost no power but still defines the pin level firmly.",
      },
      {
        title: "Calculating current in code",
        body: "This sketch calculates LED current with integer and float maths so you can see the difference.",
        code: `const int SUPPLY_MV = 5000;
const int LED_VF_MV = 2000;
const int R_OHMS = 220;

void setup() {
  Serial.begin(9600);
  int intMilliAmps = (SUPPLY_MV - LED_VF_MV) / R_OHMS;          // 3000 / 220 = 13
  float floatMilliAmps = (SUPPLY_MV - LED_VF_MV) / (float)R_OHMS; // 13.64
  Serial.println(intMilliAmps);
  Serial.println(floatMilliAmps);
}

void loop() {}`,
      },
    ],
    commonMistakes: [
      { mistake: "Forgetting to subtract the LED forward voltage.", why: "Using 5 V / 0.015 A gives 333 Ω, which is wrong because the LED itself drops about 2 V.", fix: "Use R = (V_supply − V_f) / I." },
      { mistake: "Mixing milliamps and amps.", why: "3 V / 15 = 0.2 Ω is a nonsense answer caused by leaving 15 mA as '15'.", fix: "Convert 15 mA to 0.015 A, or consistently use V, mA and kΩ together." },
      { mistake: "Applying Ohm's law directly to an LED or a spinning motor.", why: "These are not linear resistors; their current is not simply V / R.", fix: "Subtract the forward voltage for diodes; for motors only the stall case is close to V / R_winding." },
      { mistake: "Integer overflow in calculations on the Uno.", why: "A 16-bit int cannot hold values above 32767.", fix: "Use long for products of large numbers, and float when decimals matter." },
    ],
    keyTakeaways: [
      "V = I × R, and it rearranges to I = V / R and R = V / I.",
      "Volts ÷ kilo-ohms gives milliamps — a quick mental shortcut.",
      "For LEDs: R = (V_supply − V_f) / I, then pick the next standard value up.",
      "A stalled motor draws roughly V / R_winding — much more than when running.",
      "On the Uno, watch out for integer division and 16-bit overflow.",
    ],
    relatedComponents: ["220Ω Resistor", "LED Diode", "Arduino Uno R3", "Digital Multimeter"],
    youtubeSearch: "ohm's law explained LED resistor calculation",
    quiz: [
      {
        type: "calculate",
        prompt: "An LED with a forward voltage of 2.0 V is powered from 5 V. You want 15 mA through it. What resistor value does Ohm's law give (before rounding to a standard value)?",
        options: ["333 Ω", "200 Ω", "133 Ω", "75 Ω"],
        answerIndex: 1,
        explanation: "The resistor sees 5 − 2.0 = 3.0 V, so R = 3.0 / 0.015 = 200 Ω (then choose 220 Ω). 333 Ω is the common mistake of using the full 5 V without subtracting the LED's forward voltage.",
        difficulty: 2,
      },
      {
        type: "calculate",
        prompt: "How much current flows through a 10 kΩ pull-up resistor when 5 V is across it?",
        options: ["50 mA", "2 mA", "0.5 mA", "5 mA"],
        answerIndex: 2,
        explanation: "I = V / R = 5 / 10 000 = 0.0005 A = 0.5 mA (or 5 V / 10 kΩ = 0.5 mA). 50 mA comes from forgetting that 10 kΩ is 10 000 Ω, not 100 Ω.",
        difficulty: 1,
      },
      {
        type: "predict-circuit",
        prompt: "A small DC motor has a winding resistance of 4 Ω and is powered with 6 V. A sumo opponent jams the wheel so the motor cannot turn. Approximately how much current does it draw?",
        options: ["About 1.5 A, much more than while running freely", "About 0.15 A, the same as while running", "Zero, because the motor is not moving", "About 24 A"],
        answerIndex: 0,
        explanation: "A stalled motor produces no back-EMF, so its current is roughly V / R = 6 / 4 = 1.5 A, far higher than its running current. 'Zero' is a common misconception — the motor is not moving, but current is still flowing and turning into heat.",
        difficulty: 2,
      },
      {
        type: "code-output",
        prompt: "What does this sketch print on an Arduino Uno?",
        code: `void setup() {
  Serial.begin(9600);
  int voltage_mV = 5000;
  int resistance = 220;
  int current_mA = voltage_mV / resistance;
  long check = (long)current_mA * resistance;
  Serial.println(current_mA);
  Serial.println(check);
}

void loop() {}`,
        options: ["22.73 then 5000", "23 then 5060", "22 then 4840", "22 then 5000"],
        answerIndex: 2,
        explanation: "Integer division truncates: 5000 / 220 = 22 (the .73 is discarded, not rounded to 23). Then 22 × 220 = 4840, cast to long so no overflow. It does not get back to 5000 because the fractional part was lost.",
        difficulty: 3,
      },
    ],
  }),

  defineTopic("line", 6, {
    slug: "resistors",
    title: "Resistors",
    minutes: 10,
    summary: "Resistors limit current, divide voltages and set default logic levels; you read their value from colour bands and must respect their power rating.",
    introduction: `Resistors are the most common component on any robot board. They protect LEDs, pull input pins to a defined level, scale battery voltage down for the ADC, and set the sensitivity of IR sensors.

In this topic you will learn to read colour codes, use standard values, design voltage dividers and pull-up/pull-down resistors, and check power ratings.`,
    beginner: `A resistor is like a narrow section of pipe deliberately placed in a water system to control the flow. It does not store water and it does not care which way the water goes — it simply makes it harder for water to pass, turning some of the pushing energy into heat.

You will use resistors in three main ways on your robot. First, to protect things: an LED connected straight to 5 V would draw too much current and burn out, so you put a resistor in series to limit the current. Second, to make sure an input pin always has a clear value: a button on its own leaves the pin 'floating' when it is not pressed, so a resistor gently pulls the pin up to 5 V or down to 0 V. Third, to scale a voltage down: two resistors in series split a voltage into a smaller fraction, which lets an Arduino measure a 7.4 V battery even though its input only accepts up to 5 V.

Small resistors are too tiny to print numbers on, so they use coloured bands. Each colour stands for a digit. Learning the colour code takes ten minutes and saves hours of confusion at the workbench.`,
    technical: [
      {
        heading: "Colour code and standard values",
        body: `Colour digits: black 0, brown 1, red 2, orange 3, yellow 4, green 5, blue 6, violet 7, grey 8, white 9. Tolerance band: gold ±5%, silver ±10% (brown ±1% on precision resistors).

4-band: digit, digit, multiplier (number of zeros), tolerance.
- red red brown gold = 22 × 10 = 220 Ω ±5%
- brown black orange gold = 10 × 1000 = 10 kΩ ±5%
- yellow violet red gold = 47 × 100 = 4.7 kΩ ±5%

Resistors come in standard 'E-series' values. The E12 series (10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82 × powers of ten) covers most hobby needs.`,
      },
      {
        heading: "Voltage divider",
        body: `Two resistors in series from V_in to GND, output taken at the middle:

V_out = V_in × R2 / (R1 + R2)   (R1 on top, R2 to GND)

To measure a 2S Li-ion pack (8.4 V when full) on an Arduino analog pin (max 5 V), use R1 = 10 kΩ and R2 = 10 kΩ: V_out = 8.4 × 10 / 20 = 4.2 V — safely below 5 V. In code, multiply the measured voltage by 2 to recover the battery voltage.

Keep divider resistors in the kΩ range: low values waste battery current; very high values (hundreds of kΩ) make the ADC reading less accurate because the ADC input needs to charge its sampling capacitor.`,
      },
      {
        heading: "Pull-up and pull-down resistors",
        body: `An input pin that is connected to nothing 'floats' and reads random HIGH/LOW values. A pull-up resistor (typically 10 kΩ to 5 V) holds the pin HIGH until a button connects it to GND; a pull-down holds it LOW until a button connects it to 5 V.

The ATmega328P has built-in pull-ups (roughly 20–50 kΩ) enabled with pinMode(pin, INPUT_PULLUP). With a pull-up, a pressed button reads LOW — the logic is inverted.`,
      },
      {
        heading: "Power rating",
        body: `A resistor dissipates P = I²R = V²/R as heat. Through-hole resistors are commonly rated 1/4 W (0.25 W). A 220 Ω LED resistor at 13.6 mA dissipates about 0.04 W — no problem. But a 10 Ω resistor across 5 V would dissipate 5² / 10 = 2.5 W and burn. Always check power when currents exceed a few tens of milliamps.`,
      },
    ],
    workingPrinciple: `A resistor is a material with a controlled, stable resistance. When current flows through it, it drops a voltage proportional to that current (V = I × R) and converts the corresponding power into heat. In series with a load it limits current; as a pair it divides a voltage in proportion to the resistances; connected between a pin and a supply rail it gives the pin a weak default voltage that a switch can easily override.`,
    diagrams: [
      { kind: "formula", latexish: "V_out = V_in × R2 / (R1 + R2)", legend: { V_in: "input voltage (e.g. battery)", R1: "top resistor (to V_in)", R2: "bottom resistor (to GND)", V_out: "voltage at the midpoint, to the analog pin" } },
      {
        kind: "circuit",
        nodes: [
          { id: "bat", label: "2S battery + (up to 8.4 V)", x: 60, y: 40 },
          { id: "r1", label: "R1 10 kΩ", x: 240, y: 40 },
          { id: "mid", label: "Midpoint → A0", x: 400, y: 120 },
          { id: "r2", label: "R2 10 kΩ", x: 240, y: 200 },
          { id: "gnd", label: "GND", x: 60, y: 200 },
        ],
        edges: [
          { from: "bat", to: "r1" },
          { from: "r1", to: "mid" },
          { from: "mid", to: "r2" },
          { from: "r2", to: "gnd" },
        ],
      },
    ],
    examples: [
      {
        title: "Battery monitor with a voltage divider",
        body: "10 kΩ / 10 kΩ divider from the battery to A0, divider ground tied to Arduino GND. The code converts the ADC reading back to battery voltage.",
        code: `const int BATTERY_PIN = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(BATTERY_PIN);           // 0..1023
  float pinVolts = raw * 5.0 / 1024.0;         // voltage at the midpoint
  float batteryVolts = pinVolts * 2.0;         // undo the 1:2 divider
  Serial.println(batteryVolts);
  delay(500);
}`,
      },
      {
        title: "Button with the internal pull-up",
        body: "Wire a push button between pin 4 and GND — no external resistor needed. INPUT_PULLUP keeps the pin HIGH; pressing the button pulls it LOW.",
        code: `const int BUTTON_PIN = 4;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(13, OUTPUT);
}

void loop() {
  bool pressed = (digitalRead(BUTTON_PIN) == LOW); // inverted logic
  digitalWrite(13, pressed ? HIGH : LOW);
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Reading the colour bands from the wrong end.", why: "Reading gold-brown-black-red backwards gives nonsense values.", fix: "Start from the end opposite the gold/silver tolerance band, and confirm with a multimeter." },
      { mistake: "Feeding a battery directly into an analog pin.", why: "Voltages above 5 V (or above 3.3 V on an ESP32) can damage the input.", fix: "Use a voltage divider sized so the maximum battery voltage gives less than the ADC's maximum." },
      { mistake: "Leaving a button input floating.", why: "Without a pull resistor the pin picks up noise and reads random values.", fix: "Use INPUT_PULLUP or an external 10 kΩ pull-up/pull-down." },
      { mistake: "Ignoring resistor power rating.", why: "A small resistor carrying large current overheats and can burn.", fix: "Calculate P = I²R and choose a resistor rated for at least twice that." },
    ],
    keyTakeaways: [
      "Colour code: black 0 … white 9; third band is the multiplier, last is tolerance.",
      "Series resistors limit current; dividers scale voltage: V_out = V_in × R2/(R1+R2).",
      "Pull-ups/pull-downs stop inputs floating; INPUT_PULLUP inverts button logic.",
      "Check power dissipation: P = I²R must be well under the rating.",
      "Use standard E12 values and verify with a multimeter.",
    ],
    relatedComponents: ["220Ω Resistor", "Push Button Switch", "Arduino Uno R3", "Digital Multimeter"],
    youtubeSearch: "resistor colour code voltage divider pull up resistor tutorial",
    quiz: [
      {
        type: "calculate",
        prompt: "A resistor has the bands red, red, brown, gold. What is its value?",
        options: ["22 Ω ±5%", "2.2 kΩ ±5%", "220 Ω ±5%", "221 Ω ±10%"],
        answerIndex: 2,
        explanation: "Red = 2, red = 2, brown multiplier = ×10, so 22 × 10 = 220 Ω, and gold = ±5%. 2.2 kΩ would need a red multiplier (×100).",
        difficulty: 1,
      },
      {
        type: "identify-component",
        prompt: "A bag of parts is labelled only by colour bands. Which resistor is the common 10 kΩ pull-up value?",
        options: ["brown, black, orange, gold", "brown, black, red, gold", "orange, orange, brown, gold", "yellow, violet, red, gold"],
        answerIndex: 0,
        explanation: "Brown 1, black 0, orange ×1000 → 10 000 Ω = 10 kΩ. Brown-black-red is 10 × 100 = 1 kΩ, a frequent mix-up when the multiplier colour is misread.",
        difficulty: 2,
      },
      {
        type: "find-wrong-connection",
        prompt: "A start button is wired between pin 7 and 5 V. The code uses pinMode(7, INPUT) and checks for HIGH. The robot sometimes starts by itself before the button is pressed. What is wrong?",
        options: ["The button should be wired to an analog pin", "There is no pull-down resistor, so pin 7 floats when the button is not pressed", "The button needs a series capacitor", "pinMode must be OUTPUT for a button"],
        answerIndex: 1,
        explanation: "When the button is open, pin 7 is connected to nothing and floats, picking up noise that can read HIGH. A 10 kΩ pull-down to GND (or rewiring to GND with INPUT_PULLUP and checking LOW) fixes it. Setting the pin as OUTPUT would make it drive the line instead of reading the button.",
        difficulty: 2,
      },
      {
        type: "calculate",
        prompt: "A voltage divider has R1 = 20 kΩ (top, to the battery) and R2 = 10 kΩ (bottom, to GND). The battery is at 7.5 V. What voltage reaches the analog pin?",
        options: ["5.0 V", "3.75 V", "7.5 V", "2.5 V"],
        answerIndex: 3,
        explanation: "V_out = 7.5 × 10 / (20 + 10) = 7.5 × 1/3 = 2.5 V. 5.0 V results from swapping R1 and R2 (using 20 / 30).",
        difficulty: 2,
      },
    ],
  }),
];
