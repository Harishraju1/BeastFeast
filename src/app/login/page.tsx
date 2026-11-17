"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useApp } from "@/lib/store/app";
import { BACKEND_MODE } from "@/lib/data";
import { Button, Field } from "@/components/ui";

function LoginInner() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [form, setForm] = useState({ name: "", email: "", password: "", campus: "", studentId: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { signIn, signUp } = useApp();
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "in") await signIn(form.email, form.password);
      else await signUp(form);
      router.replace(next);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bf-grid relative flex min-h-[calc(100vh-56px)] items-center justify-center p-4">
      <form onSubmit={submit} className="bf-panel bf-on-ivory bf-raised relative w-full max-w-md space-y-4 border-t-4 !border-t-accent p-7">
        <div>
          <div className="bf-label text-accent-ink">BEAST FEAST 5.0 · ROBOTICS CLUB KKH</div>
          <h1 className="font-display text-2xl font-bold">{mode === "in" ? "Enter the lab" : "Create your engineer account"}</h1>
          <p className="mt-1 text-xs text-muted">
            {BACKEND_MODE === "local"
              ? "Local mode: accounts and projects are stored in this browser only. The first account created on this device becomes its Super Admin."
              : "Cloud mode: your projects sync across devices."}
          </p>
        </div>
        {mode === "up" && (
          <>
            <Field label="Name">
              <input className="bf-input" value={form.name} onChange={set("name")} required autoComplete="name" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Campus">
                <input className="bf-input" value={form.campus} onChange={set("campus")} />
              </Field>
              <Field label="Student ID">
                <input className="bf-input" value={form.studentId} onChange={set("studentId")} />
              </Field>
            </div>
          </>
        )}
        <Field label="Email">
          <input className="bf-input" type="email" value={form.email} onChange={set("email")} required autoComplete="email" />
        </Field>
        <Field label="Password" hint={mode === "up" ? "At least 6 characters." : undefined}>
          <input className="bf-input" type="password" value={form.password} onChange={set("password")} required autoComplete={mode === "in" ? "current-password" : "new-password"} />
        </Field>
        {err && <div className="rounded border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{err}</div>}
        <Button variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? "…" : mode === "in" ? "SIGN IN" : "CREATE ACCOUNT"}
        </Button>
        <button type="button" className="w-full text-center text-sm text-brand hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
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
