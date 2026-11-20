/**
 * Robo Race reference projects.
 * RR-01 / RR-02 are driven from the keyboard THROUGH their own firmware: the arena sends single
 * characters to the robot's HC-05 Bluetooth module, exactly like a phone app would.
 * RR-03 is autonomous: it keeps itself on the road with two downward reflectance sensors and
 * holds its speed with encoder feedback.
 */
import type { ProjectTemplate } from "../types";

/** Bluetooth command protocol shared by the arena keyboard and the racer firmware. */
export const BT_PROTOCOL_DOC = "F forward · B reverse · L spin left · R spin right · Q forward-left · E forward-right · Z reverse-left · C reverse-right · S stop · + boost on · - boost off";

const ramped = (driveFn: string) => `
// ---- adjustable parameters ----
int cruiseSpeed = 180;   // normal top speed (0-255)
int boostSpeed = 255;    // SHIFT boost
int accelStep = 6;       // PWM increase per 20 ms  (acceleration)
int brakeStep = 25;      // PWM decrease per 20 ms  (braking)

bool boost = false;
char lastCommand = 'S';
int targetL = 0, targetR = 0;
int currentL = 0, currentR = 0;
unsigned long lastRamp = 0;

void setTargets(char c) {
  int v = boost ? boostSpeed : cruiseSpeed;
  switch (c) {
    case 'F': targetL = v;          targetR = v;          break;
    case 'B': targetL = -v * 7 / 10; targetR = -v * 7 / 10; break;
    case 'L': targetL = -v / 2;     targetR = v / 2;      break;
    case 'R': targetL = v / 2;      targetR = -v / 2;     break;
    case 'Q': targetL = v / 3;      targetR = v;          break;
    case 'E': targetL = v;          targetR = v / 3;      break;
    case 'Z': targetL = -v / 3;     targetR = -v * 7 / 10; break;
    case 'C': targetL = -v * 7 / 10; targetR = -v / 3;     break;
    default:  targetL = 0;          targetR = 0;          break;   // 'S' and anything unknown = stop
  }
}

// Move 'current' towards 'target': gentle when speeding up, hard when slowing down or reversing.
int ramp(int current, int target) {
  if (current == target) return current;
  bool slowingDown = (abs(target) < abs(current)) || (target > 0 && current < 0) || (target < 0 && current > 0);
  int step = slowingDown ? brakeStep : accelStep;
  if (target > current) return min(current + step, target);
  return max(current - step, target);
}

void readBluetooth() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '+') boost = true;
    else if (c == '-') boost = false;
    else if (c != '\\n' && c != '\\r') lastCommand = c;
    setTargets(lastCommand);
  }
}

void loop() {
  readBluetooth();
  if (millis() - lastRamp >= 20) {
    lastRamp = millis();
    currentL = ramp(currentL, targetL);
    currentR = ramp(currentR, targetR);
    ${driveFn}(currentL, currentR);
  }
}
`;

// ───────────────────────────── RR-01 ─────────────────────────────
const RR01_CODE = `// =============================================================
// RR-01 BASIC 2WD ROBO RACER — BEAST PROJECT GARAGE
// Arduino Uno R3 + L298N + 2x TT motor + HC-05 Bluetooth
// Keyboard -> Bluetooth -> Serial -> this sketch -> motors.
// Commands: ${BT_PROTOCOL_DOC}
// =============================================================

#define ENA 5
#define IN1 7
#define IN2 8
#define IN3 9
#define IN4 10
#define ENB 6

// speed 0 = active brake: both inputs HIGH with the enable HIGH shorts the motor (L298 "fast motor stop").
// Setting only EN LOW would let the robot coast.
void side(int en, int inA, int inB, int speed) {
  speed = constrain(speed, -255, 255);
  if (speed == 0) {
    digitalWrite(inA, HIGH);
    digitalWrite(inB, HIGH);
    analogWrite(en, 255);
    return;
  }
  digitalWrite(inA, speed > 0 ? HIGH : LOW);
  digitalWrite(inB, speed > 0 ? LOW : HIGH);
  analogWrite(en, abs(speed));
}

void drive(int left, int right) {
  side(ENA, IN1, IN2, left);
  side(ENB, IN3, IN4, right);
}

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT); pinMode(ENB, OUTPUT);
  Serial.begin(9600);   // HC-05 default data-mode baud rate
}
${ramped("drive")}`;

