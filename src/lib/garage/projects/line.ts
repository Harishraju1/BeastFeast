/**
 * Line-following reference projects. Every robot follows the line ONLY through its simulated
 * reflectance sensors and its own firmware — there is no path-following shortcut anywhere.
 */
import type { ProjectTemplate } from "../types";

/** Height (mm, chassis frame) for a downward-facing sensor whose bottom sits `gap` mm above the floor. */
const sensorZ = (plateT: number, motorH: number, wheelD: number, sensorH: number, gap = 4) => {
  const motorZ = -plateT - motorH / 2 - 1;
  const ground = motorZ - wheelD / 2;
  return ground + gap + sensorH / 2;
};

// ───────────────────────────── LF-01 ─────────────────────────────
const LF01_CODE = `// =============================================================
// LF-01 BASIC LINE FOLLOWER — BEAST PROJECT GARAGE
// Arduino Uno R3 + L298N + 2x TT gear motor + 3-channel IR array
// Sensor outputs are HIGH over the black line, LOW over white.
// =============================================================

// ---- pin map (matches Circuit Studio) ----
#define ENA 5        // left motor speed  (PWM)
#define IN1 7        // left motor direction
#define IN2 8
#define IN3 9        // right motor direction
#define IN4 10
#define ENB 6        // right motor speed (PWM)
#define S_LEFT   2   // IR array S1
#define S_CENTER 3   // IR array S2
#define S_RIGHT  4   // IR array S3

// ---- adjustable parameters ----
int baseSpeed = 150;   // straight-line speed (0-255)
int turnSpeed = 150;   // outer wheel speed while correcting
int innerSpeed = 0;    // inner wheel speed while correcting
int searchSpeed = 140; // spin speed when the line is lost

int lastSeen = 0;      // -1 = line was last on the left, +1 = right

void drive(int left, int right) {
  left = constrain(left, -255, 255);
  right = constrain(right, -255, 255);
  digitalWrite(IN1, left >= 0 ? HIGH : LOW);
  digitalWrite(IN2, left >= 0 ? LOW : HIGH);
  digitalWrite(IN3, right >= 0 ? HIGH : LOW);
  digitalWrite(IN4, right >= 0 ? LOW : HIGH);
  analogWrite(ENA, abs(left));
  analogWrite(ENB, abs(right));
}

// Optional live tuning from the Serial monitor: "B150" base speed, "T150" turn speed
void readCommands() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 'B') baseSpeed = Serial.parseInt();
    if (c == 'T') turnSpeed = Serial.parseInt();
  }
}

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT); pinMode(ENB, OUTPUT);
  pinMode(S_LEFT, INPUT); pinMode(S_CENTER, INPUT); pinMode(S_RIGHT, INPUT);
  Serial.begin(9600);
  Serial.println("LF-01 ready");
}

void loop() {
  readCommands();
  int L = digitalRead(S_LEFT);
  int C = digitalRead(S_CENTER);
  int R = digitalRead(S_RIGHT);

  if (L == HIGH && R == LOW) {          // line drifting to the left -> steer left
    drive(innerSpeed, turnSpeed);
    lastSeen = -1;
  } else if (R == HIGH && L == LOW) {   // line drifting to the right -> steer right
    drive(turnSpeed, innerSpeed);
    lastSeen = 1;
  } else if (C == HIGH) {               // centred (or crossing an intersection) -> straight
    drive(baseSpeed, baseSpeed);
  } else {                              // all white: line lost -> spin towards where we last saw it
    if (lastSeen < 0) drive(-searchSpeed, searchSpeed);
    else drive(searchSpeed, -searchSpeed);
  }
}
`;

