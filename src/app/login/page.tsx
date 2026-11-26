"use client";
import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/brand/beast-feast-logo.webp";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useMemo } from "react";
import { Camera, CheckCircle2, X } from "lucide-react";
import { useApp } from "@/lib/store/app";
import { BACKEND_MODE, getBackend } from "@/lib/data";
import { Button } from "@/components/ui";
import { COUNTRY_CODE, NIAT_ID_EXAMPLE, NIAT_ID_FORMAT, avatarFileError, mobileError, niatIdError, normalizeNiatId, passwordError, toE164India } from "@/lib/validation";

type Fields = { name: string; email: string; phone: string; niatId: string; password: string; confirm: string };
const EMPTY: Fields = { name: "", email: "", phone: "", niatId: "", password: "", confirm: "" };

type Mode = "in" | "up" | "forgot";

function validate(f: Fields, mode: Mode): Partial<Record<keyof Fields, string>> {
  const e: Partial<Record<keyof Fields, string>> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Enter a valid email address.";
  if (mode === "forgot") return e;
  if (mode === "in") {
    if (!f.password) e.password = "Enter your password.";
    return e;
  }
  if (f.name.trim().length < 2) e.name = "Enter your full name.";
  const m = mobileError(f.phone);
  if (m) e.phone = m;
  const n = niatIdError(f.niatId);
  if (n) e.niatId = n;
  const p = passwordError(f.password);
  if (p) e.password = p;
  if (!p && f.password !== f.confirm) e.confirm = "The passwords do not match.";
  return e;
}

