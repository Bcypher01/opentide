import { NextResponse, type NextRequest } from "next/server";
import type { CalendarPayload } from "@/app/api/calendar/route";
import type { DerivsPayload } from "@/app/api/derivs/route";
import type { PulsePayload } from "@/app/api/pulse/route";
import { ASSET_BY_ID } from "@/lib/assets";
import {
  getRecommendations,
  type HeadlineLite,
  type MoverLite,
  type RecommendationContext,
  type RecommendationsResult,
  type WatchlistLite,
} from "@/lib/recommendations";

// ---------------------------------------------------------------------------
// /api/recommendations — AI-generated, actionable market recommendations.
//
//   GET  → market-wide recommendations (shared "global" cache entry).
//   POST → personalized to a watchlist supplied in the body:
//          { "watchlist": ["crypto:BTC", "forex:EUR/USD", ...] }
//
// Composes the same free market context the dashboard already polls (pulse,
// derivatives, calendar, movers, news) plus live quotes for the watchlist,
// hands it to the LLM layer (Gemini → OpenRouter fallback), and returns
// validated JSON.
//
// Quota hygiene: results are cached per *normalized watchlist* for 10 minutes
// and shared across clients — two users with the same watchlist share one LLM
// call. The cache is bounded (LRU-style eviction) so distinct watchlists can't
// grow it without limit. Per-IP abuse is additionally capped by the strict
// "api-ai" bucket in middleware.ts. Degrades gracefully: if no provider key is
// set (or all fail) it returns { degraded: true, recommendations: [] } and the
// UI hides the panel. Never 502s.
// ---------------------------------------------------------------------------

export const revalidate = 0; // we manage our own cache below
const CACHE_TTL_MS = 10 * 60 * 1000;
const DEGRADED_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 200; // bound distinct-watchlist fan-out
const MAX_WATCHLIST = 30; // ignore absurdly long lists

interface QuotesPayload {
  quotes?: Array<{ symbol: string; price: number; changePct: number | null }>;
}
interface NewsPayload {
  items?: Array<{ title: string; source: string; market: string; weight: string }>;
}

// Insertion-ordered map → first key is the oldest, so we evict it when full.
const cache = new Map<string, { data: RecommendationsResult; expires: number }>();

function cacheGet(key: string): RecommendationsResult | null {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  if (hit) cache.delete(key); // expired
  return null;
}