export const LF01: ProjectTemplate = {
  metadata: {
    id: "LF-01",
    name: "Basic Line Follower",
    version: "1.0.0",
    competition: "line",
    difficulty: "beginner",
    learningLevel: "First robot — digital sensors and if/else steering",
    description: "A classic 2WD line follower: three digital IR sensors tell an Arduino Uno whether the black line is left, centre or right, and an L298N steers the robot back over it.",
    workingPrinciple:
      "Each IR sensor shines infrared light at the floor. White reflects it (output LOW), black absorbs it (output HIGH). The sketch reads the three outputs every loop: centre only → drive straight; left sensor black → slow the left wheel to turn left; right sensor black → turn right; nothing black → spin towards the side where the line was last seen.",
    learningObjectives: ["Wire an L298N with PWM speed control", "Read digital IR sensors", "Write bang-bang (if/else) steering", "Recover a lost line"],
    limitations: ["Bang-bang steering wobbles on straights and is slow on tight curves", "Three sensors give only coarse position information", "Speed is limited by the L298N voltage drop (≈2 V)"],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "3-channel digital IR array",
  },
  chassis: { componentId: "2wd-robot-chassis" },
  parts: [
    { componentId: "tt-yellow-gear-motor", label: "Left Motor" },
    { componentId: "tt-yellow-gear-motor", label: "Right Motor" },
    { componentId: "rubber-robot-wheels", label: "Left Wheel", attachedTo: "Left Motor" },
    { componentId: "rubber-robot-wheels", label: "Right Wheel", attachedTo: "Right Motor" },
    { componentId: "ball-caster-wheels", label: "CASTER1" },
    { componentId: "arduino-uno-r3", label: "U1" },
    { componentId: "l298n", label: "DRV1" },
    { componentId: "18650-li-ion-cell", label: "BAT1", config: { series: 2, capacity: 2500 } },
    { componentId: "toggle-switch", label: "SW1" },
    { componentId: "3-channel-ir-sensor-array", label: "IR1", position: { x: 115, y: 0, z: sensorZ(3, 18.8, 65, 10) }, yawDeg: 90 },
  ],
  wiring: [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VS", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["DRV1.GND", "U1.GND1", "black"],
    ["U1.D5", "DRV1.ENA", "yellow"], ["U1.D7", "DRV1.IN1", "yellow"], ["U1.D8", "DRV1.IN2", "yellow"],
    ["U1.D9", "DRV1.IN3", "yellow"], ["U1.D10", "DRV1.IN4", "yellow"], ["U1.D6", "DRV1.ENB", "yellow"],
    ["DRV1.OUT1", "Left Motor.M+", "orange"], ["DRV1.OUT2", "Left Motor.M-", "orange"],
    ["DRV1.OUT3", "Right Motor.M-", "orange"], ["DRV1.OUT4", "Right Motor.M+", "orange"],
    ["U1.5V", "IR1.VCC", "red"], ["U1.GND2", "IR1.GND", "black"],
    ["IR1.S1", "U1.D2", "green"], ["IR1.S2", "U1.D3", "green"], ["IR1.S3", "U1.D4", "green"],
  ],
  pinMap: [
    { pin: "D5 (PWM)", connectedTo: "DRV1 ENA", purpose: "Left motor speed" },
    { pin: "D7 / D8", connectedTo: "DRV1 IN1 / IN2", purpose: "Left motor direction" },
    { pin: "D9 / D10", connectedTo: "DRV1 IN3 / IN4", purpose: "Right motor direction" },
    { pin: "D6 (PWM)", connectedTo: "DRV1 ENB", purpose: "Right motor speed" },
    { pin: "D2 / D3 / D4", connectedTo: "IR1 S1 / S2 / S3", purpose: "Left / centre / right line sensors" },
    { pin: "VIN", connectedTo: "Battery + (via SW1)", purpose: "7.4 V supply to the on-board regulator" },
  ],
  firmware: {
    board: "uno",
    source: LF01_CODE,
    libraries: [],
    adjustable: [
      { name: "baseSpeed", meaning: "Straight-line speed (0–255). Live: send B<value> on Serial." },
      { name: "turnSpeed / innerSpeed", meaning: "Outer / inner wheel speed while correcting. Live: T<value>." },
      { name: "searchSpeed", meaning: "Spin speed while searching for a lost line." },
    ],
  },
  simulation: {
    controlMode: "code",
    dt: 0.001,
    difficulty: "beginner",
    defaultTrackId: "example-line-beginner-oval",
    alternativeTrackIds: ["example-line-intermediate-sharp", "example-line-advanced-figure8"],
    tunables: [
      { key: "base", label: "Base speed", command: "B", default: 150, min: 60, max: 255, step: 5 },
      { key: "turn", label: "Turn speed", command: "T", default: 150, min: 60, max: 255, step: 5 },
    ],
  },
};

