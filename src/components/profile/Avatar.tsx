/* eslint-disable @next/next/no-img-element -- avatars come from Supabase Storage / local data URLs at a fixed small size */
/** Round profile picture with the student's initial as the default avatar. */
export function Avatar({ name, src, size = 32, className = "" }: { name: string; src?: string | null; size?: number; className?: string }) {
  const safe = src && (src.startsWith("https://") || src.startsWith("data:image/")) ? src : null;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand font-display font-semibold text-on-brand ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.42) }}
      aria-hidden={safe ? undefined : true}
    >
      {safe ? <img src={safe} alt={`${name}'s profile picture`} width={size} height={size} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : (name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
