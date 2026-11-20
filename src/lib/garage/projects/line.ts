/**
 * Line-following reference projects. Every robot follows the line ONLY through its simulated
 * reflectance sensors and its own firmware — there is no path-following shortcut anywhere.
 *
 * Since v2.0.0 all three are 4WD skid-steer robots (the club standard): four DC gearmotors, one per wheel,
 * at the corners of the chassis (FL / FR / RL / RR, same geometry as the Robot Designer's 4WD drivetrain
 * helper), no caster. Each robot keeps its dual-channel driver and its firmware pins: the left pair
 * (FL + RL) is wired in parallel to channel A and the right pair (FR + RR) to channel B — the usual 4WD
 * line-follower build. Two motors in parallel draw twice the current of one, so every driver channel is
 * checked against the sum of its motors' stall currents.
 */
import { getComponent } from "@/lib/catalogue";
import { CORNERS, type Drivetrain4WDParams, TYRE_GAP_MM, layout4WD } from "@/lib/robot/drivetrain4wd";
import type { WireColor } from "@/lib/types";
import type { ProjectTemplate, TemplatePart } from "../types";

// ───────────────────────────── 4WD drivetrain ─────────────────────────────

interface LineDrivetrain {
  motorId: string;
  wheelId: string;
  /** chassis plate thickness (mm) */
  plateT: number;
  params: Drivetrain4WDParams;
}

/** Four motors + four wheels at the corners, labelled "FL Motor" / "FL Wheel" … (left motors yaw 0, right motors mirrored). */
function drivetrainParts(d: LineDrivetrain): TemplatePart[] {
  const { corners } = layout4WD(d.params, getComponent(d.motorId)!.specs.dimensions!, d.plateT);
  return CORNERS.flatMap((c): TemplatePart[] => [
    { componentId: d.motorId, label: `${c.key} Motor`, role: c.role, position: corners[c.key].motor.position, yawDeg: c.sy > 0 ? 0 : 180 },
    { componentId: d.wheelId, label: `${c.key} Wheel`, role: c.role, position: corners[c.key].wheel.position, yawDeg: 0, attachedTo: `${c.key} Motor`, config: { diameter: d.params.wheelDiameter_mm, width: d.params.wheelWidth_mm } },
  ]);
}

const mountingOf = (d: LineDrivetrain) => layout4WD(d.params, getComponent(d.motorId)!.specs.dimensions!, d.plateT).mounting;

/** Height (mm, chassis frame) for a downward-facing sensor whose bottom sits `gap` mm above the floor. */
const sensorZ = (d: LineDrivetrain, sensorH: number, gap = 4) => -d.plateT - mountingOf(d).plateBottom_mm + gap + sensorH / 2;

/**
 * Left pair in parallel on channel A (outA = [+, −]), right pair in parallel on channel B. The right motors are
 * mounted mirrored, so their leads are swapped: the same "forward" command turns all four wheels forward.
 */
function parallelMotorWiring(outA: [string, string], outB: [string, string]): [string, string, WireColor][] {
  return [
    [outA[0], "FL Motor.M+", "orange"], [outA[1], "FL Motor.M-", "orange"],
    [outA[0], "RL Motor.M+", "orange"], [outA[1], "RL Motor.M-", "orange"],
    [outB[0], "FR Motor.M-", "orange"], [outB[1], "FR Motor.M+", "orange"],
    [outB[0], "RR Motor.M-", "orange"], [outB[1], "RR Motor.M+", "orange"],
  ];
}

