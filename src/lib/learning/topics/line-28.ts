import { defineTopic } from "../define";
import type { Topic } from "../types";

export const LINE_28: Topic[] = [
  defineTopic("line", 28, {
    slug: "advanced-line-following",
    title: "Advanced Line Following",
    minutes: 15,
    summary: "Speed scheduling, sharp-turn handling, lost-line recovery, inverted lines and sensor placement for competition-level robots.",
    introduction:
      "A tuned PID controller gets you round a gentle track. Competition tracks add 90° corners, acute hairpins, crossings, dashed sections, markers and sometimes inverted (white-on-black) segments. This topic covers the techniques fast robots layer on top of PID: changing speed with the track, recovering from lost lines, detecting special features and placing the sensor bar well.",
    beginner:
      "Think about how a good driver handles a mountain road. On straight sections they speed up. Before a hairpin they brake, turn sharply, then accelerate out. If fog hides the road for a moment, they remember which way it was curving and keep turning that way. They do not use one fixed speed and one fixed steering style for the whole journey.\n\nAn advanced line follower behaves the same way. Its PID controller is the steady hand on the wheel, but around it sits a 'driving brain' that changes the plan: faster on straights, slower when the error is big, a special sharp-turn move when the outer sensors suddenly see the line, and a search routine that turns towards the last known side when the line disappears.\n\nWhere you put the sensors matters too. Sensors far in front of the wheels see turns early, like looking further down the road, but they also swing wildly when the robot rotates. Sensors close to the wheels are calm but see turns late. Good designs find a balance, and good code makes sure every special situation has a plan, instead of hoping PID alone will cope.",
    technical: [
      {
        heading: "Speed scheduling",
        body:
          "Make base speed a function of the error or of recent history:\n\nbase = baseMax − k × |e|, constrained to [baseMin, baseMax]\n\nExample: baseMax = 220, baseMin = 110, k = 0.04, |e| = 2000 → 220 − 80 = 140. On a straight (|e| ≈ 0) the robot runs at 220; in a tight curve it slows automatically, giving PID more time to correct. A more advanced version raises speed only after the error has stayed small for, say, 200 ms, which avoids speeding up on short straights between curves.",
      },
      {
        heading: "Sharp turns, lost line and gaps",
        body:
          "- 90° and acute turns: the line moves sideways faster than PID can follow. Detect when an outermost sensor sees black while the centre loses it, then perform a pivot (one wheel forward, the other backward) towards that side until the centre sensors reacquire the line.\n- Lost line: store which side the line was last seen on (sign of the last error). When all sensors read white, pivot or turn hard towards that side.\n- Gaps (dashed lines): if the line disappears while the last error was near zero, drive straight for a short time before starting a search, because the line most likely continues ahead.\n- Crossings: if all sensors see black briefly, drive straight through and ignore the reading for a short time.",
      },
      {
        heading: "Inverted lines and sensor geometry",
        body:
          "Inverted sections: if most sensors suddenly read black and only one or two read white, the background has changed. Switch to using 1000 − norm for the position calculation (and switch back when the pattern reverses), with hysteresis so it does not flicker.\n\nSensor bar geometry: lateral position error at the sensors grows with the distance d between the sensor bar and the wheel axle when the robot rotates: Δx ≈ d × Δθ. A longer d gives earlier warning of curves (lookahead) but amplifies rotation, making tuning harder. Many fast robots place the bar several centimetres ahead of the axle and keep the robot light so it can rotate quickly.",
      },
    ],
    workingPrinciple:
      "A state machine surrounds the PID controller. In the normal FOLLOW state, PID steers with a speed scheduled from the error. Recognised sensor patterns switch to special states — SHARP_TURN, CROSSING, GAP or SEARCH — each with its own motor behaviour and exit condition, after which the robot returns to FOLLOW.",
    diagrams: [
      {
        kind: "flow",
        steps: [
          "FOLLOW: PID with base = baseMax − k·|e|",
          "Outer sensor black & centre white → SHARP_TURN: pivot towards that side",
          "All white & last error ≈ 0 → GAP: straight for a short time",
          "All white & last error large → SEARCH: pivot towards last seen side",
          "All black → CROSSING: straight briefly, ignore sensors",
          "Line centred again → back to FOLLOW",
        ],
      },
      {
        kind: "formula",
        latexish: "base = constrain(base_{max} - k \\cdot |e|,\\ base_{min},\\ base_{max})",
        legend: { base: "base motor PWM", e: "line error", k: "slowdown factor" },
      },
    ],
    examples: [
      {
        title: "Speed scheduling function",
        body: "Plug this into the PD loop from the PID topic in place of a fixed baseSpeed.",
        code: `int baseMax = 220;
int baseMin = 110;
float slowK = 0.04;

int scheduledBase(int error) {
  int b = baseMax - (int)(slowK * abs(error));
  return constrain(b, baseMin, baseMax);
}

void setup() {
  Serial.begin(9600);
  Serial.println(scheduledBase(0));      // 220
  Serial.println(scheduledBase(2000));   // 140
  Serial.println(scheduledBase(4000));   // 110 (clamped)
}

void loop() {}`,
      },
      {
        title: "Recovery state machine skeleton",
        body: "A simple enum-based state machine. The helper functions are stubs so the sketch compiles; replace them with your sensor and motor code.",
        code: `enum State { FOLLOW, SEARCH, CROSSING };
State state = FOLLOW;
int lastError = 0;
unsigned long stateStart = 0;

bool allWhite() { return analogRead(A0) < 200 && analogRead(A2) < 200 && analogRead(A4) < 200; }
bool allBlack() { return analogRead(A0) > 800 && analogRead(A2) > 800 && analogRead(A4) > 800; }
int lineError() { return analogRead(A4) - analogRead(A0); }
void pivot(int dir) { /* dir > 0: right, dir < 0: left */ }
void followPID(int e) { /* PD steering */ }
void straight() { /* both motors equal */ }

void setup() {}

void loop() {
  switch (state) {
    case FOLLOW:
      if (allBlack()) { state = CROSSING; stateStart = millis(); }
      else if (allWhite()) { state = SEARCH; }
      else { lastError = lineError(); followPID(lastError); }
      break;
    case SEARCH:
      pivot(lastError > 0 ? 1 : -1);
      if (!allWhite()) state = FOLLOW;
      break;
    case CROSSING:
      straight();
      if (millis() - stateStart > 100) state = FOLLOW;
      break;
  }
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Running a fixed high base speed everywhere.",
        why: "Curves need more correction than the motors have headroom for, so the robot leaves the track on the first tight bend.",
        fix: "Schedule base speed from the error so the robot slows in curves and speeds up on straights.",
      },
      {
        mistake: "Treating a dashed line gap as a lost line and pivoting.",
        why: "The robot turns away exactly where the line continues straight ahead.",
        fix: "If the last error was near zero, drive straight for a short time before searching.",
      },
      {
        mistake: "Moving the sensor bar far forward without retuning.",
        why: "Longer lookahead amplifies the effect of rotation on the measured error, effectively increasing the controller gains.",
        fix: "Retune Kp and Kd after any change to sensor position.",
      },
    ],
    keyTakeaways: [
      "Wrap PID in a state machine that handles sharp turns, gaps, crossings and lost lines.",
      "Speed scheduling (slower when |error| is large) lets you raise top speed safely.",
      "Remember the last seen side of the line for recovery.",
      "Detect inverted sections and flip the normalised readings, with hysteresis.",
      "Sensor bar distance from the axle trades early warning for stability.",
    ],
    relatedComponents: ["QTR-8A", "QTR-8RC", "TB6612FNG", "N20 Micro Metal Gear Motor", "Arduino Nano"],
    youtubeSearch: "advanced line follower sharp turn detection speed control state machine",
    quiz: [
      {
        type: "predict-movement",
        prompt: "On a hairpin, all sensors suddenly read white. The last error before that was +2800 (line far to the right), and the recovery code steers towards the last seen side. What does the robot do?",
        options: [
          "Pivots to the right until a sensor finds the line again",
          "Pivots to the left",
          "Drives straight ahead to look for a gap",
          "Stops and waits for the line",
        ],
        answerIndex: 0,
        explanation: "A large positive last error means the line left the sensors on the right side, so recovery pivots right. Driving straight is the right response only when the last error was near zero (a likely gap), not after a large error.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "What is the main purpose of reducing base speed when the absolute error is large?",
        options: [
          "To save battery on straights",
          "To make the sensors read more accurately",
          "To make the derivative term larger",
          "To leave motor headroom and reaction time for tight curves",
        ],
        answerIndex: 3,
        explanation: "With a lower base, the controller has room to add and subtract a large correction without hitting 0 or 255, and the robot covers less distance while correcting. Speed does not change sensor accuracy, and it saves no battery on straights, where the robot runs faster.",
        difficulty: 2,
      },
      {
        type: "identify-driver",
        prompt: "A competitive line follower uses N20 motors on a 2S LiPo (8.4 V full) with around 1 A peaks per motor, and needs minimal voltage loss and weight. Which of these drivers is the best fit?",
        options: ["L298N", "L293D", "TB6612FNG", "5 V relay module"],
        answerIndex: 2,
        explanation: "The TB6612FNG is a small MOSFET driver whose motor supply range covers 2S and whose per-channel rating suits N20 motors, with low voltage drop. The L298N and L293D are bipolar drivers that lose a lot of voltage, and a relay module cannot do fast PWM.",
        difficulty: 2,
      },
      {
        type: "debug-code",
        prompt: "When the line is lost, this robot always spins left, even when the line left on the right side. What is the bug?",
        code: `int lastSide = -1;   // -1 = left, +1 = right

bool lineVisible() { return analogRead(A0) > 300 || analogRead(A2) > 300; }
int lineError() { return analogRead(A2) - analogRead(A0); }
void spin(int dir) { /* motor code */ }
void steer(int e) { /* PID code */ }

void setup() {}

void loop() {
  if (lineVisible()) {
    int e = lineError();
    steer(e);
  } else {
    spin(lastSide);
  }
}`,
        options: [
          "lastSide is never updated from the error while the line is visible",
          "lineVisible() should use && instead of ||",
          "spin() must be called in setup()",
          "lastSide must be declared as float",
        ],
        answerIndex: 0,
        explanation: "lastSide starts at −1 and nothing changes it, so recovery always spins left. Add 'lastSide = (e > 0) ? 1 : -1;' while the line is visible. Using && would mean the line is only 'visible' when both sensors see it, which makes things worse, not better.",
        difficulty: 2,
      },
    ],
  }),

  defineTopic("line", 29, {
    slug: "debugging",
    title: "Debugging",
    minutes: 13,
    summary: "A systematic method for finding faults in wiring, power, sensors, drivers and code instead of guessing.",
    introduction:
      "Every robot misbehaves. The difference between teams that fix problems in ten minutes and teams that give up is method. This topic gives you a repeatable debugging process, the measurements to take with a multimeter and the Serial Monitor, and a list of the classic Arduino and wiring bugs that catch almost every beginner.",
    beginner:
      "Debugging is detective work. A detective does not arrest the first person they see; they gather clues, form a theory, test it, and only then decide. When your robot spins in circles, do not immediately rewrite all your code. Ask: is it the sensors, the code, the driver, the motors or the power?\n\nThe most powerful trick is divide and conquer. Test each part on its own. Run a tiny sketch that only prints sensor values: do they change over black and white? Run another that only spins each motor forward and backward: does each wheel go the right way? Measure the battery with a multimeter: is it charged? Once each part works alone, put them together one at a time. When something breaks, you know the last thing you added is involved.\n\nAlso, change only one thing at a time, and write down what you changed. If you change three things and the robot works, you do not know which one fixed it. If it gets worse, you do not know which one broke it. A notebook, the Serial Monitor and a multimeter are a robot builder's magnifying glass.",
    technical: [
      {
        heading: "The process",
        body:
          "1. Reproduce: make the fault happen reliably and describe it precisely ('left wheel stutters only above PWM 200 on battery, not on USB').\n2. Isolate: test subsystems separately with minimal sketches.\n3. Measure: use numbers, not impressions — multimeter voltages, Serial prints, LED indicators.\n4. Hypothesise and test one change at a time.\n5. Fix and confirm the fault is gone, then re-test that nothing else broke.",
      },
      {
        heading: "Hardware checks with a multimeter",
        body:
          "- Battery voltage at rest and under load (a 2S Li-ion should be roughly 7–8.4 V; a large drop when motors start indicates a weak pack or thin wires).\n- 5 V rail at the Arduino: should stay close to 5 V when motors start; dips suggest brownout.\n- Continuity of every ground connection: Arduino, driver, sensors and battery must share GND.\n- Driver outputs: with IN1 HIGH, IN2 LOW and enable on, OUT1–OUT2 should show close to battery voltage minus the driver drop; with IN1 = IN2 the voltage across the motor should be about 0 V (brake).\n- Sensor output: measure AO over black and white to confirm contrast independently of code.",
      },
      {
        heading: "Classic software bugs",
        body:
          "- if (x = HIGH) assigns instead of compares; it is always true. Use ==.\n- int overflow on the Uno: values above 32 767 wrap. Use long for products like error × 1000.\n- Integer division: 5 / 2 is 2. Use 5.0 / 2 for 2.5.\n- analogWrite on non-PWM pins (only 3, 5, 6, 9, 10, 11 on the Uno) gives just on/off.\n- Using pins 0 and 1 for sensors while using Serial: they are the USB serial RX/TX lines.\n- Floating inputs: an unconnected input reads random values; use INPUT_PULLUP or external resistors.\n- delay() inside the control loop: the robot is blind while it waits.\n- Variables that must persist (lastError) declared inside loop().",
      },
    ],
    workingPrinciple:
      "Debugging works by narrowing the search space: you split the system into subsystems with known expected behaviour, measure each against that expectation, and focus on the first place where measured and expected behaviour differ. Changing one variable at a time keeps cause and effect clear.",
    diagrams: [
      {
        kind: "flow",
        steps: [
          "Describe the fault precisely and reproduce it",
          "Check power: battery voltage, 5 V rail, common ground",
          "Test sensors alone: print raw values over black/white",
          "Test motors alone: each wheel forward/reverse at fixed PWM",
          "Combine step by step; the last added part is the suspect",
          "Change one thing, re-test, write it down",
        ],
      },
      { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D0", "D1", "D3", "D5", "D6", "D9", "D10", "D11"] },
    ],
    examples: [
      {
        title: "Subsystem test sketch: motors",
        body: "Upload this with the wheels off the ground. Each motor should run forward then backward in turn. If a wheel goes the wrong way, swap that motor's two wires; if one never moves, check its OUT terminals with a multimeter.",
        code: `const int ENA = 5, IN1 = 4, IN2 = 7, ENB = 6, IN3 = 8, IN4 = 12;

void run(int en, int a, int b, bool fwd) {
  digitalWrite(a, fwd ? HIGH : LOW);
  digitalWrite(b, fwd ? LOW : HIGH);
  analogWrite(en, 160);
  delay(1000);
  analogWrite(en, 0);
  delay(500);
}

void setup() {
  Serial.begin(9600);
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Serial.println("BOOT");
}

void loop() {
  Serial.println("Left forward");   run(ENA, IN1, IN2, true);
  Serial.println("Left reverse");   run(ENA, IN1, IN2, false);
  Serial.println("Right forward");  run(ENB, IN3, IN4, true);
  Serial.println("Right reverse");  run(ENB, IN3, IN4, false);
}`,
      },
      {
        title: "Compact telemetry line",
        body: "Print several values on one line separated by commas so the Serial Plotter can graph them. Use a high baud rate and print only every few loops to avoid slowing the control loop.",
        code: `int counter = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  int s0 = analogRead(A0);
  int s1 = analogRead(A1);
  int error = s1 - s0;
  counter++;
  if (counter >= 10) {
    counter = 0;
    Serial.print(s0); Serial.print(",");
    Serial.print(s1); Serial.print(",");
    Serial.println(error);
  }
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Changing code, wiring and PID gains all at once.",
        why: "If behaviour changes you cannot tell which change caused it.",
        fix: "Change one thing at a time and keep a written log.",
      },
      {
        mistake: "Assuming the code is wrong when the battery is flat.",
        why: "Low voltage causes weak motors, resets and shifted sensor readings that look like software bugs.",
        fix: "Measure battery voltage first, every time.",
      },
      {
        mistake: "Debugging with the robot on the floor at full speed.",
        why: "Faults happen too fast to observe and crashes can damage the robot.",
        fix: "Test with wheels lifted, at low PWM, with Serial output, then progress to the track.",
      },
    ],
    keyTakeaways: [
      "Reproduce, isolate, measure, change one thing, confirm.",
      "Check power and common ground before suspecting code.",
      "Test sensors and motors with minimal standalone sketches.",
      "Know the classic Arduino bugs: = vs ==, int overflow, integer division, non-PWM pins, pins 0/1 with Serial.",
      "Log changes and results so progress is repeatable.",
    ],
    relatedComponents: ["Arduino Uno R3", "Digital Multimeter", "L298N", "TCRT5000"],
    youtubeSearch: "how to debug Arduino robot multimeter serial monitor troubleshooting",
    quiz: [
      {
        type: "debug-code",
        prompt: "The LED on pin 13 is always on, even when the sensor reads LOW. What is the bug?",
        code: `const int SENSOR = 2;
const int LED = 13;

void setup() {
  pinMode(SENSOR, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  int s = digitalRead(SENSOR);
  if (s = HIGH) {
    digitalWrite(LED, HIGH);
  } else {
    digitalWrite(LED, LOW);
  }
}`,
        options: [
          "Pin 13 cannot be used as an output",
          "digitalRead must be called in setup()",
          "SENSOR should be declared as OUTPUT",
          "s = HIGH assigns HIGH to s, so the condition is always true; it should be s == HIGH",
        ],
        answerIndex: 3,
        explanation: "A single = is assignment. The expression s = HIGH stores 1 in s and evaluates to 1 (true), so the if branch always runs. Use == to compare. Pin 13 works fine as an output (it drives the onboard LED).",
        difficulty: 1,
      },
      {
        type: "find-wrong-connection",
        prompt: "The line sensor gives random readings. Which connection explains it?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "usb", label: "Uno (USB powered)", x: 0, y: 1 },
            { id: "sen", label: "Sensor module", x: 2, y: 1 },
            { id: "bat", label: "Motor battery −", x: 3, y: 3 },
            { id: "u5", label: "Uno 5V", x: 0, y: 0 },
            { id: "d2", label: "Uno D2", x: 0, y: 2 },
          ],
          edges: [
            { from: "u5", to: "sen", label: "VCC" },
            { from: "sen", to: "bat", label: "GND", wrong: true },
            { from: "sen", to: "d2", label: "OUT" },
          ],
        },
        options: [
          "Sensor VCC to Uno 5V",
          "Sensor GND to the motor battery negative, with no link to Uno GND",
          "Sensor OUT to Uno D2",
          "Powering the Uno from USB during testing",
        ],
        answerIndex: 1,
        explanation: "Without a ground connection to the Uno, the sensor's supply and output have no common reference with the Arduino, so readings are meaningless. Connect sensor GND to Uno GND (and the motor battery − too, so all grounds are common). The VCC and OUT wiring and USB power are fine.",
        difficulty: 2,
      },
      {
        type: "predict-circuit",
        prompt: "On an L298N, ENA is HIGH and both IN1 and IN2 are HIGH. You measure the voltage between OUT1 and OUT2 with the motor connected. What do you expect?",
        options: [
          "About 0 V — both outputs are at the same level, so the motor is braked",
          "Full battery voltage",
          "Battery voltage minus about 2 V",
          "The negative of the battery voltage",
        ],
        answerIndex: 0,
        explanation: "With IN1 = IN2, both outputs are driven to the same level, so there is no voltage across the motor and it is held in brake. 'Battery minus about 2 V' is what you would see with IN1 and IN2 different (driving).",
        difficulty: 2,
      },
      {
        type: "identify-pin",
        prompt: "You need a pin that produces real PWM with analogWrite() on an Arduino Uno. Which one?",
        diagram: { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D2", "D4", "D7", "D9"] },
        options: ["D2", "D4", "D9", "D7"],
        answerIndex: 2,
        explanation: "The Uno's PWM pins are 3, 5, 6, 9, 10 and 11 (marked with ~). D9 is one of them. D2, D4 and D7 are digital-only, so analogWrite there only gives fully LOW or fully HIGH.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("line", 30, {
    slug: "performance-optimisation",
    title: "Performance Optimisation",
    minutes: 14,
    summary: "Making a working line follower faster: loop timing, voltage compensation, drivetrain, weight and grip.",
    introduction:
      "Once your robot completes the course reliably, the goal becomes lap time. Optimisation is about finding the bottleneck — the one factor currently limiting speed — and improving it, then finding the next. This topic covers the software side (fast, consistent loops), the electrical side (stable motor voltage) and the mechanical side (weight, grip, gearing).",
    beginner:
      "Imagine trying to run faster in a race. Buying expensive shoes will not help if you are carrying a heavy backpack, and dropping the backpack will not help if you are running with your eyes closed half the time. You need to find what is slowing you down most, fix that, then look again.\n\nA line follower has the same kinds of bottlenecks. Its 'eyes closed' problem is a slow control loop: if the Arduino spends lots of time printing messages or waiting in delay(), the robot drives blind between checks. Its 'heavy backpack' problem is extra weight, which makes accelerating and turning sluggish. Its 'wrong shoes' problem is wheels that slip or gears that are too slow or too fast.\n\nThere is also a sneaky problem: battery voltage. A fully charged pack makes the motors faster than a half-empty one, so the PID settings you tuned at the start of the day stop working later. Smart robots measure the battery and adjust their PWM so that the motors behave the same throughout. Optimising is a loop of measuring, improving one thing, and measuring again.",
    technical: [
      {
        heading: "Loop time budget",
        body:
          "The distance travelled 'blind' between control updates is d = v × T_loop. At 1.5 m/s with a 10 ms loop, the robot moves 15 mm between decisions — about the width of the line. Aim for a loop of a few milliseconds or less.\n\nWhere the time goes on an Uno:\n- analogRead(): roughly 0.1 ms each at the default ADC clock, so eight sensors take under 1 ms.\n- Serial: at 9600 baud each character takes about 1 ms; at 115200 baud about 0.09 ms. Printing 20 characters every loop at 9600 baud adds about 20 ms once the 64-byte transmit buffer fills.\n- delay(): blocks completely. Never use it inside the control loop.\n\nMeasure your loop: record micros() at the start and end, and print the average occasionally.",
      },
      {
        heading: "Voltage compensation and arithmetic",
        body:
          "Motor speed is roughly proportional to the average voltage across it, which is duty × V_battery (minus driver drop). As the battery discharges from 8.4 V to about 7 V, the same PWM gives noticeably less speed. Compensate:\n\npwm_out = pwm_cmd × V_nominal / V_battery\n\nExample: pwm_cmd = 180, V_nominal = 7.4 V, V_battery = 8.2 V → pwm_out ≈ 162.\n\nOn an 8-bit AVR, float maths is done in software and is slower than integer maths. It is usually fast enough for a PD controller, but if the loop is tight, use scaled integers (long) — and beware of 16-bit int overflow when multiplying.",
      },
      {
        heading: "Mechanical and electrical upgrades",
        body:
          "- Weight: lighter robots accelerate and turn faster with the same motors (F = m × a). Remove unnecessary brackets, use a smaller battery if runtime allows.\n- Grip: soft silicone or urethane tyres reduce slip in corners; clean them before each run.\n- Gearing: choose a ratio so the robot reaches its usable top speed on the longest straight without being too slow to accelerate.\n- Driver: replacing an L298N with a MOSFET driver recovers roughly 2 V for the motors at 1 A.\n- Centre of mass: low and between the wheels for stability; a small rear caster or skid that does not catch.\n- Sensor bar: rigid, at a consistent height, and at a lookahead distance that matches your speed.",
      },
    ],
    workingPrinciple:
      "Overall performance is limited by the slowest element in the chain: sensing, computing, actuating and the mechanics. Faster, more consistent control loops reduce the distance travelled between corrections; stable motor voltage keeps tuning valid; lighter, grippier, well-geared mechanics let the robot follow the commands it is given.",
    diagrams: [
      {
        kind: "formula",
        latexish: "d_{blind} = v \\cdot T_{loop}, \\quad pwm_{out} = pwm_{cmd} \\cdot \\frac{V_{nom}}{V_{bat}}",
        legend: { d_blind: "distance travelled between updates", v: "robot speed", T_loop: "control loop period", V_nom: "voltage the gains were tuned at", V_bat: "measured battery voltage" },
      },
      {
        kind: "flow",
        steps: [
          "Measure lap time and loop time",
          "Find the bottleneck (blind distance, wheel slip, voltage sag, overshoot)",
          "Improve only that one thing",
          "Re-tune PID if mechanics or speed changed",
          "Measure again and log the result",
        ],
      },
    ],
    examples: [
      {
        title: "Measuring loop time",
        body: "Accumulates the duration of 100 loops with micros() and prints the average, so printing does not distort what is being measured.",
        code: `unsigned long total = 0;
int samples = 0;

void controlStep() {
  for (int i = 0; i < 6; i++) {
    analogRead(A0 + i);
  }
}

void setup() {
  Serial.begin(115200);
}

void loop() {
  unsigned long t0 = micros();
  controlStep();
  total += micros() - t0;
  samples++;
  if (samples == 100) {
    Serial.print("Average loop us: ");
    Serial.println(total / 100);
    total = 0;
    samples = 0;
  }
}`,
      },
      {
        title: "Battery voltage compensation",
        body: "Reads the pack through a 10 kΩ/10 kΩ divider on A5 and scales the commanded PWM so the motors see roughly the same average voltage as when the robot was tuned at 7.4 V.",
        code: `const float V_NOMINAL = 7.4;

float batteryVolts() {
  return analogRead(A5) * 5.0 / 1023.0 * 2.0;
}

int compensate(int pwmCmd) {
  float v = batteryVolts();
  if (v < 5.0) return pwmCmd;   // reading invalid: do not scale
  int out = (int)(pwmCmd * V_NOMINAL / v);
  return constrain(out, 0, 255);
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.println(compensate(180));
  delay(500);
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Printing every sensor value every loop at 9600 baud during runs.",
        why: "Each character takes about 1 ms at 9600 baud; once the buffer fills, the loop slows to tens of milliseconds and the robot drives blind.",
        fix: "Print rarely, use 115200 baud, or disable debug output for competition runs.",
      },
      {
        mistake: "Raising speed without retuning after hardware changes.",
        why: "New wheels, gears, drivers or sensor position change the dynamics, so old gains no longer fit.",
        fix: "Retune Kp/Kd after every mechanical or electrical change.",
      },
      {
        mistake: "Optimising the wrong thing.",
        why: "Shaving microseconds off code is pointless if the wheels are slipping or the battery is sagging.",
        fix: "Measure first to find the real bottleneck.",
      },
    ],
    keyTakeaways: [
      "Blind distance = speed × loop time; keep loops short and consistent.",
      "Avoid delay() and heavy Serial output in the control loop.",
      "Compensate PWM for battery voltage so tuning stays valid.",
      "Weight, grip, gearing and driver drop often matter more than code.",
      "Find the bottleneck, fix one thing, measure again.",
    ],
    relatedComponents: ["TB6612FNG", "DRV8833", "N20 Micro Metal Gear Motor", "QTR-8A", "LiPo 2S Battery"],
    youtubeSearch: "fast line follower robot optimization tips loop time weight tyres",
    quiz: [
      {
        type: "identify-driver",
        prompt: "At about 1 A per motor, which of these drivers wastes the most battery voltage as heat?",
        options: ["TB6612FNG", "L298N", "DRV8833"],
        answerIndex: 1,
        explanation: "The L298N's bipolar output stage drops around 2 V at 1 A. The TB6612FNG and DRV8833 use MOSFETs with low on-resistance, dropping only a fraction of a volt at the same current.",
        difficulty: 1,
      },
      {
        type: "calculate",
        prompt: "A line follower moves at 1.5 m/s and its control loop takes 10 ms. How far does it travel between two sensor updates?",
        options: ["15 mm", "1.5 mm", "150 mm", "0.15 mm"],
        answerIndex: 0,
        explanation: "d = v × T = 1.5 m/s × 0.010 s = 0.015 m = 15 mm. 150 mm comes from using 0.1 s instead of 0.01 s.",
        difficulty: 1,
      },
      {
        type: "code-output",
        prompt: "What does this print on an Arduino Uno (16-bit int)?",
        code: `void setup() {
  Serial.begin(9600);
  int v = 1500;    // speed in mm/s
  int dt = 25;     // loop time in ms
  int travel = v * dt / 1000;
  Serial.println(travel);
}

void loop() {}`,
        options: ["37", "37.5", "-28", "-29"],
        answerIndex: 2,
        explanation: "v * dt = 37 500, which does not fit in a 16-bit int (max 32 767). On the Uno it wraps to 37 500 − 65 536 = −28 036, and −28 036 / 1000 truncates towards zero to −28. (Strictly, signed overflow is undefined behaviour in C++, another reason to avoid it.) Writing (long)v * dt / 1000 gives the intended 37; 37.5 is impossible for an int.",
        difficulty: 3,
      },
      {
        type: "predict-circuit",
        prompt: "A robot with a TB6612FNG is moved from a 1S pack (3.7 V) to a 2S pack (7.4 V) without changing the code (same PWM values). With the wheels lifted, what happens to wheel speed?",
        options: [
          "It stays the same because PWM is unchanged",
          "It halves",
          "It becomes unpredictable because PWM no longer works",
          "It roughly doubles, because the average motor voltage doubles",
        ],
        answerIndex: 3,
        explanation: "Average motor voltage ≈ duty × supply voltage. Doubling the supply at the same duty doubles the average voltage, and no-load speed of a DC motor is roughly proportional to voltage. PWM duty sets a fraction of the supply, not a fixed voltage, so speed does not stay the same.",
        difficulty: 2,
      },
    ],
  }),
];
