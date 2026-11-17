"use client";
import { useCallback, useEffect, useState } from "react";
import { Crown, Loader2, Search, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { Badge, Button, Field, Panel } from "@/components/ui";
import { getBackend } from "@/lib/data";
import type { RoleAuditEntry, StaffAccount } from "@/lib/data/types";
import { useApp } from "@/lib/store/app";
import { ROLE_LABEL, isSuperAdmin } from "@/lib/roles";
import type { Role } from "@/lib/types";

const roleTone = (r: Role) => (r === "super_admin" ? "accent" : r === "admin" ? "brand" : "dim");
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Admin Management: the Super Admin promotes registered users to admin by email, or revokes admin access.
 * Every change goes through the server-side admin_set_role() function (cloud mode), which re-checks the
 * caller's role and records the change in the audit log — this screen is only the interface.
 */
export function AdminManagement() {
  const { user, toast } = useApp();
  const superAdmin = isSuperAdmin(user?.role);
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<StaffAccount | null | undefined>(undefined); // undefined = no search yet, null = not found
  const [searched, setSearched] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [audit, setAudit] = useState<RoleAuditEntry[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const b = await getBackend();
      const [s, a] = await Promise.all([b.listStaff(), b.listRoleAudit()]);
      setStaff(s);
      setAudit(a);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(errText(e));
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load the staff list and audit log on mount
    void reload();
  }, [reload]);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const q = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(q)) return toast("error", "Enter a valid email address.");
    setSearching(true);
    setConfirm(false);
    try {
      const b = await getBackend();
      setResult(await b.findUserByEmail(q));
      setSearched(q);
    } catch (x) {
      toast("error", errText(x));
    } finally {
      setSearching(false);
    }
  }

  async function changeRole(target: StaffAccount, role: "student" | "admin") {
    setBusy(true);
    try {
      const b = await getBackend();
      await b.setRole(target.id, role, role === "admin" ? "Promoted via MAKE AS ADMIN" : "Admin access revoked");
      toast("success", role === "admin" ? `${target.name} is now an Admin.` : `${target.name}'s admin access was revoked.`);
      if (result && result.id === target.id) setResult({ ...result, role });
      setConfirm(false);
      await reload();
    } catch (x) {
      toast("error", errText(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title={<span className="flex items-center gap-2"><UserPlus size={15} className="text-accent-ink" /> MAKE AS ADMIN</span>}>
        {!superAdmin ? (
          <p className="text-sm text-muted">Only the Super Admin can grant or revoke administrator access. You can see who has access and the change history.</p>
        ) : (
          <div className="space-y-4">
            <form onSubmit={search} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label="Registered user's email">
                  <input className="bf-input" type="email" placeholder="student@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
                </Field>
              </div>
              <Button type="submit" variant="secondary" disabled={searching}>
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Search
              </Button>
            </form>

            {result === null && (
              <div className="rounded-lg border border-line bg-bg2 p-4 text-sm" role="status">
                <div className="font-semibold">No account found</div>
                <p className="mt-1 text-muted">Nobody has registered with <span className="font-mono text-text">{searched}</span>. Ask them to create a BEAST FEAST account first, then search again.</p>
              </div>
            )}

            {result && (
              <div className="bf-on-ivory rounded-xl border border-line p-4" role="status">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="bf-label">Account found</div>
                    <div className="font-display text-lg font-semibold text-heading">{result.name}</div>
                    <div className="truncate font-mono text-xs text-muted">{result.email}</div>
                  </div>
                  <Badge tone={roleTone(result.role)}>{ROLE_LABEL[result.role]}</Badge>
                </div>
                {result.id === user?.id ? (
                  <p className="mt-3 text-sm text-muted">This is your own account. Your role cannot be changed here.</p>
                ) : result.role === "super_admin" ? (
                  <p className="mt-3 text-sm text-muted">The Super Admin account is protected and cannot be changed.</p>
                ) : result.role === "admin" ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-muted">Already an administrator.</p>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => confirmRevoke(result)}>
                      <ShieldOff size={13} /> Revoke admin
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5 accent-[var(--signal-red)]" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                      <span>I confirm that <b>{result.name}</b> should get administrator access to BEAST FEAST (content, components, learning, announcements and student progress).</span>
                    </label>
                    <Button variant="primary" className="w-full" disabled={!confirm || busy} onClick={() => void changeRole(result, "admin")}>
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={15} />} MAKE ADMIN
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title={`Administrators (${staff.length})`} bodyClass="p-0">
        {loadErr && <div className="p-4 text-sm text-bad">{loadErr}</div>}
        <ul>
          {staff.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 first:border-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {s.role === "super_admin" && <Crown size={13} className="text-accent-ink" />}
                  {s.name}
                  {s.id === user?.id && <span className="text-xs text-dim">(you)</span>}
                </div>
                <div className="truncate font-mono text-[11px] text-dim">{s.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={roleTone(s.role)}>{ROLE_LABEL[s.role]}</Badge>
                {superAdmin && s.role === "admin" && s.id !== user?.id && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirmRevoke(s)} title="Revoke admin access">
                    <ShieldOff size={13} />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Role change audit log" className="lg:col-span-2" bodyClass="p-0">
        {audit.length === 0 ? (
          <div className="p-4 text-sm text-muted">No role changes recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg2">
                <tr className="bf-label text-left">
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Account</th>
                  <th className="px-4 py-2">Change</th>
                  <th className="px-4 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted">{new Date(a.at).toLocaleString()}</td>
                    <td className="px-4 py-2"><Badge tone={a.action === "revoke" ? "dim" : "accent"}>{a.action}</Badge></td>
                    <td className="px-4 py-2 font-mono text-xs">{a.targetEmail ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted">{a.oldRole ?? "—"} → <span className="text-text">{a.newRole}</span></td>
                    <td className="px-4 py-2 font-mono text-xs text-muted">{a.actorEmail ?? "system"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );

  function confirmRevoke(s: StaffAccount) {
    if (window.confirm(`Revoke administrator access for ${s.name} (${s.email})? They will become a student.`)) void changeRole(s, "student");
  }
}
