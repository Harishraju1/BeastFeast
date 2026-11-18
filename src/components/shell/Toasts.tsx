"use client";
import { useApp } from "@/lib/store/app";

/**
 * Floating notices for normal pages. On canvas pages (workspace, track editor) the shell shows the newest
 * notice inside the header instead, so nothing ever covers the canvas; every notice is also kept in the
 * notification panel (bell).
 */
export function Toasts({ hidden = false }: { hidden?: boolean }) {
  const { toasts, dismissToast } = useApp();
  if (hidden) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={`pointer-events-auto rounded-md border px-4 py-2 text-sm shadow-[var(--shadow-lg)] bf-rise ${
            t.kind === "xp" ? "border-accent bg-accent font-display font-bold text-white" : t.kind === "error" ? "border-bad/50 bg-panel text-bad border-l-4" : t.kind === "success" ? "border-ok/50 bg-panel text-ok border-l-4" : "border-line2 bg-panel text-text"
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
