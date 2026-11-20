/**
 * 4WD (skid-steer) reference robots — the club standard for Robo Race, off-road racing and sumo.
 *
 * Every robot is an ordinary ProjectTemplate built from catalogue parts. The four motors and wheels are
 * placed with the same geometry as the Robot Designer's 4WD drivetrain helper (`layout4WD`), so a student
 * copy opens in the designer with a working "4WD drivetrain" panel (FL / FR / RL / RR).
 *
 * Motor drivers: two dual-channel TB6612FNG — one H-bridge channel per motor, so each motor can be tested
 * on its own. The firmware drives the left pair (FL + RL) and the right pair (FR + RR) together.
 * Left motors are mounted at yaw 0, right motors mirrored (yaw 180°) with swapped leads, so "forward" turns
 * all four wheels forward.
 */
import { getComponent } from "@/lib/catalogue";
import { CORNERS, type Drivetrain4WDParams, TYRE_GAP_MM, layout4WD } from "@/lib/robot/drivetrain4wd";
import { LIPO_3S_2100_ID } from "@/lib/catalogue/platform";
import type { WireColor } from "@/lib/types";
import type { ProjectTemplate, TemplatePart } from "../types";

/** Bluetooth protocol of the 4WD racers (a superset of the RR-01/RR-02 protocol). */
export const FOURWD_PROTOCOL_DOC =
  "F forward · B reverse · L pivot left · R pivot right · Q forward-left · E forward-right · Z reverse-left · C reverse-right · S stop · + boost on · - boost off · 1/2/3/4 run only the FL/FR/RL/RR motor · 0 end the motor test · V<0-255> cruise speed";

// ───────────────────────────── drivetrain ─────────────────────────────

interface DrivetrainSpec {
  motorId: string;
  wheelId: string;
  plateT: number;
  params: Drivetrain4WDParams;
  motorConfig?: Record<string, number | boolean | string>;
}

/** Four motors + four wheels at the corners, labelled "FL Motor" / "FL Wheel" … (same geometry as the designer helper). */
function drivetrainParts(d: DrivetrainSpec): TemplatePart[] {
  const motor = getComponent(d.motorId)!;
  const dims = motor.specs.dimensions!;
  const { corners } = layout4WD(d.params, dims, d.plateT);
  return CORNERS.flatMap((c): TemplatePart[] => [
    { componentId: d.motorId, label: `${c.key} Motor`, role: c.role, position: corners[c.key].motor.position, yawDeg: c.sy > 0 ? 0 : 180, ...(d.motorConfig ? { config: d.motorConfig } : {}) },
    { componentId: d.wheelId, label: `${c.key} Wheel`, role: c.role, position: corners[c.key].wheel.position, yawDeg: 0, attachedTo: `${c.key} Motor`, config: { diameter: d.params.wheelDiameter_mm, width: d.params.wheelWidth_mm } },
  ]);
}

/** Real ground clearance the layout produces (stored on the chassis for the simulator). */
const clearanceOf = (d: DrivetrainSpec) => layout4WD(d.params, getComponent(d.motorId)!.specs.dimensions!, d.plateT).mounting.clearance_mm;

/** Two TB6612FNG: DRV1 = front axle (A = FL, B = FR), DRV2 = rear axle (A = RL, B = RR). Right motors' leads swapped (mirrored mounting). */
const motorWiring = (): [string, string, WireColor][] => [
  ["DRV1.AO1", "FL Motor.M+", "orange"], ["DRV1.AO2", "FL Motor.M-", "orange"],
  ["DRV1.BO1", "FR Motor.M-", "orange"], ["DRV1.BO2", "FR Motor.M+", "orange"],
  ["DRV2.AO1", "RL Motor.M+", "orange"], ["DRV2.AO2", "RL Motor.M-", "orange"],
  ["DRV2.BO1", "RR Motor.M-", "orange"], ["DRV2.BO2", "RR Motor.M+", "orange"],
];

/** Uno pins for the four channels — the same map as RR-02 (A1/A2 used as digital outputs). */
const racerControlWiring = (): [string, string, WireColor][] => [
  ["U1.D3", "DRV1.PWMA", "yellow"], ["U1.D2", "DRV1.AIN1", "yellow"], ["U1.D4", "DRV1.AIN2", "yellow"],
  ["U1.D5", "DRV1.PWMB", "yellow"], ["U1.D7", "DRV1.BIN1", "yellow"], ["U1.D8", "DRV1.BIN2", "yellow"],
  ["U1.D6", "DRV2.PWMA", "yellow"], ["U1.D12", "DRV2.AIN1", "yellow"], ["U1.D13", "DRV2.AIN2", "yellow"],
  ["U1.D9", "DRV2.PWMB", "yellow"], ["U1.A1", "DRV2.BIN1", "yellow"], ["U1.A2", "DRV2.BIN2", "yellow"],
];

