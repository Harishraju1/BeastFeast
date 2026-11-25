/**
 * Turns the database's cumulative counters (captured every 5 minutes into monitoring_snapshots) into
 * per-hour or per-day figures for the admin dashboard. Everything here is derived from real snapshots:
 * nothing is interpolated or estimated. When PostgreSQL's statistics are reset (restart, stats reset,
 * statement-table eviction) a counter goes backwards; that interval is skipped for that counter instead of
 * being counted as negative or as a huge jump.
 */
export interface Snapshot {
  at: string;
  stats_reset: string | null;
  xact_commit: number | null;
  xact_rollback: number | null;
  tup_returned: number | null;
  tup_fetched: number | null;
  tup_inserted: number | null;
  tup_updated: number | null;
  tup_deleted: number | null;
  db_size_bytes: number | null;
  connections: number | null;
  active_connections: number | null;
  idle_connections: number | null;
  max_connections: number | null;
  app_calls: number | null;
  app_read_calls: number | null;
  app_write_calls: number | null;
  app_exec_ms: number | null;
  app_slow_calls: number | null;
}

export type BucketSize = "hour" | "day";

export interface Point {
  /** bucket start (UTC instant) */
  start: number;
  label: string;
  statements: number;
  reads: number;
  writes: number;
  execMs: number;
  slowStatements: number;
  commits: number;
  rollbacks: number;
  rowsWritten: number;
  rowsRead: number;
  /** last database size seen in the bucket */
  sizeBytes: number | null;
  /** highest connection count seen in the bucket */
  connectionsPeak: number | null;
  intervals: number;
  resets: number;
}

const IST_MS = 5.5 * 3600e3;
const SIZE_MS: Record<BucketSize, number> = { hour: 3600e3, day: 86400e3 };

/** Start of the IST hour / day containing `t`, as a UTC instant. */
export function bucketStart(t: number, size: BucketSize): number {
  return Math.floor((t + IST_MS) / SIZE_MS[size]) * SIZE_MS[size] - IST_MS;
}

export function bucketLabel(start: number, size: BucketSize): string {
  const d = new Date(start + IST_MS);
  const dd = `${String(d.getUTCDate()).padStart(2, "0")} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
  return size === "day" ? dd : `${dd} ${String(d.getUTCHours()).padStart(2, "0")}:00`;
}

type Counter = "app_calls" | "app_read_calls" | "app_write_calls" | "app_exec_ms" | "app_slow_calls" | "xact_commit" | "xact_rollback" | "tup_inserted" | "tup_updated" | "tup_deleted" | "tup_returned" | "tup_fetched";

function delta(cur: Snapshot, prev: Snapshot, k: Counter): number | null {
  const a = cur[k], b = prev[k];
  if (a == null || b == null) return null;
  const d = Number(a) - Number(b);
  return d < 0 ? null : d; // counter reset → skip this interval
}

export function toSeries(snaps: Snapshot[], size: BucketSize, from: number, to: number): Point[] {
  const sorted = [...snaps].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const points = new Map<number, Point>();
  // pre-create every bucket in the range so empty hours show as zero rather than disappearing
  for (let s = bucketStart(from, size); s <= to; s += SIZE_MS[size]) points.set(s, empty(s, size));
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i], prev = sorted[i - 1];
    const t = Date.parse(cur.at);
    if (t < from || t > to) continue;
    const p = points.get(bucketStart(t, size)) ?? empty(bucketStart(t, size), size);
    points.set(p.start, p);
    const reset = (cur.stats_reset ?? "") !== (prev.stats_reset ?? "");
    const add = (k: Counter) => (reset ? null : delta(cur, prev, k));
    const calls = add("app_calls");
    if (calls == null && cur.app_calls != null) p.resets++;
    p.statements += calls ?? 0;
    p.reads += add("app_read_calls") ?? 0;
    p.writes += add("app_write_calls") ?? 0;
    p.execMs += add("app_exec_ms") ?? 0;
    p.slowStatements += add("app_slow_calls") ?? 0;
    p.commits += add("xact_commit") ?? 0;
    p.rollbacks += add("xact_rollback") ?? 0;
    p.rowsWritten += (add("tup_inserted") ?? 0) + (add("tup_updated") ?? 0) + (add("tup_deleted") ?? 0);
    p.rowsRead += (add("tup_returned") ?? 0) + (add("tup_fetched") ?? 0);
    p.intervals++;
  }
  // gauges: every snapshot inside the bucket counts (including the first one)
  for (const s of sorted) {
    const t = Date.parse(s.at);
    if (t < from || t > to) continue;
    const p = points.get(bucketStart(t, size));
    if (!p) continue;
    if (s.db_size_bytes != null) p.sizeBytes = Number(s.db_size_bytes);
    if (s.connections != null) p.connectionsPeak = Math.max(p.connectionsPeak ?? 0, Number(s.connections));
  }
  return [...points.values()].sort((a, b) => a.start - b.start);
}

function empty(start: number, size: BucketSize): Point {
  return { start, label: bucketLabel(start, size), statements: 0, reads: 0, writes: 0, execMs: 0, slowStatements: 0, commits: 0, rollbacks: 0, rowsWritten: 0, rowsRead: 0, sizeBytes: null, connectionsPeak: null, intervals: 0, resets: 0 };
}

export interface Totals {
  statements: number;
  reads: number;
  writes: number;
  avgStatementMs: number | null;
  slowStatements: number;
  commits: number;
  rollbacks: number;
  rowsWritten: number;
  rowsRead: number;
  intervals: number;
  resets: number;
  /** bytes per day, from the first and last snapshot in range (null if under 1 hour of data) */
  growthBytesPerDay: number | null;
}

export function totals(points: Point[], snaps: Snapshot[], from: number, to: number): Totals {
  const sum = (k: keyof Point) => points.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  const inRange = snaps.filter((s) => s.db_size_bytes != null && Date.parse(s.at) >= from && Date.parse(s.at) <= to).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const first = inRange[0], last = inRange[inRange.length - 1];
  const spanMs = first && last ? Date.parse(last.at) - Date.parse(first.at) : 0;
  const statements = sum("statements");
  return {
    statements,
    reads: sum("reads"),
    writes: sum("writes"),
    avgStatementMs: statements > 0 ? sum("execMs") / statements : null,
    slowStatements: sum("slowStatements"),
    commits: sum("commits"),
    rollbacks: sum("rollbacks"),
    rowsWritten: sum("rowsWritten"),
    rowsRead: sum("rowsRead"),
    intervals: sum("intervals"),
    resets: sum("resets"),
    growthBytesPerDay: spanMs >= 3600e3 ? ((Number(last.db_size_bytes) - Number(first.db_size_bytes)) / spanMs) * 86400e3 : null,
  };
}

/** Days until `quotaBytes` at the measured growth rate; null when unknown or not growing. */
export function daysToQuota(sizeBytes: number | null, growthBytesPerDay: number | null, quotaBytes: number | null): number | null {
  if (sizeBytes == null || growthBytesPerDay == null || quotaBytes == null || growthBytesPerDay <= 0) return null;
  return Math.max(0, (quotaBytes - sizeBytes) / growthBytesPerDay);
}

/** RFC 4180 CSV. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}

export function formatBytes(b: number | null | undefined): string {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}
