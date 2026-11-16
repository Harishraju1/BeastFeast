import { defineTopic } from "../define";
import type { Topic } from "../types";

export const SUMO_23: Topic[] = [
  // ───────────────────────────── 23. Robot Stability ─────────────────────────────
  defineTopic("sumo", 23, {
    slug: "robot-stability",
    title: "Robot Stability",
    minutes: 12,
    summary:
      "Why sumo robots tip, wheelie or roll, and how centre-of-gravity height, support base and acceleration decide whether your robot stays flat on the dohyo.",
    introduction:
      "A sumo robot that lifts its wedge off the ring, rocks onto its back or flips during a hit has handed the match to its opponent. Stability is not luck - it follows from a few simple moment (turning-force) calculations involving the robot's weight, the height of its centre of gravity and the size of its support base. This topic gives you those equations with worked numbers, and shows how to measure your own robot's centre of gravity.",
    beginner:
      "Think of a tall bookshelf and a low coffee table. Push the top of the bookshelf and it topples easily; push the coffee table just as hard and it only slides. Two things make the difference: how high the weight sits, and how wide the base is. The higher the weight and the narrower the base, the easier it is to tip something over.\n\nEvery object behaves as if all its weight were concentrated at one point, the centre of gravity (CoG). As long as the CoG stays above the area between the wheels and supports touching the ground, the robot stays upright. A push, a sharp turn or a sudden launch tries to tilt the robot; if that tilt moves the CoG outside the supports, over it goes.\n\nSumo robots face this all the time. A hard launch can lift the front, like a bicycle doing a wheelie, so the wedge leaves the ground just when you need it. An opponent's wedge pushing high on your body acts like pushing the top of the bookshelf. The cure is the coffee-table design: heavy parts (battery, motors) as low as possible, and wheels and supports spread as wide and long as the size rules allow.",
    technical: [
      {
        heading: "Support base and centre of gravity",
        body:
          "The support polygon is the area enclosed by all ground contact points (wheel contact patches, wedge edge, skids or casters). The robot is statically stable when the vertical line through the CoG falls inside this polygon. Margin = horizontal distance from the CoG projection to the nearest edge of the polygon - more margin means more stability.\n\nMeasuring CoG along the robot: place the front support on one kitchen scale and the rear support on another. If the supports are L apart and the front scale reads W_front of a total W, the CoG is x = L x W_front / W from the rear support. Example: L = 8 cm, front 300 g, rear 200 g, total 500 g -> x = 8 x 300 / 500 = 4.8 cm in front of the rear support.",
      },
      {
        heading: "Tipping under a push",
        body:
          "A horizontal force F applied at height h tries to rotate the robot about the far edge of its support (the pivot). Gravity resists with m x g acting at horizontal distance d from that pivot. The robot tips when F x h > m x g x d, so F_tip = m g d / h.\n\nWorked example: m = 0.5 kg, d = 5 cm, h = 2.5 cm -> F_tip = 0.5 x 9.81 x 0.05 / 0.025 = 9.81 N. Raise the contact to h = 5 cm and F_tip halves to 4.9 N. Since a 0.5 kg opponent with μ = 0.8 can only push with about 3.9 N, low contact points keep you safe - which is another reason the front wedge should be the only thing an opponent can reach.",
      },
      {
        heading: "Wheelies under acceleration",
        body:
          "When the robot accelerates at a, an inertial force m a acts at the CoG height h_cg, trying to rotate the robot backward about the rear support. The front lifts when m a h_cg > m g d, where d is the horizontal distance from the rear support forward to the CoG: a_lift = g d / h_cg.\n\nMaximum acceleration is limited by traction, roughly a_max = μ g. So a wheelie is possible when μ h_cg > d. Example: μ = 1.0, h_cg = 3 cm, d = 2 cm -> 3 > 2, so the front can lift on a hard launch. Moving the CoG forward (larger d) or lower (smaller h_cg) cures it. Braking does the opposite, pitching weight onto the front.",
      },
      {
        heading: "Sideways stability in turns",
        body:
          "In a turn of radius r at speed v the robot needs a centripetal acceleration a = v² / r. It tips sideways when a > g x (W/2) / h_cg, where W is the track width. Example: v = 0.6 m/s, r = 0.10 m -> a = 3.6 m/s². With W = 8 cm and h_cg = 3 cm, the limit is 9.81 x 0.04 / 0.03 = 13.1 m/s², so the robot is safe; in practice the tyres slide (at about μ g) long before a low, wide sumo robot tips sideways.",
      },
    ],
    workingPrinciple:
      "Stability is a balance of moments about the edge of the support polygon. Gravity, acting at the centre of gravity, produces a restoring moment m g d about any pivot edge. Disturbing forces - an opponent's push at height h, the inertial force m a during acceleration or braking, or the centripetal requirement during a turn - produce an overturning moment proportional to the height at which they act. The robot stays flat while the restoring moment is larger, which is achieved by a low CoG, a long and wide support base, and keeping the CoG well inside that base.",
    diagrams: [
      {
        kind: "formula",
        latexish: "F_tip = m·g·d / h;   a_lift = g·d / h_cg;   wheelie possible if μ·h_cg > d",
        legend: {
          F_tip: "horizontal push needed to tip the robot (N)",
          m: "robot mass (kg)",
          d: "horizontal distance from CoG to the pivot edge (m)",
          h: "height at which the push is applied (m)",
          h_cg: "height of the centre of gravity (m)",
          "μ": "tyre friction coefficient",
        },
      },
      {
        kind: "flow",
        steps: [
          "Weigh front and rear supports on two scales",
          "Compute CoG position x = L x W_front / W",
          "Check wheelie condition μ x h_cg > d",
          "Check tipping force F_tip = m g d / h at the highest exposed contact point",
          "Move battery/motors lower or forward and re-measure",
        ],
      },
    ],
    examples: [
      {
        title: "CoG from two kitchen scales",
        body:
          "Enter the scale readings and support spacing to find where the CoG sits, then check whether a hard launch could lift the front.",
        code: `void setup() {
  Serial.begin(9600);
  float L = 8.0;          // cm between rear wheel contact and front support
  float wFront = 300.0;   // g on front scale
  float wRear = 200.0;    // g on rear scale
  float hCg = 3.0;        // cm, estimated CoG height
  float mu = 1.0;         // tyre friction estimate

  float x = L * wFront / (wFront + wRear);   // distance from rear support
  Serial.print("CoG from rear support (cm): ");
  Serial.println(x, 2);                      // 4.80
  if (mu * hCg > x) Serial.println("Wheelie possible on hard launch");
  else Serial.println("Front should stay down on launch");
}

void loop() {}`,
      },
      {
        title: "Tipping-force check",
        body:
          "Computes the push needed to tip the robot when the opponent touches it at different heights. Use the highest point an opponent could realistically reach.",
        code: `void setup() {
  Serial.begin(9600);
  float m = 0.5;      // kg
  float g = 9.81;
  float d = 0.05;     // m, CoG to pivot edge
  for (int hMm = 10; hMm <= 50; hMm += 10) {
    float h = hMm / 1000.0;
    float fTip = m * g * d / h;
    Serial.print("Push at ");
    Serial.print(hMm);
    Serial.print(" mm needs ");
    Serial.print(fTip, 1);
    Serial.println(" N to tip");
  }
}

void loop() {}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Mounting the battery on top of the robot 'because it fits there'.",
        why: "The battery is one of the heaviest parts; up high it raises h_cg, making wheelies and tipping far more likely.",
        fix: "Mount the battery as low as possible, ideally between or just ahead of the drive wheels.",
      },
      {
        mistake: "CoG behind the drive axle on a rear-drive robot.",
        why: "With little or no weight in front of the pivot, even mild acceleration lifts the wedge off the ring.",
        fix: "Keep the CoG ahead of the rear support and check μ x h_cg < d.",
      },
      {
        mistake: "Tall sensor towers or brackets that an opponent's wedge can push high up.",
        why: "Tipping force falls in proportion to contact height, so a high contact point is an easy lever for the opponent.",
        fix: "Keep everything low and inside the wedge profile; recess sensors.",
      },
    ],
    keyTakeaways: [
      "A robot is stable while its CoG stays above the support polygon.",
      "Tipping force F_tip = m g d / h - low contacts and wide bases resist tipping.",
      "Wheelies happen when μ x h_cg > d; lower or move the CoG forward.",
      "Measure your CoG with two scales rather than guessing.",
      "Heavy parts (battery, motors) belong as low as possible.",
    ],
    relatedComponents: ["Ball Caster Wheels", "LiPo 2S Battery", "N20 Micro Metal Gear Motor"],
    youtubeSearch: "center of gravity tipping stability robot design explained",
    quiz: [
      {
        type: "calculate",
        prompt:
          "A 0.5 kg robot has its CoG 5 cm (horizontally) from the pivot edge. An opponent pushes horizontally at a height of 2.5 cm. Using g = 9.81 m/s², what push is needed to tip it?",
        options: ["2.45 N", "9.81 N", "4.9 N", "19.6 N"],
        answerIndex: 1,
        explanation:
          "F_tip = m g d / h = 0.5 x 9.81 x 0.05 / 0.025 = 9.81 N. 2.45 N inverts the ratio (h/d instead of d/h); 4.9 N is just the weight m g; 19.6 N doubles the correct answer. Because the push acts lower than the CoG's lever distance, more force than the robot's weight is needed to tip it.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "Which change most increases a sumo robot's resistance to being tipped over by an opponent?",
        options: [
          "Adding a tall mast for the sensors",
          "Using a smaller-capacity battery to save weight",
          "Moving the motors further up inside the chassis",
          "Lowering the centre of gravity and widening the support base",
        ],
        answerIndex: 3,
        explanation:
          "Tipping resistance depends on m g d / h: a wider base increases d and low contact/CoG keeps h small. A tall mast gives the opponent a high lever point, raising the motors raises the CoG, and removing weight reduces m, all of which make tipping easier.",
        difficulty: 1,
      },
      {
        type: "identify-component",
        prompt:
          "A small steel ball held in a socket so it can roll in any direction is used as the third ground contact on a two-wheel-drive robot. What is this part called?",
        options: ["Mecanum wheel", "Omni wheel", "Ball caster", "Rubber tyre"],
        answerIndex: 2,
        explanation:
          "A ball caster is a single ball in a housing that rolls in any direction, giving a low-friction third support point. Omni and mecanum wheels have small rollers around a wheel rim and are normally driven wheels. In sumo many designs replace casters with a low skid or the wedge itself so the opponent cannot lift the robot easily.",
        difficulty: 1,
      },
      {
        type: "predict-movement",
        prompt:
          "A rear-wheel-drive sumo robot has a tall battery mounted high and slightly behind the rear axle. At the start signal it launches at full power on very grippy tyres. What is most likely to happen?",
        options: [
          "The front lifts (a wheelie), so the wedge leaves the ring surface",
          "The robot tips over sideways",
          "The rear lifts and the robot nose-dives",
          "Nothing - CoG position only matters when standing still",
        ],
        answerIndex: 0,
        explanation:
          "Acceleration produces an inertial force at the CoG pointing backward. With a high CoG close to or behind the rear support, μ x h_cg > d, so the robot rotates backward about the rear wheels and the front lifts. Sideways tipping needs a sharp turn, and a nose-dive happens under hard braking, not acceleration. CoG position matters most during dynamic manoeuvres.",
        difficulty: 2,
      },
    ],
  }),

  // ───────────────────────────── 24. Advanced Control Logic ─────────────────────────────
  defineTopic("sumo", 24, {
    slug: "advanced-control-logic",
    title: "Advanced Control Logic",
    minutes: 15,
    summary:
      "Structuring a sumo robot's brain as a prioritised, non-blocking finite state machine with a correct start delay, sensor confidence counters and smooth steering.",
    introduction:
      "As soon as a sumo robot has edge sensors, opponent sensors, bumpers and a start button, 'if this then that' code becomes a tangle. A finite state machine (FSM) keeps it clear: the robot is always in exactly one state (waiting, counting down, searching, attacking, escaping), each state has its own behaviour, and transitions happen for clearly defined reasons in a clear priority order. This topic shows how to build one properly with millis(), including the competition start delay and techniques for filtering noisy sensors.",
    beginner:
      "Think of a traffic light. At any moment it is in exactly one state - red, amber or green - and it moves to the next state only when a timer runs out or a button is pressed. Nobody has to think about 'what if it is red and green at the same time', because that cannot happen.\n\nA sumo robot's program works best the same way. Instead of one giant pile of if-statements, you list the states the robot can be in: WAITING for the start button, COUNTDOWN (the rules usually require a delay before moving - commonly 5 seconds in mini-sumo), SEARCH, ATTACK and ESCAPE. In each state the robot does one simple job. Rules decide when to change state: 'if an edge sensor sees white, go to ESCAPE - no matter what'.\n\nOrder matters, like at a hospital emergency room where the most serious case is treated first. Staying in the ring beats everything, so the edge check comes first. Then attacking a seen opponent. Searching is what you do when nothing more important is happening.\n\nThe last ingredient is never 'freezing'. Instead of delay(), each state checks the clock with millis(), so the robot can look at its sensors hundreds of times per second while it waits.",
    technical: [
      {
        heading: "FSM structure and priorities",
        body:
          "A typical sumo FSM:\n\n- WAIT_BUTTON: motors off; on start button -> COUNTDOWN.\n- COUNTDOWN: motors off; after the start delay -> SEARCH (or a scripted opening move).\n- SEARCH: search pattern; confirmed opponent -> ATTACK.\n- ATTACK: track and push; opponent lost for some time -> SEARCH.\n- ESCAPE: reverse/turn away from edge; timer done -> SEARCH.\n\nPriority order each loop: (1) edge -> ESCAPE, (2) confirmed opponent -> ATTACK, (3) otherwise continue the current state. Store the time of each state entry (stateStart = millis()) so each state can time itself with millis() - stateStart, which also stays correct when millis() rolls over after about 49.7 days because unsigned subtraction wraps.",
      },
      {
        heading: "The start delay done correctly",
        body:
          "Common mini-sumo rules require the robot to wait 5 seconds after the start signal before moving; your club's rulebook takes precedence over any example here. The delay must be measured from the button press (or start module signal), not from power-on: record startTime = millis() when the button is pressed and wait until millis() - startTime >= 5000. Code such as if (millis() < 5000) measures from reset, so if the robot is switched on and the button is pressed later, it moves immediately - a false start. Keep the motors explicitly stopped during the countdown and debounce the button.",
      },
      {
        heading: "Sensor confidence and hysteresis",
        body:
          "Raw sensor decisions flicker. Two simple tools:\n\n- Confidence counter: increment while a sensor detects, reset to 0 when it does not; act only when the counter reaches N (for example 2-3 consecutive readings). This rejects single-sample noise at the cost of N loop periods of delay.\n- Hysteresis: different thresholds for entering and leaving a condition (for example seen above 250, lost below 200).\n- Memory with timeout: remember the last side the opponent was seen for a few hundred milliseconds, so a brief loss during an attack does not trigger a full search.",
      },
      {
        heading: "Smooth control inside states",
        body:
          "Within ATTACK, proportional steering (steer = Kp x (right - left)) keeps the opponent centred more smoothly than bang-bang left/right turns. Limit how fast PWM can change per loop (slew-rate limiting) to reduce wheelspin and current spikes. Measure your loop time with micros(): with a few analogRead() calls (each roughly 0.1 ms on the Uno) the loop should run in about 1 ms; long pulseIn() timeouts or Serial printing can stretch it to tens of milliseconds.",
      },
    ],
    workingPrinciple:
      "The controller runs a fast, never-blocking loop. Each pass it reads all sensors, filters them into confident boolean or proportional signals, then evaluates transitions in priority order - edge first, opponent second - and finally executes the behaviour of the current state. Time is tracked with millis() relative to the moment each state was entered, so timed actions (start delay, escape reverse, spin) proceed while sensors continue to be checked. Because the robot is always in exactly one state, its behaviour is predictable, testable and easy to extend.",
    diagrams: [
      {
        kind: "flow",
        steps: [
          "WAIT_BUTTON (motors off) -- button pressed -->",
          "COUNTDOWN (motors off, 5 s from press) -- time up -->",
          "SEARCH -- opponent confirmed --> ATTACK",
          "ATTACK -- opponent lost --> SEARCH",
          "ANY RUNNING STATE -- edge sensor white --> ESCAPE",
          "ESCAPE -- reverse + spin finished --> SEARCH",
        ],
      },
      {
        kind: "signal",
        title: "Confidence counter filtering a noisy detection (illustrative)",
        xLabel: "Loop number",
        yLabel: "1 = detected",
        series: [
          { label: "Raw detection", points: [[0, 0], [1, 1], [2, 0], [3, 1], [4, 1], [5, 1], [6, 1], [7, 0], [8, 1]] },
          { label: "Confirmed (3 in a row)", points: [[0, 0], [4, 0], [5, 1], [6, 1], [7, 0], [8, 0]] },
        ],
      },
    ],
    examples: [
      {
        title: "Complete non-blocking sumo state machine",
        body:
          "A full skeleton for an Uno with a TB6612FNG, two edge sensors, two Sharp sensors and a start button on D12. The start delay is measured from the button press, edge escape has top priority and the opponent must be seen on two consecutive loops before attacking. Tune thresholds and times on your robot, and set START_DELAY_MS to your club's rule.",
        code: `const int PWMA = 5, AIN1 = 7, AIN2 = 8;
const int PWMB = 6, BIN1 = 9, BIN2 = 10;
const int STBY = 4;
const int START_BTN = 12;
const int EDGE_L = A0, EDGE_R = A1, SHARP_L = A2, SHARP_R = A3;
const int EDGE_TH = 500, SHARP_TH = 250;
const unsigned long START_DELAY_MS = 5000;

enum State { WAIT_BUTTON, COUNTDOWN, SEARCH, ATTACK, ESCAPE };
State state = WAIT_BUTTON;
unsigned long stateStart = 0;
int escapeDir = 1;
int seenCount = 0;

void setMotor(int pwmPin, int in1, int in2, int speed) {
  speed = constrain(speed, -255, 255);
  digitalWrite(in1, speed >= 0 ? HIGH : LOW);
  digitalWrite(in2, speed >= 0 ? LOW : HIGH);
  analogWrite(pwmPin, abs(speed));
}

void drive(int l, int r) {
  setMotor(PWMA, AIN1, AIN2, l);
  setMotor(PWMB, BIN1, BIN2, r);
}

void enter(State s) {
  state = s;
  stateStart = millis();
}

unsigned long timeInState() {
  return millis() - stateStart;
}

void setup() {
  int outs[] = {PWMA, AIN1, AIN2, PWMB, BIN1, BIN2, STBY};
  for (int i = 0; i < 7; i++) pinMode(outs[i], OUTPUT);
  digitalWrite(STBY, HIGH);
  pinMode(START_BTN, INPUT_PULLUP);
  drive(0, 0);
}

void loop() {
  if (state == WAIT_BUTTON) {
    drive(0, 0);
    if (digitalRead(START_BTN) == LOW) enter(COUNTDOWN);
    return;
  }
  if (state == COUNTDOWN) {
    drive(0, 0);
    if (timeInState() >= START_DELAY_MS) enter(SEARCH);
    return;
  }

  bool edgeL = analogRead(EDGE_L) < EDGE_TH;
  bool edgeR = analogRead(EDGE_R) < EDGE_TH;
  bool oppL = analogRead(SHARP_L) > SHARP_TH;
  bool oppR = analogRead(SHARP_R) > SHARP_TH;

  if (oppL || oppR) {
    if (seenCount < 10) seenCount++;
  } else {
    seenCount = 0;
  }

  // Priority 1: stay in the ring
  if ((edgeL || edgeR) && state != ESCAPE) {
    escapeDir = edgeL ? 1 : -1;
    enter(ESCAPE);
  }

  switch (state) {
    case ESCAPE:
      if (timeInState() < 200) drive(-255, -255);
      else if (timeInState() < 400) drive(200 * escapeDir, -200 * escapeDir);
      else enter(SEARCH);
      break;
    case SEARCH:
      drive(130, -130);
      if (seenCount >= 2) enter(ATTACK);   // Priority 2: confirmed opponent
      break;
    case ATTACK: {
      int steer = 0;
      if (oppL && !oppR) steer = -60;
      if (oppR && !oppL) steer = 60;
      drive(220 + steer, 220 - steer);
      if (seenCount == 0) enter(SEARCH);
      break;
    }
    default:
      break;
  }
}`,
      },
      {
        title: "Measuring loop time",
        body:
          "Add this to any sketch to see how long one loop takes. If the worst case is tens of milliseconds, look for delay(), long pulseIn() timeouts or heavy Serial printing.",
        code: `unsigned long worstUs = 0;
unsigned long lastReport = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  unsigned long t0 = micros();

  // ---- your sensor reading and state machine here ----
  analogRead(A0);
  analogRead(A1);
  analogRead(A2);
  analogRead(A3);

  unsigned long dt = micros() - t0;
  if (dt > worstUs) worstUs = dt;
  if (millis() - lastReport >= 1000) {
    lastReport = millis();
    Serial.print("worst loop us: ");
    Serial.println(worstUs);
    worstUs = 0;
  }
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Measuring the start delay with if (millis() < 5000).",
        why: "millis() counts from power-on/reset, so if the button is pressed more than 5 s after switching on, the robot moves instantly - a false start.",
        fix: "Record startTime = millis() when the start signal arrives and compare millis() - startTime.",
      },
      {
        mistake: "Checking for the opponent before checking the edge.",
        why: "If both are true in the same loop the robot keeps attacking straight out of the ring.",
        fix: "Evaluate transitions in priority order: edge, then opponent, then everything else.",
      },
      {
        mistake: "Forgetting break in a switch-based state machine.",
        why: "Execution falls through into the next case, running two states' behaviour in one loop.",
        fix: "End every case with break (and use braces when a case declares variables).",
      },
      {
        mistake: "Acting on a single sensor sample.",
        why: "One noisy reading sends the robot charging at nothing or abandoning a real target.",
        fix: "Use confidence counters, hysteresis and a short memory of the last detection.",
      },
    ],
    keyTakeaways: [
      "A finite state machine keeps the robot in exactly one well-defined state at a time.",
      "Check transitions in priority order: edge first, opponent second.",
      "Time everything with millis() relative to state entry - never block with delay().",
      "Measure the start delay from the start signal, not from power-on; the club rulebook sets the exact delay.",
      "Filter decisions with confidence counters and hysteresis.",
    ],
    relatedComponents: ["Arduino Uno R3", "TB6612FNG", "Sharp GP2Y0A21YK0F", "TCRT5000", "Push Button Switch"],
    youtubeSearch: "Arduino finite state machine millis non blocking robot",
    quiz: [
      {
        type: "code-output",
        prompt: "A confidence counter requires three detections in a row. What does this print?",
        code: `void setup() {
  Serial.begin(9600);
  bool samples[6] = {true, true, false, true, true, true};
  int hits = 0;
  int detections = 0;
  for (int i = 0; i < 6; i++) {
    if (samples[i]) hits++;
    else hits = 0;
    if (hits == 3) detections++;
  }
  Serial.println(detections);
}

void loop() {}`,
        options: ["0", "2", "1", "5"],
        answerIndex: 2,
        explanation:
          "hits goes 1, 2, then resets to 0 at index 2 (false), then 1, 2, 3. It equals 3 only at index 5, so detections = 1. Answering 5 counts every true sample; answering 2 forgets that the false sample resets the counter. That reset is exactly what makes the counter reject brief, noisy detections.",
        difficulty: 2,
      },
      {
        type: "debug-code",
        prompt:
          "At a competition the robot is switched on, placed in the ring, and 20 seconds later the start button is pressed. The robot moves instantly and is disqualified for a false start. What is the bug?",
        code: `const int START_PIN = 12;
bool started = false;

void fight() { /* strategy */ }
void stopMotors() { /* both motors off */ }

void setup() {
  pinMode(START_PIN, INPUT_PULLUP);
}

void loop() {
  if (digitalRead(START_PIN) == LOW) started = true;
  if (!started) { stopMotors(); return; }
  if (millis() < 5000) { stopMotors(); return; }
  fight();
}`,
        options: [
          "The 5 s is measured from power-on, not from the button press; save startTime = millis() on the press and wait until millis() - startTime >= 5000",
          "INPUT_PULLUP makes the button read HIGH when pressed",
          "millis() overflows after 5 seconds",
          "stopMotors() is called too often",
        ],
        answerIndex: 0,
        explanation:
          "millis() counts from reset. Twenty seconds after power-on, millis() < 5000 is already false, so the moment started becomes true, fight() runs. The delay must be measured from the press. With INPUT_PULLUP a pressed button reads LOW, which the code handles correctly, and millis() only overflows after about 49.7 days.",
        difficulty: 2,
      },
      {
        type: "predict-movement",
        prompt:
          "In the same loop, the edge sensor sees white AND the opponent sensor sees the opponent straight ahead. What does the robot do?",
        code: `if (edgeSeen) state = ESCAPE;
else if (opponentSeen) state = ATTACK;

if (state == ESCAPE) drive(-255, -255);
else if (state == ATTACK) drive(255, 255);`,
        options: [
          "Charges forward at full speed toward the opponent",
          "Reverses at full speed, away from the edge",
          "Stops both motors",
          "Alternates between forward and reverse every loop",
        ],
        answerIndex: 1,
        explanation:
          "The edge test comes first in the if/else-if chain, so state becomes ESCAPE and the opponent test is skipped. ESCAPE drives both wheels backward at full speed. Charging would only happen if the opponent check came first - which would push the robot itself over the edge. Nothing in this code stops the motors or alternates between states.",
        difficulty: 1,
      },
      {
        type: "mcq",
        prompt: "Why is a millis()-based state machine better than a sequence of delay() calls for a sumo robot?",
        options: [
          "delay() uses more battery power",
          "millis() makes the motors spin faster",
          "delay() is not allowed in competition rules",
          "The loop keeps running, so edge and opponent sensors are checked continuously while timed actions are in progress",
        ],
        answerIndex: 3,
        explanation:
          "delay() stops the program, so nothing is read during the wait; a millis()-based design lets timed actions continue while the loop checks every sensor hundreds of times per second. delay() does not change power use or motor speed, and rules judge the robot's behaviour, not which Arduino functions it calls.",
        difficulty: 1,
      },
    ],
  }),

  // ───────────────────────────── 25. Testing ─────────────────────────────
  defineTopic("sumo", 25, {
    slug: "testing",
    title: "Testing",
    minutes: 12,
    summary:
      "A systematic test plan for sumo robots - from single components on the bench to full practice matches - so problems are found in the workshop, not in the ring.",
    introduction:
      "Most sumo matches are lost to problems that a test would have caught: a motor wired backwards, an edge sensor that cannot see the border under bright lights, a start delay that is too short, or a battery that sags after one minute. Testing is not 'drive it around and see'. It is a planned series of checks with clear pass/fail criteria, done in the right order. This topic gives you that plan, the tools you need, and code to make testing fast.",
    beginner:
      "Imagine a pilot before take-off. They do not just start the engines and hope - they walk through a checklist: fuel, flaps, instruments, radio. Each item is checked on its own, so if something is wrong they know exactly what. Only then do they taxi, and only then do they fly.\n\nTesting a sumo robot works the same way. Start small: does each sensor give sensible numbers on the Serial Monitor? Does each motor spin the right way when told 'forward'? Then test groups of parts together: does the robot reverse when an edge sensor sees white? Does it turn toward an object placed on its left? Finally test the whole robot in realistic conditions: on the real dohyo, with the real lighting, against a real opponent or a weighted box, for a full match length.\n\nThe golden rules: change one thing at a time, write down what you changed and what happened, and always test on the surface and under the conditions you will compete on. A test that passes on your desk but fails in the arena is not a pass.",
    technical: [
      {
        heading: "Test levels",
        body:
          "- Component tests (wheels off the ground): each sensor's raw values on black, white, with and without a target at known distances; each motor's direction and speed at several PWM values; battery voltage at rest.\n- Subsystem tests: edge escape from different approach angles and speeds; opponent tracking with a box moved by hand; start delay timing.\n- System tests: practice matches against another robot or a weighted box; several back-to-back matches to check heating and battery sag.\n\nDefine pass/fail before testing, for example: 'Edge escape: robot stays inside the ring in 20 of 20 approaches at full speed from 0°, 30° and 60°.'",
      },
      {
        heading: "Electrical checks with a multimeter",
        body:
          "- Battery voltage at rest and while the motors push against a wall (load). The difference shows how much the supply sags.\n- 5 V rail at the Arduino and sensors under load - it should stay close to 5 V.\n- Continuity of every ground connection.\n- Motor current: a multimeter in series on its 10 A range can measure running current; stall currents can exceed meter or fuse ratings, so measure stall briefly or with a clamp meter.\n\nWorked example: a 7.4 V pack with 0.15 Ω total internal and wiring resistance delivering 4 A in a push drops 4 x 0.15 = 0.6 V, so the terminal voltage is about 6.8 V.",
      },
      {
        heading: "Timing and behaviour tests",
        body:
          "- Start delay: film the start with a phone and count frames, or use a stopwatch over several trials; verify the delay required by your club's rules (commonly 5 s in mini-sumo) is met with a small safety margin.\n- Reaction time: drive at the line at full speed and measure how far past the white border the front travels before reversing.\n- Loop time: log worst-case loop time with micros(); a sudden jump points to a blocking call.\n- Serial logging: print compact CSV lines (time, state, sensor values) so the Serial Plotter or a spreadsheet can show what the robot 'thought' during a test run. Remember that D0/D1 are used by USB serial.",
      },
      {
        heading: "Recording results",
        body:
          "Keep a test log: date, code version, battery voltage, test, result, notes. Change one variable at a time (threshold, PWM, timing), and re-run the same test after each change. When a match goes wrong, the log tells you whether it is a new problem or an old one coming back.",
      },
    ],
    workingPrinciple:
      "Testing works by isolating parts of the system so that each failure has only a few possible causes. Components are verified first against known inputs (black/white surfaces, objects at measured distances, known PWM values), then combined into subsystems whose behaviour is checked against written pass/fail criteria, and finally the full robot is exercised in competition-like conditions. Measurements (multimeter readings, Serial logs, video timing) replace guesses, and a test log links every change to its effect.",
    diagrams: [
      {
        kind: "flow",
        steps: [
          "Component tests: sensors and motors, wheels off the ground",
          "Electrical checks: battery and 5 V rail under load, grounds",
          "Subsystem tests: edge escape, tracking, start delay",
          "System tests: practice matches on the real dohyo",
          "Log results, change ONE thing, re-test",
        ],
      },
      {
        kind: "pinout",
        componentId: "tb6612fng",
        highlight: ["STBY", "PWMA", "PWMB"],
      },
    ],
    examples: [
      {
        title: "Motor direction and speed test",
        body:
          "Lift the robot so the wheels are off the ground. Each motor runs forward slow, forward fast, then reverse, with a label printed first so you can check direction against what the code intended.",
        code: `const int PWMA = 5, AIN1 = 7, AIN2 = 8;
const int PWMB = 6, BIN1 = 9, BIN2 = 10;
const int STBY = 4;

void setMotor(int pwmPin, int in1, int in2, int speed) {
  digitalWrite(in1, speed >= 0 ? HIGH : LOW);
  digitalWrite(in2, speed >= 0 ? LOW : HIGH);
  analogWrite(pwmPin, abs(speed));
}

void runStep(const char *label, int l, int r) {
  Serial.println(label);
  setMotor(PWMA, AIN1, AIN2, l);
  setMotor(PWMB, BIN1, BIN2, r);
  delay(1500);
  setMotor(PWMA, AIN1, AIN2, 0);
  setMotor(PWMB, BIN1, BIN2, 0);
  delay(700);
}

void setup() {
  int outs[] = {PWMA, AIN1, AIN2, PWMB, BIN1, BIN2, STBY};
  for (int i = 0; i < 7; i++) pinMode(outs[i], OUTPUT);
  digitalWrite(STBY, HIGH);
  Serial.begin(9600);
}

void loop() {
  runStep("LEFT forward slow", 100, 0);
  runStep("LEFT forward fast", 255, 0);
  runStep("LEFT reverse", -150, 0);
  runStep("RIGHT forward slow", 0, 100);
  runStep("RIGHT forward fast", 0, 255);
  runStep("RIGHT reverse", 0, -150);
}`,
      },
      {
        title: "CSV sensor logger for the Serial Plotter",
        body:
          "Prints all sensors on one comma-separated line every 20 ms. Open Tools > Serial Plotter to see the curves, or copy the Serial Monitor output into a spreadsheet.",
        code: `void setup() {
  Serial.begin(115200);
}

void loop() {
  static unsigned long last = 0;
  if (millis() - last >= 20) {
    last = millis();
    Serial.print(analogRead(A0));   // edge left
    Serial.print(",");
    Serial.print(analogRead(A1));   // edge right
    Serial.print(",");
    Serial.print(analogRead(A2));   // Sharp left
    Serial.print(",");
    Serial.println(analogRead(A3)); // Sharp right
  }
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Testing edge sensors only on a printed sheet at home.",
        why: "The real dohyo's surface, border width and the venue lighting can give very different readings.",
        fix: "Calibrate and test on the actual (or an identical) ring under similar lighting, and re-check at the venue.",
      },
      {
        mistake: "Changing several things between tests.",
        why: "If behaviour improves or worsens you cannot tell which change caused it.",
        fix: "Change one variable at a time and log each result.",
      },
      {
        mistake: "Testing only with a freshly charged battery.",
        why: "Motor speeds, timings and sensor supply all change as the battery discharges.",
        fix: "Repeat key tests at mid and low charge; record battery voltage in the test log.",
      },
      {
        mistake: "Connecting sensors to D0/D1 and then debugging with Serial.",
        why: "D0/D1 are the USB serial RX/TX pins, so the sensor and the serial data interfere with each other.",
        fix: "Keep D0/D1 free for USB serial.",
      },
    ],
    keyTakeaways: [
      "Test in layers: components, then subsystems, then the full robot.",
      "Write pass/fail criteria before you test.",
      "Measure battery and 5 V rail under load, not just at rest.",
      "Always test on the real surface, lighting and battery conditions.",
      "Change one thing at a time and keep a test log.",
    ],
    relatedComponents: ["Digital Multimeter", "Arduino Uno R3", "TB6612FNG", "TCRT5000", "Sharp GP2Y0A21YK0F"],
    youtubeSearch: "how to test and debug a sumo robot Arduino serial plotter",
    quiz: [
      {
        type: "find-wrong-connection",
        prompt:
          "During the motor test, neither motor moves, although the code runs and the Serial labels print. The TB6612FNG is wired as shown. Which connection is wrong or missing?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "bat", label: "Battery +", x: 40, y: 30 },
            { id: "vm", label: "TB6612 VM", x: 200, y: 30 },
            { id: "vcc", label: "TB6612 VCC", x: 200, y: 80 },
            { id: "pwma", label: "TB6612 PWMA", x: 200, y: 130 },
            { id: "stby", label: "TB6612 STBY", x: 200, y: 180 },
            { id: "u5", label: "Uno 5V", x: 360, y: 80 },
            { id: "d5", label: "Uno D5", x: 360, y: 130 },
            { id: "d4", label: "Uno D4", x: 360, y: 180 },
          ],
          edges: [
            { from: "bat", to: "vm" },
            { from: "u5", to: "vcc" },
            { from: "d5", to: "pwma" },
            { from: "d4", to: "stby", label: "not connected", wrong: true, color: "red" },
          ],
        },
        options: [
          "Battery + connected to VM",
          "PWMA connected to D5",
          "STBY is not connected, so the driver stays in standby; it must be driven HIGH",
          "VCC connected to Uno 5V",
        ],
        answerIndex: 2,
        explanation:
          "The TB6612FNG's outputs are disabled while STBY is LOW, and an unconnected STBY is not a reliable HIGH. Connect it to D4 (set HIGH in code) or tie it to the logic supply. VM to the battery, VCC to 5 V logic and PWMA to a PWM pin (D5) are all correct.",
        difficulty: 2,
      },
      {
        type: "identify-pin",
        prompt:
          "A student wires an edge sensor's digital output to D1 and the Serial Monitor shows garbage while the robot behaves strangely. Which Uno pins are used by USB serial and should be kept free?",
        options: ["D0 and D1", "D2 and D3", "A4 and A5", "D10 to D13"],
        answerIndex: 0,
        explanation:
          "D0 (RX) and D1 (TX) carry the serial data to the USB converter, so anything connected there interferes with Serial and uploads. D2/D3 are the external interrupt pins, A4/A5 are I2C SDA/SCL, and D10-D13 are SPI - those are only a problem if you use those buses.",
        difficulty: 1,
      },
      {
        type: "debug-code",
        prompt:
          "This speed-ramp test should make the motor speed up smoothly. Instead the motor stays off for the first half of the ramp and then jumps to full speed. What is the bug?",
        code: `const int PWM_PIN = 8;
const int IN1 = 7, IN2 = 4;

void setup() {
  pinMode(PWM_PIN, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  Serial.begin(9600);
}

void loop() {
  for (int pwm = 0; pwm <= 255; pwm += 5) {
    analogWrite(PWM_PIN, pwm);
    Serial.println(pwm);
    delay(100);
  }
}`,
        options: [
          "The for loop should count down instead of up",
          "IN1 and IN2 must both be HIGH for forward",
          "delay(100) is too short for the motor to react",
          "Pin 8 is not a PWM pin; on the Uno use 3, 5, 6, 9, 10 or 11",
        ],
        answerIndex: 3,
        explanation:
          "On the Uno only pins 3, 5, 6, 9, 10 and 11 have hardware PWM. On any other pin analogWrite() just sets the pin LOW for values below 128 and HIGH for 128 and above - exactly the off-then-full behaviour seen. Both inputs HIGH would brake the motor, not drive it, and the loop direction and delay are not the cause.",
        difficulty: 2,
      },
      {
        type: "predict-circuit",
        prompt:
          "A 2S LiPo reads 7.4 V at rest. The pack plus wiring has a total resistance of 0.15 Ω. During a push the motors draw 4 A in total. What voltage will you measure at the driver's VM terminal?",
        options: ["7.4 V", "6.8 V", "0.6 V", "8.0 V"],
        answerIndex: 1,
        explanation:
          "V = E - I x R = 7.4 - 4 x 0.15 = 7.4 - 0.6 = 6.8 V. 7.4 V ignores the internal resistance (only true with no current); 0.6 V is the voltage lost, not the voltage left; 8.0 V adds the drop instead of subtracting it. This is why you test voltage under load.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "What is the most reliable way to verify your edge thresholds before a competition?",
        options: [
          "Use the default threshold of 512 from an online tutorial",
          "Test on white paper and black tape on your desk",
          "Set them once at home and never change them",
          "Measure black and white readings on the actual ring surface under the venue's lighting",
        ],
        answerIndex: 3,
        explanation:
          "Reflectance readings depend on the exact surface, the border paint and ambient IR from the lighting, so only measurements on the real ring in real lighting are trustworthy. 512 is just mid-scale, and desk tests with paper and tape can differ greatly from the dohyo.",
        difficulty: 1,
      },
    ],
  }),

  // ───────────────────────────── 26. Optimisation ─────────────────────────────
  defineTopic("sumo", 26, {
    slug: "optimisation",
    title: "Optimisation",
    minutes: 13,
    summary:
      "Squeezing more performance from a working sumo robot: using the full weight budget, cutting electrical losses, choosing gearing, speeding up the code and keeping tyres at peak grip.",
    introduction:
      "Once your robot works reliably, optimisation turns it into a winner. The aim is not to change everything, but to find where performance is being wasted - weight left unused, volts burnt in the motor driver, loops slowed by debug printing, dusty tyres - and fix the biggest losses first. Every change should be measured, because an 'improvement' that is not measured is a guess.",
    beginner:
      "Think of a cyclist preparing for a race. They do not buy a whole new bike. They pump the tyres to the right pressure, oil the chain, remove the heavy bag from the back, and practise the start. Each change is small, but together they make a big difference - and they check their times to make sure each change actually helped.\n\nOptimising a sumo robot works the same way. A few examples:\n\n- Weight: pushing power depends on grip, and grip depends on weight. If the rules allow 500 g and your robot weighs 400 g, you are giving away grip. Add mass low down over the driving wheels.\n- Electrical losses: some motor drivers waste a couple of volts as heat. Swapping to a more efficient driver gives the motors more voltage from the same battery.\n- Code speed: printing lots of debug text slows the loop, so the robot reacts later to the edge or the opponent.\n- Tyres: dust on the tyres makes them slippery; clean them before every match.\n\nThe rule is: measure, change one thing, measure again. Keep what helps and undo what does not.",
    technical: [
      {
        heading: "Use the full weight budget",
        body:
          "Common mini-sumo rules limit the robot to 500 g and 10 x 10 cm (your club's rulebook takes precedence). Traction force is F = μ m g, so weight directly sets your pushing limit. With μ = 0.8: 400 g gives 0.8 x 0.4 x 9.81 = 3.1 N; 500 g gives 3.9 N - about 25% more push for free. Add the extra mass low and over the driven wheels (steel or brass plates under the chassis), and weigh the robot on a calibrated scale with a small safety margin under the limit.",
      },
      {
        heading: "Electrical efficiency: driver and battery",
        body:
          "The L298N uses bipolar output transistors and typically drops about 2 V at 1 A per channel. From a 7.4 V 2S LiPo the motor then sees only about 5.4 V, and each channel wastes about 2 V x 1 A = 2 W as heat (4 W for two motors). MOSFET drivers such as the TB6612FNG (about 1.2 A continuous, 3.2 A peak per channel) or DRV8833 (about 1.5 A RMS per channel, 2.7-10.8 V supply) drop only a few hundred millivolts at similar currents, so the motors run faster and stronger on the same battery - but check their current ratings against your motors' stall current.\n\nBattery: LiPo cells are 3.7 V nominal (2S = 7.4 V) and can deliver high currents. Short, thick power wires and good connectors reduce voltage sag during pushes.",
      },
      {
        heading: "Gearing: speed versus torque",
        body:
          "A higher gear reduction multiplies torque and divides speed. For sumo, you need enough wheel torque to reach the traction limit (F = μ m g) - more is wasted as wheelspin - and as much speed as possible beyond that. If your wheels spin freely when pushing a box at full power, you are at the traction limit and could trade some torque for speed; if the motors stall without wheelspin, you need more reduction (or larger motors). Smaller wheels act like extra gear reduction: torque needed at the wheel is F x r.",
      },
      {
        heading: "Faster code",
        body:
          "- analogRead() takes roughly 0.1 ms on the Uno (about 13 ADC clock cycles at 125 kHz), so eight reads cost under 1 ms.\n- Serial at 9600 baud sends about 960 characters per second (about 1 ms each). Once the 64-byte transmit buffer is full, Serial.print() waits, so printing 20 characters every loop limits you to roughly 48 loops per second. Use 115200 baud for debugging and remove prints in competition builds.\n- Keep pulseIn() timeouts short (about 5 ms covers a 77 cm ring).\n- Use integer maths where possible and avoid delay() entirely in the main loop.\n\nMeasure the worst-case loop time with micros() before and after each change.",
      },
    ],
    workingPrinciple:
      "Optimisation identifies the largest losses between the energy and information the robot has and the performance it delivers, then removes them one at a time with measurement. Mechanically, traction (μ m g) sets the pushing limit, so the weight budget and tyre condition are used fully; electrically, voltage lost in drivers and wiring is recovered by efficient MOSFET drivers and low-resistance power paths; in software, loop latency is reduced by removing blocking calls and debug output. Each change is verified with a before-and-after measurement so only real gains are kept.",
    diagrams: [
      {
        kind: "formula",
        latexish: "P_loss = V_drop × I;   V_motor = V_battery − V_drop;   F_push = μ·m·g",
        legend: {
          P_loss: "power wasted as heat in the driver (W)",
          V_drop: "driver voltage drop (about 2 V at 1 A for an L298N)",
          I: "motor current (A)",
          V_motor: "voltage actually reaching the motor",
          F_push: "traction-limited pushing force (N)",
        },
      },
      {
        kind: "flow",
        steps: [
          "Measure baseline: push force, speed, loop time, weight",
          "Pick the biggest loss (weight, driver drop, gearing, code, tyres)",
          "Change ONE thing",
          "Measure again under the same conditions",
          "Keep if better, revert if not; repeat",
        ],
      },
    ],
    examples: [
      {
        title: "Debug output that disappears in competition builds",
        body:
          "Set DEBUG to 0 before a match and every DBG() line compiles to nothing, so printing cannot slow the loop.",
        code: `#define DEBUG 1

#if DEBUG
  #define DBG(x) Serial.println(x)
#else
  #define DBG(x)
#endif

void setup() {
#if DEBUG
  Serial.begin(115200);
#endif
}

void loop() {
  int edge = analogRead(A0);
  DBG(edge);
  // ... strategy code ...
}`,
      },
      {
        title: "Weight and driver-loss calculator",
        body:
          "Compares pushing force at two robot masses and the power wasted by a driver with a given voltage drop. Plug in your own measurements.",
        code: `void setup() {
  Serial.begin(9600);
  float mu = 0.8;
  float g = 9.81;
  float m1 = 0.40, m2 = 0.50;          // kg
  Serial.print("Push at 400 g (N): ");
  Serial.println(mu * m1 * g, 2);      // 3.14
  Serial.print("Push at 500 g (N): ");
  Serial.println(mu * m2 * g, 2);      // 3.92

  float vBat = 7.4, vDrop = 2.0, iMotor = 1.0;
  Serial.print("Motor voltage (V): ");
  Serial.println(vBat - vDrop, 1);     // 5.4
  Serial.print("Loss per channel (W): ");
  Serial.println(vDrop * iMotor, 1);   // 2.0
}

void loop() {}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Optimising without measuring first.",
        why: "You cannot tell whether a change helped, and you may spend hours on something that was never the bottleneck.",
        fix: "Record a baseline (weight, speed, push test, loop time) and re-measure after each change.",
      },
      {
        mistake: "Adding weight up high to reach the limit.",
        why: "It raises the centre of gravity and can cause wheelies or tipping.",
        fix: "Add ballast low and over the driven wheels.",
      },
      {
        mistake: "Leaving Serial debug prints at 9600 baud in the competition code.",
        why: "Once the transmit buffer fills, each character costs about 1 ms, slowing reactions to the edge and opponent.",
        fix: "Use a DEBUG switch to remove prints, or at least use 115200 baud.",
      },
      {
        mistake: "Swapping in a 'faster' motor without checking the driver rating.",
        why: "A higher stall current can overheat or shut down the driver during pushes.",
        fix: "Check the new motor's stall current against the driver's continuous and peak ratings.",
      },
    ],
    keyTakeaways: [
      "Measure, change one thing, measure again.",
      "Use the full weight limit - pushing force is proportional to weight - with ballast low over the driven wheels.",
      "An L298N wastes about 2 V at 1 A; MOSFET drivers give the motors more of the battery voltage.",
      "Gear for enough torque to reach the traction limit, then maximise speed.",
      "Remove blocking calls and debug prints to keep the loop fast.",
    ],
    relatedComponents: ["L298N", "TB6612FNG", "DRV8833", "LiPo 2S Battery", "N20 Micro Metal Gear Motor"],
    youtubeSearch: "mini sumo robot optimization weight traction motor driver",
    quiz: [
      {
        type: "identify-driver",
        prompt:
          "A small dual H-bridge driver runs from a 2.7-10.8 V motor supply, uses MOSFET outputs, and controls each motor with just two inputs (IN1/IN2) - PWM is applied directly to these inputs and there is no separate PWM or STBY pin. Which driver is it?",
        options: ["L298N", "TB6612FNG", "DRV8833", "L293D"],
        answerIndex: 2,
        explanation:
          "The 2.7-10.8 V supply range, MOSFET outputs and two-input-per-bridge control with PWM on the inputs identify the DRV8833. The TB6612FNG has separate PWMA/PWMB pins and a STBY pin; the L298N and L293D are bipolar drivers with separate enable pins and much larger voltage drops.",
        difficulty: 2,
      },
      {
        type: "calculate",
        prompt:
          "An L298N drives two motors, each drawing 1 A, with a voltage drop of about 2 V per channel. How much power is wasted as heat in the driver in total?",
        options: ["2 W", "8 W", "1 W", "4 W"],
        answerIndex: 3,
        explanation:
          "P = V_drop x I per channel = 2 V x 1 A = 2 W, and there are two channels: 4 W total. 2 W counts only one motor; 8 W double-counts; 1 W halves the drop. That heat is energy the motors never receive, which is why efficient MOSFET drivers help.",
        difficulty: 2,
      },
      {
        type: "predict-circuit",
        prompt:
          "A 7.4 V battery powers two motors through an L298N. Each motor draws 1 A, and the driver drops about 2 V at this current. Approximately what voltage reaches each motor?",
        options: ["5.4 V", "7.4 V", "9.4 V", "3.7 V"],
        answerIndex: 0,
        explanation:
          "V_motor = 7.4 - 2.0 = 5.4 V. The L298N's bipolar output stage drops roughly 2 V at 1 A, so the motor never sees the full battery voltage (7.4 V). Voltage cannot increase through a driver (9.4 V), and 3.7 V is the nominal voltage of a single LiPo cell, not the result of this drop.",
        difficulty: 1,
      },
      {
        type: "identify-component",
        prompt:
          "A flat, soft-cased battery pack is labelled '2S 7.4 V' with a discharge rating marked in C (for example 30C) and has a separate balance connector. What is it?",
        options: ["9 V alkaline battery", "2S LiPo battery", "NiMH AA pack", "Lead-acid battery"],
        answerIndex: 1,
        explanation:
          "A '2S' pack is two lithium cells in series (2 x 3.7 V nominal = 7.4 V); the soft pouch, C-rating and balance lead are typical of LiPo packs. A 9 V alkaline battery cannot supply high currents, NiMH cells are 1.2 V each (so 7.4 V would not be a natural total), and lead-acid batteries are far too heavy for sumo.",
        difficulty: 1,
      },
    ],
  }),
];