// ───────────────────────────── LF-01 ─────────────────────────────
const LF01_CODE = `// =============================================================
// LF-01 BASIC LINE FOLLOWER — BEAST PROJECT GARAGE
// Arduino Uno R3 + L298N + 4x TT gear motor (4WD) + 3-channel IR array
// 4WD skid steering: the two left motors share channel A (OUT1/OUT2),
// the two right motors channel B (OUT3/OUT4), so drive(left, right)
// still sets one speed per side.
// Sensor outputs are HIGH over the black line, LOW over white.
// =============================================================

// ---- pin map (matches Circuit Studio) ----
#define ENA 5        // left motors speed  (PWM)
#define IN1 7        // left motors direction
#define IN2 8
#define IN3 9        // right motors direction
#define IN4 10
#define ENB 6        // right motors speed (PWM)
#define S_LEFT   2   // IR array S1
#define S_CENTER 3   // IR array S2
#define S_RIGHT  4   // IR array S3

// ---- adjustable parameters ----
int baseSpeed = 150;   // straight-line speed (0-255)
int turnSpeed = 150;   // outer wheels speed while correcting
int innerSpeed = -60;  // inner wheels speed while correcting. A 4WD robot turns by scrubbing its
                       // tyres sideways: stopped (let alone coasting) inner wheels hardly turn it,
                       // turning them slowly backwards does.

// ---- lost-line recovery ----
int searchSpeed = 150; // pivot while the line is lost (about 145 deg/s on this 4WD robot; a pivot
                       // needs more power than on a 2WD robot because all four tyres scrub)
int sweepTime = 850;   // ms of pivoting = about 135 deg. The search never turns further than this
                       // either way, so it cannot swing round onto the line behind it and drive back.
int gapTime = 150;     // ms to roll straight on when the line vanishes while centred (gap / line end)
int alignTime = 800;   // ms at 2/3 speed after the line was found again: a 4WD robot turns more
                       // slowly, so it needs a moment to line up before the next corner

int lastSeen = 0;      // -1 = line was last on the left, +1 = right, 0 = centred
int rawSeen = 0;       // side of the very latest off-centre reading (unfiltered)
unsigned long seenTime = 0;
unsigned long cornerTime = 0;  // when a sharp-corner point decided the side (locks it for 100 ms)
int pattern = 2;       // the sensors as one number: L*4 + C*2 + R (2 = only the centre is black)
int before1 = 2;       // the previous pattern ...
int before2 = 2;       // ... and the one before that
unsigned long patternStart = 0;  // when the current pattern began
unsigned long held1 = 0;         // how long the previous pattern lasted (ms) ...
unsigned long held2 = 0;         // ... and the one before that
bool weakCorner = false;         // corner side decided while wobbling along the old line (provisional)
bool sawTwoLines = false;        // two separate lines (pattern 5) seen at the current corner
unsigned long blackMs = 0;       // how long the whole bar was black at the current corner (ms)
int blackMin = 15;               // all black for blackMin..blackMax ms = crossing a 90 deg corner's new leg
int blackMax = 40;
bool lost = false;
unsigned long lostAt = 0;
unsigned long foundAt = 0;    // when the line was found again after a search
int searchDir = -1;

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

// Remember which side the line went to. Within 100 ms after a sharp-corner point decided the side,
// a glimpse on the OTHER side is just the end of the old line flashing past, so it is ignored.
void rememberSide(int side) {
  unsigned long now = millis();
  rawSeen = side;
  if (side == lastSeen || lastSeen == 0 || now - cornerTime > 100) {
    lastSeen = side;
    seenTime = now;
  }
}

// Hard stop for the L298N: both direction inputs equal with the enable fully on shorts the motor
// (brake). analogWrite(EN, 0) would only switch the bridge off and let the robot coast on.
void brake() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
  analogWrite(ENA, 255);
  analogWrite(ENB, 255);
}

void pivot(int dir) {  // -1 = turn left on the spot, +1 = turn right
  drive(dir * searchSpeed, -dir * searchSpeed);
}

// Bounded search: turn towards the remembered side, sweep back the other way, return to the
// heading where the line was lost, then stop (it never turns more than about 135 deg from there).
// loop() leaves it as soon as a sensor sees black.
void searchLine() {
  if (!lost) {
    lost = true;
    lostAt = millis();
    // Provisional corner (decided while wobbling along the old line): use what the sensors saw while
    // running over the corner point. At a 90 deg corner the new leg crosses under the whole bar (all
    // black for blackMin..blackMax ms) and stays under its side sensor last. At an acute corner the
    // bar sees two separate lines (pattern 5) or only a short / long all-black blur, and the last line
    // seen is the end of the old leg: the new leg is on the other side.
    if (weakCorner && millis() - cornerTime < 300 && rawSeen != 0) {
      bool rightAngle = !sawTwoLines && blackMs >= blackMin && blackMs <= blackMax;
      lastSeen = rightAngle ? rawSeen : -rawSeen;
    }
    weakCorner = false;
    searchDir = lastSeen != 0 ? lastSeen : -1;
  }
  long t = millis() - lostAt;
  if (lastSeen == 0) {
    // No idea where it went (a gap, the end of the line, or we started beside it): roll on a
    // little, then try a narrow sweep (about 45 deg each way) before the wide one.
    if (t < gapTime) { drive(90, 90); return; }
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
  else brake();                                   // not within reach: stop safely (and stay put)
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
  int p = L * 4 + C * 2 + R;
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

  if (p == 0) {                         // all white: line lost -> bounded search
    searchLine();
    return;
  }
  if (lost) {                           // just found the line again
    lost = false;
    foundAt = millis();
  }
  // A 4WD robot needs a moment to line up with a new leg: crawl for alignTime ms after a search.
  int cruise = millis() - foundAt < alignTime ? baseSpeed * 2 / 3 : baseSpeed;

  if (L == HIGH && R == HIGH) {         // crossing, or the corner point of a sharp turn -> straight.
    // Which way does the corner go?
    //  - two separate lines (pattern 5) while the old one was under one outer sensor: the new one
    //    is on the other side
    //  - centred, then a second line touched ONE side (2 -> 3 or 2 -> 6): the new leg is on that side
    //  - the line was coming back from an outer sensor (1 -> 3 or 4 -> 6): no clue yet, so let the
    //    next reading decide (at a 90 deg corner the new leg stays under one side)
    //  - otherwise trust the side seen last
    if (changed && before1 != 5 && before1 != 7) {   // just arrived (not 5 <-> 7)
      int corner = 0;
      if (p == 5 && before1 == 1) corner = -1;
      else if (p == 5 && before1 == 4) corner = 1;
      else if (before2 == 2 && before1 == 3) corner = 1;
      else if (before2 == 2 && before1 == 6) corner = -1;
      else if (!(before2 == 1 && before1 == 3) && !(before2 == 4 && before1 == 6)) corner = rawSeen;
      // A 4WD robot that is still turning onto a leg wobbles along it (2 <-> 3 or 2 <-> 6 every few
      // ms): then the side touch was the old line, so the decision is only provisional (see searchLine).
      weakCorner = held2 < 30 && ((before2 == 2 && (before1 == 3 || before1 == 6)) || (before1 == 2 && (before2 == 3 || before2 == 6)));
      sawTwoLines = (p == 5);
      blackMs = 0;
      cornerTime = 0;
      if (corner != 0) {
        lastSeen = corner;
        seenTime = millis();
        cornerTime = millis();
      }
    }
    drive(cruise, cruise);
    return;
  }
  if (L == HIGH) {                      // line drifting to the left -> steer left
    rememberSide(-1);
    drive(innerSpeed, turnSpeed);
  } else if (R == HIGH) {               // line drifting to the right -> steer right
    rememberSide(1);
    drive(turnSpeed, innerSpeed);
  } else {                              // centred -> straight
    if (millis() - seenTime > 300) lastSeen = 0;   // centred for a while: forget the old side
    drive(cruise, cruise);
  }
}
`;