// ───────────────────────────── LF-02 ─────────────────────────────
const LF02_CODE = `// =============================================================
// LF-02 ADVANCED FIVE-SENSOR LINE FOLLOWER — BEAST PROJECT GARAGE
// Arduino Uno R3 + TB6612FNG + 2x TT motor + 5x TCRT5000 (analog A0-A4)
// Calibrates every sensor, computes a weighted line position and
// steers with proportional control.
// =============================================================

#define PWMA 5
#define AIN1 7
#define AIN2 8
#define PWMB 6
#define BIN1 9
#define BIN2 10

const int sensorPins[5] = {A0, A1, A2, A3, A4};   // left ... right
int minV[5];
int maxV[5];
int value[5];        // calibrated 0 (white) .. 1000 (black)

// ---- adjustable parameters ----
int baseSpeed = 140;
float Kp = 0.07;      // steering gain (position range is -2000 .. +2000)
int searchSpeed = 150;
int lineThreshold = 300; // sum of calibrated values below this = line lost

int lastPosition = 0;

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

// Sweep left and right over the line, recording each sensor's darkest and brightest reading.
void calibrate() {
  for (int i = 0; i < 5; i++) { minV[i] = 1023; maxV[i] = 0; }
  unsigned long start = millis();
  while (millis() - start < 2400) {
    unsigned long t = (millis() - start) % 1200;
    if (t < 300) drive(-110, 110);
    else if (t < 900) drive(110, -110);
    else drive(-110, 110);
    for (int i = 0; i < 5; i++) {
      int v = analogRead(sensorPins[i]);
      if (v < minV[i]) minV[i] = v;
      if (v > maxV[i]) maxV[i] = v;
    }
  }
  drive(0, 0);
  Serial.println("Calibration done:");
  for (int i = 0; i < 5; i++) {
    Serial.print(minV[i]); Serial.print("-"); Serial.print(maxV[i]); Serial.print("  ");
  }
  Serial.println();
}

// Returns -2000 (line under the far-left sensor) .. +2000 (far right). Updates lastPosition.
int readLine() {
  long weighted = 0;
  long sum = 0;
  for (int i = 0; i < 5; i++) {
    int span = maxV[i] - minV[i];
    if (span < 50) span = 50;
    int v = analogRead(sensorPins[i]);
    value[i] = constrain((long)(v - minV[i]) * 1000 / span, 0, 1000);
    weighted += (long)value[i] * (i * 1000);
    sum += value[i];
  }
  if (sum < lineThreshold) {
    // lost-line recovery: pretend the line is fully to the side where we last saw it
    return lastPosition > 0 ? 2000 : -2000;
  }
  lastPosition = weighted / sum - 2000;
  return lastPosition;
}

void readCommands() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 'B') baseSpeed = Serial.parseInt();
    if (c == 'P') Kp = Serial.parseFloat();
  }
}

void setup() {
  pinMode(PWMA, OUTPUT); pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(PWMB, OUTPUT); pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  Serial.begin(115200);
  calibrate();
}

void loop() {
  readCommands();
  int position = readLine();
  int correction = Kp * position;
  if (abs(position) >= 2000) {
    // line lost: spin on the spot towards it
    if (position > 0) drive(searchSpeed, -searchSpeed);
    else drive(-searchSpeed, searchSpeed);
  } else {
    drive(baseSpeed + correction, baseSpeed - correction);
  }
}
`;

