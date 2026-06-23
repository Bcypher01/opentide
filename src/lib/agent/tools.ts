// ---------------------------------------------------------------------------
// agent/tools.ts — the read-only tool registry the agent can call.
//
// Each tool wraps data the dashboard already serves (via internalFetch.readRoute)
// and is described to the model with a JSON-schema arg spec. The runtime
// (agent/runtime.ts) validates the model's args against the universe BEFORE
// invoking a handler, and handlers themselves never throw — on any upstream
// miss they return a small { error } object so the model can react and move on.
//
// SAFETY INVARIANT: every tool here is READ-ONLY. There is deliberately no tool
// that places an order, moves money, or mutates state — that property is
// structural (no such handler exists), not merely prompt-instructed. Surfacing
// and explaining ideas is fine; acting is always the user's job.
//
// Cost note: most tools are pure data reads against already-cached /api/* routes,
// so they cost ~one cheap HTTP round trip and zero LLM tokens upstream of the
// agent's own turn. The ONLY exception is get_recommendations, which reads the
// shared, 10-min-cached recommendations route — a cache HIT is free; a MISS
// triggers one upstream LLM call. It is deliberately described as "expensive,
// use sparingly" so the model doesn't reach for it on simple questions.
// ---------------------------------------------------------------------------

import { ALL_ASSETS, ASSET_BY_ID, type Market } from "@/lib/assets";
import { readRoute } from "@/lib/internalFetch";
import type { LlmTool } from "@/lib/llm";

/** A registered tool: its model-facing declaration + a validated handler. */
export interface ToolDef extends LlmTool {
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const MARKETS: readonly Market[] = ["crypto", "forex", "stocks"];

// --- shared upstream payload shapes (minimal, local) -----------------------
interface QuotesPayload {
  quotes?: Array<{ symbol: string; price: number; changePct: number | null }>;
}
interface PulsePayload {
  fearGreed?: { value: number; classification: string } | null;
  stockFearGreed?: { value: number; classification: string } | null;
  btcDominance?: number | null;
  mcapChangePct?: number | null;
  dxy?: { value: number } | null;
  yields?: { spread: number } | null;
}
interface NewsPayload {
  items?: Array<{
    title: string;
    link?: string;
    source: string;
    market: string;
    assets: string[];
    weight: string;
  }>;
}
interface DerivsPayload {
  funding?: Array<{ symbol: string; rate: number }>;
  detail?: Array<{
    symbol: string;
    oiChangePct: number | null;
    longShortRatio: number | null;
  }>;
  error?: string;
}
interface CalendarPayload {
  events?: Array<{
    title: string;
    country: string;
    ts: number;
    impact: string;
    forecast: string | null;
    previous: string | null;
  }> | null;
  anchors?: Array<{ kind: string; title: string; ts: number }>;
}
interface RecsPayload {
  recommendations?: Array<{
    title: string;
    rationale: string;
    action: string;
    priority: number;
    assetId: string | null;
  }>;
  degraded?: boolean;
}

const ROUTE_BY_MARKET: Record<Market, string> = {
  crypto: "/api/crypto",
  forex: "/api/forex",
  stocks: "/api/stocks",
};

type QuoteRow = { symbol: string; price: number; changePct: number | null };

/** Read one market's quotes (cached upstream). Null on failure. */
async function readQuotes(market: Market): Promise<QuoteRow[] | null> {
  const payload = await readRoute<QuotesPayload>(ROUTE_BY_MARKET[market], 30);
  return payload?.quotes ?? null;
}

// --- get_quotes -------------------------------------------------------------
const getQuotes: ToolDef = {
  name: "get_quotes",
  description:
    "Get live price and 24h % change for assets in one market (crypto, forex, or stocks). Optionally filter to specific symbols (e.g. BTC, EUR/USD, NVDA). Use this to ground any claim about where a price is or how much it has moved.",
  parameters: {
    type: "object",
    properties: {
      market: {
        type: "string",
        enum: ["crypto", "forex", "stocks"],
        description: "Which market to read quotes from.",
      },
      symbols: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional display symbols to filter to (e.g. ['BTC','ETH']). Omit for the whole market.",
      },
    },
    required: ["market"],
  },
  handler: async (args) => {
    const market = String(args.market) as Market;
    if (!MARKETS.includes(market)) return { error: "unknown market" };

    const quotesAll = await readQuotes(market);
    if (!quotesAll) return { error: "quotes unavailable" };

    let quotes = quotesAll;
    if (Array.isArray(args.symbols) && args.symbols.length) {
      const want = new Set(
        args.symbols
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.toUpperCase()),
      );
      quotes = quotes.filter((q) => want.has(q.symbol.toUpperCase()));
    }
    // Cap the row count so a "whole market" call stays token-lean.
    return {
      market,
      quotes: quotes.slice(0, 40).map((q) => ({
        symbol: q.symbol,
        price: q.price,
        changePct: q.changePct,
      })),
    };
  },
};

