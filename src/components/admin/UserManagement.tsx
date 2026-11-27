"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, IdCard, Loader2, Mail, Phone, Search, X } from "lucide-react";
import { getBackend } from "@/lib/data";
import type { AccountStatus, AdminUserQuery, AdminUserRow, NiatReviewIssue, NiatReviewRow, RankEvent, XpEvent } from "@/lib/data/types";
import type { Profile } from "@/lib/types";
import { Badge, Button, Panel } from "@/components/ui";
import { Avatar } from "@/components/profile/Avatar";
import { RankBadge } from "@/components/ranks/RankBadge";
import { RANKS, rankByLevel } from "@/lib/ranks";
import { ROLE_LABEL } from "@/lib/roles";
import { CAMPUS_PLACEHOLDER, campusError, formatIndianMobile, niatIdError, normalizeNiatId } from "@/lib/validation";
import { describeXp } from "@/components/xp/XpHistory";

const PAGE = 20;
const STATUS_LABEL: Record<AccountStatus, string> = { active: "Active", unconfirmed: "Email not confirmed", suspended: "Suspended" };
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—");
const ISSUE_LABEL: Record<NiatReviewIssue, string> = {
  missing: "No NIAT ID on record",
  "legacy-invalid": "Earlier ID is not in the NIAT format",
  "legacy-duplicate": "Earlier ID is already used by another account",
  "legacy-unclaimed": "Earlier ID looks valid but is not confirmed",
  "campus-missing": "No campus name",
};

