/**
 * Robo War / Sumo reference projects. Opponents are found ONLY through the robots' simulated distance
 * sensors, the ring edge ONLY through their downward reflectance sensors, and pushes are resolved by
 * the physics engine — the match result comes from real ring-out events.
 */
import type { ProjectTemplate } from "../types";

// geometry helpers for a 100 mm mini-sumo with 25GA370 motors and 40 mm wheels on a 2 mm plate
const EDGE_Z = -2 - 12.5 - 1 - 20 + 3 + 5; // ground + 3 mm gap + half sensor height

// ───────────────────────────── RW-01 ─────────────────────────────
const RW01_CODE = `// =============================================================
// RW-01 BASIC SUMO ROBOT — BEAST PROJECT GARAGE
// Arduino Uno R3 + DRV8833 + 2x 25GA370 + HC-SR04 + 2x TCRT5000 edge
// Edge sensors (D0) read LOW over the white border.
// Send 'X' on Serial for an emergency stop.
// =============================================================

#define AIN1 5    // left motor  (DRV8833: PWM on the IN pins)
#define AIN2 6
#define BIN1 9    // right motor
#define BIN2 10
#define TRIG 11
#define ECHO 12
#define EDGE_L 2
#define EDGE_R 3

// ---- adjustable parameters ----
int attackSpeed = 255;
int searchSpeed = 150;
int attackRangeCm = 45;
int startDelayMs = 5000;   // most sumo rules require a 5 s delay after the start signal

bool stopped = false;
int searchDir = 1;
unsigned long lastFlip = 0;

void motor(int pinA, int pinB, int speed) {
  speed = constrain(speed, -255, 255);
  if (speed >= 0) { analogWrite(pinA, speed); analogWrite(pinB, 0); }
  else { analogWrite(pinA, 0); analogWrite(pinB, -speed); }
}

void drive(int left, int right) {
  motor(AIN1, AIN2, left);
  motor(BIN1, BIN2, right);
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
  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT); pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  pinMode(EDGE_L, INPUT); pinMode(EDGE_R, INPUT);
  Serial.begin(9600);
  Serial.println("RW-01 armed: waiting for the start delay");
  delay(startDelayMs);
  Serial.println("GO!");
}

void loop() {
  if (Serial.available() > 0 && Serial.read() == 'X') stopped = true;   // emergency stop
  if (stopped) { drive(0, 0); return; }

  bool edgeL = digitalRead(EDGE_L) == LOW;
  bool edgeR = digitalRead(EDGE_R) == LOW;
  if (edgeL || edgeR) {               // boundary! back off and turn away
    drive(-230, -230);
    delay(250);
    if (edgeL) drive(200, -200); else drive(-200, 200);
    delay(300);
    return;
  }

  long d = distanceCm();
  if (d < attackRangeCm) {
    drive(attackSpeed, attackSpeed);  // opponent ahead: full attack
  } else {
    if (millis() - lastFlip > 2500) { lastFlip = millis(); searchDir = -searchDir; }
    drive(searchSpeed * searchDir, -searchSpeed * searchDir);   // search by spinning
  }
}
`;