/**
 * LF-01: TT gearmotors hang under a 190 × 130 mm acrylic 4WD plate on brackets (the plate sits at the same
 * height as on the old 2WD robot, so the sensor bracket is unchanged); Ø65 mm rubber wheels. The short
 * 90 mm wheelbase against the 164 mm track keeps skid-steer turning easy (wheelbase/track ≈ 0.55).
 */
const LF01_DT: LineDrivetrain = {
  motorId: "tt-yellow-gear-motor",
  wheelId: "rubber-robot-wheels",
  plateT: 3,
  params: { wheelDiameter_mm: 65, wheelWidth_mm: 26, wheelbase_mm: 90, trackWidth_mm: 130 + 26 + 2 * TYRE_GAP_MM, chassisLength_mm: 190, chassisWidth_mm: 130, groundClearance_mm: 20 },
};

export const LF01: ProjectTemplate = {
  metadata: {
    id: "LF-01",
    name: "Basic Line Follower",
    version: "2.0.0",
    competition: "line",
    difficulty: "beginner",
    learningLevel: "First robot — digital sensors and if/else steering",
    description: "A classic 4WD line follower: three digital IR sensors tell an Arduino Uno whether the black line is left, centre or right, and an L298N steers the robot back over it — the two left TT motors share channel A, the two right ones channel B.",
    workingPrinciple:
      "Each IR sensor shines infrared light at the floor. White reflects it (output LOW), black absorbs it (output HIGH). The sketch reads the three outputs every loop: centre only → drive straight; left sensor black → slow the left wheels to turn left; right sensor black → turn right. Like a tank, the 4WD robot turns by driving its left and right wheel pairs at different speeds while the tyres scrub sideways, so it turns a little more slowly than a 2WD robot on a caster and needs more power to pivot. The sketch remembers which side the line went to (at a sharp corner the new leg touches one side sensor first). When nothing is black it searches with a bounded pivot: towards the remembered side, then back the other way, never more than about 135° from where the line was lost, so it cannot swing round and follow the track backwards. If the line is not found it stops.",
    learningObjectives: ["Wire an L298N with PWM speed control", "Drive two motors in parallel from one driver channel", "Read digital IR sensors", "Write bang-bang (if/else) steering", "Recover a lost line"],
    limitations: [
      "Bang-bang steering wobbles on straights and is slow on tight curves",
      "Three sensors give only coarse position information",
      "Speed is limited by the L298N voltage drop (≈2 V)",
      "Skid steering scrubs the tyres: pivots need more PWM than on a 2WD robot with a caster",
      "Two TT motors per L298N channel can together draw its 3 A peak when both stall — do not hold the robot against a wall at full power",
    ],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "3-channel digital IR array",
    drivetrain: "4WD",
  },
  chassis: { componentId: "4wd-robot-chassis", length_mm: LF01_DT.params.chassisLength_mm, width_mm: LF01_DT.params.chassisWidth_mm, thickness_mm: LF01_DT.plateT, groundClearance_mm: mountingOf(LF01_DT).clearance_mm },
  parts: [
    ...drivetrainParts(LF01_DT),
    // battery on standoffs above the Uno, set back so the centre of mass sits over the middle of the four wheels
    { componentId: "arduino-uno-r3", label: "U1", position: { x: 5, y: 0, z: 8 } },
    { componentId: "l298n", label: "DRV1", position: { x: 62, y: 0, z: 14 } },
    { componentId: "18650-li-ion-cell", label: "BAT1", config: { series: 2, capacity: 2500 }, position: { x: -33, y: 0, z: 47.5 } },
    { componentId: "toggle-switch", label: "SW1" },
    { componentId: "3-channel-ir-sensor-array", label: "IR1", position: { x: 115, y: 0, z: sensorZ(LF01_DT, 10) }, yawDeg: 90 },
  ],
  wiring: [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VS", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["DRV1.GND", "U1.GND1", "black"],
    ["U1.D5", "DRV1.ENA", "yellow"], ["U1.D7", "DRV1.IN1", "yellow"], ["U1.D8", "DRV1.IN2", "yellow"],
    ["U1.D9", "DRV1.IN3", "yellow"], ["U1.D10", "DRV1.IN4", "yellow"], ["U1.D6", "DRV1.ENB", "yellow"],
    ...parallelMotorWiring(["DRV1.OUT1", "DRV1.OUT2"], ["DRV1.OUT3", "DRV1.OUT4"]),
    ["U1.5V", "IR1.VCC", "red"], ["U1.GND2", "IR1.GND", "black"],
    ["IR1.S1", "U1.D2", "green"], ["IR1.S2", "U1.D3", "green"], ["IR1.S3", "U1.D4", "green"],
  ],
  pinMap: [
    { pin: "D5 (PWM)", connectedTo: "DRV1 ENA", purpose: "Left motors speed (FL + RL in parallel on OUT1/OUT2)" },
    { pin: "D7 / D8", connectedTo: "DRV1 IN1 / IN2", purpose: "Left motors direction" },
    { pin: "D9 / D10", connectedTo: "DRV1 IN3 / IN4", purpose: "Right motors direction" },
    { pin: "D6 (PWM)", connectedTo: "DRV1 ENB", purpose: "Right motors speed (FR + RR in parallel on OUT3/OUT4)" },
    { pin: "D2 / D3 / D4", connectedTo: "IR1 S1 / S2 / S3", purpose: "Left / centre / right line sensors" },
    { pin: "VIN", connectedTo: "Battery + (via SW1)", purpose: "7.4 V supply to the on-board regulator" },
  ],
  firmware: {
    board: "uno",
    source: LF01_CODE,
    libraries: [],
    adjustable: [
      { name: "baseSpeed", meaning: "Straight-line speed (0–255). Live: send B<value> on Serial." },
      { name: "turnSpeed / innerSpeed", meaning: "Outer / inner wheel pair speed while correcting (the inner pair turns slowly backwards: a 4WD robot hardly turns with stopped inner wheels). Live: T<value>." },
      { name: "alignTime", meaning: "Time at 2/3 speed after a lost line was found again, so the 4WD robot lines up with the new leg before the next corner." },
      { name: "searchSpeed / sweepTime", meaning: "Pivot speed and duration (≈135°) of the bounded search for a lost line." },
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
// Arduino Uno R3 + TB6612FNG + 4x TT motor (4WD) + 5x TCRT5000 (A0-A4)
// 4WD skid steering: the left motor pair is on channel A, the right pair
// on channel B, so drive(left, right) still sets one speed per side.
// Calibrates every sensor, computes a weighted line position,
// steers with proportional control and slows down in sharp turns.
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
int minSpeed = 70;       // speed when the line is at the edge of the array (sharp turn)
float Kp = 0.07;         // steering gain (position range is -2000 .. +2000)
int lineThreshold = 300; // sum of calibrated values below this = line lost

// ---- lost-line recovery ----
int searchSpeed = 150;   // pivot while the line is lost (about 190 deg/s on this 4WD robot; all four
                         // tyres scrub, so a pivot needs more power than on a 2WD robot)
int sweepTime = 680;     // ms of pivoting = about 135 deg. The search never turns further than this
                         // either way, so it cannot swing round onto the line behind it and drive back.
int gapTime = 150;       // ms to roll straight on when the line vanishes while centred (gap / line end)

int lastPosition = 0;
int lastSpeed = 0;       // forward speed command just before the line was lost
bool lineSeen = false;   // set by readLine()
int lastSide = 0;        // -1 = line last seen on the LEFT edge, +1 = RIGHT edge, 0 = centred
unsigned long sideTime = 0;
unsigned long edgeTime = 0;
bool lost = false;
unsigned long lostAt = 0;
int searchDir = -1;

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

// Returns -2000 (line under the far-left sensor) .. +2000 (far right) and sets lineSeen.
// When the line is lost it returns the last position it saw.
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
  lineSeen = sum >= lineThreshold;
  if (lineSeen) lastPosition = weighted / sum - 2000;
  return lastPosition;
}

// Remember which side the line went to. At a sharp corner the new leg appears under an OUTER
// sensor just before the line disappears, so an outer sighting wins for 200 ms over an inner
// sensor glimpsing the end of the old leg on the other side.
void rememberSide(int position) {
  unsigned long now = millis();
  if (value[0] > 500 && value[4] < 500) { lastSide = -1; edgeTime = now; sideTime = now; }
  else if (value[4] > 500 && value[0] < 500) { lastSide = 1; edgeTime = now; sideTime = now; }
  else if (now - edgeTime > 200 && position < -1000) { lastSide = -1; sideTime = now; }
  else if (now - edgeTime > 200 && position > 1000) { lastSide = 1; sideTime = now; }
  if (abs(position) < 1000 && now - sideTime > 300) lastSide = 0;   // centred for a while: forget it
}

void pivot(int dir) {  // -1 = turn left on the spot, +1 = turn right
  drive(dir * searchSpeed, -dir * searchSpeed);
}

// Bounded search: turn towards the remembered side, sweep back the other way, return to the
// heading where the line was lost, then stop (it never turns more than about 135 deg from there).
// loop() leaves it as soon as the sensors see the line again.
void searchLine() {
  if (!lost) {
    lost = true;
    lostAt = millis();
    searchDir = lastSide != 0 ? lastSide : (lastPosition > 0 ? 1 : -1);
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
    if (t < gapTime) { drive(minSpeed, minSpeed); return; }
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
  else drive(0, 0);                               // not within reach: stop safely
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
  if (!lineSeen) {
    searchLine();
    return;
  }
  lost = false;
  rememberSide(position);

  // slow down as the line moves towards the edge of the array, so sharp turns stay on the line
  int speed = baseSpeed - (long)(baseSpeed - minSpeed) * abs(position) / 2000;
  if (speed < minSpeed) speed = minSpeed;
  lastSpeed = speed;
  int correction = Kp * position;
  drive(speed + correction, speed - correction);
}
`;

/**
 * LF-02: TT gearmotors under the light 2 mm FR4 line-follower plate (170 × 120 mm), Ø65 mm rubber wheels,
 * 90 mm wheelbase / 154 mm track, sensor bar on the front boom.
 */
const LF02_DT: LineDrivetrain = {
  motorId: "tt-yellow-gear-motor",
  wheelId: "rubber-robot-wheels",
  plateT: 2,
  params: { wheelDiameter_mm: 65, wheelWidth_mm: 26, wheelbase_mm: 90, trackWidth_mm: 120 + 26 + 2 * TYRE_GAP_MM, chassisLength_mm: 170, chassisWidth_mm: 120, groundClearance_mm: 20 },
};
const LF02_X = 107;
const lf02Z = sensorZ(LF02_DT, 10);
export const LF02: ProjectTemplate = {
  metadata: {
    id: "LF-02",
    name: "Advanced Five-Sensor Line Follower",
    version: "2.0.0",
    competition: "line",
    difficulty: "intermediate",
    learningLevel: "Analog sensors, calibration and proportional control",
    description: "Five analog TCRT5000 sensors and a TB6612FNG driver on a 4WD chassis (left motors in parallel on channel A, right motors on channel B). The robot calibrates itself, computes a weighted line position and steers smoothly in proportion to the error.",
    workingPrinciple:
      "During the first 2.4 s the robot sweeps left and right across the line and records each sensor's darkest and brightest reading. Afterwards each reading is scaled to 0–1000 and a weighted average gives the line position (−2000 … +2000). The correction Kp × position is added to the left wheel pair and subtracted from the right pair, and the robot slows down as the line moves towards the edge of the array. The 4WD robot steers like a tank: the tyres scrub sideways in every turn, so it needs a larger correction and more pivot power than a 2WD robot on a caster. It remembers which edge the line was last seen at; if every sensor sees white it searches with a bounded pivot towards that side, then back the other way (never more than about 135°), and stops if the line is not within reach.",
    learningObjectives: ["Calibrate analog sensors", "Compute a weighted average line position", "Tune a proportional controller (Kp)", "Use a MOSFET driver (TB6612FNG) with standby", "Drive a 4WD robot with one driver channel per side"],
    limitations: [
      "Proportional-only control can oscillate at high speed",
      "Must start with the sensor bar over the line so calibration sees black and white",
      "Five sensors span only 56 mm — very sharp turns rely on lost-line recovery",
      "Skid steering scrubs the tyres: turns are slower than on a 2WD robot with a caster",
    ],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "5× TCRT5000 analog (calibrated)",
    drivetrain: "4WD",
  },
  chassis: { componentId: "line-follower-chassis", length_mm: LF02_DT.params.chassisLength_mm, width_mm: LF02_DT.params.chassisWidth_mm, thickness_mm: LF02_DT.plateT, groundClearance_mm: mountingOf(LF02_DT).clearance_mm },
  parts: [
    ...drivetrainParts(LF02_DT),
    // battery on standoffs above the Uno, set back so the centre of mass sits over the middle of the four wheels
    { componentId: "arduino-uno-r3", label: "U1", position: { x: 10, y: 0, z: 8 } },
    { componentId: "tb6612fng", label: "DRV1" },
    { componentId: "18650-li-ion-cell", label: "BAT1", config: { series: 2, capacity: 2500 }, position: { x: -38, y: 0, z: 39.9 } },
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
    ...parallelMotorWiring(["DRV1.AO1", "DRV1.AO2"], ["DRV1.BO1", "DRV1.BO2"]),
    ...[1, 2, 3, 4, 5].flatMap((n): [string, string, "red" | "black" | "green"][] => [
      ["U1.5V", `S${n}.VCC`, "red"], ["U1.GND2", `S${n}.GND`, "black"], [`S${n}.A0`, `U1.A${n - 1}`, "green"],
    ]),
  ],
  pinMap: [
    { pin: "D5 / D6 (PWM)", connectedTo: "DRV1 PWMA / PWMB", purpose: "Left / right motor pair speed (FL + RL on AO1/AO2, FR + RR on BO1/BO2)" },
    { pin: "D7 / D8", connectedTo: "DRV1 AIN1 / AIN2", purpose: "Left motors direction" },
    { pin: "D9 / D10", connectedTo: "DRV1 BIN1 / BIN2", purpose: "Right motors direction" },
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
      { name: "minSpeed / searchSpeed / sweepTime", meaning: "Speed in the sharpest turns; pivot speed and duration (≈135°) of the bounded lost-line search." },
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
// Arduino Nano + TB6612FNG + 4x N20 micro gearmotor (4WD; Hall
// encoders on the two rear motors) + Pololu QTR-8A array on A0-A7.
// 4WD skid steering: left pair on channel A, right pair on channel B.
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
int value[8];        // calibrated 0 (white) .. 1000 (black)

// ---- adjustable parameters ----
float Kp = 0.09;
float Ki = 0.0002;
float Kd = 0.9;
int baseSpeed = 170;
int maxSpeed = 255;
int minSpeed = 60;       // speed in the sharpest turns
long integralLimit = 20000;

// ---- lost-line recovery ----
int searchSpeed = 150;   // pivot while the line is lost (about 180 deg/s on this 4WD robot; all four
                         // tyres scrub, so a pivot needs more power than on a 2WD robot)
int sweepTime = 750;     // ms of pivoting = about 135 deg. The search never turns further than this
                         // either way, so it cannot swing round onto the line behind it and drive back.
int gapTime = 120;       // ms to roll straight on when the line vanishes while centred (gap / line end)

float error = 0;
float prevError = 0;
float integral = 0;
float derivative = 0;
float output = 0;
int lastPosition = 0;
int lastSpeed = 0;       // forward speed command just before the line was lost
bool lineSeen = false;
int leftCmd = 0;
int rightCmd = 0;

int lastSide = 0;        // -1 = line last seen on the LEFT edge, +1 = RIGHT edge, 0 = centred
unsigned long sideTime = 0;
unsigned long edgeTime = 0;
bool lost = false;
unsigned long lostAt = 0;
int searchDir = -1;

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

// -3500 (far left) .. +3500 (far right); sets lineSeen. When the line is lost it returns the
// last position it saw.
int readLine() {
  long weighted = 0;
  long sum = 0;
  for (int i = 0; i < 8; i++) {
    int span = maxV[i] - minV[i];
    if (span < 50) span = 50;
    int v = constrain((long)(analogRead(qtr[i]) - minV[i]) * 1000 / span, 0, 1000);
    if (v < 80) v = 0;                 // ignore noise
    value[i] = v;
    weighted += (long)v * (i * 1000);
    sum += v;
  }
  lineSeen = sum >= 250;
  if (lineSeen) lastPosition = weighted / sum - 3500;
  return lastPosition;
}

// Remember which side the line went to. At a sharp corner the new leg appears under the OUTER
// sensors just before the line disappears, so an outer sighting wins for 200 ms over an inner
// sensor glimpsing the end of the old leg on the other side.
void rememberSide(int position) {
  unsigned long now = millis();
  bool leftEdge = value[0] > 500;     // OUT1, the outermost left sensor
  bool rightEdge = value[7] > 500;    // OUT8, the outermost right sensor
  if (leftEdge && !rightEdge) { lastSide = -1; edgeTime = now; sideTime = now; }
  else if (rightEdge && !leftEdge) { lastSide = 1; edgeTime = now; sideTime = now; }
  else if (now - edgeTime > 200 && position < -1500) { lastSide = -1; sideTime = now; }
  else if (now - edgeTime > 200 && position > 1500) { lastSide = 1; sideTime = now; }
  if (abs(position) < 1500 && now - sideTime > 300) lastSide = 0;   // centred for a while: forget it
}

void pivot(int dir) {  // -1 = turn left on the spot, +1 = turn right
  drive(dir * searchSpeed, -dir * searchSpeed);
}

// Bounded search: turn towards the remembered side, sweep back the other way, return to the
// heading where the line was lost, then stop (it never turns more than about 135 deg from there).
// loop() leaves it as soon as the array sees the line again.
void searchLine() {
  if (!lost) {
    lost = true;
    lostAt = millis();
    searchDir = lastSide != 0 ? lastSide : (lastPosition > 0 ? 1 : -1);
    integral = 0;                      // anti-windup: the old integral means nothing any more
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
    if (t < gapTime) { drive(minSpeed, minSpeed); return; }
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
  else drive(0, 0);                               // not within reach: stop safely
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

void sendTelemetry() {
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
  if (!lineSeen) {
    searchLine();                      // lost: bounded search instead of PID on a made-up error
  } else {
    if (lost) {
      lost = false;
      prevError = position;            // no derivative kick when the line comes back
    }
    rememberSide(position);
    error = position;
    derivative = error - prevError;
    prevError = error;

    // slow down on big errors so the robot can make sharp turns
    int speed = baseSpeed - abs(error) / 30;
    if (speed < minSpeed) speed = minSpeed;
    lastSpeed = speed;

    // integral anti-windup: clamp it, and only let it grow while the motors are not saturated
    output = Kp * error + Ki * integral + Kd * derivative;
    if (abs(speed) + abs(output) < maxSpeed) integral = constrain(integral + error, -integralLimit, integralLimit);
    drive(speed + output, speed - output);
  }
  sendTelemetry();
  delay(2);
}
`;

/**
 * LF-03: four N20 micro gearmotors under the 2 mm FR4 plate (160 × 120 mm), Ø34 × 12 mm silicone wheels,
 * 80 mm wheelbase / 140 mm track. The encoders sit on the rear motors (one per side).
 */
const LF03_DT: LineDrivetrain = {
  motorId: "n20-micro-metal-gear-motor",
  wheelId: "silicone-robot-wheels",
  plateT: 2,
  params: { wheelDiameter_mm: 34, wheelWidth_mm: 12, wheelbase_mm: 80, trackWidth_mm: 120 + 12 + 2 * TYRE_GAP_MM, chassisLength_mm: 160, chassisWidth_mm: 120, groundClearance_mm: 12 },
};
const lf03Z = sensorZ(LF03_DT, 3.2, 3);
export const LF03: ProjectTemplate = {
  metadata: {
    id: "LF-03",
    name: "PID Line Follower",
    version: "2.0.0",
    competition: "line",
    difficulty: "advanced",
    learningLevel: "PID control, 8-sensor arrays, encoders and live tuning",
    description: "A fast competition-style 4WD follower: Pololu QTR-8A array, four N20 gearmotors (two with Hall encoders), a TB6612FNG with one channel per side and full PID control that you can tune while the robot runs.",
    workingPrinciple:
      "Eight calibrated analog sensors give a line position from −3500 to +3500. The PID controller adds a proportional term (how far off the line), an integral term (persistent offset) and a derivative term (how fast the error changes, which damps oscillation). Its output speeds up one wheel pair and slows the other; because the four tyres scrub sideways when a 4WD robot turns, the gains are higher than on a 2WD robot with a caster. The robot also slows down automatically when the error is large so it can take sharp corners. When the array loses the line, PID is paused (no derivative kick, integral reset) and the robot searches with a bounded pivot towards the edge where the line was last seen, never more than about 135°, so it cannot turn round onto the track behind it. Encoders on the two rear motors count wheel pulses for speed telemetry.",
    learningObjectives: ["Implement and tune PID (Kp, Ki, Kd)", "Use an 8-channel analog array", "Count encoder pulses with interrupts", "Tune a robot live over Serial while watching telemetry", "Skid-steer (tank) turning with four driven wheels"],
    limitations: [
      "The Nano has exactly 8 analog inputs — all are used by the array",
      "The integral is clamped, frozen while the motors are saturated and reset when the line is lost; very high Ki still destabilises the robot",
      "Encoders are used for telemetry, not closed-loop speed control; they measure the rear wheels, which slip a little when the robot turns",
      "Skid steering scrubs the tyres: tight turns are slower than on a 2WD robot with a caster",
    ],
    author: "Robotics Club KKH · BEAST FEAST",
    sensorSummary: "QTR-8A 8-channel analog array + 2 Hall encoders",
    drivetrain: "4WD",
  },
  chassis: { componentId: "line-follower-chassis", length_mm: LF03_DT.params.chassisLength_mm, width_mm: LF03_DT.params.chassisWidth_mm, thickness_mm: LF03_DT.plateT, groundClearance_mm: mountingOf(LF03_DT).clearance_mm },
  parts: [
    ...drivetrainParts(LF03_DT),
    { componentId: "arduino-nano", label: "U1" },
    { componentId: "tb6612fng", label: "DRV1" },
    { componentId: "lipo-2s-battery", label: "BAT1", config: { capacity: 450 } },
    { componentId: "toggle-switch", label: "SW1" },
    { componentId: "qtr-8a", label: "QTR1", position: { x: 92, y: 0, z: lf03Z }, yawDeg: 90 },
    { componentId: "hall-effect-encoder", label: "ENC1", attachedTo: "RL Motor" },
    { componentId: "hall-effect-encoder", label: "ENC2", attachedTo: "RR Motor" },
  ],
  wiring: [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VM", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["DRV1.GND", "U1.GND1", "black"],
    ["U1.5V", "DRV1.VCC", "red"], ["U1.5V", "DRV1.STBY", "red"],
    ["U1.D5", "DRV1.PWMA", "yellow"], ["U1.D7", "DRV1.AIN1", "yellow"], ["U1.D8", "DRV1.AIN2", "yellow"],
    ["U1.D6", "DRV1.PWMB", "yellow"], ["U1.D9", "DRV1.BIN1", "yellow"], ["U1.D10", "DRV1.BIN2", "yellow"],
    ...parallelMotorWiring(["DRV1.AO1", "DRV1.AO2"], ["DRV1.BO1", "DRV1.BO2"]),
    ["U1.5V", "QTR1.VCC", "red"], ["U1.GND2", "QTR1.GND", "black"],
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): [string, string, "green"] => [`QTR1.${n}`, `U1.A${n - 1}`, "green"]),
    ["U1.5V", "ENC1.VCC", "red"], ["U1.GND2", "ENC1.GND", "black"], ["ENC1.A", "U1.D2", "blue"], ["ENC1.B", "U1.D11", "blue"],
    ["U1.5V", "ENC2.VCC", "red"], ["U1.GND2", "ENC2.GND", "black"], ["ENC2.A", "U1.D3", "blue"], ["ENC2.B", "U1.D12", "blue"],
  ],
  pinMap: [
    { pin: "A0 … A7", connectedTo: "QTR1 OUT1 … OUT8", purpose: "8 analog reflectance channels, left → right (A6/A7 are analog-only on the Nano — fine for analogRead)" },
    { pin: "D5 / D6 (PWM)", connectedTo: "DRV1 PWMA / PWMB", purpose: "Left / right motor pair speed (FL + RL on AO1/AO2, FR + RR on BO1/BO2)" },
    { pin: "D7 / D8 · D9 / D10", connectedTo: "DRV1 AIN1/AIN2 · BIN1/BIN2", purpose: "Left / right motor pair direction" },
    { pin: "D2 / D3 (interrupts)", connectedTo: "ENC1 A / ENC2 A", purpose: "Encoder pulse counting (rear-left / rear-right motor)" },
    { pin: "D11 / D12", connectedTo: "ENC1 B / ENC2 B", purpose: "Encoder channel B (direction)" },
  ],
  firmware: {
    board: "nano",
    source: LF03_CODE,
    libraries: [],
    adjustable: [
      { name: "Kp / Ki / Kd", meaning: "PID gains. Live: P<value>, I<value>, D<value>." },
      { name: "minSpeed / searchSpeed / sweepTime", meaning: "Speed in the sharpest turns; pivot speed and duration (≈135°) of the bounded lost-line search." },
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
