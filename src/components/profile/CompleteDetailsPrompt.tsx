"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getBackend } from "@/lib/data";
import { useApp } from "@/lib/store/app";
import { Button } from "@/components/ui";
import { CAMPUS_PLACEHOLDER, COUNTRY_CODE, NIAT_ID_EXAMPLE, campusError, mobileError, niatIdError, normalizeCampus, normalizeNiatId, toE164India } from "@/lib/validation";

/**
 * NIAT ID, campus name and mobile number are required for new accounts. The sign-up form collects them; this
 * prompt covers accounts created any other way (Google sign-in, or no NIAT ID and no earlier student ID on record)
 * and asks every student without a campus name for it. Nothing is changed until the student saves.
 * Accounts from before NIAT IDs were required keep their old ID (as a legacy ID) for an administrator to review.
 */
export function CompleteDetailsPrompt() {
  const { user, signOut, toast, refreshUser } = useApp();
  const path = usePathname();
  const [need, setNeed] = useState<{ niat: boolean; phone: boolean; campus: boolean } | null>(null);
  const [niat, setNiat] = useState("");
  const [campus, setCampus] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const noCampus = !user.campus?.trim();
    void getBackend()
      .then((b) => b.getMyDetails())
      .then((d) => {
        const legacy = !!d.legacyStudentId;
        const n = { niat: !legacy && !d.niatId, phone: !legacy && !d.phone, campus: noCampus };
        setNeed(n.niat || n.phone || n.campus ? n : null);
      })
      .catch(() => setNeed(null));
  }, [user]);

  if (!user || !need || path.startsWith("/login") || path.startsWith("/reset-password")) return null;

  async function save() {
    if (busy) return;
    const e = (need!.niat ? niatIdError(niat) : null) ?? (need!.campus ? campusError(campus) : null) ?? (need!.phone ? mobileError(phone) : null);
    if (e) return setErr(e);
    setBusy(true);
    setErr(null);
    try {
      const b = await getBackend();
      if (need!.niat || need!.phone) await b.completeMyDetails({ niatId: need!.niat ? normalizeNiatId(niat) : undefined, phone: need!.phone ? toE164India(phone) : undefined });
      if (need!.campus && user) {
        await b.updateProfile({ id: user.id, campus: normalizeCampus(campus) });
        await refreshUser();
      }
      setNeed(null);
      toast("success", "Thanks — your details are saved");
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(20,26,22,.7)] p-4" role="dialog" aria-modal="true" aria-labelledby="cd-title">
      <div className="bf-panel bf-on-ivory bf-raised w-full max-w-sm space-y-4 border-t-4 !border-t-accent p-6">
        <div>
          <h2 id="cd-title" className="font-display text-xl font-bold">Complete your account</h2>
          <p className="mt-1 text-xs text-muted">BEAST FEAST needs {[need.niat && "your NIAT Student ID", need.campus && "your campus name", need.phone && "your mobile number"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")}.{(need.niat || need.phone) && " Your ID and number are visible only to you and the club administrators."}</p>
        </div>
        {need.niat && (
          <div className="space-y-1">
            <label htmlFor="cd-niat" className="bf-label block">NIAT Student ID</label>
            <input id="cd-niat" className="bf-input font-mono uppercase tracking-wider" placeholder={NIAT_ID_EXAMPLE} value={niat} onChange={(e) => setNiat(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 11))} />
          </div>
        )}
        {need.campus && (
          <div className="space-y-1">
            <label htmlFor="cd-campus" className="bf-label block">Campus / College Name</label>
            <input id="cd-campus" className="bf-input" placeholder={CAMPUS_PLACEHOLDER} value={campus} maxLength={60} onChange={(e) => setCampus(e.target.value.slice(0, 60))} />
          </div>
        )}
        {need.phone && (
          <div className="space-y-1">
            <label htmlFor="cd-phone" className="bf-label block">Mobile number</label>
            <div className="flex gap-2">
              <span className="bf-input flex !w-14 shrink-0 items-center justify-center font-mono">{COUNTRY_CODE}</span>
              <input id="cd-phone" className="bf-input min-w-0 flex-1 font-mono" type="tel" inputMode="numeric" placeholder="9876543210" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, "").slice(0, 14))} />
            </div>
          </div>
        )}
        {err && <p role="alert" className="text-xs font-medium text-accent-ink">{err}</p>}
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="text-xs text-muted hover:underline" onClick={() => void signOut()}>Sign out</button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? <><Loader2 size={14} className="mr-1 animate-spin" /> Saving…</> : "Save and continue"}</Button>
        </div>
      </div>
    </div>
  );
}