// --- get_pulse --------------------------------------------------------------
const getPulse: ToolDef = {
  name: "get_pulse",
  description:
    "Get the current cross-market sentiment snapshot: crypto & stock Fear/Greed, BTC dominance, total-market-cap change, the dollar index (DXY), and the 2s10s yield spread. Use this for 'risk-on/risk-off' or overall-mood questions.",
  parameters: { type: "object", properties: {} },
  handler: async () => {
    const p = await readRoute<PulsePayload>("/api/pulse", 600);
    if (!p) return { error: "pulse unavailable" };
    return {
      cryptoFearGreed: p.fearGreed?.value ?? null,
      cryptoFGLabel: p.fearGreed?.classification ?? null,
      stockFearGreed: p.stockFearGreed?.value ?? null,
      stockFGLabel: p.stockFearGreed?.classification ?? null,
      btcDominance: p.btcDominance ?? null,
      mcapChangePct: p.mcapChangePct ?? null,
      dxy: p.dxy?.value ?? null,
      yieldSpread2s10s: p.yields?.spread ?? null,
    };
  },
};

// --- get_news ---------------------------------------------------------------
const getNews: ToolDef = {
  name: "get_news",
  description:
    "Get recent market news headlines, most important first. Optionally filter to assets (asset ids like 'crypto:BTC') to find catalysts for a specific name. Each headline includes a source and url — when you reference a headline in your answer, CITE it as a markdown link [source](url). Only cite headlines actually returned here, never invented ones.",
  parameters: {
    type: "object",
    properties: {
      assets: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional asset ids to filter headlines to (e.g. ['crypto:BTC','stocks:NVDA']).",
      },
      limit: {
        type: "integer",
        description: "Max headlines to return (default 8, max 20).",
      },
    },
  },
  handler: async (args) => {
    const news = await readRoute<NewsPayload>("/api/news", 600);
    if (!news) return { error: "news unavailable" };

    const wantAssets =
      Array.isArray(args.assets) && args.assets.length
        ? new Set(
            args.assets.filter(
              (a): a is string => typeof a === "string" && a in ASSET_BY_ID,
            ),
          )
        : null;

    const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20);
    const order: Record<string, number> = { high: 0, med: 1, low: 2 };

    const items = (news.items ?? [])
      .filter((h) => (wantAssets ? h.assets.some((a) => wantAssets.has(a)) : true))
      .slice()
      .sort((a, b) => (order[a.weight] ?? 3) - (order[b.weight] ?? 3))
      .slice(0, limit)
      .map((h) => ({
        title: h.title,
        source: h.source,
        // The url lets the agent produce a real, clickable citation rather than
        // an unverifiable claim. Absent on the rare feed item with no link.
        url: h.link ?? null,
        market: h.market,
        weight: h.weight,
        assets: h.assets,
      }));

    return { count: items.length, headlines: items };
  },
};

