"use client";
import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { getBackend } from "@/lib/data";
import type { PrivateDetails } from "@/lib/data/types";
import { useApp } from "@/lib/store/app";
import { Button } from "@/components/ui";
import { COUNTRY_CODE, NIAT_ID_EXAMPLE, NIAT_ID_FORMAT, formatIndianMobile, mobileError, nationalMobileDigits, niatIdError, normalizeNiatId, toE164India } from "@/lib/validation";

/**
 * The student's private details. Only they and administrators can read these.
 * The NIAT ID can be added once (if it is missing) and is then locked; the mobile number can be updated.
 */
export function AccountDetails() {
  const { user, toast } = useApp();
  const [d, setD] = useState<PrivateDetails | null>(null);
  const [phone, setPhone] = useState("");
  const [niat, setNiat] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void getBackend()
      .then((b) => b.getMyDetails())
      .then((x) => {
        setD(x);
        setPhone(x.phone ? nationalMobileDigits(x.phone) : "");
      })
      .catch((e) => setErr((e as Error).message));
  }, [user]);

  if (!user) return null;
  if (!d) return <div className="text-sm text-muted">{err ?? "Loading your details…"}</div>;

  const phoneChanged = phone.trim() !== (d.phone ? nationalMobileDigits(d.phone) : "");
  const phoneErr = phone.trim() ? mobileError(phone) : null;
  const niatErr = niat ? niatIdError(niat) : null;

  async function save() {
    if (busy) return;
    setErr(null);
    if (phoneErr || niatErr) return setErr(phoneErr ?? niatErr);
    setBusy(true);
    try {
      const next = await (await getBackend()).completeMyDetails({ phone: phoneChanged && phone.trim() ? toE164India(phone) : undefined, niatId: niat ? normalizeNiatId(niat) : undefined });
      setD(next);
      setNiat("");
      toast("success", "Details saved");
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-center gap-1.5 text-xs text-dim"><Lock size={12} /> Visible only to you and the club administrators.</p>
      <div>
        <div className="bf-label">Email</div>
        <div className="break-all text-text">{d.email ?? "—"}</div>
      </div>
      <div className="space-y-1">
        <label htmlFor="acc-phone" className="bf-label block">Mobile number</label>
        <div className="flex gap-2">
          <span className="bf-input flex !w-14 shrink-0 items-center justify-center font-mono">{COUNTRY_CODE}</span>
          <input id="acc-phone" className={`bf-input min-w-0 flex-1 font-mono ${phoneErr ? "!border-accent" : ""}`} type="tel" inputMode="numeric" placeholder="9876543210" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, "").slice(0, 14))} />
        </div>
        {d.phone && <p className="text-[11px] text-dim">Saved: {formatIndianMobile(d.phone)} (not verified by SMS)</p>}
      </div>
      <div className="space-y-1">
        <span className="bf-label block">NIAT student ID</span>
        {d.niatId ? (
          <div className="flex items-center gap-2 font-mono text-text">{d.niatId} <Lock size={12} className="text-dim" aria-label="Locked" /></div>
        ) : (
          <>
            <input aria-label="NIAT student ID" className={`bf-input font-mono uppercase tracking-wider ${niatErr ? "!border-accent" : ""}`} placeholder={NIAT_ID_EXAMPLE} value={niat} onChange={(e) => setNiat(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 11))} />
            <p className="text-[11px] text-dim">Format {NIAT_ID_FORMAT}, e.g. {NIAT_ID_EXAMPLE}. It can be set once — ask an administrator to correct it later.</p>
          </>
        )}
        {d.legacyStudentId && d.legacyStudentId !== d.niatId && <p className="text-[11px] text-dim">Earlier student ID on record: <span className="font-mono">{d.legacyStudentId}</span></p>}
      </div>
      {err && <p role="alert" className="text-xs font-medium text-accent-ink">{err}</p>}
      <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy || (!phoneChanged && !niat)}>
        {busy ? <><Loader2 size={13} className="mr-1 animate-spin" /> Saving…</> : "Save details"}
      </Button>
    </div>
  );
}
