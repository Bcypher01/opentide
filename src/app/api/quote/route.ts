import { NextResponse, type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// /api/quote — live quotes for ARBITRARY (non-curated) symbols.
//
//   GET /api/quote?crypto=PEPEUSDT,WIFUSDT&stocks=TSLA,SOFI
//   → { quotes: { "crypto:PEPE": { symbol, price, changePct }, "stocks:TSLA": … } }
//
// Powers two things: the watchlist tracking of custom assets (the client polls
// this for whatever off-universe symbols it has starred) and the assistant's
// lookup_asset tool. The curated /api/crypto · /api/stocks routes stay as the
// fixed, batched, always-warm core; this is the on-demand sibling for the long
// tail.
//
// Cost & safety:
//   · crypto → Binance public REST (keyless), ONE batched ticker call.
//   · stocks → Finnhub free tier, one call PER symbol, each shared-cached 60s,
//     so cost scales with DISTINCT symbols across all users, not requests. We
//     also hard-cap the number of symbols per call (MAX_*), and the route is
//     rate-limited via the `api-strict` bucket in middleware.ts (repo rule:
//     every new route enforces rate limiting).
// Degrades gracefully: any upstream miss just omits that id; never 502s.
// ---------------------------------------------------------------------------

export const revalidate = 0; // upstream fetches manage their own cache windows

const CRYPTO_HOSTS = ["data-api.binance.vision", "api.binance.com"];
const MAX_CRYPTO = 30; // batched, so generous
const MAX_STOCKS = 12; // Finnhub is one call each — keep a request bounded

interface QuoteRow {
  symbol: string; // display base, e.g. "PEPE" / "TSLA"
  price: number;
  changePct: number | null;
}

/** Parse + sanitise a comma list into de-duped, upper-cased symbols. */
function parseList(raw: string | null, max: number): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const s = part.trim().toUpperCase();
    // Only plain alphanumerics — these flow into upstream URLs.
    if (s && /^[A-Z0-9]{1,15}$/.test(s)) seen.add(s);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** Batch-quote crypto pairs (e.g. "PEPEUSDT") off Binance. id key = crypto:BASE. */
async function quoteCrypto(pairs: string[]): Promise<Record<string, QuoteRow>> {
  if (!pairs.length) return {};
  const query = `/api/v3/ticker/24hr?symbols=${encodeURIComponent(
    JSON.stringify(pairs),
  )}`;
  try {
    let res: Response | null = null;
    for (const host of CRYPTO_HOSTS) {
      res = await fetch(`https://${host}${query}`, { next: { revalidate: 30 } });
      if (res.ok) break;
    }
    if (!res || !res.ok) return {};
    const rows = (await res.json()) as Array<{
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
    }>;
    const out: Record<string, QuoteRow> = {};
    for (const r of rows) {
      // Strip the quote asset so the key matches the curated id base
      // (crypto:BASE) for both USDT- and USDC-quoted pairs.
      const base = r.symbol.replace(/(USDT|USDC)$/, "");
      out[`crypto:${base}`] = {
        symbol: base,
        price: parseFloat(r.lastPrice),
        changePct: parseFloat(r.priceChangePercent),
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** Quote stock tickers off Finnhub (one call each, cached 60s). id = stocks:SYM. */
async function quoteStocks(symbols: string[]): Promise<Record<string, QuoteRow>> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key || !symbols.length) return {};
  const out: Record<string, QuoteRow> = {};
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${key}`,
          { next: { revalidate: 60 } },
        );
        if (!res.ok) return;
        const q = (await res.json()) as { c: number; dp: number | null };
        if (!q || !q.c) return; // unknown ticker → c == 0
        out[`stocks:${sym}`] = { symbol: sym, price: q.c, changePct: q.dp };
      } catch {
        // omit this symbol
      }
    }),
  );
  return out;
}

/**
 * Quote a set of crypto pairs + stock tickers, returning one id→quote map.
 * Exported so server-side callers (e.g. the recommendations route) can reuse
 * the exact same upstream + caching path without an HTTP hop.
 */
export async function quoteSymbols(
  cryptoPairs: string[],
  stockSyms: string[],
): Promise<Record<string, QuoteRow>> {
  const [crypto, stocks] = await Promise.all([
    quoteCrypto(cryptoPairs.slice(0, MAX_CRYPTO)),
    quoteStocks(stockSyms.slice(0, MAX_STOCKS)),
  ]);
  return { ...crypto, ...stocks };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cryptoPairs = parseList(searchParams.get("crypto"), MAX_CRYPTO);
  const stockSyms = parseList(searchParams.get("stocks"), MAX_STOCKS);
  const quotes = await quoteSymbols(cryptoPairs, stockSyms);
  return NextResponse.json({ quotes, ts: Date.now() });
}
