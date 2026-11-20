/**
 * Starter templates. Students can write their own code from scratch — templates are optional.
 * Pin numbers in each template are placeholders; Code Studio's pin check compares them with the circuit.
 */
export interface CodeTemplate {
  id: string;
  title: string;
  description: string;
  competition: "race" | "line" | "sumo" | "any";
  code: string;
}

const DRIVE_FUNCS = `// ---- motor helpers (L298N style: ENx = speed PWM, INx = direction) ----
void setMotors(int left, int right) {
  left = constrain(left, -255, 255);
  right = constrain(right, -255, 255);
  digitalWrite(IN1, left >= 0 ? HIGH : LOW);
  digitalWrite(IN2, left >= 0 ? LOW : HIGH);
  digitalWrite(IN3, right >= 0 ? HIGH : LOW);
  digitalWrite(IN4, right >= 0 ? LOW : HIGH);
  analogWrite(ENA, abs(left));
  analogWrite(ENB, abs(right));
}

void stopMotors() {
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}`;

const PINS = `#define ENA 5   // left motor speed  (PWM pin)
#define IN1 7
#define IN2 8
#define IN3 9
#define IN4 10
#define ENB 6   // right motor speed (PWM pin)`;

const SETUP_PINS = `  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(ENB, OUTPUT);`;

