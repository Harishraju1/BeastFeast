import { describe, expect, it } from "vitest";
import {
  ALL_QUESTIONS,
  LEARNING_PATHS,
  QUIZZES,
  TOPICS,
  WEEKLY_MISSIONS_DEFAULT,
  getQuestion,
  getTopic,
  type PathId,
  type QuestionType,
} from "@/lib/learning";
import catalogue from "@/data/catalogue.generated.json";

const EXPECTED_TITLES: Record<PathId, string[]> = {
  line: [
    "Introduction to Robotics",
    "Working Principle of Line Following",
    "Electronics Fundamentals",
    "Voltage, Current and Resistance",
    "Ohm's Law",
    "Resistors",
    "Capacitors",
    "Diodes",
    "Transistors",
    "Microcontrollers",
    "Arduino Uno",
    "GPIO",
    "ADC",
    "PWM",
    "Digital and Analog Signals",
    "IR Sensors",
    "TCRT5000",
    "QTR Sensor Arrays",
    "Motor Fundamentals",
    "DC Geared Motors",
    "H-Bridge",
    "L298N",
    "Other Motor Drivers",
    "Power Systems",
    "Sensor Calibration",
    "Line Detection Algorithms",
    "PID Control",
    "Advanced Line Following",
    "Debugging",
    "Performance Optimisation",
  ],
  race: [
    "Introduction to Robot Racing",
    "Competition Rules",
    "Chassis Design",
    "2WD vs 4WD",
    "DC Motors",
    "Motor RPM",
    "Torque",
    "Gear Ratios",
    "Wheel Selection",
    "Tyre Materials",
    "Motor Drivers",
    "Battery Selection",
    "Power Management",
    "PWM",
    "Motor Direction",
    "Differential Steering",
    "Encoders",
    "Speed Measurement",
    "Acceleration",
    "Braking",
    "Turning Mechanics",
    "Centre of Gravity",
    "Track Navigation",
    "Robot Stability",
    "Racing Algorithms",
    "Testing",
    "Optimisation",
    "Debugging",
  ],
  sumo: [
    "Introduction to Sumo Robotics",
    "Competition Rules",
    "Sumo Robot Design",
    "Chassis Construction",
    "Centre of Gravity",
    "Weight Distribution",
    "Motor Torque",
    "Wheel Grip",
    "Traction",
    "Front Wedge Design",
    "Motor Drivers",
    "Power Systems",
    "Ultrasonic Sensors",
    "Sharp IR Sensors",
    "Edge Detection",
    "Bumper Switches",
    "Opponent Detection",
    "Search Algorithms",
    "Attack Strategies",
    "Defence Strategies",
    "Arena Navigation",
    "Collision Mechanics",
    "Robot Stability",
    "Advanced Control Logic",
    "Testing",
    "Optimisation",
  ],
};

const ALL_TYPES: QuestionType[] = [
  "mcq",
  "identify-component",
  "identify-pin",
  "predict-circuit",
  "find-wrong-connection",
  "identify-driver",
  "code-output",
  "debug-code",
  "calculate",
  "predict-movement",
];

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

