// ---------------------------------------------------------------------------
// Search — pure, dependency-free ranking + result builders for the ⌘K palette.
//
// No React, no network, no Fuse. Tickers are short and exact-match-dominant,
// so a small prefix/word-boundary scorer is faster and more predictable than
// fuzzy matching. Everything here is a pure function of its inputs, so it's
// trivially unit-testable.
// ---------------------------------------------------------------------------

import type { AssetDef, CustomAsset, Market } from "./assets";
import { ASSET_BY_ID } from "./assets";
import { PRESETS, type PresetId } from "./presets";

export type ResultKind = "asset" | "symbol" | "news" | "calendar" | "preset";
export type ResultAction = "chart" | "link" | "calendar" | "preset";

export interface SearchResult {
  kind: ResultKind;
  /** stable React key — also the keyboard-nav id */
  key: string;
  title: string;
  subtitle?: string;
  score: number;
  action: ResultAction;
  /** action === "chart": id passed to openModal() (asset id or "custom|TV:SYM|Label") */
  chartId?: string;
  /** action === "link": external URL (news) */
  href?: string;
  /** action === "calendar": event timestamp (for context) */
  eventTs?: number;
  market?: Market;
  /** Present on full-universe symbol hits — metadata to star/track the asset. */
  track?: CustomAsset;
  /** action === "preset": the trader profile to apply. */
  presetId?: PresetId;
}

/** Slim shapes the palette feeds in — kept local so search.ts has no UI deps. */
export interface NewsLike {
  title: string;
  link: string;
  source: string;
  market: Market;
  ts: number;
}
export interface CalendarLike {
  id: string;
  title: string;
  country: string;
  ts: number;
  impact: string;
}
export interface StockHit {
  symbol: string; // e.g. "AAPL"
  description: string; // e.g. "APPLE INC"
}
export interface CryptoHit {
  symbol: string; // e.g. "BTCUSDT"
  base: string; // e.g. "BTC"
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Score a single field against the query.
 *   exact 100 · prefix 80 · word-boundary 55 · substring 30 · miss 0
 */
export function scoreField(query: string, field: string): number {
  if (!field || !query) return 0;
  const q = query.trim().toLowerCase();
  const f = field.toLowerCase();
  if (!q) return 0;
  if (f === q) return 100;
  if (f.startsWith(q)) return 80;
  if (new RegExp(`\\b${escapeRegex(q)}`).test(f)) return 55;
  if (f.includes(q)) return 30;
  return 0;
}

/** Best score across an asset's symbol, plain symbol, name and keywords. */
function scoreAsset(query: string, a: AssetDef): number {
  const plain = a.symbol.replace("/", "");
  return Math.max(
    scoreField(query, a.symbol),
    scoreField(query, plain),
    Math.round(scoreField(query, a.name) * 0.92),
    ...a.newsKeywords.map((k) => Math.round(scoreField(query, k) * 0.5))
  );
}

/** Sort by score desc (stable-ish via title tiebreak) and cap. */
export function rank(results: SearchResult[], cap: number): SearchResult[] {
  return results
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, cap);
}

// --- Local tier ------------------------------------------------------------

export function searchAssets(query: string, assets: AssetDef[]): SearchResult[] {
  const out: SearchResult[] = [];
  for (const a of assets) {
    const score = scoreAsset(query, a);
    if (score <= 0) continue;
    out.push({
      kind: "asset",
      key: `asset:${a.id}`,
      title: a.symbol,
      subtitle: `${a.name} · ${a.market}`,
      score,
      action: "chart",
      chartId: a.id,
      market: a.market,
    });
  }
  return out;
}

export function searchNews(
  query: string,
  items: NewsLike[],
  now: number
): SearchResult[] {
  const out: SearchResult[] = [];
  for (const it of items) {
    let score = scoreField(query, it.title);
    if (score <= 0) continue;
    // Gentle freshness boost so fresher headlines edge ahead at equal text score.
    const ageH = Math.max(0, (now - it.ts) / 3_600_000);
    score += Math.max(0, 8 - ageH * 0.25);
    out.push({
      kind: "news",
      key: `news:${it.link}`,
      title: it.title,
      subtitle: `${it.source} · ${it.market}`,
      score,
      action: "link",
      href: it.link,
      market: it.market,
    });
  }
  return out;
}