const LF02_X = 102;
const lf02Z = sensorZ(2, 18.8, 65, 10);
export const LF02: ProjectTemplate = {
  metadata: {
    id: "LF-02",
    name: "Advanced Five-Sensor Line Follower",
    version: "1.0.0",
    competition: "line",
    difficulty: "intermediate",
    learningLevel: "Analog sensors, calibration and proportional control",
    description: "Five analog TCRT5000 sensors and a TB6612FNG driver. The robot calibrates itself, computes a weighted line position and steers smoothly in proportion to the error.",
    workingPrinciple:
      "During the first 2.4 s the robot sweeps left and right across the line and records each sensor's darkest and brightest reading. Afterwards each reading is scaled to 0–1000 and a weighted average gives the line position (−2000 … +2000). The correction Kp × position is added to one wheel and subtracted from the other. If every sensor sees white, the robot spins towards the last known side.",
    learningObjectives: ["Calibrate analog sensors", "Compute a weighted average line position", "Tune a proportional controller (Kp)", "Use a MOSFET driver (TB6612FNG) with standby"],
    limitations: ["Proportional-only control can oscillate at high speed", "Must start with the sensor bar over the line so calibration sees black and white", "Five sensors span only 56 mm — very sharp turns rely on lost-line recovery"],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "5× TCRT5000 analog (calibrated)",
  },
  chassis: { componentId: "line-follower-chassis" },
  parts: [
    { componentId: "tt-yellow-gear-motor", label: "Left Motor" },
    { componentId: "tt-yellow-gear-motor", label: "Right Motor" },
    { componentId: "rubber-robot-wheels", label: "Left Wheel", attachedTo: "Left Motor" },
    { componentId: "rubber-robot-wheels", label: "Right Wheel", attachedTo: "Right Motor" },
    { componentId: "ball-caster-wheels", label: "CASTER1" },
    { componentId: "arduino-uno-r3", label: "U1" },
    { componentId: "tb6612fng", label: "DRV1" },
    { componentId: "18650-li-ion-cell", label: "BAT1", config: { series: 2, capacity: 2500 } },
    { componentId: "toggle-switch", label: "SW1" },
    // five modules side by side, long axis pointing forward (14 mm wide boards at 15 mm pitch)
    ...[30, 15, 0, -15, -30].map((y, i) => ({ componentId: "tcrt5000", label: `S${i + 1}`, position: { x: LF02_X, y, z: lf02Z }, yawDeg: 0 })),
  ],
  wiring: [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VM", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["DRV1.GND", "U1.GND1", "black"],
    ["U1.5V", "DRV1.VCC", "red"], ["U1.5V", "DRV1.STBY", "red"],
    ["U1.D5", "DRV1.PWMA", "yellow"], ["U1.D7", "DRV1.AIN1", "yellow"], ["U1.D8", "DRV1.AIN2", "yellow"],
    ["U1.D6", "DRV1.PWMB", "yellow"], ["U1.D9", "DRV1.BIN1", "yellow"], ["U1.D10", "DRV1.BIN2", "yellow"],
    ["DRV1.AO1", "Left Motor.M+", "orange"], ["DRV1.AO2", "Left Motor.M-", "orange"],
    ["DRV1.BO1", "Right Motor.M-", "orange"], ["DRV1.BO2", "Right Motor.M+", "orange"],
    ...[1, 2, 3, 4, 5].flatMap((n): [string, string, "red" | "black" | "green"][] => [
      ["U1.5V", `S${n}.VCC`, "red"], ["U1.GND2", `S${n}.GND`, "black"], [`S${n}.A0`, `U1.A${n - 1}`, "green"],
    ]),
  ],
  pinMap: [
    { pin: "D5 / D6 (PWM)", connectedTo: "DRV1 PWMA / PWMB", purpose: "Left / right motor speed" },
    { pin: "D7 / D8", connectedTo: "DRV1 AIN1 / AIN2", purpose: "Left motor direction" },
    { pin: "D9 / D10", connectedTo: "DRV1 BIN1 / BIN2", purpose: "Right motor direction" },
    { pin: "A0 … A4", connectedTo: "S1 … S5 A0", purpose: "Analog reflectance, left → right" },
    { pin: "5V", connectedTo: "DRV1 VCC + STBY, sensors", purpose: "Logic supply; STBY tied high (driver always enabled)" },
  ],
  firmware: {
    board: "uno",
    source: LF02_CODE,
    libraries: [],
    adjustable: [
      { name: "baseSpeed", meaning: "Cruise speed. Live: B<value>." },
      { name: "Kp", meaning: "Proportional steering gain. Live: P<value>." },
      { name: "lineThreshold", meaning: "Below this summed reading the line counts as lost." },
    ],
  },
  simulation: {
    controlMode: "code",
    dt: 0.001,
    difficulty: "intermediate",
    defaultTrackId: "example-line-intermediate-sharp",
    alternativeTrackIds: ["example-line-beginner-oval", "example-line-advanced-figure8", "example-line-beast-zigzag"],
    tunables: [
      { key: "base", label: "Base speed", command: "B", default: 140, min: 60, max: 255, step: 5 },
      { key: "kp", label: "Kp", command: "P", default: 0.07, min: 0, max: 0.3, step: 0.005 },
    ],
  },
};

