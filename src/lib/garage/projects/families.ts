/**
 * Spec-driven template families. Every variant is ONE TemplateSpec; templateFromSpec turns it into parts,
 * wiring, pin map and generated firmware (see ../spec.ts). The hand-tuned LF / RR / RW robots stay as the
 * "reference robots".
 */
import { TYRE_GAP_MM, type Drivetrain4WDParams } from "@/lib/robot/drivetrain4wd";
import { LIPO_3S_2100_ID } from "@/lib/catalogue/platform";
import { type SpecController, type SpecDriver, type TemplateSpec, templateFromSpec } from "../spec";
import type { ProjectTemplate } from "../types";

const AUTHOR = "Robotics Club KKH · BEAST FEAST";
const CTRL_NAME: Record<SpecController, string> = { uno: "Arduino Uno R3", esp32: "ESP32 DevKit V1" };
const ctrlKey = (c: SpecController) => (c === "uno" ? "UNO" : "ESP32");

const ESP32_NOTES = [
  "ESP32: 3.3 V logic — its pins are NOT 5 V tolerant, so sensors run from the 3V3 pin (a US-100 replaces the 5 V-only HC-SR04)",
  "ESP32: the 3S pack (12.6 V full) is above the DevKit's 12 V VIN limit, so an LM2596 buck converter set to 5.0 V feeds VIN and the 5 V modules",
];

// ───────────────────────────── A. Robo Race Car ─────────────────────────────

const RACE_PARAMS: Drivetrain4WDParams = { wheelDiameter_mm: 65, wheelWidth_mm: 26, wheelbase_mm: 150, trackWidth_mm: 150 + 26 + 2 * TYRE_GAP_MM, chassisLength_mm: 220, chassisWidth_mm: 150, groundClearance_mm: 20 };

function raceSpec(controller: SpecController, driver: Extract<SpecDriver, "l298n" | "bts7960">, wifi = false): TemplateSpec {
  const bts = driver === "bts7960";
  const id = `T-RACE-${ctrlKey(controller)}-${bts ? "BTS" : "L298N"}${wifi ? "-WIFI" : ""}`;
  const limitations = [
    "Skid steering scrubs the tyres: pivot turns need much more torque than driving straight",
    "The battery's discharge (C) rating was not supplied — four Johnson motors can draw up to 20 A at stall together",
  ];
  if (!bts)
    limitations.unshift(
      "CURRENT WARNING: two Johnson motors share each L298N channel — 2 × 5 A = 10 A stall current against the L298N's 2 A continuous / 3 A peak per channel. The L298N will overheat or shut down when the car starts hard, pushes or stalls; it also wastes ≈2 V. Use the BTS7960 variant (recommended).",
    );
  if (controller === "esp32") limitations.push(...ESP32_NOTES.slice(1));
  if (wifi) limitations.push("Wi-Fi control is not simulated: in the arena this robot is driven in Manual mode; the generated sketch is statically checked");
  return {
    id,
    family: "Robo Race Car",
    variantLabel: `${CTRL_NAME[controller]} · ${bts ? "2 × BTS7960 (recommended)" : "L298N (basic)"} · ${wifi ? "Wi-Fi" : "HC-05"}`,
    name: `4WD Robo Race Car — ${controller === "uno" ? "Uno" : "ESP32"}, ${bts ? "BTS7960" : "L298N"}${wifi ? ", Wi-Fi" : ""}`,
    version: "1.0.0",
    competition: "race",
    difficulty: bts ? "intermediate" : "beginner",
    controller,
    driver,
    motorId: "johnson-dc-gear-motor",
    wheelId: "rubber-robot-wheels",
    chassis: { componentId: "4wd-robot-chassis", plateT: 3 },
    params: RACE_PARAMS,
    battery: { id: LIPO_3S_2100_ID },
    sensors: {},
    control: wifi ? "wifi" : "hc05",
    behaviour: "manual",
    tunables: { cruiseSpeed: 200, turnSpeed: 190 },
    text: {
      learningLevel: "4WD skid steering with high-current 12 V motors; choosing a driver for the stall current",
      description: `A 4WD race car with four 12 V Johnson gearmotors (300 rpm, 5 A stall) on the 11.1 V 3S LiPo, a power switch and ${wifi ? "Wi-Fi control from a phone browser" : "HC-05 Bluetooth control"}. ${bts ? "Each side has its own BTS7960 43 A H-bridge: the left pair is wired in parallel to one, the right pair to the other." : "Both pairs share one L298N (left pair on OUT1/OUT2, right pair on OUT3/OUT4) — the cheap, basic build, with a documented current problem."}`,
      workingPrinciple: `The left wheels and the right wheels are driven as two pairs; a speed difference turns the car, opposite directions spin it on the spot. ${bts ? "A BTS7960 is driven by two PWM signals: PWM on RPWM turns the motors forward, PWM on LPWM backwards; both low brakes." : "An L298N channel is set by IN1/IN2 (direction) and ENA (PWM speed)."} The firmware ramps the speed up gently and down hard, and stops the car if no command arrives for 1 s while moving (connection loss).`,
      learningObjectives: ["Compare motor stall current with a driver's rating", "Drive two motors in parallel per side", "Power a controller from a 3S pack safely", "Bluetooth / Wi-Fi command protocols with a fail-safe timeout"],
      limitations,
      sensorSummary: "None (driver-controlled)",
    },
    simulation: { defaultTrackId: "example-race-beginner-oval", alternativeTrackIds: ["example-race-intermediate-scurves", "example-race-advanced-circuit"], difficulty: "beginner" },
    author: AUTHOR,
  };
}

