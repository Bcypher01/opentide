"use client";

import { useEffect, useMemo, useState } from "react";
import type { CurrencyStrength } from "@/app/api/forex/route";
import type { PulsePayload } from "@/app/api/pulse/route";
import type { SessionStatsPayload } from "@/app/api/sessionstats/route";
import AppShell from "@/components/AppShell";
import Heatmap from "@/components/Heatmap";
import { IconActivity } from "@/components/Icons";
import PulseSkeleton from "@/components/PulseSkeleton";
import PulseStrip from "@/components/PulseStrip";
import RiskDial from "@/components/RiskDial";
import SessionStats from "@/components/SessionStats";
import { useBinanceLive, useNow, usePolling } from "@/lib/hooks";
import { useOpenChart } from "@/lib/nav";
import { getAllSessionStates } from "@/lib/sessions";

interface Quote {
  symbol: string;
  price: number;
  changePct: number | null;
}
interface ApiPayload {
  quotes: Quote[];
  strength?: CurrencyStrength[] | null;
}

/**
 * Pulse — the deep read behind the dashboard's "Market pulse" strip. Three
 * cross-market composites that don't belong in the morning-ritual scan:
 * the risk-on/risk-off dial, the crypto/stocks/forex heatmaps, and the
 * per-session statistics. Each reuses data the app already polls.
 */
export default function PulsePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const now = useNow(30_000);
  const states = useMemo(() => getAllSessionStates(now), [now]);
  const openChart = useOpenChart();

  const crypto = usePolling<ApiPayload>("/api/crypto", 30_000);
  const forex = usePolling<ApiPayload>("/api/forex", 300_000);
  const stocks = usePolling<ApiPayload>("/api/stocks", 60_000);
  const pulse = usePolling<PulsePayload>("/api/pulse", 600_000);
  const sessionStats = usePolling<SessionStatsPayload>("/api/sessionstats", 3_600_000);
  const live = useBinanceLive();

  const quoteOf = useMemo(() => {
    const map: Record<string, Quote> = {};
    for (const q of forex.data?.quotes ?? []) map[`forex:${q.symbol}`] = q;
    for (const q of crypto.data?.quotes ?? []) map[`crypto:${q.symbol}`] = q;
    for (const q of stocks.data?.quotes ?? []) map[`stocks:${q.symbol}`] = q;
    for (const [sym, tick] of Object.entries(live)) {
      map[`crypto:${sym}`] = { symbol: sym, price: tick.price, changePct: tick.changePct };
    }
    return map;
  }, [forex.data, crypto.data, stocks.data, live]);

  // Render real panels once mounted (client clock settled) and the fast
  // primary data is present; otherwise show the content-shaped skeleton.
  const ready = mounted && !!pulse.data && !!crypto.data;

  return (
    <AppShell>
      <div>
        <header className="mt-2">
          <h1 className="font-display flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <IconActivity size={22} className="text-accent" />
            Pulse
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            The deeper read behind the dashboard&apos;s pulse strip. One synthesized risk-on /
            risk-off dial, heatmaps to scan every market at a glance, and what each asset
            <em> usually</em> does per session versus today. Composites, not signals — tap anything
            to open its chart.
          </p>
        </header>

        {/* Same sentiment/macro strip — mood frames the read */}
        <PulseStrip data={pulse.data} />

        {/* Hold the content-shaped skeleton until the page's primary data (mood
            + crypto quotes) is in, so the dial and heatmap render populated.
            Session stats and forex strength stream in shortly after. */}
        {ready ? (
          <>
            <RiskDial pulse={pulse.data} quoteOf={quoteOf} />
            <SessionStats data={sessionStats.data} states={states} onSelect={openChart} />
            <Heatmap quoteOf={quoteOf} strength={forex.data?.strength ?? null} onSelect={openChart} />
          </>
        ) : (
          <PulseSkeleton />
        )}

        <p className="mt-6 rounded-2xl border border-border bg-surface p-4 text-xs leading-relaxed text-muted">
          <span className="font-medium text-text">How to read this page.</span> The risk dial
          averages cross-market signals onto one −100…+100 scale; the dollar counts inversely. The
          heatmap colours 24h change (crypto/stocks) or shows currency strength from the ECB cross
          matrix (forex). Session stats compare today&apos;s range to a multi-week per-session
          average, crypto-only since it&apos;s the one free intraday source. All informational, none
          of it investment advice.
        </p>
      </div>
    </AppShell>
  );
}
