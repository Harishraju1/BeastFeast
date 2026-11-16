"use client";
import { useApp } from "@/lib/store/app";

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={`pointer-events-auto rounded-md border px-4 py-2 text-sm shadow-xl backdrop-blur ${
            t.kind === "xp" ? "border-orange/60 bg-orange/15 font-display font-bold text-orange" : t.kind === "error" ? "border-bad/60 bg-bad/15 text-bad" : t.kind === "success" ? "border-ok/50 bg-ok/10 text-ok" : "border-line2 bg-panel text-text"
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
