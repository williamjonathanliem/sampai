/**
 * Sampai logo.
 * The mark is a route line shaped like an S that runs from a start station (ring) to a terminus dot.
 * The dot is the full stop in "Sampai.": you have arrived.
 */
export const BRAND = {
  senja: "#5E3EB6", // violet, primary
  lampu: "#FACA4B", // signal yellow, the arrival dot
  malam: "#1C1B28", // ink
  kapur: "#F5F5F9", // chalk
  putih: "#FDFDFF", // surface
};

export const ROUTE_PATH = "M134 378H266A58 58 0 0 0 266 262H234A58 58 0 0 1 234 146H366";

type Tone = "violet" | "ink" | "light";

const tile: Record<Tone, { bg: string; line: string; dot: string }> = {
  violet: { bg: BRAND.senja, line: BRAND.putih, dot: BRAND.lampu },
  ink: { bg: BRAND.malam, line: BRAND.putih, dot: BRAND.lampu },
  light: { bg: BRAND.putih, line: BRAND.senja, dot: BRAND.lampu },
};

export function LogoMark({ size = 32, tone = "violet", className = "", title, animated = false }: { size?: number; tone?: Tone; className?: string; title?: string; animated?: boolean }) {
  const c = tile[tone];
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="512" height="512" rx="120" fill={c.bg} />
      <path d={ROUTE_PATH} fill="none" stroke={c.line} strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="134" cy="378" r="26" fill={c.bg} stroke={c.line} strokeWidth="16" />
      <circle cx="366" cy="146" r="44" fill={c.dot} className={animated ? "logo-dot-in" : undefined} />
    </svg>
  );
}

/** Mark plus "Sampai." The full stop is violet on light surfaces and yellow on violet or ink. */
export function Logo({ size = 28, onDark = false, className = "", animated = false }: { size?: number; onDark?: boolean; className?: string; animated?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} tone={onDark ? "light" : "violet"} animated={animated} />
      <span className={`font-bold tracking-[-0.03em] ${onDark ? "text-surface" : "text-fg"}`} style={{ fontSize: size * 0.72 }}>
        Sampai<span style={{ color: onDark ? BRAND.lampu : BRAND.senja }}>.</span>
      </span>
    </span>
  );
}