// ───────────────────────────── LF-03 ─────────────────────────────
const LF03_CODE = `// =============================================================
// LF-03 PID LINE FOLLOWER — BEAST PROJECT GARAGE
// Arduino Nano + TB6612FNG + 2x N20 micro gearmotor with Hall
// encoders + Pololu QTR-8A reflectance array on A0-A7.
// Full PID with live tuning over Serial:
//   P<value>  Kp     I<value>  Ki     D<value>  Kd     B<value> base speed
// Telemetry every 100 ms:  PID,error,prevError,integral,derivative,output,left,right
// =============================================================

#define PWMA 5
#define AIN1 7
#define AIN2 8
#define PWMB 6
#define BIN1 9
#define BIN2 10
#define ENC_L 2      // left encoder channel A (interrupt)
#define ENC_R 3      // right encoder channel A (interrupt)
#define ENC_LB 11    // left encoder channel B (direction)
#define ENC_RB 12    // right encoder channel B (direction)

const int qtr[8] = {A0, A1, A2, A3, A4, A5, A6, A7};   // OUT1 (left) ... OUT8 (right)
int minV[8];
int maxV[8];

// ---- adjustable parameters ----
float Kp = 0.09;
float Ki = 0.0002;
float Kd = 0.9;
int baseSpeed = 170;
int maxSpeed = 255;

float error = 0;
float prevError = 0;
float integral = 0;
float derivative = 0;
float output = 0;
int lastPosition = 0;
int leftCmd = 0;
int rightCmd = 0;

volatile long ticksL = 0;
volatile long ticksR = 0;
unsigned long lastTelemetry = 0;

// quadrature: on every change of channel A, A != B means forward, A == B means backward
void countL() { if (digitalRead(ENC_L) != digitalRead(ENC_LB)) ticksL++; else ticksL--; }
void countR() { if (digitalRead(ENC_R) != digitalRead(ENC_RB)) ticksR++; else ticksR--; }

void drive(int left, int right) {
  left = constrain(left, -maxSpeed, maxSpeed);
  right = constrain(right, -maxSpeed, maxSpeed);
  leftCmd = left;
  rightCmd = right;
  digitalWrite(AIN1, left >= 0 ? HIGH : LOW);
  digitalWrite(AIN2, left >= 0 ? LOW : HIGH);
  digitalWrite(BIN1, right >= 0 ? HIGH : LOW);
  digitalWrite(BIN2, right >= 0 ? LOW : HIGH);
  analogWrite(PWMA, abs(left));
  analogWrite(PWMB, abs(right));
}

void calibrate() {
  for (int i = 0; i < 8; i++) { minV[i] = 1023; maxV[i] = 0; }
  unsigned long start = millis();
  while (millis() - start < 2000) {
    unsigned long t = (millis() - start) % 1000;
    if (t < 250) drive(-90, 90);
    else if (t < 750) drive(90, -90);
    else drive(-90, 90);
    for (int i = 0; i < 8; i++) {
      int v = analogRead(qtr[i]);
      if (v < minV[i]) minV[i] = v;
      if (v > maxV[i]) maxV[i] = v;
    }
  }
  drive(0, 0);
  Serial.print("CAL");
  for (int i = 0; i < 8; i++) { Serial.print(","); Serial.print(minV[i]); Serial.print("-"); Serial.print(maxV[i]); }
  Serial.println();
}

// -3500 (far left) .. +3500 (far right)
int readLine() {
  long weighted = 0;
  long sum = 0;
  for (int i = 0; i < 8; i++) {
    int span = maxV[i] - minV[i];
    if (span < 50) span = 50;
    int v = constrain((long)(analogRead(qtr[i]) - minV[i]) * 1000 / span, 0, 1000);
    if (v < 80) v = 0;                 // ignore noise
    weighted += (long)v * (i * 1000);
    sum += v;
  }
  if (sum < 250) return lastPosition > 0 ? 3500 : -3500;   // lost: hold the last side
  lastPosition = weighted / sum - 3500;
  return lastPosition;
}

void readCommands() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 'P') Kp = Serial.parseFloat();
    else if (c == 'I') { Ki = Serial.parseFloat(); integral = 0; }
    else if (c == 'D') Kd = Serial.parseFloat();
    else if (c == 'B') baseSpeed = Serial.parseInt();
  }
}

void setup() {
  pinMode(PWMA, OUTPUT); pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(PWMB, OUTPUT); pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(ENC_L, INPUT); pinMode(ENC_R, INPUT);
  pinMode(ENC_LB, INPUT); pinMode(ENC_RB, INPUT);
  attachInterrupt(digitalPinToInterrupt(ENC_L), countL, CHANGE);
  attachInterrupt(digitalPinToInterrupt(ENC_R), countR, CHANGE);
  Serial.begin(115200);
  calibrate();
}

void loop() {
  readCommands();
  int position = readLine();
  error = position;
  integral = constrain(integral + error, -20000, 20000);
  derivative = error - prevError;
  output = Kp * error + Ki * integral + Kd * derivative;
  prevError = error;

  // slow down on big errors so the robot can make sharp turns
  int speed = baseSpeed - abs(error) / 30;
  if (speed < 60) speed = 60;
  drive(speed + output, speed - output);

  if (millis() - lastTelemetry >= 100) {
    lastTelemetry = millis();
    Serial.print("PID,");
    Serial.print(error); Serial.print(",");
    Serial.print(prevError); Serial.print(",");
    Serial.print(integral); Serial.print(",");
    Serial.print(derivative); Serial.print(",");
    Serial.print(output); Serial.print(",");
    Serial.print(leftCmd); Serial.print(",");
    Serial.print(rightCmd); Serial.print(",");
    Serial.print(ticksL); Serial.print(",");
    Serial.println(ticksR);
  }
  delay(2);
}
`;

