import type { SessionId } from "./sessions";

export type Market = "forex" | "crypto" | "stocks";

export interface AssetDef {
  /** unique id, e.g. "crypto:BTC" */
  id: string;
  market: Market;
  symbol: string; // display symbol, e.g. "EUR/USD", "BTC", "AAPL"
  name: string;
  /** sessions in which this asset is typically most active (crypto = all) */
  sessions: SessionId[];
  /** lowercase keywords for news tagging */
  newsKeywords: string[];
  /** stock exchange for TradingView symbol mapping */
  exchange?: "NASDAQ" | "NYSE";
}

const fx = (
  symbol: string,
  name: string,
  sessions: SessionId[],
  newsKeywords: string[]
): AssetDef => ({
  id: `forex:${symbol}`,
  market: "forex",
  symbol,
  name,
  sessions,
  newsKeywords: [symbol.toLowerCase(), symbol.toLowerCase().replace("/", ""), ...newsKeywords],
});

const cx = (symbol: string, name: string, newsKeywords: string[]): AssetDef => ({
  id: `crypto:${symbol}`,
  market: "crypto",
  symbol,
  name,
  sessions: ["sydney", "tokyo", "london", "newyork"],
  newsKeywords,
});

const st = (
  symbol: string,
  name: string,
  exchange: "NASDAQ" | "NYSE",
  newsKeywords: string[]
): AssetDef => ({
  id: `stocks:${symbol}`,
  market: "stocks",
  symbol,
  name,
  sessions: ["newyork"],
  newsKeywords,
  exchange,
});

export const FOREX_PAIRS: AssetDef[] = [
  fx("EUR/USD", "Euro / US Dollar", ["london", "newyork"], ["euro", "ecb", "european central bank"]),
  fx("GBP/USD", "British Pound / US Dollar", ["london", "newyork"], ["pound sterling", "bank of england", "cable"]),
  fx("USD/JPY", "US Dollar / Japanese Yen", ["tokyo", "newyork"], ["yen", "bank of japan", "boj"]),
  fx("USD/CHF", "US Dollar / Swiss Franc", ["london"], ["swiss franc", "snb"]),
  fx("AUD/USD", "Australian Dollar / US Dollar", ["sydney", "tokyo"], ["aussie dollar", "australian dollar", "rba"]),
  fx("NZD/USD", "NZ Dollar / US Dollar", ["sydney", "tokyo"], ["kiwi dollar", "new zealand dollar", "rbnz"]),
  fx("USD/CAD", "US Dollar / Canadian Dollar", ["newyork"], ["canadian dollar", "loonie", "bank of canada"]),
  fx("EUR/GBP", "Euro / British Pound", ["london"], []),
  fx("GBP/JPY", "British Pound / Japanese Yen", ["london", "tokyo"], []),
];

export const CRYPTO_ASSETS: AssetDef[] = [
  cx("BTC", "Bitcoin", ["bitcoin"]),
  cx("ETH", "Ethereum", ["ethereum", "ether "]),
  cx("SOL", "Solana", ["solana"]),
  cx("BNB", "BNB", ["binance coin"]),
  cx("XRP", "XRP", ["xrp", "ripple"]),
  cx("ADA", "Cardano", ["cardano"]),
  cx("DOGE", "Dogecoin", ["dogecoin"]),
  cx("AVAX", "Avalanche", ["avalanche"]),
  cx("LINK", "Chainlink", ["chainlink"]),
  cx("DOT", "Polkadot", ["polkadot"]),
  cx("LTC", "Litecoin", ["litecoin"]),
  cx("UNI", "Uniswap", ["uniswap"]),
  cx("ATOM", "Cosmos", ["cosmos hub", "atom token"]),
  cx("NEAR", "NEAR", ["near protocol"]),
  cx("TRX", "TRON", ["tron"]),
  cx("SHIB", "Shiba Inu", ["shiba inu"]),
];

export const STOCK_ASSETS: AssetDef[] = [
  st("AAPL", "Apple", "NASDAQ", ["apple"]),
  st("MSFT", "Microsoft", "NASDAQ", ["microsoft"]),
  st("NVDA", "NVIDIA", "NASDAQ", ["nvidia"]),
  st("AMZN", "Amazon", "NASDAQ", ["amazon"]),
  st("GOOGL", "Alphabet", "NASDAQ", ["alphabet", "google"]),
  st("META", "Meta Platforms", "NASDAQ", ["meta platforms", "facebook", "instagram"]),
  st("TSLA", "Tesla", "NASDAQ", ["tesla", "elon musk"]),
  st("JPM", "JPMorgan Chase", "NYSE", ["jpmorgan", "jamie dimon"]),
  st("V", "Visa", "NYSE", ["visa "]),
  st("XOM", "Exxon Mobil", "NYSE", ["exxon"]),
  st("AMD", "AMD", "NASDAQ", ["advanced micro devices"]),
  st("NFLX", "Netflix", "NASDAQ", ["netflix"]),
];

export const ALL_ASSETS: AssetDef[] = [...FOREX_PAIRS, ...CRYPTO_ASSETS, ...STOCK_ASSETS];

