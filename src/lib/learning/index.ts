import type { CompetitionQuiz, LearningPath, PathId, QuestionType, QuizQuestion, Topic } from "./types";
import { LINE_PART1 } from "./topics/line-part1";
import { LINE_PART2 } from "./topics/line-part2";
import { RACE_PART1 } from "./topics/race-part1";
import { RACE_PART2 } from "./topics/race-part2";
import { SUMO_PART1 } from "./topics/sumo-part1";
import { SUMO_PART2 } from "./topics/sumo-part2";

export * from "./types";

export const LINE_TOPICS: Topic[] = [...LINE_PART1, ...LINE_PART2];
export const RACE_TOPICS: Topic[] = [...RACE_PART1, ...RACE_PART2];
export const SUMO_TOPICS: Topic[] = [...SUMO_PART1, ...SUMO_PART2];

/** All topics, ordered by path (line, race, sumo) then by `order`. */
export const TOPICS: Topic[] = [...LINE_TOPICS, ...RACE_TOPICS, ...SUMO_TOPICS];

const TOPIC_BY_ID = new Map<string, Topic>(TOPICS.map((t) => [t.id, t]));

export function getTopic(id: string): Topic | undefined {
  return TOPIC_BY_ID.get(id);
}

export function getTopicsForPath(pathId: PathId): Topic[] {
  return TOPICS.filter((t) => t.pathId === pathId);
}

export const LEARNING_PATHS: LearningPath[] = [
  {
    id: "line",
    title: "Line Following Robot",
    tagline: "From Ohm's law to a tuned PID line follower.",
    description:
      "Start with electronics fundamentals, learn the Arduino Uno, sensors and motor drivers, then build, calibrate and tune a PID line follower that runs smooth and fast.",
    topicIds: LINE_TOPICS.map((t) => t.id),
  },
  {
    id: "race",
    title: "Robo Race",
    tagline: "Speed, grip and control on the race track.",
    description:
      "Learn motors, torque, gearing, wheels, batteries and drivers, then master differential steering, encoders, braking, stability and racing algorithms to set the fastest lap.",
    topicIds: RACE_TOPICS.map((t) => t.id),
  },
  {
    id: "sumo",
    title: "Robo War / Sumo",
    tagline: "Push hard, stay in the ring, out-think the opponent.",
    description:
      "Design a low, heavy, high-traction sumo robot with a sharp wedge, then add edge detection, opponent sensing and search, attack and defence strategies built as robust state machines.",
    topicIds: SUMO_TOPICS.map((t) => t.id),
  },
];

/** Every quiz question across all topics, in topic order. */
export const ALL_QUESTIONS: QuizQuestion[] = TOPICS.flatMap((t) => t.quiz);

const QUESTION_BY_ID = new Map<string, QuizQuestion>(ALL_QUESTIONS.map((q) => [q.id, q]));

export function getQuestion(id: string): QuizQuestion | undefined {
  return QUESTION_BY_ID.get(id);
}

/** Topic that owns a question (question ids are `${pathId}-${order}-q${n}`). */
export function getTopicForQuestion(questionId: string): Topic | undefined {
  return TOPICS.find((t) => t.quiz.some((q) => q.id === questionId));
}

// ---------------------------------------------------------------------------
// Quiz assembly helpers (deterministic: same content -> same question ids)
// ---------------------------------------------------------------------------

/** Picks `count` items spread evenly across `items` (keeps original order). */
function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(items[Math.floor((i * items.length) / count)]);
  }
  return out;
}

function questionsOfPath(pathId: PathId, minDifficulty: 1 | 2 | 3 = 1): QuizQuestion[] {
  return getTopicsForPath(pathId)
    .flatMap((t) => t.quiz)
    .filter((q) => q.difficulty >= minDifficulty);
}

function questionsOfTypes(types: QuestionType[]): QuizQuestion[] {
  return ALL_QUESTIONS.filter((q) => types.includes(q.type));
}

/** Questions from the listed topics: up to `perTopic` per topic, in topic order. */
function questionsFromTopics(topicIds: string[], perTopic = 1): QuizQuestion[] {
  return topicIds.flatMap((id) => {
    const topic = getTopic(id);
    if (!topic) throw new Error(`Unknown topic id in quiz definition: ${id}`);
    return topic.quiz.slice(0, perTopic);
  });
}

const ids = (qs: QuizQuestion[]) => qs.map((q) => q.id);

