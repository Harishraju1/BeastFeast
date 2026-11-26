"use client";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { SimStatus } from "@/lib/types";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white font-semibold shadow-[0_1px_0_rgba(0,0,0,.08),0_6px_16px_-8px_rgba(242,11,11,.55)] hover:bg-accent-hover active:translate-y-px",
  secondary: "bg-brand text-on-brand font-semibold hover:bg-brand-hover active:translate-y-px",
  ghost: "text-muted hover:text-heading hover:bg-panel2",
  danger: "bg-bad/15 text-bad border border-bad/40 hover:bg-bad/25",
  outline: "border border-line2 text-heading hover:border-accent hover:bg-panel2",
};

export function Button({ variant = "outline", size = "md", className = "", ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "px-2.5 py-1 text-xs" : size === "lg" ? "px-5 py-3 text-sm tracking-wide" : "px-3.5 py-2 text-sm";
  return <button className={`inline-flex items-center justify-center gap-2 rounded-md transition disabled:opacity-40 disabled:pointer-events-none ${sz} ${VARIANTS[variant]} ${className}`} {...rest} />;
}

export function LinkButton({ variant = "outline", size = "md", className = "", ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "px-2.5 py-1 text-xs" : size === "lg" ? "px-5 py-3 text-sm tracking-wide" : "px-3.5 py-2 text-sm";
  return <Link className={`inline-flex items-center justify-center gap-2 rounded-md transition ${sz} ${VARIANTS[variant]} ${className}`} {...rest} />;
}

export function Panel({ title, actions, children, className = "", bodyClass = "p-4" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`bf-panel ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-heading">{title}</h3>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

const STATUS: Record<SimStatus, { label: string; cls: string; full: string }> = {
  green: { label: "SIMULATED", cls: "bg-ok/15 text-ok border-ok/40", full: "Fully simulated" },
  blue: { label: "LIMITED SIM", cls: "bg-info/15 text-info border-info/40", full: "Supported with limited simulation (wiring, power and pins are checked)" },
  yellow: { label: "VISUAL", cls: "bg-warn/15 text-warn border-warn/40", full: "Visual / mechanical representation only" },
  grey: { label: "NOT YET SUPPORTED", cls: "bg-dim/15 text-muted border-dim/40", full: "Not yet supported by the simulator (no verified pinout or model) — see the suggested alternative" },
};
export function SimBadge({ status, full = false }: { status: SimStatus; full?: boolean }) {
  const s = STATUS[status];
  return (
    <span title={s.full} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider ${s.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {full ? s.full.toUpperCase() : s.label}
    </span>
  );
}
export const SIM_STATUS_INFO = STATUS;

export function Badge({ children, tone = "dim" }: { children: ReactNode; tone?: "dim" | "accent" | "brand" | "ok" | "warn" | "bad" }) {
  const t = { dim: "border-line2 text-muted", accent: "border-accent bg-accent font-semibold text-white", brand: "border-brand/45 text-brand", ok: "border-ok/50 text-ok", warn: "border-warn/50 text-warn", bad: "border-bad/50 text-bad" }[tone];
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${t}`}>{children}</span>;
}

export function Stat({ label, value, sub, tone = "text" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "text" | "accent" | "brand" | "ok" }) {
  const c = { text: "text-heading", accent: "text-accent-ink", brand: "text-brand", ok: "text-ok" }[tone];
  return (
    <div className="min-w-0">
      <div className="bf-label">{label}</div>
      <div className={`font-display text-2xl font-semibold ${c}`}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line2 p-10 text-center">
      <div className="font-display text-lg text-text">{title}</div>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      {label}
    </div>
  );
}

export function Progress({ value, tone = "accent" }: { value: number; tone?: "accent" | "brand" | "ok" }) {
  const c = { accent: "bg-accent", brand: "bg-brand", ok: "bg-ok" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-line">
      <div className={`h-full ${c} transition-all`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="bf-label">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-dim">{hint}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sage-900/45 p-4 backdrop-blur-sm" onMouseDown={onClose} role="dialog" aria-modal>
      <div className={`bf-panel max-h-[90vh] w-full overflow-auto ${wide ? "max-w-4xl" : "max-w-lg"}`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-base font-semibold text-heading">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-text" aria-label="Close">
            ✕
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex gap-1 rounded-md border border-line bg-bg2 p-0.5" role="tablist">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)} className={`rounded px-3 py-1 text-xs font-medium transition ${value === i.value ? "bg-accent text-white shadow-sm" : "text-muted hover:text-text"}`}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ kicker, title, children, actions }: { kicker?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <div className="bf-label mb-2 flex items-center gap-2 text-muted"><span className="h-[3px] w-5 rounded-full bg-accent" />{kicker}</div>}
        <h1 className="font-display text-3xl font-bold tracking-tight text-heading md:text-4xl">{title}</h1>
        {children && <p className="mt-1 max-w-2xl text-sm text-muted">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
