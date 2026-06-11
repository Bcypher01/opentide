/** Minimal stroke icon set — consistent 24×24, currentColor, no fills unless noted. */

interface IconProps {
  size?: number;
  className?: string;
}

function Base({
  size = 16,
  className = "",
  children,
  filled = false,
}: IconProps & { children: React.ReactNode; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconFlame = (p: IconProps) => (
  <Base {...p}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3 2.5.5 4.5 2.5 4.5 5a4.5 4.5 0 1 1-9 0c0-1.15.43-2.2 1-3" />
    <path d="M12 2c1.5 2.5 4.5 5 4.5 9.5" />
  </Base>
);

export const IconTrendingUp = (p: IconProps) => (
  <Base {...p}>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </Base>
);

export const IconBell = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Base>
);

export const IconActivity = (p: IconProps) => (
  <Base {...p}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </Base>
);

export const IconClock = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </Base>
);

export const IconZap = (p: IconProps) => (
  <Base {...p}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </Base>
);

export const IconCandles = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 5v4" />
    <rect width="4" height="6" x="7" y="9" rx="1" />
    <path d="M9 15v2" />
    <path d="M17 3v2" />
    <rect width="4" height="8" x="15" y="5" rx="1" />
    <path d="M17 13v3" />
    <path d="M3 3v16a2 2 0 0 0 2 2h16" />
  </Base>
);

export const IconNews = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0V6" />
    <path d="M18 14h-8" />
    <path d="M18 18h-8" />
    <path d="M10 6h8v4h-8V6Z" />
  </Base>
);

export const IconStar = ({ filled = false, ...p }: IconProps & { filled?: boolean }) => (
  <Base {...p} filled={filled}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </Base>
);

export const IconCalendar = (p: IconProps) => (
  <Base {...p}>
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h18" />
  </Base>
);

export const IconSun = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </Base>
);

export const IconArrowUpRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 17 17 7" />
    <path d="M7 7h10v10" />
  </Base>
);
