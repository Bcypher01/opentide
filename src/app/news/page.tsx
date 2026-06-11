"use client";

import { useState } from "react";
import { ASSET_BY_ID, type Market } from "@/lib/assets";
import { timeAgo } from "@/lib/format";
import { useNow, usePolling } from "@/lib/hooks";
import { useOpenChart } from "@/lib/nav";
import AppShell from "@/components/AppShell";
import { NewsItemSkeleton } from "@/components/DashboardSkeleton";
import { IconNews } from "@/components/Icons";
import type { NewsItem } from "@/components/NewsFeed";

interface NewsPayload {
  items: NewsItem[];
  trending: Array<{ id: string; count: number }>;
}

const MARKET_COLOR: Record<Market, string> = {
  crypto: "#00D4AA",
  forex: "#4FA8E8",
  stocks: "#E8B44F",
};

const TABS: Array<{ id: Market | "all"; label: string }> = [
  { id: "all", label: "All markets" },
  { id: "forex", label: "Forex" },
  { id: "crypto", label: "Crypto" },
  { id: "stocks", label: "Stocks" },
];

const SOURCES = [
  { name: "CoinDesk", market: "Crypto" },
  { name: "Cointelegraph", market: "Crypto" },
  { name: "CNBC Markets", market: "Stocks" },
  { name: "MarketWatch", market: "Stocks" },
  { name: "FXStreet", market: "Forex" },
];

export default function NewsPage() {
  const now = useNow(30_000);
  const openChart = useOpenChart();
  const news = usePolling<NewsPayload>("/api/news", 300_000);
  const [tab, setTab] = useState<Market | "all">("all");

  const items = (news.data?.items ?? []).filter((it) => tab === "all" || it.market === tab);
  const trending = news.data?.trending ?? [];

  return (
    <AppShell>
      <div>
        <header className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
              <IconNews size={22} className="text-accent" />
              Newswire
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted">
              Five free wires, one stream — every story tagged to the market and assets it
              affects. Tap an asset tag to chart it.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border bg-surface p-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`min-h-[32px] rounded-md px-3 py-1 text-xs transition-colors ${
                  tab === t.id ? "bg-text font-medium text-bg" : "text-muted hover:text-text"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          {/* The wire */}
          <div className="lg:col-span-9">
            <section className="rounded-2xl border border-border bg-surface p-2">
              {news.data === null && (
                <div className="p-1">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <NewsItemSkeleton
                      key={i}
                      titleWidth={["w-2/3", "w-5/6", "w-1/2", "w-3/4"][i % 4]}
                    />
                  ))}
                </div>
              )}

              {news.error && items.length === 0 && (
                <p className="p-4 text-sm text-muted">
                  Newswire unreachable right now — it retries automatically.
                </p>
              )}

              {items.map((it, i) => (
                <article
                  key={`${it.link}-${i}`}
                  className="rounded-xl px-3 py-3 transition-colors hover:bg-surface2"
                >
                  <a href={it.link} target="_blank" rel="noreferrer" className="block">
                    <h3 className="text-sm leading-snug text-text">{it.title}</h3>
                  </a>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: MARKET_COLOR[it.market] }}
                    />
                    <span>{it.source}</span>
                    <span className="num">{timeAgo(it.ts, now.getTime())}</span>
                    {it.assets.slice(0, 4).map((id) => {
                      const a = ASSET_BY_ID[id];
                      if (!a) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => openChart(id)}
                          title={`View ${a.symbol} chart`}
                          className="rounded-full border border-border bg-surface2 px-2 py-0.5 text-[10px] text-muted transition-colors hover:border-accent/50 hover:text-accent"
                        >
                          {a.symbol} ↗
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-5 lg:col-span-3">
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="font-display text-sm font-semibold">Dominating the wire</h2>
              <p className="mt-0.5 text-[11px] text-muted/70">
                assets with the most coverage in the last 40 stories
              </p>
              <div className="mt-3">
                {trending.length === 0 ? (
                  <p className="text-xs text-muted">No strong clusters right now.</p>
                ) : (
                  <ul className="space-y-1">
                    {trending.map(({ id, count }) => {
                      const a = ASSET_BY_ID[id];
                      if (!a) return null;
                      return (
                        <li key={id}>
                          <button
                            onClick={() => openChart(id)}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface2"
                          >
                            <span className="text-sm font-medium">{a.symbol}</span>
                            <span className="min-w-0 flex-1 truncate text-xs text-muted">
                              {a.name}
                            </span>
                            <span className="num rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-muted">
                              {count}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="font-display text-sm font-semibold">Sources</h2>
              <p className="mt-0.5 text-[11px] text-muted/70">
                free public wires, refreshed every 10 minutes
              </p>
              <ul className="mt-3 space-y-1.5">
                {SOURCES.map((s) => (
                  <li key={s.name} className="flex items-center justify-between text-xs">
                    <span>{s.name}</span>
                    <span className="text-muted/70">{s.market}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4 text-xs leading-relaxed text-muted">
              <span className="font-medium text-text">How tagging works.</span> Each headline is
              scanned for asset names, tickers and central-bank keywords, then tagged to the
              markets it touches. Tags are heuristic — read the story before acting on it.
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
