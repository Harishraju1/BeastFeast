"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getBackend } from "@/lib/data";
import { useApp } from "@/lib/store/app";
import { Button } from "@/components/ui";
import { COUNTRY_CODE, NIAT_ID_EXAMPLE, mobileError, niatIdError, normalizeNiatId, toE164India } from "@/lib/validation";

/**
 * NIAT ID and mobile number are required for new accounts. The sign-up form collects them; this prompt
 * covers accounts created any other way (no NIAT ID and no earlier student ID on record).
 * Accounts from before NIAT IDs were required keep working unchanged (their old ID is kept as a legacy ID).
 */
export function CompleteDetailsPrompt() {
  const { user, signOut, toast } = useApp();
  const path = usePathname();
  const [need, setNeed] = useState<{ niat: boolean; phone: boolean } | null>(null);
  const [niat, setNiat] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void getBackend()
      .then((b) => b.getMyDetails())
      .then((d) => {
        const legacy = !!d.legacyStudentId;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- set from an async result
        setNeed(!legacy && (!d.niatId || !d.phone) ? { niat: !d.niatId, phone: !d.phone } : null);
      })
      .catch(() => setNeed(null));
  }, [user]);

  if (!user || !need || path.startsWith("/login") || path.startsWith("/reset-password")) return null;

  async function save() {
    if (busy) return;
    const e = (need!.niat ? niatIdError(niat) : null) ?? (need!.phone ? mobileError(phone) : null);
    if (e) return setErr(e);
    setBusy(true);
    setErr(null);
    try {
      await (await getBackend()).completeMyDetails({ niatId: need!.niat ? normalizeNiatId(niat) : undefined, phone: need!.phone ? toE164India(phone) : undefined });
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
          <p className="mt-1 text-xs text-muted">BEAST FEAST needs your NIAT student ID and mobile number. Only you and the club administrators can see them.</p>
        </div>
        {need.niat && (
          <div className="space-y-1">
            <label htmlFor="cd-niat" className="bf-label block">NIAT student ID</label>
            <input id="cd-niat" className="bf-input font-mono uppercase tracking-wider" placeholder={NIAT_ID_EXAMPLE} value={niat} onChange={(e) => setNiat(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 11))} />
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