export const CODE_TEMPLATES: CodeTemplate[] = [
  {
    id: "motor-test",
    title: "Motor Testing",
    description: "Runs each motor forward and backward so you can check wiring and direction.",
    competition: "any",
    code: `// MOTOR TEST — watch each wheel: forward, backward, then stop.
${PINS}

${DRIVE_FUNCS}

void setup() {
${SETUP_PINS}
  Serial.begin(9600);
  Serial.println("Motor test starting");
}

void loop() {
  Serial.println("Both forward");
  setMotors(180, 180);
  delay(1500);
  Serial.println("Both backward");
  setMotors(-180, -180);
  delay(1500);
  Serial.println("Spin left");
  setMotors(-150, 150);
  delay(1000);
  stopMotors();
  delay(1000);
}
`,
  },
  {
    id: "robo-race",
    title: "Robo Race (timed autonomous run)",
    description: "Drives forward and makes timed turns — a starting point for racing logic.",
    competition: "race",
    code: `// ROBO RACE — simple timed driving. Replace with sensor-based logic as you improve!
${PINS}

${DRIVE_FUNCS}

int speed = 200;

void setup() {
${SETUP_PINS}
}

void loop() {
  setMotors(speed, speed);   // straight
  delay(2000);
  setMotors(speed, speed / 3); // gentle right
  delay(900);
}
`,
  },
  {
    id: "line-basic",
    title: "Line Following (basic 3-sensor)",
    description: "Left / centre / right sensors. Turns towards the line, remembers which side it last saw it, and recovers a lost line with a slow, bounded search that can never swing round and follow the track backwards.",
    competition: "line",
    code: `// BASIC LINE FOLLOWER — 3 digital sensors read HIGH over the black line.
// LEFT and RIGHT sit either side of the line, CENTRE sits on it.
${PINS}
#define LEFT_SENSOR   A1
#define CENTRE_SENSOR A2
#define RIGHT_SENSOR  A3

int baseSpeed = 140;     // straight-line speed
int turnFast = 170;      // outer wheels in a turn
int turnSlow = -60;      // inner wheels in a turn (negative = backwards → tight pivot for sharp corners;
                         // a 4WD robot hardly turns at all with stopped inner wheels)

// ---- lost-line recovery ----
// Works on a 4WD robot (the default) and on a 2WD robot with a caster. A 4WD robot pivots more slowly
// because all four tyres scrub sideways (about 155 deg/s at this speed, a 2WD robot about 250 deg/s).
int searchSpeed = 140;   // pivot speed while the line is lost
int sweepTime = 700;     // ms of pivoting. The search never turns further than this either way, so it
                         // can never swing round onto the line behind it and drive back.
int gapTime = 150;       // ms to roll straight on when the line vanishes while centred (a gap or line end)
int alignTime = 800;     // ms at 2/3 speed after the line was found again, to line up with the new leg

int lastSide = 0;        // -1 = line last seen on the left, +1 = right, 0 = centred
int rawSide = 0;         // side of the very latest off-centre reading (unfiltered)
unsigned long sideTime = 0;
unsigned long cornerTime = 0;    // when a sharp-corner point decided the side (locks it for 100 ms)
int pattern = 2;         // the sensors as one number: left*4 + centre*2 + right (2 = only centre black)
int before1 = 2;         // the previous pattern ...
int before2 = 2;         // ... and the one before that
unsigned long patternStart = 0;  // when the current pattern began
unsigned long held1 = 0;         // how long the previous pattern lasted (ms) ...
unsigned long held2 = 0;         // ... and the one before that
bool weakCorner = false; // corner side decided while wobbling along the old line (provisional)
bool sawTwoLines = false;        // two separate lines (pattern 5) seen at the current corner
unsigned long blackMs = 0;       // how long the whole bar was black at the current corner (ms)
int blackMin = 15;               // all black for blackMin..blackMax ms = crossing a 90 deg corner's new leg
int blackMax = 40;
bool lost = false;
unsigned long lostAt = 0;
unsigned long foundAt = 0;       // when the line was found again after a search
int searchDir = -1;

${DRIVE_FUNCS}

// Remember which side the line went to. Within 100 ms after a sharp-corner point decided the side,
// a glimpse on the OTHER side is just the end of the old line flashing past, so it is ignored.
void rememberSide(int side) {
  unsigned long now = millis();
  rawSide = side;
  if (side == lastSide || lastSide == 0 || now - cornerTime > 100) {
    lastSide = side;
    sideTime = now;
  }
}

// Hard stop for the L298N: both direction inputs equal with the enable fully on shorts the motor
// (brake). analogWrite(EN, 0) would only switch the bridge off and let the robot coast on.
void brakeMotors() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
  analogWrite(ENA, 255);
  analogWrite(ENB, 255);
}

void pivot(int dir) {      // dir -1 = turn left on the spot, +1 = turn right
  setMotors(dir * searchSpeed, -dir * searchSpeed);
}

// Bounded search: turn towards the remembered side, then sweep the other way, then back
// to where the line was lost, then stop (it never turns more than about 135 deg from there).
// loop() leaves it as soon as any sensor sees black.
void searchLine() {
  if (!lost) {
    lost = true;
    lostAt = millis();
    // Provisional corner (decided while wobbling along the old line): use what the sensors saw while
    // running over the corner point. At a 90 deg corner the new leg crosses under the whole bar (all
    // black for blackMin..blackMax ms) and stays under its side sensor last. At an acute corner the
    // bar sees two separate lines (pattern 5) or only a short / long all-black blur, and the last line
    // seen is the end of the old leg: the new leg is on the other side.
    if (weakCorner && millis() - cornerTime < 300 && rawSide != 0) {
      bool rightAngle = !sawTwoLines && blackMs >= blackMin && blackMs <= blackMax;
      lastSide = rightAngle ? rawSide : -rawSide;
    }
    weakCorner = false;
    searchDir = lastSide != 0 ? lastSide : -1;
  }
  long t = millis() - lostAt;
  if (lastSide != 0) {
    // The first part of the turn also has to stop the forward run, so it lasts a little longer
    // the faster we were going (it does not count towards the sweep angle).
    int brake = baseSpeed / 2;
    if (t < brake) { pivot(searchDir); return; }
    t -= brake;
  } else {
    // No idea where it went (a gap, the end of the line, or we started beside it): roll on a
    // little, then try a narrow sweep (about 45 deg each way) before the wide one.
    if (t < gapTime) { setMotors(90, 90); return; }
    t -= gapTime;
    int narrow = sweepTime / 3;
    if (t < narrow) { pivot(searchDir); return; }
    if (t < 3 * narrow) { pivot(-searchDir); return; }
    if (t < 4 * narrow) { pivot(searchDir); return; }
    t -= 4 * narrow;
  }
  if (t < sweepTime) pivot(searchDir);
  else if (t < 3 * sweepTime) pivot(-searchDir);
  else if (t < 4 * sweepTime) pivot(searchDir);
  else brakeMotors();                  // not within reach: stop safely instead of wandering off
}

void setup() {
${SETUP_PINS}
  pinMode(LEFT_SENSOR, INPUT);
  pinMode(CENTRE_SENSOR, INPUT);
  pinMode(RIGHT_SENSOR, INPUT);
}

void loop() {
  int left = digitalRead(LEFT_SENSOR);
  int centre = digitalRead(CENTRE_SENSOR);
  int right = digitalRead(RIGHT_SENSOR);
  int p = left * 4 + centre * 2 + right;
  bool changed = p != pattern;
  if (changed) {
    unsigned long now = millis();
    held2 = held1;
    held1 = now - patternStart;
    patternStart = now;
    before2 = before1;
    before1 = pattern;
    pattern = p;
    if (before1 == 7) blackMs = held1;   // the bar has just been all black for this long
    if (p == 5) sawTwoLines = true;
  }

  if (p == 0) {
    searchLine();                         // all white: the line is lost
    return;
  }
  if (lost) {                             // just found the line again
    lost = false;
    foundAt = millis();
  }
  int cruise = millis() - foundAt < alignTime ? baseSpeed * 2 / 3 : baseSpeed;

  if (left == HIGH && right == HIGH) {
    // A crossing, or the corner point of a sharp turn. Which way does the corner go?
    //  - two separate lines (pattern 5) while the old one was under one outer sensor: the new one
    //    is on the other side
    //  - centred, then a second line touched ONE side (2 → 3 or 2 → 6): the new leg is on that side
    //  - the line was coming back from an outer sensor (1 → 3 or 4 → 6): no clue yet, so let the
    //    next reading decide (at a 90° corner the new leg stays under one side)
    //  - otherwise trust the side seen last
    if (changed && before1 != 5 && before1 != 7) {   // just arrived (not 5 <-> 7)
      int corner = 0;
      if (p == 5 && before1 == 1) corner = -1;
      else if (p == 5 && before1 == 4) corner = 1;
      else if (before2 == 2 && before1 == 3) corner = 1;
      else if (before2 == 2 && before1 == 6) corner = -1;
      else if (!(before2 == 1 && before1 == 3) && !(before2 == 4 && before1 == 6)) corner = rawSide;
      // A robot that is still turning onto a leg wobbles along it (2 <-> 3 or 2 <-> 6 every few ms):
      // then the side touch was the old line, so the decision is only provisional (see searchLine).
      weakCorner = held2 < 30 && ((before2 == 2 && (before1 == 3 || before1 == 6)) || (before1 == 2 && (before2 == 3 || before2 == 6)));
      sawTwoLines = (p == 5);
      blackMs = 0;
      cornerTime = 0;
      if (corner != 0) {
        lastSide = corner;
        sideTime = millis();
        cornerTime = millis();
      }
    }
    setMotors(cruise, cruise);            // keep going straight over a crossing
    return;
  }
  if (left == HIGH) {
    rememberSide(-1);
    setMotors(turnSlow, turnFast);        // line is on the left → turn left
  } else if (right == HIGH) {
    rememberSide(1);
    setMotors(turnFast, turnSlow);        // line is on the right → turn right
  } else {
    if (millis() - sideTime > 300) lastSide = 0;   // centred for a while: forget the old side
    setMotors(cruise, cruise);            // centred → straight ahead
  }
}
`,
  },
  {
    id: "line-pid",
    title: "PID Line Following (5-sensor array)",
    description: "Weighted error from a 5-channel array with PID control (integral anti-windup), slows down in sharp turns, and recovers a lost line with a bounded search towards the side where it was last seen.",
    competition: "line",
    code: `// PID LINE FOLLOWER — 5 digital sensors, S1 (left) ... S5 (right), HIGH = black line.
${PINS}

const int sensorPins[5] = {A0, A1, A2, A3, A4};
int baseSpeed = 150;     // speed on straights
int minSpeed = 70;       // speed in the sharpest turns
float Kp = 40.0;
float Ki = 0.5;
float Kd = 40.0;
int integralLimit = 40;  // anti-windup: the I term can never add more than Ki * 40 = 20

// ---- lost-line recovery ----
// Works on a 4WD robot (the default) and on a 2WD robot with a caster. A 4WD robot pivots more slowly
// because all four tyres scrub sideways (about 170 deg/s at this speed, a 2WD robot about 265 deg/s).
int searchSpeed = 150;   // pivot speed while the line is lost
int sweepTime = 650;     // ms of pivoting. The search never turns further than this either way, so it
                         // can never swing round onto the line behind it and drive back.
int gapTime = 150;       // ms to roll straight on when the line vanishes while centred (a gap or line end)

int lastError = 0;
int integral = 0;
int lastSpeed = 0;       // forward speed just before the line was lost
int lastSide = 0;        // -1 = line last seen on the LEFT edge, +1 = RIGHT edge, 0 = centred
unsigned long sideTime = 0;
unsigned long edgeTime = 0;
bool lost = false;
unsigned long lostAt = 0;
int searchDir = -1;

${DRIVE_FUNCS}

// Hard stop for the L298N: both direction inputs equal with the enable fully on shorts the motor
// (brake). analogWrite(EN, 0) would only switch the bridge off and let the robot coast on.
void brakeMotors() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
  analogWrite(ENA, 255);
  analogWrite(ENB, 255);
}

void pivot(int dir) {      // dir -1 = turn left on the spot, +1 = turn right
  setMotors(dir * searchSpeed, -dir * searchSpeed);
}

// Bounded search: turn towards the remembered side, then sweep the other way, then back
// to where the line was lost, then stop (it never turns more than about 135 deg from there).
// loop() leaves it as soon as any sensor sees black again.
void searchLine() {
  if (!lost) {
    lost = true;
    lostAt = millis();
    searchDir = lastSide != 0 ? lastSide : (lastError > 0 ? 1 : -1);
    integral = 0;                      // anti-windup: forget the old integral
  }
  long t = millis() - lostAt;
  if (lastSide != 0) {
    // The first part of the turn also has to stop the forward run, so it lasts a little longer
    // the faster we were going (it does not count towards the sweep angle).
    int brake = lastSpeed / 2;
    if (t < brake) { pivot(searchDir); return; }
    t -= brake;
  } else {
    // No idea where it went (a gap, the end of the line, or we started beside it): roll on a
    // little, then try a narrow sweep (about 45 deg each way) before the wide one.
    if (t < gapTime) { setMotors(minSpeed, minSpeed); return; }
    t -= gapTime;
    int narrow = sweepTime / 3;
    if (t < narrow) { pivot(searchDir); return; }
    if (t < 3 * narrow) { pivot(-searchDir); return; }
    if (t < 4 * narrow) { pivot(searchDir); return; }
    t -= 4 * narrow;
  }
  if (t < sweepTime) pivot(searchDir);
  else if (t < 3 * sweepTime) pivot(-searchDir);
  else if (t < 4 * sweepTime) pivot(searchDir);
  else brakeMotors();                  // not within reach: stop safely instead of wandering off
}

void setup() {
${SETUP_PINS}
  for (int i = 0; i < 5; i++) {
    pinMode(sensorPins[i], INPUT);
  }
  Serial.begin(9600);
}

void loop() {
  int s[5];
  int sum = 0;
  int weighted = 0;
  for (int i = 0; i < 5; i++) {
    s[i] = digitalRead(sensorPins[i]);
    sum += s[i];
    weighted += s[i] * (i - 2);  // -2 (far left) ... +2 (far right)
  }

  if (sum == 0) {
    searchLine();
    return;
  }

  int error = (weighted * 2) / sum;   // -4 (line far left) ... +4 (far right)
  if (lost) {
    lost = false;
    lastError = error;                 // no derivative kick when the line comes back
  }

  // Remember which side the line went to. At a sharp corner the new leg appears under an OUTER
  // sensor (S1 or S5) just before the line disappears, so an outer sighting wins for 200 ms over an
  // inner sensor glimpsing the end of the old leg on the other side.
  unsigned long now = millis();
  if (s[0] && !s[4]) { lastSide = -1; edgeTime = now; sideTime = now; }
  else if (s[4] && !s[0]) { lastSide = 1; edgeTime = now; sideTime = now; }
  else if (now - edgeTime > 200 && error <= -2) { lastSide = -1; sideTime = now; }
  else if (now - edgeTime > 200 && error >= 2) { lastSide = 1; sideTime = now; }
  if (abs(error) < 2 && now - sideTime > 300) lastSide = 0;   // centred for a while: forget the old side

  // integral with anti-windup: clamp it, and reset it whenever the line crosses the centre
  if (error == 0 || (error > 0 && lastError < 0) || (error < 0 && lastError > 0)) integral = 0;
  integral = constrain(integral + error, -integralLimit, integralLimit);

  // slow down as the turn gets sharper, so the robot can follow tight corners
  int speed = baseSpeed - (baseSpeed - minSpeed) * abs(error) / 4;
  lastSpeed = speed;
  int correction = Kp * error + Ki * integral + Kd * (error - lastError);
  lastError = error;
  setMotors(speed + correction, speed - correction);
  delay(5);
}
`,
  },
  {
    id: "sumo",
    title: "Sumo Robot (search · attack · edge escape)",
    description: "HC-SR04 opponent search with two TCRT5000 edge sensors and the 5-second start delay.",
    competition: "sumo",
    code: `// SUMO — TB6612FNG driver, HC-SR04 on D11/D12, edge sensors (TCRT5000 D0) on D2/D3.
#define PWMA 5
#define AIN1 7
#define AIN2 8
#define PWMB 6
#define BIN1 9
#define BIN2 10
#define STBY 4
#define TRIG 11
#define ECHO 12
#define EDGE_LEFT 2
#define EDGE_RIGHT 3

void drive(int left, int right) {
  left = constrain(left, -255, 255);
  right = constrain(right, -255, 255);
  digitalWrite(AIN1, left >= 0 ? HIGH : LOW);
  digitalWrite(AIN2, left >= 0 ? LOW : HIGH);
  digitalWrite(BIN1, right >= 0 ? HIGH : LOW);
  digitalWrite(BIN2, right >= 0 ? LOW : HIGH);
  analogWrite(PWMA, abs(left));
  analogWrite(PWMB, abs(right));
}

long distanceCm() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000);
  if (us == 0) return 999;
  return us / 58;
}

void setup() {
  pinMode(PWMA, OUTPUT); pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(PWMB, OUTPUT); pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(EDGE_LEFT, INPUT);
  pinMode(EDGE_RIGHT, INPUT);
  digitalWrite(STBY, HIGH);
  delay(5000);              // mandatory start delay in most sumo rules
}

void loop() {
  // TCRT5000 module: D0 is LOW over the white border
  if (digitalRead(EDGE_LEFT) == LOW || digitalRead(EDGE_RIGHT) == LOW) {
    drive(-220, -220);
    delay(250);
    drive(200, -200);
    delay(300);
    return;
  }
  long d = distanceCm();
  if (d < 40) {
    drive(255, 255);        // attack!
  } else {
    drive(150, -150);       // search: spin
  }
}
`,
  },
  {
    id: "bluetooth",
    title: "Manual Bluetooth Control",
    description: "Reads F/B/L/R/S commands from an HC-05/HC-06 on the hardware serial port. In the simulator, WASD sends these characters.",
    competition: "any",
    code: `// BLUETOOTH RC — HC-05 TXD → Arduino RX (D0). Commands: F B L R S
${PINS}

${DRIVE_FUNCS}

int speed = 200;

void setup() {
${SETUP_PINS}
  Serial.begin(9600);
}

void loop() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 'F') setMotors(speed, speed);
    else if (c == 'B') setMotors(-speed, -speed);
    else if (c == 'L') setMotors(-speed / 2, speed / 2);
    else if (c == 'R') setMotors(speed / 2, -speed / 2);
    else if (c == 'S') stopMotors();
  }
}
`,
  },
  {
    id: "sensor-test",
    title: "Sensor Testing",
    description: "Prints analog and digital readings from A0–A4 to the Serial monitor.",
    competition: "any",
    code: `// SENSOR TEST — open the Serial monitor in the Simulation Arena.
void setup() {
  Serial.begin(9600);
}

void loop() {
  for (int i = 0; i < 5; i++) {
    Serial.print(analogRead(A0 + i));
    Serial.print("\\t");
  }
  Serial.println();
  delay(200);
}
`,
  },
  {
    id: "encoder-speed",
    title: "Encoder-Based Speed Control",
    description: "Counts encoder pulses with an interrupt and adjusts PWM to hold a target speed (P control).",
    competition: "race",
    code: `// ENCODER SPEED CONTROL — encoder channel A on D2 (interrupt pin).
${PINS}
#define ENC_A 2

volatile long ticks = 0;
long lastTicks = 0;
unsigned long lastTime = 0;
int pwm = 120;
int targetTicksPer100ms = 40;   // tune for your encoder (counts per rev × rev/s ÷ 10)

void onTick() {
  ticks++;
}

${DRIVE_FUNCS}

void setup() {
${SETUP_PINS}
  pinMode(ENC_A, INPUT);
  attachInterrupt(digitalPinToInterrupt(ENC_A), onTick, RISING);
  Serial.begin(9600);
}

void loop() {
  if (millis() - lastTime >= 100) {
    noInterrupts();
    long now = ticks;
    interrupts();
    long measured = now - lastTicks;
    lastTicks = now;
    lastTime = millis();
    int error = targetTicksPer100ms - measured;
    pwm = constrain(pwm + error * 2, 0, 255);
    Serial.print("ticks/100ms=");
    Serial.print(measured);
    Serial.print(" pwm=");
    Serial.println(pwm);
  }
  setMotors(pwm, pwm);
}
`,
  },
];
