"use client";
import { getComponent } from "@/lib/catalogue";
import type { DiagramSpec } from "@/lib/learning/types";
import { PinoutDiagram } from "@/components/library/PinoutDiagram";
import { THEME } from "@/lib/theme";

/** Renders the technical diagrams that come with lessons and quiz questions. */
export function Diagram({ spec }: { spec: DiagramSpec }) {
  if (spec.kind === "pinout") {
    const c = getComponent(spec.componentId);
    if (!c) return <div className="text-xs text-dim">Pinout for {spec.componentId} not in the catalogue.</div>;
    return (
      <figure className="rounded-lg border border-line bg-bg2 p-3">
        <PinoutDiagram comp={c} highlight={spec.highlight} />
        <figcaption className="mt-1 text-center text-[11px] text-dim">{c.name} pinout (generated from the catalogue pin table){spec.highlight?.length ? ` — highlighted: ${spec.highlight.join(", ")}` : ""}</figcaption>
      </figure>
    );
  }
  if (spec.kind === "circuit") {
    const xs = spec.nodes.map((n) => n.x),
      ys = spec.nodes.map((n) => n.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const W = 520,
      H = 260,
      pad = 60;
    const sx = (x: number) => pad + ((x - minX) / Math.max(1e-6, maxX - minX)) * (W - 2 * pad);
    const sy = (y: number) => pad / 1.5 + ((y - minY) / Math.max(1e-6, maxY - minY)) * (H - 2 * (pad / 1.5));
    const byId = new Map(spec.nodes.map((n) => [n.id, n]));
    return (
      <figure className="rounded-lg border border-line bg-bg2 p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {spec.edges.map((e, i) => {
            const a = byId.get(e.from),
              b = byId.get(e.to);
            if (!a || !b) return null;
            const col = e.wrong ? THEME.accent : e.color ?? THEME.warn;
            return (
              <g key={i}>
                <line x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)} stroke={col} strokeWidth={2} strokeDasharray={e.wrong ? "6 4" : undefined} />
                {e.label && <text x={(sx(a.x) + sx(b.x)) / 2} y={(sy(a.y) + sy(b.y)) / 2 - 5} textAnchor="middle" fill={THEME.ivoryMuted} fontSize={10} fontFamily="JetBrains Mono">{e.label}</text>}
              </g>
            );
          })}
          {spec.nodes.map((n) => (
            <g key={n.id}>
              <rect x={sx(n.x) - 52} y={sy(n.y) - 14} width={104} height={28} rx={5} fill={THEME.card} stroke={THEME.cardLine} />
              <text x={sx(n.x)} y={sy(n.y) + 4} textAnchor="middle" fill={THEME.cardInk} fontSize={10.5} fontFamily="Space Grotesk">{n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}</text>
            </g>
          ))}
        </svg>
      </figure>
    );
  }
  if (spec.kind === "signal") {
    const all = spec.series.flatMap((s) => s.points);
    const minX = Math.min(...all.map((p) => p[0])),
      maxX = Math.max(...all.map((p) => p[0]));
    const minY = Math.min(0, ...all.map((p) => p[1])),
      maxY = Math.max(...all.map((p) => p[1]));
    const W = 520,
      H = 200,
      L = 46,
      B = 30;
    const sx = (x: number) => L + ((x - minX) / Math.max(1e-9, maxX - minX)) * (W - L - 12);
    const sy = (y: number) => H - B - ((y - minY) / Math.max(1e-9, maxY - minY)) * (H - B - 14);
    const colors = [THEME.accent, THEME.ivory, THEME.ok, THEME.warn];
    return (
      <figure className="rounded-lg border border-line bg-bg2 p-2">
        <div className="mb-1 text-xs font-semibold">{spec.title}</div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <line x1={L} y1={H - B} x2={W - 8} y2={H - B} stroke={THEME.hairline2} />
          <line x1={L} y1={10} x2={L} y2={H - B} stroke={THEME.hairline2} />
          <text x={W / 2} y={H - 6} textAnchor="middle" fill={THEME.ivoryMuted} fontSize={10}>{spec.xLabel}</text>
          <text x={12} y={H / 2} fill={THEME.ivoryMuted} fontSize={10} transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">{spec.yLabel}</text>
          <text x={L - 4} y={sy(maxY) + 4} textAnchor="end" fill={THEME.ivoryDim} fontSize={9}>{maxY}</text>
          <text x={L - 4} y={sy(minY) + 4} textAnchor="end" fill={THEME.ivoryDim} fontSize={9}>{minY}</text>
          {spec.series.map((s, i) => (
            <polyline key={s.label} points={s.points.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")} fill="none" stroke={colors[i % 4]} strokeWidth={2} />
          ))}
        </svg>
        <div className="flex flex-wrap gap-3 text-[11px]">
          {spec.series.map((s, i) => <span key={s.label} style={{ color: colors[i % 4] }}>■ {s.label}</span>)}
        </div>
      </figure>
    );
  }
  if (spec.kind === "flow")
    return (
      <figure className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-bg2 p-3 text-xs">
        {spec.steps.map((s, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className="rounded border border-brand/40 bg-brand/5 px-2 py-1">{s}</span>
            {i < spec.steps.length - 1 && <span className="text-accent-ink">→</span>}
          </span>
        ))}
      </figure>
    );
  return (
    <figure className="rounded-lg border border-line bg-bg2 p-3">
      <div className="text-center font-mono text-lg text-accent-ink">{spec.latexish}</div>
      <dl className="mt-2 grid grid-cols-[60px_1fr] gap-1 text-xs">
        {Object.entries(spec.legend).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-brand">{k}</dt>
            <dd className="text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}

/** Body text: paragraphs separated by blank lines, "- " bullets. */
export function Prose({ text }: { text: string }) {
  return (
    <div className="prose-bf text-sm">
      {text.split(/\n\n+/).map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => l.trim().startsWith("- "))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{l.trim().slice(2)}</li>)}</ul>;
        return <p key={i}>{block}</p>;
      })}
    </div>
  );
}
