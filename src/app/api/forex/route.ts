import { NextResponse } from "next/server";

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

export async function GET() {
  try {
    const latestRes = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${CCYS}`,
      { next: { revalidate: 1800 } }
    );
    if (!latestRes.ok) throw new Error(`frankfurter ${latestRes.status}`);
    const latest = (await latestRes.json()) as FrankfurterLatest;

    const prevDate = prevBusinessDay(latest.date);
    const prevRes = await fetch(
      `https://api.frankfurter.dev/v1/${prevDate}?base=USD&symbols=${CCYS}`,
      { next: { revalidate: 86400 } }
    );

    const current = buildPairs(latest.rates);
    let previous: ReturnType<typeof buildPairs> | null = null;
    if (prevRes.ok) {
      const prev = (await prevRes.json()) as FrankfurterLatest;
      previous = buildPairs(prev.rates);
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
      source: "ECB daily reference (Frankfurter)",
      asOf: latest.date,
      ts: Date.now(),
    });
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable", quotes: [] },
      { status: 502 }
    );
  }
}
