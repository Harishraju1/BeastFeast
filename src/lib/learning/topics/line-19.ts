import { defineTopic } from "../define";
import type { Topic } from "../types";

export const LINE_19: Topic[] = [
  defineTopic("line", 19, {
    slug: "motor-fundamentals",
    title: "Motor Fundamentals",
    minutes: 13,
    summary: "How brushed DC motors turn current into torque, why they draw huge current when stalled, and how speed, torque and power relate.",
    introduction:
      "The motors are the muscles of your robot and usually its biggest power consumers. Understanding what happens inside a brushed DC motor explains many everyday problems: why the Arduino resets when the robot starts, why a stalled motor gets hot, why reversing the wires reverses the direction, and why you need diodes in a motor circuit.",
    beginner:
      "A DC motor is a spinning tug-of-war between magnets. Inside the metal can there are fixed magnets, and on the shaft there are coils of wire. When current flows through a coil it becomes an electromagnet, and it is pushed and pulled by the fixed magnets, so the shaft turns. Just before the coil settles, a clever rotating switch called the commutator swaps the current direction, so the push keeps going round and round.\n\nThere is a surprising twist. A spinning motor also behaves like a small generator, producing a voltage that pushes back against the battery. This is called back-EMF. When the motor spins fast, back-EMF is large, so only a small current flows. When the motor is held still (stalled), there is no back-EMF, and the current shoots up to its maximum.\n\nThink of riding a bicycle: pedalling at speed on a flat road takes little effort per push, but starting uphill from standstill takes your biggest effort. A motor is the same: the biggest current happens at start-up and when stuck. That current surge is why your robot's electronics need careful power design.",
    technical: [
      {
        heading: "The two motor equations",
        body:
          "A brushed DC motor is well described by two linear relations:\n\n- Electrical: V = I·R + Ke·ω (supply voltage = resistive drop + back-EMF)\n- Mechanical: τ = Kt·I (torque is proportional to current)\n\nHere R is the winding resistance, ω the angular speed in rad/s, and Ke, Kt are motor constants (numerically equal in SI units). At stall (ω = 0) the current is I_stall = V / R. For example, a small motor with 4 Ω winding resistance on 6 V can draw up to 1.5 A at stall, even if it draws only a fraction of that when running freely.",
      },
      {
        heading: "Torque–speed line and power",
        body:
          "Combining the equations gives a straight line: τ = τ_stall × (1 − ω / ω_0), where ω_0 is the no-load speed. Torque is maximum at zero speed; speed is maximum at zero torque.\n\nMechanical output power is P = τ × ω, with ω = 2π × RPM / 60. Example: 0.2 N·m at 150 RPM → ω = 2π × 150 / 60 ≈ 15.7 rad/s → P ≈ 3.1 W. Power is zero at both ends of the line and peaks at half stall torque and half no-load speed: P_max = τ_stall × ω_0 / 4.\n\nDoubling the supply voltage roughly doubles both no-load speed and stall torque (and stall current), which is why motors run noticeably faster on a 2S pack than on 1S.",
      },
      {
        heading: "Direction, inductance and flyback",
        body:
          "Reversing the voltage polarity reverses the current and therefore the torque, so the motor runs backwards. This is what an H-bridge does electronically.\n\nThe windings are inductors. When current through an inductor is suddenly interrupted (V = L × di/dt), a large voltage spike appears. Without a path for that current, the spike can destroy the switching transistor. Flyback (freewheeling) diodes give the current a safe path. The L298 chip itself needs external diodes (most L298N modules already include them on the board), while MOSFET drivers like the TB6612FNG rely on internal diodes.\n\nBrushes also create electrical noise; a small ceramic capacitor (often 0.1 µF) soldered across the motor terminals reduces it.",
      },
    ],
    workingPrinciple:
      "Current in the rotor coils creates a magnetic field that interacts with the permanent magnets to produce torque (τ = Kt·I). The commutator reverses coil current every half turn so the torque keeps the same direction. As speed rises, the back-EMF (Ke·ω) rises and limits the current, so the motor settles at a speed where its torque equals the load torque.",
    diagrams: [
      {
        kind: "signal",
        title: "Torque–speed and current–torque lines of a DC motor",
        xLabel: "Torque (fraction of stall)",
        yLabel: "Speed / current (fraction of max)",
        series: [
          { label: "Speed", points: [[0, 1], [0.25, 0.75], [0.5, 0.5], [0.75, 0.25], [1, 0]] },
          { label: "Current", points: [[0, 0.05], [0.25, 0.29], [0.5, 0.52], [0.75, 0.76], [1, 1]] },
          { label: "Output power", points: [[0, 0], [0.25, 0.75], [0.5, 1], [0.75, 0.75], [1, 0]] },
        ],
      },
      {
        kind: "formula",
        latexish: "P = \\tau \\cdot \\omega, \\quad \\omega = \\frac{2\\pi N}{60}",
        legend: { P: "mechanical power (W)", "τ": "torque (N·m)", "ω": "angular speed (rad/s)", N: "speed (RPM)" },
      },
    ],
    examples: [
      {
        title: "Measuring stall current safely",
        body: "Put a multimeter on its 10 A range in series with one motor and a battery. Note the current when spinning freely, then hold the wheel for no more than a second and note the stall current. The difference (often several times larger) is the surge your driver and battery must survive at every start and every collision.",
      },
      {
        title: "Soft start to reduce current surges",
        body: "Ramping the PWM up over a few hundred milliseconds keeps the voltage low while the motor is still slow (back-EMF is small), so the start-up current is lower and the Arduino is less likely to brown out. Pin 5 is a PWM pin on the Uno (about 980 Hz).",
        code: `const int ENA = 5;   // PWM pin to motor driver enable
const int IN1 = 4;
const int IN2 = 7;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  for (int duty = 0; duty <= 200; duty += 10) {
    analogWrite(ENA, duty);
    delay(20);   // reaches 200 in about 0.4 s
  }
}

void loop() {}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Sizing the driver and battery using the free-running current only.",
        why: "Start-up and stall currents are far higher than running current, so the driver overheats or the battery voltage collapses.",
        fix: "Measure or look up stall current and choose a driver and battery that can supply it briefly.",
      },
      {
        mistake: "Leaving out flyback protection and noise capacitors.",
        why: "Inductive spikes damage transistors, and brush noise causes resets or corrupted sensor readings.",
        fix: "Use a driver with flyback diodes and add a 0.1 µF capacitor across each motor's terminals.",
      },
      {
        mistake: "Holding a motor stalled for long periods while testing.",
        why: "Stall current is maximum and all electrical power becomes heat in the windings and the driver.",
        fix: "Keep stalls brief and stop the motors in code if the robot is stuck.",
      },
    ],
    keyTakeaways: [
      "Torque is proportional to current; speed is limited by back-EMF.",
      "Stall current I = V/R is the maximum current and occurs at start-up and when stuck.",
      "Mechanical power P = τω with ω = 2π × RPM / 60, maximum at half stall torque.",
      "Reversing polarity reverses direction; an H-bridge does this electronically.",
      "Inductive spikes and brush noise require flyback diodes and small capacitors.",
    ],
    relatedComponents: ["TT Yellow Gear Motor", "N20 Micro Metal Gear Motor", "BO Gear Motor", "L298N", "1N4007 Diode"],
    youtubeSearch: "how brushed DC motor works back EMF stall current torque speed curve",
    quiz: [
      {
        type: "mcq",
        prompt: "What happens to a DC motor's current when the robot pushes against a wall and the wheels stop turning?",
        options: [
          "It drops to zero because the motor is not moving",
          "It stays the same as when running freely",
          "It halves because the load is shared",
          "It rises towards the stall current because there is no back-EMF",
        ],
        answerIndex: 3,
        explanation: "With ω = 0 the back-EMF term Ke·ω disappears, so I = V/R, the maximum (stall) current. Many beginners think 'not moving' means 'no current', but the motor is still producing maximum torque, which requires maximum current.",
        difficulty: 1,
      },
      {
        type: "calculate",
        prompt: "A gearmotor delivers 0.2 N·m at 150 RPM. What mechanical power is it producing?",
        diagram: { kind: "formula", latexish: "P = \\tau \\cdot 2\\pi N / 60", legend: { P: "power (W)", "τ": "torque (N·m)", N: "speed (RPM)" } },
        options: ["About 3.1 W", "About 30 W", "About 0.2 W", "About 188 W"],
        answerIndex: 0,
        explanation: "ω = 2π × 150 / 60 ≈ 15.7 rad/s, so P = 0.2 × 15.7 ≈ 3.1 W. 30 W comes from multiplying torque by RPM directly, forgetting to convert to rad/s; 188 W forgets to divide by 60.",
        difficulty: 2,
      },
      {
        type: "predict-movement",
        prompt: "A two-wheel robot's left motor wires were accidentally swapped at the driver terminals. The code drives both motors 'forward' at the same speed. What does the robot do?",
        options: [
          "Drives straight forward",
          "Drives straight backward",
          "Spins in place",
          "Does not move at all",
        ],
        answerIndex: 2,
        explanation: "Swapping the wires reverses only the left motor, so the right wheel goes forward while the left wheel goes backward at the same speed: the robot rotates on the spot. It would only drive straight (backwards) if both motors were swapped.",
        difficulty: 1,
      },
      {
        type: "identify-component",
        prompt: "Which component is placed across a motor switch path to give the coil current a safe path when the switch turns off, preventing a destructive voltage spike?",
        options: ["A potentiometer", "A voltage regulator", "A pull-up resistor", "A flyback (freewheeling) diode"],
        answerIndex: 3,
        explanation: "A flyback diode conducts the inductive current when the transistor switches off, clamping the spike. A regulator stabilises supply voltage and a pull-up sets a default logic level; neither handles inductive kickback.",
        difficulty: 2,
      },
    ],
  }),

  defineTopic("line", 20, {
    slug: "dc-geared-motors",
    title: "DC Geared Motors",
    minutes: 12,
    summary: "TT, BO and N20 gearmotors: how gearboxes trade speed for torque and how to pick a ratio for a line follower.",
    introduction:
      "Bare DC motors spin thousands of times per minute with very little torque, which is useless for driving wheels directly. Gearmotors add a gearbox that slows the output and multiplies torque. Choosing the right gearmotor and ratio has a bigger effect on your line follower's lap time than almost any code change.",
    beginner:
      "Imagine you are on a bicycle with gears. In a low gear the pedals turn easily, you can climb hills, but you move slowly. In a high gear you go fast on flat roads but it is hard to start. Your legs produce the same effort either way; the gears decide how that effort is split between speed and pushing force.\n\nA geared motor is a small fast motor with a set of gears bolted to its front. The gears always slow the shaft down and make it stronger by about the same factor. A 1:48 gearbox makes the output turn 48 times slower than the motor and, apart from friction losses, nearly 48 times stronger.\n\nSchool robots mostly use three families. The yellow TT motor is cheap, with plastic gears and a double-sided output shaft. BO motors are similar plastic gearmotors in straight or L-shaped bodies. N20 motors are tiny metal gearmotors, about the size of a thumb tip, sold in many gear ratios. For line followers, the gear ratio decides how fast the robot can go and how quickly it can respond in sharp turns.",
    technical: [
      {
        heading: "Gearbox equations",
        body:
          "For a gear ratio G (written 1:G or G:1):\n\n- Output speed: N_out = N_motor / G\n- Output torque: τ_out ≈ τ_motor × G × η, where η is gearbox efficiency (less than 1; plastic multi-stage gearboxes lose noticeably more than a single pair of gears).\n\nExample: a motor shaft spinning at 10 000 RPM through a 30:1 gearbox gives about 333 RPM at the output; through 100:1 it gives 100 RPM but with over three times the torque.",
      },
      {
        heading: "From RPM to robot speed",
        body:
          "Linear speed of the robot: v = π × D × N / 60, where D is wheel diameter in metres and N is wheel RPM.\n\nExample: 65 mm wheels at 200 RPM: v = π × 0.065 × 200 / 60 ≈ 0.68 m/s. The same motor on 32 mm wheels gives only about 0.34 m/s but needs half the torque to accelerate the robot. Wheel size and gear ratio are therefore two ways to set the same thing: the effective gearing between motor and floor.",
      },
      {
        heading: "Common families compared",
        body:
          "- TT motor: plastic gearbox, commonly 1:48, typically run on 3–6 V. Cheap and robust enough for beginners, but gear backlash and unit-to-unit variation are noticeable.\n- BO motor: plastic gears, straight or L-shaped body, similar class to TT, often used with 'BO wheels'.\n- N20 (micro metal gearmotor): 12 mm × 10 mm gearbox cross-section, metal gears, many ratios (for example 10:1 up to several hundred to one), available in different voltage windings and often with encoder versions. Light, precise and popular for competitive line followers.\n\nNo two motors are identical. Even in the same batch, one may run several percent faster than the other at the same PWM, which makes a robot drift; closed-loop line following corrects this automatically, but open-loop moves (like a timed turn) do not.",
      },
    ],
    workingPrinciple:
      "A small gear on the motor shaft drives a larger gear, which turns more slowly with more torque; several stages are stacked to reach the final ratio. Speed is divided by the ratio and torque multiplied by it (minus friction losses), so a high-speed, low-torque motor becomes a low-speed, high-torque drive suitable for wheels.",
    diagrams: [
      {
        kind: "formula",
        latexish: "v = \\frac{\\pi D N}{60}, \\quad N = \\frac{N_{motor}}{G}",
        legend: { v: "robot speed (m/s)", D: "wheel diameter (m)", N: "wheel speed (RPM)", G: "gear ratio" },
      },
      {
        kind: "flow",
        steps: [
          "Decide target top speed (e.g. 1 m/s)",
          "Pick wheel diameter that fits the chassis",
          "Required wheel RPM = 60 × v / (π × D)",
          "Choose motor + gear ratio whose loaded RPM is slightly above that",
          "Check torque is enough to accelerate the robot's mass",
        ],
      },
    ],
    examples: [
      {
        title: "Choosing a gear ratio for 1 m/s",
        body: "Target 1.0 m/s with 34 mm wheels: N = 60 × 1.0 / (π × 0.034) ≈ 562 RPM. Gearmotors slow down under load, so pick a ratio whose rated no-load speed is comfortably above this (for example about 700–800 RPM), then limit top speed with PWM while tuning.",
      },
      {
        title: "Trimming mismatched motors for open-loop moves",
        body: "If the robot curves when both motors get the same PWM, add a small trim to the faster side. This matters for timed actions such as a blind 90° turn; during PID line following the controller corrects the mismatch itself.",
        code: `const int ENA = 5;
const int ENB = 6;
int leftTrim = 0;
int rightTrim = -8;   // right motor measured slightly faster

void setSpeeds(int left, int right) {
  analogWrite(ENA, constrain(left + leftTrim, 0, 255));
  analogWrite(ENB, constrain(right + rightTrim, 0, 255));
}

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);
  setSpeeds(150, 150);   // direction pins set elsewhere
}

void loop() {}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Choosing the fastest gear ratio available for a beginner robot.",
        why: "High speed with low torque makes the robot slow to accelerate and overshoot every curve before the controller can react.",
        fix: "Start with a moderate ratio, tune PID, then move to faster gearing once the robot is stable.",
      },
      {
        mistake: "Running 6 V-class TT or BO motors directly on a fully charged 3S pack.",
        why: "Much higher voltage than the motor is meant for increases speed, current and heat, wearing plastic gears and brushes quickly.",
        fix: "Match battery and motor voltage class, or limit the average voltage with PWM.",
      },
      {
        mistake: "Ignoring gear backlash in plastic gearboxes.",
        why: "Backlash lets the wheel move slightly before the motor engages, adding delay and wobble to fine corrections.",
        fix: "Use metal-gear N20 motors for precise robots, and avoid rapid tiny direction changes.",
      },
    ],
    keyTakeaways: [
      "Gearboxes divide speed and multiply torque by the gear ratio (minus losses).",
      "Robot speed v = πDN/60; wheel diameter and gear ratio together set effective gearing.",
      "TT and BO motors are cheap plastic-gear motors; N20s are small metal-gear motors in many ratios.",
      "Motors of the same model are never perfectly matched.",
      "Choose gearing to suit your control ability, not just maximum speed.",
    ],
    relatedComponents: ["TT Yellow Gear Motor", "BO Gear Motor", "N20 Micro Metal Gear Motor", "L298N", "TB6612FNG"],
    youtubeSearch: "N20 vs TT gear motor comparison gear ratio line follower",
    quiz: [
      {
        type: "calculate",
        prompt: "A line follower has 65 mm diameter wheels turning at 200 RPM. What is its approximate forward speed?",
        options: ["About 0.34 m/s", "About 0.68 m/s", "About 1.36 m/s", "About 13 m/s"],
        answerIndex: 1,
        explanation: "v = π × 0.065 × 200 / 60 ≈ 0.68 m/s. 0.34 m/s uses the radius instead of the diameter in πD; 1.36 m/s doubles it by using 2πD.",
        difficulty: 2,
      },
      {
        type: "predict-movement",
        prompt: "By mistake, the left wheel has an N20 motor with a 100:1 gearbox and the right wheel one with 30:1 (same motor type and voltage). Both get the same forward PWM. How does the robot move?",
        options: [
          "Straight, because the PWM is equal",
          "Curves to the right",
          "Curves to the left",
          "Spins in place",
        ],
        answerIndex: 2,
        explanation: "The 100:1 left wheel turns more than three times slower than the 30:1 right wheel. With the right wheel faster, the robot curves towards the slower left side. Equal PWM gives equal motor voltage, not equal wheel speed, when the gearboxes differ.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "You replace a 30:1 gearbox with a 100:1 gearbox on the same motor. Which change do you expect?",
        options: [
          "Higher top speed and less torque",
          "Lower top speed and more torque",
          "Same speed, more torque",
          "Same torque, lower current at all times",
        ],
        answerIndex: 1,
        explanation: "A higher ratio divides output speed by a larger number and multiplies torque by a larger number. Speed cannot stay the same: the output speed is the motor speed divided by the ratio.",
        difficulty: 1,
      },
      {
        type: "identify-component",
        prompt: "Which motor is a small metal gearmotor with a gearbox about 12 mm × 10 mm in cross-section, sold in many gear ratios and often with an encoder?",
        options: ["TT gear motor", "BO motor", "N20 micro metal gearmotor", "SG90 servo"],
        answerIndex: 2,
        explanation: "The N20 (micro metal gearmotor) has a 12 × 10 mm gearbox with metal gears and many ratio options. TT and BO motors are larger with plastic gears. An SG90 is a hobby servo designed for position control, not continuous drive.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("line", 21, {
    slug: "h-bridge",
    title: "H-Bridge",
    minutes: 13,
    summary: "How four switches let a single supply drive a motor forwards, backwards, brake or coast — and the one combination that destroys it.",
    introduction:
      "A microcontroller pin can supply only a few milliamps and only in one polarity. To run a motor in both directions with real current you need an H-bridge. Every motor driver you will use — L298N, TB6612FNG, DRV8833 — contains one or two H-bridges, so understanding the four-switch idea makes all of them easy to read.",
    beginner:
      "Draw the letter H. Put the motor in the middle bar. Each of the four arms of the H is a switch: two at the top connect to the battery's positive side, and two at the bottom connect to ground.\n\nIf you close the top-left and bottom-right switches, current flows from the battery, through the motor from left to right, and down to ground: the motor spins one way. Close top-right and bottom-left instead, and current flows through the motor from right to left: it spins the other way. Open all four switches and the motor just rolls freely, like a bicycle when you stop pedalling. Close both bottom switches and the motor's two wires are joined together, which makes it brake quickly.\n\nThere is one forbidden move. If you close the top and bottom switch on the same side, you connect the battery's positive directly to ground with nothing in between. That is a short circuit, called shoot-through, and it can destroy the switches or the battery wiring in an instant. A good driver chip is designed so this cannot happen when you use its inputs correctly. In real drivers the 'switches' are transistors, controlled by your Arduino's pins.",
    technical: [
      {
        heading: "Switch states",
        body:
          "Label the switches S1 (high-left), S2 (low-left), S3 (high-right), S4 (low-right), with the motor between the left node A and right node B.\n\n- S1 + S4 on: A = V+, B = GND → current A→B, motor 'forward'.\n- S3 + S2 on: A = GND, B = V+ → current B→A, motor 'reverse'.\n- S2 + S4 on (or S1 + S3): both terminals at the same potential → the motor's back-EMF drives current through the short, producing braking torque ('brake' / 'short brake').\n- All off: no driven current → coast; the motor freewheels.\n- S1 + S2 or S3 + S4: shoot-through, a direct short across the supply. Never allowed.",
      },
      {
        heading: "Freewheeling diodes and decay modes",
        body:
          "Because the motor is inductive, current keeps flowing for a moment when switches open. Diodes across each switch (separate parts, or the body diodes of MOSFETs) give it a path back to the supply.\n\nWhen you PWM a bridge, what happens during the off-time matters:\n\n- Drive/coast (fast decay): during off-time all switches open; current decays quickly through the diodes, and speed control feels 'loose'.\n- Drive/brake (slow decay): during off-time the low-side switches short the motor; current decays slowly, giving speed that is more proportional to duty cycle and stronger braking.\n\nOn the L298N, PWM on ENA with IN1/IN2 fixed gives drive/coast; on DRV8833 and TB6612FNG the input combinations let you choose.",
      },
      {
        heading: "Bipolar vs MOSFET bridges",
        body:
          "In a bipolar (BJT) bridge such as the L298N, each conducting transistor has a saturation voltage drop, and two are in series with the motor, so the total drop is about 2 V or more at 1 A. That voltage times the current is wasted as heat.\n\nIn a MOSFET bridge such as the TB6612FNG or DRV8833, each switch behaves like a small resistance (R_DS(on), well under an ohm), so the drop is much smaller at the same current. Example: 0.5 Ω total path resistance at 1 A drops 0.5 V instead of about 2 V.",
      },
    ],
    workingPrinciple:
      "By closing diagonally opposite switches, the H-bridge applies the supply across the motor in either polarity, so a single battery can drive it forwards or backwards. Closing both low-side (or both high-side) switches shorts the motor for braking, opening all switches lets it coast, and diodes carry the inductive current whenever switches open.",
    diagrams: [
      {
        kind: "circuit",
        nodes: [
          { id: "vp", label: "V+", x: 1.5, y: 0 },
          { id: "s1", label: "S1 high-left", x: 0, y: 1 },
          { id: "s3", label: "S3 high-right", x: 3, y: 1 },
          { id: "a", label: "Node A", x: 0, y: 2 },
          { id: "m", label: "Motor", x: 1.5, y: 2 },
          { id: "b", label: "Node B", x: 3, y: 2 },
          { id: "s2", label: "S2 low-left", x: 0, y: 3 },
          { id: "s4", label: "S4 low-right", x: 3, y: 3 },
          { id: "gnd", label: "GND", x: 1.5, y: 4 },
        ],
        edges: [
          { from: "vp", to: "s1" },
          { from: "vp", to: "s3" },
          { from: "s1", to: "a" },
          { from: "s3", to: "b" },
          { from: "a", to: "m" },
          { from: "m", to: "b" },
          { from: "a", to: "s2" },
          { from: "b", to: "s4" },
          { from: "s2", to: "gnd" },
          { from: "s4", to: "gnd" },
        ],
      },
      {
        kind: "flow",
        steps: [
          "S1+S4 on → forward",
          "S3+S2 on → reverse",
          "S2+S4 on → brake",
          "All off → coast",
          "S1+S2 or S3+S4 → SHORT (forbidden)",
        ],
      },
    ],
    examples: [
      {
        title: "Forward, reverse, brake and coast on one L298N channel",
        body: "The L298N's IN1/IN2 select which diagonal pair conducts and ENA enables the channel. IN1 = IN2 brakes (both outputs at the same level); ENA LOW lets the motor coast. The driver's internal logic prevents shoot-through for any input combination.",
        code: `const int ENA = 5;
const int IN1 = 4;
const int IN2 = 7;

void forward(int pwm)  { digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  analogWrite(ENA, pwm); }
void reverse(int pwm)  { digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); analogWrite(ENA, pwm); }
void brake()           { digitalWrite(IN1, LOW);  digitalWrite(IN2, LOW);  digitalWrite(ENA, HIGH); }
void coast()           { digitalWrite(ENA, LOW); }

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
}

void loop() {
  forward(180); delay(1000);
  brake();      delay(500);
  reverse(180); delay(1000);
  coast();      delay(500);
}`,
      },
      {
        title: "Brake vs coast stopping distance test",
        body: "Run the robot at a fixed PWM along a ruler, call brake() at a marked point, and measure where it stops. Repeat with coast(). Braking typically stops the robot in a much shorter distance, which is useful before a sharp corner in a line-following course.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Building a discrete H-bridge where one signal can turn on both switches on the same side.",
        why: "That creates shoot-through, a direct short across the battery, which can destroy transistors instantly.",
        fix: "Use a driver IC with built-in protection logic, or add interlock logic and dead time in a discrete design.",
      },
      {
        mistake: "Using direction reversal at full speed as a 'brake'.",
        why: "Back-EMF plus supply voltage can make the current far larger than the stall current, stressing the driver and battery.",
        fix: "Use the driver's brake state, then reverse if needed.",
      },
      {
        mistake: "Thinking coast and brake are the same 'stop'.",
        why: "Coast leaves the motor free to spin; brake shorts it and actively resists motion, so stopping distances differ a lot.",
        fix: "Choose deliberately: brake for sharp corners, coast for gentle slowing.",
      },
    ],
    keyTakeaways: [
      "An H-bridge uses four switches to apply the supply across the motor in either direction.",
      "Diagonal pairs give forward or reverse; both low-side switches brake; all off coasts.",
      "Two switches on the same side create shoot-through, a short circuit.",
      "Freewheeling diodes carry inductive current when switches open.",
      "BJT bridges (L298N) waste about 2 V; MOSFET bridges waste much less.",
    ],
    relatedComponents: ["L298N", "TB6612FNG", "DRV8833", "L293D"],
    youtubeSearch: "H-bridge explained motor direction brake coast shoot-through",
    quiz: [
      {
        type: "predict-circuit",
        prompt: "In the H-bridge diagram, switches S1 (high-left) and S4 (low-right) are closed and the others are open. What happens?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "vp", label: "V+", x: 1.5, y: 0 },
            { id: "s1", label: "S1 (closed)", x: 0, y: 1 },
            { id: "s3", label: "S3 (open)", x: 3, y: 1 },
            { id: "m", label: "Motor A—B", x: 1.5, y: 2 },
            { id: "s2", label: "S2 (open)", x: 0, y: 3 },
            { id: "s4", label: "S4 (closed)", x: 3, y: 3 },
            { id: "gnd", label: "GND", x: 1.5, y: 4 },
          ],
          edges: [
            { from: "vp", to: "s1", color: "red" },
            { from: "s1", to: "m", color: "red" },
            { from: "m", to: "s4", color: "red" },
            { from: "s4", to: "gnd", color: "red" },
            { from: "vp", to: "s3" },
            { from: "m", to: "s2" },
          ],
        },
        options: [
          "Short circuit across the supply",
          "Motor brakes",
          "Current flows through the motor from A to B and it spins in one direction",
          "Motor coasts",
        ],
        answerIndex: 2,
        explanation: "S1 connects node A to V+ and S4 connects node B to GND, so current passes through the motor from A to B and it turns. A short would need S1 and S2 (same side) closed together; braking would need both low-side switches.",
        difficulty: 1,
      },
      {
        type: "predict-movement",
        prompt: "Both motors are wired so that IN-high/IN-low = forward. The code sets left: IN1 = HIGH, IN2 = LOW; right: IN3 = LOW, IN4 = HIGH; both enables at the same PWM. Seen from above, what does the robot do?",
        options: [
          "Drives straight forward",
          "Pivots clockwise (turns right on the spot)",
          "Pivots anticlockwise (turns left on the spot)",
          "Stops with both motors braked",
        ],
        answerIndex: 1,
        explanation: "The left wheel goes forward and the right wheel goes backward at equal speed, so the robot rotates clockwise about its centre (a right spin turn). An anticlockwise spin would need left reverse and right forward.",
        difficulty: 2,
      },
      {
        type: "find-wrong-connection",
        prompt: "A student builds a discrete H-bridge. Which control wiring in the diagram is dangerous?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "p1", label: "Arduino D4", x: 0, y: 0 },
            { id: "p3", label: "Arduino D8", x: 1, y: 0 },
            { id: "p2", label: "Arduino D7", x: 3, y: 0 },
            { id: "s1", label: "S1 high-left", x: 0, y: 1 },
            { id: "s2", label: "S2 low-left", x: 0, y: 3 },
            { id: "s3", label: "S3 high-right", x: 3, y: 1 },
            { id: "s4", label: "S4 low-right", x: 3, y: 3 },
          ],
          edges: [
            { from: "p1", to: "s1", label: "gate" },
            { from: "p3", to: "s2", label: "gate" },
            { from: "p2", to: "s3", label: "gate" },
            { from: "p2", to: "s4", label: "gate", wrong: true },
          ],
        },
        options: [
          "D4 drives S1 on its own",
          "D8 drives S2 on its own",
          "D7 drives both S3 and S4, the two switches on the right side",
          "The high-side and low-side switches have separate gate signals on the left",
        ],
        answerIndex: 2,
        explanation: "S3 and S4 form one leg of the bridge. Whenever D7 goes HIGH, both turn on together and V+ is shorted to GND through them (shoot-through) — the wiring itself makes this unavoidable. Giving each switch on the left its own signal is not dangerous by itself; correct designs drive diagonal pairs (S1+S4 or S3+S2) and never both switches of one leg.",
        difficulty: 3,
      },
      {
        type: "mcq",
        prompt: "Why do H-bridges include diodes across each switch?",
        options: [
          "To limit the motor's maximum speed",
          "To give inductive motor current a safe path when switches turn off",
          "To convert AC to DC for the motor",
          "To let the Arduino read the motor current",
        ],
        answerIndex: 1,
        explanation: "When a switch opens, the motor's inductance keeps current flowing; without a path, the voltage spikes and can destroy the transistors. The diodes clamp this. They do not rectify AC here and they do not measure current.",
        difficulty: 1,
      },
    ],
  }),
];