describe("learning paths and topics", () => {
  it("has 30 / 28 / 26 topics with the right titles in order", () => {
    for (const pathId of ["line", "race", "sumo"] as PathId[]) {
      const topics = TOPICS.filter((t) => t.pathId === pathId);
      expect(topics.map((t) => t.title)).toEqual(EXPECTED_TITLES[pathId]);
      expect(topics.map((t) => t.order)).toEqual(EXPECTED_TITLES[pathId].map((_, i) => i + 1));
    }
    expect(TOPICS).toHaveLength(84);
  });

  it("learning paths list their topic ids in order", () => {
    expect(LEARNING_PATHS.map((p) => p.id)).toEqual(["line", "race", "sumo"]);
    for (const path of LEARNING_PATHS) {
      expect(path.topicIds).toEqual(TOPICS.filter((t) => t.pathId === path.id).map((t) => t.id));
      expect(path.title && path.tagline && path.description).toBeTruthy();
    }
  });

  it("topic ids are unique and resolvable", () => {
    const ids = TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TOPICS) {
      expect(getTopic(t.id)).toBe(t);
      expect(t.id.startsWith(`${t.pathId}-${t.order}-`)).toBe(true);
    }
  });

  it.each(TOPICS.map((t) => [t.id, t] as const))("%s has all required content", (_id, t) => {
    expect(t.title.trim()).not.toBe("");
    expect(t.minutes).toBeGreaterThan(0);
    for (const field of [t.summary, t.introduction, t.beginner, t.workingPrinciple, t.youtubeSearch]) {
      expect(field.trim().length).toBeGreaterThan(0);
    }
    const bw = wordCount(t.beginner);
    expect(bw).toBeGreaterThanOrEqual(120);
    expect(bw).toBeLessThanOrEqual(250);

    expect(t.technical.length).toBeGreaterThanOrEqual(2);
    expect(t.technical.length).toBeLessThanOrEqual(5);
    for (const s of t.technical) {
      expect(s.heading.trim()).not.toBe("");
      expect(s.body.trim()).not.toBe("");
    }
    expect(t.diagrams.length).toBeGreaterThanOrEqual(1);
    expect(t.examples.length).toBeGreaterThanOrEqual(2);
    for (const e of t.examples) {
      expect(e.title.trim()).not.toBe("");
      expect(e.body.trim()).not.toBe("");
    }
    expect(t.commonMistakes.length).toBeGreaterThanOrEqual(3);
    for (const m of t.commonMistakes) {
      expect(m.mistake.trim() && m.why.trim() && m.fix.trim()).toBeTruthy();
    }
    expect(t.keyTakeaways.length).toBeGreaterThanOrEqual(4);
    expect(t.keyTakeaways.length).toBeLessThanOrEqual(6);
    expect(t.relatedComponents.length).toBeGreaterThan(0);
    expect(t.quiz.length).toBeGreaterThanOrEqual(3);
    expect(t.quiz.length).toBeLessThanOrEqual(5);
  });
});

describe("quiz questions", () => {
  it("question ids are globally unique and resolvable", () => {
    const ids = ALL_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of ALL_QUESTIONS) expect(getQuestion(q.id)).toBe(q);
  });

  it.each(ALL_QUESTIONS.map((q) => [q.id, q] as const))("%s is well formed", (_id, q) => {
    expect(ALL_TYPES).toContain(q.type);
    expect(q.prompt.trim()).not.toBe("");
    expect(q.explanation.trim()).not.toBe("");
    expect(q.options.length).toBeGreaterThanOrEqual(2);
    expect(q.options.length).toBeLessThanOrEqual(5);
    expect(new Set(q.options.map((o) => o.trim())).size).toBe(q.options.length);
    for (const o of q.options) expect(o.trim()).not.toBe("");
    expect(Number.isInteger(q.answerIndex)).toBe(true);
    expect(q.answerIndex).toBeGreaterThanOrEqual(0);
    expect(q.answerIndex).toBeLessThan(q.options.length);
    expect([1, 2, 3]).toContain(q.difficulty);
    expect(q.xp).toBe({ 1: 5, 2: 10, 3: 15 }[q.difficulty]);
  });

  it("uses every question type at least 8 times", () => {
    const counts = new Map<QuestionType, number>();
    for (const q of ALL_QUESTIONS) counts.set(q.type, (counts.get(q.type) ?? 0) + 1);
    for (const type of ALL_TYPES) expect(counts.get(type) ?? 0, type).toBeGreaterThanOrEqual(8);
  });

  it("spreads correct answers across positions", () => {
    const first = ALL_QUESTIONS.filter((q) => q.answerIndex === 0).length;
    expect(first / ALL_QUESTIONS.length).toBeLessThan(0.4);
  });

  it("code questions include code", () => {
    for (const q of ALL_QUESTIONS.filter((x) => x.type === "code-output" || x.type === "debug-code")) {
      expect(q.code?.trim(), q.id).toBeTruthy();
    }
  });
});

