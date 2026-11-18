/**
 * Skill categories for performance analysis. Every Beast Topic belongs to exactly one category
 * (checked by tests/learning/performance.test.ts).
 */
export const CATEGORIES = [
  { id: "robotics", name: "Robotics Fundamentals" },
  { id: "electronics", name: "Electronics Fundamentals" },
  { id: "circuit", name: "Circuit Design" },
  { id: "mcu", name: "Microcontrollers" },
  { id: "arduino", name: "Arduino Programming" },
  { id: "embedded", name: "Embedded Systems" },
  { id: "sensors", name: "Sensors" },
  { id: "drivers", name: "Motor Drivers" },
  { id: "mechanical", name: "Mechanical Design" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

const MAP: Record<CategoryId, string[]> = {
  robotics: ["line-1-intro-robotics", "line-2-line-following-principle", "race-1-intro-robot-racing", "race-2-competition-rules", "race-23-track-navigation", "sumo-1-intro-sumo-robotics", "sumo-2-sumo-competition-rules", "sumo-21-arena-navigation"],
  electronics: ["line-3-electronics-fundamentals", "line-4-voltage-current-resistance", "line-5-ohms-law", "line-6-resistors", "line-7-capacitors", "line-8-diodes", "line-9-transistors", "line-15-digital-analog-signals"],
  circuit: ["line-21-h-bridge", "line-24-power-systems", "race-12-battery-selection", "race-13-power-management", "sumo-12-sumo-power-systems"],
  mcu: ["line-10-microcontrollers", "line-11-arduino-uno", "line-12-gpio", "line-13-adc"],
  arduino: ["line-14-pwm", "race-14-pwm", "line-26-line-detection-algorithms", "line-29-debugging", "race-25-racing-algorithms", "race-28-debugging", "sumo-18-search-algorithms", "sumo-19-attack-strategies", "sumo-20-defence-strategies", "sumo-24-advanced-control-logic"],
  embedded: ["line-25-sensor-calibration", "line-27-pid-control", "line-28-advanced-line-following", "line-30-performance-optimisation", "race-15-motor-direction", "race-17-encoders", "race-18-speed-measurement", "race-26-testing", "race-27-optimisation", "sumo-25-testing", "sumo-26-optimisation"],
  sensors: ["line-16-ir-sensors", "line-17-tcrt5000", "line-18-qtr-sensor-arrays", "sumo-13-sumo-ultrasonic-sensors", "sumo-14-sharp-ir-sensors", "sumo-15-edge-detection", "sumo-16-bumper-switches", "sumo-17-opponent-detection"],
  drivers: ["line-19-motor-fundamentals", "line-20-dc-geared-motors", "line-22-l298n", "line-23-other-motor-drivers", "race-5-dc-motors", "race-6-motor-rpm", "race-7-torque", "race-8-gear-ratios", "race-11-motor-drivers", "sumo-7-sumo-motor-torque", "sumo-11-sumo-motor-drivers"],
  mechanical: [
    "race-3-chassis-design", "race-4-2wd-vs-4wd", "race-9-wheel-selection", "race-10-tyre-materials", "race-16-differential-steering", "race-19-acceleration", "race-20-braking", "race-21-turning-mechanics",
    "race-22-centre-of-gravity", "race-24-robot-stability", "sumo-3-sumo-robot-design", "sumo-4-sumo-chassis-construction", "sumo-5-sumo-centre-of-gravity", "sumo-6-sumo-weight-distribution", "sumo-8-sumo-wheel-grip",
    "sumo-9-sumo-traction", "sumo-10-sumo-front-wedge-design", "sumo-22-collision-mechanics", "sumo-23-robot-stability",
  ],
};

const BY_TOPIC = new Map<string, CategoryId>();
for (const [cat, ids] of Object.entries(MAP) as [CategoryId, string[]][]) for (const id of ids) BY_TOPIC.set(id, cat);

export const categoryOfTopic = (topicId: string | null | undefined): CategoryId | null => (topicId ? BY_TOPIC.get(topicId) ?? null : null);
export const categoryName = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!.name;
export const topicsInCategory = (id: CategoryId) => MAP[id];
export const ALL_MAPPED_TOPIC_IDS = [...BY_TOPIC.keys()];
