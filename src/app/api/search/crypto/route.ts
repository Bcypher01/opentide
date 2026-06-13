import { NextResponse } from "next/server";

// Crypto-symbol universe — Binance exchangeInfo, slimmed to TRADING pairs
// quoted in USDT/USDC, so the ⌘K palette can chart any listed coin.
//
// This list changes rarely, so it's cached server-side for 24h and shared
// across all users. The client fetches it ONCE per session and filters it in
// memory thereafter — so crypto search costs one request per session, then
// zero. data-api.binance.vision is Binance's official market-data mirror and
// isn't geo-blocked for US datacenter IPs (where api.binance.com returns 451);
// fall back to the main host if the mirror is down.

const HOSTS = ["data-api.binance.vision", "api.binance.com"];
const QUOTES = new Set(["USDT", "USDC"]);

interface ExchangeSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
}

export async function GET() {
  try {
    let res: Response | null = null;
    for (const host of HOSTS) {
      res = await fetch(`https://${host}/api/v3/exchangeInfo`, {
        next: { revalidate: 86400 },
      });
      if (res.ok) break;
    }
    if (!res || !res.ok) throw new Error(`binance ${res?.status}`);

    const json = (await res.json()) as { symbols?: ExchangeSymbol[] };

    // One row per base coin (prefer USDT), so we don't return BTCUSDT + BTCUSDC.
    const byBase = new Map<string, { symbol: string; base: string }>();
    for (const s of json.symbols ?? []) {
      if (s.status !== "TRADING" || !QUOTES.has(s.quoteAsset)) continue;
      const existing = byBase.get(s.baseAsset);
      if (!existing || s.quoteAsset === "USDT") {
        byBase.set(s.baseAsset, { symbol: s.symbol, base: s.baseAsset });
      }
    }

    const list = Array.from(byBase.values());
    return NextResponse.json({ list, source: "Binance", ts: Date.now() });
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable", list: [] },
      { status: 502 }
    );
  }
}