describe("quizzes and missions", () => {
  it("quiz ids are unique and reference existing questions", () => {
    expect(new Set(QUIZZES.map((q) => q.id)).size).toBe(QUIZZES.length);
    for (const quiz of QUIZZES) {
      expect(quiz.questionIds.length, quiz.id).toBeGreaterThan(0);
      expect(new Set(quiz.questionIds).size, quiz.id).toBe(quiz.questionIds.length);
      for (const id of quiz.questionIds) expect(getQuestion(id), `${quiz.id} -> ${id}`).toBeDefined();
      expect(quiz.passPercent).toBeGreaterThan(0);
      expect(quiz.passPercent).toBeLessThanOrEqual(100);
    }
  });

  it("has the required quiz set", () => {
    for (const pathId of ["line", "race", "sumo"] as PathId[]) {
      const comp = QUIZZES.filter((q) => q.kind === "competition" && q.pathId === pathId);
      expect(comp).toHaveLength(1);
      expect(comp[0].questionIds.length).toBeGreaterThanOrEqual(10);
      expect(comp[0].questionIds.length).toBeLessThanOrEqual(15);
      for (const id of comp[0].questionIds) expect(getQuestion(id)!.id.startsWith(`${pathId}-`)).toBe(true);
    }
    expect(QUIZZES.filter((q) => q.kind === "weekly")).toHaveLength(2);
    expect(QUIZZES.filter((q) => q.kind === "challenge")).toHaveLength(3);
    const finals = QUIZZES.filter((q) => q.kind === "final");
    expect(finals).toHaveLength(1);
    expect(finals[0].questionIds.length).toBeGreaterThanOrEqual(25);
    expect(finals[0].passPercent).toBe(70);
    const finalPaths = new Set(finals[0].questionIds.map((id) => id.split("-")[0]));
    expect([...finalPaths].sort()).toEqual(["line", "race", "sumo"]);
  });

  it("weekly missions cover Monday to Sunday and reference real topics", () => {
    expect(WEEKLY_MISSIONS_DEFAULT.map((m) => m.day)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(WEEKLY_MISSIONS_DEFAULT.map((m) => m.title)).toEqual([
      "Electronics Fundamentals",
      "Motor Drivers",
      "Sensors",
      "Arduino Programming",
      "Robot Movement",
      "Track Simulation",
      "Engineering Challenge",
    ]);
    for (const m of WEEKLY_MISSIONS_DEFAULT) {
      expect(m.topicIds.length).toBeGreaterThan(0);
      for (const id of m.topicIds) expect(getTopic(id), `${m.day} -> ${id}`).toBeDefined();
    }
  });
});

describe("links", () => {
  it("contains no invented YouTube video links", () => {
    const blob = JSON.stringify({ TOPICS, QUIZZES, LEARNING_PATHS, WEEKLY_MISSIONS_DEFAULT });
    expect(blob).not.toMatch(/youtube\.com\/watch/i);
    expect(blob).not.toMatch(/youtu\.be/i);
    for (const t of TOPICS) expect(t.youtubeSearch).not.toMatch(/^https?:|www\./i);
  });
});

describe("catalogue consistency", () => {
  const records = (catalogue as unknown as { records: { id: string; name: string; pins?: { id: string }[] }[] }).records;
  const byId = new Map(records.map((r) => [r.id, r]));
  const names = new Set(records.map((r) => r.name));

  it("relatedComponents use master-catalogue names", () => {
    const unknown = TOPICS.flatMap((t) => t.relatedComponents.filter((n) => !names.has(n)).map((n) => t.id + ": " + n));
    expect(unknown).toEqual([]);
  });

  it("pinout diagrams reference catalogue components and pin ids", () => {
    const problems: string[] = [];
    for (const t of TOPICS) {
      const diagrams = [...t.diagrams, ...t.quiz.flatMap((q) => (q.diagram ? [q.diagram] : []))];
      for (const d of diagrams) {
        if (d.kind !== "pinout") continue;
        const rec = byId.get(d.componentId);
        if (!rec) { problems.push(t.id + ": unknown component " + d.componentId); continue; }
        const pins = new Set((rec.pins ?? []).map((p) => p.id));
        for (const h of d.highlight ?? []) if (!pins.has(h)) problems.push(t.id + ": " + d.componentId + " has no pin " + h);
      }
    }
    expect(problems).toEqual([]);
  });
});