export const RR01: ProjectTemplate = {
  metadata: {
    id: "RR-01",
    name: "Basic 2WD Robo Racer",
    version: "1.1.0",
    competition: "race",
    difficulty: "beginner",
    learningLevel: "Motor control, PWM speed, acceleration and braking",
    description: "A keyboard-driven 2WD racer. Your key presses travel over a simulated HC-05 Bluetooth link into the Arduino sketch, which ramps the motor speed up and down for smooth acceleration and hard braking.",
    workingPrinciple:
      "The arena turns W/A/S/D/SHIFT/SPACE into the single-character commands an RC phone app would send. The sketch reads them from Serial (the HC-05 is wired to the Uno's RX pin), converts them into target wheel speeds and moves the actual PWM towards the target in small steps every 20 ms — a small step when speeding up (acceleration) and a big step when slowing down (braking).",
    learningObjectives: ["Differential steering with two motors", "PWM speed control through an L298N", "Serial / Bluetooth command protocols", "Acceleration and braking ramps"],
    limitations: ["Manual control only — the robot does not steer itself", "HC-05 RXD is not wired (the robot only receives), so no data is sent back to the controller", "Upload with the HC-05 disconnected from D0 on a real robot"],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "None (driver-controlled via Bluetooth)",
    drivetrain: "2WD",
    legacy: true,
  },
  chassis: { componentId: "2wd-robot-chassis" },
  parts: [
    { componentId: "tt-yellow-gear-motor", label: "Left Motor" },
    { componentId: "tt-yellow-gear-motor", label: "Right Motor" },
    { componentId: "high-speed-racing-wheels", label: "Left Wheel", attachedTo: "Left Motor" },
    { componentId: "high-speed-racing-wheels", label: "Right Wheel", attachedTo: "Right Motor" },
    { componentId: "ball-caster-wheels", label: "CASTER1" },
    { componentId: "arduino-uno-r3", label: "U1" },
    { componentId: "l298n", label: "DRV1" },
    { componentId: "18650-li-ion-cell", label: "BAT1", config: { series: 2, capacity: 2500 } },
    { componentId: "toggle-switch", label: "SW1" },
    { componentId: "hc-05-bluetooth-module", label: "BT1" },
  ],
  wiring: [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VS", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["DRV1.GND", "U1.GND1", "black"],
    ["U1.D5", "DRV1.ENA", "yellow"], ["U1.D7", "DRV1.IN1", "yellow"], ["U1.D8", "DRV1.IN2", "yellow"],
    ["U1.D9", "DRV1.IN3", "yellow"], ["U1.D10", "DRV1.IN4", "yellow"], ["U1.D6", "DRV1.ENB", "yellow"],
    ["DRV1.OUT1", "Left Motor.M+", "orange"], ["DRV1.OUT2", "Left Motor.M-", "orange"],
    ["DRV1.OUT3", "Right Motor.M-", "orange"], ["DRV1.OUT4", "Right Motor.M+", "orange"],
    ["U1.5V", "BT1.VCC", "red"], ["U1.GND2", "BT1.GND", "black"], ["BT1.TXD", "U1.D0", "blue"],
  ],
  pinMap: [
    { pin: "D0 (RX)", connectedTo: "BT1 TXD", purpose: "Bluetooth commands in" },
    { pin: "D5 / D6 (PWM)", connectedTo: "DRV1 ENA / ENB", purpose: "Left / right motor speed" },
    { pin: "D7 / D8 · D9 / D10", connectedTo: "DRV1 IN1/IN2 · IN3/IN4", purpose: "Motor direction" },
  ],
  firmware: {
    board: "uno",
    source: RR01_CODE,
    libraries: [],
    adjustable: [
      { name: "cruiseSpeed / boostSpeed", meaning: "Top speed normally and with SHIFT held." },
      { name: "accelStep / brakeStep", meaning: "How quickly the PWM ramps up (acceleration) and down (braking)." },
    ],
  },
  simulation: {
    controlMode: "code",
    keyboardViaSerial: true,
    dt: 0.001,
    difficulty: "beginner",
    defaultTrackId: "example-race-beginner-oval",
    alternativeTrackIds: ["example-race-intermediate-scurves", "example-race-advanced-circuit"],
  },
};

