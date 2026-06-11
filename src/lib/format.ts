/** Price formatting tuned per asset class / magnitude. */
export function formatPrice(value: number, market: "forex" | "crypto" | "stocks"): string {
  if (!Number.isFinite(value)) return "—";
  if (market === "forex") {
    // JPY-quoted pairs trade ~100–200; others ~0.5–2
    return value >= 20 ? value.toFixed(3) : value.toFixed(5);
  }
  if (market === "crypto") {
    if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (value >= 0.01) return value.toFixed(4);
    return value.toPrecision(3);
  }
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatChangePct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/** "2026-06-24" → "24th Jun" (adds the year only when it differs from the current one). */
export function formatCalendarDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = d.getUTCDate();
  const ord =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return sameYear ? `${day}${ord} ${month}` : `${day}${ord} ${month} ${d.getUTCFullYear()}`;
}

export function timeAgo(ts: number | null, now: number): string {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
