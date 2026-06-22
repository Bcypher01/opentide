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
    source: string;
    market: string;
    assets: string[];
    weight: string;
  }>;
}

const ROUTE_BY_MARKET: Record<Market, string> = {
  crypto: "/api/crypto",
  forex: "/api/forex",
  stocks: "/api/stocks",
};

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

    const payload = await readRoute<QuotesPayload>(ROUTE_BY_MARKET[market], 30);
    if (!payload) return { error: "quotes unavailable" };

    let quotes = payload.quotes ?? [];
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
    "Get recent market news headlines, most important first. Optionally filter to assets (asset ids like 'crypto:BTC') to find catalysts for a specific name. Use this to find WHY something is moving — but only cite headlines actually returned here, never invented ones.",
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

    const limit = Math.min(
      Math.max(Number(args.limit) || 8, 1),
      20,
    );
    const order: Record<string, number> = { high: 0, med: 1, low: 2 };

    const items = (news.items ?? [])
      .filter((h) => (wantAssets ? h.assets.some((a) => wantAssets.has(a)) : true))
      .slice()
      .sort((a, b) => (order[a.weight] ?? 3) - (order[b.weight] ?? 3))
      .slice(0, limit)
      .map((h) => ({
        title: h.title,
        source: h.source,
        market: h.market,
        weight: h.weight,
        assets: h.assets,
      }));

    return { count: items.length, headlines: items };
  },
};

/** The registry. Add new READ-ONLY tools here. */
export const TOOLS: ToolDef[] = [getQuotes, getPulse, getNews];

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
