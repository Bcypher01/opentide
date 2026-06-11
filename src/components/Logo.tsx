/**
 * Opentide brand mark — "The Session Wave".
 * Three overlapping rings = the Asian, London and New York sessions reading
 * left to right like a continuous wave. The vesica lenses where they overlap
 * are the high-liquidity windows — the only place the live teal appears —
 * and the dot is the "now" cursor. Flat, no gradients.
 */
const TEAL = "#00D4AA";
const SILVER = "#94A3B8";

export default function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      {/* session rings */}
      <g stroke={SILVER} strokeWidth="2.6" opacity="0.55">
        <circle cx="13" cy="24" r="10" />
        <circle cx="24" cy="24" r="10" />
        <circle cx="35" cy="24" r="10" />
      </g>
      {/* high-liquidity overlaps */}
      <g stroke={TEAL} strokeWidth="2.6" fill={TEAL} fillOpacity="0.16">
        <path d="M18.5 15.65 A10 10 0 0 1 18.5 32.35 A10 10 0 0 1 18.5 15.65 Z" />
        <path d="M29.5 15.65 A10 10 0 0 1 29.5 32.35 A10 10 0 0 1 29.5 15.65 Z" />
      </g>
      {/* the now-cursor, riding the top of the middle session like a clock hand */}
      <circle cx="24" cy="14" r="2" fill={TEAL} />
    </svg>
  );
}

/** Wordmark: "Open" in text color, "tide" in brand teal. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-display font-semibold ${className}`}
      style={{ letterSpacing: "0.02em" }}
    >
      Open<span style={{ color: TEAL }}>tide</span>
    </span>
  );
}
