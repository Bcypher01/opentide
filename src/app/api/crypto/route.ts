import { NextResponse } from "next/server";
import { CRYPTO_ASSETS } from "@/lib/assets";

// Binance public REST — no key needed, generous limits. One batched call for
// every symbol; Next's fetch cache shares it across ALL users (revalidate 30s).

export interface Quote {
  symbol: string;
  price: number;
  changePct: number | null;
  ts: number;
}

export async function GET() {
  const symbols = CRYPTO_ASSETS.map((a) => `${a.symbol}USDT`);
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(
    JSON.stringify(symbols)
  )}`;

  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`binance ${res.status}`);
    const rows = (await res.json()) as Array<{
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
      closeTime: number;
    }>;

    const quotes: Quote[] = rows.map((r) => ({
      symbol: r.symbol.replace(/USDT$/, ""),
      price: parseFloat(r.lastPrice),
      changePct: parseFloat(r.priceChangePercent),
      ts: r.closeTime,
    }));

    return NextResponse.json({ quotes, source: "Binance", ts: Date.now() });
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable", quotes: [] },
      { status: 502 }
    );
  }
}
