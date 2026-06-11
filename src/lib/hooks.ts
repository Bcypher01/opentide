"use client";

import { useEffect, useRef, useState } from "react";
import { BINANCE_SYMBOLS } from "./assets";

// ---------------------------------------------------------------------------
// usePolling — fetch a JSON endpoint on an interval (pauses in hidden tabs).
// ---------------------------------------------------------------------------
export interface PollState<T> {
  data: T | null;
  error: boolean;
  lastUpdated: number | null;
}

export function usePolling<T>(url: string, intervalMs: number): PollState<T> {
  const [state, setState] = useState<PollState<T>>({
    data: null,
    error: false,
    lastUpdated: null,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as T;
        if (!cancelled)
          setState({ data: json, error: false, lastUpdated: Date.now() });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, error: true }));
      }
    }

    tick();
    timer = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, intervalMs]);

  return state;
}

// ---------------------------------------------------------------------------
// useBinanceLive — one combined WebSocket stream of miniTickers for all
// tracked crypto. Browser-direct: costs the server nothing.
// ---------------------------------------------------------------------------
export interface LiveTick {
  price: number;
  changePct: number;
}

export function useBinanceLive(): Record<string, LiveTick> {
  const [ticks, setTicks] = useState<Record<string, LiveTick>>({});
  const bufRef = useRef<Record<string, LiveTick>>({});

  useEffect(() => {
    const streams = BINANCE_SYMBOLS.map(
      (s) => `${s.toLowerCase()}@miniTicker`
    ).join("/");
    let ws: WebSocket | null = null;
    let alive = true;
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!alive) return;
      // data-stream.binance.vision = official market-data mirror, not geo-blocked
      // for US visitors (stream.binance.com returns 451 from US IPs).
      ws = new WebSocket(`wss://data-stream.binance.vision/stream?streams=${streams}`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          const d = msg.data;
          if (!d || !d.s) return;
          const base = (d.s as string).replace(/USDT$/, "");
          const close = parseFloat(d.c);
          const open = parseFloat(d.o);
          bufRef.current[base] = {
            price: close,
            changePct: open > 0 ? ((close - open) / open) * 100 : 0,
          };
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (alive) retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    }

    connect();
    // Flash-friendly: flush buffered ticks to React at most every 1.5s
    flushTimer = setInterval(() => {
      if (Object.keys(bufRef.current).length === 0) return;
      setTicks((prev) => ({ ...prev, ...bufRef.current }));
      bufRef.current = {};
    }, 1500);

    return () => {
      alive = false;
      if (flushTimer) clearInterval(flushTimer);
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return ticks;
}

// ---------------------------------------------------------------------------
// useNow — shared clock, ticking every `ms`.
// ---------------------------------------------------------------------------
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// ---------------------------------------------------------------------------
// useAwayDiff — "while you were away". Snapshots current prices to
// localStorage every minute; on a return visit (>30 min gap) computes what
// moved since the trader last looked. Zero APIs, zero accounts.
// ---------------------------------------------------------------------------
const AWAY_KEY = "opentide:lastVisit";
const AWAY_MIN_GAP_MS = 30 * 60 * 1000;
/** Assets ranked first when the watchlist is empty. */
const AWAY_DEFAULTS = [
  "crypto:BTC",
  "crypto:ETH",
  "forex:EUR/USD",
  "stocks:NVDA",
  "stocks:AAPL",
  "stocks:TSLA",
];

interface AwaySnapshot {
  ts: number;
  prices: Record<string, number>; // asset id -> price
}

export interface AwayMove {
  id: string;
  pct: number;
}

export interface AwayDiff {
  awayMs: number;
  moves: AwayMove[]; // sorted by |pct| desc
}

export function useAwayDiff(
  quoteOf: Record<string, { price: number }>,
  watchlist: string[]
): { diff: AwayDiff | null; dismiss: () => void } {
  const [diff, setDiff] = useState<AwayDiff | null>(null);
  const computedRef = useRef(false);
  const snapshotRef = useRef<AwaySnapshot | null>(null);

  // Read the previous visit exactly once, before we start overwriting it.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AWAY_KEY);
      if (raw) snapshotRef.current = JSON.parse(raw) as AwaySnapshot;
    } catch {
      snapshotRef.current = null;
    }
  }, []);

  // Compute the diff once, as soon as enough fresh quotes have arrived.
  useEffect(() => {
    if (computedRef.current) return;
    const ids = Object.keys(quoteOf);
    if (ids.length < 5) return; // wait for real data
    computedRef.current = true;

    const snap = snapshotRef.current;
    if (!snap || Date.now() - snap.ts < AWAY_MIN_GAP_MS) return;

    const candidates = watchlist.length > 0 ? watchlist : AWAY_DEFAULTS;
    const moves: AwayMove[] = [];
    for (const id of candidates) {
      const from = snap.prices[id];
      const to = quoteOf[id]?.price;
      if (!from || !to || from <= 0) continue;
      const pct = ((to - from) / from) * 100;
      if (Math.abs(pct) >= 0.05) moves.push({ id, pct });
    }
    moves.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    if (moves.length > 0)
      setDiff({ awayMs: Date.now() - snap.ts, moves: moves.slice(0, 4) });
  }, [quoteOf, watchlist]);

  // Keep the snapshot fresh (throttled — at most once a minute).
  const lastWriteRef = useRef(0);
  useEffect(() => {
    const nowTs = Date.now();
    if (nowTs - lastWriteRef.current < 60_000) return;
    const ids = Object.keys(quoteOf);
    if (ids.length < 5) return;
    lastWriteRef.current = nowTs;
    try {
      const prices: Record<string, number> = {};
      for (const id of ids) prices[id] = quoteOf[id].price;
      localStorage.setItem(AWAY_KEY, JSON.stringify({ ts: nowTs, prices }));
    } catch {
      /* storage full / private mode — fine */
    }
  }, [quoteOf]);

  return { diff, dismiss: () => setDiff(null) };
}
