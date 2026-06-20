"use client";

import { useEffect, useMemo, useState } from "react";
import type { CurrencyStrength } from "@/app/api/forex/route";
import type { PulsePayload } from "@/app/api/pulse/route";
import type { SessionStatsPayload } from "@/app/api/sessionstats/route";
import AiInsights from "@/components/AiInsights";
import AppShell from "@/components/AppShell";
import {
  EventRiskPanel,
  HotStocksPanel,
  IpoPanel,
  TrendingCoinsPanel,
} from "@/components/Buzz";
import Heatmap from "@/components/Heatmap";
import { IconActivity, IconNews, IconZap } from "@/components/Icons";
import type { NewsItem } from "@/components/NewsFeed";
import PulseSkeleton from "@/components/PulseSkeleton";
import PulseStrip from "@/components/PulseStrip";
import RiskDial from "@/components/RiskDial";
import SessionStats from "@/components/SessionStats";
import { ASSET_BY_ID } from "@/lib/assets";
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
interface NewsPayload {
  items: NewsItem[];
  trending: Array<{ id: string; count: number }>;
}

/** Section band heading — labels the two halves of the page so users always
 *  know whether they're reading market *mood* or what's getting *attention*. */
function Band({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div className="mb-3 mt-8 flex items-baseline gap-2.5">
      <span className="text-accent">{icon}</span>
      <h2 className="font-display text-lg font-semibold tracking-tight">{label}</h2>
      <span className="text-xs text-muted">{sub}</span>
    </div>
  );
}

/**
 * Markets — the single attention destination, merged from the former Pulse and
 * Buzz tabs. Two clearly-labeled bands:
 *   • Mood      — how the whole board feels right now (risk dial, heatmaps,
 *                 per-session stats). Composites, not signals.
 *   • Attention — what the market is watching (trending names, news clusters,
 *                 scheduled event risk, upcoming IPOs) + personalized AI ideas.
 * Tap anything to chart it.
 */
export default function MarketsPage() {
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
  const news = usePolling<NewsPayload>("/api/news", 300_000);
  const live = useBinanceLive();

  const trending = news.data?.trending ?? [];

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

  // Mood band renders populated once the client clock has settled and the
  // primary data (sentiment + crypto) is in; otherwise the shaped skeleton.
  const ready = mounted && !!pulse.data && !!crypto.data;

  return (
    <AppShell>
      <div>
        <header className="mt-2">
          <h1 className="font-display flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <IconActivity size={22} className="text-accent" />
            Markets
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            The whole board in one place: how markets <em>feel</em> right now, and what
            they&apos;re <em>watching</em>. Mood is a synthesized risk-on / risk-off read with
            heatmaps and session stats; Attention is the trending names, news clusters, scheduled
            event risk and IPOs. Composites and attention, not buy signals — tap anything to open
            its chart.
          </p>
        </header>

        {/* Sentiment/macro strip — frames the whole read */}
        <PulseStrip data={pulse.data} />

        {/* ───────────────────────── MOOD ───────────────────────── */}
        <Band
          icon={<IconActivity size={18} />}
          label="Mood"
          sub="how the board feels right now"
        />
        {ready ? (
          <>
            <RiskDial pulse={pulse.data} quoteOf={quoteOf} />
            <SessionStats data={sessionStats.data} states={states} onSelect={openChart} />
            <Heatmap quoteOf={quoteOf} strength={forex.data?.strength ?? null} onSelect={openChart} />
          </>
        ) : (
          <PulseSkeleton />
        )}

        {/* ──────────────────────── ATTENTION ───────────────────── */}
        <Band
          icon={<IconZap size={18} />}
          label="Attention"
          sub="what the market is watching"
        />

        {/* Personalized AI ideas from live context + the user's watchlist.
            Self-hides when no LLM key is configured. */}
        <AiInsights onSelectAsset={openChart} />

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TrendingCoinsPanel onSelect={openChart} />

          {/* Most mentioned in news */}
          <div className="flex flex-col rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <span className="text-accent">
                <IconNews size={15} />
              </span>
              <h3 className="font-display text-sm font-semibold">Dominating the news</h3>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-muted/60">
                last 40 stories · Opentide wire
              </span>
            </div>
            <div className="mt-3">
              {news.data === null ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="skeleton h-7" />
                  ))}
                </div>
              ) : trending.length === 0 ? (
                <p className="text-xs text-muted">No strong news clusters right now.</p>
              ) : (
                <ul className="space-y-1">
                  {trending.map(({ id, count }, i) => {
                    const a = ASSET_BY_ID[id];
                    if (!a) return null;
                    return (
                      <li key={id}>
                        <button
                          onClick={() => openChart(id)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface2"
                          title={`View ${a.symbol} chart`}
                        >
                          <span className="num w-5 shrink-0 text-center text-[11px] text-muted/60">
                            {i + 1}
                          </span>
                          <span className="text-sm font-medium">{a.symbol}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-muted">
                            {a.name}
                          </span>
                          <span className="num rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-muted">
                            {count} stories
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <HotStocksPanel onSelect={openChart} />
          <EventRiskPanel />
          <IpoPanel />
        </div>

        <p className="mt-6 rounded-2xl border border-border bg-surface p-4 text-xs leading-relaxed text-muted">
          <span className="font-medium text-text">How to read this page.</span>{" "}
          <span className="font-medium text-text">Mood:</span> the risk dial averages cross-market
          signals onto one −100…+100 scale (the dollar counts inversely); heatmaps colour 24h change
          (crypto/stocks) or ECB currency strength (forex); session stats compare today&apos;s range
          to a multi-week per-session average.{" "}
          <span className="font-medium text-text">Attention:</span> trending lists measure attention
          (search volume, headline counts), not quality — high attention plus a session opening soon
          is where moves tend to cluster. Event risk lists <em>scheduled</em> volatility; IPO dates
          can shift, so confirm with the exchange. All informational, none of it investment advice.
        </p>
      </div>
    </AppShell>
  );
}
