import { defineTopic } from "../define";
import type { Topic } from "../types";

export const SUMO_20: Topic[] = [
  // ───────────────────────────── 20. Defence Strategies ─────────────────────────────
  defineTopic("sumo", 20, {
    slug: "defence-strategies",
    title: "Defence Strategies",
    minutes: 11,
    summary:
      "How a sumo robot avoids being pushed out: facing threats quickly, dodging charges, escaping from the edge under pressure and denying the opponent's wedge.",
    introduction:
      "Every match has moments when your robot is the one being pushed. Good defence turns those moments into a draw or even a counter-attack. Defence in sumo is a mix of mechanical design (low wedge, good grip, nothing for the opponent to hook) and behaviour (turn to face, dodge, escape from the edge correctly). This topic covers both, with code patterns for reacting to hits from the side and rear.",
    beginner:
      "Think about a football goalkeeper. They do not just stand still waiting to be scored on. They keep facing the ball, move their feet to stay in front of it, and dive out of the way of a shot they cannot stop only if that gives them a better position. They also never step backward over their own goal line.\n\nA sumo robot defends the same way. First, it should always try to face the opponent, because its wedge, its grip and its sensors all point forward - a robot hit from the side or the back is almost helpless. Bumper switches and side sensors tell it where an attack is coming from so it can spin round quickly.\n\nSecond, it can dodge. Many robots charge straight ahead at the start. If yours steps sideways at the right moment, the attacker rushes past and you can push it from the side.\n\nThird, it must handle the edge cleverly. If you are being pushed backward and your rear sensor sees the white line, reversing (your usual escape move) would drive you straight out. Instead you drive forward hard and curve away, trying to slip off the side of the opponent's wedge.",
    technical: [
      {
        heading: "Mechanical defence",
        body:
          "- Low, sharp wedge: whoever gets under the other wins the traction battle (see Collision Mechanics). Keep the leading edge in contact with the ring surface and make the sides angled too, not vertical.\n- Grip: clean tyres and weight over the driven wheels raise your μN, the force needed to move you.\n- Nothing to hook: avoid exposed wheels, screws or brackets on the sides that an opponent's wedge can catch and lift.\n- Robustness: secure the battery and wiring so a hard hit cannot disconnect anything; a robot that resets during a hit is defenceless for the restart time.",
      },
      {
        heading: "Behavioural defence: face the threat",
        body:
          "Use side and rear sensors (bumpers or IR) to know where an attack comes from:\n\n- Left bumper -> spin left (anticlockwise) to face.\n- Right bumper -> spin right (clockwise).\n- Rear bumper -> spin 180° toward the side last seen, or drive forward and arc.\n\nTurning on the spot is fastest when both wheels run at full speed in opposite directions. Measure how long your robot takes to turn 90° and 180° at full PWM; those times set your timers. Each separate input pin lets the code know where the hit came from - wiring switches in parallel to one pin loses that information.",
      },
      {
        heading: "Dodging a charge",
        body:
          "An aggressive opponent often charges straight at your start position. If it covers the gap at 1 m/s and the gap is 30 cm, impact arrives in about 0.3 s, so a dodge must start within the first ~0.1 s. A side-step opening (turn about 45°, short burst forward, turn back) puts you beside the charging robot so you can hit its side. Dodging only works if your robot accelerates quickly and your edge sensors keep you in the ring - practise it on the real dohyo.",
      },
      {
        heading: "Edge defence under pressure",
        body:
          "Your normal edge escape is 'reverse and turn' - correct when you drive forward onto the line. When the opponent pushes you backward and a REAR sensor sees white, reversing finishes the job for them. Instead:\n\n- Drive forward at full power with a slight arc, trying to slide off one side of the opponent's wedge.\n- Do not spin in place: spinning presents your side, which is easier to push.\n- If both front and rear sensors see white at once, you are on a diagonal - prioritise moving toward the centre (forward arc away from the side with more white).",
      },
    ],
    workingPrinciple:
      "Defence relies on keeping the robot's strongest side - its wedge and driven wheels - toward the opponent and on never helping the opponent push it out. Side and rear contact sensors identify the direction of an attack, and the controller responds by rotating to face it as quickly as possible. Edge sensors are interpreted with context: a front sensor on white triggers a reverse escape, while a rear sensor on white during a push triggers a forward arcing escape. Mechanical design (low wedge, high traction, no hook points) increases the force an opponent needs to move the robot at all.",
    diagrams: [
      {
        kind: "flow",
        steps: [
          "Rear edge sensor white while being pushed? -> full power forward with arc",
          "Front edge sensor white? -> reverse and turn (normal escape)",
          "Left bumper hit? -> spin left to face",
          "Right bumper hit? -> spin right to face",
          "Rear bumper hit? -> spin 180° toward last-seen side",
          "Otherwise -> normal search / attack",
        ],
      },
      {
        kind: "circuit",
        nodes: [
          { id: "d2", label: "Uno D2 (left bumper)", x: 60, y: 40 },
          { id: "d3", label: "Uno D3 (right bumper)", x: 60, y: 110 },
          { id: "d11", label: "Uno D11 (rear bumper)", x: 60, y: 180 },
          { id: "swl", label: "Left switch NO-COM", x: 240, y: 40 },
          { id: "swr", label: "Right switch NO-COM", x: 240, y: 110 },
          { id: "swb", label: "Rear switch NO-COM", x: 240, y: 180 },
          { id: "gnd", label: "GND", x: 380, y: 110 },
        ],
        edges: [
          { from: "d2", to: "swl" },
          { from: "d3", to: "swr" },
          { from: "d11", to: "swb" },
          { from: "swl", to: "gnd" },
          { from: "swr", to: "gnd" },
          { from: "swb", to: "gnd" },
        ],
      },
    ],
    examples: [
      {
        title: "Turn to face a side or rear hit",
        body:
          "Separate bumpers on D2, D3 and D11 (INPUT_PULLUP). The robot spins toward the hit for a measured time using millis(). Replace TURN_90_MS and TURN_180_MS with values measured on your robot.",
        code: `const int PWMA = 5, AIN1 = 7, AIN2 = 8;
const int PWMB = 6, BIN1 = 9, BIN2 = 10;
const int STBY = 4;
const int BUMP_L = 2, BUMP_R = 3, BUMP_REAR = 11;
const unsigned long TURN_90_MS = 120;    // measure on your robot
const unsigned long TURN_180_MS = 240;

int turnDir = 0;                 // +1 clockwise, -1 anticlockwise, 0 none
unsigned long turnUntil = 0;

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

void setup() {
  int outs[] = {PWMA, AIN1, AIN2, PWMB, BIN1, BIN2, STBY};
  for (int i = 0; i < 7; i++) pinMode(outs[i], OUTPUT);
  digitalWrite(STBY, HIGH);
  pinMode(BUMP_L, INPUT_PULLUP);
  pinMode(BUMP_R, INPUT_PULLUP);
  pinMode(BUMP_REAR, INPUT_PULLUP);
}

void loop() {
  unsigned long now = millis();
  if (turnDir == 0) {
    if (digitalRead(BUMP_L) == LOW) { turnDir = -1; turnUntil = now + TURN_90_MS; }
    else if (digitalRead(BUMP_R) == LOW) { turnDir = 1; turnUntil = now + TURN_90_MS; }
    else if (digitalRead(BUMP_REAR) == LOW) { turnDir = 1; turnUntil = now + TURN_180_MS; }
  }
  if (turnDir != 0) {
    drive(255 * turnDir, -255 * turnDir);
    if ((long)(now - turnUntil) >= 0) turnDir = 0;
  } else {
    drive(255, 255);             // face found: attack / continue strategy
  }
}`,
      },
      {
        title: "Context-aware edge escape",
        body:
          "The escape direction depends on which sensor sees white. A rear sensor on white means 'being pushed out' - drive forward with an arc rather than reversing. Only the decision logic is shown; it prints the chosen action so you can test it by hand with the robot lifted.",
        code: `const int EDGE_FRONT = A0, EDGE_REAR = A1;
const int TH = 500;   // white reads below TH

void setup() {
  Serial.begin(9600);
}

void loop() {
  bool frontWhite = analogRead(EDGE_FRONT) < TH;
  bool rearWhite = analogRead(EDGE_REAR) < TH;
  if (rearWhite && frontWhite) Serial.println("Diagonal: forward arc toward centre");
  else if (rearWhite) Serial.println("Being pushed out: FULL FORWARD + ARC");
  else if (frontWhite) Serial.println("Front at edge: REVERSE + TURN");
  else Serial.println("Safe");
  delay(100);
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Using the same 'reverse and turn' escape for every edge sensor.",
        why: "When the rear sensor sees white because you are being pushed, reversing drives you out of the ring.",
        fix: "Choose the escape based on which sensor triggered: rear white -> drive forward with an arc.",
      },
      {
        mistake: "Spinning in place when pushed from the front near the edge.",
        why: "Spinning turns your side to the opponent's wedge, where you have the least resistance.",
        fix: "Keep facing the opponent and try to slide off its wedge with a forward arc.",
      },
      {
        mistake: "Wiring all bumpers to one input pin.",
        why: "The robot knows it was hit but not where, so it cannot turn the right way.",
        fix: "One pin per bumper (side and rear), each with INPUT_PULLUP.",
      },
    ],
    keyTakeaways: [
      "Always try to face the opponent - your wedge, grip and sensors all point forward.",
      "Side and rear sensors tell you where an attack came from so you can spin to face it.",
      "Dodging a straight charge can turn defence into a side attack.",
      "When pushed backward to the edge, drive forward with an arc - never reverse.",
      "Mechanical defence (low wedge, good grip, no hook points) matters as much as code.",
    ],
    relatedComponents: ["Micro Switch", "TCRT5000", "TB6612FNG", "Arduino Uno R3"],
    youtubeSearch: "sumo robot defence strategy dodge edge escape",
    quiz: [
      {
        type: "predict-movement",
        prompt:
          "The rear bumper is pressed. In the example code this sets turnDir = 1 and turnUntil = now + TURN_180_MS, then runs drive(255 * turnDir, -255 * turnDir). What does the robot do for the next 240 ms?",
        options: [
          "Reverses into the attacker",
          "Drives straight forward away from the attacker",
          "Spins anticlockwise (left) on the spot",
          "Spins clockwise (right) on the spot by about 180° to face the attacker",
        ],
        answerIndex: 3,
        explanation:
          "turnDir = 1 gives drive(255, -255): left wheel forward, right wheel backward, so the robot rotates clockwise on the spot. Running for TURN_180_MS (the measured half-turn time) leaves it facing backward - toward the attacker. An anticlockwise spin would need turnDir = -1, and neither straight option matches opposite wheel directions.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt:
          "Your robot is being pushed backward by the opponent and the REAR edge sensor sees the white border. Which response gives the best chance of staying in the ring?",
        options: [
          "Reverse at full power, as in the normal edge escape",
          "Stop the motors to save the battery",
          "Drive forward at full power with a slight arc to slide off the opponent's wedge",
          "Spin on the spot as fast as possible",
        ],
        answerIndex: 2,
        explanation:
          "Driving forward hard resists the push and the arc helps you slip sideways off the opponent's wedge. Reversing would drive you out yourself; stopping removes all resistance; spinning turns your weak side toward the wedge, making you easier to push out.",
        difficulty: 2,
      },
      {
        type: "predict-circuit",
        prompt:
          "Left and right bumper switches both have COM -> GND, and both NO terminals are connected to the same pin D5, configured with INPUT_PULLUP. Only the LEFT switch is pressed. What happens?",
        options: [
          "D5 reads HIGH because only one switch is closed",
          "D5 reads LOW, but the code cannot tell whether the left or right switch was pressed",
          "D5 reads LOW and the code can tell it was the left switch",
          "The pin is short-circuited and the Arduino resets",
        ],
        answerIndex: 1,
        explanation:
          "The switches are in parallel: closing either one connects D5 to GND, so it reads LOW. Both produce exactly the same signal, so the program cannot know which side was hit - use one pin per switch. There is no short: the only current is through the internal pull-up (a fraction of a milliamp).",
        difficulty: 2,
      },
      {
        type: "code-output",
        prompt: "A defence routine uses a switch statement. What does this print?",
        code: `void setup() {
  Serial.begin(9600);
  int state = 1;
  int moves = 0;
  switch (state) {
    case 0: moves += 1;
    case 1: moves += 10;
    case 2: moves += 100;
      break;
    case 3: moves += 1000;
  }
  Serial.println(moves);
}

void loop() {}`,
        options: ["110", "10", "111", "1110"],
        answerIndex: 0,
        explanation:
          "state = 1 jumps to case 1 (moves = 10). There is no break, so execution 'falls through' into case 2 (moves = 110), where break stops it. Case 0 is never executed because the jump goes straight to case 1, and case 3 is after the break. Answering 10 forgets fall-through - a classic bug in state machines.",
        difficulty: 3,
      },
    ],
  }),

  // ───────────────────────────── 21. Arena Navigation ─────────────────────────────
  defineTopic("sumo", 21, {
    slug: "arena-navigation",
    title: "Arena Navigation",
    minutes: 12,
    summary:
      "Knowing where you are on the dohyo: ring geometry, opening moves, dead reckoning with wheel encoders, and using the edge line as a reference.",
    introduction:
      "A sumo ring is small and round, and the white border is the only fixed landmark. Good arena navigation means your robot knows roughly where it is and which way it is facing, so it can make deliberate opening moves, return to the centre after an escape, and avoid wasting time near the edge. This topic covers ring geometry, how to turn wheel rotation into distance and angle, why timed moves drift, and how encoders help.",
    beginner:
      "Imagine walking around your bedroom in the dark. You can still get from the bed to the door by counting steps and remembering how far you have turned - but each step is a little different, so after a while you bump into furniture. When you touch a wall you suddenly know exactly where you are again and can correct yourself.\n\nA sumo robot navigates in the same way. Counting steps is called dead reckoning: if the robot knows how many times its wheels have turned, it can work out how far it has moved and how much it has rotated. Timing is a rougher version: 'drive forward for half a second' should move about the same distance each time, but a weaker battery or a slippery spot changes it.\n\nThe white border is the robot's wall to touch. When an edge sensor sees it, the robot knows it is at the edge, and roughly which way it faces. From there it can turn toward the centre and drive about one radius to get back to the middle of the ring.\n\nWheel encoders are like a step counter strapped to each wheel - they make dead reckoning far more accurate than timing alone.",
    technical: [
      {
        heading: "Ring geometry",
        body:
          "Common mini-sumo rules use a 77 cm diameter dohyo (check your club's rulebook - it takes precedence). Radius r = 38.5 cm; circumference = π x 77 = about 242 cm. From the centre, a robot moving at 60 cm/s reaches the border in about 38.5 / 60 = 0.64 s - so navigation decisions must be fast, and every forward move must be guarded by edge sensors.\n\nRobots start behind the start (shikiri) lines near the centre. Opening moves are usually planned relative to that known start position and heading, which is the one moment in the match you know exactly where you are.",
      },
      {
        heading: "Dead reckoning: distance and rotation",
        body:
          "Distance travelled by a wheel = revolutions x π x D.\n\n- Speed: a 4 cm wheel at 300 RPM under load moves π x 4 x 300 / 60 = 62.8 cm/s.\n- Distance: a 3 cm wheel has circumference 9.42 cm, so crossing a 38.5 cm radius takes 38.5 / 9.42 = 4.1 revolutions.\n\nTurning on the spot with track width W (distance between wheel centres): each wheel travels an arc of π x W x θ/360. With W = 8 cm and θ = 90°, each wheel moves π x 8 / 4 = 6.28 cm, which is 6.28 / 9.42 = 0.67 revolutions of a 3 cm wheel. If an encoder gives 360 counts per wheel revolution (example value - depends on the encoder and gearbox), that is about 240 counts per wheel.",
      },
      {
        heading: "Why timed moves drift, and encoders",
        body:
          "Motor speed depends on battery voltage, load, temperature and tyre grip. A turn timed at full charge can be 10-20% short when the battery is low, and wheelspin adds further error. Encoders measure actual rotation: a magnetic or optical disc produces pulses read by the Arduino. On the Uno, use D2 and D3 with attachInterrupt() for the fastest, most reliable counting; keep the ISR to a single counter increment and declare the counter volatile. Share ground between the encoder and Arduino, and power the encoder from 5 V unless its documentation says otherwise.\n\nEven with encoders, errors build up (wheel slip during pushes is invisible to encoders), so re-reference whenever you hit the edge.",
      },
      {
        heading: "Using the edge as a reference",
        body:
          "When a front edge sensor sees white, the robot is at the border facing roughly outward. A reliable 'return to centre' manoeuvre: reverse briefly, turn about 150-180° (more if the opposite front sensor fired first), then drive forward roughly one radius. Which front sensor fired first tells you the approximate angle you hit the line at - if both fire together you hit it square on; if one fires long before the other you met it at a shallow angle.",
      },
    ],
    workingPrinciple:
      "The robot estimates its position and heading from known starting conditions plus wheel motion. Wheel rotation, measured by encoder pulses (or estimated from time and speed), is converted to distance with revolutions x π x D, and the difference between the left and right sides (each motor pair on a 4WD robot) gives rotation using the track width. Because these estimates drift with slip and battery voltage, the robot re-references itself whenever an edge sensor detects the white border, which marks a known distance from the centre. Navigation moves are always executed with edge sensors active.",
    diagrams: [
      {
        kind: "formula",
        latexish: "v = π·D·RPM / 60;   s_wheel(turn) = π·W·θ / 360",
        legend: {
          v: "linear speed (cm/s)",
          D: "wheel diameter (cm)",
          RPM: "wheel revolutions per minute (under load)",
          s_wheel: "distance each wheel travels when spinning on the spot",
          W: "track width between wheel centres (cm)",
          "θ": "turn angle (degrees)",
        },
      },
      {
        kind: "circuit",
        nodes: [
          { id: "enc", label: "Wheel encoder (VCC, GND, A, B)", x: 60, y: 100 },
          { id: "v5", label: "Uno 5V", x: 300, y: 30 },
          { id: "gnd", label: "Uno GND", x: 300, y: 180 },
          { id: "d2", label: "Uno D2 (INT0)", x: 300, y: 80 },
          { id: "d4", label: "Uno D4", x: 300, y: 130 },
        ],
        edges: [
          { from: "enc", to: "v5", label: "VCC" },
          { from: "enc", to: "gnd", label: "GND (common ground)" },
          { from: "enc", to: "d2", label: "channel A" },
          { from: "enc", to: "d4", label: "channel B" },
        ],
      },
    ],
    examples: [
      {
        title: "Counting encoder pulses with an interrupt",
        body:
          "Counts rising edges of channel A on D2. The ISR only increments a volatile counter; the main loop copies it with interrupts briefly disabled because a 32-bit read is not atomic on an 8-bit AVR.",
        code: `const int ENC_A = 2;
volatile long pulses = 0;

void onPulse() {
  pulses++;
}

void setup() {
  pinMode(ENC_A, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENC_A), onPulse, RISING);
  Serial.begin(9600);
}

void loop() {
  noInterrupts();
  long p = pulses;
  interrupts();
  Serial.println(p);
  delay(200);
}`,
      },
      {
        title: "Turn-angle calculator",
        body:
          "Computes how many encoder counts each wheel needs for a given spin angle. Edit the constants to match your robot.",
        code: `const float WHEEL_D_CM = 3.0;
const float TRACK_W_CM = 8.0;
const float COUNTS_PER_REV = 360.0;   // example: depends on your encoder and gearbox

long countsForTurn(float degrees) {
  float arc = 3.14159 * TRACK_W_CM * degrees / 360.0;
  float revs = arc / (3.14159 * WHEEL_D_CM);
  return (long)(revs * COUNTS_PER_REV + 0.5);
}

void setup() {
  Serial.begin(9600);
  Serial.print("90 deg: ");
  Serial.println(countsForTurn(90));    // 240
  Serial.print("180 deg: ");
  Serial.println(countsForTurn(180));   // 480
}

void loop() {}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Relying on fixed-time turns tuned with a fully charged battery.",
        why: "As the battery voltage drops the motors slow and every turn comes up short.",
        fix: "Use encoders where possible, or re-tune timings at mid-charge and re-reference at the edge.",
      },
      {
        mistake: "Using the no-load RPM from the motor listing for distance calculations.",
        why: "Under load (robot weight, friction) real RPM is noticeably lower, so predicted distances are too large.",
        fix: "Measure real speed on the dohyo: time the robot over a known distance.",
      },
      {
        mistake: "Connecting the encoder signal but not its ground to the Arduino.",
        why: "Without a shared ground reference the pulse voltages are meaningless and counts are random or zero.",
        fix: "Always connect encoder GND to Arduino GND.",
      },
      {
        mistake: "Doing long calculations or Serial prints inside the encoder ISR.",
        why: "Slow ISRs miss pulses and delay everything else in the program.",
        fix: "Only increment a volatile counter in the ISR; do maths in loop().",
      },
    ],
    keyTakeaways: [
      "A common mini-sumo ring is 77 cm across - about 0.6 s from centre to edge at typical speeds (club rules take precedence).",
      "Distance = revolutions x π x D; spin arc per wheel = π x W x θ/360.",
      "Timed moves drift with battery voltage and slip; encoders measure real rotation.",
      "On the Uno, read encoders on D2/D3 with attachInterrupt() and a volatile counter.",
      "The white edge is your landmark - use it to re-reference position and heading.",
    ],
    relatedComponents: ["Motor Encoder", "Arduino Uno R3", "TCRT5000"],
    youtubeSearch: "Arduino wheel encoder interrupt distance robot odometry",
    quiz: [
      {
        type: "calculate",
        prompt:
          "A sumo robot's 4 cm diameter wheels turn at 300 RPM under load. What is its forward speed?",
        options: ["1200 cm/s", "62.8 cm/s", "20 cm/s", "3.8 cm/s"],
        answerIndex: 1,
        explanation:
          "v = π x D x RPM / 60 = 3.1416 x 4 x 300 / 60 = 62.8 cm/s. 1200 multiplies diameter by RPM without converting minutes to seconds or including π; 20 cm/s (4 x 300 / 60) forgets that one revolution moves the robot one circumference, π x D, not one diameter. Use real loaded RPM, not the no-load figure.",
        difficulty: 2,
      },
      {
        type: "identify-pin",
        prompt:
          "You want to count encoder pulses with attachInterrupt(digitalPinToInterrupt(pin), onPulse, RISING) on an Arduino Uno. Which pin should channel A connect to?",
        options: ["A0", "D13", "D2", "D7"],
        answerIndex: 2,
        explanation:
          "On the Uno, attachInterrupt() works only on D2 (INT0) and D3 (INT1). D13, D7 and A0 can be polled with digitalRead() but are not supported by attachInterrupt() on this board, so pulses would have to be polled and could be missed at high speed.",
        difficulty: 1,
      },
      {
        type: "predict-movement",
        prompt: "The robot runs drive(200, 100) (left, right; positive = forward). How does it move?",
        options: [
          "Spins on the spot to the left",
          "Drives straight ahead",
          "Arcs forward to the left",
          "Arcs forward to the right",
        ],
        answerIndex: 3,
        explanation:
          "Both wheels go forward, so the robot moves forward, but the left wheel is twice as fast as the right. The faster outer wheel is on the left, so the path curves to the right. Spinning on the spot needs the wheels to turn in opposite directions; an arc to the left would need the right wheel faster.",
        difficulty: 1,
      },
      {
        type: "find-wrong-connection",
        prompt:
          "An encoder is connected as shown, but the pulse count stays at 0 or jumps randomly. Which connection is wrong or missing?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "enc", label: "Encoder (VCC, GND, A)", x: 60, y: 100 },
            { id: "bat", label: "Separate 5 V supply", x: 60, y: 200 },
            { id: "d2", label: "Uno D2", x: 300, y: 60 },
            { id: "ugnd", label: "Uno GND", x: 300, y: 160 },
          ],
          edges: [
            { from: "bat", to: "enc", label: "VCC and GND" },
            { from: "enc", to: "d2", label: "channel A" },
            { from: "ugnd", to: "enc", label: "not connected", wrong: true, color: "red" },
          ],
        },
        options: [
          "Channel A should go to an analog pin",
          "Encoder GND is not connected to the Arduino GND",
          "The encoder needs its own Arduino",
          "D2 must be set as OUTPUT",
        ],
        answerIndex: 1,
        explanation:
          "A voltage is always measured between two points. If the encoder's ground is not joined to the Arduino's ground, D2 has no common reference and sees floating, meaningless levels. Connect the grounds. Analog pins are not required for digital pulses, and an interrupt input must be an INPUT (often INPUT_PULLUP), never OUTPUT.",
        difficulty: 2,
      },
    ],
  }),

  // ───────────────────────────── 22. Collision Mechanics ─────────────────────────────
  defineTopic("sumo", 22, {
    slug: "collision-mechanics",
    title: "Collision Mechanics",
    minutes: 13,
    summary:
      "The physics of sumo impacts - momentum, impulse, energy and wedge forces - and the electrical shock that a collision sends through motors, drivers and batteries.",
    introduction:
      "A sumo match is a series of collisions followed by pushing. Understanding what happens in those few milliseconds of impact explains why a fast charge can knock an opponent backward, why the wedge matters so much, and why robots sometimes reset or lose power just as they hit. This topic covers momentum and impulse with worked numbers, then looks at the electrical side: stall currents, battery sag and brown-outs.",
    beginner:
      "Imagine a shopping trolley rolling into another trolley that is standing still. If the moving one is fast and heavy, the standing one gets shoved forward and both roll on together a bit more slowly. That 'oomph' that a moving object carries is called momentum - mass times speed. In a crash, momentum moves from one object to the other.\n\nIn sumo, a fast charge gives your robot momentum, so the first hit can shove the opponent back before its wheels have a chance to grip and push back. After that the contest becomes a slower pushing match, decided by grip and motor strength.\n\nCollisions also shake up your electronics. When your robot slams into the opponent, its wheels suddenly stop but the motors are still being powered. A stopped motor draws a lot of current, a bit like a water pipe suddenly opened fully. That big current pulls the battery voltage down for a moment. If the voltage dips too low, the Arduino can reset - and a robot that reboots in the middle of a push will lose. Understanding this lets you design power wiring that survives the hit.",
    technical: [
      {
        heading: "Momentum and impulse",
        body:
          "Momentum p = m x v (kg·m/s). Impulse J = F x Δt = Δp.\n\n- A 0.5 kg robot at 1.2 m/s has p = 0.6 kg·m/s.\n- Perfectly inelastic collision (robots move together afterwards): v_after = (m1 v1 + m2 v2) / (m1 + m2). A 0.5 kg robot at 1.0 m/s hitting a stationary 0.5 kg robot: v_after = 0.5 / 1.0 = 0.5 m/s.\n- Average force: if the striking robot slows from 1.0 to 0.5 m/s in 20 ms, Δp = 0.5 x 0.5 = 0.25 kg·m/s and F = 0.25 / 0.020 = 12.5 N.\n\nCompare that with the steady traction limit of about 3.9 N for a 0.5 kg robot with μ = 0.8: the impact force is briefly several times larger than what the opponent's tyres can resist, which is why a clean, square hit can slide the opponent backward.",
      },
      {
        heading: "Energy is lost, not momentum",
        body:
          "Kinetic energy E = ½ m v². Before the example collision: ½ x 0.5 x 1.0² = 0.25 J. After: ½ x 1.0 x 0.5² = 0.125 J. Half the energy becomes sound, heat and deformation, while momentum is conserved (ignoring friction during the brief impact). Practical consequences: rigid, well-fastened chassis parts transfer the shove; flexible or loose parts absorb energy and can break. Secure batteries and boards so they do not keep moving inside the robot after the chassis stops.",
      },
      {
        heading: "Wedge contact forces",
        body:
          "When a wedge touches the opponent, the contact force acts perpendicular to the wedge surface. On an inclined wedge this force has a horizontal component (pushing the opponent back) and a vertical component (lifting the opponent and pressing your front down). Lifting reduces the opponent's normal force N on its wheels and therefore its maximum traction μN; pressing your front down can increase yours if your wedge is part of the chassis. The lowest edge wins: if the opponent's wedge gets under yours, the forces reverse.",
      },
      {
        heading: "The electrical side of a collision",
        body:
          "A DC motor draws current I = (V - back-EMF) / R. Back-EMF is proportional to speed, so when the wheels stop on impact, back-EMF falls to near zero and current rises toward the stall current V / R. Example motor (illustrative): winding resistance 3 Ω at 7.4 V gives up to about 2.5 A stall per motor.\n\nThe battery's internal resistance then drops its terminal voltage: V_terminal = E - I x R_internal. If the logic supply dips below what the regulator needs, the ATmega328P's brown-out detector resets it. Fixes: bulk capacitors (for example a few hundred µF) across the motor supply near the driver, short thick power wires, a battery that can deliver the current, a driver rated for the stall current, and a ramped PWM so the current rises less abruptly.",
      },
    ],
    workingPrinciple:
      "During impact the striking robot transfers momentum to the opponent through a short, large contact force; the impulse (force x time) equals the change in momentum, and a short contact time makes the force much larger than the steady pushing force the tyres can sustain. The wedge's angled surface splits that force into a horizontal push and a vertical lift, reducing the opponent's traction. Electrically, the sudden stop removes the motors' back-EMF, so current jumps toward stall, the battery voltage sags across its internal resistance, and the power system must be designed so that the controller keeps running through the dip.",
    diagrams: [
      {
        kind: "formula",
        latexish: "p = m·v;   F·Δt = Δp;   v_after = (m₁v₁ + m₂v₂)/(m₁ + m₂)",
        legend: {
          p: "momentum (kg·m/s)",
          F: "average contact force (N)",
          "Δt": "contact time (s)",
          v_after: "common speed after a perfectly inelastic collision (m/s)",
        },
      },
      {
        kind: "signal",
        title: "Motor current around an impact (illustrative shape)",
        xLabel: "Time (ms)",
        yLabel: "Current per motor (A)",
        series: [
          {
            label: "Motor current",
            points: [[0, 0.4], [50, 0.4], [55, 1.8], [60, 2.4], [100, 2.4], [150, 2.3], [200, 2.3]],
          },
        ],
      },
    ],
    examples: [
      {
        title: "Collision calculator",
        body:
          "Computes the momentum before impact, the common speed after a perfectly inelastic collision and the average force for a given contact time. Uses float maths so nothing is truncated.",
        code: `void setup() {
  Serial.begin(9600);
  float m1 = 0.5, v1 = 1.0;    // our robot
  float m2 = 0.5, v2 = 0.0;    // opponent, standing still
  float dt = 0.020;            // contact time in seconds

  float p = m1 * v1 + m2 * v2;
  float vAfter = p / (m1 + m2);
  float force = m1 * (v1 - vAfter) / dt;

  Serial.print("Momentum (kg m/s): ");
  Serial.println(p, 3);        // 0.500
  Serial.print("Speed after (m/s): ");
  Serial.println(vAfter, 3);   // 0.500
  Serial.print("Average force (N): ");
  Serial.println(force, 1);    // 12.5
}

void loop() {}`,
      },
      {
        title: "Logging a brown-out risk",
        body:
          "Measures the battery through a 2:1 voltage divider (two equal resistors, for example 10 kΩ + 10 kΩ, so a 7.4 V pack gives about 3.7 V at A5) and records the lowest value seen. Run a few push tests and compare the minimum with what your regulator needs.",
        code: `const int VBAT_PIN = A5;
float minV = 99.0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(VBAT_PIN);
  float v = raw * 5.0 / 1023.0 * 2.0;   // undo the 2:1 divider
  if (v < minV) minV = v;
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint >= 500) {
    lastPrint = millis();
    Serial.print("Battery V: ");
    Serial.print(v, 2);
    Serial.print("  lowest: ");
    Serial.println(minV, 2);
  }
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Thinking a heavier motor always means a harder hit.",
        why: "Impact depends on the robot's total momentum (mass x speed) at contact and on contact time; a slow robot with strong motors hits softly.",
        fix: "Balance speed and torque, and keep the robot near the weight limit with mass where it helps traction.",
      },
      {
        mistake: "Powering the Arduino from the same thin wires as the motors with no capacitors.",
        why: "Stall current on impact pulls the shared supply down and the controller resets mid-push.",
        fix: "Use bulk capacitance near the driver, short thick motor wires and a regulator with enough headroom, and route logic power separately.",
      },
      {
        mistake: "Loose battery or boards held only by wires.",
        why: "On impact they keep moving, pulling connectors out or cracking solder joints.",
        fix: "Strap or bracket everything; hot glue or locking connectors on critical joints.",
      },
    ],
    keyTakeaways: [
      "Momentum p = m x v is what you deliver on impact; impulse F x Δt equals its change.",
      "Short contact times create forces several times larger than the steady traction limit.",
      "Momentum is conserved in a collision; kinetic energy is partly lost.",
      "A wedge splits contact force into push and lift, reducing the opponent's traction.",
      "Impacts cause stall currents and battery sag - design power wiring to prevent resets.",
    ],
    relatedComponents: ["TB6612FNG", "LiPo 2S Battery", "Electrolytic Capacitor", "Arduino Uno R3"],
    youtubeSearch: "momentum impulse collision physics explained robots",
    quiz: [
      {
        type: "calculate",
        prompt: "A 0.5 kg sumo robot charges at 1.2 m/s. What is its momentum?",
        options: ["0.6 kg·m/s", "0.36 kg·m/s", "2.4 kg·m/s", "1.7 kg·m/s"],
        answerIndex: 0,
        explanation:
          "p = m x v = 0.5 x 1.2 = 0.6 kg·m/s. 0.36 is the kinetic energy in joules (½ x 0.5 x 1.2²) - a different quantity with different units. 2.4 divides speed by mass instead of multiplying, and 1.7 simply adds the numbers.",
        difficulty: 1,
      },
      {
        type: "calculate",
        prompt:
          "A 0.5 kg robot moving at 1.0 m/s hits a stationary 0.5 kg robot and they move together afterwards (perfectly inelastic collision, ignore friction). What is their common speed just after impact?",
        options: ["1.0 m/s", "0.25 m/s", "0.5 m/s", "2.0 m/s"],
        answerIndex: 2,
        explanation:
          "Momentum is conserved: (0.5 x 1.0 + 0.5 x 0) / (0.5 + 0.5) = 0.5 m/s. Keeping 1.0 m/s would mean momentum doubled, which is impossible without an external force. 0.25 m/s halves the speed twice (dividing by the total mass and again by 2), which would lose momentum, and 2.0 m/s creates momentum from nothing.",
        difficulty: 2,
      },
      {
        type: "identify-driver",
        prompt:
          "A dual motor driver datasheet lists: MOSFET H-bridges, about 1.2 A continuous and 3.2 A peak per channel, separate PWMA/PWMB inputs, and a STBY pin that must be HIGH for the outputs to work. Which driver is it?",
        options: ["L298N", "DRV8833", "L293D", "TB6612FNG"],
        answerIndex: 3,
        explanation:
          "The STBY pin, separate PWMA/PWMB inputs and 1.2 A / 3.2 A ratings identify the TB6612FNG. The L298N uses bipolar outputs with ENA/ENB enables and no STBY; the DRV8833 has no separate PWM pin (PWM goes onto its IN pins) and is rated about 1.5 A RMS per channel; the L293D is a smaller bipolar driver around 600 mA per channel.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt:
          "A robot's Arduino resets every time it slams head-on into the opponent, but never while driving freely. What is the most likely cause?",
        options: [
          "The impact shakes the code out of the Arduino's memory",
          "Stall current at impact makes the battery voltage sag below what the logic supply needs, triggering a brown-out reset",
          "The edge sensors overload the analog inputs",
          "The motor driver sends a reset command",
        ],
        answerIndex: 1,
        explanation:
          "When the wheels stop, back-EMF disappears and motor current jumps toward stall. That current across the battery's internal resistance and the wiring lowers the supply voltage; if the logic rail dips too far, the microcontroller's brown-out detector resets it. Flash memory is not erased by vibration, sensors do not overload on impact, and motor drivers have no way to reset the Arduino.",
        difficulty: 2,
      },
    ],
  }),
];
