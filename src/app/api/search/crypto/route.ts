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
const TTL = 86_400_000; // 24h

interface ExchangeSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
}

interface Coin {
  symbol: string;
  base: string;
}

// The raw exchangeInfo payload is ~22MB — far over Next's 2MB fetch-cache limit,
// so we can't let Next cache it (`next: { revalidate }` just logs a warning and
// re-downloads every time). Instead we fetch it uncached and cache only the
// slim derived list here in module memory, shared across requests for 24h.
let cache: { list: Coin[]; ts: number } | null = null;

export async function GET() {
  // Serve the cached slim list while it's fresh.
  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json({ list: cache.list, source: "Binance", ts: cache.ts });
  }

  try {
    let res: Response | null = null;
    for (const host of HOSTS) {
      res = await fetch(`https://${host}/api/v3/exchangeInfo`, {
        cache: "no-store",
      });
      if (res.ok) break;
    }
    if (!res || !res.ok) throw new Error(`binance ${res?.status}`);

    const json = (await res.json()) as { symbols?: ExchangeSymbol[] };

    // One row per base coin (prefer USDT), so we don't return BTCUSDT + BTCUSDC.
    const byBase = new Map<string, Coin>();
    for (const s of json.symbols ?? []) {
      if (s.status !== "TRADING" || !QUOTES.has(s.quoteAsset)) continue;
      const existing = byBase.get(s.baseAsset);
      if (!existing || s.quoteAsset === "USDT") {
        byBase.set(s.baseAsset, { symbol: s.symbol, base: s.baseAsset });
      }
    }

    cache = { list: Array.from(byBase.values()), ts: Date.now() };
    return NextResponse.json({ list: cache.list, source: "Binance", ts: cache.ts });
  } catch {
    // Upstream failed — serve a stale list if we ever cached one.
    if (cache) {
      return NextResponse.json({
        list: cache.list,
        source: "Binance",
        ts: cache.ts,
        stale: true,
      });
    }
    return NextResponse.json(
      { error: "upstream_unavailable", list: [], ts: Date.now() }
    );
  }
}
