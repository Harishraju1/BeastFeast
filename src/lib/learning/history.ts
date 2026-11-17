/**
 * Quiz history: rebuilds every saved attempt question by question — what the student chose, the correct
 * answer and the explanation — from the stored answers and the question bank (built-in topics, competition
 * quizzes and admin-added questions).
 */
import type { QuizAttempt } from "@/lib/data/types";
import { getQuestion, getQuiz, getTopic, getTopicForQuestion } from "./index";
import type { QuizQuestion } from "./types";

export interface ExtraQuestion {
  topicId: string;
  question: QuizQuestion;
}

export interface ReviewedQuestion {
  question: QuizQuestion;
  /** index the student picked, or null if they left it unanswered */
  chosen: number | null;
  correct: boolean;
  /** the Beast Topic to revisit for this question, if known */
  topicId: string | null;
  topicTitle: string | null;
}

export interface ReviewedAttempt {
  attempt: QuizAttempt;
  title: string;
  kind: "topic" | "quiz";
  items: ReviewedQuestion[];
  wrong: ReviewedQuestion[];
}

export function quizTitle(quizId: string): string {
  if (quizId.startsWith("topic:")) {
    const t = getTopic(quizId.slice(6));
    return t ? `${t.title} — topic quiz` : "Topic quiz";
  }
  return getQuiz(quizId)?.title ?? quizId;
}

/** Questions that belonged to the quiz, in the order the student saw them. */
export function questionsForQuiz(quizId: string, extra: ExtraQuestion[] = []): QuizQuestion[] {
  if (quizId.startsWith("topic:")) {
    const topicId = quizId.slice(6);
    const t = getTopic(topicId);
    return [...(t?.quiz ?? []), ...extra.filter((e) => e.topicId === topicId).map((e) => e.question)];
  }
  const quiz = getQuiz(quizId);
  return (quiz?.questionIds ?? []).map((id) => findQuestion(id, extra)).filter((q): q is QuizQuestion => !!q);
}

function findQuestion(id: string, extra: ExtraQuestion[]): QuizQuestion | undefined {
  return getQuestion(id) ?? extra.find((e) => e.question.id === id)?.question;
}

export function reviewAttempt(attempt: QuizAttempt, extra: ExtraQuestion[] = []): ReviewedAttempt {
  let questions = questionsForQuiz(attempt.quizId, extra);
  // answers to questions that are no longer in the quiz definition are still shown
  const known = new Set(questions.map((q) => q.id));
  for (const id of Object.keys(attempt.answers)) {
    if (!known.has(id)) {
      const q = findQuestion(id, extra);
      if (q) questions = [...questions, q];
    }
  }
  const items = questions.map((q): ReviewedQuestion => {
    const raw = attempt.answers[q.id];
    const chosen = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    const topic = getTopicForQuestion(q.id) ?? (extra.find((e) => e.question.id === q.id) ? getTopic(extra.find((e) => e.question.id === q.id)!.topicId) : undefined);
    return { question: q, chosen, correct: chosen === q.answerIndex, topicId: topic?.id ?? null, topicTitle: topic?.title ?? null };
  });
  return {
    attempt,
    title: quizTitle(attempt.quizId),
    kind: attempt.quizId.startsWith("topic:") ? "topic" : "quiz",
    items,
    wrong: items.filter((i) => !i.correct),
  };
}

/** Newest first. */
export function reviewAll(attempts: QuizAttempt[], extra: ExtraQuestion[] = []): ReviewedAttempt[] {
  return [...attempts].sort((a, b) => b.at.localeCompare(a.at)).map((a) => reviewAttempt(a, extra));
}

/** Questions missed most often across all attempts — the student's weak spots. */
export function weakSpots(reviews: ReviewedAttempt[], limit = 5) {
  const counts = new Map<string, { item: ReviewedQuestion; misses: number }>();
  for (const r of reviews)
    for (const w of r.wrong) {
      const c = counts.get(w.question.id);
      if (c) c.misses++;
      else counts.set(w.question.id, { item: w, misses: 1 });
    }
  return [...counts.values()].sort((a, b) => b.misses - a.misses).slice(0, limit);
}

export const optionLetter = (i: number) => String.fromCharCode(65 + i);