/** One CSV cell; values that a spreadsheet would run as a formula are prefixed with an apostrophe. */
function csvCell(v: unknown): string {
  let t = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/**
 * Admin → User Management. Contact details come from admin_list_users(), which checks the caller is an
 * administrator in the database; students cannot call it and cannot read profile_private.
 */
export function UserManagement() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Profile["role"] | "">("");
  const [status, setStatus] = useState<AccountStatus | "">("");
  const [rank, setRank] = useState<string>("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<AdminUserRow | null>(null);
  const [campus, setCampus] = useState("");
  const [campuses, setCampuses] = useState<{ campus: string; students: number }[]>([]);
  const [exporting, setExporting] = useState(false);
  const [review, setReview] = useState<NiatReviewRow[] | null>(null);
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    void getBackend()
      .then((b) => Promise.all([b.adminCampuses().catch(() => []), b.adminNiatReview().catch(() => null)]))
      .then(([c, r]) => {
        setCampuses(c);
        setReview(r);
      });
  }, []);

  // search as you type, but not on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const lvl = rank ? Number(rank) : null;
      const r = await (await getBackend()).adminListUsers({ search, role, status, minRank: lvl, maxRank: lvl, campus, limit: PAGE, offset: page * PAGE });
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, role, status, rank, campus, page]);

  /** Every account matching the current filters, as a CSV download (fetched 100 at a time). */
  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const b = await getBackend();
      const lvl = rank ? Number(rank) : null;
      const base: AdminUserQuery = { search, role, status, minRank: lvl, maxRank: lvl, campus, limit: 100, offset: 0 };
      const all: AdminUserRow[] = [];
      for (let off = 0; off < 20000; off += 100) {
        const r = await b.adminListUsers({ ...base, offset: off });
        all.push(...r.rows);
        if (r.rows.length < 100 || all.length >= r.total) break;
      }
      const head = ["Name", "Email", "Mobile", "NIAT ID", "Earlier ID", "Campus", "Role", "Status", "Rank", "Lifetime XP", "Registered"];
      const lines = [head.join(","), ...all.map((u) => [u.name, u.email, u.phone ?? "", u.niatId ?? "", u.legacyStudentId ?? "", u.campus, ROLE_LABEL[u.role], STATUS_LABEL[u.status], rankByLevel(u.rankLevel).name, u.xp, u.createdAt.slice(0, 10)].map(csvCell).join(","))];
      const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `beast-feast-users-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data from the server when the filters change
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <Panel title={`User management (${total})`} bodyClass="p-0">
      <div className="grid gap-2 border-b border-line p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <input className="bf-input !pl-8" placeholder="Name, email, NIAT ID, campus or phone…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        </label>
        <select className="bf-input" value={role} onChange={(e) => { setRole(e.target.value as Profile["role"] | ""); setPage(0); }} aria-label="Role">
          <option value="">All roles</option>
          <option value="student">Students</option>
          <option value="admin">Admins</option>
          <option value="super_admin">Super Admin</option>
        </select>
        <select className="bf-input" value={status} onChange={(e) => { setStatus(e.target.value as AccountStatus | ""); setPage(0); }} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="bf-input" value={rank} onChange={(e) => { setRank(e.target.value); setPage(0); }} aria-label="Rank">
          <option value="">All ranks</option>
          {RANKS.map((r) => <option key={r.level} value={r.level}>{r.level}. {r.name}</option>)}
        </select>
        <select className="bf-input" value={campus} onChange={(e) => { setCampus(e.target.value); setPage(0); }} aria-label="Campus">
          <option value="">All campuses</option>
          {campuses.map((c) => <option key={c.campus} value={c.campus}>{c.campus === "(none)" ? "No campus set" : c.campus} ({c.students})</option>)}
        </select>
        <Button size="sm" onClick={() => void exportCsv()} disabled={exporting || !total} title="Download every account matching these filters as CSV" data-testid="users-export">
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Export CSV
        </Button>
      </div>
      {review && review.length > 0 && (
        <div className="border-b border-line px-3 py-2 text-xs">
          <button className="inline-flex items-center gap-1.5 font-medium text-warn hover:underline" onClick={() => setShowReview((v) => !v)} aria-expanded={showReview} data-testid="niat-review-toggle">
            <IdCard size={14} /> {review.length} account{review.length === 1 ? "" : "s"} need an ID or campus check {showReview ? "▲" : "▼"}
          </button>
          {showReview && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded border border-line" data-testid="niat-review">
              <p className="bg-bg2 px-2 py-1 text-[11px] text-muted">Nothing here has been changed. Open an account to set its NIAT ID or campus after checking it with the student.</p>
              <table className="w-full">
                <tbody>
                  {review.map((r) => (
                    <tr key={r.id} className="cursor-pointer border-t border-line hover:bg-panel2" onClick={() => { setQ(r.email); setShowReview(false); }}>
                      <td className="px-2 py-1">{r.name}<div className="break-all text-dim">{r.email}</div></td>
                      <td className="px-2 py-1 font-mono">{r.niatId ?? r.legacyStudentId ?? "—"}</td>
                      <td className="px-2 py-1">{r.campus || <span className="text-dim">no campus</span>}</td>
                      <td className="px-2 py-1 text-warn">{ISSUE_LABEL[r.issue]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {err && <div role="alert" className="m-3 rounded border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-accent-ink">{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-bg2">
            <tr className="bf-label text-left">
              <th className="px-3 py-2">Student</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">NIAT ID</th><th className="px-3 py-2">Campus</th><th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2 text-right">Lifetime XP</th><th className="px-3 py-2 text-right">Today</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length && <tr><td colSpan={9} className="p-6 text-center text-muted"><Loader2 size={16} className="mr-2 inline animate-spin" />Loading users…</td></tr>}
            {!loading && !rows.length && !err && <tr><td colSpan={9} className="p-6 text-center text-muted">No users match these filters.</td></tr>}
            {rows.map((u) => (
              <tr key={u.id} className="cursor-pointer border-t border-line hover:bg-panel2" onClick={() => setOpen(u)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(u)}>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={u.name} src={u.avatar} size={30} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{u.name}</span>
                      {u.status !== "active" && <span className="text-[11px] text-warn">{STATUS_LABEL[u.status]}</span>}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div className="break-all text-text">{u.email}</div>
                  <div className="font-mono text-muted">{formatIndianMobile(u.phone)}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{u.niatId ?? <span className="text-dim" title="Earlier student ID">{u.legacyStudentId ? `${u.legacyStudentId} (legacy)` : "—"}</span>}</td>
                <td className="px-3 py-2 text-xs">{u.campus || <span className="text-dim">—</span>}</td>
                <td className="px-3 py-2"><span className="flex items-center gap-1.5 text-xs"><RankBadge level={u.rankLevel} size={22} />{rankByLevel(u.rankLevel).name}</span></td>
                <td className="px-3 py-2 text-right font-mono text-accent-ink">{u.xp.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono">{u.dailyXp}</td>
                <td className="px-3 py-2"><Badge tone={u.role === "super_admin" ? "accent" : u.role === "admin" ? "brand" : "dim"}>{ROLE_LABEL[u.role]}</Badge></td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{date(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-muted">
        <span>{total ? `${page * PAGE + 1}–${Math.min(total, (page + 1) * PAGE)} of ${total}` : "0 users"}</span>
        <span className="flex items-center gap-1">
          <button className="rounded p-1 hover:bg-panel2 disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
          Page {page + 1} of {pages}
          <button className="rounded p-1 hover:bg-panel2 disabled:opacity-40" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
        </span>
      </div>
      {open && <UserDetail user={open} onClose={() => setOpen(null)} onChanged={(u) => { setOpen(u); setRows((rs) => rs.map((x) => (x.id === u.id ? u : x))); }} />}
    </Panel>
  );
}

function UserDetail({ user, onClose, onChanged }: { user: AdminUserRow; onClose: () => void; onChanged: (u: AdminUserRow) => void }) {
  const [events, setEvents] = useState<XpEvent[] | null>(null);
  const [campusDraft, setCampusDraft] = useState(user.campus);
  const [niatDraft, setNiatDraft] = useState("");
  const [saving, setSaving] = useState<"" | "campus" | "niat">("");
  const [editErr, setEditErr] = useState<string | null>(null);
  const saveCampus = async () => {
    const e = campusError(campusDraft);
    if (e) return setEditErr(e);
    setSaving("campus");
    setEditErr(null);
    try {
      const v = await (await getBackend()).adminSetCampus(user.id, campusDraft);
      onChanged({ ...user, campus: v });
    } catch (x) {
      setEditErr((x as Error).message);
    } finally {
      setSaving("");
    }
  };
  const saveNiat = async () => {
    const e = niatIdError(niatDraft);
    if (e) return setEditErr(e);
    if (!window.confirm(`Set the NIAT ID of ${user.name} to ${normalizeNiatId(niatDraft)}? Check it with the student first — it is logged.`)) return;
    setSaving("niat");
    setEditErr(null);
    try {
      const v = await (await getBackend()).adminSetNiat(user.id, niatDraft);
      onChanged({ ...user, niatId: v });
      setNiatDraft("");
    } catch (x) {
      setEditErr((x as Error).message);
    } finally {
      setSaving("");
    }
  };
  const [ranks, setRanks] = useState<RankEvent[]>([]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    void getBackend().then(async (b) => {
      const [ev, rh] = await Promise.all([b.listXpEvents(user.id).catch(() => []), b.listRankHistory(user.id).catch(() => [])]);
      setEvents([...ev].sort((a, c) => c.at.localeCompare(a.at)).slice(0, 15));
      setRanks(rh);
    });
    return () => window.removeEventListener("keydown", esc);
  }, [user.id, onClose]);
  const rank = rankByLevel(user.rankLevel);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(20,26,22,.55)]" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`${user.name} details`} className="bf-panel h-full w-full max-w-md overflow-y-auto rounded-none p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} src={user.avatar} size={56} />
            <div>
              <h2 className="font-display text-xl font-bold">{user.name}</h2>
              <div className="text-xs text-muted">{ROLE_LABEL[user.role]} · {STATUS_LABEL[user.status]}</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted hover:text-text" aria-label="Close"><X size={18} /></button>
        </div>
        <dl className="mt-5 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="bf-label">Email</dt><dd className="break-all"><a className="inline-flex items-center gap-1 hover:underline" href={`mailto:${user.email}`}><Mail size={12} />{user.email}</a></dd>
          <dt className="bf-label">Mobile</dt><dd>{user.phone ? <a className="inline-flex items-center gap-1 font-mono hover:underline" href={`tel:${user.phone}`}><Phone size={12} />{formatIndianMobile(user.phone)}</a> : "—"}</dd>
          <dt className="bf-label">NIAT ID</dt>
          <dd className="font-mono">
            {user.niatId ?? (
              <span className="flex gap-1">
                <input className="bf-input !py-0.5 font-mono uppercase" placeholder="Set after checking" value={niatDraft} maxLength={11} onChange={(e) => setNiatDraft(e.target.value.toUpperCase().replace(/\s/g, ""))} aria-label="NIAT ID" />
                <Button size="sm" onClick={() => void saveNiat()} disabled={!niatDraft || saving !== ""}>{saving === "niat" ? "…" : "Set"}</Button>
              </span>
            )}
          </dd>
          <dt className="bf-label">Campus</dt>
          <dd>
            <span className="flex gap-1">
              <input className="bf-input !py-0.5" placeholder={CAMPUS_PLACEHOLDER} value={campusDraft} maxLength={60} onChange={(e) => setCampusDraft(e.target.value)} aria-label="Campus" data-testid="admin-campus" />
              <Button size="sm" onClick={() => void saveCampus()} disabled={campusDraft.trim() === user.campus || saving !== ""}>{saving === "campus" ? "…" : "Save"}</Button>
            </span>
          </dd>
          {editErr && <dd className="col-span-2 text-xs text-accent-ink" role="alert">{editErr}</dd>}
          {user.legacyStudentId && user.legacyStudentId !== user.niatId && (<><dt className="bf-label">Earlier ID</dt><dd className="font-mono">{user.legacyStudentId}</dd></>)}
          <dt className="bf-label">Rank</dt><dd className="flex items-center gap-1.5"><RankBadge level={user.rankLevel} size={22} />{rank.name} (level {user.rankLevel})</dd>
          <dt className="bf-label">Lifetime XP</dt><dd className="font-mono">{user.xp.toLocaleString()}</dd>
          <dt className="bf-label">Today&apos;s XP</dt><dd className="font-mono">{user.dailyXp}</dd>
          <dt className="bf-label">Registered</dt><dd>{date(user.createdAt)}</dd>
          <dt className="bf-label">Last sign-in</dt><dd>{date(user.lastSignInAt)}</dd>
        </dl>
        <h3 className="bf-label mb-2 mt-6">Recent XP transactions</h3>
        {events === null ? <div className="text-sm text-muted">Loading…</div> : events.length === 0 ? <div className="text-sm text-muted">No XP yet.</div> : (
          <ul className="divide-y divide-line text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 py-1.5">
                <span className="min-w-0"><span className="block truncate">{describeXp(e).text}</span><span className="text-[11px] text-dim">{new Date(e.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span></span>
                <span className={`font-mono ${e.amount < 0 ? "text-accent-ink" : "text-ok"}`}>{e.amount > 0 ? "+" : ""}{e.amount}</span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="bf-label mb-2 mt-6">Rank history</h3>
        {ranks.length === 0 ? <div className="text-sm text-muted">No promotions yet.</div> : (
          <ul className="space-y-1 text-sm">
            {ranks.map((r) => (
              <li key={r.id} className="flex justify-between gap-3">
                <span>{r.oldLevel ? `${rankByLevel(r.oldLevel).name} → ` : ""}{rankByLevel(r.newLevel).name}</span>
                <span className="text-xs text-muted">{date(r.at)} · {r.xpAt} XP</span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
