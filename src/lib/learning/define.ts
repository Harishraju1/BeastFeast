import type { PathId, QuizQuestion, Topic } from "./types";

/** Quiz question as authored: id and xp are derived automatically. */
export type QuestionInput = Omit<QuizQuestion, "id" | "xp">;

/** Topic as authored: id, pathId, order and question ids are derived automatically. */
export type TopicInput = Omit<Topic, "id" | "pathId" | "order" | "quiz"> & {
  slug: string; // kebab-case, e.g. "pwm" -> id "line-14-pwm"
  quiz: QuestionInput[];
};

export const XP_BY_DIFFICULTY: Record<1 | 2 | 3, number> = { 1: 5, 2: 10, 3: 15 };

/**
 * Builds a Topic with a stable id `${pathId}-${order}-${slug}` and
 * question ids `${pathId}-${order}-q${n}` (n is 1-based).
 */
export function defineTopic(pathId: PathId, order: number, input: TopicInput): Topic {
  const { slug, quiz, ...rest } = input;
  return {
    id: `${pathId}-${order}-${slug}`,
    pathId,
    order,
    ...rest,
    quiz: quiz.map((q, i) => ({
      ...q,
      id: `${pathId}-${order}-q${i + 1}`,
      xp: XP_BY_DIFFICULTY[q.difficulty],
    })),
  };
}
