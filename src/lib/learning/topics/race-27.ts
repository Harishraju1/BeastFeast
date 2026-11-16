import { defineTopic } from "../define";
import type { Topic } from "../types";

export const RACE_27: Topic[] = [
  // ---------------------------------------------------------------- 27
  defineTopic("race", 27, {
    slug: "optimisation",
    title: "Optimisation",
    minutes: 15,
    summary: "Squeezing out lap time: mass, gearing, driver efficiency, control-loop speed, battery-voltage compensation and data-driven tuning.",
    introduction:
      "Once your robot finishes laps reliably, the race becomes a game of small gains. A few grams here, a faster control loop there, a better driver chip, a smarter speed profile: each might save a tenth of a second, and together they win competitions.\n\nThis topic shows where lap time actually comes from, how to measure and remove bottlenecks in hardware and software, and how to keep performance consistent as the battery drains.",
    beginner:
      "Imagine preparing a bicycle for a race. You pump up the tyres, oil the chain, take off the heavy basket, pick the right gear and practise the corners. None of these alone makes you a champion, but together they make a big difference. Optimising a robot is the same: many small improvements added up.\n\nFirst, make it lighter. A lighter robot speeds up, slows down and turns better with the same motors.\n\nSecond, waste less energy. Some motor drivers, like the classic L298N, turn a couple of volts into heat. Modern drivers such as the TB6612FNG waste much less, so more of the battery's power reaches the wheels.\n\nThird, make the brain react faster. If your program pauses with delay() or prints lots of messages, the robot steers late, like a driver who blinks for too long. A fast, steady control loop means quicker, smaller corrections.\n\nFourth, stay consistent. As the battery drains, its voltage drops and the motors slow down, so a robot tuned on a full battery behaves differently at the end of the day. Measuring the battery voltage and adjusting the motor power keeps the robot's behaviour the same.\n\nFinally, always measure before and after each change. An 'improvement' that you cannot measure might actually be making things worse.",
    technical: [
      {
        heading: "Where lap time comes from",
        body:
          "Split the lap into straights (time limited by acceleration, top speed and braking) and corners (limited by v_max = sqrt(mu g R) and controller accuracy). Slow-motion video plus split timing shows which part loses the most time. Optimise the biggest loss first.\n\n- Mass: acceleration a = F/m. Cutting a 600 g robot to 500 g raises acceleration and braking by 20% with the same force.\n- Grip: raising mu raises corner speed by sqrt(mu): +21% grip gives +10% corner speed.\n- Gearing: a lower reduction raises top speed but lowers wheel torque and acceleration; pick the ratio that minimises lap time on the real track, not the one with the highest top speed."
      },
      {
        heading: "Driver efficiency",
        body:
          "The L298N's bipolar outputs drop roughly 2 V at 1 A, so at 1 A per channel about 2 W per channel turns into heat, and a 7.4 V pack delivers only about 5.4 V to the motor. MOSFET drivers such as the TB6612FNG (VM up to 13.5 V, about 1.2 A continuous per channel) and DRV8833 (2.7 to 10.8 V, about 1.5 A RMS per channel) have low on-resistance, so much less voltage is lost. Check the voltage and current ratings against your battery and motors before switching."
      },
      {
        heading: "Control-loop speed",
        body:
          "Typical costs on a 16 MHz Uno: analogRead about 0.1 ms each (8 sensors about 0.9 ms); digitalWrite a few microseconds; float maths tens of microseconds per operation; Serial at 9600 baud about 1 ms per character once the 64-byte buffer is full.\n\nA loop containing delay(50) can only correct steering 20 times per second; at 2 m/s the robot travels 10 cm between corrections. Remove delays, print rarely (or at 115200 baud), and run the controller on a fixed timer of a few milliseconds."
      },
      {
        heading: "Battery voltage compensation",
        body:
          "Motor speed is roughly proportional to the applied voltage. If you tuned at V_tune and the battery now reads V_now, scale PWM: pwm_out = pwm x V_tune / V_now (clamped to 255).\n\nMeasure the battery with a voltage divider into an analog pin. For a 2S pack (max 8.4 V), two equal resistors (e.g. 10 k + 10 k) halve the voltage to at most 4.2 V, safely under 5 V. V_bat = analogRead(A5) x 5.0 / 1023 x 2. Accuracy depends on the Uno's 5 V reference, so calibrate against a multimeter."
      }
    ],
    workingPrinciple:
      "Lap time is the sum of time on each segment, each limited by a physical or computational bottleneck: force-to-mass ratio on straights, grip and radius in corners, and control-loop latency everywhere. Optimisation identifies the biggest bottleneck by measurement, relaxes it (less mass, better grip, efficient driver, faster loop), and then re-measures, because removing one bottleneck exposes the next.",
    diagrams: [
      {
        kind: "formula",
        latexish: "pwm_{out} = \\min\\left(255, \\; pwm \\cdot \\frac{V_{tune}}{V_{now}}\\right)",
        legend: { pwm: "PWM value tuned for this behaviour", "V_{tune}": "battery voltage during tuning", "V_{now}": "measured battery voltage now" }
      },
      { kind: "flow", steps: ["Measure lap with split times and video", "Find the segment losing most time", "Change ONE thing (mass, gear, driver, loop, gains)", "Re-measure over several runs", "Keep it only if the average improves"] },
      { kind: "pinout", componentId: "tb6612fng", highlight: ["VM", "VCC", "STBY", "PWMA", "PWMB"] }
    ],
    examples: [
      {
        title: "Battery-voltage compensated PWM",
        body: "Battery measured through a 10 k / 10 k divider on A5. PWM is scaled so the robot behaves as it did when tuned at 8.0 V.",
        code: `const float V_TUNE = 8.0;

float readBattery() {
  int raw = analogRead(A5);
  return raw * 5.0 / 1023.0 * 2.0; // 1:2 divider
}

int compensate(int pwm) {
  float v = readBattery();
  if (v < 5.0) return pwm;           // reading not plausible, do not scale
  int out = (int)(pwm * V_TUNE / v + 0.5);
  return constrain(out, -255, 255);
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.print("Battery: ");
  Serial.print(readBattery());
  Serial.print(" V, PWM 180 -> ");
  Serial.println(compensate(180));
  delay(500);
}`
      },
      {
        title: "Measuring loop time",
        body: "Before optimising code, measure it. This prints the average loop time over 1000 iterations; aim for a few milliseconds or less.",
        code: `unsigned long t0;
unsigned long n = 0;

void controlStep() {
  for (byte i = 0; i < 8; i++) analogRead(A0 + i % 6);
}

void setup() {
  Serial.begin(115200);
  t0 = micros();
}

void loop() {
  controlStep();
  n++;
  if (n == 1000) {
    Serial.print("us per loop: ");
    Serial.println((micros() - t0) / 1000);
    n = 0;
    t0 = micros();
  }
}`
      }
    ],
    commonMistakes: [
      { mistake: "Optimising the wrong thing.", why: "Without split times you might spend a week on top speed when the lap is lost in corners.", fix: "Measure segment times and fix the biggest loss first." },
      { mistake: "Gearing for maximum top speed on a short, twisty track.", why: "A low reduction gives weak acceleration and the robot never reaches its top speed.", fix: "Choose gearing by lap time on your track." },
      { mistake: "Leaving debug prints and delays in race code.", why: "They slow the control loop, so the robot steers late at speed.", fix: "Use a fixed-rate loop, print rarely, and remove delay() from the race path." },
      { mistake: "Tuning on a full battery and racing on a half-empty one.", why: "Lower voltage means slower motors and different behaviour.", fix: "Use voltage compensation or always race at a known charge level." }
    ],
    keyTakeaways: [
      "Measure split times first; fix the biggest time loss.",
      "Less mass improves acceleration, braking and cornering together.",
      "MOSFET drivers (TB6612FNG, DRV8833) waste far less voltage than the L298N.",
      "A fast, fixed-rate control loop with no delay() steers more accurately.",
      "Compensate PWM for battery voltage to keep behaviour consistent."
    ],
    relatedComponents: ["TB6612FNG", "DRV8833", "L298N", "LiPo 2S Battery", "N20 Micro Metal Gear Motor", "Arduino Nano"],
    youtubeSearch: "line follower robot optimization tips speed lap time",
    quiz: [
      {
        type: "calculate",
        prompt: "Your robot was tuned with PWM 180 at a battery voltage of 8.0 V. The battery now reads 7.2 V. Using pwm_out = pwm x V_tune / V_now, what PWM keeps the same behaviour?",
        options: ["162", "180", "200", "220"],
        answerIndex: 2,
        explanation: "180 x 8.0 / 7.2 = 200. 162 comes from multiplying by V_now / V_tune (the inverse), which would make the robot even slower as the battery drains.",
        difficulty: 2
      },
      {
        type: "identify-driver",
        prompt: "You want to replace an L298N to reduce voltage loss. The robot uses a 3S LiPo (up to 12.6 V when full) and each motor draws about 1 A. Which driver fits these ratings?",
        options: ["DRV8833", "TB6612FNG", "A second L298N in parallel", "ULN2003"],
        answerIndex: 1,
        explanation: "The TB6612FNG accepts motor supplies up to 13.5 V and about 1.2 A continuous per channel with low-loss MOSFET outputs. The DRV8833's motor supply maximum is 10.8 V, below a full 3S pack. Another L298N keeps the same 2 V drop, and the ULN2003 cannot reverse a motor.",
        difficulty: 3
      },
      {
        type: "debug-code",
        prompt: "This race robot steers late and runs wide in fast corners. Which change helps most?",
        code: `const float KP = 0.07;
int base = 200;

int readLine() { return 0; }          // -3500..3500
void drive(int l, int r) { }

void setup() {
  Serial.begin(9600);
}

void loop() {
  int pos = readLine();
  int turn = KP * pos;
  drive(base - turn, base + turn);
  Serial.print("pos=");
  Serial.print(pos);
  Serial.print(" turn=");
  Serial.println(turn);
  delay(50);
}`,
        options: [
          "Make turn a long",
          "Raise base speed so it reaches the corner sooner",
          "Add a second delay(50) to smooth the steering",
          "Remove delay(50), run the control step on a fast fixed timer, and print only occasionally at a higher baud rate"
        ],
        answerIndex: 3,
        explanation: "The loop updates steering only about every 50+ ms, and printing about 20 characters at 9600 baud adds roughly 20 ms more. At 2 m/s that is over 10 cm between corrections. A fast fixed-rate loop with rare prints fixes the latency. A long does not change timing, and more delay or more speed makes it worse.",
        difficulty: 2
      },
      {
        type: "mcq",
        prompt: "Which change raises top speed but reduces the torque available for acceleration?",
        options: [
          "A lower gear reduction (e.g. 30:1 instead of 50:1)",
          "A higher gear reduction (e.g. 100:1 instead of 50:1)",
          "Smaller wheels",
          "Adding ballast weight"
        ],
        answerIndex: 0,
        explanation: "Gear reduction trades speed for torque: a lower ratio spins the wheel faster but with less torque. A higher ratio or smaller wheels do the opposite (more torque, lower top speed), and ballast lowers acceleration without increasing top speed.",
        difficulty: 1
      }
    ]
  }),

  // ---------------------------------------------------------------- 28
  defineTopic("race", 28, {
    slug: "debugging",
    title: "Debugging",
    minutes: 15,
    summary: "A systematic method for finding faults in race robots, with the most common hardware and software bugs and how to prove each one.",
    introduction:
      "Every robot breaks. The difference between a team that fixes it in five minutes and one that gives up is method. Debugging is detective work: observe the symptom, form a hypothesis, test it with one measurement, and repeat until the cause is proven.\n\nThis topic gives you a step-by-step debugging process, a symptom-to-cause table for race robots, and practical tools: Serial prints, the built-in LED, a multimeter and minimal test sketches.",
    beginner:
      "Imagine your torch does not light up. You would not throw it away; you would check things one at a time. Are the batteries flat? Are they in the right way round? Is the bulb broken? Each check rules something out until only the real cause is left. That is debugging.\n\nWith robots, the first big question is: hardware or software? A good trick is to load a tiny test sketch that does only one thing, like spinning one motor. If the motor spins, the wiring and driver are fine and the problem is in your race code. If it does not, the problem is in the hardware.\n\nThe second trick is to make the robot tell you what it is thinking. Serial.println() prints sensor values and decisions to your computer. The on-board LED can blink when the robot sees a marker. A multimeter shows you real voltages instead of what you hope they are.\n\nThe third trick is to change one thing at a time and write down what you did. If you change five things and it starts working, you will not know which fix mattered, and the bug may return.\n\nMost robot bugs are simple: a missing ground wire, a loose jumper, a pin number that does not match the code, a motor wired backwards, or a battery that is flatter than you think.",
    technical: [
      {
        heading: "The debugging loop",
        body:
          "1. Reproduce: make the fault happen on demand (same battery, speed, track section).\n2. Observe: collect evidence; print values, watch the LED, measure voltages, film it.\n3. Hypothesise: 'the left sensor saturates in sunlight'.\n4. Test: one experiment that would prove or disprove it (cover the track from sunlight, print the sensor).\n5. Fix and verify: confirm the symptom is gone and nothing else broke.\n\nDivide and conquer: if the chain is sensor -> code -> driver -> motor, check the middle (driver inputs with a multimeter or LED) to know which half holds the fault."
      },
      {
        heading: "Symptom-to-cause table",
        body:
          "- Motor does not move at all: no common GND, ENA jumper removed but EN not driven, STBY low on TB6612FNG, IN pins not set as OUTPUT, battery flat.\n- Motor only full speed or off: EN on a non-PWM pin (Uno PWM pins are 3, 5, 6, 9, 10, 11).\n- One wheel turns backwards: motor leads swapped or invert flag wrong.\n- Robot resets when motors start: brown-out; see Robot Stability.\n- Sensors fine on the bench but fail on the track: threshold not calibrated for that surface or lighting, sensor height wrong.\n- Works for about 30 s then misbehaves: time stored in an int instead of unsigned long.\n- Random wild encoder values: non-volatile or non-atomic reads of a shared counter.\n- Serial shows garbage: baud rate in Serial Monitor does not match Serial.begin()."
      },
      {
        heading: "Debugging tools",
        body:
          "- Serial.print: print raw values first, then computed values. Remember printing slows the loop.\n- LED_BUILTIN (pin 13): blink patterns show state without a computer, useful on the track.\n- Multimeter: measure battery voltage under load, driver output voltage, 5 V rail, and continuity of every ground wire.\n- Minimal sketches: one motor, one sensor, one encoder at a time.\n- Pin audit: write a table of every physical connection and compare it to the const declarations in your code."
      },
      {
        heading: "Common code traps on the Uno",
        body:
          "- int is 16-bit: 300 x 200 = 60000 overflows to -5536. Use long when products can exceed 32767.\n- Integer division truncates: 3 / 4 = 0.\n- digitalWrite without pinMode(OUTPUT) only toggles the internal pull-up.\n- Using = instead of == inside an if assigns and is usually 'true'.\n- Variables declared inside loop() are re-created every loop; use static or global for values that must persist (such as lastError)."
      }
    ],
    workingPrinciple:
      "Debugging works by systematic elimination. Every fault lies somewhere along the chain from power supply and sensors, through code, to driver and motors. Each targeted observation or minimal test splits the remaining possibilities, so a structured search converges on the cause quickly, whereas random changes can mask or multiply faults.",
    diagrams: [
      { kind: "flow", steps: ["Reproduce the fault reliably", "Hardware or software? Run a minimal test sketch", "Divide the chain: power -> sensors -> code -> driver -> motors", "Measure (multimeter, Serial, LED) at the midpoint", "Form one hypothesis, test it, fix, verify"] },
      { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D3", "D5", "D6", "D9", "D10", "D11", "GND1"] }
    ],
    examples: [
      {
        title: "Heartbeat and state LED",
        body: "Blinks the built-in LED slowly while racing and fast when the line is lost, so you can see what the robot thinks without a cable.",
        code: `bool lineLost = false;
unsigned long lastBlink = 0;
bool ledOn = false;

bool readLineLost() { return false; } // replace with sensor check

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  lineLost = readLineLost();
  unsigned long period = lineLost ? 100 : 500;
  if (millis() - lastBlink >= period) {
    lastBlink = millis();
    ledOn = !ledOn;
    digitalWrite(LED_BUILTIN, ledOn ? HIGH : LOW);
  }
}`
      },
      {
        title: "Debug flag that keeps race code fast",
        body: "All prints go through one helper function controlled by one constant. Set DEBUG to false for races so no time is spent printing.",
        code: `const bool DEBUG = true;

void dbg(const char *label, long value) {
  if (!DEBUG) return;
  Serial.print(label);
  Serial.println(value);
}

void setup() {
  Serial.begin(115200);
}

void loop() {
  int raw = analogRead(A0);
  dbg("A0=", raw);
  long product = 300L * 200; // long avoids 16-bit overflow
  dbg("product=", product);
  delay(200);
}`
      }
    ],
    commonMistakes: [
      { mistake: "Changing many things at once.", why: "Even if it starts working, you will not know which change fixed it, and new bugs can hide.", fix: "Change one thing, test, write it down." },
      { mistake: "Assuming the code is wrong when it is wiring.", why: "Hours are lost editing correct code while a ground wire is loose.", fix: "Run a minimal test sketch to split hardware from software first." },
      { mistake: "Trusting the battery without measuring.", why: "A battery that is too low under load causes weak motors, resets and odd sensor values.", fix: "Measure battery voltage under load with a multimeter." },
      { mistake: "Wrong baud rate in the Serial Monitor.", why: "Characters appear as garbage, and students conclude the sensor is broken.", fix: "Match the Serial Monitor baud rate to Serial.begin()." }
    ],
    keyTakeaways: [
      "Reproduce, observe, hypothesise, test, fix, verify.",
      "Use minimal test sketches to separate hardware faults from software faults.",
      "Divide the signal chain and measure at the midpoint.",
      "Common culprits: missing common ground, non-PWM enable pin, missing pinMode, 16-bit int overflow.",
      "Keep a written log of every change and its result."
    ],
    relatedComponents: ["Arduino Uno R3", "Digital Multimeter", "L298N", "TB6612FNG", "LiPo 2S Battery"],
    youtubeSearch: "Arduino robot troubleshooting motor not working common mistakes",
    quiz: [
      {
        type: "find-wrong-connection",
        prompt: "The motor never moves. Which connection in the diagram is wrong?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "uno", label: "Arduino Uno", x: 10, y: 50 },
            { id: "drv", label: "L298N", x: 60, y: 50 },
            { id: "bat", label: "7.4 V battery", x: 60, y: 10 }
          ],
          edges: [
            { from: "uno", to: "drv", label: "D9 -> ENA", color: "#3b82f6" },
            { from: "uno", to: "drv", label: "GND -> 12V terminal", color: "#111827", wrong: true },
            { from: "bat", to: "drv", label: "- -> GND terminal", color: "#111827" },
            { from: "uno", to: "drv", label: "D7 -> IN1", color: "#3b82f6" }
          ]
        },
        options: ["D9 -> ENA", "Arduino GND -> L298N 12V terminal", "Battery - -> L298N GND terminal", "D7 -> IN1"],
        answerIndex: 1,
        explanation: "The Arduino's GND must go to the L298N GND terminal (common ground), and the 12V terminal must get the battery positive. Here the Arduino ground sits on the motor-supply input, so the motor supply is wrong and there is no common reference. D9 (PWM) to ENA and D7 to IN1 are correct.",
        difficulty: 2
      },
      {
        type: "predict-circuit",
        prompt: "The Arduino runs from a USB power bank and the L298N from a separate LiPo. Signals D7, D8 and D9 go to IN1, IN2 and ENA, but the two grounds are NOT connected. What happens?",
        options: [
          "It works perfectly because each part has its own supply",
          "The motor always runs at full speed",
          "The driver inputs have no shared voltage reference, so the motor responds erratically or not at all",
          "The Arduino is instantly destroyed"
        ],
        answerIndex: 2,
        explanation: "A logic HIGH is only HIGH relative to a ground. Without a shared ground the driver cannot reliably tell what voltage the Arduino pins are at, so behaviour is unpredictable or the motor does nothing. Connect the two GNDs. It is not instantly destructive, but it is never 'fine'.",
        difficulty: 2
      },
      {
        type: "debug-code",
        prompt: "The motor does not turn (or turns weakly and unreliably) with this sketch. What is the bug?",
        code: `const int ENA = 9, IN1 = 7, IN2 = 8;

void setup() {
  pinMode(ENA, OUTPUT);
}

void loop() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  analogWrite(ENA, 200);
}`,
        options: [
          "IN1 and IN2 are never set as OUTPUT, so digitalWrite only switches the weak internal pull-up",
          "analogWrite needs a value from 0 to 1023",
          "ENA must be pin 7",
          "loop() must contain delay() to work"
        ],
        answerIndex: 0,
        explanation: "On an input pin, digitalWrite(HIGH) just enables the internal pull-up (tens of kilohms), which is not a proper drive. Add pinMode(IN1, OUTPUT) and pinMode(IN2, OUTPUT). analogWrite takes 0-255 (not 0-1023), and pin 7 is not even a PWM pin, so those options are wrong.",
        difficulty: 2
      },
      {
        type: "identify-pin",
        prompt: "You suspect the speed signal is not reaching the driver. Which of these Arduino Uno pins can NOT produce PWM with analogWrite()?",
        diagram: { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D3", "D7", "D9", "D11"] },
        options: ["3", "9", "7", "11"],
        answerIndex: 2,
        explanation: "The Uno's PWM pins are 3, 5, 6, 9, 10 and 11. Pin 7 is digital only, so analogWrite on it gives just HIGH (128 or more) or LOW. Pins 3, 9 and 11 are all valid PWM pins.",
        difficulty: 1
      },
      {
        type: "identify-driver",
        prompt: "A team member says: 'It is the board with a big black heatsink, screw terminals for two motors and a 5 V regulator jumper.' Which driver are they describing?",
        options: ["TB6612FNG", "DRV8833", "A4988", "L298N"],
        answerIndex: 3,
        explanation: "The common L298N module has a large heatsink (it dissipates a lot of heat because of its roughly 2 V drop), screw terminals for two DC motors and the supply, and a jumper for its onboard 5 V regulator. TB6612FNG and DRV8833 boards are small carrier boards without big heatsinks, and the A4988 is a stepper-motor driver.",
        difficulty: 1
      }
    ]
  })
];
