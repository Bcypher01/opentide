import { NextResponse } from "next/server";
import { CRYPTO_ASSETS } from "@/lib/assets";

// Crypto derivatives pulse — Binance USDⓈ-M Futures public REST, no key.
//   · funding rates for every tracked symbol (1 batched call)
//   · 24h open-interest change + long/short account ratio for BTC & ETH
// NOTE: fapi.binance.com has no .vision mirror and can be geo-blocked (451)
// from US datacenter IPs. Everything degrades gracefully: on failure the API
// returns { error } and the panel hides itself.

const FAPI = "https://fapi.binance.com";

export interface FundingRow {
  symbol: string; // base, e.g. "BTC"
  rate: number; // current funding rate as a decimal (0.0001 = 0.01%)
  nextFundingTime: number;
}

export interface OiRow {
  symbol: string;
  oiUsd: number; // latest open interest, USD
  oiChangePct: number | null; // vs ~24h ago
  longShortRatio: number | null; // accounts, latest 1h bucket
}

export interface DerivsPayload {
  funding: FundingRow[];
  detail: OiRow[];
  ts: number;
  error?: string;
}

async function fundingRates(): Promise<FundingRow[]> {
  const res = await fetch(`${FAPI}/fapi/v1/premiumIndex`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`fapi ${res.status}`);
  const rows = (await res.json()) as Array<{
    symbol: string;
    lastFundingRate: string;
    nextFundingTime: number;
  }>;
  const wanted = new Set(CRYPTO_ASSETS.map((a) => `${a.symbol}USDT`));
  return rows
    .filter((r) => wanted.has(r.symbol))
    .map((r) => ({
      symbol: r.symbol.replace(/USDT$/, ""),
      rate: parseFloat(r.lastFundingRate),
      nextFundingTime: r.nextFundingTime,
    }))
    .filter((r) => Number.isFinite(r.rate));
}

async function oiDetail(base: string): Promise<OiRow | null> {
  try {
    const sym = `${base}USDT`;
    const [histRes, lsRes] = await Promise.all([
      fetch(
        `${FAPI}/futures/data/openInterestHist?symbol=${sym}&period=1d&limit=2`,
        { next: { revalidate: 600 } }
      ),
      fetch(
        `${FAPI}/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=1h&limit=1`,
        { next: { revalidate: 600 } }
      ),
    ]);

    let oiUsd = NaN;
    let oiChangePct: number | null = null;
    if (histRes.ok) {
      const hist = (await histRes.json()) as Array<{
        sumOpenInterestValue: string;
      }>;
      const latest = parseFloat(hist[hist.length - 1]?.sumOpenInterestValue);
      const prev = parseFloat(hist[0]?.sumOpenInterestValue);
      oiUsd = latest;
      if (hist.length === 2 && Number.isFinite(prev) && prev > 0)
        oiChangePct = ((latest - prev) / prev) * 100;
    }

    let longShortRatio: number | null = null;
    if (lsRes.ok) {
      const ls = (await lsRes.json()) as Array<{ longShortRatio: string }>;
      const v = parseFloat(ls[0]?.longShortRatio);
      if (Number.isFinite(v)) longShortRatio = v;
    }

    if (!Number.isFinite(oiUsd) && longShortRatio === null) return null;
    return { symbol: base, oiUsd, oiChangePct, longShortRatio };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const [funding, btc, eth] = await Promise.all([
      fundingRates(),
      oiDetail("BTC"),
      oiDetail("ETH"),
    ]);

    const detail = [btc, eth].filter((x): x is OiRow => x !== null);
    const payload: DerivsPayload = { funding, detail, ts: Date.now() };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable", funding: [], detail: [], ts: Date.now() },
      { status: 502 }
    );
  }
}