/** 3S battery → switch → both drivers' VM and the Uno's VIN; common ground; 5 V logic for the drivers. */
const racerPowerWiring = (): [string, string, WireColor][] => [
  ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VM", "red"], ["SW1.2", "DRV2.VM", "red"], ["SW1.2", "U1.VIN", "red"],
  ["BAT1.-", "DRV1.GND", "black"], ["BAT1.-", "DRV2.GND", "black"], ["DRV1.GND", "U1.GND1", "black"],
  ["U1.5V", "DRV1.VCC", "red"], ["U1.5V", "DRV1.STBY", "red"], ["U1.5V", "DRV2.VCC", "red"], ["U1.5V", "DRV2.STBY", "red"],
  ["U1.5V", "BT1.VCC", "red"], ["U1.GND2", "BT1.GND", "black"], ["BT1.TXD", "U1.D0", "blue"],
];

const racerPinMap = [
  { pin: "D0 (RX)", connectedTo: "BT1 TXD", purpose: "Bluetooth commands in" },
  { pin: "D3 / D2 / D4", connectedTo: "DRV1 PWMA / AIN1 / AIN2", purpose: "FL — front-left motor" },
  { pin: "D5 / D7 / D8", connectedTo: "DRV1 PWMB / BIN1 / BIN2", purpose: "FR — front-right motor" },
  { pin: "D6 / D12 / D13", connectedTo: "DRV2 PWMA / AIN1 / AIN2", purpose: "RL — rear-left motor" },
  { pin: "D9 / A1 / A2", connectedTo: "DRV2 PWMB / BIN1 / BIN2", purpose: "RR — rear-right motor (A1/A2 as digital outputs)" },
  { pin: "5V", connectedTo: "DRV1/DRV2 VCC + STBY, BT1 VCC", purpose: "Logic supply; STBY tied HIGH" },
  { pin: "VIN", connectedTo: "Battery + (via SW1)", purpose: "11.1 V (12.6 V full) — accepted, regulator runs warm" },
];

// ───────────────────────────── firmware ─────────────────────────────

const MOTOR_DEFINES = `// front driver DRV1: channel A = FL, channel B = FR
#define FL_PWM 3
#define FL_IN1 2
#define FL_IN2 4
#define FR_PWM 5
#define FR_IN1 7
#define FR_IN2 8
// rear driver DRV2: channel A = RL, channel B = RR
#define RL_PWM 6
#define RL_IN1 12
#define RL_IN2 13
#define RR_PWM 9
#define RR_IN1 A1
#define RR_IN2 A2`;

const MOTOR_FUNCTIONS = `// One H-bridge channel per motor. speed -255..255; 0 = short brake
// (TB6612: IN1 = IN2 = HIGH). PWM 0 alone would let the motor coast.
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

// individual control of all four wheels
void setMotors(int fl, int fr, int rl, int rr) {
  motor(FL_PWM, FL_IN1, FL_IN2, fl);
  motor(FR_PWM, FR_IN1, FR_IN2, fr);
  motor(RL_PWM, RL_IN1, RL_IN2, rl);
  motor(RR_PWM, RR_IN1, RR_IN2, rr);
}

// skid steering: the left pair (FL + RL) and the right pair (FR + RR) always get the same command
void drive(int left, int right) {
  setMotors(left, right, left, right);
}

void forward(int s)    { drive(s, s); }
void reverse(int s)    { drive(-s, -s); }
void pivotLeft(int s)  { drive(-s, s); }
void pivotRight(int s) { drive(s, -s); }
void stopAll()         { drive(0, 0); }

void motorPinsAsOutputs() {
  pinMode(FL_PWM, OUTPUT); pinMode(FL_IN1, OUTPUT); pinMode(FL_IN2, OUTPUT);
  pinMode(FR_PWM, OUTPUT); pinMode(FR_IN1, OUTPUT); pinMode(FR_IN2, OUTPUT);
  pinMode(RL_PWM, OUTPUT); pinMode(RL_IN1, OUTPUT); pinMode(RL_IN2, OUTPUT);
  pinMode(RR_PWM, OUTPUT); pinMode(RR_IN1, OUTPUT); pinMode(RR_IN2, OUTPUT);
}`;

