"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import logo from "@/assets/brand/beast-feast-logo.webp";
import { getBackend } from "@/lib/data";
import { useApp } from "@/lib/store/app";
import { Button } from "@/components/ui";
import { passwordError } from "@/lib/validation";

type Stage = "checking" | "ready" | "invalid" | "done";

/** Error details Supabase puts on the redirect when a link is expired or already used (query or hash). */
function linkError(): string | null {
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = q.get("error_code") ?? h.get("error_code");
  const desc = q.get("error_description") ?? h.get("error_description");
  if (!code && !desc && !q.get("error") && !h.get("error")) return null;
  if (code === "otp_expired" || /expired|invalid/i.test(desc ?? "")) return "This reset link has expired or was already used.";
  return "This reset link could not be used.";
}

/**
 * Opened from the password-reset email. The Supabase client exchanges the link's one-time code for a
 * short-lived session (PKCE — it only works in the browser that requested the reset); the student then
 * chooses a new password.
 */
export default function ResetPasswordPage() {
  const [stage, setStage] = useState<Stage>("checking");
  const [reason, setReason] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { refreshUser } = useApp();
  const router = useRouter();

  useEffect(() => {
    const bad = linkError();
    if (bad) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once on arrival
      setReason(bad);
      setStage("invalid");
      return;
    }
    void getBackend()
      .then((b) => b.hasRecoverySession())
      .then((ok) => {
        if (ok) setStage("ready");
        else {
          setReason(new URLSearchParams(window.location.search).get("code") ? "This link must be opened in the same browser where you asked for it, and only once." : "Open the link from your password-reset email to choose a new password.");
          setStage("invalid");
        }
      })
      .catch(() => {
        setReason("We couldn't check this link. Check your internet connection and try again.");
        setStage("invalid");
      });
  }, []);

  const pwErr = passwordError(pw);
  const matchErr = !pwErr && pw !== pw2 ? "The passwords do not match." : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setSubmitted(true);
    setErr(null);
    if (pwErr || matchErr) return;
    setBusy(true);
    try {
      await (await getBackend()).updatePassword(pw);
      // drop the code from the address bar so a reload doesn't try to reuse it
      window.history.replaceState(null, "", "/reset-password");
      setStage("done");
      await refreshUser();
      setTimeout(() => router.replace("/"), 2500);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bf-grid relative flex min-h-[calc(100vh-56px)] flex-col items-center justify-center gap-2 p-4">
      <Link href="/" aria-label="BEAST FEAST home">
        <Image src={logo} alt="BEAST FEAST — Robotics Club KKH" priority className="h-auto w-[200px] sm:w-[240px]" sizes="240px" />
      </Link>
      <div className="bf-panel bf-on-ivory bf-raised w-full max-w-md space-y-4 border-t-4 !border-t-accent p-5 sm:p-7">
        <div>
          <div className="bf-label">BEAST FEAST · ROBOTICS CLUB KKH</div>
          <h1 className="font-display text-2xl font-bold">Choose a new password</h1>
        </div>

        {stage === "checking" && (
          <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Checking your reset link…</p>
        )}

        {stage === "invalid" && (
          <>
            <p role="alert" className="rounded border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-accent-ink">{reason}</p>
            <Link href="/login?mode=forgot" className="inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover">
              Request a new link
            </Link>
          </>
        )}

        {stage === "ready" && (
          <form onSubmit={save} noValidate className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="rp-pw" className="bf-label block">New password</label>
              <input id="rp-pw" type="password" autoComplete="new-password" className={`bf-input ${submitted && pwErr ? "!border-accent" : ""}`} value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={submitted && !!pwErr} />
              {submitted && pwErr ? <p role="alert" className="text-xs font-medium text-accent-ink">{pwErr}</p> : <p className="text-[11px] text-dim">At least 8 characters with letters and a number.</p>}
            </div>
            <div className="space-y-1">
              <label htmlFor="rp-pw2" className="bf-label block">Confirm new password</label>
              <input id="rp-pw2" type="password" autoComplete="new-password" className={`bf-input ${submitted && matchErr ? "!border-accent" : ""}`} value={pw2} onChange={(e) => setPw2(e.target.value)} aria-invalid={submitted && !!matchErr} />
              {submitted && matchErr && <p role="alert" className="text-xs font-medium text-accent-ink">{matchErr}</p>}
            </div>
            {err && <p role="alert" className="rounded border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-accent-ink">{err}</p>}
            <Button variant="primary" size="lg" className="w-full" disabled={busy}>{busy ? "Saving…" : "SAVE NEW PASSWORD"}</Button>
          </form>
        )}

        {stage === "done" && (
          <p role="status" className="flex items-start gap-2 rounded border border-[#2f7a46]/40 bg-[#2f7a46]/10 px-3 py-2 text-sm text-[#215c34]">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> Password updated successfully. You&apos;re signed in — taking you to the Command Center…
          </p>
        )}
      </div>
    </div>
  );
}
