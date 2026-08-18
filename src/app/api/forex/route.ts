import { NextResponse } from "next/server";
import { upstreamFetch } from "@/lib/upstreamFetch";

// Frankfurter — free, no key, ECB daily reference rates. These update once per
// business day (~16:00 CET), so we cache aggressively (revalidate 30 min) and
// the UI is honest about it ("ECB daily reference").

const CCYS = "EUR,GBP,JPY,CHF,AUD,CAD,NZD";

interface FrankfurterLatest {
  date: string;
  rates: Record<string, number>; // units of CCY per 1 USD
}

/** Derive our displayed pairs from USD-based rates. */
function buildPairs(r: Record<string, number>) {
  const inv = (x: number) => 1 / x;
  return [
    { symbol: "EUR/USD", price: inv(r.EUR) },
    { symbol: "GBP/USD", price: inv(r.GBP) },
    { symbol: "USD/JPY", price: r.JPY },
    { symbol: "USD/CHF", price: r.CHF },
    { symbol: "AUD/USD", price: inv(r.AUD) },
    { symbol: "NZD/USD", price: inv(r.NZD) },
    { symbol: "USD/CAD", price: r.CAD },
    { symbol: "EUR/GBP", price: r.GBP / r.EUR },
    { symbol: "GBP/JPY", price: r.JPY / r.GBP },
  ];
}

function prevBusinessDay(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

export interface CurrencyStrength {
  ccy: string;
  /** average % move vs all other tracked currencies over the day */
  pct: number;
}

// All eight currencies (USD + the seven ECB-quoted majors). Rates are units of
// the currency per 1 USD; USD itself is 1. A currency's strength is its mean %
// change measured against every other currency, derived from the full cross
// matrix — the cheapest honest "FX strength grid" there is.
const STRENGTH_CCYS = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD"];

function currencyStrength(
  latest: Record<string, number>,
  prev: Record<string, number>
): CurrencyStrength[] | null {
  const L: Record<string, number> = { USD: 1, ...latest };
  const P: Record<string, number> = { USD: 1, ...prev };
  const ccys = STRENGTH_CCYS.filter(
    (c) => Number.isFinite(L[c]) && L[c] > 0 && Number.isFinite(P[c]) && P[c] > 0
  );
  if (ccys.length < 3) return null;

  const out = ccys.map((i) => {
    let sum = 0;
    let n = 0;
    for (const j of ccys) {
      if (i === j) continue;
      // price of i in terms of j = rate_j / rate_i; change vs prev:
      const now = L[j] / L[i];
      const before = P[j] / P[i];
      if (before > 0) {
        sum += (now / before - 1) * 100;
        n++;
      }
    }
    return { ccy: i, pct: n > 0 ? sum / n : 0 };
  });
  out.sort((a, b) => b.pct - a.pct);
  return out;
}

export async function GET() {
  try {
    const latestRes = await upstreamFetch(
      `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${CCYS}`,
      { next: { revalidate: 1800 } }
    );
    if (!latestRes.ok) throw new Error(`frankfurter ${latestRes.status}`);
    const latest = (await latestRes.json()) as FrankfurterLatest;

    const prevDate = prevBusinessDay(latest.date);
    const prevRes = await upstreamFetch(
      `https://api.frankfurter.dev/v1/${prevDate}?base=USD&symbols=${CCYS}`,
      { next: { revalidate: 86400 } }
    );

    const current = buildPairs(latest.rates);
    let previous: ReturnType<typeof buildPairs> | null = null;
    let strength: CurrencyStrength[] | null = null;
    if (prevRes.ok) {
      const prev = (await prevRes.json()) as FrankfurterLatest;
      previous = buildPairs(prev.rates);
      strength = currencyStrength(latest.rates, prev.rates);
    }

    const quotes = current.map((q) => {
      const prevQ = previous?.find((p) => p.symbol === q.symbol);
      const changePct =
        prevQ && prevQ.price > 0
          ? ((q.price - prevQ.price) / prevQ.price) * 100
          : null;
      return { ...q, changePct, ts: new Date(`${latest.date}T16:00:00Z`).getTime() };
    });

    return NextResponse.json({
      quotes,
      strength,
      source: "ECB daily reference (Frankfurter)",
      asOf: latest.date,
      ts: Date.now(),
    });
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable", quotes: [], ts: Date.now() }
    );
  }
}
