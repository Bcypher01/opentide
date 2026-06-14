import { NextResponse } from "next/server";
import { STOCK_ASSETS } from "@/lib/assets";

// Finnhub free tier: 60 calls/min. 12 symbols × 1 batch/min server-side
// (shared across all users via Next's fetch cache) stays well inside the cap.

export async function GET() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "missing_key", quotes: [] });
  }

  try {
    const results = await Promise.all(
      STOCK_ASSETS.map(async (a) => {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${a.symbol}&token=${key}`,
          { next: { revalidate: 60 } }
        );
        if (!res.ok) return null;
        const q = (await res.json()) as {
          c: number; // current
          dp: number | null; // percent change
          t: number; // unix seconds
        };
        if (!q || !q.c) return null;
        return {
          symbol: a.symbol,
          price: q.c,
          changePct: q.dp,
          ts: (q.t || 0) * 1000,
        };
      })
    );

    const quotes = results.filter((r): r is NonNullable<typeof r> => r !== null);
    if (quotes.length === 0) throw new Error("no quotes");

    return NextResponse.json({ quotes, source: "Finnhub", ts: Date.now() });
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable", quotes: [], ts: Date.now() }
    );
  }
}