const lf03Z = sensorZ(2, 10, 34, 3.2, 3);
export const LF03: ProjectTemplate = {
  metadata: {
    id: "LF-03",
    name: "PID Line Follower",
    version: "1.0.0",
    competition: "line",
    difficulty: "advanced",
    learningLevel: "PID control, 8-sensor arrays, encoders and live tuning",
    description: "A fast competition-style follower: Pololu QTR-8A array, N20 gearmotors with Hall encoders, TB6612FNG and full PID control that you can tune while the robot runs.",
    workingPrinciple:
      "Eight calibrated analog sensors give a line position from −3500 to +3500. The PID controller adds a proportional term (how far off the line), an integral term (persistent offset) and a derivative term (how fast the error changes, which damps oscillation). The robot also slows down automatically when the error is large so it can take sharp corners. Encoders count wheel pulses for speed telemetry.",
    learningObjectives: ["Implement and tune PID (Kp, Ki, Kd)", "Use an 8-channel analog array", "Count encoder pulses with interrupts", "Tune a robot live over Serial while watching telemetry"],
    limitations: ["The Nano has exactly 8 analog inputs — all are used by the array", "Integral windup is clamped; very high Ki still destabilises the robot", "Encoders are used for telemetry, not closed-loop speed control"],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "QTR-8A 8-channel analog array + 2 Hall encoders",
  },
  chassis: { componentId: "line-follower-chassis" },
  parts: [
    { componentId: "n20-micro-metal-gear-motor", label: "Left Motor" },
    { componentId: "n20-micro-metal-gear-motor", label: "Right Motor" },
    { componentId: "silicone-robot-wheels", label: "Left Wheel", attachedTo: "Left Motor", config: { diameter: 34, width: 12 } },
    { componentId: "silicone-robot-wheels", label: "Right Wheel", attachedTo: "Right Motor", config: { diameter: 34, width: 12 } },
    { componentId: "ball-caster-wheels", label: "CASTER1" },
    { componentId: "arduino-nano", label: "U1" },
    { componentId: "tb6612fng", label: "DRV1" },
    { componentId: "lipo-2s-battery", label: "BAT1", config: { capacity: 450 } },
    { componentId: "toggle-switch", label: "SW1" },
    { componentId: "qtr-8a", label: "QTR1", position: { x: 92, y: 0, z: lf03Z }, yawDeg: 90 },
    { componentId: "hall-effect-encoder", label: "ENC1", attachedTo: "Left Motor" },
    { componentId: "hall-effect-encoder", label: "ENC2", attachedTo: "Right Motor" },
  ],
  wiring: [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VM", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["DRV1.GND", "U1.GND1", "black"],
    ["U1.5V", "DRV1.VCC", "red"], ["U1.5V", "DRV1.STBY", "red"],
    ["U1.D5", "DRV1.PWMA", "yellow"], ["U1.D7", "DRV1.AIN1", "yellow"], ["U1.D8", "DRV1.AIN2", "yellow"],
    ["U1.D6", "DRV1.PWMB", "yellow"], ["U1.D9", "DRV1.BIN1", "yellow"], ["U1.D10", "DRV1.BIN2", "yellow"],
    ["DRV1.AO1", "Left Motor.M+", "orange"], ["DRV1.AO2", "Left Motor.M-", "orange"],
    ["DRV1.BO1", "Right Motor.M-", "orange"], ["DRV1.BO2", "Right Motor.M+", "orange"],
    ["U1.5V", "QTR1.VCC", "red"], ["U1.GND2", "QTR1.GND", "black"],
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): [string, string, "green"] => [`QTR1.${n}`, `U1.A${n - 1}`, "green"]),
    ["U1.5V", "ENC1.VCC", "red"], ["U1.GND2", "ENC1.GND", "black"], ["ENC1.A", "U1.D2", "blue"], ["ENC1.B", "U1.D11", "blue"],
    ["U1.5V", "ENC2.VCC", "red"], ["U1.GND2", "ENC2.GND", "black"], ["ENC2.A", "U1.D3", "blue"], ["ENC2.B", "U1.D12", "blue"],
  ],
  pinMap: [
    { pin: "A0 … A7", connectedTo: "QTR1 OUT1 … OUT8", purpose: "8 analog reflectance channels, left → right (A6/A7 are analog-only on the Nano — fine for analogRead)" },
    { pin: "D5 / D6 (PWM)", connectedTo: "DRV1 PWMA / PWMB", purpose: "Motor speed" },
    { pin: "D7 / D8 · D9 / D10", connectedTo: "DRV1 AIN1/AIN2 · BIN1/BIN2", purpose: "Motor direction" },
    { pin: "D2 / D3 (interrupts)", connectedTo: "ENC1 A / ENC2 A", purpose: "Encoder pulse counting" },
    { pin: "D11 / D12", connectedTo: "ENC1 B / ENC2 B", purpose: "Encoder channel B (direction)" },
  ],
  firmware: {
    board: "nano",
    source: LF03_CODE,
    libraries: [],
    adjustable: [
      { name: "Kp / Ki / Kd", meaning: "PID gains. Live: P<value>, I<value>, D<value>." },
      { name: "baseSpeed", meaning: "Cruise speed. Live: B<value>." },
    ],
  },
  simulation: {
    controlMode: "code",
    dt: 0.001,
    difficulty: "advanced",
    defaultTrackId: "example-line-advanced-figure8",
    alternativeTrackIds: ["example-line-intermediate-sharp", "example-line-beast-zigzag", "example-line-beginner-oval"],
    tunables: [
      { key: "kp", label: "Kp", command: "P", default: 0.09, min: 0, max: 0.4, step: 0.005 },
      { key: "ki", label: "Ki", command: "I", default: 0.0002, min: 0, max: 0.005, step: 0.0001 },
      { key: "kd", label: "Kd", command: "D", default: 0.9, min: 0, max: 4, step: 0.05 },
      { key: "base", label: "Base speed", command: "B", default: 170, min: 60, max: 255, step: 5 },
    ],
    telemetryPrefix: "PID",
    telemetryFields: ["Error", "Previous error", "Integral", "Derivative", "PID output", "Left motor", "Right motor", "Left ticks", "Right ticks"],
  },
};

export const LINE_TEMPLATES = [LF01, LF02, LF03];