export const RW01: ProjectTemplate = {
  metadata: {
    id: "RW-01",
    name: "Basic Sumo Robot",
    version: "1.0.0",
    competition: "sumo",
    difficulty: "beginner",
    learningLevel: "Opponent search, edge detection and attack logic",
    description: "A mini-sumo with a front wedge, an ultrasonic sensor to find the opponent and two edge sensors to stay inside the white border.",
    workingPrinciple:
      "After the mandatory 5-second start delay the robot spins to search. The HC-SR04 pings the space ahead; when an echo comes back from closer than 45 cm the robot charges at full power and the wedge gets under the opponent, reducing its grip. The two TCRT5000 edge sensors watch the floor — the ring is black, the border white. Seeing white overrides everything: reverse, then turn away from that side.",
    learningObjectives: ["Measure distance with an ultrasonic sensor", "Prioritise safety (edge) over attack", "Search–detect–attack state logic", "Drive a DRV8833 with PWM on its IN pins"],
    limitations: ["One forward sensor: the robot cannot tell if the opponent is to the side", "Ultrasonic echoes can miss angled surfaces", "No rear edge sensors — reversing blindly can leave the ring"],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "HC-SR04 + 2 front edge sensors",
  },
  chassis: { componentId: "mini-sumo-robot-chassis", thickness_mm: 2 },
  parts: [
    { componentId: "25ga370-gear-motor", label: "Left Motor" },
    { componentId: "25ga370-gear-motor", label: "Right Motor" },
    { componentId: "sumo-robot-wheels", label: "Left Wheel", attachedTo: "Left Motor", config: { diameter: 40, width: 20 } },
    { componentId: "sumo-robot-wheels", label: "Right Wheel", attachedTo: "Right Motor", config: { diameter: 40, width: 20 } },
    { componentId: "ball-caster-wheels", label: "CASTER1" },
    { componentId: "front-wedge", label: "WEDGE", position: { x: 55, y: 0, z: -12 } },
    { componentId: "hc-sr04", label: "US1", position: { x: 40, y: 0, z: 9 } },
    { componentId: "tcrt5000-edge-detection-sensor", label: "EDGE_L", position: { x: 43, y: 38, z: EDGE_Z }, yawDeg: 90 },
    { componentId: "tcrt5000-edge-detection-sensor", label: "EDGE_R", position: { x: 43, y: -38, z: EDGE_Z }, yawDeg: 90 },
    { componentId: "arduino-uno-r3", label: "U1" },
    { componentId: "drv8833", label: "DRV1" },
    { componentId: "lipo-2s-battery", label: "BAT1", config: { capacity: 450 } },
    { componentId: "toggle-switch", label: "SW1" },
  ],
  wiring: [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VIN", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["DRV1.GND", "U1.GND1", "black"], ["U1.5V", "DRV1.SLEEP", "red"],
    ["U1.D5", "DRV1.AIN1", "yellow"], ["U1.D6", "DRV1.AIN2", "yellow"], ["U1.D9", "DRV1.BIN1", "yellow"], ["U1.D10", "DRV1.BIN2", "yellow"],
    ["DRV1.AOUT1", "Left Motor.M+", "orange"], ["DRV1.AOUT2", "Left Motor.M-", "orange"],
    ["DRV1.BOUT1", "Right Motor.M-", "orange"], ["DRV1.BOUT2", "Right Motor.M+", "orange"],
    ["U1.5V", "US1.VCC", "red"], ["U1.GND2", "US1.GND", "black"], ["U1.D11", "US1.TRIG", "yellow"], ["US1.ECHO", "U1.D12", "green"],
    ["U1.5V", "EDGE_L.VCC", "red"], ["U1.GND2", "EDGE_L.GND", "black"], ["EDGE_L.D0", "U1.D2", "green"],
    ["U1.5V", "EDGE_R.VCC", "red"], ["U1.GND2", "EDGE_R.GND", "black"], ["EDGE_R.D0", "U1.D3", "green"],
  ],
  pinMap: [
    { pin: "D5 / D6 (PWM)", connectedTo: "DRV1 AIN1 / AIN2", purpose: "Left motor speed + direction" },
    { pin: "D9 / D10 (PWM)", connectedTo: "DRV1 BIN1 / BIN2", purpose: "Right motor speed + direction" },
    { pin: "D11 / D12", connectedTo: "US1 TRIG / ECHO", purpose: "Ultrasonic opponent sensor" },
    { pin: "D2 / D3", connectedTo: "EDGE_L / EDGE_R D0", purpose: "Front edge sensors (LOW = white border)" },
    { pin: "5V", connectedTo: "DRV1 nSLEEP", purpose: "Keeps the driver awake" },
  ],
  firmware: {
    board: "uno",
    source: RW01_CODE,
    libraries: [],
    adjustable: [
      { name: "attackSpeed / searchSpeed", meaning: "Motor power while attacking / searching." },
      { name: "attackRangeCm", meaning: "Charge when the ultrasonic distance is below this." },
      { name: "startDelayMs", meaning: "Start delay required by your rules." },
    ],
  },
  simulation: {
    controlMode: "code",
    dt: 0.001,
    opponent: "beginner",
    difficulty: "beginner",
    defaultTrackId: "example-sumo-standard-dohyo",
    alternativeTrackIds: ["example-sumo-rect-arena"],
  },
};

