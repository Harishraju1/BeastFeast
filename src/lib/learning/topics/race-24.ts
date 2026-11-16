import { defineTopic } from "../define";
import type { Topic } from "../types";

export const RACE_24: Topic[] = [
  // ---------------------------------------------------------------- 24
  defineTopic("race", 24, {
    slug: "robot-stability",
    title: "Robot Stability",
    minutes: 14,
    summary: "Three kinds of stability a race car needs: mechanical (it does not tip or bounce), control (it does not weave), and electrical (it does not reset).",
    introduction:
      "A stable robot is one that returns to calm, predictable behaviour after a disturbance. For a race car there are three separate stability problems, and a fault in any one of them looks like 'the robot goes crazy at speed'.\n\nMechanical stability is about tipping, bouncing and wheels lifting. Control stability is about the steering loop: a badly tuned controller makes the robot weave from side to side. Electrical stability is about the power supply: motor current spikes can reset the Arduino or corrupt sensor readings. This topic shows how to recognise and fix each one.",
    beginner:
      "Think of a shopping trolley with one wobbly wheel. Push it gently and it is fine; push it fast and it starts shaking and veers off. Something small becomes a big problem at speed. Robots behave the same way.\n\nMechanical stability is like a table: three or four legs spread wide with weight low keeps it firmly on the floor. A robot with a high, narrow body tips in corners, and a loose caster or bent axle makes it shake.\n\nControl stability is like steering a bicycle. If you over-correct every little wobble, you start swerving left, right, left, right, more and more. A robot's steering program can do exactly this if its correction is too aggressive. The fix is calmer, smarter corrections.\n\nElectrical stability is about keeping the brain powered. Motors are greedy: when they start or reverse they gulp a large current, and the battery voltage dips for a moment. If the Arduino shares that supply without protection, the dip can make it restart in the middle of a race. Separate supplies or proper regulation, a solid common ground and capacitors near the motor driver keep the brain calm while the muscles work hard.\n\nA truly stable robot needs all three. Fixing the code will not help if the problem is a brown-out, and stiffer mounts will not fix a twitchy controller.",
    technical: [
      {
        heading: "Mechanical stability",
        body:
          "- Static tip angle: a robot on a slope tips when tan(theta) > (b/2) / h (sideways) or (L_front)/h (forwards). Example: b = 120 mm, h = 40 mm: tan(theta) = 1.5, theta = 56 degrees.\n- Dynamic tipping in corners at lateral acceleration a_tip = g x (b/2) / h. With b = 100 mm, h = 50 mm: a_tip = 9.81 m/s^2 (1 g). With mu = 0.8 the robot slides at 7.85 m/s^2, before it tips.\n- Three contact points (2 wheels + caster) always touch a flat floor; four rigid points can rock on an uneven surface, lifting a drive wheel. Use a slightly flexible mount or suspension for 4-wheel layouts.\n- Rigidity: a flexing chassis lets the sensor bar bounce, changing sensor height and readings at speed."
      },
      {
        heading: "Control stability",
        body:
          "A line-following steering loop is a feedback system. With only proportional control, a high Kp produces overshoot: the robot crosses the line, the error flips sign, it over-corrects back, and the weave can grow until it loses the line. Signs of instability: oscillation that grows with speed, or a fixed-frequency wobble on straights.\n\nRemedies: lower Kp; add derivative (Kd x change in error per step) to damp the motion; run the control loop at a fixed, fast rate (e.g. every 2-5 ms) rather than a variable one; lower base speed, because the same Kp is less stable at higher speed (the robot travels further before the correction acts)."
      },
      {
        heading: "Electrical stability",
        body:
          "- Brown-out: the Uno's 5 V must stay within its operating range. When motors start, stall or reverse, the battery voltage sags under the current spike (V_drop = I x R_internal plus wiring resistance). If the Arduino is fed from the same battery through a marginal path, it resets.\n- Fixes: a battery that can supply the stall current, short thick motor wires, a bulk electrolytic capacitor (hundreds of microfarads) across the driver's motor supply, a 100 nF ceramic across each motor's terminals, and powering the Arduino through a proper regulator (VIN or a separate pack).\n- Common ground: the Arduino GND and the driver GND must be connected, or the logic signals have no reference.\n- Never feed a battery above 5 V into the Arduino's 5V pin; that bypasses the regulator."
      }
    ],
    workingPrinciple:
      "A stable system produces restoring responses that shrink a disturbance rather than grow it. Mechanically, gravity acting through a low, well-supported CoG creates a restoring moment. In control, a correction that is proportional to error but damped by its rate of change brings the robot back to the line without overshoot. Electrically, energy storage (capacitors) and low-impedance supply paths absorb current spikes so the logic supply stays within limits.",
    diagrams: [
      {
        kind: "signal",
        title: "Line error over time: unstable vs damped controller",
        xLabel: "time (s)",
        yLabel: "line error",
        series: [
          { label: "Kp too high, Kd = 0", points: [[0, 10], [0.2, -14], [0.4, 18], [0.6, -23], [0.8, 28]] },
          { label: "Kp + Kd tuned", points: [[0, 10], [0.2, 3], [0.4, -1], [0.6, 0.3], [0.8, 0]] }
        ]
      },
      {
        kind: "circuit",
        nodes: [
          { id: "bat", label: "2S LiPo 7.4 V", x: 10, y: 20 },
          { id: "cap", label: "470 uF bulk cap", x: 40, y: 10 },
          { id: "drv", label: "TB6612FNG VM", x: 70, y: 20 },
          { id: "uno", label: "Arduino VIN", x: 40, y: 70 },
          { id: "gnd", label: "Common GND", x: 70, y: 70 }
        ],
        edges: [
          { from: "bat", to: "drv", label: "+7.4 V (short, thick)", color: "#ef4444" },
          { from: "cap", to: "drv", label: "across VM-GND" },
          { from: "bat", to: "uno", label: "+7.4 V to VIN (regulated on board)", color: "#ef4444" },
          { from: "uno", to: "gnd", label: "GND", color: "#111827" },
          { from: "drv", to: "gnd", label: "GND", color: "#111827" }
        ]
      }
    ],
    examples: [
      {
        title: "Detecting brown-out resets",
        body: "Print a message once in setup(). If you see it appear in the Serial Monitor in the middle of a run, the Arduino reset, which almost always means a power problem, not a code bug.",
        code: `void setup() {
  Serial.begin(115200);
  Serial.println("BOOT"); // should appear only once per power-up
  pinMode(LED_BUILTIN, OUTPUT);
  for (int i = 0; i < 3; i++) {   // 3 quick blinks = just reset
    digitalWrite(LED_BUILTIN, HIGH); delay(80);
    digitalWrite(LED_BUILTIN, LOW);  delay(80);
  }
}

void loop() {
  // race code here
}`
      },
      {
        title: "Fixed-rate control loop",
        body: "Running the controller every 4 ms makes its behaviour the same regardless of how long printing or sensor reads take, which makes tuning stable and repeatable.",
        code: `const unsigned long DT_US = 4000;
unsigned long lastUs = 0;

void controlStep() {
  // read sensors, compute PID, set motors
}

void setup() {}

void loop() {
  unsigned long now = micros();
  if (now - lastUs >= DT_US) {
    lastUs += DT_US;  // keeps an exact average rate
    controlStep();
  }
}`
      }
    ],
    commonMistakes: [
      { mistake: "Re-tuning PID to fix random resets.", why: "If the board resets (brown-out), no gain change will help; the problem is power.", fix: "Print a boot message to detect resets, then fix the supply: capacitors, wiring, separate or regulated logic power." },
      { mistake: "Feeding 7.4 V into the Arduino 5V pin.", why: "The 5V pin bypasses the regulator, so the ATmega328P sees more than its maximum supply voltage.", fix: "Feed batteries above 5 V into VIN or the barrel jack (or use an external 5 V regulator into 5V)." },
      { mistake: "Keeping the same Kp after raising base speed.", why: "At higher speed the robot travels further per control step, so the same gain overshoots and weaves.", fix: "Re-tune with each speed change and add Kd for damping." },
      { mistake: "Rigid four-wheel chassis on an uneven track.", why: "Four rigid points cannot all touch an uneven surface, so a drive wheel can lift and lose traction.", fix: "Use three-point support, a flexible chassis, or simple suspension." }
    ],
    keyTakeaways: [
      "Stability means disturbances die out instead of growing: mechanical, control and electrical.",
      "Tipping needs lateral acceleration above g x (b/2)/h; keep CoG low and track wide.",
      "Weaving that grows with speed is a control problem: lower Kp, add Kd, fixed loop rate.",
      "Random resets are power problems: capacitors, common ground, regulated logic supply.",
      "Diagnose which kind of instability you have before changing anything."
    ],
    relatedComponents: ["Arduino Uno R3", "TB6612FNG", "L298N", "LiPo 2S Battery", "Electrolytic Capacitor", "Ceramic Capacitor"],
    youtubeSearch: "Arduino reset when motor starts brown out fix capacitor",
    quiz: [
      {
        type: "predict-circuit",
        prompt: "An Arduino Uno and an L298N share one small 2S battery, with no capacitors. Every time the robot launches hard, the Arduino restarts. What happens electrically at launch?",
        options: [
          "The PWM frequency rises above the Arduino's clock speed",
          "The L298N sends a reset command over the IN pins",
          "The motors' large starting current makes the battery voltage dip, so the Arduino's supply briefly falls too low and it resets",
          "The motors generate extra voltage that charges the battery"
        ],
        answerIndex: 2,
        explanation: "Stalled motors draw their maximum current at start-up. The battery's internal resistance and the wiring turn that current into a voltage drop, and the Arduino's supply falls low enough to cause a reset (brown-out). Driver IN pins are inputs and cannot reset the Arduino; motors only generate back-EMF while spinning and do not charge the pack at launch.",
        difficulty: 2
      },
      {
        type: "find-wrong-connection",
        prompt: "Which connection in this power wiring is wrong and could damage the Arduino?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "bat", label: "2S LiPo 7.4 V", x: 10, y: 30 },
            { id: "drv", label: "L298N", x: 60, y: 30 },
            { id: "uno", label: "Arduino Uno", x: 60, y: 80 }
          ],
          edges: [
            { from: "bat", to: "drv", label: "+ -> 12V terminal", color: "#ef4444" },
            { from: "bat", to: "drv", label: "- -> GND terminal", color: "#111827" },
            { from: "drv", to: "uno", label: "GND -> GND", color: "#111827" },
            { from: "bat", to: "uno", label: "+ -> 5V pin", color: "#ef4444", wrong: true },
            { from: "uno", to: "drv", label: "D9 -> ENA", color: "#3b82f6" }
          ]
        },
        options: ["Battery + -> L298N 12V terminal", "L298N GND -> Arduino GND", "D9 -> ENA", "Battery + (7.4 V) -> Arduino 5V pin"],
        answerIndex: 3,
        explanation: "The 5V pin connects directly to the 5 V rail, bypassing the regulator, so 7.4 V (up to 8.4 V when charged) is applied to the ATmega328P, beyond its maximum supply. Use VIN or the barrel jack instead. The common ground is required, not a mistake, and D9 is a correct PWM pin for ENA.",
        difficulty: 2
      },
      {
        type: "mcq",
        prompt: "On a straight section, your line follower's side-to-side weave gets bigger and bigger until it loses the line. Which is the most likely cause?",
        options: [
          "The battery is too full",
          "The proportional gain is too high and there is little or no derivative damping",
          "The line is too wide",
          "The Arduino is running out of memory"
        ],
        answerIndex: 1,
        explanation: "Growing oscillation is the signature of an unstable feedback loop: too much proportional correction with not enough damping. Lower Kp and/or add Kd. A wide line or a full battery do not by themselves cause growing oscillation, though a fuller battery can make an already marginal loop worse.",
        difficulty: 2
      },
      {
        type: "calculate",
        prompt: "A robot has track width b = 100 mm and its centre of gravity is h = 50 mm above the track. At roughly what lateral acceleration would it tip in a corner (ignoring sliding)?",
        diagram: { kind: "formula", latexish: "a_{tip} = g \\cdot \\frac{b/2}{h}", legend: { b: "100 mm", h: "50 mm", g: "9.81 m/s^2" } },
        options: ["about 9.8 m/s^2", "about 4.9 m/s^2", "about 19.6 m/s^2", "about 2.5 m/s^2"],
        answerIndex: 0,
        explanation: "a_tip = g x (b/2)/h = 9.81 x 50/50 = 9.81 m/s^2 (1 g). Using the full track width b instead of b/2 gives 19.6 m/s^2, which overestimates stability by a factor of two.",
        difficulty: 2
      }
    ]
  }),

  // ---------------------------------------------------------------- 25
  defineTopic("race", 25, {
    slug: "racing-algorithms",
    title: "Racing Algorithms",
    minutes: 16,
    summary: "Turning a line follower into a racer: PD/PID steering, speed scheduling by error, braking zones and track-learning with encoders.",
    introduction:
      "A basic line follower drives at one speed and reacts to the line. A racer thinks ahead: it runs flat out on straights, slows just enough for corners, and in advanced robots even remembers the track from the first lap to brake before corners on later laps.\n\nThis topic builds a racing controller in layers: a PD steering loop, a speed scheduler that lowers base speed when the error is large, braking zones, and a simple track-learning approach using encoder distance.",
    beginner:
      "Watch a professional racing driver. On a straight they press the accelerator fully. Before a corner they brake in a straight line, turn smoothly through the bend, and accelerate out. They do not react only to where the car is right now; they also know what is coming.\n\nA beginner robot is like a learner driver holding one speed everywhere: too slow on straights and too fast in corners. The first upgrade is a smooth steering controller called PD control. P (proportional) steers harder the further you are from the line. D (derivative) looks at how fast the error is changing and calms the steering down before it overshoots, like easing off the wheel as the car straightens.\n\nThe second upgrade is speed scheduling: when the robot is well centred on the line (a straight), go fast; when the error is large (a corner), slow down automatically.\n\nThe third upgrade is memory. On the first lap, the robot drives carefully and records, using its wheel encoders, where on the track each corner starts. On later laps it uses that map to brake before each corner and accelerate as soon as it exits. This is how top line-racing robots achieve their lap times.",
    technical: [
      {
        heading: "PD steering",
        body:
          "error = line position (e.g. -3500 to +3500 for an 8-sensor QTR array centred at 0).\nturn = Kp x error + Kd x (error - lastError), then lastError = error.\nleft = base - turn, right = base + turn (positive turn = left, so choose the sign of the error accordingly).\n\nThe D term must be computed at a fixed loop period, otherwise its effective strength changes with loop timing. The integral term (I) is rarely needed for line racing and can cause wind-up; add it only if there is a steady offset."
      },
      {
        heading: "Speed scheduling",
        body:
          "Reduce base speed as the magnitude of the error rises: base = Vmax - k x |error|, clamped to [Vmin, Vmax].\n\nExample: base = 230 - |error| / 4, clamped to 120..230. Error 0 gives 230; error 100 gives 205; error 600 gives 80, clamped to 120. This automatically slows the robot in corners and gives the outer wheel headroom so the turn command does not saturate."
      },
      {
        heading: "Braking zones and the friction circle",
        body:
          "Tyres have a total grip budget: braking and cornering forces share it. So brake in a straight line before the corner, then turn. With deceleration a and entry speed v_corner, the braking must start at distance s = (v_straight^2 - v_corner^2) / (2a) before the corner.\n\nExample: v_straight = 2.0 m/s, v_corner = 1.2 m/s, a = 5 m/s^2: s = (4 - 1.44) / 10 = 0.256 m before the corner entry."
      },
      {
        heading: "Track learning with encoders",
        body:
          "Lap 1 (mapping): drive at a safe constant speed and record, every few centimetres of encoder distance, the difference between left and right wheel counts (curvature). Segments with near-zero difference are straights; large difference means a corner.\n\nLap 2+ (racing): use the start/finish marker to reset distance to zero. Look ahead in the map: if a corner begins within the braking distance, slow down now; on straights, use maximum speed. Re-synchronise distance at every marker to correct accumulated wheel-slip error."
      }
    ],
    workingPrinciple:
      "The steering loop measures line error, then commands a turn proportional to the error plus a damping term proportional to how quickly the error changes, keeping the robot centred without overshoot. A second loop sets forward speed from how hard the robot is turning (or from a stored map of upcoming corners), so the robot spends as much of the lap as possible at the highest speed the tyres and controller can sustain.",
    diagrams: [
      {
        kind: "flow",
        steps: [
          "Read sensor array -> position error",
          "turn = Kp x error + Kd x (error - lastError)",
          "base = clamp(Vmax - k x |error|, Vmin, Vmax)",
          "If map says corner within braking distance: base = Vcorner",
          "left = base - turn, right = base + turn -> motors",
          "lastError = error; wait for next fixed tick"
        ]
      },
      {
        kind: "signal",
        title: "Speed profile over one lap",
        xLabel: "distance (m)",
        yLabel: "speed (m/s)",
        series: [
          { label: "Constant-speed follower", points: [[0, 1.0], [2, 1.0], [4, 1.0], [6, 1.0]] },
          { label: "Scheduled racer", points: [[0, 0], [0.5, 1.9], [1.5, 1.9], [2.0, 1.2], [3.0, 1.2], [3.5, 1.9], [5.5, 1.9], [6, 1.2]] }
        ]
      }
    ],
    examples: [
      {
        title: "PD racer with speed scheduling",
        body: "readPosition() should return the weighted line position (-3500..3500, 0 = centred). Sign convention: positive error means the line is to the left, so a positive turn steers left. Check this on your robot at low speed.",
        code: `const float KP = 0.07;
const float KD = 0.9;
const int VMAX = 230, VMIN = 120;
int lastError = 0;
unsigned long lastUs = 0;

int readPosition() { return 0; }      // replace with sensor code
void setMotors(int l, int r) { }      // replace with driver code

int baseFor(int error) {
  int e = abs(error);
  return constrain(VMAX - e / 4, VMIN, VMAX);
}

void setup() {}

void loop() {
  unsigned long now = micros();
  if (now - lastUs < 3000) return;    // 3 ms fixed loop
  lastUs = now;

  int error = readPosition();
  int turn = (int)(KP * error + KD * (error - lastError));
  lastError = error;

  int base = baseFor(error);
  setMotors(constrain(base - turn, -255, 255), constrain(base + turn, -255, 255));
}`
      },
      {
        title: "Braking distance lookup",
        body: "Compute where to start braking for each mapped corner. With a = 5 m/s^2, slowing from 2.0 to 1.2 m/s needs 0.256 m; from 2.0 to 0.8 m/s needs (4 - 0.64) / 10 = 0.336 m. Store these distances so lap 2 brakes at the right encoder count."
      }
    ],
    commonMistakes: [
      { mistake: "Forgetting to update lastError.", why: "Then error - lastError is just error, so the D term behaves like extra P and adds no damping.", fix: "Set lastError = error at the end of every control step." },
      { mistake: "Running PD in a loop of variable length.", why: "The derivative is per step; if step time varies, so does the effective Kd, making tuning inconsistent.", fix: "Run the controller at a fixed period using micros() or millis()." },
      { mistake: "Same base speed everywhere.", why: "Either too slow on straights or too fast in corners.", fix: "Schedule speed from error magnitude, then from a learned track map." },
      { mistake: "Trusting encoder distance for the whole race.", why: "Wheel slip accumulates errors, so the map drifts and the robot brakes at the wrong place.", fix: "Re-synchronise distance at every start/finish or section marker." }
    ],
    keyTakeaways: [
      "PD steering: turn = Kp x error + Kd x (error - lastError), at a fixed loop rate.",
      "Speed scheduling lowers base speed as the error grows.",
      "Brake in a straight line before the corner: s = (v1^2 - v2^2) / (2a).",
      "Track learning maps corners on lap 1 and brakes ahead of them on later laps.",
      "Re-sync distance at markers to cancel wheel-slip drift."
    ],
    relatedComponents: ["QTR-8A", "Magnetic Rotary Encoder", "N20 Micro Metal Gear Motor", "TB6612FNG", "Arduino Nano"],
    youtubeSearch: "fast line follower PID speed control track learning robot",
    quiz: [
      {
        type: "code-output",
        prompt: "What does this sketch print?",
        code: `int baseFor(int error) {
  int e = abs(error);
  int base = 230 - e / 4;
  return constrain(base, 120, 230);
}

void setup() {
  Serial.begin(9600);
  Serial.print(baseFor(-100));
  Serial.print(" ");
  Serial.println(baseFor(600));
}

void loop() {}`,
        options: ["255 80", "205 120", "205 80", "130 120"],
        answerIndex: 1,
        explanation: "baseFor(-100): e = 100, 230 - 25 = 205, within range. baseFor(600): 230 - 150 = 80, which constrain raises to the minimum 120. Output '205 120'. '205 80' forgets the clamp; '255 80' forgets abs() as well (230 - (-100)/4 = 255) and skips the clamp.",
        difficulty: 2
      },
      {
        type: "debug-code",
        prompt: "This PD controller does not seem to have any damping; changing Kd behaves like changing Kp. What is the bug?",
        code: `const float Kp = 0.08, Kd = 0.6;
int lastError = 0;
int base = 200;

int readPosition() { return 0; }   // returns -3500..3500
void setMotors(int l, int r) { }

void setup() {}

void loop() {
  int error = readPosition();
  int d = error - lastError;
  int turn = Kp * error + Kd * d;
  setMotors(base - turn, base + turn);
  delay(3);
}`,
        options: [
          "Kd must be an integer",
          "setMotors needs float arguments",
          "lastError is never updated, so d always equals error; add lastError = error; at the end of loop()",
          "delay(3) must be removed for the code to compile"
        ],
        answerIndex: 2,
        explanation: "lastError stays 0 forever, so d = error and the D term is just (Kd x error), another proportional term. Updating lastError each loop makes d the change in error, which provides damping. Float gains with int variables are fine (the result is truncated to int), and the code compiles with delay(3).",
        difficulty: 2
      },
      {
        type: "mcq",
        prompt: "Why do racers brake in a straight line BEFORE a corner instead of braking hard while turning?",
        options: [
          "Motors cannot brake while turning",
          "It saves battery energy",
          "The encoders stop counting during braking",
          "Tyre grip is shared between braking and cornering, so doing both at once can exceed the limit and slide"
        ],
        answerIndex: 3,
        explanation: "The friction circle: the vector sum of braking and cornering forces cannot exceed mu x N. Braking first uses all grip for slowing; then all grip is available for turning. Motors can brake while turning, and encoders keep counting, so those options are false.",
        difficulty: 2
      },
      {
        type: "predict-movement",
        prompt: "A line follower uses a very high Kp and Kd = 0, at a high base speed. How does it move along a straight line?",
        options: [
          "It zig-zags across the line with an oscillation that tends to grow, possibly losing the line",
          "It drives perfectly straight along the line",
          "It drives slowly but straight",
          "It stops whenever it sees the line"
        ],
        answerIndex: 0,
        explanation: "High proportional gain without damping over-corrects: the robot crosses the line, the error flips and it over-corrects the other way. At high speed the delay between correction and effect makes this worse. Adding Kd and/or lowering Kp settles it. It does not slow down by itself, since base speed is fixed.",
        difficulty: 2
      }
    ]
  }),

  // ---------------------------------------------------------------- 26
  defineTopic("race", 26, {
    slug: "testing",
    title: "Testing",
    minutes: 13,
    summary: "A systematic test plan for race robots: bench tests, sensor dumps, controlled track runs, one-variable changes and recording results.",
    introduction:
      "The fastest teams are not the ones who guess best; they are the ones who test best. A good test plan finds wiring faults on the bench, sensor problems before the track, and proves with numbers whether a change made the robot faster.\n\nThis topic gives you a testing ladder (component, subsystem, full robot), simple Arduino test sketches, how to log data, and how to run fair comparisons so you do not fool yourself.",
    beginner:
      "Imagine baking a cake that came out flat. Was it the oven, the flour, the eggs, or the recipe? If you changed five things at once next time, you would never know which one mattered. Testing a robot works the same way: change one thing, test, record the result.\n\nStart small. Test each part alone before testing the whole robot. Can each motor spin both ways? Does each sensor give a clear difference between black and white? Does the encoder count when you turn the wheel by hand? These are bench tests, done with the wheels off the ground.\n\nThen test small groups: sensors plus steering at low speed on a simple oval. Only then try full speed on the real track.\n\nWrite things down. A notebook or spreadsheet with the date, battery voltage, settings and lap time turns opinions ('it feels faster') into facts ('it is 0.3 seconds faster on average over five runs').\n\nFinally, test in the same conditions you will race in: the same type of surface, similar lighting (IR sensors can be affected by strong sunlight), and a charged battery. A robot tuned on a nearly empty battery may fly off the track when you plug in a fresh one.",
    technical: [
      {
        heading: "The testing ladder",
        body:
          "1. Component tests: each motor forward/reverse at 3 PWM levels; each sensor raw values over black and white; encoder counts per wheel revolution; battery voltage at rest and under load.\n2. Subsystem tests: line position output while sliding the robot by hand across the line; straight-line drive with wheels on the floor (does it drift?); braking distance from a known speed.\n3. Integration: full robot on a simple oval at low speed, then increasing speed.\n4. Competition simulation: real track, start procedure, full number of laps, timed.\n\nFix failures at the lowest level possible. A fault found at level 4 can take an hour to trace; at level 1 it takes a minute."
      },
      {
        heading: "Fair experiments",
        body:
          "- Change one variable at a time (Kp, base speed, tyre, battery position).\n- Repeat each configuration several times (e.g. five runs) and record the mean and the spread (fastest - slowest). A 0.1 s improvement means nothing if the run-to-run spread is 0.5 s.\n- Control conditions: battery voltage (measure before each run; a 2S LiPo varies from about 8.4 V full to about 7.4 V nominal under use), clean tyres, same start position.\n- Record failures as data too: 'lost line at corner 3, 2 out of 5 runs' tells you what to fix."
      },
      {
        heading: "Logging data",
        body:
          "Serial over USB is fine on the bench but awkward on a moving robot. Options: log to a small RAM buffer during the run and print it after the robot stops; or use a wireless serial link if you have one. Keep logs compact (CSV: time, error, left PWM, right PWM) because at 115200 baud you can only send about 11,500 characters per second, and the 64-byte transmit buffer blocks the loop when full."
      },
      {
        heading: "Measurement tools",
        body:
          "- Multimeter: battery voltage, driver output voltage under load, continuity of wires.\n- Serial Plotter: watch sensor values or line error live.\n- Phone slow-motion video: see wheel slip, oscillation and exactly where the robot leaves the line.\n- Timing gate or stopwatch for laps; use the average of several runs."
      }
    ],
    workingPrinciple:
      "Testing works by isolating variables. By verifying each component independently, any later failure must lie in the interactions, narrowing the search. By changing only one parameter between repeated, measured runs under controlled conditions, any change in the result can be attributed to that parameter with confidence, rather than to random variation or a hidden change such as battery voltage.",
    diagrams: [
      { kind: "flow", steps: ["Component tests (bench, wheels up)", "Subsystem tests (sensors + steering, low speed)", "Integration on a simple oval", "Full track, timed, repeated 5 times", "Change ONE variable, repeat, compare mean and spread"] },
      { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["A0", "A1", "A2", "A3", "A4", "D2", "D3"] }
    ],
    examples: [
      {
        title: "Sensor dump for the Serial Plotter",
        body: "Prints all five analog sensor values on one line, separated by spaces, so the Arduino Serial Plotter shows five traces. Slide the robot across the line by hand and check that every sensor swings clearly between black and white.",
        code: `const byte S[5] = {A0, A1, A2, A3, A4};

void setup() {
  Serial.begin(115200);
}

void loop() {
  for (byte i = 0; i < 5; i++) {
    Serial.print(analogRead(S[i]));
    Serial.print(i < 4 ? " " : "");
  }
  Serial.println();
  delay(20);
}`
      },
      {
        title: "Motor bench test sequence",
        body: "With the wheels off the ground, run each motor forward and reverse at three speeds, printing what should happen so you can compare with what does happen. Uses an L298N with ENA = 9, IN1 = 7, IN2 = 8, ENB = 10, IN3 = 12, IN4 = 13.",
        code: `const int EN[2] = {9, 10};
const int INA[2] = {7, 12};
const int INB[2] = {8, 13};

void run(int m, int speed) {
  digitalWrite(INA[m], speed >= 0 ? HIGH : LOW);
  digitalWrite(INB[m], speed >= 0 ? LOW : HIGH);
  analogWrite(EN[m], abs(speed));
}

void setup() {
  Serial.begin(9600);
  for (int m = 0; m < 2; m++) {
    pinMode(EN[m], OUTPUT); pinMode(INA[m], OUTPUT); pinMode(INB[m], OUTPUT);
  }
  int speeds[6] = {100, 180, 255, -100, -180, -255};
  for (int m = 0; m < 2; m++) {
    for (int k = 0; k < 6; k++) {
      Serial.print(m == 0 ? "LEFT " : "RIGHT ");
      Serial.println(speeds[k]);
      run(m, speeds[k]);
      delay(1000);
      run(m, 0);
      delay(300);
    }
  }
}

void loop() {}`
      }
    ],
    commonMistakes: [
      { mistake: "Changing several settings between runs.", why: "If the lap time changes, you cannot tell which change caused it, and good changes can hide bad ones.", fix: "Change one variable at a time and record it." },
      { mistake: "Judging from a single run.", why: "Run-to-run variation can be larger than the effect you are measuring.", fix: "Repeat each configuration several times and compare averages and spread." },
      { mistake: "Ignoring battery voltage.", why: "Motor speed scales with supply voltage, so a fresh battery makes the robot faster and can push a tuned controller into instability.", fix: "Measure and record voltage before each run; tune at the voltage you will race with, or compensate in software." },
      { mistake: "Skipping bench tests and going straight to the track.", why: "Wiring and direction errors are much harder to diagnose on a moving robot.", fix: "Run component tests with the wheels off the ground first." }
    ],
    keyTakeaways: [
      "Test bottom-up: components, subsystems, integration, full race.",
      "Change one variable at a time and repeat runs.",
      "Record conditions (battery voltage, surface, settings) with every result.",
      "Use Serial Plotter, multimeter and slow-motion video to see what is really happening.",
      "Test in race-like conditions before the competition."
    ],
    relatedComponents: ["Arduino Uno R3", "Digital Multimeter", "L298N", "TCRT5000", "Magnetic Rotary Encoder"],
    youtubeSearch: "robot testing debugging methodology Arduino serial plotter",
    quiz: [
      {
        type: "find-wrong-connection",
        prompt: "The encoder test sketch uses attachInterrupt(digitalPinToInterrupt(2), onA, RISING) and digitalRead(4) for channel B. The count never changes when you turn the wheel. Which connection is wrong?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "enc", label: "Encoder", x: 10, y: 50 },
            { id: "uno", label: "Arduino Uno", x: 70, y: 50 }
          ],
          edges: [
            { from: "enc", to: "uno", label: "VCC -> 5V", color: "#ef4444" },
            { from: "enc", to: "uno", label: "GND -> GND", color: "#111827" },
            { from: "enc", to: "uno", label: "A -> D5", color: "#3b82f6", wrong: true },
            { from: "enc", to: "uno", label: "B -> D4", color: "#3b82f6" }
          ]
        },
        options: ["VCC -> 5V", "GND -> GND", "A -> D5", "B -> D4"],
        answerIndex: 2,
        explanation: "Channel A must go to the pin the interrupt is attached to, pin 2. On D5 no interrupt fires, so the count never changes. Pin 5 is also not interrupt-capable on the Uno at all. B on D4 matches the digitalRead(4) in the code, so it is correct.",
        difficulty: 1
      },
      {
        type: "predict-circuit",
        prompt: "On the bench, an L298N is powered from a 6 V supply and drives 6 V-rated motors drawing about 1 A each. The motors run noticeably slower than when connected straight to 6 V. Why?",
        options: [
          "The Arduino limits motor current to 40 mA",
          "PWM at about 490 Hz always halves the voltage",
          "6 V motors always run slowly on a bench",
          "The L298N's bipolar output transistors drop roughly 2 V at around 1 A, so the motors see only about 4 V"
        ],
        answerIndex: 3,
        explanation: "The L298 uses bipolar transistors; the total drop across the high- and low-side switches is typically around 2 V at 1 A, so a 6 V supply gives the motor about 4 V. The motor current flows from the driver's supply, not through the Arduino's pins, and PWM frequency does not set the average voltage (the duty cycle does).",
        difficulty: 2
      },
      {
        type: "mcq",
        prompt: "You want to know whether a new Kp value improves lap time. Which test is most trustworthy?",
        options: [
          "Five runs with the old Kp and five with the new, same battery voltage and track, changing nothing else, then compare averages",
          "One run with the new Kp on a freshly charged battery",
          "Change Kp, Kd and tyres together to save time",
          "Ask teammates which run looked faster"
        ],
        answerIndex: 0,
        explanation: "Repeated runs with only one variable changed under controlled conditions let you separate the real effect from random variation. A single run on a fresh battery mixes two changes (Kp and voltage), and changing several settings at once makes the cause impossible to identify.",
        difficulty: 1
      },
      {
        type: "identify-driver",
        prompt: "During testing you log that your motor driver's heatsink gets hot and the motor voltage is about 2 V below the battery voltage at 1 A. Which driver is most likely fitted?",
        options: ["TB6612FNG", "L298N", "DRV8833"],
        answerIndex: 1,
        explanation: "A drop of around 2 V at 1 A and a large heatsink are characteristic of the L298N's bipolar (Darlington-style) outputs. The TB6612FNG and DRV8833 use MOSFET outputs with low on-resistance, so their voltage drop at 1 A is much smaller and they run cooler.",
        difficulty: 1
      }
    ]
  })
];
