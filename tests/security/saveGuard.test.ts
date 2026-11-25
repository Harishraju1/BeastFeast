import { beforeEach, describe, expect, it } from "vitest";
import { CircuitBreaker, backupUnsaved, clearBackup, readBackups, saveFingerprint, slimForSnapshot } from "@/lib/sync/saveGuard";

const opts = { failureThreshold: 3, baseDelayMs: 1000, maxDelayMs: 8000 };

describe("save circuit breaker", () => {
  it("stays closed through isolated failures, opens after the threshold", () => {
    const b = new CircuitBreaker({ ...opts, random: () => 0.5 });
    expect(b.canAttempt(0)).toBe(true);
    b.onFailure(0);
    b.onFailure(0);
    expect(b.state).toBe("closed");
    b.onFailure(0);
    expect(b.state).toBe("open");
    expect(b.canAttempt(10)).toBe(false);
  });

  it("half-open lets exactly one trial through; success closes, failure re-opens longer", () => {
    const b = new CircuitBreaker({ ...opts, random: () => 1 });
    for (let i = 0; i < 3; i++) b.onFailure(0);
    const firstWait = b.nextAttemptAt;
    expect(b.canAttempt(firstWait)).toBe(true);
    expect(b.state).toBe("half-open");
    expect(b.canAttempt(firstWait)).toBe(false); // no second concurrent trial
    b.onFailure(firstWait);
    expect(b.state).toBe("open");
    expect(b.nextAttemptAt - firstWait).toBeGreaterThan(firstWait); // exponential growth
    expect(b.canAttempt(b.nextAttemptAt)).toBe(true);
    b.onSuccess();
    expect(b.state).toBe("closed");
    expect(b.failures).toBe(0);
  });

  it("back-off is capped and jittered (no synchronised retry storms)", () => {
    const lo = new CircuitBreaker({ ...opts, random: () => 0 });
    const hi = new CircuitBreaker({ ...opts, random: () => 1 });
    expect(lo.backoff(20)).toBe(4000);
    expect(hi.backoff(20)).toBe(8000);
    const spread = new Set(Array.from({ length: 50 }, () => new CircuitBreaker(opts).backoff(3)));
    expect(spread.size).toBeGreaterThan(10);
  });
});

describe("save fingerprint", () => {
  it("ignores the timestamp but not the content", () => {
    expect(saveFingerprint({ updatedAt: "a", code: "x" } as never)).toBe(saveFingerprint({ updatedAt: "b", code: "x" } as never));
    expect(saveFingerprint({ updatedAt: "a", code: "x" } as never)).not.toBe(saveFingerprint({ updatedAt: "a", code: "y" } as never));
  });
});

describe("unsaved-work backup on this device", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      get length() { return store.size; },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });

  it("returns only this account's backups and clears them", () => {
    expect(backupUnsaved({ id: "p1", ownerId: "me", updatedAt: "2" } as never)).toBe(true);
    backupUnsaved({ id: "p2", ownerId: "someone-else", updatedAt: "2" } as never);
    expect(readBackups("me").map((p) => p.id)).toEqual(["p1"]);
    clearBackup("p1");
    expect(readBackups("me")).toEqual([]);
  });

  it("reports when the browser refuses to store", () => {
    (globalThis as unknown as { localStorage: { setItem: () => void } }).localStorage.setItem = () => { throw new Error("QuotaExceeded"); };
    expect(backupUnsaved({ id: "p1" })).toBe(false);
  });
});

describe("version snapshots", () => {
  it("drop replay paths but keep the results", () => {
    const s = slimForSnapshot({ simulations: [{ id: "s1", bestLapS: 12, ghost: [{ t: 0 }] }] as { id: string; bestLapS: number; ghost?: unknown }[] });
    expect(s.simulations?.[0]).toEqual({ id: "s1", bestLapS: 12 });
  });
});
