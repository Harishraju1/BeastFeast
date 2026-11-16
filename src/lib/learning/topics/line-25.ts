import { defineTopic } from "../define";
import type { Topic } from "../types";

export const LINE_25: Topic[] = [
  defineTopic("line", 25, {
    slug: "sensor-calibration",
    title: "Sensor Calibration",
    minutes: 12,
    summary: "Recording each sensor's black and white levels and normalising them so every sensor speaks the same language.",
    introduction:
      "No two IR sensors read exactly the same, and no two tracks or rooms have the same lighting. Calibration measures what 'white' and 'black' look like to each sensor right now, then rescales the readings onto a common scale. It takes a few seconds at the start of a run and is the single most effective way to make a line follower reliable at a new venue.",
    beginner:
      "Imagine five friends judging how loud a song is on a scale of 0 to 10. One has sensitive ears and says 8 for everything; another is a bit deaf and never says more than 4. If you average their scores without adjusting, you get nonsense. But if you first ask each friend 'what number do you give silence, and what number do you give the loudest sound?', you can convert each person's score to the same scale.\n\nCalibration does that for sensors. At the start, the robot sweeps its sensors across the line and the white floor. For each sensor it remembers the lowest reading it saw and the highest reading it saw. Later, when a sensor reports a value, the robot converts it: the sensor's own minimum becomes 0, its own maximum becomes 1000, and everything in between is scaled proportionally.\n\nAfter calibration, a reading of 500 means 'halfway between this sensor's white and black' for every sensor, no matter how bright the room is or how sensitive that particular sensor happens to be. This makes threshold decisions and PID position calculations far more accurate.",
    technical: [
      {
        heading: "Min/max normalisation",
        body:
          "For each sensor i record min_i and max_i during a calibration sweep. Then:\n\nnorm_i = (raw_i − min_i) × 1000 / (max_i − min_i), clamped to 0…1000.\n\nWorked example: min = 80, max = 920, raw = 290 → (210 × 1000) / 840 = 250.\n\nOn an Arduino Uno, int is 16 bits (−32 768 to 32 767). (raw − min) × 1000 can reach about 1 000 000, so it overflows unless done in long arithmetic. The built-in map() function already uses long internally, so map(raw, min, max, 0, 1000) is safe — but its result can fall outside 0…1000 if raw is outside the calibrated range, so follow it with constrain().",
      },
      {
        heading: "Thresholds and contrast checks",
        body:
          "For digital decisions use a per-sensor threshold at the midpoint: th_i = (min_i + max_i) / 2, or simply norm_i > 500 after normalisation.\n\nAlways check contrast: if max_i − min_i is small (for example under about 100 counts), the sensor either never saw the line during calibration or is mounted badly. Refuse to start, or flash an LED, rather than racing with a blind sensor.\n\nIf the track uses a white line on black, invert the normalised value (1000 − norm_i) so the rest of the code is unchanged.",
      },
      {
        heading: "Calibration routines",
        body:
          "- Manual sweep: you slide the robot left and right over the line for a few seconds.\n- Automatic spin: the robot rotates in place over the line using a timed loop, so every sensor passes over both colours.\n- Persisting values: store min/max in EEPROM (the standard EEPROM library) to skip calibration on each power-up, but recalibrate whenever the lighting or surface changes.\n\nUse millis() for the calibration time window rather than a fixed loop count, so the duration does not depend on how long each reading takes.",
      },
    ],
    workingPrinciple:
      "During a short sweep the robot exposes every sensor to both the line and the background and stores each sensor's extreme readings. Each subsequent raw reading is linearly mapped from its own [min, max] range onto a shared 0–1000 scale, removing offset and gain differences between sensors and lighting conditions.",
    diagrams: [
      {
        kind: "flow",
        steps: [
          "Set every min to 1023 and every max to 0",
          "Spin or sweep the robot over the line for ~3 s",
          "For each reading: update min_i and max_i",
          "Check contrast (max_i − min_i) for every sensor",
          "Run: norm_i = constrain(map(raw_i, min_i, max_i, 0, 1000), 0, 1000)",
        ],
      },
      {
        kind: "signal",
        title: "Two sensors before and after calibration",
        xLabel: "Position across line (mm)",
        yLabel: "Reading",
        series: [
          { label: "Sensor A raw", points: [[0, 120], [10, 120], [15, 700], [20, 860], [25, 700], [30, 120], [40, 120]] },
          { label: "Sensor B raw", points: [[0, 300], [10, 300], [15, 560], [20, 640], [25, 560], [30, 300], [40, 300]] },
          { label: "Both calibrated", points: [[0, 0], [10, 0], [15, 780], [20, 1000], [25, 780], [30, 0], [40, 0]] },
        ],
      },
    ],
    examples: [
      {
        title: "Automatic spin calibration for five sensors",
        body: "Assumes an L298N-style driver with ENA on 5 and ENB on 6. The robot spins for three seconds while recording extremes, then prints the ranges.",
        code: `const int N = 5;
const int pins[N] = {A0, A1, A2, A3, A4};
int minV[N];
int maxV[N];

const int ENA = 5, IN1 = 4, IN2 = 7, ENB = 6, IN3 = 8, IN4 = 12;

void spin(int pwm) {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH);
  analogWrite(ENA, pwm);   analogWrite(ENB, pwm);
}

void stopMotors() {
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

void setup() {
  Serial.begin(9600);
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  for (int i = 0; i < N; i++) { minV[i] = 1023; maxV[i] = 0; }

  unsigned long start = millis();
  spin(120);
  while (millis() - start < 3000) {
    for (int i = 0; i < N; i++) {
      int r = analogRead(pins[i]);
      if (r < minV[i]) minV[i] = r;
      if (r > maxV[i]) maxV[i] = r;
    }
  }
  stopMotors();

  for (int i = 0; i < N; i++) {
    Serial.print(i); Serial.print(": ");
    Serial.print(minV[i]); Serial.print(" - ");
    Serial.println(maxV[i]);
  }
}

void loop() {}`,
      },
      {
        title: "Normalising a reading safely",
        body: "map() uses long arithmetic internally, so it does not overflow, but a reading outside the calibrated range produces a value outside 0–1000; constrain() fixes that.",
        code: `int normalise(int raw, int lo, int hi) {
  if (hi - lo < 50) {
    return 0;   // no usable contrast
  }
  int v = map(raw, lo, hi, 0, 1000);
  return constrain(v, 0, 1000);
}

void setup() {
  Serial.begin(9600);
  Serial.println(normalise(290, 80, 920));   // prints 250
}

void loop() {}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Calibrating with the robot held still over white only.",
        why: "Min and max end up almost equal, so the normalisation divides by a tiny number and amplifies noise into huge swings.",
        fix: "Make sure every sensor crosses the line during calibration and check the contrast of each sensor.",
      },
      {
        mistake: "Computing (raw − min) * 1000 with int variables.",
        why: "The product exceeds 32 767 and wraps on the Uno's 16-bit int, producing negative or wildly wrong values.",
        fix: "Use long arithmetic or map(), which computes in long.",
      },
      {
        mistake: "Calibrating once at home and never again.",
        why: "Venue lighting, track material and battery voltage (which affects emitter brightness on some circuits) all shift readings.",
        fix: "Recalibrate on the competition track before each run.",
      },
    ],
    keyTakeaways: [
      "Calibration records each sensor's own white and black levels.",
      "Normalise with norm = (raw − min) × 1000 / (max − min), clamped to 0–1000.",
      "Use long arithmetic or map() to avoid 16-bit overflow, and constrain() the result.",
      "Check contrast before racing; a sensor with tiny range is effectively blind.",
      "Recalibrate at every venue.",
    ],
    relatedComponents: ["TCRT5000", "QTR-8A", "Arduino Uno R3", "Arduino Nano"],
    youtubeSearch: "line follower sensor calibration min max normalize Arduino",
    quiz: [
      {
        type: "code-output",
        prompt: "What does this code print?",
        code: `void setup() {
  Serial.begin(9600);
  int raw = 950;
  int cal = map(raw, 100, 900, 0, 1000);
  Serial.println(cal);
  cal = constrain(cal, 0, 1000);
  Serial.println(cal);
}

void loop() {}`,
        options: [
          "1000 then 1000",
          "1062 then 1000",
          "1063 then 1000",
          "1062 then 1062",
        ],
        answerIndex: 1,
        explanation: "map() computes (950 − 100) × 1000 / (900 − 100) = 850 000 / 800 = 1062.5, and integer division truncates to 1062. map() does not clamp, so 1062 is printed first; constrain() then limits it to 1000. 1063 would need rounding, which map() does not do.",
        difficulty: 2,
      },
      {
        type: "debug-code",
        prompt: "After calibration (min 100, max 900), a sensor reading of 700 should give 750, but this function returns strange, sometimes negative numbers. What is the bug?",
        code: `int normalise(int raw, int lo, int hi) {
  int v = (raw - lo) * 1000 / (hi - lo);
  return constrain(v, 0, 1000);
}`,
        options: [
          "constrain() cannot be used on int values",
          "The function should use digitalRead",
          "(raw - lo) * 1000 overflows the 16-bit int before the division",
          "hi and lo are in the wrong order in the division",
        ],
        answerIndex: 2,
        explanation: "(700 − 100) × 1000 = 600 000, far above 32 767, so it wraps on the Uno before the division happens. Use (long)(raw - lo) * 1000 / (hi - lo) or map(). The division order is correct, and constrain() works on ints.",
        difficulty: 3,
      },
      {
        type: "mcq",
        prompt: "During calibration, sensor 3 records min = 412 and max = 448. What does this most likely mean?",
        options: [
          "Sensor 3 is perfectly calibrated",
          "Sensor 3 has very little contrast — it probably never saw the line or is mounted badly",
          "Sensor 3 is the most sensitive sensor",
          "The ADC is saturated",
        ],
        answerIndex: 1,
        explanation: "A range of only 36 counts means black and white look almost identical to that sensor, so normalisation will mostly amplify noise. A saturated ADC would read near 0 or 1023, not around 430.",
        difficulty: 2,
      },
      {
        type: "calculate",
        prompt: "A sensor has min = 80 and max = 920. What is its normalised value (0–1000 scale) for a raw reading of 290?",
        diagram: { kind: "formula", latexish: "norm = \\frac{(raw - min) \\cdot 1000}{max - min}", legend: { raw: "current reading", min: "white level", max: "black level" } },
        options: ["315", "290", "250", "500"],
        answerIndex: 2,
        explanation: "(290 − 80) × 1000 / (920 − 80) = 210 000 / 840 = 250. 315 is 290 / 920 × 1000, which ignores the minimum offset.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("line", 26, {
    slug: "line-detection-algorithms",
    title: "Line Detection Algorithms",
    minutes: 13,
    summary: "From two-sensor bang-bang to pattern tables and weighted position: how the robot decides where the line is.",
    introduction:
      "Sensors give numbers; the algorithm turns them into a decision: where is the line, and what should the motors do? This topic compares the main approaches used by club robots, from the simplest two-sensor logic to the continuous position estimate that feeds PID, and how to handle the awkward cases: lost line, crossings and the start/finish markers.",
    beginner:
      "Think of walking along a painted path at night with a torch, looking only at your feet. If you have one eye on each side of the path, you follow a simple rule: when your left eye sees paint, step left; when your right eye sees paint, step right. You will wobble, but you will stay on the path. That is the two-sensor 'bang-bang' method.\n\nNow imagine you have five eyes in a row. You can tell not just 'left or right' but 'a little left' or 'far left', and adjust your step by the right amount. Walking becomes smoother and faster. That is the pattern table and weighted-position method.\n\nThere are also special moments. If none of your eyes see the path, you have run off it: the smart move is to turn back towards the side where you last saw it. If all your eyes see paint at once, you are at a crossing or a marker, and you should follow a rule such as 'go straight across'. Good line detection algorithms handle the normal case smoothly and these special cases deliberately.",
    technical: [
      {
        heading: "Two- and three-sensor logic",
        body:
          "Two sensors straddling the line (both on white when centred):\n- Left sees black → turn left; right sees black → turn right; neither → forward.\n\nThree sensors (left, centre, right), with 1 = black:\n- 0 1 0 → forward\n- 1 1 0 or 1 0 0 → turn left (line is to the left)\n- 0 1 1 or 0 0 1 → turn right\n- 0 0 0 → lost: turn towards the last seen side\n- 1 1 1 → crossing or marker\n\nThese are bang-bang controllers: the correction is the same size regardless of how far off the robot is, so they oscillate at speed.",
      },
      {
        heading: "Pattern tables",
        body:
          "With five digital sensors, pack readings into a 5-bit number: pattern = (s0 << 4) | (s1 << 3) | (s2 << 2) | (s3 << 1) | s4. Then map each pattern to an error:\n\n- 0b00100 → 0\n- 0b00110 → +1, 0b00010 → +2, 0b00011 → +3, 0b00001 → +4\n- 0b01100 → −1, 0b01000 → −2, 0b11000 → −3, 0b10000 → −4\n\nThis gives nine error levels from five sensors, enough for a simple P or PD controller. Unexpected patterns (like 0b10001) are treated as noise and the last error is kept.",
      },
      {
        heading: "Weighted position and special cases",
        body:
          "With analog, calibrated sensors, the weighted average gives a continuous position (see QTR Sensor Arrays). It is the best input for PID.\n\nSpecial cases:\n- Lost line (sum of calibrated readings below a small threshold): return the extreme position on the last seen side, so the controller turns hard back towards the line.\n- All sensors black: crossing, start/finish line or a wide marker. Use a counter or timer to decide (for example 'ignore for 100 ms and keep straight').\n- Noise: require a pattern to persist for two consecutive readings before reacting to special cases.",
      },
    ],
    workingPrinciple:
      "Each loop, the robot reads all sensors, converts them into a single estimate of line position or error, and passes that to the steering logic. Simple methods use fixed responses to sensor patterns; advanced methods compute a continuous error. Explicit rules handle the lost-line and all-black states that the normal formula cannot interpret.",
    diagrams: [
      {
        kind: "flow",
        steps: [
          "Read all sensors",
          "Any sensor on line? If no → steer hard towards last seen side",
          "All sensors on line? If yes → crossing/marker rule",
          "Otherwise compute error (pattern table or weighted average)",
          "Remember error as 'last seen' and send it to the controller",
        ],
      },
    ],
    examples: [
      {
        title: "Five-sensor pattern table",
        body: "Digital sensors on pins 2, 3, 4, 10 and 11 return 1 for black (adjust if your modules are inverted). The function returns an error from −4 to +4 and remembers the last valid error for lost-line recovery.",
        code: `const int S[5] = {2, 3, 4, 10, 11};
int lastError = 0;

int readError() {
  int p = 0;
  for (int i = 0; i < 5; i++) {
    p = (p << 1) | (digitalRead(S[i]) == HIGH ? 1 : 0);
  }
  int e;
  switch (p) {
    case 0b00100: e = 0; break;
    case 0b00110: e = 1; break;
    case 0b00010: e = 2; break;
    case 0b00011: e = 3; break;
    case 0b00001: e = 4; break;
    case 0b01100: e = -1; break;
    case 0b01000: e = -2; break;
    case 0b11000: e = -3; break;
    case 0b10000: e = -4; break;
    case 0b00000: e = (lastError > 0) ? 5 : -5; break;   // lost
    default:      e = lastError; break;                   // crossing or noise
  }
  if (p != 0) lastError = e;
  return e;
}

void setup() {
  Serial.begin(9600);
  for (int i = 0; i < 5; i++) pinMode(S[i], INPUT);
}

void loop() {
  Serial.println(readError());
  delay(50);
}`,
      },
      {
        title: "Three-sensor bang-bang follower",
        body: "A minimal follower for a beginner robot: fine at low speed, wobbly at high speed. Uses the setMotor() style from the L298N topic; here written inline for an L298N with ENA = 5 and ENB = 6.",
        code: `const int L = 2, C = 3, R = 4;
const int ENA = 5, IN1 = 7, IN2 = 8, ENB = 6, IN3 = 9, IN4 = 12;

void drive(int left, int right) {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  analogWrite(ENA, left);
  analogWrite(ENB, right);
}

void setup() {
  pinMode(L, INPUT); pinMode(C, INPUT); pinMode(R, INPUT);
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
}

void loop() {
  int l = digitalRead(L), c = digitalRead(C), r = digitalRead(R);  // HIGH = black
  if (c == HIGH && l == LOW && r == LOW) drive(150, 150);
  else if (l == HIGH) drive(60, 160);       // line to the left
  else if (r == HIGH) drive(160, 60);       // line to the right
  else drive(0, 0);                         // lost: stop (improve with memory)
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Stopping or going straight when the line is lost.",
        why: "On sharp curves the line often leaves all sensors for a moment; going straight drives the robot off the track.",
        fix: "Remember the last error and steer hard towards that side until a sensor finds the line again.",
      },
      {
        mistake: "Treating every all-black reading as a finish line.",
        why: "Crossings, wide curves and noise can all produce all-black for a few milliseconds.",
        fix: "Require the pattern to persist for a minimum time or count markers deliberately.",
      },
      {
        mistake: "Reading sensors once in setup() instead of every loop.",
        why: "The robot then reacts to a single stale snapshot forever.",
        fix: "Read all sensors at the top of loop(), every iteration.",
      },
    ],
    keyTakeaways: [
      "Bang-bang logic is simple but oscillates because correction size never changes.",
      "Pattern tables turn several digital sensors into a graded error.",
      "Weighted averages of calibrated analog sensors give the smoothest error for PID.",
      "Always handle lost-line (use last seen side) and all-black (crossing/marker) cases explicitly.",
      "Keep the 'last error' variable alive between loops.",
    ],
    relatedComponents: ["TCRT5000", "QTR-8A", "Arduino Uno R3", "L298N"],
    youtubeSearch: "line follower algorithm 3 sensor 5 sensor logic lost line recovery",
    quiz: [
      {
        type: "code-output",
        prompt: "Sensors use 1 for black. What does this code print?",
        code: `void setup() {
  Serial.begin(9600);
  int L = 0, C = 1, R = 1;
  if (C == 1 && L == 0 && R == 0) Serial.println("FORWARD");
  else if (R == 1) Serial.println("TURN RIGHT");
  else if (L == 1) Serial.println("TURN LEFT");
  else Serial.println("SEARCH");
}

void loop() {}`,
        options: ["FORWARD", "SEARCH", "TURN LEFT", "TURN RIGHT"],
        answerIndex: 3,
        explanation: "The first condition needs R == 0, but R is 1, so it fails. The second condition R == 1 is true, so 'TURN RIGHT' is printed and the remaining branches are skipped. 'FORWARD' is tempting because C is 1, but all three parts of the && must be true.",
        difficulty: 1,
      },
      {
        type: "predict-movement",
        prompt: "A three-sensor robot (left, centre, right) reads: left = black, centre = white, right = white. With standard follower logic, what should it do?",
        options: [
          "Turn left, because the line is under the left side",
          "Turn right",
          "Drive straight",
          "Reverse",
        ],
        answerIndex: 0,
        explanation: "Only the left sensor sees the line, so the line is to the robot's left and it must turn left to recentre. Turning right would steer away and lose the line completely.",
        difficulty: 1,
      },
      {
        type: "debug-code",
        prompt: "This robot reacts to the line exactly once and then never steers again. What is wrong?",
        code: `const int LS = 2;
const int RS = 3;
int left;
int right;

void setup() {
  pinMode(LS, INPUT);
  pinMode(RS, INPUT);
  left = digitalRead(LS);
  right = digitalRead(RS);
}

void loop() {
  if (left == HIGH) {
    // turn left
  } else if (right == HIGH) {
    // turn right
  } else {
    // forward
  }
}`,
        options: [
          "pinMode should be OUTPUT",
          "The sensors are read only once in setup(), so loop() always uses the same old values",
          "else if cannot be used after if",
          "HIGH should be written as 1",
        ],
        answerIndex: 1,
        explanation: "setup() runs once. left and right never change afterwards, so loop() keeps acting on the first reading. Move the digitalRead() calls into loop(). Sensors are inputs, so INPUT is correct, and HIGH equals 1 anyway.",
        difficulty: 1,
      },
      {
        type: "mcq",
        prompt: "Why do fast robots usually replace two-sensor bang-bang logic with a weighted position from several analog sensors?",
        options: [
          "Analog sensors use less power",
          "Bang-bang logic needs more pins",
          "A continuous error lets the correction scale with how far off the line the robot is",
          "Weighted averages do not need calibration",
        ],
        answerIndex: 2,
        explanation: "Bang-bang applies the same correction for small and large errors, causing zig-zagging at speed. A continuous position lets the controller make small corrections for small errors and big ones for big errors. Weighted averages actually need good calibration, not less.",
        difficulty: 2,
      },
    ],
  }),

  defineTopic("line", 27, {
    slug: "pid-control",
    title: "PID Control",
    minutes: 16,
    summary: "Proportional, integral and derivative terms explained with line-follower numbers, plus a practical tuning recipe.",
    introduction:
      "PID control is what separates a wobbly robot from a smooth, fast one. Instead of choosing between 'turn left' and 'turn right', a PID controller computes exactly how much to steer from the size of the error, how long it has lasted and how fast it is changing. Most winning line followers use PD (PID without the I term), tuned carefully on the real track.",
    beginner:
      "Imagine steering a bicycle along a painted line. If you are slightly off, you steer slightly; if you are far off, you steer a lot. That is the P (proportional) part: the correction is proportional to the error.\n\nBut if you only do that, you tend to overshoot: you swing back across the line and off the other side, wobbling. A good rider also notices how fast they are drifting. If they are already heading back towards the line quickly, they ease off early. That is the D (derivative) part: it looks at how fast the error is changing and damps the wobble.\n\nThe I (integral) part is like noticing that you keep ending up a little to the right no matter what, maybe because the bike pulls to one side, and slowly adding a constant correction to cancel it. In line followers the I term is often left at zero or very small, because the error changes direction so often.\n\nYour robot does this many times per second: measure the line position, compute the error, calculate P + I + D, and set the left and right motor speeds to base speed plus or minus that correction.",
    technical: [
      {
        heading: "The discrete PID equation",
        body:
          "With a constant loop period, the controller can be written:\n\ne = position − setpoint\nu = Kp·e + Ki·Σe + Kd·(e − e_prev)\nleft = base + u, right = base − u (both constrained to 0…255)\n\nThe sign convention matters: if position increases when the line moves to the robot's right, a positive error must speed up the left wheel to turn right. If the robot steers away from the line, swap the signs.\n\nWorked example: Kp = 0.1, Kd = 0.5, e = 600, e_prev = 400 → P = 60, D = 0.5 × 200 = 100, u = 160. With base 120: left = 280 → constrained to 255, right = −40 → constrained to 0.",
      },
      {
        heading: "What each term does",
        body:
          "- P: reacts to present error. Too small → sluggish, runs wide on curves. Too large → oscillation that grows with speed.\n- D: reacts to the rate of change. It anticipates overshoot and damps oscillation. Too large → jittery motors, amplified sensor noise.\n- I: accumulates past error to remove a steady offset. For line following it is often zero; if used, limit (clamp) the sum to prevent integral windup, where a long error builds a huge correction that persists after the error is gone.\n\nBecause the D term uses e − e_prev, it depends on loop timing: if the loop period changes (for example when you add Serial prints), Kd effectively changes too. Keep the loop period consistent.",
      },
      {
        heading: "Tuning recipe",
        body:
          "1. Set Ki = Kd = 0 and a modest base speed.\n2. Increase Kp until the robot follows the line but begins to oscillate; back off slightly.\n3. Increase Kd until the oscillation disappears and the robot tracks curves smoothly. Kd is often several times Kp for weighted-position errors.\n4. Raise base speed in steps, retuning Kp/Kd each time.\n5. Add a small Ki only if the robot consistently tracks off-centre on straights.\n\nScale tip: with an 8-sensor position (error −3500…+3500) and base 150, a Kp around 0.03–0.05 makes the full-scale error produce a correction similar to the base speed — a reasonable starting point, not a final value.",
      },
    ],
    workingPrinciple:
      "Every loop the controller measures the error between where the line is and where it should be, computes a correction from the error (P), its accumulated history (I) and its rate of change (D), and applies the correction differentially to the two drive motors. This closes the loop: steering changes the error, which changes the next correction.",
    diagrams: [
      {
        kind: "formula",
        latexish: "u = K_p e + K_i \\sum e + K_d (e - e_{prev})",
        legend: { u: "steering correction (PWM units)", e: "error = position − setpoint", K_p: "proportional gain", K_i: "integral gain", K_d: "derivative gain" },
      },
      {
        kind: "signal",
        title: "Error over time after a step (e.g. entering a curve)",
        xLabel: "Time (ms)",
        yLabel: "Error",
        series: [
          { label: "P only, Kp high", points: [[0, 1000], [50, -700], [100, 600], [150, -450], [200, 350], [250, -250], [300, 180]] },
          { label: "PD, well tuned", points: [[0, 1000], [50, 400], [100, 120], [150, 20], [200, 0], [250, 0], [300, 0]] },
          { label: "Kp too low", points: [[0, 1000], [50, 900], [100, 800], [150, 700], [200, 620], [250, 550], [300, 480]] },
        ],
      },
    ],
    examples: [
      {
        title: "PD line follower core loop",
        body: "Uses a five-sensor weighted position (0–4000, centre 2000) from calibrated readings and an L298N. Replace the min/max constants with values from your calibration routine. The loop runs at a fixed period of 5 ms so Kd behaves consistently.",
        code: `const int N = 5;
const int pins[N] = {A0, A1, A2, A3, A4};
const int ENA = 5, IN1 = 4, IN2 = 7, ENB = 6, IN3 = 8, IN4 = 12;

float Kp = 0.06;
float Kd = 0.4;
int baseSpeed = 140;
int lastError = 0;
long lastPos = 2000;
unsigned long lastTime = 0;

long readPosition() {
  long num = 0, den = 0;
  for (int i = 0; i < N; i++) {
    int v = constrain(map(analogRead(pins[i]), 100, 900, 0, 1000), 0, 1000);
    num += (long)v * i * 1000;
    den += v;
  }
  if (den < 300) return (lastPos > 2000) ? 4000 : 0;   // lost: hard towards last side
  lastPos = num / den;
  return lastPos;
}

void drive(int left, int right) {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  analogWrite(ENA, constrain(left, 0, 255));
  analogWrite(ENB, constrain(right, 0, 255));
}

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
}

void loop() {
  if (millis() - lastTime < 5) return;   // fixed 5 ms period
  lastTime = millis();

  int error = (int)(readPosition() - 2000);
  float correction = Kp * error + Kd * (error - lastError);
  lastError = error;

  drive(baseSpeed + (int)correction, baseSpeed - (int)correction);
}`,
      },
      {
        title: "Tuning log",
        body: "Keep a table while tuning: base speed, Kp, Kd, Ki, lap time and behaviour notes ('oscillates on straights', 'runs wide on hairpin'). Change one value at a time. Over a session this turns guessing into engineering and shows which change actually helped.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Declaring lastError inside loop().",
        why: "It is reset to 0 every iteration, so the derivative becomes just the error itself and the D term never damps anything.",
        fix: "Declare lastError as a global (or static) variable and update it at the end of each loop.",
      },
      {
        mistake: "Tuning at full speed from the start.",
        why: "At high speed, small gain errors cause violent oscillation or the robot leaves the track before you can see what is happening.",
        fix: "Tune at a modest base speed, then increase speed in steps and retune.",
      },
      {
        mistake: "Letting the integral grow without limit.",
        why: "During a long curve or when lifted off the track, the sum becomes huge and causes a large overshoot afterwards (windup).",
        fix: "Clamp the integral, reset it when the line is lost, or leave Ki at zero.",
      },
      {
        mistake: "Adding Serial prints inside the control loop while tuning Kd.",
        why: "Printing changes the loop period, which changes the effective derivative gain and the robot's behaviour.",
        fix: "Use a fixed loop period with millis() and keep printing minimal or at a high baud rate.",
      },
    ],
    keyTakeaways: [
      "u = Kp·e + Ki·Σe + Kd·(e − e_prev); left = base + u, right = base − u.",
      "P sets responsiveness, D damps oscillation, I removes steady offset (often unused in line following).",
      "Constrain motor commands to 0–255 and check the sign convention.",
      "Keep the loop period fixed so the derivative term is consistent.",
      "Tune Kp first, then Kd, at moderate speed; change one value at a time.",
    ],
    relatedComponents: ["QTR-8A", "Arduino Nano", "Arduino Uno R3", "TB6612FNG", "N20 Micro Metal Gear Motor"],
    youtubeSearch: "PID line follower tuning Kp Kd explained Arduino",
    quiz: [
      {
        type: "calculate",
        prompt: "A PD controller has Kp = 0.1 and Kd = 0.5. The current error is 600 and the previous error was 400. What is the correction u?",
        diagram: { kind: "formula", latexish: "u = K_p e + K_d (e - e_{prev})", legend: { e: "current error", e_prev: "previous error" } },
        options: ["60", "100", "160", "360"],
        answerIndex: 2,
        explanation: "P = 0.1 × 600 = 60; D = 0.5 × (600 − 400) = 100; u = 160. 360 comes from using Kd × e instead of Kd × (e − e_prev) (60 + 300).",
        difficulty: 2,
      },
      {
        type: "code-output",
        prompt: "What does this code print?",
        code: `void setup() {
  Serial.begin(9600);
  int position = 4500;
  int error = position - 3500;
  int corr = error / 8;
  int left = constrain(150 + corr, 0, 255);
  int right = constrain(150 - corr, 0, 255);
  Serial.print(left);
  Serial.print(" ");
  Serial.println(right);
}

void loop() {}`,
        options: ["275 25", "255 25", "255 0", "150 150"],
        answerIndex: 1,
        explanation: "error = 1000, corr = 1000 / 8 = 125. left = 150 + 125 = 275, constrained to 255; right = 150 − 125 = 25, which is already inside 0–255. So '255 25' is printed. '275 25' forgets the constrain.",
        difficulty: 2,
      },
      {
        type: "predict-movement",
        prompt: "A student doubles Kp several times while leaving Kd at zero. The robot is on a straight line. What behaviour do you expect?",
        options: [
          "It follows more smoothly than before",
          "It zig-zags across the line with increasing oscillation",
          "It drives slower but perfectly straight",
          "It stops whenever the error is zero",
        ],
        answerIndex: 1,
        explanation: "A large Kp makes small errors produce big corrections, so the robot overshoots the line, then overcorrects the other way. Without D to damp it, oscillation grows, especially at speed. Kp does not lower the base speed.",
        difficulty: 2,
      },
      {
        type: "debug-code",
        prompt: "This PD loop behaves as if Kd does nothing useful — the robot still oscillates no matter how Kd is set. Why?",
        code: `float Kp = 0.05;
float Kd = 0.5;

int readError() {
  return analogRead(A0) - 512;   // placeholder error source
}

void setup() {}

void loop() {
  int lastError = 0;
  int error = readError();
  float u = Kp * error + Kd * (error - lastError);
  lastError = error;
  // apply u to motors...
}`,
        options: [
          "Kd must be an int",
          "lastError is a local variable reset to 0 every loop, so the D term is just Kd × error",
          "analogRead cannot be used inside a function",
          "u should be calculated before reading the error",
        ],
        answerIndex: 1,
        explanation: "Because lastError is declared inside loop(), it is 0 at the start of every iteration and the update at the end is lost. The 'derivative' becomes Kd × error, which acts like extra P and does not damp. Declare lastError outside loop() (global or static).",
        difficulty: 3,
      },
    ],
  }),
];