// ───────────────────────────── RR-02 ─────────────────────────────
const RR02_CODE = `// =============================================================
// RR-02 FOUR-WHEEL DRIVE RACER — BEAST PROJECT GARAGE
// Arduino Uno R3 + 2x TB6612FNG (one channel per motor) + 4x TT motor
// + HC-05 Bluetooth. Both motors on each side always receive the same
// command (motor synchronisation) for skid-steer differential turning.
// Commands: ${BT_PROTOCOL_DOC}
// =============================================================

// front driver (DRV1)
#define FL_PWM 3
#define FL_IN1 2
#define FL_IN2 4
#define FR_PWM 5
#define FR_IN1 7
#define FR_IN2 8
// rear driver (DRV2)
#define RL_PWM 6
#define RL_IN1 12
#define RL_IN2 13
#define RR_PWM 9
#define RR_IN1 A1
#define RR_IN2 A2

// speed 0 = short brake (TB6612: IN1 = IN2 = HIGH); PWM 0 alone would let the motor coast
void motor(int pwmPin, int in1, int in2, int speed) {
  speed = constrain(speed, -255, 255);
  if (speed == 0) {
    digitalWrite(in1, HIGH);
    digitalWrite(in2, HIGH);
    analogWrite(pwmPin, 255);
    return;
  }
  digitalWrite(in1, speed > 0 ? HIGH : LOW);
  digitalWrite(in2, speed > 0 ? LOW : HIGH);
  analogWrite(pwmPin, abs(speed));
}

// one command per side keeps front and rear wheels synchronised
void drive4(int left, int right) {
  motor(FL_PWM, FL_IN1, FL_IN2, left);
  motor(RL_PWM, RL_IN1, RL_IN2, left);
  motor(FR_PWM, FR_IN1, FR_IN2, right);
  motor(RR_PWM, RR_IN1, RR_IN2, right);
}

void setup() {
  pinMode(FL_PWM, OUTPUT); pinMode(FL_IN1, OUTPUT); pinMode(FL_IN2, OUTPUT);
  pinMode(FR_PWM, OUTPUT); pinMode(FR_IN1, OUTPUT); pinMode(FR_IN2, OUTPUT);
  pinMode(RL_PWM, OUTPUT); pinMode(RL_IN1, OUTPUT); pinMode(RL_IN2, OUTPUT);
  pinMode(RR_PWM, OUTPUT); pinMode(RR_IN1, OUTPUT); pinMode(RR_IN2, OUTPUT);
  Serial.begin(9600);
}
${ramped("drive4")}`;