// ───────────────────────────── RW-02 ─────────────────────────────
const RW02_CODE = `// =============================================================
// RW-02 ADVANCED SUMO ROBOT — BEAST PROJECT GARAGE
// Arduino Nano + TB6612FNG + 2x 25GA370 + HC-SR04 + Sharp GP2Y0A21
// + 4x TCRT5000 edge sensors (analog) at all four corners.
// Sensor fusion: the opponent is "seen" if either distance sensor
// reports it; the Sharp gives a fast short-range reading, the
// ultrasonic a longer one. STBY is only enabled after the delay.
// =============================================================

#define PWMA 5
#define AIN1 7
#define AIN2 8
#define PWMB 6
#define BIN1 9
#define BIN2 10
#define STBY 4
#define TRIG 11
#define ECHO 12
#define SHARP A0
#define EDGE_FL A1
#define EDGE_FR A2
#define EDGE_RL A3
#define EDGE_RR A4

// ---- adjustable parameters ----
int attackSpeed = 255;
int trackSpeed = 200;
int searchSpeed = 160;
int detectCm = 60;
int whiteThreshold = 450;   // analog edge reading below this = white border

int lastSeenSide = 1;        // 1 = turn right to search, -1 = left
unsigned long lastSeen = 0;

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

long ultrasonicCm() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 25000);
  if (us == 0) return 999;
  return us / 58;
}

// Sharp GP2Y0A21: distance (cm) ~ 27.86 * V^-1.15, valid 10-80 cm
int sharpCm() {
  float v = analogRead(SHARP) * 5.0 / 1023.0;
  if (v < 0.45) return 999;
  int cm = 27.86 * pow(v, -1.15);
  return cm;
}

bool white(int pin) { return analogRead(pin) < whiteThreshold; }

void setup() {
  pinMode(PWMA, OUTPUT); pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(PWMB, OUTPUT); pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT); pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  digitalWrite(STBY, LOW);          // motors disabled during the start delay
  Serial.begin(115200);
  delay(5000);
  digitalWrite(STBY, HIGH);
}

void loop() {
  // 1. edges first
  bool fl = white(EDGE_FL), fr = white(EDGE_FR), rl = white(EDGE_RL), rr = white(EDGE_RR);
  if (fl || fr) {
    drive(-240, -240);
    delay(220);
    if (fl) { drive(220, -220); lastSeenSide = 1; } else { drive(-220, 220); lastSeenSide = -1; }
    delay(260);
    return;
  }
  if (rl || rr) {                 // pushed backwards towards the border: escape forwards
    drive(255, 255);
    delay(250);
    return;
  }

  // 2. sensor fusion
  int s = sharpCm();
  long u = ultrasonicCm();
  bool sharpSees = s < detectCm;
  bool usSees = u < detectCm;
  if (sharpSees && s < 25) {
    drive(attackSpeed, attackSpeed);       // contact range: push!
    lastSeen = millis();
  } else if (sharpSees || usSees) {
    drive(trackSpeed, trackSpeed);         // approach
    lastSeen = millis();
  } else if (millis() - lastSeen < 400) {
    // just lost it: keep turning the way we were going (tracking)
    drive(trackSpeed * lastSeenSide, -trackSpeed * lastSeenSide / 2);
  } else {
    drive(searchSpeed * lastSeenSide, -searchSpeed * lastSeenSide);   // search
  }
  Serial.print("SUMO,"); Serial.print(s); Serial.print(","); Serial.println(u);
}
`;

