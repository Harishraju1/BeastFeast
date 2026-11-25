import { describe, expect, it } from "vitest";
import { bucketStart, daysToQuota, toCsv, toSeries, totals, type Snapshot } from "@/lib/monitoring/series";

const base: Snapshot = { at: "", stats_reset: "r1", xact_commit: 0, xact_rollback: 0, tup_returned: 0, tup_fetched: 0, tup_inserted: 0, tup_updated: 0, tup_deleted: 0, db_size_bytes: 1000, connections: 5, active_connections: 1, idle_connections: 4, max_connections: 60, app_calls: 0, app_read_calls: 0, app_write_calls: 0, app_exec_ms: 0, app_slow_calls: 0 };
const snap = (iso: string, o: Partial<Snapshot>): Snapshot => ({ ...base, at: iso, ...o });

describe("monitoring series", () => {
  // 10:00–10:15 IST = 04:30–04:45 UTC
  const snaps = [
    snap("2026-11-25T04:30:00Z", { app_calls: 100, app_read_calls: 80, app_write_calls: 20, app_exec_ms: 50, xact_commit: 10 }),
    snap("2026-11-25T04:35:00Z", { app_calls: 160, app_read_calls: 130, app_write_calls: 30, app_exec_ms: 80, xact_commit: 15, connections: 9 }),
    snap("2026-11-25T04:40:00Z", { app_calls: 30, app_read_calls: 20, app_write_calls: 10, app_exec_ms: 10, xact_commit: 2, stats_reset: "r2" }), // reset
    snap("2026-11-25T04:45:00Z", { app_calls: 70, app_read_calls: 50, app_write_calls: 20, app_exec_ms: 30, xact_commit: 6, db_size_bytes: 2000, stats_reset: "r2" }),
  ];
  const from = Date.parse("2026-11-25T04:30:00Z"), to = Date.parse("2026-11-25T05:00:00Z");

  it("sums real deltas per IST hour and skips counter resets", () => {
    const pts = toSeries(snaps, "hour", from, to);
    const p = pts.find((x) => x.intervals > 0)!;
    expect(p.label).toBe("25 Nov 10:00");
    expect(p.statements).toBe(60 + 40); // 100→160, reset skipped, 30→70
    expect(p.reads).toBe(50 + 30);
    expect(p.writes).toBe(10 + 10);
    expect(p.commits).toBe(5 + 4);
    expect(p.resets).toBe(1);
    expect(p.sizeBytes).toBe(2000);
    expect(p.connectionsPeak).toBe(9);
  });

  it("totals give the average statement time and growth rate", () => {
    const t = totals(toSeries(snaps, "hour", from, to), snaps, from, to);
    expect(t.statements).toBe(100);
    expect(t.avgStatementMs).toBeCloseTo((30 + 20) / 100);
    expect(t.growthBytesPerDay).toBeNull(); // only 15 minutes of data
  });

  it("buckets on IST boundaries", () => {
    expect(new Date(bucketStart(Date.parse("2026-11-25T18:29:00Z"), "day")).toISOString()).toBe("2026-11-24T18:30:00.000Z");
    expect(new Date(bucketStart(Date.parse("2026-11-25T18:31:00Z"), "day")).toISOString()).toBe("2026-11-25T18:30:00.000Z");
  });

  it("projects days to quota only when it is known and growing", () => {
    expect(daysToQuota(100, 10, 200)).toBe(10);
    expect(daysToQuota(100, null, 200)).toBeNull();
    expect(daysToQuota(100, 10, null)).toBeNull();
    expect(daysToQuota(100, -5, 200)).toBeNull();
  });

  it("CSV escapes quotes, commas and newlines", () => {
    expect(toCsv([{ a: 'x,"y"', b: 1 }])).toBe('a,b\r\n"x,""y""",1');
  });
});