export const RR02: ProjectTemplate = {
  metadata: {
    id: "RR-02",
    name: "Four-Wheel Drive Racer",
    version: "1.1.0",
    competition: "race",
    difficulty: "intermediate",
    learningLevel: "4WD skid steering, multiple drivers, motor synchronisation",
    description: "Four TT motors, each on its own TB6612FNG channel (two drivers), for traction and skid-steer turning. Keyboard control runs through the firmware over Bluetooth.",
    workingPrinciple:
      "Each TB6612FNG has two H-bridge channels, so two drivers give one channel per motor (1.2 A continuous each) instead of overloading a single driver. The sketch sends the same speed to both motors of a side; turning comes from a speed difference between sides, which makes the tyres skid sideways — that is why 4WD robots need more torque to turn than 2WD robots.",
    learningObjectives: ["Plan driver current: one channel per motor", "Wire two drivers to one controller", "Skid-steer differential turning", "Keep motors synchronised in software"],
    limitations: ["Skid steering scrubs the tyres: turning in place is slower than a 2WD robot", "Uses analog pins A1/A2 as digital outputs because the Uno runs out of digital pins"],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "None (driver-controlled via Bluetooth)",
    drivetrain: "4WD",
  },
  chassis: { componentId: "4wd-robot-chassis" },
  parts: [
    { componentId: "tt-yellow-gear-motor", label: "Rear Left Motor" },
    { componentId: "tt-yellow-gear-motor", label: "Rear Right Motor" },
    { componentId: "tt-yellow-gear-motor", label: "Front Left Motor" },
    { componentId: "tt-yellow-gear-motor", label: "Front Right Motor" },
    { componentId: "high-speed-racing-wheels", label: "Rear Left Wheel", attachedTo: "Rear Left Motor" },
    { componentId: "high-speed-racing-wheels", label: "Rear Right Wheel", attachedTo: "Rear Right Motor" },
    { componentId: "high-speed-racing-wheels", label: "Front Left Wheel", attachedTo: "Front Left Motor" },
    { componentId: "high-speed-racing-wheels", label: "Front Right Wheel", attachedTo: "Front Right Motor" },
    { componentId: "arduino-uno-r3", label: "U1" },
    { componentId: "tb6612fng", label: "DRV1" },
    { componentId: "tb6612fng", label: "DRV2" },
    { componentId: "18650-li-ion-cell", label: "BAT1", config: { series: 2, capacity: 2500 } },
    { componentId: "toggle-switch", label: "SW1" },
    { componentId: "hc-05-bluetooth-module", label: "BT1" },
  ],
  wiring: [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VM", "red"], ["SW1.2", "DRV2.VM", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["BAT1.-", "DRV2.GND", "black"], ["DRV1.GND", "U1.GND1", "black"],
    ["U1.5V", "DRV1.VCC", "red"], ["U1.5V", "DRV1.STBY", "red"], ["U1.5V", "DRV2.VCC", "red"], ["U1.5V", "DRV2.STBY", "red"],
    ["U1.D3", "DRV1.PWMA", "yellow"], ["U1.D2", "DRV1.AIN1", "yellow"], ["U1.D4", "DRV1.AIN2", "yellow"],
    ["U1.D5", "DRV1.PWMB", "yellow"], ["U1.D7", "DRV1.BIN1", "yellow"], ["U1.D8", "DRV1.BIN2", "yellow"],
    ["U1.D6", "DRV2.PWMA", "yellow"], ["U1.D12", "DRV2.AIN1", "yellow"], ["U1.D13", "DRV2.AIN2", "yellow"],
    ["U1.D9", "DRV2.PWMB", "yellow"], ["U1.A1", "DRV2.BIN1", "yellow"], ["U1.A2", "DRV2.BIN2", "yellow"],
    ["DRV1.AO1", "Front Left Motor.M+", "orange"], ["DRV1.AO2", "Front Left Motor.M-", "orange"],
    ["DRV1.BO1", "Front Right Motor.M-", "orange"], ["DRV1.BO2", "Front Right Motor.M+", "orange"],
    ["DRV2.AO1", "Rear Left Motor.M+", "orange"], ["DRV2.AO2", "Rear Left Motor.M-", "orange"],
    ["DRV2.BO1", "Rear Right Motor.M-", "orange"], ["DRV2.BO2", "Rear Right Motor.M+", "orange"],
    ["U1.5V", "BT1.VCC", "red"], ["U1.GND2", "BT1.GND", "black"], ["BT1.TXD", "U1.D0", "blue"],
  ],
  pinMap: [
    { pin: "D0 (RX)", connectedTo: "BT1 TXD", purpose: "Bluetooth commands in" },
    { pin: "D3 / D2 / D4", connectedTo: "DRV1 PWMA / AIN1 / AIN2", purpose: "Front-left motor" },
    { pin: "D5 / D7 / D8", connectedTo: "DRV1 PWMB / BIN1 / BIN2", purpose: "Front-right motor" },
    { pin: "D6 / D12 / D13", connectedTo: "DRV2 PWMA / AIN1 / AIN2", purpose: "Rear-left motor" },
    { pin: "D9 / A1 / A2", connectedTo: "DRV2 PWMB / BIN1 / BIN2", purpose: "Rear-right motor (A1/A2 used as digital outputs)" },
  ],
  firmware: {
    board: "uno",
    source: RR02_CODE,
    libraries: [],
    adjustable: [
      { name: "cruiseSpeed / boostSpeed", meaning: "Top speed normally / with boost." },
      { name: "accelStep / brakeStep", meaning: "Acceleration and braking ramps." },
    ],
  },
  simulation: {
    controlMode: "code",
    keyboardViaSerial: true,
    dt: 0.001,
    difficulty: "intermediate",
    defaultTrackId: "example-race-intermediate-scurves",
    alternativeTrackIds: ["example-race-beginner-oval", "example-race-advanced-circuit"],
  },
};