// ───────────────────────────── B. Line Following Robot ─────────────────────────────

/** 25GA370 12 V gearmotors (rated for 3S) under a 200 × 140 mm plate; short wheelbase for easy skid turning. */
const LINE_PARAMS: Drivetrain4WDParams = { wheelDiameter_mm: 65, wheelWidth_mm: 26, wheelbase_mm: 100, trackWidth_mm: 140 + 26 + 2 * TYRE_GAP_MM, chassisLength_mm: 200, chassisWidth_mm: 140, groundClearance_mm: 20 };
const LINE_SENSOR: Record<3 | 5 | 8, string> = { 3: "3-channel-ir-sensor-array", 5: "5-channel-ir-sensor-array", 8: "qtr-8a" };
/** Generated-default tuning per sensor count (validated on the Beginner Oval and Sharp Corners tracks). */
const LINE_TUNING: Record<3 | 5 | 8, Record<string, number>> = {
  3: { baseSpeed: 110, minSpeed: 55, Kp: 0.14, Kd: 0.6, searchSpeed: 140, sweepTime: 750 },
  5: { baseSpeed: 120, minSpeed: 60, Kp: 0.13, Kd: 0.8, searchSpeed: 140, sweepTime: 750 },
  8: { baseSpeed: 130, minSpeed: 60, Kp: 0.12, Kd: 1.0, searchSpeed: 140, sweepTime: 750 },
};

