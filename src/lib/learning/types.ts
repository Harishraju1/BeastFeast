export type PathId = "line" | "race" | "sumo";
export type QuestionType =
  | "mcq" | "identify-component" | "identify-pin" | "predict-circuit" | "find-wrong-connection"
  | "identify-driver" | "code-output" | "debug-code" | "calculate" | "predict-movement";
export interface QuizQuestion {
  id: string;            // globally unique, e.g. "line-14-q2"
  type: QuestionType;
  prompt: string;        // may contain markdown-ish plain text; use \n for new lines
  code?: string;         // optional Arduino code block shown with the question
  diagram?: DiagramSpec; // optional diagram
  options: string[];     // 2–5 options (for "calculate" also provide options so it's gradeable)
  answerIndex: number;
  explanation: string;   // why the right answer is right AND why the common wrong one is wrong
  difficulty: 1 | 2 | 3;
  xp: number;            // 5 for difficulty 1, 10 for 2, 15 for 3
}
export type DiagramSpec =
  | { kind: "pinout"; componentId: string; highlight?: string[] }       // component ids from the catalogue, e.g. "l298n", "arduino-uno-r3", "tcrt5000", "hc-sr04", "tb6612fng", "qtr-8a"
  | { kind: "circuit"; nodes: { id: string; label: string; x: number; y: number }[]; edges: { from: string; to: string; label?: string; color?: string; wrong?: boolean }[] }
  | { kind: "signal"; title: string; series: { label: string; points: [number, number][] }[]; xLabel: string; yLabel: string }
  | { kind: "flow"; steps: string[] }
  | { kind: "formula"; latexish: string; legend: Record<string, string> };
export interface TopicSection { heading: string; body: string; }  // body: paragraphs separated by \n\n, bullet lines start with "- "
export interface Topic {
  id: string;             // e.g. "line-14-pwm"
  pathId: PathId;
  order: number;          // 1-based as listed below
  title: string;
  minutes: number;        // estimated reading time
  summary: string;        // one sentence
  introduction: string;
  beginner: string;       // plain-language explanation with an analogy
  technical: TopicSection[]; // detailed technical explanation (2–5 sections)
  workingPrinciple: string;
  diagrams: DiagramSpec[]; // at least 1 per topic where meaningful
  examples: { title: string; body: string; code?: string }[]; // practical examples; include Arduino code where relevant (must compile on Arduino Uno, use only standard Arduino API)
  commonMistakes: { mistake: string; why: string; fix: string }[]; // 3+
  keyTakeaways: string[]; // 4–6
  relatedComponents: string[]; // component names as in the master catalogue, e.g. "L298N", "TCRT5000", "Arduino Uno R3"
  youtubeSearch: string;  // a search query string (NOT a URL, NOT a video id — do not invent video links)
  quiz: QuizQuestion[];   // mini quiz: 3–5 questions, mixed types
}
export interface LearningPath { id: PathId; title: string; tagline: string; description: string; topicIds: string[]; }
export interface CompetitionQuiz { id: string; title: string; kind: "competition" | "weekly" | "challenge" | "final"; pathId?: PathId; timeLimitS?: number; passPercent: number; questionIds: string[]; xpBonus: number; }