// ───────────────────────────── RR-03 ─────────────────────────────
const RR03_CODE = `// =============================================================
// RR-03 ENCODER-BASED SMART RACER — BEAST PROJECT GARAGE
// Arduino Nano + TB6612FNG + 2x 25GA370 gearmotor with Hall encoders
// + 2x TCRT5000 road sensors on brackets 90 mm either side of the centre.
// Autonomous: the dark road reads high, the light off-road area low.
// When a corner sensor leaves the road the robot steers back.
// Each wheel's speed is held by its own PI loop on encoder ticks.
// Live tuning: V<ticks per 50 ms> target speed, K<value> steering gain
// Telemetry every 200 ms: RACE,rpmL,rpmR,speed_cm_s,distance_cm,pwmL,pwmR
// =============================================================

#define PWMA 5
#define AIN1 7
#define AIN2 8
#define PWMB 6
#define BIN1 9
#define BIN2 10
#define ENC_L 2
#define ENC_R 3
#define ENC_LB 11
#define ENC_RB 12
#define ROAD_L A0
#define ROAD_R A1

// The encoder makes 341 quadrature counts per wheel revolution (see its inspector). Counting every
// change of channel A gives half of them.
const float COUNTS_PER_REV = 341.0 / 2.0;
const float WHEEL_CIRC_CM = 22.0;     // 70 mm wheel: pi * 7.0 cm

// ---- adjustable parameters ----
int targetTicks = 18;     // per 50 ms  (~127 rpm, ~0.46 m/s)
float steerGain = 1.0;    // how hard to steer back onto the road
float kp = 2.0;
float ki = 0.6;
int roadThreshold = 500;  // analog reading: above = on the (dark) road

volatile long ticksL = 0;
volatile long ticksR = 0;
long lastL = 0, lastR = 0;
float iL = 0, iR = 0;
int pwmL = 0, pwmR = 0;
float rpmL = 0, rpmR = 0;
float lastSteer = 0;        // remembered correction for when both sensors leave the road
unsigned long lastControl = 0, lastTelemetry = 0;

// quadrature decoding on every change of channel A: A != B = forward
void countL() { if (digitalRead(ENC_L) != digitalRead(ENC_LB)) ticksL++; else ticksL--; }
void countR() { if (digitalRead(ENC_R) != digitalRead(ENC_RB)) ticksR++; else ticksR--; }

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

void readCommands() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 'V') targetTicks = Serial.parseInt();
    if (c == 'K') steerGain = Serial.parseFloat();
  }
}

void setup() {
  pinMode(PWMA, OUTPUT); pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(PWMB, OUTPUT); pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(ENC_L, INPUT); pinMode(ENC_R, INPUT); pinMode(ENC_LB, INPUT); pinMode(ENC_RB, INPUT);
  attachInterrupt(digitalPinToInterrupt(ENC_L), countL, CHANGE);
  attachInterrupt(digitalPinToInterrupt(ENC_R), countR, CHANGE);
  Serial.begin(115200);
}

void loop() {
  readCommands();
  if (millis() - lastControl >= 50) {
    lastControl = millis();
    noInterrupts();
    long nowL = ticksL;
    long nowR = ticksR;
    interrupts();
    long dL = nowL - lastL;
    long dR = nowR - lastR;
    lastL = nowL;
    lastR = nowR;
    rpmL = dL * 1200.0 / COUNTS_PER_REV;   // 20 windows per second * 60 s
    rpmR = dR * 1200.0 / COUNTS_PER_REV;

    // steering from the road sensors: positive = steer right
    int roadL = analogRead(ROAD_L);
    int roadR = analogRead(ROAD_R);
    bool offL = roadL < roadThreshold;
    bool offR = roadR < roadThreshold;
    float steer = 0;
    if (offL && !offR) steer = 1.0;            // left corner off the road -> steer right
    else if (offR && !offL) steer = -1.0;      // right corner off the road -> steer left
    else if (offL && offR) steer = lastSteer;  // both off: keep the last correction until we are back
    if (steer != 0) lastSteer = steer;
    // slow down while correcting, then split the speed between the wheels to turn
    float base = steer == 0 ? targetTicks : targetTicks * 0.7;
    float wantL = base * (1.0 + 0.8 * steerGain * steer);
    float wantR = base * (1.0 - 0.8 * steerGain * steer);

    // per-wheel PI speed control (closed loop on encoder ticks)
    float eL = wantL - dL;
    float eR = wantR - dR;
    iL = constrain(iL + eL, -400, 400);
    iR = constrain(iR + eR, -400, 400);
    pwmL = constrain(kp * eL + ki * iL, -255, 255);
    pwmR = constrain(kp * eR + ki * iR, -255, 255);
    drive(pwmL, pwmR);
  }
  if (millis() - lastTelemetry >= 200) {
    lastTelemetry = millis();
    float distance = (ticksL + ticksR) / 2.0 / COUNTS_PER_REV * WHEEL_CIRC_CM;
    float speed = (rpmL + rpmR) / 2.0 / 60.0 * WHEEL_CIRC_CM;
    Serial.print("RACE,");
    Serial.print(rpmL); Serial.print(",");
    Serial.print(rpmR); Serial.print(",");
    Serial.print(speed); Serial.print(",");
    Serial.print(distance); Serial.print(",");
    Serial.print(pwmL); Serial.print(",");
    Serial.println(pwmR);
  }
}
`;

