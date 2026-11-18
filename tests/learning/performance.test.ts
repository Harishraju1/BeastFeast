import { describe, expect, it } from "vitest";
import { TOPICS } from "@/lib/learning";
import { ALL_MAPPED_TOPIC_IDS, categoryOfTopic } from "@/lib/learning/categories";
import { analysePerformance, classify } from "@/lib/learning/performance";
import type { QuizAttempt } from "@/lib/data/types";

const att = (id: string, topicId: string, answers: Record<string, number>, at: string): QuizAttempt => ({ id, quizId: `topic:${topicId}`, at, answers, correct: 0, total: 0, percent: 0, passed: false, xpAwarded: 0 });

describe("performance analysis", () => {
  it("every Beast Topic belongs to exactly one category", () => {
    for (const t of TOPICS) expect(categoryOfTopic(t.id), t.id).not.toBeNull();
    expect(new Set(ALL_MAPPED_TOPIC_IDS).size).toBe(ALL_MAPPED_TOPIC_IDS.length);
    expect(ALL_MAPPED_TOPIC_IDS.length).toBe(TOPICS.length);
  });

  it("classifies accuracy bands and needs 5 answered questions", () => {
    expect(classify(100, 4)).toBeNull();
    expect(classify(49, 5)).toBe("Needs Improvement");
    expect(classify(50, 5)).toBe("Developing");
    expect(classify(69.9, 10)).toBe("Developing");
    expect(classify(70, 10)).toBe("Good");
    expect(classify(84.9, 10)).toBe("Good");
    expect(classify(85, 10)).toBe("Excellent");
  });

  it("computes topic accuracy, strong/weak topics, trends and recommendations from real attempts", () => {
    const good = TOPICS[0]; // answered right
    const weak = TOPICS[1]; // answered wrong
    const right = (t: typeof good) => Object.fromEntries(t.quiz.map((q) => [q.id, q.answerIndex]));
    const wrong = (t: typeof good) => Object.fromEntries(t.quiz.map((q) => [q.id, (q.answerIndex + 1) % q.options.length]));
    const attempts = [
      att("a1", good.id, right(good), "2026-11-01T10:00:00Z"),
      att("a2", good.id, right(good), "2026-11-02T10:00:00Z"),
      att("b1", weak.id, wrong(weak), "2026-11-03T10:00:00Z"),
      att("b2", weak.id, wrong(weak), "2026-11-04T10:00:00Z"),
    ];
    const r = analysePerformance(attempts);
    const g = r.topics.find((t) => t.topicId === good.id)!;
    const w = r.topics.find((t) => t.topicId === weak.id)!;
    expect(g.attempted).toBe(good.quiz.length * 2);
    expect(g.accuracy).toBe(100);
    expect(g.level).toBe("Excellent");
    expect(w.accuracy).toBe(0);
    expect(w.level).toBe("Needs Improvement");
    expect(r.strongest[0].topicId).toBe(good.id);
    expect(r.weakest[0].topicId).toBe(weak.id);
    expect(r.recommendations[0].topicId).toBe(weak.id);
    expect(r.timeline.map((p) => Math.round(p.accuracy))).toEqual([100, 100, 0, 0]);
    expect(r.totals.attempts).toBe(4);
  });

  it("skipped questions are not counted as attempted", () => {
    const t = TOPICS[2];
    const r = analysePerformance([att("x", t.id, { [t.quiz[0].id]: t.quiz[0].answerIndex }, "2026-11-05T00:00:00Z")]);
    const s = r.topics.find((x) => x.topicId === t.id)!;
    expect(s.attempted).toBe(1);
    expect(s.level).toBeNull(); // "Not enough data yet"
  });
});
