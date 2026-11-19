import { beforeEach, describe, expect, it } from "vitest";
import { LocalBackend } from "@/lib/data/local";
import type { XpEvent } from "@/lib/data/types";
import { TOPICS, QUIZZES, getQuestion } from "@/lib/learning";

/** In-memory localStorage so the browser backend runs under Node. */
class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

function signIn(id: string) {
  const accounts = JSON.parse(localStorage.getItem("bf5.accounts") ?? "[]");
  if (!accounts.some((a: { profile: { id: string } }) => a.profile.id === id))
    accounts.push({ profile: { id, name: id, campus: "", studentId: "", avatar: null, role: "student", xp: 0, dailyXp: 0, rankLevel: 1, createdAt: new Date().toISOString() }, email: `${id}@x.test`, salt: "s", hash: "h" });
  localStorage.setItem("bf5.accounts", JSON.stringify(accounts));
  localStorage.setItem("bf5.session", JSON.stringify(id));
}
const ledger = (u: string) => (JSON.parse(localStorage.getItem("bf5.xp") ?? "[]") as XpEvent[]).filter((e) => e.userId === u);
const sum = (es: XpEvent[]) => es.reduce((a, e) => a + e.amount, 0);
const profileXp = (u: string) => JSON.parse(localStorage.getItem("bf5.accounts")!).find((a: { profile: { id: string } }) => a.profile.id === u).profile.xp as number;

const topic = TOPICS[0];
const quiz = `topic:${topic.id}`;
const right = Object.fromEntries(topic.quiz.map((q) => [q.id, q.answerIndex]));
const expected = topic.quiz.reduce((a, q) => a + q.xp, 0) + 25;

describe("quiz XP is awarded once per attempt (local backend)", () => {
  let be: LocalBackend;
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;
    be = new LocalBackend();
    signIn("u1");
  });

  it("one submission awards the quiz XP once", async () => {
    const a = await be.submitQuiz("u1", quiz, right, "att-1");
    expect(a.xpAwarded).toBe(expected);
    expect(sum(ledger("u1"))).toBe(expected);
    expect(profileXp("u1")).toBe(expected);
  });

  it("the same attempt sent repeatedly awards XP once and returns the original result", async () => {
    const a = await be.submitQuiz("u1", quiz, right, "att-1");
    const b = await be.submitQuiz("u1", quiz, right, "att-1");
    const c = await be.submitQuiz("u1", quiz, right, "att-1");
    expect(sum(ledger("u1"))).toBe(expected);
    expect([b.id, c.id]).toEqual([a.id, a.id]);
    expect(b.xpAwarded).toBe(expected);
    expect((await be.getProgress("u1")).quizAttempts).toHaveLength(1);
  });

  it("simultaneous requests for the same attempt award XP once", async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, () => be.submitQuiz("u1", quiz, right, "att-1")));
    const l = ledger("u1");
    expect(sum(l)).toBe(expected);
    expect(new Set(l.map((e) => `${e.type}|${e.refId}`)).size).toBe(l.length);
    expect(profileXp("u1")).toBe(expected);
    expect(new Set(rs.map((r) => r.id)).size).toBe(1);
    expect(rs.every((r) => r.xpAwarded === expected)).toBe(true);
    expect((await be.getProgress("u1")).quizAttempts).toHaveLength(1);
  });

  it("simultaneous separate attempts (two tabs) still award each question once", async () => {
    const [a, b] = await Promise.all([be.submitQuiz("u1", quiz, right, "tab-a"), be.submitQuiz("u1", quiz, right, "tab-b")]);
    expect(sum(ledger("u1"))).toBe(expected);
    expect(a.xpAwarded + b.xpAwarded).toBe(expected);
    expect((await be.getProgress("u1")).quizAttempts).toHaveLength(2);
  });

  it("every quiz ledger row points at its attempt", async () => {
    const a = await be.submitQuiz("u1", quiz, right, "att-1");
    expect(ledger("u1").every((e) => e.attemptId === a.id)).toBe(true);
  });

  it("a genuinely new attempt is separate; already-earned questions stay earned, new ones are rewarded once", async () => {
    const half = Object.fromEntries(topic.quiz.map((q, i) => [q.id, i === 0 ? q.answerIndex : (q.answerIndex + 1) % q.options.length]));
    const first = await be.submitQuiz("u1", quiz, half, "att-1");
    const better = await be.submitQuiz("u1", quiz, right, "att-2");
    const again = await be.submitQuiz("u1", quiz, right, "att-3");
    expect(first.id).not.toBe(better.id);
    expect(first.xpAwarded + better.xpAwarded).toBe(expected);
    expect(again.xpAwarded).toBe(0);
    expect(sum(ledger("u1"))).toBe(expected);
  });

  it("challenge quizzes follow the same rule", async () => {
    const ch = QUIZZES.find((q) => q.kind === "weekly")!;
    const ans = Object.fromEntries(ch.questionIds.map((id) => [id, getQuestion(id)!.answerIndex]));
    const exp = ch.questionIds.reduce((a, id) => a + getQuestion(id)!.xp, 0) + 25;
    await Promise.all([be.submitQuiz("u1", ch.id, ans, "c-1"), be.submitQuiz("u1", ch.id, ans, "c-1")]);
    expect(sum(ledger("u1"))).toBe(exp);
  });

  it("two students each receive their own reward", async () => {
    await be.submitQuiz("u1", quiz, right, "a");
    signIn("u2");
    await be.submitQuiz("u2", quiz, right, "a");
    expect(sum(ledger("u1"))).toBe(expected);
    expect(sum(ledger("u2"))).toBe(expected);
  });

  it("concurrent non-quiz awards for the same item are recorded once", async () => {
    const rs = await Promise.all([be.awardXp("u1", "validation-pass", "p1"), be.awardXp("u1", "validation-pass", "p1"), be.awardXp("u1", "code-check-pass", "p1")]);
    expect(rs[0].awarded + rs[1].awarded).toBe(60);
    expect(ledger("u1").filter((e) => e.type === "validation-pass")).toHaveLength(1);
    expect(ledger("u1").filter((e) => e.type === "code-check-pass")).toHaveLength(1); // not lost by a concurrent write
  });
});