export const RR03: ProjectTemplate = {
  metadata: {
    id: "RR-03",
    name: "Encoder-Based Smart Racer",
    version: "1.1.0",
    competition: "race",
    difficulty: "advanced",
    learningLevel: "Closed-loop speed control, encoders and autonomous road keeping",
    description: "An autonomous racer: encoders measure each wheel's real speed and a PI loop per wheel holds the setpoint, while two corner reflectance sensors keep the robot on the dark road.",
    workingPrinciple:
      "Every 50 ms the sketch counts encoder ticks for each wheel (actual speed), compares them with the wanted ticks and adjusts each wheel's PWM with a PI controller — so the robot keeps its speed even as the battery sags. Two TCRT5000 sensors near the front corners read the floor: the road is dark (high reading), the surrounding floor is light (low reading). If one corner leaves the road, the wanted speed of that side is raised and the other lowered, turning the robot back onto the track.",
    learningObjectives: ["Measure RPM, speed and distance with encoders", "Closed-loop (PI) speed control", "Autonomous navigation from floor sensors", "Telemetry over Serial"],
    limitations: ["Road keeping relies on the contrast between road and surrounding floor", "Very tight hairpins need a lower target speed (send V12)", "Encoder counts per revolution must match the encoder setting (341 by default)"],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "2 road-edge reflectance sensors + 2 Hall encoders",
    drivetrain: "2WD",
    legacy: true,
  },
  chassis: { componentId: "racing-robot-chassis" },
  parts: [
    { componentId: "25ga370-gear-motor", label: "Left Motor" },
    { componentId: "25ga370-gear-motor", label: "Right Motor" },
    { componentId: "high-speed-racing-wheels", label: "Left Wheel", attachedTo: "Left Motor" },
    { componentId: "high-speed-racing-wheels", label: "Right Wheel", attachedTo: "Right Motor" },
    { componentId: "ball-caster-wheels", label: "CASTER1" },
    { componentId: "tcrt5000", label: "ROAD_L", position: { x: 105, y: 90, z: -43 }, yawDeg: 0 },
    { componentId: "tcrt5000", label: "ROAD_R", position: { x: 105, y: -90, z: -43 }, yawDeg: 0 },
    { componentId: "arduino-nano", label: "U1" },
    { componentId: "tb6612fng", label: "DRV1" },
    { componentId: "lipo-2s-battery", label: "BAT1", config: { capacity: 1000 } },
    { componentId: "toggle-switch", label: "SW1" },
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
    ["U1.5V", "ROAD_L.VCC", "red"], ["U1.GND2", "ROAD_L.GND", "black"], ["ROAD_L.A0", "U1.A0", "green"],
    ["U1.5V", "ROAD_R.VCC", "red"], ["U1.GND2", "ROAD_R.GND", "black"], ["ROAD_R.A0", "U1.A1", "green"],
    ["U1.5V", "ENC1.VCC", "red"], ["U1.GND2", "ENC1.GND", "black"], ["ENC1.A", "U1.D2", "blue"], ["ENC1.B", "U1.D11", "blue"],
    ["U1.5V", "ENC2.VCC", "red"], ["U1.GND2", "ENC2.GND", "black"], ["ENC2.A", "U1.D3", "blue"], ["ENC2.B", "U1.D12", "blue"],
  ],
  pinMap: [
    { pin: "D2 / D3 (interrupts)", connectedTo: "ENC1 A / ENC2 A", purpose: "Encoder ticks" },
    { pin: "D11 / D12", connectedTo: "ENC1 B / ENC2 B", purpose: "Encoder direction" },
    { pin: "A0 / A1", connectedTo: "ROAD_L / ROAD_R A0", purpose: "Road-edge reflectance (left / right corner)" },
    { pin: "D5 / D6 (PWM)", connectedTo: "DRV1 PWMA / PWMB", purpose: "Motor speed" },
    { pin: "D7 / D8 · D9 / D10", connectedTo: "DRV1 AIN1/AIN2 · BIN1/BIN2", purpose: "Motor direction" },
  ],
  firmware: {
    board: "nano",
    source: RR03_CODE,
    libraries: [],
    adjustable: [
      { name: "targetTicks", meaning: "Speed setpoint in encoder ticks per 50 ms. Live: V<value>." },
      { name: "steerGain", meaning: "Steering strength when a corner leaves the road. Live: K<value>." },
      { name: "kp / ki", meaning: "Wheel speed PI gains." },
    ],
  },
  simulation: {
    controlMode: "code",
    dt: 0.001,
    difficulty: "advanced",
    defaultTrackId: "example-race-beginner-oval",
    alternativeTrackIds: ["example-race-intermediate-scurves", "example-race-advanced-circuit"],
    tunables: [
      { key: "speed", label: "Target ticks / 50 ms", command: "V", default: 18, min: 4, max: 24, step: 1 },
      { key: "steer", label: "Steering gain", command: "K", default: 1, min: 0, max: 2, step: 0.05 },
    ],
    telemetryPrefix: "RACE",
    telemetryFields: ["Left RPM", "Right RPM", "Speed (cm/s)", "Distance (cm)", "Left PWM", "Right PWM"],
  },
};

export const RACE_TEMPLATES = [RR01, RR02, RR03];
