"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AiInsights from "@/components/AiInsights";
import AppShell from "@/components/AppShell";
import { IconSearch, IconStar } from "@/components/Icons";
import NewsFeed, { type NewsItem } from "@/components/NewsFeed";
import PriceRow from "@/components/PriceRow";
import {
  ASSET_BY_ID,
  SUGGESTED_STARS,
  type AssetDef,
} from "@/lib/assets";
import { useBinanceLive, useNow, usePolling } from "@/lib/hooks";
import { useOpenChart } from "@/lib/nav";
import { useStore } from "@/lib/store";

interface Quote {
  symbol: string;
  price: number;
  changePct: number | null;
}
interface ApiPayload {
  quotes: Quote[];
}
interface NewsPayload {
  items: NewsItem[];
  trending: Array<{ id: string; count: number }>;
}

/**
 * Watchlist — the personalization spine as a first-class destination (it also
 * lives as a lane on the dashboard). Everything the watchlist unlocks, in one
 * place: live prices for the assets you track, AI ideas personalized to them,
 * and a newswire filtered to stories that mention them.
 */
export default function WatchlistPage() {
  const now = useNow(1000);
  const openChart = useOpenChart();
  const { watchlist, toggleWatch, openPalette } = useStore();
  const [addOpen, setAddOpen] = useState(false);

  const crypto = usePolling<ApiPayload>("/api/crypto", 30_000);
  const forex = usePolling<ApiPayload>("/api/forex", 300_000);
  const stocks = usePolling<ApiPayload>("/api/stocks", 60_000);
  const news = usePolling<NewsPayload>("/api/news", 300_000);
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

  const watched = watchlist
    .map((id) => ASSET_BY_ID[id])
    .filter((a): a is AssetDef => Boolean(a));

  // Newswire filtered to stories that mention a watched asset.
  const watchedSet = useMemo(() => new Set(watchlist), [watchlist]);
  const relevantNews = useMemo(
    () =>
      (news.data?.items ?? []).filter((it) =>
        it.assets.some((id) => watchedSet.has(id))
      ),
    [news.data, watchedSet]
  );

  // Quick-add suggestions: popular stars the user hasn't pinned yet.
  const addSuggestions = useMemo(
    () => SUGGESTED_STARS.filter((id) => !watchedSet.has(id)),
    [watchedSet]
  );

  const empty = watched.length === 0;

  return (
    <AppShell>
      <div>
        <header className="mt-2">
          <h1 className="font-display flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <IconStar size={22} className="text-accent" filled />
            Watchlist
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            The assets you track, and everything they unlock — live prices, AI ideas tuned to your
            picks, and a newswire filtered to just your names. Star anything across the app to add
            it here; it also drives your catch-ups and alerts. Tap a row to chart it.
          </p>
        </header>

        {empty ? (
          <section className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-text">Your watchlist is empty.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              Starring an asset personalizes your AI insights, your &ldquo;since you left&rdquo;
              catch-ups, and your alerts. Start with a few:
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTED_STARS.map((id) => (
                <button
                  key={id}
                  onClick={() => toggleWatch(id)}
                  className="rounded-full border border-border bg-surface2 px-3.5 py-1.5 text-sm text-text transition-colors hover:border-accent/50 hover:text-accent"
                >
                  + {ASSET_BY_ID[id]?.symbol}
                </button>
              ))}
              <button
                onClick={openPalette}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface2 px-3.5 py-1.5 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent"
              >
                <IconSearch size={13} /> Search all
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Personalized AI ideas (self-hides without an LLM key). */}
            <AiInsights onSelectAsset={openChart} />

            <div className="mt-4 grid items-start gap-5 lg:grid-cols-12">
              {/* Tracked assets — the card fits and grows with its content. */}
              <section className="flex flex-col rounded-2xl border border-border bg-surface p-2 lg:col-span-7">
                <h2 className="flex items-center gap-2 px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-muted">
                  My markets
                  <span className="num rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] normal-case text-muted/70">
                    {watched.length}
                  </span>
                </h2>

                <div>
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

                {/* Add more — quick-add chips for popular names, plus search. */}
                <div className="mt-1 border-t border-border px-1.5 pb-1 pt-2">
                  {addOpen ? (
                    <div className="flex flex-wrap items-center gap-2 px-1.5 pb-1">
                      {addSuggestions.map((id) => (
                        <button
                          key={id}
                          onClick={() => toggleWatch(id)}
                          className="rounded-full border border-border bg-surface2 px-3 py-1 text-xs text-text transition-colors hover:border-accent/50 hover:text-accent"
                        >
                          + {ASSET_BY_ID[id]?.symbol}
                        </button>
                      ))}
                      <button
                        onClick={openPalette}
                        className="flex items-center gap-1.5 rounded-full border border-border bg-surface2 px-3 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        <IconSearch size={12} /> Search all
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddOpen(true)}
                      className="w-full rounded-lg px-2 py-2 text-sm font-medium text-accent transition-colors hover:bg-surface2"
                    >
                      + Add more
                    </button>
                  )}
                </div>
              </section>

              {/* Watchlist-relevant newswire — short, fixed height, scrollable. */}
              <div className="lg:col-span-5">
                {news.data !== null && relevantNews.length === 0 ? (
                  <div className="flex h-[440px] flex-col rounded-2xl border border-border bg-surface">
                    <h2 className="border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted">
                      Newswire
                    </h2>
                    <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
                      <p className="text-sm text-muted">
                        No recent stories mention your watchlist.
                      </p>
                      <Link href="/news" className="text-sm text-accent hover:underline">
                        Browse all news →
                      </Link>
                    </div>
                  </div>
                ) : (
                  // Definite-height wrapper so NewsFeed's own h-full resolves to
                  // a fixed box and the list scrolls inside — short, like the
                  // dashboard, instead of growing with every story.
                  <div className="h-[440px]">
                    <NewsFeed
                      items={relevantNews}
                      loading={news.data === null}
                      error={news.error}
                      now={now.getTime()}
                      onSelectAsset={openChart}
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
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