export const ASSET_BY_ID: Record<string, AssetDef> = Object.fromEntries(
  ALL_ASSETS.map((a) => [a.id, a])
);

// ---------------------------------------------------------------------------
// Custom (non-curated) assets — coins/stocks a user adds from universal search.
//
// The curated arrays above are the polled, session-tagged, AI-grounded core.
// A CustomAsset is the minimum we need to treat an off-universe symbol as a
// first-class watchlist member: render it (symbol/name/market), quote it
// (quoteSymbol → /api/quote) and chart it (chartId → resolveChartTarget). Only
// crypto + stocks are supported; forex has no honest free per-pair source.
// ---------------------------------------------------------------------------

/** How many custom STOCKS a single user may track (Finnhub free-tier budget). */
export const CUSTOM_STOCK_CAP = 10;

export interface CustomAsset {
  id: string; // "crypto:PEPE" | "stocks:TSLA" — shares the curated id namespace
  market: "crypto" | "stocks";
  symbol: string; // display, e.g. "PEPE", "TSLA"
  name: string;
  /** Symbol to quote: Binance pair ("PEPEUSDT") for crypto, ticker for stocks. */
  quoteSymbol: string;
  /** "custom|TV:SYMBOL|Label" id resolveChartTarget() understands. */
  chartId: string;
}

/** Promote a CustomAsset into the AssetDef shape the UI renders, deriving the
 *  fields curated assets carry (sessions by market; no news keywords). */
export function customToAssetDef(c: CustomAsset): AssetDef {
  return {
    id: c.id,
    market: c.market,
    symbol: c.symbol,
    name: c.name,
    sessions:
      c.market === "crypto"
        ? ["sydney", "tokyo", "london", "newyork"]
        : ["newyork"],
    newsKeywords: [],
  };
}

/** Resolve an id to an AssetDef from the curated map first, then a caller-
 *  supplied custom registry (the client store). Undefined if neither knows it. */
export function resolveAsset(
  id: string,
  custom?: Record<string, CustomAsset>,
): AssetDef | undefined {
  const curated = ASSET_BY_ID[id];
  if (curated) return curated;
  const c = custom?.[id];
  return c ? customToAssetDef(c) : undefined;
}

/** Binance stream symbols for the crypto list (USDT-quoted). */
export const BINANCE_SYMBOLS = CRYPTO_ASSETS.map((a) => `${a.symbol}USDT`);

export const SUGGESTED_STARS = ["crypto:BTC", "forex:EUR/USD", "stocks:NVDA"];

export const DEFAULT_CHART_ASSET = "crypto:BTC";

/** TradingView symbol for the free embedded chart. */
export function tvSymbol(a: AssetDef): string {
  if (a.market === "crypto") return `BINANCE:${a.symbol}USDT`;
  if (a.market === "forex") return `FX:${a.symbol.replace("/", "")}`;
  return `${a.exchange ?? "NASDAQ"}:${a.symbol}`;
}

/**
 * Tag a news headline/summary with asset ids.
 * Full names match case-insensitively; tickers (len ≥ 3) match as exact
 * uppercase words to avoid false positives (near, uni, atom...).
 */
export function tagAssets(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const ids: string[] = [];
  for (const a of ALL_ASSETS) {
    let hit = a.newsKeywords.some((kw) => lower.includes(kw));
    if (!hit && a.symbol.length >= 3 && !a.symbol.includes("/")) {
      hit = new RegExp(`(^|[^A-Za-z0-9])${a.symbol}([^A-Za-z0-9]|$)`).test(text);
    }
    if (hit) ids.push(a.id);
  }
  return ids;
}

/**
 * High-impact macro vocabulary — the headlines that actually move markets
 * (central banks, rate decisions, inflation/jobs prints, systemic risk).
 * Used to weight news relevance, the ForexFactory "red folder" analogue.
 * Lowercase; matched as substrings against title + summary.
 */
export const HIGH_IMPACT_KEYWORDS: string[] = [
  // central banks / policy
  "federal reserve",
  "the fed",
  "fomc",
  "rate decision",
  "rate hike",
  "rate cut",
  "interest rate",
  "basis point",
  "ecb",
  "european central bank",
  "bank of england",
  "bank of japan",
  "boj",
  "powell",
  "lagarde",
  "monetary policy",
  "quantitative",
  // macro prints
  "inflation",
  "cpi",
  "ppi",
  "pce",
  "nonfarm",
  "non-farm",
  "payrolls",
  "jobs report",
  "unemployment",
  "gdp",
  "recession",
  // systemic / cross-asset shocks
  "tariff",
  "default",
  "downgrade",
  "sanction",
  "central bank",
];

/**
 * Count distinct high-impact keyword hits in a headline (+summary).
 * Capped at 3 so a single keyword-stuffed story can't dominate.
 */
export function impactKeywordHits(text: string): number {
  const lower = ` ${text.toLowerCase()} `;
  let n = 0;
  for (const kw of HIGH_IMPACT_KEYWORDS) {
    if (lower.includes(kw)) {
      n += 1;
      if (n >= 3) break;
    }
  }
  return n;
}
