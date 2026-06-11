import { NextResponse } from "next/server";

// Market Pulse — one cached call composing four free, keyless sources:
//   · Crypto Fear & Greed       alternative.me        (revalidate 1h)
//   · BTC dominance + mcap Δ    CoinGecko /global     (revalidate 10m)
//   · US 2Y/10Y yields          treasury.gov CSV      (revalidate 1h)
//   · DXY approximation         Frankfurter (ECB)     (revalidate 30m, daily data)
// Every block is independent: if one upstream fails its field is null and the
// UI simply hides that chip. Never 502s the whole strip.

export interface PulsePayload {
  fearGreed: {
    value: number;
    classification: string;
    yesterday: number | null;
  } | null;
  btcDominance: number | null;
  mcapChangePct: number | null;
  dxy: { value: number; changePct: number | null; asOf: string } | null;
  yields: {
    y2: number;
    y10: number;
    spread: number; // 2s10s in bps
    asOf: string;
  } | null;
  ts: number;
}

async function fearGreed(): Promise<PulsePayload["fearGreed"]> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=2", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data: Array<{ value: string; value_classification: string }>;
    };
    const [today, prev] = json.data ?? [];
    if (!today) return null;
    return {
      value: parseInt(today.value, 10),
      classification: today.value_classification,
      yesterday: prev ? parseInt(prev.value, 10) : null,
    };
  } catch {
    return null;
  }
}

async function coingeckoGlobal(): Promise<{
  btcDominance: number | null;
  mcapChangePct: number | null;
}> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/global", {
      next: { revalidate: 600 },
    });
    if (!res.ok) return { btcDominance: null, mcapChangePct: null };
    const json = (await res.json()) as {
      data?: {
        market_cap_percentage?: { btc?: number };
        market_cap_change_percentage_24h_usd?: number;
      };
    };
    return {
      btcDominance: json.data?.market_cap_percentage?.btc ?? null,
      mcapChangePct: json.data?.market_cap_change_percentage_24h_usd ?? null,
    };
  } catch {
    return { btcDominance: null, mcapChangePct: null };
  }
}

/** Daily Treasury par yield curve — official CSV, no key. */
async function treasuryYields(): Promise<PulsePayload["yields"]> {
  try {
    const year = new Date().getUTCFullYear();
    const url =
      `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/` +
      `${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;

    const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
    const di = headers.indexOf("Date");
    const i2 = headers.indexOf("2 Yr");
    const i10 = headers.indexOf("10 Yr");
    if (di < 0 || i2 < 0 || i10 < 0) return null;

    // Rows are newest-first; take the first with valid numbers.
    for (let r = 1; r < Math.min(lines.length, 10); r++) {
      const cols = lines[r].split(",").map((c) => c.replace(/"/g, "").trim());
      const y2 = parseFloat(cols[i2]);
      const y10 = parseFloat(cols[i10]);
      if (Number.isFinite(y2) && Number.isFinite(y10)) {
        return {
          y2,
          y10,
          spread: Math.round((y10 - y2) * 100),
          asOf: cols[di] ?? "",
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Standard ICE DXY formula from USD-based rates (ECB daily reference, so this
// is a *daily* approximation and the UI labels it as such).
const DXY_CCYS = "EUR,JPY,GBP,CAD,SEK,CHF";

function computeDxy(r: Record<string, number>): number | null {
  const { EUR, JPY, GBP, CAD, SEK, CHF } = r;
  if (![EUR, JPY, GBP, CAD, SEK, CHF].every((x) => Number.isFinite(x) && x > 0))
    return null;
  return (
    50.14348112 *
    Math.pow(1 / EUR, -0.576) *
    Math.pow(JPY, 0.136) *
    Math.pow(1 / GBP, -0.119) *
    Math.pow(CAD, 0.091) *
    Math.pow(SEK, 0.042) *
    Math.pow(CHF, 0.036)
  );
}

async function dxy(): Promise<PulsePayload["dxy"]> {
  try {
    const latestRes = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${DXY_CCYS}`,
      { next: { revalidate: 1800 } }
    );
    if (!latestRes.ok) return null;
    const latest = (await latestRes.json()) as {
      date: string;
      rates: Record<string, number>;
    };
    const value = computeDxy(latest.rates);
    if (value === null) return null;

    // Previous business day for the daily change.
    const d = new Date(`${latest.date}T12:00:00Z`);
    do {
      d.setUTCDate(d.getUTCDate() - 1);
    } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    const prevDate = d.toISOString().slice(0, 10);

    let changePct: number | null = null;
    const prevRes = await fetch(
      `https://api.frankfurter.dev/v1/${prevDate}?base=USD&symbols=${DXY_CCYS}`,
      { next: { revalidate: 86400 } }
    );
    if (prevRes.ok) {
      const prev = (await prevRes.json()) as { rates: Record<string, number> };
      const prevVal = computeDxy(prev.rates);
      if (prevVal) changePct = ((value - prevVal) / prevVal) * 100;
    }

    return { value, changePct, asOf: latest.date };
  } catch {
    return null;
  }
}

export async function GET() {
  const [fg, cg, ty, dx] = await Promise.all([
    fearGreed(),
    coingeckoGlobal(),
    treasuryYields(),
    dxy(),
  ]);

  const payload: PulsePayload = {
    fearGreed: fg,
    btcDominance: cg.btcDominance,
    mcapChangePct: cg.mcapChangePct,
    yields: ty,
    dxy: dx,
    ts: Date.now(),
  };

  return NextResponse.json(payload);
}
