/**
 * MY PERFORMANCE ANALYSIS — computed from the student's real quiz and challenge attempts.
 * Each answered question counts once per attempt; skipped/unanswered questions are not "attempted".
 */
import type { QuizAttempt } from "@/lib/data/types";
import { getTopic } from "./index";
import { type ExtraQuestion, reviewAll } from "./history";
import { CATEGORIES, type CategoryId, categoryOfTopic, topicsInCategory } from "./categories";

export const MIN_QUESTIONS_FOR_CATEGORY = 5;

export type Level = "Needs Improvement" | "Developing" | "Good" | "Excellent";
export function classify(accuracy: number, attempted: number): Level | null {
  if (attempted < MIN_QUESTIONS_FOR_CATEGORY) return null;
  if (accuracy < 50) return "Needs Improvement";
  if (accuracy < 70) return "Developing";
  if (accuracy < 85) return "Good";
  return "Excellent";
}

export interface Stat {
  attempted: number;
  correct: number;
  incorrect: number;
  /** 0–100 */
  accuracy: number;
  quizAttempts: number;
  level: Level | null;
  /** accuracy of the most recent answers (up to 10) */
  recent: number | null;
  /** later half of answers vs earlier half (needs ≥ 6 answers) */
  trend: "improving" | "declining" | "steady" | null;
  /** chronological correctness, for sparklines */
  history: boolean[];
}

export interface TopicStat extends Stat {
  topicId: string;
  title: string;
  category: CategoryId | null;
}
export interface CategoryStat extends Stat {
  id: CategoryId;
  name: string;
}

function summarise(history: boolean[], attemptsSeen: number): Stat {
  const attempted = history.length;
  const correct = history.filter(Boolean).length;
  const accuracy = attempted ? (correct / attempted) * 100 : 0;
  const last = history.slice(-10);
  let trend: Stat["trend"] = null;
  if (attempted >= 6) {
    const half = Math.floor(attempted / 2);
    const a = history.slice(0, half).filter(Boolean).length / half;
    const b = history.slice(half).filter(Boolean).length / (attempted - half);
    trend = b - a > 0.1 ? "improving" : a - b > 0.1 ? "declining" : "steady";
  }
  return { attempted, correct, incorrect: attempted - correct, accuracy, quizAttempts: attemptsSeen, level: classify(accuracy, attempted), recent: last.length ? (last.filter(Boolean).length / last.length) * 100 : null, trend, history };
}

export interface PerformanceReport {
  topics: TopicStat[];
  categories: CategoryStat[];
  strongest: TopicStat[];
  weakest: TopicStat[];
  /** overall accuracy per attempt, oldest first (for the trend chart) */
  timeline: { at: string; accuracy: number; title: string }[];
  totals: { attempted: number; correct: number; accuracy: number; attempts: number };
  /** lessons to study next, weakest first */
  recommendations: { topicId: string; title: string; reason: string }[];
}

export function analysePerformance(attempts: QuizAttempt[], extra: ExtraQuestion[] = [], completedTopics: string[] = []): PerformanceReport {
  const reviews = reviewAll(attempts, extra).reverse(); // oldest first
  const topicHist = new Map<string, boolean[]>();
  const topicAttempts = new Map<string, Set<string>>();
  const catHist = new Map<CategoryId, boolean[]>();
  const catAttempts = new Map<CategoryId, Set<string>>();
  const timeline: PerformanceReport["timeline"] = [];
  let attempted = 0;
  let correct = 0;
  for (const r of reviews) {
    let n = 0;
    let ok = 0;
    for (const it of r.items) {
      if (it.chosen === null || !it.topicId) continue;
      n++;
      if (it.correct) ok++;
      const h = topicHist.get(it.topicId) ?? [];
      h.push(it.correct);
      topicHist.set(it.topicId, h);
      (topicAttempts.get(it.topicId) ?? topicAttempts.set(it.topicId, new Set()).get(it.topicId)!).add(r.attempt.id);
      const cat = categoryOfTopic(it.topicId);
      if (cat) {
        const ch = catHist.get(cat) ?? [];
        ch.push(it.correct);
        catHist.set(cat, ch);
        (catAttempts.get(cat) ?? catAttempts.set(cat, new Set()).get(cat)!).add(r.attempt.id);
      }
    }
    if (n) timeline.push({ at: r.attempt.at, accuracy: (ok / n) * 100, title: r.title });
    attempted += n;
    correct += ok;
  }

  const topics: TopicStat[] = [...topicHist.entries()].map(([topicId, h]) => ({
    topicId,
    title: getTopic(topicId)?.title ?? topicId,
    category: categoryOfTopic(topicId),
    ...summarise(h, topicAttempts.get(topicId)?.size ?? 0),
  }));
  const categories: CategoryStat[] = CATEGORIES.map((c) => ({ id: c.id, name: c.name, ...summarise(catHist.get(c.id) ?? [], catAttempts.get(c.id)?.size ?? 0) }));
  const ranked = topics.filter((t) => t.level).sort((a, b) => b.accuracy - a.accuracy || b.attempted - a.attempted);
  const strongest = ranked.filter((t) => t.accuracy >= 70).slice(0, 3);
  const weakest = [...ranked].reverse().filter((t) => t.accuracy < 70).slice(0, 3);

  // recommendations: revisit weak topics first, then unstudied lessons in weak categories
  const done = new Set(completedTopics);
  const recs: PerformanceReport["recommendations"] = [];
  const seen = new Set<string>();
  for (const t of [...topics].filter((x) => x.attempted >= 2 && x.accuracy < 70).sort((a, b) => a.accuracy - b.accuracy)) {
    recs.push({ topicId: t.topicId, title: t.title, reason: `${Math.round(t.accuracy)}% accuracy on ${t.attempted} answers — revise this lesson` });
    seen.add(t.topicId);
  }
  for (const c of categories.filter((x) => x.level === "Needs Improvement" || x.level === "Developing").sort((a, b) => a.accuracy - b.accuracy)) {
    for (const id of topicsInCategory(c.id)) {
      if (recs.length >= 6) break;
      if (seen.has(id) || done.has(id)) continue;
      const t = getTopic(id);
      if (!t) continue;
      recs.push({ topicId: id, title: t.title, reason: `${c.name} is ${c.level?.toLowerCase()} — this lesson isn't completed yet` });
      seen.add(id);
    }
  }

  return { topics: topics.sort((a, b) => a.title.localeCompare(b.title)), categories, strongest, weakest, timeline, totals: { attempted, correct, accuracy: attempted ? (correct / attempted) * 100 : 0, attempts: reviews.length }, recommendations: recs.slice(0, 6) };
}
