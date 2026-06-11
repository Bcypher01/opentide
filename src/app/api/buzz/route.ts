import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Buzz — markets to watch. Three free signals, cached and shared:
//  • Trending coins   — CoinGecko /search/trending (keyless, cached 10 min)
//  • Hot stocks       — Yahoo Finance trending tickers (keyless, unofficial,
//                       fails gracefully; cached 10 min)
//  • Upcoming IPOs    — Finnhub free IPO calendar (uses the same key as quotes)
// ---------------------------------------------------------------------------

export interface BuzzCoin {
  symbol: string;
  name: string;
  rank: number | null;
  pct24h: number | null;
}
export interface BuzzIpo {
  date: string;
  name: string;
  symbol: string;
  exchange: string;
  price: string;
}

async function trendingCoins(): Promise<BuzzCoin[]> {
  const res = await fetch("https://api.coingecko.com/api/v3/search/trending", {
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const json = (await res.json()) as {
    coins: Array<{
      item: {
        symbol: string;
        name: string;
        market_cap_rank: number | null;
        data?: { price_change_percentage_24h?: { usd?: number } };
      };
    }>;
  };
  return (json.coins ?? []).slice(0, 10).map(({ item }) => ({
    symbol: item.symbol.toUpperCase(),
    name: item.name,
    rank: item.market_cap_rank ?? null,
    pct24h: item.data?.price_change_percentage_24h?.usd ?? null,
  }));
}

async function hotStocks(): Promise<string[]> {
  const res = await fetch(
    "https://query1.finance.yahoo.com/v1/finance/trending/US?count=10",
    {
      next: { revalidate: 600 },
      headers: { "user-agent": "Mozilla/5.0 (compatible; Opentide/1.0)" },
    }
  );
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const json = (await res.json()) as {
    finance?: { result?: Array<{ quotes?: Array<{ symbol?: string }> }> };
  };
  const quotes = json.finance?.result?.[0]?.quotes ?? [];
  return quotes
    .map((q) => q.symbol ?? "")
    .filter((s) => /^[A-Z][A-Z0-9.\-]{0,5}$/.test(s))
    .slice(0, 8);
}

async function upcomingIpos(key: string): Promise<BuzzIpo[]> {
  const today = new Date();
  const to = new Date(today.getTime() + 45 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const res = await fetch(
    `https://finnhub.io/api/v1/calendar/ipo?from=${fmt(today)}&to=${fmt(to)}&token=${key}`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error(`finnhub ipo ${res.status}`);
  const json = (await res.json()) as {
    ipoCalendar?: Array<{
      date?: string;
      name?: string;
      symbol?: string;
      exchange?: string;
      price?: string;
      status?: string;
    }>;
  };
  return (json.ipoCalendar ?? [])
    .filter((i) => i.date && i.name && i.status !== "withdrawn")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 10)
    .map((i) => ({
      date: i.date as string,
      name: (i.name as string).slice(0, 40),
      symbol: i.symbol ?? "—",
      exchange: i.exchange ?? "",
      price: i.price ? `$${i.price}` : "TBD",
    }));
}

export async function GET() {
  const key = process.env.FINNHUB_API_KEY;
  const [coins, stocks, ipos] = await Promise.allSettled([
    trendingCoins(),
    hotStocks(),
    key ? upcomingIpos(key) : Promise.reject(new Error("missing_key")),
  ]);

  return NextResponse.json({
    coins: coins.status === "fulfilled" ? coins.value : [],
    stocks: stocks.status === "fulfilled" ? stocks.value : [],
    ipos: ipos.status === "fulfilled" ? ipos.value : [],
    iposNeedKey: !key,
    ts: Date.now(),
  });
}
