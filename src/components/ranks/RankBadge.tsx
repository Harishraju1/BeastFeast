"use client";
import { rankByLevel } from "@/lib/ranks";

/**
 * Procedural rank badge in the brand palette (Forest Sage / Warm Ivory / Signal Red). Higher ranks gain
 * prestige in clear steps:
 *   1–4   ivory-outlined shield with 1–4 chevrons
 *   5–8   solid sage shield, ivory chevrons, a red crest bar (8 adds a second)
 *   9–12  red-rimmed shield with 1–4 stars
 *   13–15 ivory shield, red heart, laurel wings, crown points
 *   16    BEAST — red shield, ivory laurels and crown, glowing rim
 */
export function RankBadge({ level, size = 64, title }: { level: number; size?: number; title?: string }) {
  const lv = Math.max(1, Math.min(16, Math.round(level)));
  const name = rankByLevel(lv).name;
  const IVORY = "#F1EEE3";
  const SAGE = "#4B5A50";
  const DEEP = "#1E2721";
  const RED = "#F20B0B";
  const tier = lv <= 4 ? 1 : lv <= 8 ? 2 : lv <= 12 ? 3 : lv <= 15 ? 4 : 5;
  const shieldFill = tier === 1 ? DEEP : tier === 2 ? SAGE : tier === 3 ? DEEP : tier === 4 ? IVORY : RED;
  const rim = tier === 1 ? IVORY : tier === 2 ? IVORY : tier === 3 ? RED : tier === 4 ? RED : IVORY;
  const ink = tier === 4 ? RED : IVORY;
  const shield = "M50 8 L84 20 V48 C84 70 69 86 50 94 C31 86 16 70 16 48 V20 Z";

  const chevrons = (n: number, color: string) =>
    Array.from({ length: n }, (_, i) => <path key={i} d={`M32 ${66 - i * 9} L50 ${56 - i * 9} L68 ${66 - i * 9}`} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />);
  const star = (cx: number, cy: number, r: number, color: string, k: number) => {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
    }).join(" ");
    return <polygon key={k} points={pts} fill={color} />;
  };
  const laurel = (side: 1 | -1, color: string) => (
    <g transform={side === -1 ? "translate(100 0) scale(-1 1)" : undefined}>
      <path d="M14 30 C4 46 6 68 22 84" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => (
        <ellipse key={i} cx={10 + i * 2.5} cy={40 + i * 11} rx={3.2} ry={6.5} fill={color} transform={`rotate(${-35 + i * 10} ${10 + i * 2.5} ${40 + i * 11})`} />
      ))}
    </g>
  );

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? `${name} rank badge (level ${lv})`}>
      <title>{title ?? `${name} · level ${lv}`}</title>
      {tier === 5 && <circle cx="50" cy="52" r="47" fill="none" stroke={RED} strokeWidth="2" opacity="0.5" />}
      {tier >= 4 && laurel(1, tier === 5 ? IVORY : SAGE)}
      {tier >= 4 && laurel(-1, tier === 5 ? IVORY : SAGE)}
      <path d={shield} fill={shieldFill} stroke={rim} strokeWidth={tier === 1 ? 3 : 4} strokeLinejoin="round" />
      {tier === 2 && <rect x="30" y="24" width="40" height="5" rx="2.5" fill={RED} />}
      {tier === 2 && lv === 8 && <rect x="36" y="31" width="28" height="4" rx="2" fill={RED} />}
      {tier === 1 && chevrons(lv, ink)}
      {tier === 2 && chevrons(Math.min(3, lv - 4), ink)}
      {tier === 3 && (() => {
        const n = lv - 8;
        const xs = n === 1 ? [50] : n === 2 ? [38, 62] : n === 3 ? [32, 50, 68] : [30, 44, 56, 70];
        return [...xs.map((x, i) => star(x, 50, n >= 4 ? 7.5 : 9, ink, i)), <rect key="bar" x="32" y="66" width="36" height="4" rx="2" fill={RED} />];
      })()}
      {tier === 4 && (
        <>
          <path d="M50 70 C40 62 33 55 33 47 C33 41 38 37 43 37 C46 37 48.5 39 50 41.5 C51.5 39 54 37 57 37 C62 37 67 41 67 47 C67 55 60 62 50 70 Z" fill={RED} />
          {lv >= 14 && star(50, 28, 6, RED, 1)}
          {lv >= 15 && <path d="M30 26 L34 18 L40 24 L50 14 L60 24 L66 18 L70 26 Z" fill={RED} transform="translate(0 -12)" />}
        </>
      )}
      {tier === 5 && (
        <>
          <path d="M30 26 L34 16 L41 23 L50 11 L59 23 L66 16 L70 26 Z" fill={IVORY} transform="translate(0 -9)" />
          <text x="50" y="62" textAnchor="middle" fontFamily="Space Grotesk, sans-serif" fontWeight={700} fontSize="17" fill={IVORY} letterSpacing="0.5">BEAST</text>
        </>
      )}
      <text x="50" y="88" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill={tier === 4 ? SAGE : IVORY} opacity="0.9">{lv}</text>
    </svg>
  );
}