function cacheSet(key: string, data: RecommendationsResult): void {
  cache.set(key, {
    data,
    expires: Date.now() + (data.degraded ? DEGRADED_TTL_MS : CACHE_TTL_MS),
  });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Absolute base URL for reading this app's own data routes server-side. */
function baseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Fetch one own-route JSON payload; null on any failure (never throws). */
async function readRoute<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${baseUrl()}${path}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface MarketParts {
  pulse: PulsePayload | null;
  derivs: DerivsPayload | null;
  calendar: CalendarPayload | null;
  news: NewsPayload | null;
  crypto: QuotesPayload | null;
  forex: QuotesPayload | null;
  stocks: QuotesPayload | null;
}

/** Read every upstream payload in parallel (each cached upstream). */
async function gather(): Promise<MarketParts> {
  const [pulse, derivs, calendar, news, crypto, forex, stocks] = await Promise.all([
    readRoute<PulsePayload>("/api/pulse"),
    readRoute<DerivsPayload>("/api/derivs"),
    readRoute<CalendarPayload>("/api/calendar"),
    readRoute<NewsPayload>("/api/news"),
    readRoute<QuotesPayload>("/api/crypto"),
    readRoute<QuotesPayload>("/api/forex"),
    readRoute<QuotesPayload>("/api/stocks"),
  ]);
  return { pulse, derivs, calendar, news, crypto, forex, stocks };
}

/** Build a "market:SYMBOL" → quote lookup from the three quote payloads. */
function quoteLookup(
  parts: MarketParts,
): Record<string, { price: number; changePct: number | null }> {
  const map: Record<string, { price: number; changePct: number | null }> = {};
  const add = (p: QuotesPayload | null, market: string) => {
    for (const q of p?.quotes ?? []) {
      map[`${market}:${q.symbol}`] = { price: q.price, changePct: q.changePct };
    }
  };
  add(parts.crypto, "crypto");
  add(parts.forex, "forex");
  add(parts.stocks, "stocks");
  return map;
}

function moversFrom(quotes: QuotesPayload | null, market: string): MoverLite[] {
  return (quotes?.quotes ?? [])
    .filter((q) => typeof q.changePct === "number")
    .map((q) => ({
      id: `${market}:${q.symbol}`,
      symbol: q.symbol,
      changePct: q.changePct as number,
    }))
    .filter((m) => m.id in ASSET_BY_ID);
}

/** Build the LLM context snapshot, optionally focused on a watchlist. */
function composeContext(
  parts: MarketParts,
  watchlistIds: string[],
): RecommendationContext {
  const { pulse, derivs, calendar, news } = parts;
  const quotes = quoteLookup(parts);

  const allMovers = [
    ...moversFrom(parts.crypto, "crypto"),
    ...moversFrom(parts.forex, "forex"),
    ...moversFrom(parts.stocks, "stocks"),
  ].sort((a, b) => b.changePct - a.changePct);

  const topGainers = allMovers.slice(0, 4);
  const topLosers = allMovers.slice(-4).reverse();

  const fundingExtremes = (derivs?.funding ?? [])
    .filter((f) => Number.isFinite(f.rate))
    .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
    .slice(0, 4)
    .map((f) => ({ symbol: f.symbol, ratePct: +(f.rate * 100).toFixed(4) }));

  const now = Date.now();
  const events = (calendar?.events ?? [])
    .filter(
      (e) => e.ts >= now - 3_600_000 && (e.impact === "High" || e.impact === "Medium"),
    )
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 6)
    .map((e) => ({
      title: e.title,
      country: e.country,
      whenISO: new Date(e.ts).toISOString(),
      impact: e.impact,
    }));

  const order: Record<string, number> = { high: 0, med: 1, low: 2 };
  const headlines: HeadlineLite[] = (news?.items ?? [])
    .slice()
    .sort((a, b) => (order[a.weight] ?? 3) - (order[b.weight] ?? 3))
    .slice(0, 12)
    .map((h) => ({ title: h.title, source: h.source, weight: h.weight }));

  const watchlist: WatchlistLite[] = watchlistIds.map((id) => {
    const a = ASSET_BY_ID[id];
    const q = quotes[id];
    return {
      id,
      symbol: a?.symbol ?? id,
      market: a?.market ?? "unknown",
      price: q?.price ?? null,
      changePct: q?.changePct ?? null,
    };
  });

  return {
    pulse: {
      cryptoFearGreed: pulse?.fearGreed?.value ?? null,
      cryptoFGLabel: pulse?.fearGreed?.classification ?? null,
      stockFearGreed: pulse?.stockFearGreed?.value ?? null,
      btcDominance: pulse?.btcDominance ?? null,
      mcapChangePct: pulse?.mcapChangePct ?? null,
      dxy: pulse?.dxy?.value ?? null,
      yieldSpread2s10s: pulse?.yields?.spread ?? null,
    },
    topGainers,
    topLosers,
    fundingExtremes,
    events,
    headlines,
    watchlist,
  };
}

/** Keep only known asset ids, dedupe, sort (stable cache key), cap length. */
function sanitizeWatchlist(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v === "string" && v in ASSET_BY_ID) seen.add(v);
  }
  return [...seen].sort().slice(0, MAX_WATCHLIST);
}

/** Shared path for GET (empty watchlist) and POST (personalized). */
async function respond(watchlistIds: string[]): Promise<NextResponse> {
  const key = watchlistIds.length ? `wl:${watchlistIds.join(",")}` : "global";

  const cached = cacheGet(key);
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });
  }

  const parts = await gather();
  const ctx = composeContext(parts, watchlistIds);
  const data = await getRecommendations(ctx);
  cacheSet(key, data);

  return NextResponse.json(data, { headers: { "X-Cache": "MISS" } });
}

export async function GET() {
  return respond([]);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const watchlist = sanitizeWatchlist((body as { watchlist?: unknown })?.watchlist);
  return respond(watchlist);
}
