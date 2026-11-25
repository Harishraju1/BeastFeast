/**
 * Protects the database from retry storms when saving projects.
 *
 * CircuitBreaker — CLOSED: saves go out normally. After `failureThreshold` consecutive failures it OPENS and no
 * save is attempted until a back-off delay has passed. Then it is HALF-OPEN: exactly one trial save may go out;
 * success closes the circuit, failure re-opens it with a longer delay. Delays grow exponentially (capped) and
 * carry random jitter, so a thousand browsers that failed together do not all retry in the same instant.
 *
 * Saving a project is an idempotent upsert of the whole document, so retrying it is safe.
 */
export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerOptions {
  failureThreshold: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** injectable for tests */
  random?: () => number;
}

export const SAVE_BREAKER_DEFAULTS: BreakerOptions = { failureThreshold: 3, baseDelayMs: 2000, maxDelayMs: 60000 };

export class CircuitBreaker {
  state: BreakerState = "closed";
  /** consecutive failures */
  failures = 0;
  /** how many times the circuit has opened in a row (drives the back-off) */
  opens = 0;
  nextAttemptAt = 0;
  private trialInFlight = false;
  private readonly rnd: () => number;

  constructor(private readonly o: BreakerOptions = SAVE_BREAKER_DEFAULTS) {
    this.rnd = o.random ?? Math.random;
  }

  /** Exponential back-off with "equal jitter": half fixed, half random. */
  backoff(n: number): number {
    const d = Math.min(this.o.maxDelayMs, this.o.baseDelayMs * 2 ** Math.max(0, n - 1));
    return Math.round(d / 2 + this.rnd() * (d / 2));
  }

  /** May a save go out now? In HALF-OPEN only one trial at a time. */
  canAttempt(now: number): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (now < this.nextAttemptAt) return false;
      this.state = "half-open";
      this.trialInFlight = true;
      return true;
    }
    if (this.trialInFlight) return false;
    this.trialInFlight = true;
    return true;
  }

  /** Milliseconds until a save may be attempted (0 = now). */
  waitMs(now: number): number {
    return this.state === "open" ? Math.max(0, this.nextAttemptAt - now) : 0;
  }

  onSuccess(): void {
    this.state = "closed";
    this.failures = 0;
    this.opens = 0;
    this.trialInFlight = false;
  }

  /** Records a failure; returns how long to wait before the next attempt. */
  onFailure(now: number): number {
    this.failures++;
    this.trialInFlight = false;
    if (this.state === "half-open" || this.failures >= this.o.failureThreshold) {
      this.opens++;
      this.state = "open";
      const delay = this.backoff(this.opens + 1);
      this.nextAttemptAt = now + delay;
      return delay;
    }
    return this.backoff(this.failures);
  }
}

/** Document comparison that ignores the timestamp every edit bumps. */
export function saveFingerprint(p: { updatedAt?: string }): string {
  return JSON.stringify({ ...p, updatedAt: "" });
}

// ───────────── unsaved-work backup on this device ─────────────
const BACKUP_PREFIX = "bf5.unsaved.";

/** Keeps a copy of a project that could not be saved yet. Returns false if the browser refused (quota, private mode). */
export function backupUnsaved(p: { id: string }): boolean {
  try {
    localStorage.setItem(BACKUP_PREFIX + p.id, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function clearBackup(id: string): void {
  try {
    localStorage.removeItem(BACKUP_PREFIX + id);
  } catch {
    /* ignore */
  }
}

/** Unsaved copies on this device that belong to `ownerId` (never another account's). */
export function readBackups<T extends { id: string; ownerId: string; updatedAt: string }>(ownerId: string): T[] {
  const out: T[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(BACKUP_PREFIX)) continue;
      try {
        const p = JSON.parse(localStorage.getItem(k) ?? "null") as T | null;
        if (p && p.ownerId === ownerId && typeof p.updatedAt === "string") out.push(p);
      } catch {
        /* corrupt entry — ignore */
      }
    }
  } catch {
    /* storage unavailable */
  }
  return out;
}

/** Version snapshots don't need recorded replay paths (they made a project's saved size grow ~20×). */
export function slimForSnapshot<T extends { simulations?: { ghost?: unknown }[] }>(p: T): T {
  return { ...p, simulations: p.simulations?.map(({ ghost, ...s }) => (void ghost, s)) };
}