/** Bluetooth-driven 4WD racer firmware; with `rover` it also drives itself and avoids obstacles. */
function racerFirmware(o: { header: string; rover?: boolean; cruise: number; turn: number }): string {
  const rover = !!o.rover;
  return `${o.header}

${MOTOR_DEFINES}${rover ? `
#define TRIG 11
#define ECHO 10` : ""}

// ---- adjustable parameters ----
int cruiseSpeed = ${o.cruise};   // normal top speed (0-255), live: V<value>
int boostSpeed = 255;    // SHIFT boost
int turnSpeed = ${o.turn};     // pivot turns: skid steering needs more torque than driving straight
int testSpeed = 160;     // motor test (commands 1-4)
int accelStep = 8;       // PWM increase per 20 ms  (acceleration)
int brakeStep = 30;      // PWM decrease per 20 ms  (braking)${rover ? `
int autoSpeed = 170;     // obstacle-avoidance cruising speed
int slowCm = 60;         // turn away from anything closer than this
int stopCm = 25;         // back up first if something is closer than this
int clearMs = 200;       // keep turning this long after the way ahead is clear (≈40° more)` : ""}

bool boost = false;
char lastCommand = 'S';
int testMotor = 0;       // 0 = normal driving, 1..4 = run only FL / FR / RL / RR
int targetL = 0, targetR = 0;
int currentL = 0, currentR = 0;
unsigned long lastRamp = 0;${rover ? `
bool autoMode = true;    // drives itself until a drive key is pressed; 'A' switches back
unsigned long lastPing = 0;
unsigned long turnUntil = 0;` : ""}

${MOTOR_FUNCTIONS}

void setTargets(char c) {
  int v = boost ? boostSpeed : cruiseSpeed;
  int t = boost ? boostSpeed : turnSpeed;
  switch (c) {
    case 'F': targetL = v;           targetR = v;           break;
    case 'B': targetL = -v * 7 / 10; targetR = -v * 7 / 10; break;
    case 'L': targetL = -t;          targetR = t;           break;   // pivot in place
    case 'R': targetL = t;           targetR = -t;          break;
    case 'Q': targetL = v / 3;       targetR = v;           break;   // arc forward-left
    case 'E': targetL = v;           targetR = v / 3;       break;
    case 'Z': targetL = -v / 3;      targetR = -v * 7 / 10; break;
    case 'C': targetL = -v * 7 / 10; targetR = -v / 3;      break;
    default:  targetL = 0;           targetR = 0;           break;   // 'S' and anything unknown = stop
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
    else if (c == 'V') cruiseSpeed = constrain(Serial.parseInt(), 0, 255);
    else if (c == '1') testMotor = 1;
    else if (c == '2') testMotor = 2;
    else if (c == '3') testMotor = 3;
    else if (c == '4') testMotor = 4;
    else if (c == '0') { testMotor = 0; lastCommand = 'S'; }${rover ? `
    else if (c == 'A') { autoMode = true; testMotor = 0; }
    else if (c == 'S') { if (!autoMode) { lastCommand = 'S'; testMotor = 0; } }   // released keys do not stop the autopilot` : ""}
    else if (c != '\\n' && c != '\\r') { lastCommand = c; testMotor = 0;${rover ? " autoMode = false;" : ""} }
    setTargets(lastCommand);
  }
}
${rover ? `
long distanceCm() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 25000);
  if (us == 0) return 999;
  return us / 58;
}

// Obstacle avoidance: cruise; when something is ahead, pivot right until the way is clear
// (plus clearMs so the whole body clears it); if it is very close, back up first.
void autopilot() {
  if (millis() - lastPing < 60) return;
  lastPing = millis();
  long d = distanceCm();
  if (d < stopCm) {
    reverse(150);
    delay(300);
    turnUntil = millis() + clearMs;
  } else if (d < slowCm) {
    turnUntil = millis() + clearMs;
  }
  if (millis() < turnUntil) pivotRight(turnSpeed);
  else forward(autoSpeed);
  currentL = 0; currentR = 0;
}
` : ""}
void setup() {
  motorPinsAsOutputs();${rover ? `
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);` : ""}
  Serial.begin(9600);    // HC-05 default data-mode baud rate
}

void loop() {
  readBluetooth();
  if (millis() - lastRamp < 20) return;
  lastRamp = millis();
  if (testMotor > 0) {   // individual motor test: only the chosen wheel turns
    setMotors(testMotor == 1 ? testSpeed : 0, testMotor == 2 ? testSpeed : 0, testMotor == 3 ? testSpeed : 0, testMotor == 4 ? testSpeed : 0);
    currentL = 0; currentR = 0;
    return;
  }${rover ? `
  if (autoMode) {
    autopilot();
    return;
  }` : ""}
  currentL = ramp(currentL, targetL);
  currentR = ramp(currentR, targetR);
  drive(currentL, currentR);
}
`;
}

// ───────────────────────────── RR-04 Standard 4WD Robo Race Car ─────────────────────────────

const RACE_DT: DrivetrainSpec = {
  motorId: "25ga370-gear-motor",
  wheelId: "rubber-robot-wheels",
  plateT: 3,
  params: { wheelDiameter_mm: 65, wheelWidth_mm: 26, wheelbase_mm: 150, trackWidth_mm: 150 + 26 + 2 * TYRE_GAP_MM, chassisLength_mm: 220, chassisWidth_mm: 150, groundClearance_mm: 20 },
};

const RACE_HEADER = (id: string, title: string, extra = "") => `// =============================================================
// ${id} ${title} — BEAST PROJECT GARAGE
// Arduino Uno R3 + 2x TB6612FNG (one channel per motor) + 4x 25GA370 12 V
// gearmotors + HC-05 Bluetooth + 11.1 V 2100 mAh 3S LiPo (12.6 V full).
// 4WD skid steering: the left pair (FL+RL) and the right pair (FR+RR) are
// driven together; every motor has its own channel for individual tests.${extra}
// Commands: ${FOURWD_PROTOCOL_DOC}
// =============================================================`;

/** Electronics shared by the 4WD racers, placed on a chassis plate of the given size (motors hang under the plate). */
function racerElectronics(L: number, battX: number): TemplatePart[] {
  return [
    { componentId: "arduino-uno-r3", label: "U1", position: { x: 25, y: 35, z: 8 } },
    { componentId: "tb6612fng", label: "DRV1", position: { x: L / 2 - 35, y: 30, z: 2 } },
    { componentId: "tb6612fng", label: "DRV2", position: { x: -50, y: -45, z: 2 } },
    { componentId: LIPO_3S_2100_ID, label: "BAT1", position: { x: battX, y: 0, z: 10.5 } },
    { componentId: "toggle-switch", label: "SW1", position: { x: -L / 2 + 15, y: 40, z: 6.5 } },
    { componentId: "hc-05-bluetooth-module", label: "BT1", position: { x: 20, y: -35, z: 3.5 } },
  ];
}

export const RR04: ProjectTemplate = {
  metadata: {
    id: "RR-04",
    name: "Standard 4WD Robo Race Car",
    version: "1.0.0",
    competition: "race",
    difficulty: "beginner",
    learningLevel: "4WD skid steering, one driver channel per motor, 3S LiPo power",
    description:
      "The club-standard Robo Race car: four 12 V 25GA370 gearmotors, each on its own TB6612FNG channel, on the 4WD chassis, powered by the 11.1 V 2100 mAh 3S LiPo. Keyboard driving goes over a simulated HC-05 Bluetooth link into the firmware.",
    workingPrinciple:
      "A 4WD robot steers like a tank: the left wheels and the right wheels are driven as two pairs, and a speed difference between the pairs turns the robot while the tyres scrub sideways. Opposite directions spin it in place (pivot turn). The firmware ramps the PWM up gently (acceleration) and down hard (braking). Because every motor has its own H-bridge channel, the commands 1–4 run a single motor so you can check each corner's wiring and direction.",
    learningObjectives: ["Skid-steer (tank) driving with four motors", "Wire two dual-channel drivers: one channel per motor", "Choose motors that match the battery (12 V motors on a 3S pack)", "Test each motor on its own before racing"],
    limitations: [
      "Skid steering scrubs the tyres: pivot turns need more torque than a 2WD robot",
      "Uses A1/A2 as digital outputs because the Uno runs out of digital pins",
      "The battery's discharge (C) rating, connector and charging spec were not supplied — check your pack",
      "The front sensor mount is empty: add a distance sensor as an extension",
    ],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "None (driver-controlled via Bluetooth); empty front sensor mount",
    drivetrain: "4WD",
    controlProtocol: FOURWD_PROTOCOL_DOC,
  },
  chassis: { componentId: "4wd-robot-chassis", length_mm: 220, width_mm: 150, thickness_mm: RACE_DT.plateT, groundClearance_mm: clearanceOf(RACE_DT) },
  parts: [...drivetrainParts(RACE_DT), ...racerElectronics(220, -50), { componentId: "sensor-mounting-brackets", label: "SENSOR MOUNT", position: { x: 100, y: 0, z: 5.5 } }],
  wiring: [...racerPowerWiring(), ...racerControlWiring(), ...motorWiring()],
  pinMap: racerPinMap,
  firmware: {
    board: "uno",
    source: racerFirmware({ header: RACE_HEADER("RR-04", "STANDARD 4WD ROBO RACE CAR"), cruise: 200, turn: 190 }),
    libraries: [],
    adjustable: [
      { name: "cruiseSpeed / boostSpeed", meaning: "Top speed normally and with SHIFT held. Live: V<0-255>." },
      { name: "turnSpeed", meaning: "PWM for pivot turns (4WD needs more than 2WD to overcome tyre scrub)." },
      { name: "accelStep / brakeStep", meaning: "Acceleration and braking ramps." },
      { name: "testSpeed", meaning: "PWM used by the single-motor test (commands 1-4)." },
    ],
  },
  simulation: {
    controlMode: "code",
    keyboardViaSerial: true,
    dt: 0.001,
    difficulty: "beginner",
    defaultTrackId: "example-race-beginner-oval",
    alternativeTrackIds: ["example-race-intermediate-scurves", "example-race-advanced-circuit"],
    tunables: [{ key: "cruise", label: "Cruise speed (PWM)", command: "V", default: 200, min: 60, max: 255, step: 5 }],
  },
};

// ───────────────────────────── RR-05 4WD Off-Road Rover ─────────────────────────────

const ROVER_DT: DrivetrainSpec = {
  motorId: "25ga370-gear-motor",
  wheelId: "knobby-tyres",
  plateT: 3,
  // Ø85 mm knobby tyres: the motor housings (the lowest point) ride 30 mm above the ground
  params: { wheelDiameter_mm: 85, wheelWidth_mm: 30, wheelbase_mm: 170, trackWidth_mm: 160 + 30 + 2 * TYRE_GAP_MM, chassisLength_mm: 240, chassisWidth_mm: 160, groundClearance_mm: 30 },
};

export const RR05: ProjectTemplate = {
  metadata: {
    id: "RR-05",
    name: "4WD Off-Road Rover",
    version: "1.0.0",
    competition: "race",
    difficulty: "intermediate",
    learningLevel: "Ground clearance, large wheels, obstacle avoidance with manual override",
    description:
      "A Land Rover-style 4WD: a sturdier 3 mm aluminium chassis, Ø85 mm knobby tyres and 30 mm of ground clearance, with the same Uno + 2× TB6612FNG + 3S LiPo electronics as the race car. It drives itself and steers around obstacles it sees with its front ultrasonic sensor; any drive key takes over manually.",
    workingPrinciple:
      "Bigger wheels lift the axles, so the motor housings — the lowest point — clear 30 mm of rocks and bumps, and each wheel covers more ground per turn. In autopilot the HC-SR04 on the front sensor mount measures the distance ahead every 60 ms: beyond 60 cm the rover cruises, closer it veers right, and inside 30 cm it backs up and pivots away. Bluetooth drive keys switch to manual control (the same protocol as the race car); 'A' re-enables the autopilot.",
    learningObjectives: ["Relate wheel size, ground clearance and motor housings", "Obstacle avoidance from an ultrasonic sensor", "Autonomous mode with a manual override", "Skid steering on loose ground"],
    limitations: [
      "One forward-facing sensor: obstacles to the side are not seen",
      "It always avoids to the right",
      "Larger wheels trade acceleration for top speed and clearance",
      "Off-road terrain behaviour depends on the arena's terrain model",
    ],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "HC-SR04 ultrasonic on the front sensor mount",
    drivetrain: "4WD",
    controlProtocol: `${FOURWD_PROTOCOL_DOC} · A autopilot on (default)`,
  },
  chassis: { componentId: "aluminium-robot-chassis", length_mm: 240, width_mm: 160, thickness_mm: ROVER_DT.plateT, material: "Aluminium", groundClearance_mm: clearanceOf(ROVER_DT) },
  parts: [
    ...drivetrainParts(ROVER_DT),
    ...racerElectronics(240, -55),
    { componentId: "sensor-mounting-brackets", label: "SENSOR MOUNT", position: { x: 110, y: 0, z: 5.5 } },
    { componentId: "hc-sr04", label: "US1", position: { x: 110, y: 0, z: 18.5 } },
  ],
  wiring: [...racerPowerWiring(), ...racerControlWiring(), ...motorWiring(), ["U1.5V", "US1.VCC", "red"], ["U1.GND3", "US1.GND", "black"], ["U1.D11", "US1.TRIG", "yellow"], ["US1.ECHO", "U1.D10", "green"]],
  pinMap: [...racerPinMap, { pin: "D11 / D10", connectedTo: "US1 TRIG / ECHO", purpose: "Ultrasonic distance (obstacle avoidance)" }],
  firmware: {
    board: "uno",
    source: racerFirmware({ header: RACE_HEADER("RR-05", "4WD OFF-ROAD ROVER", "\n// + HC-SR04 on the front sensor mount: obstacle-avoiding autopilot;\n// any drive key switches to manual control, 'A' back to the autopilot."), rover: true, cruise: 190, turn: 200 }),
    libraries: [],
    adjustable: [
      { name: "autoSpeed / slowCm / stopCm", meaning: "Autopilot cruising speed and the distances where it steers away / backs up." },
      { name: "cruiseSpeed / turnSpeed", meaning: "Manual driving and pivot-turn PWM. Live: V<0-255>." },
      { name: "accelStep / brakeStep", meaning: "Acceleration and braking ramps in manual mode." },
    ],
  },
  simulation: {
    controlMode: "code",
    keyboardViaSerial: true,
    dt: 0.001,
    difficulty: "intermediate",
    defaultTrackId: "example-offroad-beginner",
    alternativeTrackIds: ["example-race-beginner-oval", "example-race-advanced-circuit"],
    tunables: [{ key: "cruise", label: "Manual cruise speed (PWM)", command: "V", default: 190, min: 60, max: 255, step: 5 }],
  },
};

// ───────────────────────────── RR-06 4WD Experimental Robot ─────────────────────────────

const EXP_DT: DrivetrainSpec = {
  ...RACE_DT,
  // The catalogue's typical 25GA370 values, entered as "my own motor parameters" so RPM and torque can be edited directly.
  motorConfig: { customParams: true, nominalVoltage: 12, noLoadRpm: 300, stallTorqueKgCm: 4.08, stallCurrentA: 2 },
};

export const RR06: ProjectTemplate = {
  metadata: {
    id: "RR-06",
    name: "4WD Experimental Robot",
    version: "1.0.0",
    competition: "race",
    difficulty: "advanced",
    learningLevel: "Engineering experiments: wheel size, motor RPM/torque, chassis size, battery placement",
    description:
      "The 4WD test bed. Same electronics as the race car, but every parameter is meant to be changed: wheel diameter, wheelbase, track width and chassis size in the 4WD drivetrain panel, motor RPM and torque in each motor's inspector, and the battery position on its tray. Run the same track before and after each change and compare.",
    workingPrinciple:
      "Top speed ≈ wheel circumference × motor RPM; pushing force ≈ motor torque ÷ wheel radius — bigger wheels go faster but accelerate and climb worse. A longer wheelbase is steadier but scrubs more when pivoting; a wider track resists tipping. Moving the battery moves the centre of mass and changes how much load (grip) the front and rear wheels get. The motors start with the catalogue's typical 25GA370 values (estimates: 12 V, 300 rpm, 4.08 kg·cm, 2 A stall) entered as editable 'my own motor parameters'.",
    learningObjectives: ["Change one parameter at a time and measure the effect", "Speed vs torque: wheel size and gear ratio", "Wheelbase, track width and skid-steer turning", "Centre of mass and traction"],
    limitations: ["Starting motor values are typical estimates, not a datasheet", "The planar simulator does not model tipping over", "Keep each change small and re-validate the robot after it"],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "None (driver-controlled via Bluetooth); empty front sensor mount",
    drivetrain: "4WD",
    controlProtocol: FOURWD_PROTOCOL_DOC,
  },
  chassis: { componentId: "4wd-robot-chassis", length_mm: 220, width_mm: 150, thickness_mm: EXP_DT.plateT, groundClearance_mm: clearanceOf(EXP_DT) },
  parts: [...drivetrainParts(EXP_DT), ...racerElectronics(220, -60), { componentId: "sensor-mounting-brackets", label: "SENSOR MOUNT", position: { x: 100, y: 0, z: 5.5 } }],
  wiring: [...racerPowerWiring(), ...racerControlWiring(), ...motorWiring()],
  pinMap: racerPinMap,
  firmware: {
    board: "uno",
    source: racerFirmware({ header: RACE_HEADER("RR-06", "4WD EXPERIMENTAL ROBOT", "\n// Experiment: change wheels, motors, chassis or battery position and\n// compare lap times. Motor values are editable in each motor's inspector."), cruise: 200, turn: 190 }),
    libraries: [],
    adjustable: [
      { name: "cruiseSpeed / turnSpeed", meaning: "Driving and pivot PWM. Live: V<0-255>." },
      { name: "accelStep / brakeStep", meaning: "Acceleration and braking ramps." },
      { name: "4WD drivetrain panel", meaning: "Wheel diameter/width, wheelbase, track width, chassis size, ground clearance." },
      { name: "Motor inspector", meaning: "No-load RPM, stall torque and stall current of each motor." },
    ],
  },
  simulation: {
    controlMode: "code",
    keyboardViaSerial: true,
    dt: 0.001,
    difficulty: "advanced",
    defaultTrackId: "example-race-beginner-oval",
    alternativeTrackIds: ["example-race-intermediate-scurves", "example-race-advanced-circuit"],
    tunables: [{ key: "cruise", label: "Cruise speed (PWM)", command: "V", default: 200, min: 60, max: 255, step: 5 }],
  },
};

// ───────────────────────────── RW-04 4WD Sumo Robot ─────────────────────────────

const SUMO_DT: DrivetrainSpec = {
  motorId: "n20-micro-metal-gear-motor",
  wheelId: "sumo-robot-wheels",
  plateT: 3,
  // low plate (8 mm) with the N20 motors on top of it: low centre of gravity, four tyres on the mat
  params: { wheelDiameter_mm: 40, wheelWidth_mm: 20, wheelbase_mm: 60, trackWidth_mm: 100 + 20 + 2 * TYRE_GAP_MM, chassisLength_mm: 100, chassisWidth_mm: 100, groundClearance_mm: 8 },
};
const SUMO_GROUND_Z = -SUMO_DT.plateT - SUMO_DT.params.groundClearance_mm; // floor in the chassis frame
const SUMO_EDGE_Z = SUMO_GROUND_Z + 3 + 5; // 3 mm above the mat (sensor 10 mm tall)

const RW04_CODE = `// =============================================================
// RW-04 4WD SUMO ROBOT — BEAST PROJECT GARAGE
// Arduino Uno R3 + 2x TB6612FNG (one channel per motor) + 4x N20 micro
// gearmotors + HC-SR04 + 2x TCRT5000 front edge sensors + 2S LiPo.
// Four tyres on the mat for traction; low plate and front wedge.
// Same search / attack / edge logic as the RW sumo robots; the left pair
// and the right pair are driven together. 'X' on Serial = emergency stop.
// Edge sensors (D0) read LOW over the white border.
// =============================================================

// front driver DRV1: channel A = FL, channel B = FR
#define FL_PWM 3
#define FL_IN1 2
#define FL_IN2 4
#define FR_PWM 5
#define FR_IN1 7
#define FR_IN2 8
// rear driver DRV2: channel A = RL, channel B = RR
#define RL_PWM 6
#define RL_IN1 A0
#define RL_IN2 A1
#define RR_PWM 9
#define RR_IN1 A2
#define RR_IN2 A3
#define STBY_F 10    // DRV1 standby: motors off until the start delay is over
#define STBY_R 13    // DRV2 standby
#define TRIG 11
#define ECHO 12
#define EDGE_L A4
#define EDGE_R A5

// ---- adjustable parameters ----
int attackSpeed = 255;
int searchSpeed = 170;      // 4WD needs a bit more power than 2WD to spin
int attackRangeCm = 45;
int startDelayMs = 5000;    // most sumo rules require a 5 s delay after the start signal

bool stopped = false;
int searchDir = 1;
unsigned long lastFlip = 0;

void motor(int pwmPin, int in1, int in2, int speed) {
  speed = constrain(speed, -255, 255);
  digitalWrite(in1, speed >= 0 ? HIGH : LOW);
  digitalWrite(in2, speed >= 0 ? LOW : HIGH);
  analogWrite(pwmPin, abs(speed));
}

// individual control of all four wheels
void setMotors(int fl, int fr, int rl, int rr) {
  motor(FL_PWM, FL_IN1, FL_IN2, fl);
  motor(FR_PWM, FR_IN1, FR_IN2, fr);
  motor(RL_PWM, RL_IN1, RL_IN2, rl);
  motor(RR_PWM, RR_IN1, RR_IN2, rr);
}

// skid steering: left pair and right pair together
void drive(int left, int right) {
  setMotors(left, right, left, right);
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
  pinMode(FL_PWM, OUTPUT); pinMode(FL_IN1, OUTPUT); pinMode(FL_IN2, OUTPUT);
  pinMode(FR_PWM, OUTPUT); pinMode(FR_IN1, OUTPUT); pinMode(FR_IN2, OUTPUT);
  pinMode(RL_PWM, OUTPUT); pinMode(RL_IN1, OUTPUT); pinMode(RL_IN2, OUTPUT);
  pinMode(RR_PWM, OUTPUT); pinMode(RR_IN1, OUTPUT); pinMode(RR_IN2, OUTPUT);
  pinMode(STBY_F, OUTPUT); pinMode(STBY_R, OUTPUT);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  pinMode(EDGE_L, INPUT); pinMode(EDGE_R, INPUT);
  digitalWrite(STBY_F, LOW);          // motors disabled during the start delay
  digitalWrite(STBY_R, LOW);
  Serial.begin(9600);
  Serial.println("RW-04 armed: waiting for the start delay");
  delay(startDelayMs);
  digitalWrite(STBY_F, HIGH);
  digitalWrite(STBY_R, HIGH);
  Serial.println("GO!");
}

void loop() {
  if (Serial.available() > 0 && Serial.read() == 'X') stopped = true;   // emergency stop
  if (stopped) { drive(0, 0); digitalWrite(STBY_F, LOW); digitalWrite(STBY_R, LOW); return; }

  bool edgeL = digitalRead(EDGE_L) == LOW;
  bool edgeR = digitalRead(EDGE_R) == LOW;
  if (edgeL || edgeR) {               // boundary! back off and turn away
    drive(-230, -230);
    delay(250);
    if (edgeL) drive(220, -220); else drive(-220, 220);
    delay(300);
    return;
  }

  long d = distanceCm();
  if (d < attackRangeCm) {
    drive(attackSpeed, attackSpeed);  // opponent ahead: all four wheels push
  } else {
    if (millis() - lastFlip > 2500) { lastFlip = millis(); searchDir = -searchDir; }
    drive(searchSpeed * searchDir, -searchSpeed * searchDir);   // search by spinning
  }
}
`;

export const RW04: ProjectTemplate = {
  metadata: {
    id: "RW-04",
    name: "4WD Sumo Robot",
    version: "1.0.0",
    competition: "sumo",
    difficulty: "intermediate",
    learningLevel: "Four-wheel traction, low centre of gravity, search / attack / edge logic",
    description:
      "A compact 10 × 10 cm mini-sumo with four driven wheels: all four tyres press on the mat, the plate sits just 8 mm above it with the N20 motors on top for a low centre of gravity, and a front wedge gets under the opponent. HC-SR04 to find the opponent, two edge sensors to stay in the ring.",
    workingPrinciple:
      "Pushing force is limited by grip, and grip by the weight on the DRIVEN wheels. A 2WD robot carries part of its weight on a caster that cannot push; with four driven wheels all of the weight helps push. After the 5 s start delay (both drivers held in standby) the robot spins to search; when the ultrasonic echo comes back from closer than 45 cm it charges with all four wheels. Seeing the white border always wins: reverse, then turn away.",
    learningObjectives: ["Why four driven wheels push harder than two + caster", "Keep the centre of gravity low", "Search → detect → attack state logic with edge safety", "Hold motors in standby during the start delay"],
    limitations: [
      "Mini-sumo limits (10 × 10 cm, 500 g) leave no room for four 25GA370 motors and a 3S pack, so it uses N20 micro gearmotors on a 2S LiPo",
      "One forward sensor: it cannot tell if the opponent is to the side",
      "No rear edge sensors — reversing blindly can leave the ring",
    ],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "HC-SR04 + 2 front edge sensors",
    drivetrain: "4WD",
  },
  chassis: { componentId: "mini-sumo-robot-chassis", length_mm: 100, width_mm: 100, thickness_mm: SUMO_DT.plateT, groundClearance_mm: clearanceOf(SUMO_DT) },
  parts: [
    ...drivetrainParts(SUMO_DT),
    { componentId: "front-wedge", label: "WEDGE", position: { x: 55, y: 0, z: SUMO_GROUND_Z + 6 } },
    { componentId: "lipo-2s-battery", label: "BAT1", config: { capacity: 450 }, position: { x: -10, y: 0, z: 10.5 } },
    { componentId: "arduino-uno-r3", label: "U1", position: { x: -5, y: 0, z: 30 } },
    { componentId: "tb6612fng", label: "DRV1", position: { x: -20, y: 15, z: 40 } },
    { componentId: "tb6612fng", label: "DRV2", position: { x: -20, y: -15, z: 40 } },
    { componentId: "hc-sr04", label: "US1", position: { x: 40, y: 0, z: 9 } },
    { componentId: "tcrt5000-edge-detection-sensor", label: "EDGE_L", position: { x: 43, y: 38, z: SUMO_EDGE_Z }, yawDeg: 90 },
    { componentId: "tcrt5000-edge-detection-sensor", label: "EDGE_R", position: { x: 43, y: -38, z: SUMO_EDGE_Z }, yawDeg: 90 },
    { componentId: "toggle-switch", label: "SW1", position: { x: -40, y: -28, z: 6.5 } },
  ],
  wiring: [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VM", "red"], ["SW1.2", "DRV2.VM", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["BAT1.-", "DRV2.GND", "black"], ["DRV1.GND", "U1.GND1", "black"],
    ["U1.5V", "DRV1.VCC", "red"], ["U1.5V", "DRV2.VCC", "red"],
    ["U1.D10", "DRV1.STBY", "yellow"], ["U1.D13", "DRV2.STBY", "yellow"],
    ["U1.D3", "DRV1.PWMA", "yellow"], ["U1.D2", "DRV1.AIN1", "yellow"], ["U1.D4", "DRV1.AIN2", "yellow"],
    ["U1.D5", "DRV1.PWMB", "yellow"], ["U1.D7", "DRV1.BIN1", "yellow"], ["U1.D8", "DRV1.BIN2", "yellow"],
    ["U1.D6", "DRV2.PWMA", "yellow"], ["U1.A0", "DRV2.AIN1", "yellow"], ["U1.A1", "DRV2.AIN2", "yellow"],
    ["U1.D9", "DRV2.PWMB", "yellow"], ["U1.A2", "DRV2.BIN1", "yellow"], ["U1.A3", "DRV2.BIN2", "yellow"],
    ...motorWiring(),
    ["U1.5V", "US1.VCC", "red"], ["U1.GND2", "US1.GND", "black"], ["U1.D11", "US1.TRIG", "yellow"], ["US1.ECHO", "U1.D12", "green"],
    ["U1.5V", "EDGE_L.VCC", "red"], ["U1.GND2", "EDGE_L.GND", "black"], ["EDGE_L.D0", "U1.A4", "green"],
    ["U1.5V", "EDGE_R.VCC", "red"], ["U1.GND2", "EDGE_R.GND", "black"], ["EDGE_R.D0", "U1.A5", "green"],
  ],
  pinMap: [
    { pin: "D3 / D2 / D4", connectedTo: "DRV1 PWMA / AIN1 / AIN2", purpose: "FL — front-left motor" },
    { pin: "D5 / D7 / D8", connectedTo: "DRV1 PWMB / BIN1 / BIN2", purpose: "FR — front-right motor" },
    { pin: "D6 / A0 / A1", connectedTo: "DRV2 PWMA / AIN1 / AIN2", purpose: "RL — rear-left motor (A0/A1 as digital outputs)" },
    { pin: "D9 / A2 / A3", connectedTo: "DRV2 PWMB / BIN1 / BIN2", purpose: "RR — rear-right motor (A2/A3 as digital outputs)" },
    { pin: "D10 / D13", connectedTo: "DRV1 STBY / DRV2 STBY", purpose: "Motors enabled only after the start delay" },
    { pin: "D11 / D12", connectedTo: "US1 TRIG / ECHO", purpose: "Ultrasonic opponent sensor" },
    { pin: "A4 / A5", connectedTo: "EDGE_L / EDGE_R D0", purpose: "Front edge sensors (LOW = white border)" },
  ],
  firmware: {
    board: "uno",
    source: RW04_CODE,
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
    difficulty: "intermediate",
    defaultTrackId: "example-sumo-standard-dohyo",
    alternativeTrackIds: ["example-sumo-rect-arena"],
  },
};

export const FOURWD_RACE_TEMPLATES = [RR04, RR05, RR06];
export const FOURWD_SUMO_TEMPLATES = [RW04];