export const QUIZZES: CompetitionQuiz[] = [
  // --- One competition quiz per path -------------------------------------
  {
    id: "competition-line",
    title: "Line Following Competition Quiz",
    kind: "competition",
    pathId: "line",
    timeLimitS: 900,
    passPercent: 60,
    questionIds: ids(spread(questionsOfPath("line", 2), 12)),
    xpBonus: 100,
  },
  {
    id: "competition-race",
    title: "Robo Race Competition Quiz",
    kind: "competition",
    pathId: "race",
    timeLimitS: 900,
    passPercent: 60,
    questionIds: ids(spread(questionsOfPath("race", 2), 12)),
    xpBonus: 100,
  },
  {
    id: "competition-sumo",
    title: "Robo War / Sumo Competition Quiz",
    kind: "competition",
    pathId: "sumo",
    timeLimitS: 900,
    passPercent: 60,
    questionIds: ids(spread(questionsOfPath("sumo", 2), 12)),
    xpBonus: 100,
  },

  // --- Weekly quizzes ----------------------------------------------------
  {
    id: "weekly-electronics-drivers",
    title: "Weekly Quiz: Electronics and Motor Drivers",
    kind: "weekly",
    timeLimitS: 600,
    passPercent: 60,
    questionIds: ids(
      questionsFromTopics([
        "line-4-voltage-current-resistance",
        "line-5-ohms-law",
        "line-6-resistors",
        "line-7-capacitors",
        "line-8-diodes",
        "line-9-transistors",
        "line-21-h-bridge",
        "line-22-l298n",
        "line-23-other-motor-drivers",
        "race-11-motor-drivers",
        "sumo-11-sumo-motor-drivers",
      ]),
    ),
    xpBonus: 50,
  },
  {
    id: "weekly-sensors-code",
    title: "Weekly Quiz: Sensors and Arduino Code",
    kind: "weekly",
    timeLimitS: 600,
    passPercent: 60,
    questionIds: ids(
      questionsFromTopics([
        "line-12-gpio",
        "line-13-adc",
        "line-14-pwm",
        "line-16-ir-sensors",
        "line-17-tcrt5000",
        "line-25-sensor-calibration",
        "race-17-encoders",
        "sumo-13-sumo-ultrasonic-sensors",
        "sumo-14-sharp-ir-sensors",
        "sumo-16-bumper-switches",
      ]),
    ),
    xpBonus: 50,
  },

  // --- Advanced engineering challenges -----------------------------------
  {
    id: "challenge-code-tracer",
    title: "Advanced Engineering Challenge: Code Tracer",
    kind: "challenge",
    timeLimitS: 900,
    passPercent: 70,
    questionIds: ids(spread(questionsOfTypes(["code-output", "debug-code"]).filter((q) => q.difficulty >= 2), 12)),
    xpBonus: 150,
  },
  {
    id: "challenge-power-mechanics",
    title: "Advanced Engineering Challenge: Power and Mechanics Calculations",
    kind: "challenge",
    timeLimitS: 1200,
    passPercent: 70,
    questionIds: ids(spread(questionsOfTypes(["calculate"]).filter((q) => q.difficulty >= 2), 12)),
    xpBonus: 150,
  },
  {
    id: "challenge-circuit-detective",
    title: "Advanced Engineering Challenge: Circuit Detective",
    kind: "challenge",
    timeLimitS: 900,
    passPercent: 70,
    questionIds: ids(
      spread(questionsOfTypes(["find-wrong-connection", "predict-circuit", "identify-driver", "identify-pin"]), 12),
    ),
    xpBonus: 150,
  },

  // --- Final examination -------------------------------------------------
  {
    id: "final-beast-engineer",
    title: "Final Beast Engineer Examination",
    kind: "final",
    timeLimitS: 2700,
    passPercent: 70,
    questionIds: ids([
      ...spread(questionsOfPath("line", 2), 10),
      ...spread(questionsOfPath("race", 2), 10),
      ...spread(questionsOfPath("sumo", 2), 10),
    ]),
    xpBonus: 500,
  },
];

export function getQuiz(id: string): CompetitionQuiz | undefined {
  return QUIZZES.find((q) => q.id === id);
}

export interface WeeklyMission {
  day: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  title: string;
  description: string;
  topicIds: string[];
}

export const WEEKLY_MISSIONS_DEFAULT: WeeklyMission[] = [
  {
    day: "Monday",
    title: "Electronics Fundamentals",
    description: "Revise voltage, current, resistance and Ohm's law, then size a resistor and check your answer with a multimeter.",
    topicIds: [
      "line-3-electronics-fundamentals",
      "line-4-voltage-current-resistance",
      "line-5-ohms-law",
      "line-6-resistors",
    ],
  },
  {
    day: "Tuesday",
    title: "Motor Drivers",
    description: "Understand the H-bridge, wire an L298N or TB6612FNG correctly and know when to brake versus coast.",
    topicIds: ["line-21-h-bridge", "line-22-l298n", "line-23-other-motor-drivers", "sumo-11-sumo-motor-drivers"],
  },
  {
    day: "Wednesday",
    title: "Sensors",
    description: "Read IR reflectance, ultrasonic and Sharp IR sensors, and calibrate them for the real track or dohyo.",
    topicIds: [
      "line-16-ir-sensors",
      "line-17-tcrt5000",
      "line-18-qtr-sensor-arrays",
      "line-25-sensor-calibration",
      "sumo-13-sumo-ultrasonic-sensors",
      "sumo-14-sharp-ir-sensors",
    ],
  },
  {
    day: "Thursday",
    title: "Arduino Programming",
    description: "Practise GPIO, ADC and PWM on the Uno and trace code by hand: integer maths, 16-bit int limits and timing with millis().",
    topicIds: ["line-11-arduino-uno", "line-12-gpio", "line-13-adc", "line-14-pwm"],
  },
  {
    day: "Friday",
    title: "Robot Movement",
    description: "Control direction and speed, steer with differential drive and measure speed with encoders.",
    topicIds: [
      "race-15-motor-direction",
      "race-16-differential-steering",
      "race-17-encoders",
      "race-19-acceleration",
      "race-20-braking",
    ],
  },
  {
    day: "Saturday",
    title: "Track Simulation",
    description: "Run line detection, PID and track-navigation logic in the simulator and tune for a clean, fast lap.",
    topicIds: [
      "line-26-line-detection-algorithms",
      "line-27-pid-control",
      "line-28-advanced-line-following",
      "race-23-track-navigation",
    ],
  },
  {
    day: "Sunday",
    title: "Engineering Challenge",
    description: "Put it together: test methodically, debug, optimise and plan a sumo strategy, then attempt an advanced challenge quiz.",
    topicIds: [
      "line-29-debugging",
      "race-26-testing",
      "race-27-optimisation",
      "sumo-18-search-algorithms",
      "sumo-24-advanced-control-logic",
    ],
  },
];
