import { describe, expect, it } from "vitest";
import { computeStreak, streakDay } from "@/lib/streak";

/** an instant given as India local time (UTC+05:30) */
const ist = (s: string) => new Date(`${s}+05:30`);
const ev = (...ts: string[]) => ts.map((t) => ({ at: ist(t).toISOString(), amount: 10 }));

describe("streak day boundary (Asia/Kolkata, day ends 23:59)", () => {
  it("uses India time, not UTC", () => {
    // 01:00 IST on 10 Mar is still 9 Mar in UTC
    expect(streakDay(ist("2026-03-10T01:00:00"))).toBe("2026-03-10");
  });
  it("activity from 23:59 counts for the next day", () => {
    expect(streakDay(ist("2026-03-10T23:58:59"))).toBe("2026-03-10");
    expect(streakDay(ist("2026-03-10T23:59:00"))).toBe("2026-03-11");
  });
  it("other timezones are respected", () => {
    expect(streakDay(new Date("2026-03-10T03:00:00Z"), "America/New_York")).toBe("2026-03-09");
  });
});

describe("computeStreak", () => {
  it("counts consecutive days including today", () => {
    const s = computeStreak(ev("2026-03-08T10:00:00", "2026-03-09T10:00:00", "2026-03-10T09:00:00"), ist("2026-03-10T12:00:00"));
    expect(s).toMatchObject({ current: 3, longest: 3, activeToday: true, today: "2026-03-10" });
  });
  it("is not broken before today's day ends, but yesterday is never shown as today", () => {
    const s = computeStreak(ev("2026-03-08T10:00:00", "2026-03-09T10:00:00"), ist("2026-03-10T20:00:00"));
    expect(s.current).toBe(2);
    expect(s.activeToday).toBe(false);
  });
  it("resets after a missed day", () => {
    const s = computeStreak(ev("2026-03-07T10:00:00", "2026-03-08T10:00:00"), ist("2026-03-10T08:00:00"));
    expect(s.current).toBe(0);
    expect(s.longest).toBe(2);
  });
  it("at 23:59 the old day is over", () => {
    // active on the 9th only; at 23:59 on the 10th the streak day is already the 11th → the 10th was missed
    const s = computeStreak(ev("2026-03-09T10:00:00"), ist("2026-03-10T23:59:30"));
    expect(s.today).toBe("2026-03-11");
    expect(s.current).toBe(0);
  });
  it("duplicate events on one day count once; penalties do not count", () => {
    const s = computeStreak([...ev("2026-03-10T08:00:00", "2026-03-10T09:00:00"), { at: ist("2026-03-09T09:00:00").toISOString(), amount: -5 }], ist("2026-03-10T12:00:00"));
    expect(s.current).toBe(1);
  });
  it("an unknown timezone falls back to India time", () => {
    expect(computeStreak([], new Date(), "Mars/Olympus").timezone).toBe("Asia/Kolkata");
  });
});