function FieldRow({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="bf-label block">{label}</label>
      {children}
      {error ? <p id={`${id}-err`} role="alert" className="text-xs font-medium text-accent-ink">{error}</p> : hint ? <p className="text-[11px] text-dim">{hint}</p> : null}
    </div>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const initial = params.get("mode");
  const [mode, setMode] = useState<Mode>(initial === "signup" ? "up" : initial === "forgot" ? "forgot" : "in");
  const [sent, setSent] = useState(false);
  // one reset email per minute from this page (the server enforces its own limits as well)
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  const [f, setF] = useState<Fields>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof Fields, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [niatTaken, setNiatTaken] = useState<boolean | null>(null);
  const [pic, setPic] = useState<File | null>(null);
  const [picUrl, setPicUrl] = useState<string | null>(null);
  const [picErr, setPicErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { signIn, signUp, refreshUser } = useApp();
  const router = useRouter();
  const next = params.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  // "resend confirmation email" (after sign-up, an unconfirmed sign-in, or an expired link) with its own cooldown
  const [resendFor, setResendFor] = useState<string | null>(null);
  const [resendWait, setResendWait] = useState(0);
  const [signinWait, setSigninWait] = useState(0);
  useEffect(() => {
    if (resendWait <= 0 && signinWait <= 0) return;
    const t = setTimeout(() => {
      setResendWait((c) => Math.max(0, c - 1));
      setSigninWait((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearTimeout(t);
  }, [resendWait, signinWait]);
  const googleOn = BACKEND_MODE === "supabase" && process.env.NEXT_PUBLIC_AUTH_GOOGLE === "1";

  // links coming back from emails / Google: confirmed, expired or already used
  // (errors that arrive in the URL hash are moved into ?link_error= by <AuthLinkErrors /> in the app shell)
  const linkNote = useMemo<{ kind: "ok" | "err"; text: string } | null>(() => {
    const code = params.get("error_code") ?? params.get("link_error");
    if (code) return { kind: "err", text: /expired/i.test(code) ? "That email link has expired or was already used. Enter your email and press “Resend confirmation email”, or sign in if you already confirmed." : "That sign-in link could not be used. Please sign in again." };
    if (params.get("confirmed") === "1") return { kind: "ok", text: "Email confirmed! Sign in with your email and password — you'll stay signed in on this device." };
    return null;
  }, [params]);
  useEffect(() => {
    if (params.get("oauth") !== "1") return;
    // the auth client finishes the Google sign-in from the URL; then load the profile and continue
    void refreshUser().then(() => router.replace(safeNext));
  }, [params, refreshUser, router, safeNext]);

  async function resend() {
    const email = (resendFor ?? f.email).trim();
    if (!email || resendWait > 0) return;
    setErr(null);
    try {
      await (await getBackend()).resendConfirmation(email);
      setInfo(`A new confirmation link is on its way to ${email}. Open it in this browser; check your spam folder too.`);
      setResendWait(60);
    } catch (x) {
      setErr((x as Error).message);
      setResendWait(30);
    }
  }

  const errors = validate(f, mode);
  if (mode === "up" && niatTaken && !errors.niatId) errors.niatId = "This NIAT ID is already registered.";
  const show = (k: keyof Fields) => (submitted || touched[k] ? errors[k] : undefined);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (k === "niatId") v = v.toUpperCase().replace(/\s/g, "").slice(0, 11);
    if (k === "phone") v = v.replace(/[^\d\s-]/g, "").slice(0, 14);
    setF({ ...f, [k]: v });
    if (k === "niatId") setNiatTaken(null);
  };
  const blur = (k: keyof Fields) => () => setTouched((t) => ({ ...t, [k]: true }));

  // check the NIAT ID is free once it is well-formed
  useEffect(() => {
    if (mode !== "up" || niatIdError(f.niatId)) return;
    const id = normalizeNiatId(f.niatId);
    const t = setTimeout(() => {
      void getBackend()
        .then((b) => b.niatIdAvailable(id))
        .then((ok) => setNiatTaken(!ok))
        .catch(() => setNiatTaken(null));
    }, 400);
    return () => clearTimeout(t);
  }, [f.niatId, mode]);

  useEffect(() => () => void (picUrl && URL.revokeObjectURL(picUrl)), [picUrl]);

  async function choosePic(file: File | undefined) {
    setPicErr(null);
    if (!file) return;
    const e = await avatarFileError(file);
    if (e) {
      setPicErr(e);
      return;
    }
    setPic(file);
    setPicUrl(URL.createObjectURL(file));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return; // no double submits
    setSubmitted(true);
    setErr(null);
    setInfo(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      if (mode === "forgot") {
        if (cooldown > 0) return;
        await (await getBackend()).requestPasswordReset(f.email.trim());
        setSent(true);
        setCooldown(60);
        return;
      }
      if (mode === "in") {
        if (signinWait > 0) return;
        await signIn(f.email.trim(), f.password);
        router.replace(safeNext);
        return;
      }
      await signUp({ name: f.name.trim(), email: f.email.trim(), password: f.password, phone: toE164India(f.phone), niatId: normalizeNiatId(f.niatId) });
      if (pic) {
        try {
          await (await getBackend()).setAvatar(pic);
          await refreshUser();
        } catch (x) {
          setInfo(`Account created. Your picture wasn't saved (${(x as Error).message}) — add it from your profile.`);
          setTimeout(() => router.replace(safeNext), 2500);
          return;
        }
      }
      router.replace(safeNext);
    } catch (x) {
      const msg = (x as Error).message;
      if (/check your email/i.test(msg)) {
        setInfo("Account created. Check your email to confirm it, then sign in. You can add a profile picture from your profile.");
        setMode("in");
        setResendFor(f.email.trim());
        setResendWait(60);
      } else if (msg.startsWith("EMAIL_NOT_CONFIRMED: ")) {
        setErr(msg.slice("EMAIL_NOT_CONFIRMED: ".length));
        setResendFor(f.email.trim());
      } else {
        setErr(msg);
        if (/signing in at once/i.test(msg)) setSigninWait(45);
        if (/already sent you an email/i.test(msg) && mode === "up") setResendFor(f.email.trim());
      }
    } finally {
      setBusy(false);
    }
  }

  const input = (k: keyof Fields) => `bf-input ${show(k) ? "!border-accent" : ""}`;

  return (
    <div className="bf-grid relative flex min-h-[calc(100vh-56px)] flex-col items-center justify-center gap-2 p-4">
      <Link href="/" aria-label="BEAST FEAST home">
        <Image src={logo} alt="BEAST FEAST — Robotics Club KKH" priority className="bf-rise h-auto w-[220px] sm:w-[260px] md:w-[300px]" sizes="300px" />
      </Link>
      <form onSubmit={submit} noValidate className="bf-panel bf-on-ivory bf-raised relative w-full max-w-md space-y-4 border-t-4 !border-t-accent p-5 sm:p-7">
        <div>
          <div className="bf-label">BEAST FEAST · ROBOTICS CLUB KKH</div>
          <h1 className="font-display text-2xl font-bold">{mode === "in" ? "Enter the lab" : mode === "forgot" ? "Reset your password" : "Create your engineer account"}</h1>
          <p className="mt-1 text-xs text-muted">
            {BACKEND_MODE === "local"
              ? "Local mode: accounts and projects are stored in this browser only. The first account created on this device becomes its Super Admin."
              : mode === "up"
                ? "Your phone number and NIAT ID are visible only to you and the club administrators."
                : mode === "forgot"
                  ? "Enter the email you signed up with and we'll send you a link to choose a new password."
                  : "Your projects are saved to your account and available on any device."}
          </p>
        </div>

        {mode === "up" && (
          <>
            <FieldRow id="su-name" label="Full name" error={show("name")}>
              <input id="su-name" className={input("name")} value={f.name} onChange={set("name")} onBlur={blur("name")} autoComplete="name" maxLength={80} aria-invalid={!!show("name")} />
            </FieldRow>
          </>
        )}
        <FieldRow id="su-email" label="Email address" error={show("email")}>
          <input id="su-email" className={input("email")} type="email" inputMode="email" value={f.email} onChange={set("email")} onBlur={blur("email")} autoComplete="email" aria-invalid={!!show("email")} />
        </FieldRow>
        {mode === "up" && (
          <>
            <FieldRow id="su-phone" label="Mobile number" error={show("phone")} hint="10-digit Indian mobile number.">
              <div className="flex gap-2">
                <span className="bf-input flex !w-16 shrink-0 items-center justify-center font-mono" aria-label="Country code">{COUNTRY_CODE}</span>
                <input id="su-phone" className={`${input("phone")} min-w-0 flex-1 font-mono`} type="tel" inputMode="numeric" placeholder="9876543210" value={f.phone} onChange={set("phone")} onBlur={blur("phone")} autoComplete="tel-national" aria-invalid={!!show("phone")} />
              </div>
            </FieldRow>
            <FieldRow id="su-niat" label="NIAT student ID" error={show("niatId") ?? (niatTaken ? errors.niatId : undefined)} hint={`Format ${NIAT_ID_FORMAT}, e.g. ${NIAT_ID_EXAMPLE}.`}>
              <div className="relative">
                <input id="su-niat" className={`${input("niatId")} font-mono uppercase tracking-wider`} placeholder={NIAT_ID_EXAMPLE} value={f.niatId} onChange={set("niatId")} onBlur={blur("niatId")} autoComplete="off" spellCheck={false} aria-invalid={!!show("niatId")} />
                {niatTaken === false && !errors.niatId && <CheckCircle2 size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#2f7a46]" aria-label="NIAT ID available" />}
              </div>
            </FieldRow>
          </>
        )}
        {mode !== "forgot" && (
          <FieldRow id="su-pw" label="Password" error={show("password")} hint={mode === "up" ? "At least 8 characters with letters and a number." : undefined}>
            <input id="su-pw" className={input("password")} type="password" value={f.password} onChange={set("password")} onBlur={blur("password")} autoComplete={mode === "in" ? "current-password" : "new-password"} aria-invalid={!!show("password")} />
          </FieldRow>
        )}
        {mode === "in" && (
          <div className="-mt-2 text-right">
            <button type="button" className="text-xs text-brand hover:underline" onClick={() => { setMode("forgot"); setErr(null); setInfo(null); setSent(false); setSubmitted(false); }}>
              Forgot password?
            </button>
          </div>
        )}
        {mode === "forgot" && sent && (
          <div role="status" className="rounded border border-[#2f7a46]/40 bg-[#2f7a46]/10 px-3 py-2 text-sm text-[#215c34]">
            If an account exists for <b>{f.email.trim()}</b>, a reset link is on its way. Open it <b>in this browser</b> within an hour. Check your spam folder if it doesn&apos;t arrive in a few minutes.
          </div>
        )}
        {mode === "up" && (
          <>
            <FieldRow id="su-pw2" label="Confirm password" error={show("confirm")}>
              <input id="su-pw2" className={input("confirm")} type="password" value={f.confirm} onChange={set("confirm")} onBlur={blur("confirm")} autoComplete="new-password" aria-invalid={!!show("confirm")} />
            </FieldRow>
            <div className="space-y-1">
              <span className="bf-label block">Profile picture (optional)</span>
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line2 bg-panel2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob URL) */}
                  {picUrl ? <img src={picUrl} alt="Selected profile picture" className="h-full w-full object-cover" /> : <Camera size={20} className="text-dim" />}
                </span>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="su-pic" onChange={(e) => void choosePic(e.target.files?.[0])} />
                <label htmlFor="su-pic" className="cursor-pointer rounded-md border border-line2 px-3 py-1.5 text-sm hover:border-accent">{pic ? "Change" : "Choose picture"}</label>
                {pic && (
                  <button type="button" className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent-ink" onClick={() => { setPic(null); setPicUrl(null); if (fileRef.current) fileRef.current.value = ""; }}>
                    <X size={12} /> Remove
                  </button>
                )}
              </div>
              {picErr ? <p role="alert" className="text-xs font-medium text-accent-ink">{picErr}</p> : <p className="text-[11px] text-dim">JPEG, PNG or WebP, up to 5 MB.</p>}
            </div>
          </>
        )}
        {linkNote && !err && !info && <div role={linkNote.kind === "err" ? "alert" : "status"} className={`rounded border px-3 py-2 text-sm ${linkNote.kind === "err" ? "border-accent/50 bg-accent/10 text-accent-ink" : "border-[#2f7a46]/40 bg-[#2f7a46]/10 text-[#215c34]"}`}>{linkNote.text}</div>}
        {err && <div role="alert" className="rounded border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-accent-ink">{err}</div>}
        {BACKEND_MODE === "supabase" && (resendFor || linkNote?.kind === "err") && mode !== "forgot" && (
          <button type="button" className="w-full rounded-md border border-line2 px-3 py-2 text-sm hover:border-accent disabled:opacity-50" disabled={resendWait > 0 || !(resendFor ?? f.email).trim()} onClick={() => void resend()} data-testid="resend-confirmation">
            {resendWait > 0 ? `Resend confirmation email in ${resendWait}s` : `Resend confirmation email${(resendFor ?? f.email).trim() ? ` to ${(resendFor ?? f.email).trim()}` : ""}`}
          </button>
        )}
        {info && <div role="status" className="rounded border border-[#2f7a46]/40 bg-[#2f7a46]/10 px-3 py-2 text-sm text-[#215c34]">{info}</div>}
        <Button variant="primary" size="lg" className="w-full" disabled={busy || (mode === "forgot" && sent && cooldown > 0) || (mode === "in" && signinWait > 0)}>
          {busy
            ? mode === "in" ? "Signing in…" : mode === "forgot" ? "Sending…" : "Creating account…"
            : mode === "in" ? (signinWait > 0 ? `TRY AGAIN IN ${signinWait}s` : "SIGN IN") : mode === "forgot" ? (sent ? (cooldown > 0 ? `SEND AGAIN IN ${cooldown}s` : "SEND AGAIN") : "SEND RESET LINK") : "CREATE ACCOUNT"}
        </Button>
        {googleOn && mode !== "forgot" && (
          <button type="button" className="w-full rounded-md border border-line2 px-3 py-2 text-sm font-medium hover:border-accent" onClick={() => void getBackend().then((b) => b.signInWithGoogle(safeNext)).catch((x) => setErr((x as Error).message))}>
            Continue with Google
          </button>
        )}
        <button
          type="button"
          className="w-full text-center text-sm text-brand hover:underline"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setSent(false);
            setInfo(null);
            setErr(null);
            setSubmitted(false);
            setTouched({});
          }}
        >
          {mode === "in" ? "New here? Create an account" : mode === "forgot" ? "Back to sign in" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

