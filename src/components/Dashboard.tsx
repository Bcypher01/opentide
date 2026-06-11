"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ALL_ASSETS,
  ASSET_BY_ID,
  SUGGESTED_STARS,
  type AssetDef,
  type Market,
} from "@/lib/assets";
import { timeAgo } from "@/lib/format";
import { useBinanceLive, useNow, usePolling } from "@/lib/hooks";
import { useOpenChart } from "@/lib/nav";
import { getAllSessionStates } from "@/lib/sessions";
import { useStore } from "@/lib/store";
import AppShell from "./AppShell";
import ChartPanel from "./ChartPanel";
import Hero from "./Hero";
import Movers from "./Movers";
import NewsFeed, { type NewsItem } from "./NewsFeed";
import PriceRow from "./PriceRow";
import SessionClock from "./SessionClock";
import Ticker from "./Ticker";

interface Quote {
  symbol: string;
  price: number;
  changePct: number | null;
}
interface ApiPayload {
  quotes: Quote[];
  source?: string;
  asOf?: string;
  error?: string;
}
interface NewsPayload {
  items: NewsItem[];
  trending: Array<{ id: string; count: number }>;
  error?: string;
}

const MARKET_LABEL: Record<Market, string> = {
  forex: "Forex",
  crypto: "Crypto",
  stocks: "Stocks",
};

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const now = useNow(1000);
  const states = useMemo(() => getAllSessionStates(now), [now]);

  const crypto = usePolling<ApiPayload>("/api/crypto", 30_000);
  const forex = usePolling<ApiPayload>("/api/forex", 300_000);
  const stocks = usePolling<ApiPayload>("/api/stocks", 60_000);
  const news = usePolling<NewsPayload>("/api/news", 300_000);
  const live = useBinanceLive();
  const openChart = useOpenChart();

  const {
    watchlist,
    toggleWatch,
    marketFilter,
    setMarketFilter,
    sessionFilter,
    setSessionFilter,
    selectedAsset,
    heroDismissed,
    dismissHero,
    useUTC,
  } = useStore();

  // id -> quote, with live WS ticks layered over REST for crypto
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

  const visible = useMemo(() => {
    return ALL_ASSETS.filter((a) => {
      if (marketFilter !== "all" && a.market !== marketFilter) return false;
      if (sessionFilter && !a.sessions.includes(sessionFilter)) return false;
      return true;
    });
  }, [marketFilter, sessionFilter]);

  const byMarket = useMemo(() => {
    const g: Record<Market, AssetDef[]> = { forex: [], crypto: [], stocks: [] };
    for (const a of visible) g[a.market].push(a);
    return g;
  }, [visible]);

  const watched = watchlist
    .map((id) => ASSET_BY_ID[id])
    .filter((a): a is AssetDef => Boolean(a));

  if (!mounted) {
    return (
      <AppShell>
        <div className="space-y-4">
          <div className="skeleton h-48 w-full" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-96 w-full" />
        </div>
      </AppShell>
    );
  }

  const sectionMeta: Record<Market, { state: typeof crypto; note?: string }> = {
    forex: { state: forex, note: "ECB daily reference" },
    crypto: { state: crypto },
    stocks: { state: stocks },
  };

  const selQuote = quoteOf[selectedAsset];

  return (
    <AppShell ticker={<Ticker quoteOf={quoteOf} onSelect={openChart} />}>
      {/* First-visit story */}
      {!heroDismissed && <Hero onDismiss={dismissHero} />}

      {/* Session clock */}
      <div className="mt-4">
        <SessionClock
          now={now}
          states={states}
          useUTC={useUTC}
          selected={sessionFilter}
          onSelect={setSessionFilter}
        />
      </div>

      {/* Top movers */}
      <Movers quoteOf={quoteOf} onSelect={openChart} />

      {/* Main 3-column shell: markets | chart | news */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* LEFT — watchlist + one scrollable markets card */}
        <div className="space-y-5 lg:col-span-4 xl:col-span-3">
          {/* Watchlist */}
          <section className="rounded-2xl border border-border bg-surface p-2">
            <h2 className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-muted">
              Watchlist
            </h2>
            {watched.length === 0 ? (
              <div className="px-3 pb-3 pt-1 text-sm text-muted">
                Star anything to pin it here. Try:
                <span className="mt-2 flex flex-wrap gap-2">
                  {SUGGESTED_STARS.map((id) => (
                    <button
                      key={id}
                      onClick={() => toggleWatch(id)}
                      className="rounded-full border border-border bg-surface2 px-3 py-1 text-xs text-text transition-colors hover:border-accent/50"
                    >
                      + {ASSET_BY_ID[id]?.symbol}
                    </button>
                  ))}
                </span>
              </div>
            ) : (
              <div className="max-h-[264px] overflow-y-auto">
                {watched.map((a) => (
                  <div key={a.id} onClick={() => openChart(a.id)} className="cursor-pointer">
                    <PriceRow
                      asset={a}
                      price={quoteOf[a.id]?.price ?? null}
                      changePct={quoteOf[a.id]?.changePct ?? null}
                      live={a.market === "crypto" && a.symbol in live}
                      watched
                      onToggleWatch={toggleWatch}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Markets — single card, fixed height, scrollable */}
          <section className="rounded-2xl border border-border bg-surface">
            <div className="border-b border-border p-3">
              <nav className="flex flex-wrap items-center gap-2" aria-label="Market filter">
                {(["all", "forex", "crypto", "stocks"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMarketFilter(m)}
                    className={`min-h-[32px] rounded-full px-3.5 py-1 text-xs transition-colors ${
                      marketFilter === m
                        ? "bg-text font-medium text-bg"
                        : "border border-border bg-surface2 text-muted hover:text-text"
                    }`}
                  >
                    {m === "all" ? "All" : MARKET_LABEL[m]}
                  </button>
                ))}
                {sessionFilter && (
                  <button
                    onClick={() => setSessionFilter(null)}
                    className="min-h-[32px] rounded-full border border-accent/50 bg-accent/10 px-3.5 py-1 text-xs text-accent"
                  >
                    {states.find((s) => s.def.id === sessionFilter)?.def.name} ✕
                  </button>
                )}
              </nav>
            </div>

            <div className="max-h-[560px] overflow-y-auto p-2">
              {(["crypto", "forex", "stocks"] as Market[]).map((m) => {
                const assets = byMarket[m];
                if (assets.length === 0) return null;
                const meta = sectionMeta[m];
                const missingKey = m === "stocks" && meta.state.data?.error === "missing_key";

                return (
                  <div key={m}>
                    <div className="flex items-baseline justify-between px-3 pb-1 pt-3 first:pt-1">
                      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted">
                        {MARKET_LABEL[m]}
                        {meta.note && (
                          <span className="ml-2 normal-case tracking-normal text-muted/70">
                            · {meta.note}
                          </span>
                        )}
                      </h3>
                      <span className="num text-[10px] text-muted/70">
                        {meta.state.error
                          ? "reconnecting…"
                          : timeAgo(meta.state.lastUpdated, now.getTime())}
                      </span>
                    </div>

                    {missingKey ? (
                      <div className="mx-2 mb-2 rounded-lg border border-border bg-surface2 p-3 text-xs text-muted">
                        <p className="font-medium text-text">Stocks need a free API key</p>
                        <p className="mt-1">
                          Get one at{" "}
                          <a
                            className="text-accent underline"
                            href="https://finnhub.io/register"
                            target="_blank"
                            rel="noreferrer"
                          >
                            finnhub.io/register
                          </a>
                          , add <code className="num">FINNHUB_API_KEY</code> to{" "}
                          <code className="num">.env.local</code>, restart.
                        </p>
                      </div>
                    ) : (
                      assets.map((a) => (
                        <div key={a.id} onClick={() => openChart(a.id)} className="cursor-pointer">
                          <PriceRow
                            asset={a}
                            price={quoteOf[a.id]?.price ?? null}
                            changePct={quoteOf[a.id]?.changePct ?? null}
                            live={a.market === "crypto" && a.symbol in live}
                            watched={watchlist.includes(a.id)}
                            onToggleWatch={toggleWatch}
                          />
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* CENTER — chart with news-driven suggestions */}
        <div className="lg:col-span-8 xl:col-span-6">
          <ChartPanel
            assetId={selectedAsset}
            price={selQuote?.price ?? null}
            changePct={selQuote?.changePct ?? null}
            trending={news.data?.trending ?? []}
            onSelect={openChart}
          />
          <p className="mt-2 px-1 text-[11px] text-muted/60">
            Tip: tap any asset, mover, ticker entry or headline tag to chart it here.
          </p>
        </div>

        {/* RIGHT — newswire (capped; full wire lives on /news) */}
        <div className="lg:col-span-12 xl:col-span-3">
          <NewsFeed
            items={(news.data?.items ?? []).slice(0, 16)}
            loading={news.data === null}
            error={news.error}
            now={now.getTime()}
            onSelectAsset={openChart}
            heightClass="xl:h-[604px]"
            footer={
              <Link
                href="/news"
                className="block border-t border-border px-4 py-2.5 text-center text-xs text-accent transition-colors hover:bg-surface2"
              >
                All news →
              </Link>
            }
          />
        </div>
      </div>
    </AppShell>
  );
}
