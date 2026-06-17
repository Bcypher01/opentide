import type { Market } from "./assets";

export type NewsWeight = "high" | "med" | "low";

/** Per-market accent dot (kept in sync with the dashboard palette). */
export const MARKET_COLOR: Record<Market, string> = {
  crypto: "#00D4AA",
  forex: "#4FA8E8",
  stocks: "#E8B44F",
};

/**
 * Impact weighting visuals — the ForexFactory red/orange/yellow analogue.
 * `border` is a left-edge accent on the row; `dot` matches it.
 */
export const WEIGHT_META: Record<
  NewsWeight,
  { label: string; color: string; rank: number }
> = {
  high: { label: "High impact", color: "var(--accent, #00D4AA)", rank: 3 },
  med: { label: "Notable", color: "#E8B44F", rank: 2 },
  low: { label: "Routine", color: "transparent", rank: 1 },
};

/** Time buckets for the wire, newest first. */
export type DayBucket = "new" | "today" | "earlier";

export const BUCKET_LABEL: Record<DayBucket, string> = {
  new: "New · last 30 min",
  today: "Today",
  earlier: "Earlier",
};

export const BUCKET_ORDER: DayBucket[] = ["new", "today", "earlier"];

/** Classify a timestamp into a display bucket relative to `now`. */
export function dayBucket(ts: number, now: number): DayBucket {
  if (now - ts < 30 * 60_000) return "new";
  const a = new Date(ts);
  const b = new Date(now);
  const sameDay =
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  return sameDay ? "today" : "earlier";
}

/** The public RSS wires powering the newswire, in display order. */
export const NEWS_SOURCES: Array<{ name: string; market: Market }> = [
  { name: "CoinDesk", market: "crypto" },
  { name: "Cointelegraph", market: "crypto" },
  { name: "CNBC Markets", market: "stocks" },
  { name: "MarketWatch", market: "stocks" },
  { name: "FXStreet", market: "forex" },
  { name: "investingLive", market: "forex" },
  { name: "CNBC FX", market: "forex" },
];

export const MARKET_LABEL: Record<Market, string> = {
  forex: "Forex",
  crypto: "Crypto",
  stocks: "Stocks",
};