// --- get_funding ------------------------------------------------------------
const getFunding: ToolDef = {
  name: "get_funding",
  description:
    "Get crypto perpetual-futures positioning: current funding rates (positive = longs pay shorts = crowded long; negative = the reverse) plus 24h open-interest change and long/short account ratio for the majors. Use this for 'how is everyone positioned' / 'is this crowded' questions. Crypto only.",
  parameters: {
    type: "object",
    properties: {
      topN: {
        type: "integer",
        description:
          "Return the N most extreme funding rates by absolute value (default 6, max 16).",
      },
    },
  },
  handler: async (args) => {
    const d = await readRoute<DerivsPayload>("/api/derivs", 300);
    if (!d || d.error) return { error: "derivatives unavailable" };

    const topN = Math.min(Math.max(Number(args.topN) || 6, 1), 16);
    const funding = (d.funding ?? [])
      .filter((f) => Number.isFinite(f.rate))
      .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
      .slice(0, topN)
      // Express as a percentage so the model doesn't misread the decimal.
      .map((f) => ({ symbol: f.symbol, ratePct: +(f.rate * 100).toFixed(4) }));

    const detail = (d.detail ?? []).map((row) => ({
      symbol: row.symbol,
      oiChangePct: row.oiChangePct,
      longShortRatio: row.longShortRatio,
    }));

    return { funding, detail };
  },
};

// --- get_calendar -----------------------------------------------------------
const getCalendar: ToolDef = {
  name: "get_calendar",
  description:
    "Get upcoming economic-calendar events (CPI, FOMC, NFP, central-bank decisions, etc.) with their scheduled time, currency, and expected impact. Use this for 'what's on the calendar', 'any risk events today', or to explain why traders might be cautious. Optionally filter by minimum impact or a time window.",
  parameters: {
    type: "object",
    properties: {
      impact: {
        type: "string",
        enum: ["High", "Medium", "Low"],
        description: "Minimum impact to include (default Medium).",
      },
      withinHours: {
        type: "integer",
        description:
          "Only return events scheduled within this many hours from now (default 48, max 336).",
      },
    },
  },
  handler: async (args) => {
    const c = await readRoute<CalendarPayload>("/api/calendar", 600);
    if (!c) return { error: "calendar unavailable" };

    const rank: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
    const minRank = rank[String(args.impact)] ?? rank.Medium;
    const withinHours = Math.min(
      Math.max(Number(args.withinHours) || 48, 1),
      336,
    );
    const now = Date.now();
    const horizon = now + withinHours * 3_600_000;

    const events = (c.events ?? [])
      .filter(
        (e) =>
          e.ts >= now - 3_600_000 &&
          e.ts <= horizon &&
          (rank[e.impact] ?? 0) >= minRank,
      )
      .sort((a, b) => a.ts - b.ts)
      .slice(0, 12)
      .map((e) => ({
        title: e.title,
        country: e.country,
        whenISO: new Date(e.ts).toISOString(),
        impact: e.impact,
        forecast: e.forecast,
        previous: e.previous,
      }));

    // Static anchors (next FOMC/CPI/NFP/PPI) are always useful context.
    const anchors = (c.anchors ?? []).map((a) => ({
      kind: a.kind,
      title: a.title,
      whenISO: new Date(a.ts).toISOString(),
    }));

    return { events, anchors };
  },
};

