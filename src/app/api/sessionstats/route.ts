import { NextResponse } from "next/server";
import { SESSIONS, zoneOffsetMinutes, type SessionId } from "@/lib/sessions";

// ---------------------------------------------------------------------------
// Session statistics engine — "what does the London open usually do?"
// For a handful of crypto assets we pull ~41 days of hourly candles from
// Binance (free, keyless) and, for each trading session, compute the *typical*
// intraday range/move during that session's local hours, plus what today has
// done so far. Crypto-first by design: it's the only free intraday source
// (forex via ECB is daily-only). DST is handled per-candle via the same
// zone-offset math the session clock uses.
//
// Cached 1h server-side and shared across all visitors by Next's fetch cache.
// ---------------------------------------------------------------------------

const HOSTS = ["data-api.binance.vision", "api.binance.com"];
const KLIMIT = 1000; // ~41 days of 1h candles
const MIN_SAMPLES = 8; // days needed before a "normal" is meaningful

// Keep the asset set small — one upstream call each.
const COVERED = [
  { assetId: "crypto:BTC", symbol: "BTC", name: "Bitcoin" },
  { assetId: "crypto:ETH", symbol: "ETH", name: "Ethereum" },
  { assetId: "crypto:SOL", symbol: "SOL", name: "Solana" },
  { assetId: "crypto:BNB", symbol: "BNB", name: "BNB" },
  { assetId: "crypto:XRP", symbol: "XRP", name: "XRP" },
  { assetId: "crypto:DOGE", symbol: "DOGE", name: "Dogecoin" },
];

export interface SessionStat {
  session: SessionId;
  name: string;
  /** typical full-session high-low range, % of session-open price */
  avgRangePct: number | null;
  /** typical |net move| open→close during the session, % */
  avgMovePct: number | null;
  samples: number;
  /** today's session range so far, % (null if session hasn't run today) */
  todayRangePct: number | null;
  /** today's signed net move so far, % */
  todayMovePct: number | null;
  /** true if today's session is still in progress */
  todayInProgress: boolean;
}

export interface AssetSessionStats {
  assetId: string;
  symbol: string;
  name: string;
  stats: SessionStat[];
}

export interface SessionStatsPayload {
  assets: AssetSessionStats[];
  lookbackDays: number;
  ts: number;
  error?: string;
}

type Kline = [number, string, string, string, string, ...unknown[]];

interface DayAgg {
  firstOpen: number;
  lastClose: number;
  hi: number;
  lo: number;
  lastTs: number;
}

// Memoised zone offset (minutes) — a session's offset only shifts at DST
// boundaries, so caching by (tz, UTC date) avoids thousands of Intl calls.
function makeOffsetFn() {
  const cache = new Map<string, number>();
  return (tz: string, ms: number): number => {
    const date = new Date(ms);
    const key = `${tz}|${date.toISOString().slice(0, 10)}`;
    let v = cache.get(key);
    if (v === undefined) {
      v = zoneOffsetMinutes(tz, date);
      cache.set(key, v);
    }
    return v;
  };
}

function statsForAsset(klines: Kline[]): SessionStat[] {
  const offsetOf = makeOffsetFn();

  return SESSIONS.map((def) => {
    // group key = session-local calendar date "YYYY-MM-DD"
    const days = new Map<string, DayAgg>();

    for (const k of klines) {
      const openTime = k[0];
      const offMin = offsetOf(def.tz, openTime);
      const local = new Date(openTime + offMin * 60000);
      const dow = local.getUTCDay();
      if (dow === 0 || dow === 6) continue; // sessions don't run weekends
      const hour = local.getUTCHours();
      if (hour < def.openHour || hour >= def.closeHour) continue;

      const o = parseFloat(k[1]);
      const h = parseFloat(k[2]);
      const l = parseFloat(k[3]);
      const c = parseFloat(k[4]);
      if (![o, h, l, c].every(Number.isFinite)) continue;

      const dateKey = local.toISOString().slice(0, 10);
      const agg = days.get(dateKey);
      if (!agg) {
        days.set(dateKey, { firstOpen: o, lastClose: c, hi: h, lo: l, lastTs: openTime });
      } else {
        agg.hi = Math.max(agg.hi, h);
        agg.lo = Math.min(agg.lo, l);
        agg.lastClose = c;
        agg.lastTs = openTime;
        // candles arrive oldest→newest, so firstOpen stays the first seen
      }
    }

    const keys = [...days.keys()].sort(); // chronological
    if (keys.length === 0) {
      return {
        session: def.id,
        name: def.name,
        avgRangePct: null,
        avgMovePct: null,
        samples: 0,
        todayRangePct: null,
        todayMovePct: null,
        todayInProgress: false,
      };
    }

    // Most recent session date = "today" for this session; average the rest.
    const todayKey = keys[keys.length - 1];
    const today = days.get(todayKey)!;
    const history = keys.slice(0, -1).map((kk) => days.get(kk)!);

    let avgRangePct: number | null = null;
    let avgMovePct: number | null = null;
    if (history.length >= MIN_SAMPLES) {
      const ranges = history
        .filter((d) => d.firstOpen > 0)
        .map((d) => ((d.hi - d.lo) / d.firstOpen) * 100);
      const moves = history
        .filter((d) => d.firstOpen > 0)
        .map((d) => Math.abs((d.lastClose - d.firstOpen) / d.firstOpen) * 100);
      avgRangePct = ranges.reduce((a, b) => a + b, 0) / ranges.length;
      avgMovePct = moves.reduce((a, b) => a + b, 0) / moves.length;
    }

    const todayRangePct = today.firstOpen > 0 ? ((today.hi - today.lo) / today.firstOpen) * 100 : null;
    const todayMovePct =
      today.firstOpen > 0 ? ((today.lastClose - today.firstOpen) / today.firstOpen) * 100 : null;

    // In progress if the last candle of "today" is within the last ~90 min.
    const todayInProgress = Date.now() - today.lastTs < 90 * 60000;

    return {
      session: def.id,
      name: def.name,
      avgRangePct,
      avgMovePct,
      samples: history.length,
      todayRangePct,
      todayMovePct,
      todayInProgress,
    };
  });
}

async function fetchKlines(symbol: string): Promise<Kline[] | null> {
  const path = `/api/v3/klines?symbol=${symbol}USDT&interval=1h&limit=${KLIMIT}`;
  for (const host of HOSTS) {
    try {
      const res = await fetch(`https://${host}${path}`, { next: { revalidate: 3600 } });
      if (res.ok) return (await res.json()) as Kline[];
    } catch {
      /* try next host */
    }
  }
  return null;
}

export async function GET() {
  try {
    const results = await Promise.all(
      COVERED.map(async (a) => {
        const k = await fetchKlines(a.symbol);
        if (!k || k.length === 0) return null;
        return {
          assetId: a.assetId,
          symbol: a.symbol,
          name: a.name,
          stats: statsForAsset(k),
        } satisfies AssetSessionStats;
      })
    );

    const assets = results.filter((x): x is AssetSessionStats => x !== null);
    if (assets.length === 0) throw new Error("no upstream data");

    const payload: SessionStatsPayload = {
      assets,
      lookbackDays: Math.round(KLIMIT / 24),
      ts: Date.now(),
    };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable", assets: [], lookbackDays: 0, ts: Date.now() },
      { status: 502 }
    );
  }
}
