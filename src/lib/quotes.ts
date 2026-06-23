// ---------------------------------------------------------------------------
// quotes.ts — live quotes for ARBITRARY (non-curated) symbols.
//
// Shared by /api/quote (the on-demand sibling to the curated /api/crypto ·
// /api/stocks routes) and any server-side caller that needs custom-asset quotes
// without an HTTP hop (e.g. the recommendations route). Lives in lib/, NOT in
// the route file, because Next.js App Router route modules may only export
// route handlers + segment config — exporting a helper from route.ts fails the
// build.
//
// Cost & safety:
//   · crypto → Binance public REST (keyless), ONE batched ticker call.
//   · stocks → Finnhub free tier, one call PER symbol, each shared-cached 60s,
//     so cost scales with DISTINCT symbols across all users, not requests. The
//     symbol count per call is hard-capped (MAX_*).
// Degrades gracefully: any upstream miss just omits that id; never throws.
// ---------------------------------------------------------------------------

const CRYPTO_HOSTS = ["data-api.binance.vision", "api.binance.com"];
export const MAX_CRYPTO = 30; // batched, so generous
export const MAX_STOCKS = 12; // Finnhub is one call each — keep a request bounded

export interface QuoteRow {
  symbol: string; // display base, e.g. "PEPE" / "TSLA"
  price: number;
  changePct: number | null;
}

/** Parse + sanitise a comma list into de-duped, upper-cased symbols. */
export function parseSymbolList(raw: string | null, max: number): string[] {
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
 * Reused by the route and by server-side callers so the upstream + caching path
 * is identical everywhere.
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