function lineSpec(controller: SpecController, n: 3 | 5 | 8): TemplateSpec {
  const analog = n === 8;
  const limitations = [
    analog ? "Must start with the sensor bar over the line: it calibrates by sweeping across it" : "Digital sensors only say black / white: set each sensor's trimmer so it switches at the line edge",
    "Skid steering scrubs the tyres: tight turns are slower than on a 2WD robot with a caster",
    "No N20 or TT motor in the catalogue is rated 12 V, so the 12 V 25GA370 gearmotor is used on the 3S pack (heavier, but not over-volted)",
    "The bounded lost-line search stops the robot if the line is not found within ≈135° either way",
  ];
  if (controller === "esp32") limitations.push(...ESP32_NOTES);
  return {
    id: `T-LINE-${ctrlKey(controller)}-${n}`,
    family: "Line Following Robot",
    variantLabel: `${CTRL_NAME[controller]} · ${n}-sensor ${analog ? "analog" : "digital"} array`,
    name: `4WD Line Follower — ${controller === "uno" ? "Uno" : "ESP32"}, ${n} sensors`,
    version: "1.0.0",
    competition: "line",
    difficulty: n === 3 ? "beginner" : n === 5 ? "intermediate" : "advanced",
    controller,
    driver: "tb6612",
    motorId: "25ga370-gear-motor",
    wheelId: "rubber-robot-wheels",
    chassis: { componentId: "4wd-robot-chassis", plateT: 3 },
    params: LINE_PARAMS,
    battery: { id: LIPO_3S_2100_ID },
    sensors: { line: LINE_SENSOR[n] },
    control: "none",
    behaviour: "line",
    tunables: LINE_TUNING[n],
    text: {
      learningLevel: `PID line following with ${n} sensors`,
      description: `A 4WD line follower with four 12 V 25GA370 gearmotors on the 3S LiPo, two TB6612FNG drivers (one channel per motor) and a ${n}-sensor ${analog ? "analog QTR-8A" : "digital IR"} array on a boom in front of the wheels.`,
      workingPrinciple: `Every ${analog ? "calibrated analog" : "digital"} sensor gives 0 (white) … 1000 (black). The weighted average of all ${n} readings is the line position, scaled to −1000 (far left) … +1000 (far right) whatever the number of sensors. A PID controller turns it into a speed difference between the left and right wheel pairs, and the robot slows down as the line moves to the edge of the array so it can make sharp corners. When the line is lost it searches towards the side where it was last seen — never more than ≈135°, so it cannot turn round onto the track behind it — and stops if the line is not within reach.`,
      learningObjectives: ["Weighted line position from N sensors", "Tune a PID controller (Kp, Kd)", "Slow down for sharp turns", "Recover a lost line safely"],
      limitations,
      sensorSummary: `${n}-channel ${analog ? "analog (QTR-8A)" : "digital IR"} reflectance array`,
    },
    simulation: { defaultTrackId: "example-line-beginner-oval", alternativeTrackIds: ["example-line-intermediate-sharp", "example-line-advanced-figure8"], difficulty: n === 3 ? "beginner" : "intermediate" },
    author: AUTHOR,
  };
}

// ───────────────────────────── C. Sumo Robot ─────────────────────────────

/** Same 10 × 10 cm mini-sumo geometry as RW-04: low plate with the N20 motors on top. */
const SUMO_PARAMS: Drivetrain4WDParams = { wheelDiameter_mm: 40, wheelWidth_mm: 20, wheelbase_mm: 60, trackWidth_mm: 100 + 20 + 2 * TYRE_GAP_MM, chassisLength_mm: 100, chassisWidth_mm: 100, groundClearance_mm: 8 };