// --- screen_markets ---------------------------------------------------------
// The heart of "screen & rank": the MODEL picks the criteria, this CODE does the
// math. No LLM work happens here — it filters/sorts the live quote universe and
// returns rows. Keeps the model out of the arithmetic (same philosophy as the
// recommendations render path).
const screenMarkets: ToolDef = {
  name: "screen_markets",
  description:
    "Screen and rank assets by today's move. Returns the assets matching your filter, sorted. Use this to answer 'what are the biggest gainers/losers', 'what's moving in crypto', or 'show me everything down more than 3%'. The code does the filtering/sorting deterministically — you choose the criteria.",
  parameters: {
    type: "object",
    properties: {
      market: {
        type: "string",
        enum: ["crypto", "forex", "stocks", "all"],
        description: "Market to screen, or 'all' for every market (default all).",
      },
      direction: {
        type: "string",
        enum: ["gainers", "losers", "both"],
        description:
          "Restrict to gainers (up), losers (down), or both (default both).",
      },
      minAbsChangePct: {
        type: "number",
        description:
          "Only include assets whose |24h change%| is at least this (default 0).",
      },
      limit: {
        type: "integer",
        description: "Max rows to return (default 10, max 30).",
      },
    },
  },
  handler: async (args) => {
    const market = String(args.market ?? "all");
    const wantMarkets: Market[] =
      market === "all" || !MARKETS.includes(market as Market)
        ? [...MARKETS]
        : [market as Market];

    const direction = ["gainers", "losers", "both"].includes(
      String(args.direction),
    )
      ? (String(args.direction) as "gainers" | "losers" | "both")
      : "both";
    const minAbs = Math.max(Number(args.minAbsChangePct) || 0, 0);
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);

    const rows: Array<{
      id: string;
      symbol: string;
      market: Market;
      changePct: number;
      price: number;
    }> = [];

    for (const m of wantMarkets) {
      const quotes = await readQuotes(m);
      for (const q of quotes ?? []) {
        const id = `${m}:${q.symbol}`;
        if (!(id in ASSET_BY_ID)) continue;
        if (typeof q.changePct !== "number") continue;
        if (Math.abs(q.changePct) < minAbs) continue;
        if (direction === "gainers" && q.changePct < 0) continue;
        if (direction === "losers" && q.changePct > 0) continue;
        rows.push({
          id,
          symbol: q.symbol,
          market: m,
          changePct: q.changePct,
          price: q.price,
        });
      }
    }

    if (!rows.length) return { count: 0, rows: [], note: "no matching assets" };

    // Sort by signed change for a directional screen, by magnitude otherwise.
    rows.sort((a, b) =>
      direction === "losers"
        ? a.changePct - b.changePct
        : direction === "gainers"
          ? b.changePct - a.changePct
          : Math.abs(b.changePct) - Math.abs(a.changePct),
    );

    return { count: rows.length, rows: rows.slice(0, limit) };
  },
};

// --- get_recommendations ----------------------------------------------------
// Reuses the shared, 10-min-cached market-wide recommendations route. A cache
// HIT costs one cheap HTTP read; a MISS triggers exactly one upstream LLM call
// (then everyone shares it). Described as expensive so the model only reaches
// for it when the user explicitly wants ideas, not for factual lookups.
const getRecommendations: ToolDef = {
  name: "get_recommendations",
  description:
    "Get OpenTide's pre-computed, market-wide trading IDEAS for today (a shared daily digest, not personalized). EXPENSIVE — only call this when the user explicitly asks 'what should I watch', 'any ideas', or 'what's actionable'. For plain factual questions use the data tools instead. These are commentary, not advice.",
  parameters: { type: "object", properties: {} },
  handler: async () => {
    const r = await readRoute<RecsPayload>("/api/recommendations", 300);
    if (!r || r.degraded || !(r.recommendations ?? []).length) {
      return { error: "recommendations unavailable" };
    }
    return {
      recommendations: (r.recommendations ?? []).slice(0, 5).map((rec) => ({
        title: rec.title,
        rationale: rec.rationale,
        action: rec.action,
        assetId: rec.assetId,
      })),
    };
  },
};

// --- lookup_asset -----------------------------------------------------------
// Resolve + quote an ARBITRARY crypto coin or US stock — including ones outside
// the curated catalogue. This is what lets the assistant answer about the long
// tail (PEPE, WIF, SOFI, …) while staying grounded: it returns a real,
// source-backed id + quote, or an error if nothing tradeable matches.
interface CryptoUniverse {
  list?: Array<{ symbol: string; base: string }>;
}
interface StockSearch {
  results?: Array<{ symbol: string; description: string }>;
}
interface QuotePayload {
  quotes?: Record<string, { symbol: string; price: number; changePct: number | null }>;
}

/** First quote row from /api/quote for the given symbol params, or nulls. */
async function quoteFor(params: {
  crypto?: string;
  stocks?: string;
}): Promise<{ price: number | null; changePct: number | null }> {
  const qs = new URLSearchParams();
  if (params.crypto) qs.set("crypto", params.crypto);
  if (params.stocks) qs.set("stocks", params.stocks);
  const payload = await readRoute<QuotePayload>(`/api/quote?${qs.toString()}`, 30);
  const row = payload?.quotes ? Object.values(payload.quotes)[0] : undefined;
  return { price: row?.price ?? null, changePct: row?.changePct ?? null };
}

