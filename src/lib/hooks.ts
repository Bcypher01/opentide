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