function sumoSpec(controller: SpecController): TemplateSpec {
  const limitations = [
    "Mini-sumo limits (10 × 10 cm, 500 g) keep the 2S 7.4 V LiPo and the small N20 gearmotors — a 3S pack and 12 V motors do not fit the mass and size limit",
    "One forward opponent sensor: it cannot tell if the opponent is to the side",
    "No rear edge sensors — reversing blindly can leave the ring",
  ];
  if (controller === "esp32") limitations.push("ESP32: 3.3 V logic — the US-100 ultrasonic sensor (3.3 V capable) replaces the 5 V-only HC-SR04; the 2S pack (8.4 V full) feeds VIN directly");
  return {
    id: `T-SUMO-${ctrlKey(controller)}`,
    family: "Sumo Robot",
    variantLabel: `${CTRL_NAME[controller]} · 2 × TB6612FNG · ${controller === "uno" ? "HC-SR04" : "US-100"}`,
    name: `4WD Mini-Sumo — ${controller === "uno" ? "Uno" : "ESP32"}`,
    version: "1.0.0",
    competition: "sumo",
    difficulty: "intermediate",
    controller,
    driver: "tb6612",
    motorId: "n20-micro-metal-gear-motor",
    wheelId: "sumo-robot-wheels",
    chassis: { componentId: "mini-sumo-robot-chassis", plateT: 3 },
    params: SUMO_PARAMS,
    battery: { id: "lipo-2s-battery", config: { capacity: 450 } },
    sensors: { distance: controller === "uno" ? "hc-sr04" : "us-100", edges: "tcrt5000-edge-detection-sensor" },
    wedge: true,
    control: "none",
    behaviour: "sumo",
    text: {
      learningLevel: "Search / attack / edge-escape logic with a start delay",
      description: `A 10 × 10 cm 4WD mini-sumo: four N20 gearmotors on two TB6612FNG drivers, a front wedge, a forward ${controller === "uno" ? "HC-SR04" : "US-100"} ultrasonic opponent sensor and two TCRT5000 edge sensors, on the 2S 7.4 V LiPo.`,
      workingPrinciple: "After the 5 s start delay (both drivers held in standby) the robot spins to search. When the ultrasonic echo comes back from closer than the attack range it charges with all four wheels. An edge sensor seeing the white border always wins: back off, then turn away.",
      learningObjectives: ["State logic: search → attack, with edge safety first", "Start delay with the drivers in standby", "Four-wheel traction for pushing"],
      limitations,
      sensorSummary: `${controller === "uno" ? "HC-SR04" : "US-100"} ultrasonic + 2 front edge sensors`,
    },
    simulation: { defaultTrackId: "example-sumo-standard-dohyo", alternativeTrackIds: ["example-sumo-rect-arena"], opponent: "beginner", difficulty: "intermediate" },
    author: AUTHOR,
  };
}

// ───────────────────────────── D. Off-Road Rover ─────────────────────────────

const ROVER_PARAMS: Drivetrain4WDParams = { wheelDiameter_mm: 85, wheelWidth_mm: 30, wheelbase_mm: 170, trackWidth_mm: 160 + 30 + 2 * TYRE_GAP_MM, chassisLength_mm: 240, chassisWidth_mm: 160, groundClearance_mm: 30 };

function roverSpec(controller: SpecController): TemplateSpec {
  const limitations = ["One forward-facing sensor: obstacles to the side are not seen", "Obstacle assist only blocks driving forward — reversing and turning are always allowed", "Larger wheels trade acceleration for top speed and clearance"];
  if (controller === "esp32") limitations.push(...ESP32_NOTES);
  return {
    id: `T-ROVER-${ctrlKey(controller)}`,
    family: "Off-Road Rover",
    variantLabel: `${CTRL_NAME[controller]} · 2 × TB6612FNG · HC-05 + obstacle assist`,
    name: `4WD Off-Road Rover — ${controller === "uno" ? "Uno" : "ESP32"}`,
    version: "1.0.0",
    competition: "race",
    difficulty: "intermediate",
    controller,
    driver: "tb6612",
    motorId: "25ga370-gear-motor",
    wheelId: "knobby-tyres",
    chassis: { componentId: "aluminium-robot-chassis", material: "Aluminium", plateT: 3 },
    params: ROVER_PARAMS,
    battery: { id: LIPO_3S_2100_ID },
    sensors: { distance: controller === "uno" ? "hc-sr04" : "us-100" },
    control: "hc05",
    behaviour: "manual",
    tunables: { cruiseSpeed: 190, turnSpeed: 200, safeCm: 25 },
    text: {
      learningLevel: "Ground clearance, large wheels and driver assistance",
      description: `A 4WD rover with Ø85 mm knobby tyres and 30 mm ground clearance on an aluminium chassis: four 12 V 25GA370 gearmotors on two TB6612FNG drivers, the 3S LiPo, HC-05 Bluetooth driving and a forward ${controller === "uno" ? "HC-SR04" : "US-100"} for obstacle assist.`,
      workingPrinciple: "Bigger wheels lift the axles, so the motor housings — the lowest point — clear rocks and bumps. You drive it over Bluetooth; every 60 ms the ultrasonic sensor measures the distance ahead and the firmware refuses to drive forward into anything closer than the safe distance (turning and reversing still work). No command for 1 s while moving = stop.",
      learningObjectives: ["Wheel size, ground clearance and motor housings", "Driver assistance from a distance sensor", "Fail-safe remote control"],
      limitations,
      sensorSummary: `${controller === "uno" ? "HC-SR04" : "US-100"} ultrasonic (obstacle assist)`,
    },
    simulation: { defaultTrackId: "example-offroad-beginner", alternativeTrackIds: ["example-offroad-intermediate", "example-race-beginner-oval"], difficulty: "intermediate" },
    author: AUTHOR,
  };
}