export function searchCalendar(
  query: string,
  events: CalendarLike[]
): SearchResult[] {
  const out: SearchResult[] = [];
  for (const e of events) {
    const score = Math.max(
      scoreField(query, e.title),
      Math.round(scoreField(query, e.country) * 0.6)
    );
    if (score <= 0) continue;
    out.push({
      kind: "calendar",
      key: `cal:${e.id}`,
      title: e.title,
      subtitle: `${e.country} · ${e.impact}`,
      score,
      action: "calendar",
      eventTs: e.ts,
    });
  }
  return out;
}

// --- Trader profiles (commands, not data) ----------------------------------

/** Casual words that should surface a given persona beyond its exact label. */
const PRESET_SYNONYMS: Record<PresetId, string[]> = {
  "london-fx": ["fx", "forex", "scalp", "scalper", "london", "majors", "pairs"],
  "ny-equities": ["equities", "stocks", "equity", "ny", "new york", "shares"],
  "crypto-247": ["crypto", "degen", "coins", "altcoin", "bitcoin", "24/7"],
  swing: ["swing", "daily", "dailies", "position", "macro"],
};

/** Generic words that should list every persona (e.g. "preset", "profile"). */
const PRESET_TRIGGERS = ["persona", "preset", "profile", "layout", "trader"];

export function searchPresets(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const listAll = PRESET_TRIGGERS.some(
    (w) => w.startsWith(q) || (q.length >= 3 && w.includes(q)),
  );
  const out: SearchResult[] = [];
  for (const p of PRESETS) {
    let score = Math.max(
      scoreField(query, p.label),
      Math.round(scoreField(query, p.id.replace(/-/g, " ")) * 0.9),
    );
    for (const syn of PRESET_SYNONYMS[p.id]) {
      score = Math.max(score, Math.round(scoreField(query, syn) * 0.85));
    }
    if (listAll) score = Math.max(score, 40);
    if (score <= 0) continue;
    out.push({
      kind: "preset",
      key: `preset:${p.id}`,
      title: p.label,
      subtitle: p.blurb,
      score,
      action: "preset",
      presetId: p.id,
    });
  }
  return out;
}

// --- Remote tier (full universe) -------------------------------------------

/** TradingView chart id for a non-curated stock (default exchange resolution). */
export function stockChartId(symbol: string): string {
  return `custom|${symbol}|${symbol}`;
}

/** TradingView chart id for a non-curated Binance pair. */
export function cryptoChartId(symbol: string, base: string): string {
  return `custom|BINANCE:${symbol}|${base}`;
}

/** Curated symbols, so universe hits don't duplicate what we already list. */
const CURATED_STOCKS = new Set(
  Object.values(ASSET_BY_ID)
    .filter((a) => a.market === "stocks")
    .map((a) => a.symbol)
);
const CURATED_CRYPTO_BASES = new Set(
  Object.values(ASSET_BY_ID)
    .filter((a) => a.market === "crypto")
    .map((a) => a.symbol)
);

export function searchStockUniverse(
  query: string,
  hits: StockHit[]
): SearchResult[] {
  const out: SearchResult[] = [];
  for (const h of hits) {
    if (!h.symbol || CURATED_STOCKS.has(h.symbol)) continue;
    const score = Math.max(
      scoreField(query, h.symbol),
      Math.round(scoreField(query, h.description) * 0.9)
    );
    if (score <= 0) continue;
    out.push({
      kind: "symbol",
      key: `sym:stock:${h.symbol}`,
      title: h.symbol,
      subtitle: `${h.description} · stocks`,
      score,
      action: "chart",
      chartId: stockChartId(h.symbol),
      market: "stocks",
      track: {
        id: `stocks:${h.symbol}`,
        market: "stocks",
        symbol: h.symbol,
        name: h.description,
        quoteSymbol: h.symbol,
        chartId: stockChartId(h.symbol),
      },
    });
  }
  return out;
}

export function searchCryptoUniverse(
  query: string,
  list: CryptoHit[]
): SearchResult[] {
  const out: SearchResult[] = [];
  for (const h of list) {
    if (!h.base || CURATED_CRYPTO_BASES.has(h.base)) continue;
    const score = Math.max(
      scoreField(query, h.base),
      Math.round(scoreField(query, h.symbol) * 0.8)
    );
    if (score <= 0) continue;
    out.push({
      kind: "symbol",
      key: `sym:crypto:${h.symbol}`,
      title: h.base,
      subtitle: `${h.symbol} · crypto`,
      score,
      action: "chart",
      chartId: cryptoChartId(h.symbol, h.base),
      market: "crypto",
      track: {
        id: `crypto:${h.base}`,
        market: "crypto",
        symbol: h.base,
        name: h.base,
        quoteSymbol: h.symbol,
        chartId: cryptoChartId(h.symbol, h.base),
      },
    });
  }
  return out;
}