const lookupAsset: ToolDef = {
  name: "lookup_asset",
  description:
    "Resolve and quote ANY crypto coin or US stock by ticker/symbol — including ones NOT in the curated catalogue (e.g. PEPE, WIF, SOFI, TSLA). Returns its canonical id, name, live price and 24h % change, or an error if nothing tradeable matches. Use this whenever the user asks about an asset that get_quotes / screen_markets don't cover. Crypto and US stocks only — forex is limited to the curated pairs.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The ticker/symbol to resolve, e.g. 'PEPE' or 'TSLA'.",
      },
      market: {
        type: "string",
        enum: ["crypto", "stocks"],
        description:
          "Optional hint to disambiguate a ticker that exists in both markets.",
      },
    },
    required: ["query"],
  },
  handler: async (args) => {
    const raw = typeof args.query === "string" ? args.query.toUpperCase() : "";
    const sym = raw.replace(/[^A-Z0-9]/g, "").slice(0, 15);
    if (!sym) return { error: "no symbol given" };
    const hint =
      args.market === "crypto" || args.market === "stocks" ? args.market : null;

    // Curated first — if we already track it, return that id straight away.
    if (!hint) {
      const curated = ASSET_BY_ID[`crypto:${sym}`] ?? ASSET_BY_ID[`stocks:${sym}`];
      if (curated) {
        const q = await quoteFor(
          curated.market === "crypto" ? { crypto: `${sym}USDT` } : { stocks: sym },
        );
        return {
          id: curated.id,
          market: curated.market,
          symbol: curated.symbol,
          name: curated.name,
          curated: true,
          ...q,
        };
      }
    }

    const tryCrypto = async () => {
      const uni = await readRoute<CryptoUniverse>("/api/search/crypto", 86_400);
      const item = uni?.list?.find((c) => c.base.toUpperCase() === sym);
      if (!item) return null;
      const q = await quoteFor({ crypto: item.symbol });
      return {
        id: `crypto:${item.base}`,
        market: "crypto" as const,
        symbol: item.base,
        name: item.base,
        ...q,
      };
    };
    const tryStocks = async () => {
      const s = await readRoute<StockSearch>(
        `/api/search/stocks?q=${encodeURIComponent(sym)}`,
        3_600,
      );
      const item =
        s?.results?.find((r) => r.symbol.toUpperCase() === sym) ?? s?.results?.[0];
      if (!item) return null;
      const q = await quoteFor({ stocks: item.symbol });
      return {
        id: `stocks:${item.symbol}`,
        market: "stocks" as const,
        symbol: item.symbol,
        name: item.description,
        ...q,
      };
    };

    const result =
      hint === "crypto"
        ? await tryCrypto()
        : hint === "stocks"
          ? await tryStocks()
          : ((await tryCrypto()) ?? (await tryStocks()));

    if (!result) {
      return {
        error: `couldn't find a tradeable crypto or US stock matching "${sym}"`,
      };
    }
    if (result.price == null) {
      return { ...result, note: "resolved, but no live quote is available right now" };
    }
    return result;
  },
};

/** The registry. Add new READ-ONLY tools here. */
export const TOOLS: ToolDef[] = [
  getQuotes,
  getPulse,
  getNews,
  getFunding,
  getCalendar,
  screenMarkets,
  getRecommendations,
  lookupAsset,
];

export const TOOL_BY_NAME: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

/** Model-facing declarations (strip the handler). */
export const TOOL_DECLARATIONS: LlmTool[] = TOOLS.map(
  ({ name, description, parameters }) => ({ name, description, parameters }),
);

/** A compact catalogue of valid asset ids, handy for the system prompt so the
 *  model knows the universe it can ask about. */
export function assetCatalogue(): string {
  return ALL_ASSETS.map((a) => a.id).join(", ");
}
