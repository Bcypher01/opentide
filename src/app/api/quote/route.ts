import { NextResponse, type NextRequest } from "next/server";
import {
  MAX_CRYPTO,
  MAX_STOCKS,
  parseSymbolList,
  quoteSymbols,
} from "@/lib/quotes";

// ---------------------------------------------------------------------------
// /api/quote — live quotes for ARBITRARY (non-curated) symbols.
//
//   GET /api/quote?crypto=PEPEUSDT,WIFUSDT&stocks=TSLA,SOFI
//   → { quotes: { "crypto:PEPE": { symbol, price, changePct }, "stocks:TSLA": … } }
//
// Powers the watchlist tracking of custom assets (the client polls this for the
// off-universe symbols it has starred) and the assistant's lookup_asset tool.
// The actual upstream + caching logic lives in lib/quotes.ts so server-side
// callers can reuse it without an HTTP hop (route files can't export helpers).
//
// Rate-limited via the `api-strict` bucket in middleware.ts (repo rule: every
// new route enforces rate limiting). Degrades gracefully — never 502s.
// ---------------------------------------------------------------------------

export const revalidate = 0; // upstream fetches manage their own cache windows

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cryptoPairs = parseSymbolList(searchParams.get("crypto"), MAX_CRYPTO);
  const stockSyms = parseSymbolList(searchParams.get("stocks"), MAX_STOCKS);
  const quotes = await quoteSymbols(cryptoPairs, stockSyms);
  return NextResponse.json({ quotes, ts: Date.now() });
}
