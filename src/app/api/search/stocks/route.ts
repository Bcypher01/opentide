import { NextResponse } from "next/server";

// Stock-symbol search — proxy to Finnhub's keyword lookup so the ⌘K palette
// can reach the *full* US equities universe, not just our curated twelve.
//
// Caching: each distinct query is cached server-side for 1h via Next's fetch
// cache, so popular queries ("apple", "tsla") are effectively free and shared
// across all users — the same posture as /api/stocks. Combined with the
// client's 200ms debounce + min-length gate, this stays well inside Finnhub's
// 60-calls/min free tier.

interface FinnhubSearchResult {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    // Match the existing stocks route: degrade silently with an empty list so
    // the palette's local results still work without a key.
    return NextResponse.json({ error: "missing_key", results: [] });
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${key}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { result?: FinnhubSearchResult[] };

    const results = (json.result ?? [])
      // Common Stock only, and plain tickers (no ".", which marks foreign /
      // class listings TradingView often can't resolve from a bare symbol).
      .filter((r) => r.type === "Common Stock" && !r.symbol.includes("."))
      .slice(0, 10)
      .map((r) => ({ symbol: r.symbol, description: r.description }));

    return NextResponse.json({ results, source: "Finnhub", ts: Date.now() });
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable", results: [], ts: Date.now() }
    );
  }
}