// ───────────────────────────── E. Obstacle Avoidance Robot ─────────────────────────────

const OBST_PARAMS: Drivetrain4WDParams = { ...RACE_PARAMS };

function obstacleSpec(controller: SpecController): TemplateSpec {
  const limitations = ["One forward-facing sensor with a ≈15° beam: thin or low obstacles and things to the side can be missed", "It turns right by default and only tries left when it is stuck"];
  if (controller === "esp32") limitations.push(...ESP32_NOTES);
  return {
    id: `T-OBST-${ctrlKey(controller)}`,
    family: "Obstacle Avoidance Robot",
    variantLabel: `${CTRL_NAME[controller]} · 2 × TB6612FNG · ${controller === "uno" ? "HC-SR04" : "US-100"}`,
    name: `4WD Obstacle Avoider — ${controller === "uno" ? "Uno" : "ESP32"}`,
    version: "1.0.0",
    competition: "race",
    difficulty: "beginner",
    controller,
    driver: "tb6612",
    motorId: "25ga370-gear-motor",
    wheelId: "rubber-robot-wheels",
    chassis: { componentId: "4wd-robot-chassis", plateT: 3 },
    params: OBST_PARAMS,
    battery: { id: LIPO_3S_2100_ID },
    sensors: { distance: controller === "uno" ? "hc-sr04" : "us-100" },
    control: "none",
    behaviour: "obstacle",
    tunables: { safeCm: 45, stopCm: 22 },
    text: {
      learningLevel: "Autonomous obstacle avoidance with a state machine",
      description: `An autonomous 4WD robot: four 12 V 25GA370 gearmotors on two TB6612FNG drivers, the 3S LiPo and a forward ${controller === "uno" ? "HC-SR04" : "US-100"} ultrasonic sensor with a configurable safe distance.`,
      workingPrinciple: "A small state machine: FORWARD at cruising speed while the way is clear; closer than safeCm → stop and TURN on the spot until the way has been clear for clearMs; closer than stopCm → BACK UP first. Turning for too long means it is stuck: it backs up and tries the other direction (recover).",
      learningObjectives: ["Ultrasonic distance with a timeout", "A state machine: forward / stop / turn / recover", "Choose a safe distance for the robot's speed and braking"],
      limitations,
      sensorSummary: `${controller === "uno" ? "HC-SR04" : "US-100"} ultrasonic`,
    },
    simulation: { defaultTrackId: "example-race-intermediate-scurves", alternativeTrackIds: ["example-race-beginner-oval"], difficulty: "beginner" },
    author: AUTHOR,
  };
}

// ───────────────────────────── F. Bluetooth-Controlled 4WD Robot ─────────────────────────────