export const RW02: ProjectTemplate = {
  metadata: {
    id: "RW-02",
    name: "Advanced Sumo Robot",
    version: "1.0.0",
    competition: "sumo",
    difficulty: "intermediate",
    learningLevel: "Sensor fusion, four-corner edge detection, tracking",
    description: "Two different distance sensors (Sharp IR + ultrasonic) and four corner edge sensors give a robot that tracks its opponent and also defends against being pushed backwards out of the ring.",
    workingPrinciple:
      "The Sharp IR sensor answers quickly at short range; the ultrasonic sees further. The robot treats the opponent as detected if either sensor reports it (fusion), approaches at tracking speed and switches to full power inside 25 cm. Four analog edge sensors cover all corners: a white front corner means reverse-and-turn, a white rear corner means it is being pushed out, so it drives forward to escape. The TB6612 standby pin keeps the motors disabled until the start delay ends.",
    learningObjectives: ["Fuse two distance sensors", "Convert a Sharp IR voltage to distance", "Defend against being pushed out (rear edge sensors)", "Use a driver enable/standby pin for safety"],
    limitations: ["Sharp sensors fold back below 10 cm and read 'far' at contact range", "Both distance sensors face forward — no side detection"],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "HC-SR04 + Sharp IR + 4 corner edge sensors",
  },
  chassis: { componentId: "mini-sumo-robot-chassis", thickness_mm: 2 },
  parts: [
    { componentId: "25ga370-gear-motor", label: "Left Motor" },
    { componentId: "25ga370-gear-motor", label: "Right Motor" },
    { componentId: "sumo-robot-wheels", label: "Left Wheel", attachedTo: "Left Motor", config: { diameter: 40, width: 20 } },
    { componentId: "sumo-robot-wheels", label: "Right Wheel", attachedTo: "Right Motor", config: { diameter: 40, width: 20 } },
    { componentId: "ball-caster-wheels", label: "CASTER1" },
    { componentId: "front-wedge", label: "WEDGE", position: { x: 55, y: 0, z: -12 } },
    { componentId: "hc-sr04", label: "US1", position: { x: 40, y: 0, z: 9 } },
    { componentId: "sharp-gp2y0a21yk0f", label: "IR1", position: { x: 40, y: 0, z: 26 } },
    { componentId: "tcrt5000-edge-detection-sensor", label: "EDGE_FL", position: { x: 43, y: 38, z: EDGE_Z }, yawDeg: 90 },
    { componentId: "tcrt5000-edge-detection-sensor", label: "EDGE_FR", position: { x: 43, y: -38, z: EDGE_Z }, yawDeg: 90 },
    { componentId: "tcrt5000-edge-detection-sensor", label: "EDGE_RL", position: { x: -43, y: 38, z: EDGE_Z }, yawDeg: 90 },
    { componentId: "tcrt5000-edge-detection-sensor", label: "EDGE_RR", position: { x: -43, y: -38, z: EDGE_Z }, yawDeg: 90 },
    { componentId: "arduino-nano", label: "U1" },
    { componentId: "tb6612fng", label: "DRV1" },
    { componentId: "lipo-2s-battery", label: "BAT1", config: { capacity: 450 } },
    { componentId: "toggle-switch", label: "SW1" },
  ],
  wiring: [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VM", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["DRV1.GND", "U1.GND1", "black"], ["U1.5V", "DRV1.VCC", "red"],
    ["U1.D5", "DRV1.PWMA", "yellow"], ["U1.D7", "DRV1.AIN1", "yellow"], ["U1.D8", "DRV1.AIN2", "yellow"],
    ["U1.D6", "DRV1.PWMB", "yellow"], ["U1.D9", "DRV1.BIN1", "yellow"], ["U1.D10", "DRV1.BIN2", "yellow"], ["U1.D4", "DRV1.STBY", "yellow"],
    ["DRV1.AO1", "Left Motor.M+", "orange"], ["DRV1.AO2", "Left Motor.M-", "orange"],
    ["DRV1.BO1", "Right Motor.M-", "orange"], ["DRV1.BO2", "Right Motor.M+", "orange"],
    ["U1.5V", "US1.VCC", "red"], ["U1.GND2", "US1.GND", "black"], ["U1.D11", "US1.TRIG", "yellow"], ["US1.ECHO", "U1.D12", "green"],
    ["U1.5V", "IR1.VCC", "red"], ["U1.GND2", "IR1.GND", "black"], ["IR1.VO", "U1.A0", "green"],
    ...(["FL", "FR", "RL", "RR"] as const).flatMap((c, i): [string, string, "red" | "black" | "green"][] => [
      ["U1.5V", `EDGE_${c}.VCC`, "red"], ["U1.GND2", `EDGE_${c}.GND`, "black"], [`EDGE_${c}.A0`, `U1.A${i + 1}`, "green"],
    ]),
  ],
  pinMap: [
    { pin: "A0", connectedTo: "IR1 Vo", purpose: "Sharp IR distance (analog)" },
    { pin: "D11 / D12", connectedTo: "US1 TRIG / ECHO", purpose: "Ultrasonic distance" },
    { pin: "A1 … A4", connectedTo: "EDGE_FL / FR / RL / RR A0", purpose: "Corner edge sensors (analog, low = white)" },
    { pin: "D4", connectedTo: "DRV1 STBY", purpose: "Driver enable after the start delay" },
    { pin: "D5 / D6 · D7–D10", connectedTo: "DRV1 PWMA/PWMB · direction pins", purpose: "Motors" },
  ],
  firmware: {
    board: "nano",
    source: RW02_CODE,
    libraries: [],
    adjustable: [
      { name: "detectCm", meaning: "Opponent detection range for both sensors." },
      { name: "whiteThreshold", meaning: "Analog edge threshold for the white border." },
      { name: "attackSpeed / trackSpeed / searchSpeed", meaning: "Power levels for each behaviour." },
    ],
  },
  simulation: {
    controlMode: "code",
    dt: 0.001,
    opponent: "intermediate",
    difficulty: "intermediate",
    defaultTrackId: "example-sumo-standard-dohyo",
    alternativeTrackIds: ["example-sumo-rect-arena"],
    telemetryPrefix: "SUMO",
    telemetryFields: ["Sharp distance (cm)", "Ultrasonic distance (cm)"],
  },
};

