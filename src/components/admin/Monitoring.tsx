"use client";
/**
 * DATABASE ANALYTICS & API MONITORING (admin dashboard tab).
 * Every number comes from the database's own statistics through role-checked admin_monitoring_* functions
 * (migrations 0013/0014). Things the database cannot measure are labelled unavailable, with where to look.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, RefreshCw, Table2 } from "lucide-react";
import { BACKEND_MODE, getBackend } from "@/lib/data";
import { daysToQuota, formatBytes, toCsv, toSeries, totals, type BucketSize, type Point, type Snapshot } from "@/lib/monitoring/series";
import { useApp } from "@/lib/store/app";
import { Badge, Button, Panel, Stat, Tabs } from "@/components/ui";

type Range = "today" | "7d" | "30d" | "90d" | "custom";
type Section = "database" | "api" | "email" | "usage";

interface Overview {
  now: string;
  db_size_bytes: number;
  connections: number;
  active_connections: number;
  idle_connections: number;
  connections_by_role: Record<string, number>;
  max_connections: number;
  longest_active_query_s: number;
  stats_reset: string | null;
  cache_hit_ratio: number | null;
  pg_stat_statements: boolean;
  snapshot_count: number;
  first_snapshot: string | null;
  capture_job: { schedule: string; active: boolean } | null;
  settings: Record<string, { value: number | null; note: string; updated_at: string }>;
  is_super_admin: boolean;
}
interface StatementRow { role: string; calls: number; total_ms: number; mean_ms: number; max_ms: number; rows_returned: number; kind: string; statement: string }
interface TableRow { table_name: string; live_rows: number; total_bytes: number; seq_scans: number; index_scans: number; inserts: number; updates: number; deletes: number }
interface UsageRow { user_id: string; name: string; role: string; projects: number; project_bytes: number; last_saved: string | null }
interface EmailRow { day: string; kind: string; emails: number; source: string }
interface JobRow { job: string; schedule: string; active: boolean; runs: number; succeeded: number; failed: number; avg_ms: number | null; max_ms: number | null; last_run: string | null; last_status: string | null; last_message: string | null }
interface LimitRow { day: string; bucket: string; requests: number; windows_limited: number }

const IST_MS = 5.5 * 3600e3;
const istMidnight = (t: number) => Math.floor((t + IST_MS) / 86400e3) * 86400e3 - IST_MS;
const fmtN = (n: number | null | undefined, d = 0) => (n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d }));
const fmtTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—");
const isoDay = (t: number) => new Date(t + IST_MS).toISOString().slice(0, 10);

async function rpc<T>(fn: `admin_monitoring_${string}`, args: Record<string, unknown> = {}): Promise<T> {
  const be = (await getBackend()) as unknown as { mode: string; monitoringRpc?: <R>(f: string, a: Record<string, unknown>) => Promise<R> };
  if (be.mode !== "supabase" || !be.monitoringRpc) throw new Error("Monitoring needs the cloud database (not available in local mode).");
  return be.monitoringRpc<T>(fn, args);
}

function download(name: string, rows: Record<string, unknown>[]) {
  const csv = toCsv(rows);
  if (!csv) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ───────────────────────────── chart (single series) ─────────────────────────────
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

function Chart({ title, data, kind, format, empty }: { title: string; data: { label: string; v: number | null }[]; kind: "bar" | "line"; format: (v: number) => string; empty?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 170, L = 52, R = 8, T = 10, B = 24;
  const vals = data.map((d) => d.v).filter((v): v is number => v != null);
  const max = niceMax(Math.max(0, ...vals));
  const plotW = w - L - R, plotH = H - T - B;
  const step = data.length ? plotW / data.length : plotW;
  const x = (i: number) => L + i * step;
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 90))));
  const hasData = vals.some((v) => v > 0) || (kind === "line" && vals.length > 0);
  const bar = (i: number, v: number) => {
    const bw = Math.max(1, step - 2), bx = x(i) + 1, base = T + plotH, top = y(v), h = base - top;
    if (h <= 0) return null;
    const r = Math.min(4, bw / 2, h);
    return <path key={i} d={`M${bx},${base}V${top + r}Q${bx},${top} ${bx + r},${top}H${bx + bw - r}Q${bx + bw},${top} ${bx + bw},${top + r}V${base}Z`} fill="var(--color-brand)" opacity={hover == null || hover === i ? 1 : 0.55} />;
  };
  const line = () => {
    const segs: string[] = [];
    let cur = "";
    data.forEach((d, i) => {
      if (d.v == null) {
        if (cur) segs.push(cur);
        cur = "";
        return;
      }
      cur += `${cur ? "L" : "M"}${x(i) + step / 2},${y(d.v)}`;
    });
    if (cur) segs.push(cur);
    return segs.map((s, i) => <path key={i} d={s} fill="none" stroke="var(--color-brand)" strokeWidth={2} strokeLinejoin="round" />);
  };
  return (
    <Panel title={title} actions={<Button size="sm" variant="ghost" onClick={() => setTable(!table)} aria-pressed={table} title="Show as a table"><Table2 size={13} /> {table ? "Chart" : "Table"}</Button>}>
      <div ref={ref} className="relative">
        {!hasData ? (
          <div className="flex h-[170px] items-center justify-center text-sm text-muted">{empty ?? "No measurements in this range yet."}</div>
        ) : table ? (
          <div className="max-h-[170px] overflow-auto text-xs">
            <table className="w-full"><tbody>{data.map((d) => <tr key={d.label} className="border-t border-line/60"><td className="py-0.5">{d.label}</td><td className="text-right font-mono">{d.v == null ? "—" : format(d.v)}</td></tr>)}</tbody></table>
          </div>
        ) : (
          <>
            <svg width={w} height={H} role="img" aria-label={`${title}: ${vals.length} values, highest ${format(Math.max(...vals))}`} onMouseLeave={() => setHover(null)}>
              {[0, 0.5, 1].map((f) => (
                <g key={f}>
                  <line x1={L} x2={w - R} y1={y(max * f)} y2={y(max * f)} stroke="var(--color-line)" strokeWidth={1} />
                  <text x={L - 6} y={y(max * f) + 3} textAnchor="end" fontSize={10} fill="var(--color-dim)">{format(max * f)}</text>
                </g>
              ))}
              {kind === "bar" ? data.map((d, i) => (d.v ? bar(i, d.v) : null)) : line()}
              {kind === "line" && hover != null && data[hover]?.v != null && (
                <g>
                  <line x1={x(hover) + step / 2} x2={x(hover) + step / 2} y1={T} y2={T + plotH} stroke="var(--color-line2)" />
                  <circle cx={x(hover) + step / 2} cy={y(data[hover].v!)} r={4} fill="var(--color-brand)" stroke="var(--color-panel)" strokeWidth={2} />
                </g>
              )}
              {data.map((d, i) => (i % labelEvery === 0 ? <text key={`l${i}`} x={x(i) + step / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--color-dim)">{d.label}</text> : null))}
              {data.map((d, i) => <rect key={`h${i}`} x={x(i)} y={T} width={step} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />)}
            </svg>
            {hover != null && data[hover] && (
              <div className="pointer-events-none absolute top-0 rounded border border-line2 bg-panel px-2 py-1 text-xs shadow" style={{ left: Math.min(w - 150, Math.max(0, x(hover) + step / 2 - 70)) }}>
                <div className="text-dim">{data[hover].label}</div>
                <div className="font-mono text-text">{data[hover].v == null ? "no data" : format(data[hover].v!)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

function Unavailable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line2 p-3 text-sm">
      <div className="mb-0.5 flex items-center gap-1.5 font-semibold"><Badge>unavailable</Badge> {title}</div>
      <div className="text-xs text-muted">{children}</div>
    </div>
  );
}

function Failed({ what, error }: { what: string; error: string }) {
  return <div className="flex gap-2 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-bad" /> {what} could not be loaded: {error}</div>;
}

// ───────────────────────────── main ─────────────────────────────
export function Monitoring() {
  const me = useApp((s) => s.user);
  const toast = useApp((s) => s.toast);
  const [range, setRange] = useState<Range>("7d");
  const [custom, setCustom] = useState(() => ({ from: isoDay(Date.now() - 7 * 86400e3), to: isoDay(Date.now()) }));
  const [section, setSection] = useState<Section>("database");
  const [ov, setOv] = useState<Overview | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emails, setEmails] = useState<EmailRow[] | null>(null);
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [limits, setLimits] = useState<LimitRow[] | null>(null);
  const [statements, setStatements] = useState<StatementRow[] | null>(null);
  const [stmtOrder, setStmtOrder] = useState<"total" | "mean" | "calls" | "max">("total");
  const [tables, setTables] = useState<TableRow[] | null>(null);
  const [usage, setUsage] = useState<UsageRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  /** "now" for the selected range; moves forward only on refresh, so renders stay pure */
  const [nowTs, setNowTs] = useState(() => Date.now());
  const refresh = () => {
    setLoading(true);
    setNowTs(Date.now());
  };
  const [autoRefresh, setAutoRefresh] = useState(true);
  const isSuper = me?.role === "super_admin";

  const window_ = useMemo(() => {
    const now = nowTs;
    if (range === "today") return { from: istMidnight(now), to: now, bucket: "hour" as BucketSize };
    if (range === "custom") {
      const from = Date.parse(`${custom.from}T00:00:00+05:30`), to = Math.min(now, Date.parse(`${custom.to}T23:59:59+05:30`));
      return { from, to, bucket: (to - from > 7 * 86400e3 ? "day" : "hour") as BucketSize };
    }
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    return { from: now - days * 86400e3, to: now, bucket: (days > 7 ? "day" : "hour") as BucketSize };
  }, [range, custom, nowTs]);

  // fetch only what the visible section needs (no full-dashboard refresh storms); results are applied by the
  // effect below, and a response for an outdated range is dropped
  useEffect(() => {
    if (BACKEND_MODE !== "supabase") return;
    let cancelled = false;
    const fromIso = new Date(window_.from).toISOString(), toIso = new Date(window_.to).toISOString();
    const want: [string, Promise<unknown>][] = [
      ["overview", rpc<Overview>("admin_monitoring_overview")],
      ["series", rpc<Snapshot[]>("admin_monitoring_series", { p_from: fromIso, p_to: toIso })],
    ];
    if (section === "email") want.push(["emails", rpc<EmailRow[]>("admin_monitoring_emails", { p_from: fromIso, p_to: toIso })]);
    if (section === "api") {
      want.push(["jobs", rpc<JobRow[]>("admin_monitoring_jobs", { p_from: fromIso, p_to: toIso })]);
      want.push(["limits", rpc<LimitRow[]>("admin_monitoring_rate_limits", { p_from: isoDay(window_.from), p_to: isoDay(window_.to) })]);
      if (isSuper) want.push(["statements", rpc<StatementRow[]>("admin_monitoring_statements", { p_order: stmtOrder, p_limit: 25 })]);
    }
    if (section === "usage" && isSuper) {
      want.push(["tables", rpc<TableRow[]>("admin_monitoring_tables")]);
      want.push(["usage", rpc<UsageRow[]>("admin_monitoring_usage_by_user", { p_limit: 200 })]);
    }
    void Promise.allSettled(want.map(([, p]) => p)).then((res) => {
      if (cancelled) return;
      const err: Record<string, string> = {};
      res.forEach((r, i) => {
        const key = want[i][0];
        if (r.status === "rejected") {
          err[key] = (r.reason as Error).message;
          return;
        }
        const v = r.value;
        if (key === "overview") setOv(v as Overview);
        else if (key === "series") setSnaps((v as Snapshot[] | null) ?? []);
        else if (key === "emails") setEmails(v as EmailRow[]);
        else if (key === "jobs") setJobs(v as JobRow[]);
        else if (key === "limits") setLimits(v as LimitRow[]);
        else if (key === "statements") setStatements(v as StatementRow[]);
        else if (key === "tables") setTables(v as TableRow[]);
        else if (key === "usage") setUsage(v as UsageRow[]);
      });
      setErrors(err);
      setLoading(false);
      setUpdatedAt(Date.now());
    });
    return () => {
      cancelled = true;
    };
  }, [window_.from, window_.to, section, isSuper, stmtOrder]);

  // auto-refresh at the configured interval, paused while the tab is hidden
  const refreshS = Number(ov?.settings?.refresh_seconds?.value ?? 60);
  useEffect(() => {
    if (!autoRefresh || !refreshS) return;
    const t = setInterval(() => {
      if (!document.hidden) setNowTs(Date.now());
    }, Math.max(15, refreshS) * 1000);
    return () => clearInterval(t);
  }, [autoRefresh, refreshS]);

  const points = useMemo(() => toSeries(snaps, window_.bucket, window_.from, window_.to), [snaps, window_]);
  const t = useMemo(() => totals(points, snaps, window_.from, window_.to), [points, snaps, window_]);

  if (BACKEND_MODE !== "supabase") return <Panel title="Database analytics & API monitoring"><p className="text-sm text-muted">Monitoring needs the cloud database; it is not available in local mode.</p></Panel>;

  const quotaMb = ov?.settings?.plan_db_quota_mb?.value ?? null;
  const quotaBytes = quotaMb != null ? quotaMb * 1024 * 1024 : null;
  const unit = window_.bucket === "hour" ? "hour" : "day";
  const series = (k: keyof Point) => points.map((p) => ({ label: p.label, v: p.intervals > 0 || k === "sizeBytes" || k === "connectionsPeak" ? (p[k] as number | null) : null }));
  const readPct = t.statements ? Math.round((t.reads / t.statements) * 100) : null;
  const emailTotals = (emails ?? []).reduce<Record<string, Record<string, number>>>((a, r) => ((a[r.kind] ??= {})[r.source] = (a[r.kind]?.[r.source] ?? 0) + Number(r.emails), a), {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">DATABASE ANALYTICS &amp; API MONITORING</h2>
          <p className="text-xs text-muted">Measured by the database itself every 5 minutes{ov?.first_snapshot ? ` since ${fmtTime(ov.first_snapshot)}` : ""}. Times in IST. Nothing here is simulated.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <div className="flex overflow-hidden rounded-md border border-line2" role="group" aria-label="Date range">
            {(["today", "7d", "30d", "90d", "custom"] as Range[]).map((r) => (
              <button key={r} onClick={() => setRange(r)} aria-pressed={range === r} className={`px-2.5 py-1.5 text-xs ${range === r ? "bg-accent text-white" : "text-muted hover:text-text"}`}>{r === "today" ? "Today" : r === "custom" ? "Custom" : `Last ${r.replace("d", " days")}`}</button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex items-end gap-1 text-xs">
              <input type="date" className="bf-input h-8 py-0 text-xs" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" />
              <span className="pb-2 text-dim">to</span>
              <input type="date" className="bf-input h-8 py-0 text-xs" value={custom.to} min={custom.from} max={isoDay(nowTs)} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" />
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> Auto-refresh {refreshS ? `(${refreshS}s)` : "(off in settings)"}</label>
          <Button size="sm" onClick={refresh} disabled={loading}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh</Button>
        </div>
      </div>

      <Tabs value={section} onChange={setSection} items={[{ value: "database", label: "Database" }, { value: "api", label: "API, jobs & limits" }, { value: "email", label: "Email" }, { value: "usage", label: "Usage & cost" }]} />
      {errors.overview && <Failed what="Live database status" error={errors.overview} />}
      {errors.series && <Failed what="Measurements" error={errors.series} />}

      {section === "database" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Database statements" value={fmtN(t.statements)} sub={`app requests in range · ${readPct ?? "—"}% reads`} />
            <Stat label="Reads / writes" value={`${fmtN(t.reads)} / ${fmtN(t.writes)}`} sub="classified from statement text" />
            <Stat label="Avg statement time" value={t.avgStatementMs == null ? "—" : `${t.avgStatementMs.toFixed(2)} ms`} sub={`slow statements: ${fmtN(t.slowStatements)} (≥ ${fmtN(ov?.settings?.slow_query_ms?.value)} ms avg)`} />
            <Stat label="Failed / rolled back" value={fmtN(t.rollbacks)} sub={`of ${fmtN(t.commits + t.rollbacks)} transactions (${t.commits + t.rollbacks ? ((t.rollbacks / (t.commits + t.rollbacks)) * 100).toFixed(2) : "0"}%)`} />
            <Stat label="Database size" value={formatBytes(ov?.db_size_bytes)} sub={quotaBytes ? `${((ov!.db_size_bytes / quotaBytes) * 100).toFixed(1)}% of the ${fmtN(quotaMb)} MB plan quota` : "plan quota not set (Usage & cost)"} />
            <Stat label="Connections now" value={ov ? `${ov.connections} / ${ov.max_connections}` : "—"} sub={ov ? `${ov.active_connections} active · ${ov.idle_connections} idle · pool ${((ov.connections / ov.max_connections) * 100).toFixed(0)}% used` : ""} />
            <Stat label="Cache hit ratio" value={ov?.cache_hit_ratio == null ? "—" : `${(ov.cache_hit_ratio * 100).toFixed(2)}%`} sub="share of reads served from memory" />
            <Stat label="Availability" value={errors.overview ? "unreachable" : ov ? "online" : "—"} sub={ov ? `longest running query ${ov.longest_active_query_s.toFixed(1)} s` : ""} />
          </div>
          {t.resets > 0 && <p className="text-xs text-warn">The database statistics were reset {t.resets} time(s) in this range (restart or maintenance); those 5-minute intervals are left out rather than guessed.</p>}
          {ov && !ov.pg_stat_statements && <Unavailable title="Statement counts">The statement statistics extension is not enabled, so statement counts and timings are unavailable. Transactions and rows are still measured.</Unavailable>}
          <div className="grid gap-4 lg:grid-cols-2">
            <Chart title={`Database statements per ${unit}`} data={series("statements")} kind="bar" format={(v) => fmtN(v)} />
            <Chart title={`Rows written per ${unit} (insert + update + delete)`} data={series("rowsWritten")} kind="bar" format={(v) => fmtN(v)} />
            <Chart title="Database size" data={series("sizeBytes")} kind="line" format={(v) => formatBytes(v)} />
            <Chart title={`Peak connections per ${unit}`} data={series("connectionsPeak")} kind="line" format={(v) => fmtN(v)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => download("db-activity", points.map((p) => ({ period_start_ist: p.label, statements: p.statements, reads: p.reads, writes: p.writes, avg_ms: p.statements ? (p.execMs / p.statements).toFixed(3) : "", slow_statements: p.slowStatements, commits: p.commits, rollbacks: p.rollbacks, rows_written: p.rowsWritten, rows_read: p.rowsRead, db_size_bytes: p.sizeBytes ?? "", peak_connections: p.connectionsPeak ?? "", measured_intervals: p.intervals })))}><Download size={13} /> CSV</Button>
            {ov && <span className="text-xs text-dim">Connections by role: {Object.entries(ov.connections_by_role).map(([k, v]) => `${k} ${v}`).join(" · ")}</span>}
          </div>
        </>
      )}

      {section === "api" && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Unavailable title="HTTP status codes and requests per page / route">Pages and the /api routes run on the hosting platform; their request counts, status codes (200/4xx/429/5xx) and response times are in its dashboard (Vercel → Observability). The app does not duplicate them here.</Unavailable>
            <Unavailable title="Background queue">There is no background job queue: sign-up and password-reset emails are sent by the sign-in service itself. Scheduled jobs are listed below.</Unavailable>
          </div>
          {errors.limits ? <Failed what="Rate limits" error={errors.limits} /> : (
            <Panel title="Rate limits reached (per user or IP, all servers share one counter)" actions={<Button size="sm" onClick={() => download("rate-limits", (limits ?? []) as unknown as Record<string, unknown>[])}><Download size={13} /> CSV</Button>} bodyClass="p-0 overflow-x-auto">
              {!limits?.length ? <p className="p-4 text-sm text-muted">No rate-limited activity recorded in this range.</p> : (
                <table className="w-full text-sm">
                  <thead className="bg-bg2"><tr className="bf-label text-left"><th className="px-3 py-2">Day</th><th className="px-3 py-2">Limit</th><th className="px-3 py-2 text-right">Requests counted</th><th className="px-3 py-2 text-right">Times the limit was hit</th></tr></thead>
                  <tbody>{limits.map((r) => <tr key={r.day + r.bucket} className="border-t border-line"><td className="px-3 py-1.5">{r.day}</td><td className="px-3 py-1.5 font-mono">{r.bucket}</td><td className="px-3 py-1.5 text-right font-mono">{fmtN(r.requests)}</td><td className={`px-3 py-1.5 text-right font-mono ${r.windows_limited ? "text-warn" : ""}`}>{fmtN(r.windows_limited)}</td></tr>)}</tbody>
                </table>
              )}
              <p className="px-3 pb-3 pt-2 text-xs text-dim">Limits: quizzes 30 / 10 min, lessons 60 / 10 min, XP 120 / 10 min, profile details 20 / hour, picture uploads 10 / hour, NIAT checks 30 / 10 min. Sign-in, sign-up and email limits are enforced by the sign-in service.</p>
            </Panel>
          )}
          {isSuper ? (errors.statements ? <Failed what="Statement report" error={errors.statements} /> : (
            <Panel title="Database activity by operation (what the app asks the database to do)" actions={<div className="flex gap-2"><select className="bf-input h-8 py-0 text-xs" value={stmtOrder} onChange={(e) => setStmtOrder(e.target.value as typeof stmtOrder)} aria-label="Sort by"><option value="total">Most total time</option><option value="calls">Most calls</option><option value="mean">Slowest on average</option><option value="max">Slowest single run</option></select><Button size="sm" onClick={() => download("db-operations", (statements ?? []) as unknown as Record<string, unknown>[])}><Download size={13} /> CSV</Button></div>} bodyClass="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-bg2"><tr className="bf-label text-left"><th className="px-3 py-2">Operation (values hidden)</th><th className="px-3 py-2">Caller</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Calls</th><th className="px-3 py-2 text-right">Avg ms</th><th className="px-3 py-2 text-right">Max ms</th><th className="px-3 py-2 text-right">Total s</th></tr></thead>
                <tbody>{(statements ?? []).map((s, i) => <tr key={i} className="border-t border-line align-top"><td className="max-w-[520px] px-3 py-1.5 font-mono text-[10.5px] text-muted"><div className="line-clamp-2" title={s.statement}>{s.statement}</div></td><td className="px-3 py-1.5">{s.role === "anon" ? "visitor" : s.role === "authenticated" ? "signed-in user" : "server"}</td><td className="px-3 py-1.5">{s.kind}</td><td className="px-3 py-1.5 text-right font-mono">{fmtN(s.calls)}</td><td className={`px-3 py-1.5 text-right font-mono ${s.mean_ms >= Number(ov?.settings?.slow_query_ms?.value ?? 200) ? "text-warn" : ""}`}>{fmtN(s.mean_ms, 2)}</td><td className="px-3 py-1.5 text-right font-mono">{fmtN(s.max_ms, 1)}</td><td className="px-3 py-1.5 text-right font-mono">{fmtN(s.total_ms / 1000, 1)}</td></tr>)}</tbody>
              </table>
              <p className="px-3 pb-3 pt-2 text-xs text-dim">Since the statistics were last reset ({fmtTime(ov?.stats_reset)}). Values in statements are replaced by $1, $2… by the database, so no student data appears here.</p>
            </Panel>
          )) : <Unavailable title="Per-operation database report">Visible to super admins only.</Unavailable>}
          {errors.jobs ? <Failed what="Scheduled jobs" error={errors.jobs} /> : (
            <Panel title="Scheduled jobs (run inside the database)" bodyClass="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg2"><tr className="bf-label text-left"><th className="px-3 py-2">Job</th><th className="px-3 py-2">Schedule (UTC)</th><th className="px-3 py-2 text-right">Runs</th><th className="px-3 py-2 text-right">Failed</th><th className="px-3 py-2 text-right">Avg / max ms</th><th className="px-3 py-2">Last run</th></tr></thead>
                <tbody>{(jobs ?? []).map((j) => <tr key={j.job} className="border-t border-line align-top"><td className="px-3 py-1.5 font-mono text-xs">{j.job}{!j.active && <Badge tone="warn">paused</Badge>}</td><td className="px-3 py-1.5 font-mono text-xs">{j.schedule}</td><td className="px-3 py-1.5 text-right font-mono">{fmtN(j.runs)}</td><td className={`px-3 py-1.5 text-right font-mono ${j.failed ? "text-bad" : ""}`}>{fmtN(j.failed)}</td><td className="px-3 py-1.5 text-right font-mono">{fmtN(j.avg_ms, 1)} / {fmtN(j.max_ms, 1)}</td><td className="px-3 py-1.5 text-xs">{fmtTime(j.last_run)} {j.last_status && <Badge tone={j.last_status === "succeeded" ? "ok" : "bad"}>{j.last_status}</Badge>}{j.last_message && <div className="text-bad">{j.last_message}</div>}</td></tr>)}</tbody>
              </table>
            </Panel>
          )}
        </>
      )}

      {section === "email" && (
        <>
          {errors.emails && <Failed what="Email counts" error={errors.emails} />}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Verification emails" value={fmtN(emailTotals.verification?.["last email per account"] ?? 0)} sub="at least (latest per account)" />
            <Stat label="Password-reset emails" value={fmtN(emailTotals["password reset"]?.["last email per account"] ?? 0)} sub="at least (latest per account)" />
            <Stat label="Audit-log email events" value={fmtN(Object.values(emailTotals).reduce((a, k) => a + (k["audit log"] ?? 0), 0))} sub="0 when the sign-in service keeps its log outside the database" />
            <Stat label="Duplicate sends prevented" value="—" sub="enforced by the sign-in service (per-address cooldown); not reported back" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Unavailable title="Provider rate-limit errors, failures and delivery time">The sign-in service sends these emails and keeps its errors in its own logs (Supabase → Logs → Auth; rate-limit errors appear as over_email_send_rate_limit). They are not visible to the app.</Unavailable>
            <Unavailable title="Email allowance">With the built-in mailer the whole site can send 2 emails per hour. Connect a custom SMTP provider (Authentication → Emails → SMTP) and then raise the limit under Authentication → Rate Limits.</Unavailable>
          </div>
          <Panel title="Emails by day" actions={<Button size="sm" onClick={() => download("emails", (emails ?? []) as unknown as Record<string, unknown>[])}><Download size={13} /> CSV</Button>} bodyClass="p-0 overflow-x-auto">
            {!emails?.length ? <p className="p-4 text-sm text-muted">No emails recorded in this range.</p> : (
              <table className="w-full text-sm">
                <thead className="bg-bg2"><tr className="bf-label text-left"><th className="px-3 py-2">Day (IST)</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Emails</th><th className="px-3 py-2">Source</th></tr></thead>
                <tbody>{emails.map((r, i) => <tr key={i} className="border-t border-line"><td className="px-3 py-1.5">{r.day}</td><td className="px-3 py-1.5">{r.kind}</td><td className="px-3 py-1.5 text-right font-mono">{fmtN(Number(r.emails))}</td><td className="px-3 py-1.5 text-xs text-dim">{r.source}</td></tr>)}</tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {section === "usage" && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Panel title="1 · Provider-reported usage">
              <Unavailable title="Not connected">The provider&apos;s own usage and billing figures need a management access token, which is not configured. Until then, read them in Supabase → Organization → Usage. Nothing is estimated in their place.</Unavailable>
            </Panel>
            <Panel title="2 · Measured by the app (this range)">
              <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                <dt className="text-dim">Database statements</dt><dd className="font-mono">{fmtN(t.statements)}</dd>
                <dt className="text-dim">Reads / writes</dt><dd className="font-mono">{fmtN(t.reads)} / {fmtN(t.writes)}</dd>
                <dt className="text-dim">Rows written</dt><dd className="font-mono">{fmtN(t.rowsWritten)}</dd>
                <dt className="text-dim">Database size now</dt><dd className="font-mono">{formatBytes(ov?.db_size_bytes)}</dd>
                <dt className="text-dim">Growth per day</dt><dd className="font-mono">{t.growthBytesPerDay == null ? "need ≥ 1 h of data" : formatBytes(t.growthBytesPerDay)}</dd>
                <dt className="text-dim">Size in 30 days at this rate</dt><dd className="font-mono">{t.growthBytesPerDay == null || !ov ? "—" : formatBytes(ov.db_size_bytes + Math.max(0, t.growthBytesPerDay) * 30)}</dd>
              </dl>
              <p className="mt-2 text-xs text-dim">Statements are not all equal in cost; these are counts, not a bill.</p>
            </Panel>
            <Panel title="3 · Estimates from your plan">
              {quotaBytes == null && ov?.settings?.plan_monthly_cost?.value == null ? (
                <p className="text-sm text-muted">No plan details entered, so no estimate is shown. A super admin can enter the plan&apos;s database quota and monthly price below.</p>
              ) : (
                <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                  <dt className="text-dim">Plan quota (entered)</dt><dd className="font-mono">{quotaMb == null ? "not set" : `${fmtN(quotaMb)} MB`}</dd>
                  <dt className="text-dim">Used</dt><dd className="font-mono">{quotaBytes && ov ? `${((ov.db_size_bytes / quotaBytes) * 100).toFixed(1)}%` : "—"}</dd>
                  <dt className="text-dim">Days until full at this rate</dt><dd className="font-mono">{(() => { const d = daysToQuota(ov?.db_size_bytes ?? null, t.growthBytesPerDay, quotaBytes); return d == null ? "not growing / unknown" : fmtN(d); })()}</dd>
                  <dt className="text-dim">Plan price (entered)</dt><dd className="font-mono">{ov?.settings?.plan_monthly_cost?.value == null ? "not set" : `${fmtN(ov.settings.plan_monthly_cost.value, 2)} / month`}</dd>
                </dl>
              )}
            </Panel>
          </div>
          {isSuper ? (
            <>
              <SettingsEditor ov={ov} onSaved={() => { toast("success", "Monitoring setting saved."); refresh(); }} />
              {errors.usage ? <Failed what="Usage by member" error={errors.usage} /> : (
                <Panel title="Stored project data by member" actions={<Button size="sm" onClick={() => download("usage-by-member", (usage ?? []).map((u) => ({ name: u.name, role: u.role, projects: u.projects, project_bytes: u.project_bytes, last_saved: u.last_saved ?? "" })))}><Download size={13} /> CSV</Button>} bodyClass="max-h-[360px] overflow-auto p-0">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-bg2"><tr className="bf-label text-left"><th className="px-3 py-2">Member</th><th className="px-3 py-2">Role</th><th className="px-3 py-2 text-right">Projects</th><th className="px-3 py-2 text-right">Stored</th><th className="px-3 py-2">Last saved</th></tr></thead>
                    <tbody>{(usage ?? []).map((u) => <tr key={u.user_id} className="border-t border-line"><td className="px-3 py-1.5">{u.name}</td><td className="px-3 py-1.5 text-xs">{u.role}</td><td className="px-3 py-1.5 text-right font-mono">{u.projects}</td><td className="px-3 py-1.5 text-right font-mono">{formatBytes(Number(u.project_bytes))}</td><td className="px-3 py-1.5 text-xs">{fmtTime(u.last_saved)}</td></tr>)}</tbody>
                  </table>
                </Panel>
              )}
              {errors.tables ? <Failed what="Tables" error={errors.tables} /> : (
                <Panel title="Tables" actions={<Button size="sm" onClick={() => download("tables", (tables ?? []) as unknown as Record<string, unknown>[])}><Download size={13} /> CSV</Button>} bodyClass="max-h-[360px] overflow-auto p-0">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-bg2"><tr className="bf-label text-left"><th className="px-3 py-2">Table</th><th className="px-3 py-2 text-right">Rows</th><th className="px-3 py-2 text-right">Size</th><th className="px-3 py-2 text-right">Full scans</th><th className="px-3 py-2 text-right">Index scans</th><th className="px-3 py-2 text-right">Ins / upd / del</th></tr></thead>
                    <tbody>{(tables ?? []).map((r) => <tr key={r.table_name} className="border-t border-line"><td className="px-3 py-1 font-mono">{r.table_name}</td><td className="px-3 py-1 text-right font-mono">{fmtN(Number(r.live_rows))}</td><td className="px-3 py-1 text-right font-mono">{formatBytes(Number(r.total_bytes))}</td><td className="px-3 py-1 text-right font-mono">{fmtN(Number(r.seq_scans))}</td><td className="px-3 py-1 text-right font-mono">{fmtN(Number(r.index_scans))}</td><td className="px-3 py-1 text-right font-mono">{fmtN(Number(r.inserts))} / {fmtN(Number(r.updates))} / {fmtN(Number(r.deletes))}</td></tr>)}</tbody>
                  </table>
                </Panel>
              )}
            </>
          ) : <Unavailable title="Usage by member, tables and settings">Visible to super admins only.</Unavailable>}
        </>
      )}
      {updatedAt && <p className="text-right text-[11px] text-dim">Updated {new Date(updatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>}
    </div>
  );
}

const SETTING_LABELS: Record<string, string> = { slow_query_ms: "Slow statement threshold (ms)", refresh_seconds: "Dashboard auto-refresh (s, 0 = off)", plan_db_quota_mb: "Plan database quota (MB)", plan_monthly_cost: "Plan price per month" };

function SettingsEditor({ ov, onSaved }: { ov: Overview | null; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!ov) return null;
  const save = async (key: string) => {
    const raw = (vals[key] ?? "").trim();
    setBusy(key);
    setErr(null);
    try {
      await rpc("admin_monitoring_set", { p_key: key, p_value: raw === "" ? null : Number(raw) });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title="Monitoring settings (super admin; changes record who and when)">
      <div className="grid gap-3 md:grid-cols-4">
        {Object.keys(SETTING_LABELS).map((k) => (
          <label key={k} className="flex flex-col gap-1 text-xs text-dim">
            {SETTING_LABELS[k]}
            <div className="flex gap-1">
              <input className="bf-input h-8 py-0 text-xs" inputMode="decimal" placeholder={ov.settings[k]?.value == null ? "not set" : String(ov.settings[k].value)} value={vals[k] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} />
              <Button size="sm" disabled={busy === k || vals[k] === undefined} onClick={() => void save(k)}>Save</Button>
            </div>
            <span className="text-[10px]">{ov.settings[k]?.note}</span>
          </label>
        ))}
      </div>
      {err && <p className="mt-2 text-sm text-bad">{err}</p>}
    </Panel>
  );
}