function btSpec(controller: SpecController, wifi = false): TemplateSpec {
  const limitations = ["Your phone app must repeat the held command (at least every 0.5 s): the robot stops 1 s after the last command while moving", "No sensors: the driver is responsible for avoiding obstacles"];
  if (controller === "esp32") limitations.push(...ESP32_NOTES.slice(1));
  if (wifi) limitations.push("Wi-Fi control is not simulated: in the arena this robot is driven in Manual mode; the generated sketch is statically checked");
  return {
    id: `T-BT-${ctrlKey(controller)}${wifi ? "-WIFI" : ""}`,
    family: "Bluetooth-Controlled 4WD Robot",
    variantLabel: `${CTRL_NAME[controller]} · ${wifi ? "Wi-Fi (web page)" : `HC-05 on ${controller === "uno" ? "Serial (D0)" : "Serial2 (GPIO16)"}`}`,
    name: `Bluetooth 4WD Robot — ${controller === "uno" ? "Uno" : "ESP32"}${wifi ? ", Wi-Fi" : ""}`,
    version: "1.0.0",
    competition: "race",
    difficulty: "beginner",
    controller,
    driver: "tb6612",
    motorId: "25ga370-gear-motor",
    wheelId: "rubber-robot-wheels",
    chassis: { componentId: "4wd-robot-chassis", plateT: 3 },
    params: RACE_PARAMS,
    battery: { id: LIPO_3S_2100_ID },
    sensors: {},
    control: wifi ? "wifi" : "hc05",
    behaviour: "manual",
    text: {
      learningLevel: "Remote control protocol, speed command and single-motor tests",
      description: `A 4WD robot driven from a phone: four 12 V 25GA370 gearmotors, each on its own TB6612FNG channel, the 3S LiPo and ${wifi ? "the ESP32's own Wi-Fi network with a control web page" : `an HC-05 Bluetooth module on the ${controller === "uno" ? "Uno's hardware serial (D0)" : "ESP32's second UART (Serial2, GPIO16)"}`}.`,
      workingPrinciple: "Single-character commands: F/B/L/R/S drive, V<0-255> sets the cruise speed, 1–4 run one motor (FL/FR/RL/RR) so each corner can be checked, 0 ends the test. Every command refreshes a 1 s timer; if it runs out while the robot moves, the motors stop (connection lost).",
      learningObjectives: ["Serial command protocols", "Fail-safe: stop when the link is lost", "Test every motor's wiring and direction on its own"],
      limitations,
      sensorSummary: "None (driver-controlled)",
    },
    simulation: { defaultTrackId: "example-race-beginner-oval", alternativeTrackIds: ["example-race-intermediate-scurves"], difficulty: "beginner" },
    author: AUTHOR,
  };
}

// ───────────────────────────── the families ─────────────────────────────

export const FAMILY_SPECS: TemplateSpec[] = [
  raceSpec("uno", "l298n"),
  raceSpec("uno", "bts7960"),
  raceSpec("esp32", "l298n"),
  raceSpec("esp32", "bts7960"),
  raceSpec("esp32", "bts7960", true),
  lineSpec("uno", 3),
  lineSpec("uno", 5),
  lineSpec("esp32", 3),
  lineSpec("esp32", 5),
  lineSpec("esp32", 8),
  sumoSpec("uno"),
  sumoSpec("esp32"),
  roverSpec("uno"),
  roverSpec("esp32"),
  obstacleSpec("uno"),
  obstacleSpec("esp32"),
  btSpec("uno"),
  btSpec("esp32"),
  btSpec("esp32", true),
];

let cache: ProjectTemplate[] | null = null;
/** All family templates (built once, on first use). */
export function familyTemplates(): ProjectTemplate[] {
  if (!cache) cache = FAMILY_SPECS.map(templateFromSpec);
  return cache;
}

/** Variants that were considered and are NOT offered, with the reason. */
export const UNSUPPORTED_VARIANTS = [
  { id: "T-LINE-UNO-8", reason: "The Arduino Uno has only 6 analog inputs (A0–A5) and its 12 remaining digital pins are all used by the two TB6612FNG drivers, so an 8-channel analog array cannot be wired. Use the ESP32 8-sensor variant." },
];