// ───────────────────────────── RW-03 ─────────────────────────────
const RW03_CODE = `// =============================================================
// RW-03 INTELLIGENT SUMO ROBOT — BEAST PROJECT GARAGE
// ESP32 DevKit V1 + TB6612FNG + 2x 25GA370 with Hall encoders
// + 3x Sharp GP2Y0A21 (left 45°, centre, right 45°) powered by an
// LM2596 buck converter + 4x TCRT5000 edge sensors on 3.3 V.
// Direction estimation from three sensors, adaptive attack,
// spiral search and stall recovery using the encoders.
// GPIO numbers are used directly (ESP32 Arduino core).
// =============================================================

#define PWMA 23
#define AIN1 22
#define AIN2 21
#define PWMB 13
#define BIN1 4
#define BIN2 16
#define STBY 17
#define SHARP_L 34
#define SHARP_C 35
#define SHARP_R 32
#define EDGE_FL 25
#define EDGE_FR 26
#define EDGE_RL 27
#define EDGE_RR 14
#define ENC_L 18
#define ENC_R 19

// ---- adjustable parameters ----
int attackSpeed = 255;
int approachSpeed = 210;
int searchSpeed = 170;
int detectCm = 55;

volatile long ticksL = 0;
volatile long ticksR = 0;
int lastDirection = 1;           // -1 left, +1 right: where the opponent was last seen
unsigned long searchStart = 0;
unsigned long pushStart = 0;
long pushTicks = 0;

void countL() { ticksL++; }
void countR() { ticksR++; }

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

// ESP32 ADC: 12-bit (0-4095) over 3.3 V
int sharpCm(int pin) {
  float v = analogRead(pin) * 3.3 / 4095.0;
  if (v < 0.45) return 999;
  return 27.86 * pow(v, -1.15);
}

void setup() {
  pinMode(PWMA, OUTPUT); pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(PWMB, OUTPUT); pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT); pinMode(STBY, OUTPUT);
  pinMode(EDGE_FL, INPUT); pinMode(EDGE_FR, INPUT); pinMode(EDGE_RL, INPUT); pinMode(EDGE_RR, INPUT);
  pinMode(ENC_L, INPUT); pinMode(ENC_R, INPUT);
  attachInterrupt(digitalPinToInterrupt(ENC_L), countL, RISING);
  attachInterrupt(digitalPinToInterrupt(ENC_R), countR, RISING);
  digitalWrite(STBY, LOW);
  Serial.begin(115200);
  delay(5000);
  digitalWrite(STBY, HIGH);
  searchStart = millis();
}

void loop() {
  // 1. boundary detection (TCRT5000 D0 is LOW over the white border)
  bool fl = digitalRead(EDGE_FL) == LOW, fr = digitalRead(EDGE_FR) == LOW;
  bool rl = digitalRead(EDGE_RL) == LOW, rr = digitalRead(EDGE_RR) == LOW;
  if (fl || fr) {
    drive(-255, -255); delay(200);
    if (fl) drive(230, -230); else drive(-230, 230);
    delay(240);
    searchStart = millis();
    return;
  }
  if (rl || rr) { drive(255, 255); delay(220); return; }

  // 2. direction estimation from three distance sensors
  int l = sharpCm(SHARP_L), c = sharpCm(SHARP_C), r = sharpCm(SHARP_R);
  bool seeL = l < detectCm, seeC = c < detectCm, seeR = r < detectCm;

  if (seeC) {
    // adaptive attack: full power at close range, otherwise approach while centring
    int bias = 0;
    if (seeL && !seeR) bias = -40;
    if (seeR && !seeL) bias = 40;
    int speed = c < 25 ? attackSpeed : approachSpeed;
    drive(speed + bias, speed - bias);
    if (pushStart == 0) { pushStart = millis(); pushTicks = ticksL + ticksR; }
    // 3. recovery: pushing for 1.5 s without the wheels turning = stalled, so flank
    if (millis() - pushStart > 1500) {
      if ((ticksL + ticksR) - pushTicks < 40) {
        drive(-200, -200); delay(180);
        drive(220 * lastDirection, -220 * lastDirection); delay(150);
      }
      pushStart = 0;
    }
    searchStart = millis();
    return;
  }
  pushStart = 0;
  if (seeL) { lastDirection = -1; drive(-180, 220); searchStart = millis(); return; }
  if (seeR) { lastDirection = 1; drive(220, -180); searchStart = millis(); return; }

  // 4. search pattern: spin towards the last known side, then widen into a spiral
  unsigned long t = millis() - searchStart;
  if (t < 1500) drive(searchSpeed * lastDirection, -searchSpeed * lastDirection);
  else drive(searchSpeed + 60 * lastDirection, searchSpeed - 60 * lastDirection);
}
`;

