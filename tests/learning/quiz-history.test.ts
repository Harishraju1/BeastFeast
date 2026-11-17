import { describe, expect, it } from "vitest";
import { QUIZZES, TOPICS } from "@/lib/learning";
import { questionsForQuiz, quizTitle, reviewAll, reviewAttempt, weakSpots } from "@/lib/learning/history";
import type { QuizAttempt } from "@/lib/data/types";

const topic = TOPICS[0];
const attempt = (answers: Record<string, number>, at = "2026-11-17T10:00:00.000Z", quizId = `topic:${topic.id}`): QuizAttempt => ({
  id: at, quizId, at, answers, correct: 0, total: 0, percent: 0, passed: false, xpAwarded: 0,
});

describe("quiz history", () => {
  it("marks each question right, wrong or unanswered with the correct answer", () => {
    const [q1, q2, q3] = topic.quiz;
    const wrongIdx = (q2.answerIndex + 1) % q2.options.length;
    const r = reviewAttempt(attempt({ [q1.id]: q1.answerIndex, [q2.id]: wrongIdx }));
    expect(r.title).toContain(topic.title);
    expect(r.items).toHaveLength(topic.quiz.length);
    expect(r.items[0]).toMatchObject({ correct: true, chosen: q1.answerIndex });
    expect(r.items[1]).toMatchObject({ correct: false, chosen: wrongIdx, topicId: topic.id });
    expect(r.items[2]).toMatchObject({ correct: false, chosen: null });
    expect(r.wrong.map((w) => w.question.id)).toEqual(expect.arrayContaining([q2.id, q3.id]));
    expect(r.wrong.some((w) => w.question.id === q1.id)).toBe(false);
  });

  it("rebuilds competition quizzes from their question list", () => {
    const quiz = QUIZZES[0];
    expect(questionsForQuiz(quiz.id).map((q) => q.id)).toEqual(quiz.questionIds);
    expect(quizTitle(quiz.id)).toBe(quiz.title);
  });

  it("includes admin-added questions for topic quizzes", () => {
    const extra = { topicId: topic.id, question: { ...topic.quiz[0], id: `${topic.id}-admin-1`, answerIndex: 1 } };
    const r = reviewAttempt(attempt({ [extra.question.id]: 0 }), [extra]);
    const item = r.items.find((i) => i.question.id === extra.question.id)!;
    expect(item).toMatchObject({ chosen: 0, correct: false });
  });

  it("lists attempts newest first and finds the most-missed questions", () => {
    const q = topic.quiz[0];
    const wrong = (q.answerIndex + 1) % q.options.length;
    const all = reviewAll([attempt({ [q.id]: wrong }, "2026-11-01T00:00:00.000Z"), attempt({ [q.id]: wrong }, "2026-11-10T00:00:00.000Z")]);
    expect(all[0].attempt.at > all[1].attempt.at).toBe(true);
    expect(weakSpots(all)[0]).toMatchObject({ misses: 2 });
    expect(weakSpots(all)[0].item.question.id).toBe(q.id);
  });
});
