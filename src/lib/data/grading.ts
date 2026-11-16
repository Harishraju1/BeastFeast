import { QUIZZES, getQuestion, getTopic } from "@/lib/learning";
import type { QuizQuestion } from "@/lib/learning/types";

/** Resolve a quiz id: "topic:<topicId>" for a topic mini-quiz, otherwise a competition/weekly/challenge/final quiz. */
export function quizQuestions(quizId: string, extra: { topicId: string; question: QuizQuestion }[] = []): { questions: QuizQuestion[]; passPercent: number; xpBonus: number; title: string } | null {
  if (quizId.startsWith("topic:")) {
    const t = getTopic(quizId.slice(6));
    if (!t) return null;
    return { questions: [...t.quiz, ...extra.filter((e) => e.topicId === t.id).map((e) => e.question)], passPercent: 60, xpBonus: 0, title: `${t.title} — mini quiz` };
  }
  const q = QUIZZES.find((x) => x.id === quizId);
  if (!q) return null;
  return { questions: q.questionIds.map((id) => getQuestion(id)!).filter(Boolean), passPercent: q.passPercent, xpBonus: q.xpBonus, title: q.title };
}

export function gradeQuiz(quizId: string, answers: Record<string, number>, alreadyCorrect: Set<string>, extra: { topicId: string; question: QuizQuestion }[] = []) {
  const quiz = quizQuestions(quizId, extra);
  if (!quiz) throw new Error("Unknown quiz");
  let correct = 0;
  let questionXp = 0;
  const newlyCorrect: string[] = [];
  for (const q of quiz.questions) {
    if (answers[q.id] === q.answerIndex) {
      correct++;
      if (!alreadyCorrect.has(q.id)) {
        questionXp += q.xp;
        newlyCorrect.push(q.id);
      }
    }
  }
  const total = quiz.questions.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  return { correct, total, percent, passed: percent >= quiz.passPercent, questionXp, newlyCorrect, xpBonus: quiz.xpBonus };
}