const SIDE_SHARP_Z = 9;
export const RW03: ProjectTemplate = {
  metadata: {
    id: "RW-03",
    name: "Intelligent Sumo Robot",
    version: "1.0.0",
    competition: "sumo",
    difficulty: "advanced",
    learningLevel: "Multi-sensor direction estimation, encoders, ESP32 and power design",
    description: "An ESP32 sumo with three Sharp IR sensors fanned across the front, four edge sensors, encoder stall detection and a buck converter feeding the 5 V sensors from the 2S LiPo.",
    workingPrinciple:
      "Three distance sensors split the front into left, centre and right zones, so the robot knows which way to turn to centre the opponent before attacking. While pushing it compares encoder ticks: if the wheels stop turning for 1.5 s the push has stalled, so it backs off and flanks. With nothing in view it spins towards the side the opponent was last seen and then widens into a spiral. The ESP32 runs at 3.3 V, so the Sharp sensors (5 V parts) are powered from an LM2596 set to 5 V; their outputs never exceed ≈3.1 V, safe for the ESP32 ADC.",
    learningObjectives: ["Estimate direction from several sensors", "Detect a stalled push with encoders", "Design a mixed 3.3 V / 5 V power system", "Program an ESP32 with GPIO numbers and a 12-bit ADC"],
    limitations: ["Sharp sensors read 'far' below 10 cm (fold-back)", "ESP32 analogRead on ADC2 pins is unavailable with Wi-Fi on — this design uses ADC1 pins only", "The ESP32 interpreter profile is a simplified model of the Arduino-ESP32 core"],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "3 Sharp IR + 4 edge sensors + 2 Hall encoders",
  },
  chassis: { componentId: "mini-sumo-robot-chassis", thickness_mm: 2 },
  parts: [
    { componentId: "25ga370-gear-motor", label: "Left Motor" },
    { componentId: "25ga370-gear-motor", label: "Right Motor" },
    { componentId: "sumo-robot-wheels", label: "Left Wheel", attachedTo: "Left Motor", config: { diameter: 40, width: 20 } },
    { componentId: "sumo-robot-wheels", label: "Right Wheel", attachedTo: "Right Motor", config: { diameter: 40, width: 20 } },
    { componentId: "ball-caster-wheels", label: "CASTER1" },
    { componentId: "front-wedge", label: "WEDGE", position: { x: 55, y: 0, z: -12 } },
    { componentId: "sharp-gp2y0a21yk0f", label: "IR_C", position: { x: 40, y: 0, z: SIDE_SHARP_Z } },
    { componentId: "sharp-gp2y0a21yk0f", label: "IR_L", position: { x: 8, y: 46, z: SIDE_SHARP_Z }, yawDeg: 45 },
    { componentId: "sharp-gp2y0a21yk0f", label: "IR_R", position: { x: 8, y: -46, z: SIDE_SHARP_Z }, yawDeg: -45 },
    { componentId: "tcrt5000-edge-detection-sensor", label: "EDGE_FL", position: { x: 43, y: 38, z: EDGE_Z }, yawDeg: 90 },
    { componentId: "tcrt5000-edge-detection-sensor", label: "EDGE_FR", position: { x: 43, y: -38, z: EDGE_Z }, yawDeg: 90 },
    { componentId: "tcrt5000-edge-detection-sensor", label: "EDGE_RL", position: { x: -43, y: 38, z: EDGE_Z }, yawDeg: 90 },
    { componentId: "tcrt5000-edge-detection-sensor", label: "EDGE_RR", position: { x: -43, y: -38, z: EDGE_Z }, yawDeg: 90 },
    { componentId: "esp32-devkit-v1", label: "U1" },
    { componentId: "tb6612fng", label: "DRV1" },
    { componentId: "lm2596-buck-converter", label: "REG1", config: { vout: 5 } },
    { componentId: "lipo-2s-battery", label: "BAT1", config: { capacity: 450 } },
    { componentId: "toggle-switch", label: "SW1" },
    { componentId: "hall-effect-encoder", label: "ENC1", attachedTo: "Left Motor" },
    { componentId: "hall-effect-encoder", label: "ENC2", attachedTo: "Right Motor" },
  ],
  wiring: [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VM", "red"], ["SW1.2", "U1.VIN", "red"], ["SW1.2", "REG1.IN+", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["DRV1.GND", "U1.GND1", "black"], ["BAT1.-", "REG1.IN-", "black"],
    ["U1.3V3", "DRV1.VCC", "red"],
    ["U1.D23", "DRV1.PWMA", "yellow"], ["U1.D22", "DRV1.AIN1", "yellow"], ["U1.D21", "DRV1.AIN2", "yellow"],
    ["U1.D13", "DRV1.PWMB", "yellow"], ["U1.D4", "DRV1.BIN1", "yellow"], ["U1.RX2", "DRV1.BIN2", "yellow"], ["U1.TX2", "DRV1.STBY", "yellow"],
    ["DRV1.AO1", "Left Motor.M+", "orange"], ["DRV1.AO2", "Left Motor.M-", "orange"],
    ["DRV1.BO1", "Right Motor.M-", "orange"], ["DRV1.BO2", "Right Motor.M+", "orange"],
    ...(["L", "C", "R"] as const).flatMap((s): [string, string, "red" | "black" | "green"][] => [
      ["REG1.OUT+", `IR_${s}.VCC`, "red"], ["REG1.OUT-", `IR_${s}.GND`, "black"],
    ]),
    ["IR_L.VO", "U1.D34", "green"], ["IR_C.VO", "U1.D35", "green"], ["IR_R.VO", "U1.D32", "green"],
    ...([["FL", "D25"], ["FR", "D26"], ["RL", "D27"], ["RR", "D14"]] as const).flatMap(([c, p]): [string, string, "red" | "black" | "green"][] => [
      ["U1.3V3", `EDGE_${c}.VCC`, "red"], ["U1.GND2", `EDGE_${c}.GND`, "black"], [`EDGE_${c}.D0`, `U1.${p}`, "green"],
    ]),
    ["U1.3V3", "ENC1.VCC", "red"], ["U1.GND2", "ENC1.GND", "black"], ["ENC1.A", "U1.D18", "blue"],
    ["U1.3V3", "ENC2.VCC", "red"], ["U1.GND2", "ENC2.GND", "black"], ["ENC2.A", "U1.D19", "blue"],
  ],
  pinMap: [
    { pin: "GPIO34 / 35 / 32 (ADC1)", connectedTo: "IR_L / IR_C / IR_R Vo", purpose: "Three Sharp IR distance sensors" },
    { pin: "GPIO25 / 26 / 27 / 14", connectedTo: "EDGE_FL / FR / RL / RR D0", purpose: "Edge sensors (3.3 V supply → 3.3 V logic)" },
    { pin: "GPIO18 / 19", connectedTo: "ENC1 A / ENC2 A", purpose: "Encoder ticks (stall detection)" },
    { pin: "GPIO23 / 22 / 21", connectedTo: "DRV1 PWMA / AIN1 / AIN2", purpose: "Left motor" },
    { pin: "GPIO13 / 4 / 16", connectedTo: "DRV1 PWMB / BIN1 / BIN2", purpose: "Right motor" },
    { pin: "GPIO17", connectedTo: "DRV1 STBY", purpose: "Driver enable after the start delay" },
    { pin: "REG1 OUT (5 V)", connectedTo: "Sharp VCC ×3", purpose: "5 V rail for the Sharp sensors" },
  ],
  firmware: {
    board: "esp32-devkit-v1",
    source: RW03_CODE,
    libraries: [],
    adjustable: [
      { name: "detectCm", meaning: "Detection range of the three Sharp sensors." },
      { name: "attackSpeed / approachSpeed / searchSpeed", meaning: "Power for each behaviour." },
    ],
  },
  simulation: {
    controlMode: "code",
    dt: 0.001,
    opponent: "advanced",
    difficulty: "advanced",
    defaultTrackId: "example-sumo-standard-dohyo",
    alternativeTrackIds: ["example-sumo-rect-arena"],
  },
};

export const SUMO_TEMPLATES = [RW01, RW02, RW03];
