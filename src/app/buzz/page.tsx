"use client";

import type { PulsePayload } from "@/app/api/pulse/route";
import { ASSET_BY_ID } from "@/lib/assets";
import { usePolling } from "@/lib/hooks";
import { useOpenChart } from "@/lib/nav";
import AppShell from "@/components/AppShell";
import {
  EventRiskPanel,
  HotStocksPanel,
  IpoPanel,
  TrendingCoinsPanel,
} from "@/components/Buzz";
import { IconNews, IconZap } from "@/components/Icons";
import type { NewsItem } from "@/components/NewsFeed";
import PulseStrip from "@/components/PulseStrip";

interface NewsPayload {
  items: NewsItem[];
  trending: Array<{ id: string; count: number }>;
}

export default function BuzzPage() {
  const openChart = useOpenChart();
  const news = usePolling<NewsPayload>("/api/news", 300_000);
  const pulse = usePolling<PulsePayload>("/api/pulse", 600_000);
  const trending = news.data?.trending ?? [];

  return (
    <AppShell>
      <div>
        <header className="mt-2">
          <h1 className="font-display flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <IconZap size={22} className="text-accent" />
            Buzz
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            What the market is paying attention to right now — the most-searched coins and
            stocks, the names dominating the news cycle, the IPOs coming up, and the
            scheduled releases most likely to shake things. Attention isn&apos;t a buy
            signal, but it tells you where volatility is likely to show up — and the
            calendar tells you when. Tap anything to open its chart, or tap an event to
            learn what it means.
          </p>
        </header>

        {/* Same sentiment/macro strip as the dashboard — mood frames attention */}
        <PulseStrip data={pulse.data} />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          <span className="font-medium text-text">How to read this page.</span> Trending lists
          measure attention (search volume and headline counts), not quality. High attention +
          a session opening soon (check the dashboard clock) is where moves tend to cluster.
          Event risk lists <em>scheduled</em> volatility — prices often jump in the minutes
          around a high-impact release, whichever way the number lands. IPO dates can shift —
          confirm with the exchange before acting. None of this is investment advice.
        </p>
      </div>
    </AppShell>
  );
}
