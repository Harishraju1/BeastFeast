import { defineTopic } from "../define";
import type { Topic } from "../types";

export const SUMO_17: Topic[] = [
  // ───────────────────────────── 17. Opponent Detection ─────────────────────────────
  defineTopic("sumo", 17, {
    slug: "opponent-detection",
    title: "Opponent Detection",
    minutes: 13,
    summary:
      "Combining ultrasonic and infrared distance sensors so a sumo robot knows whether the opponent is ahead, to the left, to the right, or not visible at all.",
    introduction:
      "A sumo robot that cannot find its opponent can only wander around and hope. Opponent detection turns raw sensor readings into a simple answer the strategy code can use: AHEAD, LEFT, RIGHT or NONE. In this topic you will learn how the HC-SR04 ultrasonic sensor measures distance, how to stop it from freezing your program, how to combine it with Sharp IR sensors, and how to reject false detections caused by people and objects outside the ring.",
    beginner:
      "Think of a bat flying in the dark. It shouts a very high-pitched squeak and listens for the echo. If the echo comes back quickly, the insect is close; if it takes longer, it is further away. The HC-SR04 does the same thing with sound too high for humans to hear (40 kHz). It squeaks, starts a stopwatch, and stops it when the echo returns. Sound travels at about 343 metres per second, so the time tells you the distance.\n\nOne sensor alone is like a bat with one ear - it knows something is out there, but not which side. That is why sumo robots usually carry several sensors pointing in slightly different directions: for example a Sharp IR sensor angled left, one angled right and an ultrasonic sensor in the middle. If only the left one sees something, the opponent is on the left, so the robot turns left.\n\nThe tricky part is trusting the sensors. A sensor may 'see' a judge's leg outside the ring, or briefly miss the opponent. Good detection code checks that a reading makes sense (is it inside the ring?) and that it repeats for a couple of readings before acting on it.",
    technical: [
      {
        heading: "HC-SR04 timing and distance",
        body:
          "Pins: Vcc (5 V), Trig, Echo, GND. To measure, hold Trig HIGH for at least 10 µs. The module sends a burst of 40 kHz pulses and then sets Echo HIGH until the echo returns. Echo pulse width = round-trip time.\n\nSound at about 20 °C travels 343 m/s = 0.0343 cm/µs. One-way distance d = t x 0.0343 / 2, or approximately d(cm) = t(µs) / 58.\n\n- Worked example: t = 1160 µs -> d = 1160 / 58 = 20 cm.\n- Range: about 2-400 cm; beam width roughly 15°, so it sees a cone, not a line.\n- The module's documentation suggests waiting at least about 60 ms between measurements so old echoes die away.",
      },
      {
        heading: "Never let pulseIn() block the robot",
        body:
          "pulseIn(pin, HIGH) waits for the pulse to start and end; with no timeout argument it can wait up to 1 second for a pulse to begin, and some modules output a long echo pulse when nothing is in range. While it waits, the robot cannot read edge sensors. Always pass a timeout sized to your arena: a 77 cm ring means you never care about targets beyond about 80 cm, which is a round trip of about 80 x 58 = 4640 µs, so pulseIn(ECHO, HIGH, 5000) is sensible.\n\nOn timeout pulseIn() returns 0. Your code must treat 0 as 'nothing seen', not as '0 cm - opponent touching me'.",
      },
      {
        heading: "Sensor layout and fusion",
        body:
          "A typical mini-sumo layout: left and right Sharp sensors angled about 10-20° outward, and one centre sensor (ultrasonic or Sharp). Decision table:\n\n- Centre sees -> AHEAD: charge.\n- Only left -> LEFT: turn left on the spot or arc left.\n- Only right -> RIGHT: turn right.\n- Left and right but not centre -> usually very close and wide, or two objects: drive forward slowly.\n- None -> NONE: search, but remember the last side seen and turn that way first.\n\nIR and ultrasonic fail in different ways: ultrasonic can miss angled or soft surfaces that deflect sound, while IR can struggle with very dark or shiny surfaces. Using both improves reliability. Fire multiple ultrasonic sensors one after another, never at the same time, or one will hear the other's echo (crosstalk).",
      },
      {
        heading: "Rejecting false detections",
        body:
          "- Range gate: ignore distances beyond the ring (for example > 70 cm from the robot), which removes spectators and walls.\n- Confirmation: require the same detection on 2-3 consecutive readings before switching to attack, and keep 'last seen side' for a short time after losing the target.\n- Height: aim sensors low and level so they hit the opponent's body, not the air above a flat wedge robot.\n- Start-up: some sensors give garbage for the first few readings after power-up; discard them during the start delay.",
      },
    ],
    workingPrinciple:
      "Each distance sensor reports how far the nearest object is in its own field of view: the HC-SR04 by timing an ultrasonic echo (d = t / 58 cm), the Sharp sensor by triangulating reflected IR into a voltage. The controller converts each reading into 'target present in this direction' using range gates and thresholds, confirms it across several readings, and combines the sensors with a decision table to produce one result - AHEAD, LEFT, RIGHT or NONE - plus the side where the opponent was last seen. The strategy layer then steers toward that direction.",
    diagrams: [
      {
        kind: "formula",
        latexish: "d = (t × 0.0343) / 2  ≈  t / 58",
        legend: {
          d: "distance to target in cm",
          t: "echo pulse width in microseconds",
          "0.0343": "speed of sound in cm/µs at about 20 °C",
          "/ 2": "the sound travels there and back",
        },
      },
      {
        kind: "pinout",
        componentId: "hc-sr04",
        highlight: ["TRIG", "ECHO"],
      },
      {
        kind: "flow",
        steps: [
          "Trigger ultrasonic and read echo with a 5000 µs timeout",
          "Read left and right Sharp sensors",
          "Apply range gate and thresholds (0 µs echo = nothing seen)",
          "Confirm over 2-3 readings",
          "Decide AHEAD / LEFT / RIGHT / NONE and store last side seen",
        ],
      },
    ],
    examples: [
      {
        title: "Non-blocking-friendly HC-SR04 read",
        body:
          "A 5000 µs timeout limits the worst case to about 5 ms and still covers the whole 77 cm ring. A result of 0 means 'no target'.",
        code: `const int TRIG = 12;
const int ECHO = 11;

int readCm() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long t = pulseIn(ECHO, HIGH, 5000);
  if (t == 0) return 0;         // timeout: nothing in range
  return (int)(t / 58);
}

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  Serial.begin(9600);
}

void loop() {
  int cm = readCm();
  if (cm == 0) Serial.println("no target");
  else {
    Serial.print(cm);
    Serial.println(" cm");
  }
  delay(60);   // let echoes die away before the next ping
}`,
      },
      {
        title: "Three-sensor direction decision",
        body:
          "Left and right Sharp sensors plus a centre ultrasonic sensor are fused into one direction, and the last side seen is remembered for searching.",
        code: `const int TRIG = 12, ECHO = 11;
const int SHARP_L = A2, SHARP_R = A3;
const int SHARP_TH = 250;

enum Dir { NONE, AHEAD, LEFT, RIGHT };
Dir lastSide = RIGHT;

int readCm() {
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long t = pulseIn(ECHO, HIGH, 5000);
  return t == 0 ? 0 : (int)(t / 58);
}

Dir detect() {
  int cm = readCm();
  bool c = cm > 0 && cm < 70;
  bool l = analogRead(SHARP_L) > SHARP_TH;
  bool r = analogRead(SHARP_R) > SHARP_TH;
  if (c || (l && r)) return AHEAD;
  if (l) { lastSide = LEFT; return LEFT; }
  if (r) { lastSide = RIGHT; return RIGHT; }
  return NONE;
}

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  digitalWrite(TRIG, LOW);
  Serial.begin(9600);
}

void loop() {
  Dir d = detect();
  if (d == AHEAD) Serial.println("AHEAD");
  else if (d == LEFT) Serial.println("LEFT");
  else if (d == RIGHT) Serial.println("RIGHT");
  else Serial.println(lastSide == LEFT ? "NONE (search left)" : "NONE (search right)");
  delay(60);
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Calling pulseIn() without a timeout.",
        why: "If no echo arrives, the call can block for a long time (up to 1 s waiting for a pulse to start), during which edge sensors are ignored.",
        fix: "Use pulseIn(ECHO, HIGH, 5000) or similar, sized to the ring.",
      },
      {
        mistake: "Treating a 0 result as a very close target.",
        why: "pulseIn() returns 0 on timeout, so 'nothing there' becomes '0 cm' and the robot charges at empty space.",
        fix: "Test cm > 0 && cm < limit for a valid detection.",
      },
      {
        mistake: "Triggering several ultrasonic sensors at the same time.",
        why: "Each sensor can hear the other's ping, producing false short distances (crosstalk).",
        fix: "Ping sensors one at a time with a gap, or use IR sensors for the side positions.",
      },
      {
        mistake: "No range gate.",
        why: "Sensors see referees, walls and spectators beyond the ring edge and the robot attacks them.",
        fix: "Ignore distances larger than the ring and aim sensors low and level.",
      },
    ],
    keyTakeaways: [
      "HC-SR04 distance in cm is approximately echo time in µs divided by 58.",
      "Always give pulseIn() a timeout and treat 0 as 'no target'.",
      "Several sensors at different angles tell you the direction, not just presence.",
      "Fuse IR and ultrasonic sensors because they fail in different situations.",
      "Use range gates and repeated confirmation to reject false detections.",
    ],
    relatedComponents: ["HC-SR04", "Sharp GP2Y0A21YK0F", "Arduino Uno R3"],
    youtubeSearch: "mini sumo robot opponent detection sensors ultrasonic IR Arduino",
    quiz: [
      {
        type: "calculate",
        prompt:
          "An HC-SR04 returns an echo pulse of 1160 µs. Using d(cm) ≈ t / 58, how far away is the opponent?",
        options: ["40 cm", "11.6 cm", "6.8 cm", "20 cm"],
        answerIndex: 3,
        explanation:
          "1160 / 58 = 20 cm. The divisor 58 already includes halving for the round trip (sound travels about 0.0343 cm/µs, so 1 cm out and back takes about 58 µs). 40 cm comes from forgetting the round trip (dividing by 29), and 11.6 cm simply moves the decimal point.",
        difficulty: 1,
      },
      {
        type: "predict-movement",
        prompt:
          "Only the LEFT Sharp sensor sees the opponent; the centre ultrasonic times out (cm = 0) and the right sensor sees nothing. drive(left, right) uses positive = forward. What does the robot do?",
        code: `bool c = cm > 0 && cm < 60;
if (c) drive(255, 255);
else if (l) drive(-150, 150);
else if (r) drive(150, -150);
else drive(120, -120);`,
        options: [
          "Charges straight ahead at full speed",
          "Spins anticlockwise (to the left) on the spot, toward the opponent",
          "Spins clockwise (to the right) on the spot",
          "Searches by spinning slowly clockwise",
        ],
        answerIndex: 1,
        explanation:
          "cm = 0 makes c false, so the first branch is skipped. l is true, so drive(-150, 150) runs: left wheel backward, right wheel forward, which rotates the robot anticlockwise - to the left, toward the opponent. Charging would require c to be true; the cm > 0 check stops a timeout being mistaken for a target.",
        difficulty: 2,
      },
      {
        type: "identify-component",
        prompt:
          "A blue board has two silver cylinders marked T and R and four pins labelled Vcc, Trig, Echo and GND. What is it?",
        options: ["Sharp GP2Y0A21YK0F", "TCRT5000 module", "Micro switch", "HC-SR04 ultrasonic sensor"],
        answerIndex: 3,
        explanation:
          "The two cylinders are an ultrasonic transmitter (T) and receiver (R), and Trig/Echo are the HC-SR04's trigger and echo pins. The Sharp sensor has a 3-wire analog connector and lenses, the TCRT5000 has a tiny LED/phototransistor pair, and a micro switch has COM/NO/NC terminals.",
        difficulty: 1,
      },
      {
        type: "debug-code",
        prompt:
          "When the ring is empty the robot keeps charging forward as if the opponent were right in front of it. What is the bug?",
        code: `const int TRIG = 12, ECHO = 11;

void attack() { /* full speed ahead */ }
void search() { /* slow spin */ }

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
}

void loop() {
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long t = pulseIn(ECHO, HIGH, 5000);
  int cm = t / 58;
  if (cm < 30) attack();
  else search();
}`,
        options: [
          "The trigger pulse must be 10 ms, not 10 µs",
          "On timeout pulseIn() returns 0, so cm = 0 passes cm < 30; the test should be cm > 0 && cm < 30",
          "The divisor should be 29, not 58",
          "ECHO must be configured as OUTPUT",
        ],
        answerIndex: 1,
        explanation:
          "With nothing in range, pulseIn() times out and returns 0, which gives cm = 0, and 0 < 30 is true - so the robot attacks empty space. Adding cm > 0 fixes it. A 10 µs trigger is correct, 58 is the right divisor for one-way distance, and Echo is an input because the sensor drives it.",
        difficulty: 2,
      },
    ],
  }),

  // ───────────────────────────── 18. Search Algorithms ─────────────────────────────
  defineTopic("sumo", 18, {
    slug: "search-algorithms",
    title: "Search Algorithms",
    minutes: 12,
    summary:
      "Systematic ways for a sumo robot to find an opponent it cannot see - spinning, sweeping, spiralling and using memory - without leaving the ring or wasting time.",
    introduction:
      "After the start delay, or after losing the opponent, your robot has to look for it. A good search pattern finds the opponent quickly, keeps the robot safely inside the ring, and matches the speed of its sensors. This topic compares common search patterns, shows how to check whether your sensors can keep up with your spin speed, and builds a search behaviour with millis() so it never blocks edge detection.",
    beginner:
      "Imagine you are blindfolded in a small room with a friend and allowed to peek through a narrow tube. If you spin round very fast, you will flash past your friend between peeks and miss them. If you spin slowly, you will definitely spot them but it takes longer. If you remember 'I last saw them on my left', you would turn left first.\n\nA sumo robot faces exactly this. Its sensors look in narrow directions and only update a certain number of times per second. Search algorithms are simple plans for moving so the sensors sweep the whole ring:\n\n- Spin in place: turn on the spot until something appears.\n- Sweep: turn back and forth across the front, like a lighthouse that swings instead of rotating.\n- Spiral or arc: move forward while turning, covering new parts of the ring.\n- Remember: turn first toward where the opponent was last seen.\n\nWhatever the pattern, edge detection always stays switched on, and the search stops the instant a sensor sees the opponent.",
    technical: [
      {
        heading: "Matching spin speed to sensor update rate",
        body:
          "Angle swept between readings = spin rate x sensor period. If the sensor beam is narrower than that angle, gaps appear and an opponent can hide in them.\n\nWorked example: a robot spinning at one revolution per second (360°/s) with an HC-SR04 read every 60 ms sweeps 360 x 0.060 = 21.6° between pings. The HC-SR04 beam is roughly 15° wide, so there are blind gaps of several degrees. Options: spin slower (for example 180°/s gives 10.8° per reading), use faster IR sensors (a Sharp GP2Y0A21 updates about every 40 ms), or add more sensors so their beams overlap.\n\nRule of thumb: angle per reading <= beam width.",
      },
      {
        heading: "Common search patterns",
        body:
          "- Spin search: drive(s, -s). Simple and safe because the robot stays in place; risky if the opponent attacks your side during the spin.\n- Sweep (oscillate): spin right for T ms, left for T ms. Keeps the front roughly toward the centre - good after the start when you know the opponent's starting area.\n- Arc / spiral: unequal wheel speeds, for example drive(200, 120), so the robot moves forward while turning; covers new positions but must rely on edge sensors.\n- Edge-and-turn ('bounce'): drive straight, escape at the edge, turn by a random or fixed angle, repeat.\n- Wait and react: stay still facing the opponent's start position and react only when it approaches - a valid tactic when the opponent is aggressive.\n\nMemory: store the last side the opponent was seen on and spin that way first. Most 'lost' opponents are just outside a sensor beam on that side.",
      },
      {
        heading: "Implementing search as a non-blocking state",
        body:
          "Search should be one state in the main state machine, driven by millis(). Each loop: read edge sensors (highest priority), read opponent sensors, and only then update the search motion. Keep a phase timer, for example: phase 0 = spin toward last side for up to 800 ms; phase 1 = arc forward for 600 ms; repeat. If a valid detection appears, switch immediately to ATTACK. Because nothing waits inside delay(), the robot reacts within one loop to both edges and opponents.",
      },
    ],
    workingPrinciple:
      "The search state commands motor speeds that rotate or move the robot so its narrow sensor beams sweep the arena. The sweep rate is chosen so that the angle the robot turns between sensor updates is no larger than the sensor's beam width, guaranteeing no blind gaps. Timers based on millis() switch between search phases, the last-seen direction biases the first turn, and every loop still checks edge sensors first and opponent sensors second, leaving the search the instant either needs attention.",
    diagrams: [
      {
        kind: "formula",
        latexish: "θ_gap = ω × T_sensor   (require θ_gap ≤ beam width)",
        legend: {
          "θ_gap": "angle the robot turns between two sensor readings (degrees)",
          "ω": "spin rate (degrees per second)",
          T_sensor: "time between readings (seconds)",
        },
      },
      {
        kind: "flow",
        steps: [
          "Edge sensor sees white? -> ESCAPE",
          "Opponent detected? -> ATTACK",
          "Phase 0: spin toward last-seen side (max 800 ms)",
          "Phase 1: arc forward (600 ms)",
          "Repeat phases until something is detected",
        ],
      },
    ],
    examples: [
      {
        title: "Checking your spin speed",
        body:
          "Measure how long your robot takes for one full spin at the PWM you plan to use (count 5 spins with a stopwatch and divide). Then compute degrees per reading. This sketch does the arithmetic for a given spin time and sensor period.",
        code: `void setup() {
  Serial.begin(9600);
  long spinTimeMs = 1200;      // measured: one full turn in 1.2 s
  long sensorPeriodMs = 60;    // HC-SR04 ping interval
  long degPerReading = 360L * sensorPeriodMs / spinTimeMs;
  Serial.print("Degrees between readings: ");
  Serial.println(degPerReading);   // prints 18
  if (degPerReading > 15) Serial.println("Too fast for a ~15 deg beam: slow down or add sensors");
}

void loop() {}`,
      },
      {
        title: "Two-phase search with memory",
        body:
          "Spins toward the side where the opponent was last seen, then arcs forward, all timed with millis(). Edge and opponent checks run every loop. Motor control uses a TB6612FNG with drive(left, right).",
        code: `const int PWMA = 5, AIN1 = 7, AIN2 = 8;
const int PWMB = 6, BIN1 = 9, BIN2 = 10;
const int STBY = 4;
const int EDGE_L = A0, EDGE_R = A1, SHARP_L = A2, SHARP_R = A3;
const int EDGE_TH = 500, SHARP_TH = 250;

int lastSide = 1;            // +1 right, -1 left
int phase = 0;
unsigned long phaseStart = 0;

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
}

void loop() {
  unsigned long now = millis();
  if (analogRead(EDGE_L) < EDGE_TH || analogRead(EDGE_R) < EDGE_TH) {
    drive(-255, -255);              // simple escape; see Edge Detection topic
    return;
  }
  bool l = analogRead(SHARP_L) > SHARP_TH;
  bool r = analogRead(SHARP_R) > SHARP_TH;
  if (l || r) {
    if (l && !r) lastSide = -1;
    if (r && !l) lastSide = 1;
    drive(255, 255);                // attack
    phase = 0;
    phaseStart = now;
    return;
  }
  if (phase == 0) {
    drive(140 * lastSide, -140 * lastSide);
    if (now - phaseStart >= 800) { phase = 1; phaseStart = now; }
  } else {
    drive(200, 130);
    if (now - phaseStart >= 600) { phase = 0; phaseStart = now; }
  }
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Spinning as fast as possible to 'find it quicker'.",
        why: "The robot turns more than one beam width between sensor updates, so the opponent falls into a blind gap.",
        fix: "Keep degrees-per-reading at or below the beam width; slow the spin or add sensors.",
      },
      {
        mistake: "Writing the search with long delay() calls.",
        why: "During the delay nothing is checked - the robot can arc straight out of the ring or ignore an opponent right in front.",
        fix: "Use millis() phase timers inside a state machine.",
      },
      {
        mistake: "Always searching in the same direction.",
        why: "If the opponent is just outside the beam on the left, a right spin takes almost a full revolution to find it.",
        fix: "Store the last side seen and turn that way first.",
      },
    ],
    keyTakeaways: [
      "Search patterns: spin, sweep, arc/spiral, edge-bounce and wait-and-react.",
      "Angle per reading = spin rate x sensor period; keep it at or below the beam width.",
      "Remember the last side the opponent was seen and search that way first.",
      "Search is one non-blocking state; edge escape always overrides it.",
    ],
    relatedComponents: ["HC-SR04", "Sharp GP2Y0A21YK0F", "TCRT5000", "TB6612FNG", "Arduino Uno R3"],
    youtubeSearch: "mini sumo robot search strategy state machine Arduino",
    quiz: [
      {
        type: "code-output",
        prompt: "What does this code print on an Arduino Uno?",
        code: `void setup() {
  Serial.begin(9600);
  int spinDegPerSec = 360;
  int periodMs = 60;
  int degPerReading = spinDegPerSec * periodMs / 1000;
  Serial.println(degPerReading);
}

void loop() {}`,
        options: ["21.6", "22", "-11", "21"],
        answerIndex: 3,
        explanation:
          "360 x 60 = 21600, which fits in a 16-bit int (maximum 32767). 21600 / 1000 with integer division gives 21 - the .6 is discarded, not rounded, so neither 21.6 nor 22 can be printed. If the spin rate were 720, 720 x 60 = 43200 would overflow a 16-bit int and give a negative, wrong result - use long or 720L in that case.",
        difficulty: 2,
      },
      {
        type: "predict-movement",
        prompt: "What motion does this search code produce (positive = forward)?",
        code: `unsigned long t = millis() % 600;
if (t < 300) drive(150, -150);
else drive(-150, 150);`,
        options: [
          "Drives forward in a straight line",
          "Spins continuously clockwise",
          "Rotates clockwise for 300 ms, then anticlockwise for 300 ms, sweeping back and forth in place",
          "Drives in a large circle",
        ],
        answerIndex: 2,
        explanation:
          "millis() % 600 repeats 0-599. For the first 300 ms drive(150, -150) turns the robot clockwise in place; for the next 300 ms drive(-150, 150) turns it anticlockwise by about the same angle. The result is a sweep (oscillation) around one heading. It would only spin continuously if the direction never changed, and the wheels always turn in opposite directions, so it never drives forward.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt:
          "A robot with one HC-SR04 (pinged every 60 ms, beam about 15°) spins at two revolutions per second and often fails to find a stationary opponent. What is the most likely reason?",
        options: [
          "The HC-SR04 cannot detect objects that are not moving",
          "It turns about 43° between pings, so the opponent sits in blind gaps between readings",
          "Ultrasound is blown away by the robot's rotation",
          "The robot is too far from the opponent - the HC-SR04 only reaches 20 cm",
        ],
        answerIndex: 1,
        explanation:
          "2 rev/s = 720°/s; 720 x 0.060 = 43.2° between pings, much wider than a ~15° beam, so most directions are never sampled. Ultrasonic sensors detect stationary objects fine, rotation does not 'blow away' sound at these speeds, and the HC-SR04 reaches about 4 m, far more than a sumo ring.",
        difficulty: 2,
      },
      {
        type: "debug-code",
        prompt:
          "During testing this robot sometimes arcs straight out of the ring even though its edge sensors work in other tests. What is the problem?",
        code: `bool edgeSeen() { return analogRead(A0) < 500; }
bool opponentSeen() { return analogRead(A2) > 250; }
void drive(int l, int r) { /* motor code omitted */ }

void setup() {}

void loop() {
  if (edgeSeen()) { drive(-255, -255); return; }
  if (opponentSeen()) { drive(255, 255); return; }
  drive(200, 120);   // arc
  delay(1500);
  drive(120, -120);  // spin
  delay(400);
}`,
        options: [
          "analogRead(A0) is too slow for edge detection",
          "drive(200, 120) makes the robot reverse",
          "opponentSeen() is checked before edgeSeen()",
          "The delay() calls block for 1.9 s, so the edge sensor is not checked while the robot is arcing",
        ],
        answerIndex: 3,
        explanation:
          "Edge detection only runs at the top of loop(). The two delays freeze the program for 1900 ms during which the robot arcs blindly and can cross the border. Replace them with millis()-based phases. analogRead takes only about 0.1 ms, drive(200, 120) is a forward arc, and the edge test is already first.",
        difficulty: 2,
      },
    ],
  }),

  // ───────────────────────────── 19. Attack Strategies ─────────────────────────────
  defineTopic("sumo", 19, {
    slug: "attack-strategies",
    title: "Attack Strategies",
    minutes: 13,
    summary:
      "How to turn a detection into a winning push: tracking the opponent, using traction and wedge geometry, flanking, and choosing a motor driver that survives stalls.",
    introduction:
      "Finding the opponent is only half the battle - you still have to push it out. An attack that wanders off-target, spins its wheels or overheats its driver will lose to a slower but steadier robot. This topic explains the physics that limits pushing force, how to keep the opponent centred while charging, when to hit from the side, and why motor drivers matter so much when motors stall against an opponent.",
    beginner:
      "Picture two people pushing against each other on a polished floor in socks. It does not matter how strong they are - whoever's feet slip first loses. Now give one of them rubber-soled shoes: suddenly that person wins easily. Pushing in sumo works the same way. The force your robot can push with is limited by the grip of its tyres, which depends on how heavy the robot is and how 'grippy' the tyres are.\n\nA clever robot also makes the opponent lose grip. A low, sharp wedge slides under the opponent and lifts its front a little. Now the opponent's wheels press down less on the ring, so they slip, and it cannot push back.\n\nThe other half of attacking is aim. If the opponent moves to the side while you charge, you must steer to keep it in front of your wedge - like a goalkeeper following the ball. And sometimes the best attack is from the side: a robot pushed sideways cannot use its motors to push back at all, because its wheels point the wrong way.\n\nFinally, pushing hard makes the motors work their hardest, drawing big currents, so your motor driver must handle it without overheating or cutting out.",
    technical: [
      {
        heading: "Traction limits pushing force",
        body:
          "The maximum horizontal force your tyres can transmit is F_max = μ x N, where N is the normal force on the driven wheels (m x g if all weight is on them) and μ is the coefficient of friction between tyre and ring.\n\nWorked example: a 500 g robot (N = 0.5 x 9.81 = 4.9 N) with μ = 0.8 can push with at most 0.8 x 4.9 = 3.9 N, no matter how strong its motors are. Doubling motor torque beyond what is needed to reach this limit only makes the wheels spin.\n\nTorque needed to reach the limit: with 20 mm radius wheels, total wheel torque = F x r = 3.9 x 0.02 = 0.078 N·m, so about 0.02 N·m per wheel on the club's 4WD robot (before losses), or about 0.039 N·m per wheel if only two wheels were driven. Choosing gear ratios to reach this torque at a useful speed is the core of drivetrain design.",
      },
      {
        heading: "Wedges, lifting and traction stealing",
        body:
          "When your wedge gets under the opponent, part of your pushing force acts upward on it. This reduces the opponent's normal force on its own wheels, so its maximum force μN falls, while the reaction pushes your front down and can increase your traction. That is why a wedge that is low and stays in contact with the ring is so effective. A wedge that is too high or bent lets the opponent's wedge get under you instead.",
      },
      {
        heading: "Tracking, flanking and ramped acceleration",
        body:
          "- Tracking: while charging, keep the opponent centred by slowing the wheel on the side the opponent moves toward. With left/right sensors: steer = Kp x (rightReading - leftReading); left = base + steer, right = base - steer.\n- Flanking: approach on an arc and hit the opponent's side. Its wheels then drive perpendicular to your push, so its motors cannot resist, and its side often has no wedge.\n- Ramped acceleration: going from 0 to full PWM instantly can exceed traction (wheelspin) and causes a large current spike. A short ramp over tens of milliseconds often gives a faster real launch.\n- Do not over-commit: if a 'push' lasts several seconds with no progress, back off and re-attack from another angle instead of overheating the motors.",
      },
      {
        heading: "Driver currents during a push",
        body:
          "When the robots meet head-on, your wheels slow or stop while full voltage is applied: motor current rises toward its stall current, which can be several times the running current. The driver must cope:\n\n- L298N: bipolar output stages, roughly 2 A per channel continuous rating, but it drops about 2 V at 1 A (more at higher current), wasting power as heat.\n- TB6612FNG: MOSFET outputs, about 1.2 A continuous and 3.2 A peak per channel, with a much smaller voltage drop.\n- DRV8833: MOSFET outputs, about 1.5 A RMS (2 A peak) per channel, motor supply 2.7-10.8 V.\n\nCompare your motors' stall current with these ratings, add bulk capacitance near the driver, and give the logic supply some protection so the Arduino does not reset when current spikes pull the battery voltage down.",
      },
    ],
    workingPrinciple:
      "Once the opponent is detected, the attack state drives both motors forward and continuously adjusts the speed difference between them so the opponent stays centred on the wedge. On contact, the force each robot can apply is limited by traction (μN); the low wedge lifts the opponent slightly, reducing its normal force and therefore its traction, while the motors - now near stall - deliver maximum torque through a driver rated for the resulting current. If the push stalls for too long, the strategy backs off and re-attacks, preferably toward the opponent's side.",
    diagrams: [
      {
        kind: "formula",
        latexish: "F_max = μ × m × g;   τ_wheel = F × r / n_driven",
        legend: {
          F_max: "largest horizontal push before tyres slip (N)",
          "μ": "tyre-to-ring friction coefficient",
          m: "mass on the driven wheels (kg)",
          g: "9.81 m/s²",
          "τ_wheel": "torque needed at each driven wheel (N·m)",
          r: "wheel radius (m)",
          n_driven: "number of driven wheels",
        },
      },
      {
        kind: "flow",
        steps: [
          "Opponent detected -> ATTACK",
          "Ramp PWM up over ~50 ms to avoid wheelspin",
          "Steer to keep opponent centred (left/right sensor difference)",
          "Contact: full power, watch edge sensors",
          "No progress for ~2 s? Back off and re-attack at an angle",
        ],
      },
    ],
    examples: [
      {
        title: "Proportional tracking while charging",
        body:
          "Uses the difference between left and right Sharp readings to steer. A larger right reading means the opponent is more to the right, so the left wheel speeds up and the right slows down.",
        code: `const int SHARP_L = A2, SHARP_R = A3;
const int BASE = 200;
const float KP = 0.25;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int l = analogRead(SHARP_L);
  int r = analogRead(SHARP_R);
  int steer = (int)(KP * (r - l));
  int leftSpeed = constrain(BASE + steer, -255, 255);
  int rightSpeed = constrain(BASE - steer, -255, 255);
  Serial.print("L motor ");
  Serial.print(leftSpeed);
  Serial.print("  R motor ");
  Serial.println(rightSpeed);
  delay(40);
}`,
      },
      {
        title: "Ramped launch and push timeout",
        body:
          "PWM rises from 80 to 255 over 50 ms, then the robot pushes. If the push lasts more than 2 s, it backs off for 250 ms to re-attack. All timing uses millis().",
        code: `const int PWMA = 5, AIN1 = 7, AIN2 = 8;
const int PWMB = 6, BIN1 = 9, BIN2 = 10;
const int STBY = 4;

unsigned long attackStart = 0;
bool attacking = false;

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
}

void loop() {
  bool seen = analogRead(A2) > 250 || analogRead(A3) > 250;
  unsigned long now = millis();
  if (seen && !attacking) {
    attacking = true;
    attackStart = now;
  }
  if (!seen) attacking = false;

  if (attacking) {
    unsigned long t = now - attackStart;
    if (t < 50) {
      int pwm = 80 + (int)(175 * t / 50);
      drive(pwm, pwm);
    } else if (t < 2000) {
      drive(255, 255);
    } else if (t < 2250) {
      drive(-200, -200);           // back off
    } else {
      attackStart = now;           // re-attack
    }
  } else {
    drive(120, -120);              // search
  }
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Buying ever-stronger motors to win pushes.",
        why: "Pushing force is capped by traction (μN). Extra torque beyond that only spins the wheels and wastes battery.",
        fix: "Improve tyre grip, keep weight on the driven wheels and use the wedge to reduce the opponent's traction.",
      },
      {
        mistake: "Charging straight ahead without steering.",
        why: "The opponent moves sideways during the charge, the robot misses or hits with a corner and slides off.",
        fix: "Track the opponent using the left/right sensor difference and correct continuously.",
      },
      {
        mistake: "Using a driver whose current rating is far below the motors' stall current.",
        why: "Every head-on push is a near-stall; the driver overheats or shuts down mid-match.",
        fix: "Check stall current, pick a driver with adequate continuous/peak ratings and add bulk capacitance.",
      },
      {
        mistake: "Pushing forever in a stalemate.",
        why: "Motors and driver heat up, the battery sags, and the opponent may outflank you.",
        fix: "Add a push timeout: back off briefly and re-attack from a different angle.",
      },
    ],
    keyTakeaways: [
      "Maximum pushing force is limited by traction: F_max = μ x m x g.",
      "A low wedge lifts the opponent and steals its traction.",
      "Steer during the charge to keep the opponent centred on your wedge.",
      "Side attacks work because the opponent's wheels cannot push sideways.",
      "Head-on pushes approach stall current - size the motor driver for it.",
    ],
    relatedComponents: ["TB6612FNG", "L298N", "DRV8833", "N20 Micro Metal Gear Motor", "Sharp GP2Y0A21YK0F"],
    youtubeSearch: "sumo robot attack strategy wedge pushing traction",
    quiz: [
      {
        type: "identify-driver",
        prompt:
          "Two sumo robots are identical except for the motor driver. With a 7.4 V battery and 1 A per motor, robot A's motors only see about 5.4 V, while robot B's motors see a little over 7 V. Robot A's driver board has a large black heatsink and ENA/ENB jumpers. Which driver is robot A using?",
        options: ["TB6612FNG", "L298N", "DRV8833", "A relay module"],
        answerIndex: 1,
        explanation:
          "The L298N uses bipolar transistor output stages that typically drop about 2 V at 1 A, and its common red module has a big heatsink and ENA/ENB jumpers. The TB6612FNG and DRV8833 use MOSFETs with low on-resistance, so they lose only a few hundred millivolts at this current - that matches robot B. A relay module cannot do PWM speed control at all.",
        difficulty: 2,
      },
      {
        type: "calculate",
        prompt:
          "A 0.5 kg sumo robot has all its weight on its driven wheels. The tyre-to-ring friction coefficient is μ = 0.8. Using g = 9.81 m/s², what is the largest pushing force it can apply before its wheels slip?",
        options: ["4.9 N", "0.4 N", "39 N", "3.9 N"],
        answerIndex: 3,
        explanation:
          "F_max = μ x m x g = 0.8 x 0.5 x 9.81 = 3.92 N, so about 3.9 N. 4.9 N is the normal force m x g, forgetting μ; 0.4 N multiplies μ by mass only (forgets g); 39 N is a factor of ten too large. More motor torque cannot raise this limit - only more grip or more weight on the driven wheels can.",
        difficulty: 2,
      },
      {
        type: "predict-movement",
        prompt:
          "The tracking code below runs with l = 300 and r = 500 (the opponent is closer to the right sensor). drive(left, right), positive = forward. How does the robot move?",
        code: `int steer = (int)(0.25 * (r - l));
drive(200 + steer, 200 - steer);`,
        options: [
          "Moves forward while curving to the right, toward the opponent",
          "Moves forward while curving to the left",
          "Spins on the spot clockwise",
          "Drives straight because both wheels are positive",
        ],
        answerIndex: 0,
        explanation:
          "steer = 0.25 x (500 - 300) = 50, so drive(250, 150). Both wheels go forward, but the left wheel is faster, which curves the robot to the right - toward the closer reading. It is not a spin because neither wheel reverses, and it is not straight because the speeds differ.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "Why is hitting the opponent from the side often more effective than a head-on push?",
        options: [
          "Competition rules award extra points for side hits",
          "Tyres have zero friction sideways, so the opponent slides away freely",
          "The opponent's wheels drive at right angles to your push, so its motors cannot push back against you",
          "Distance sensors cannot see objects at the side",
        ],
        answerIndex: 2,
        explanation:
          "In a side hit, the opponent's motors can only push forward or backward, perpendicular to your force, so they add nothing against you; it resists only with sideways tyre friction while you push with your full drive. Tyres still have sideways friction (it is not zero), and standard sumo rules score by pushing out, not by where you hit. Side sensors may exist, but that is not why flanking works.",
        difficulty: 2,
      },
    ],
  }),
];
