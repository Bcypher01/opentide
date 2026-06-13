"use client";

import { useMemo } from "react";
import { ASSET_BY_ID, type AssetDef } from "@/lib/assets";
import type { CalendarPayload } from "@/app/api/calendar/route";
import { formatChangePct, timeAgo } from "@/lib/format";
import { filterEvents, nextHighImpact, formatEventTime, eventCountdown } from "@/lib/calendar";
import { type SessionState, formatCountdown } from "@/lib/sessions";
import type { NewsItem } from "./NewsFeed";
import {
  IconCalendar,
  IconChevronLeft,
  IconClock,
  IconStar,
  IconTrendingUp,
} from "./Icons";

interface Props {
  watchlist: string[];
  quoteOf: Record<string, { price: number; changePct: number | null }>;
  news: NewsItem[];
  states: SessionState[];
  calendar: CalendarPayload | null;
  now: Date;
  useUTC: boolean;
  onSelectAsset: (id: string) => void;
  onExit: () => void;
}

/** Next session to open for a given asset (by its sessions[] list). */
function nextSessionFor(asset: AssetDef, states: SessionState[]) {
  const relevant = states.filter((s) => asset.sessions.includes(s.def.id));
  const open = relevant.find((s) => s.isOpen);
  if (open) return { state: open, status: "open" as const };
  const next = relevant
    .filter((s) => s.opensAt !== null)
    .sort((a, b) => (a.opensAt as number) - (b.opensAt as number))[0];
  return next ? { state: next, status: "next" as const } : null;
}

/** News items tagged to an asset (by newsKeywords). */
function newsFor(asset: AssetDef, items: NewsItem[], limit = 2): NewsItem[] {
  return items
    .filter((it) => it.assets.includes(asset.id))
    .slice(0, limit);
}

export default function DigestView({
  watchlist,
  quoteOf,
  news,
  states,
  calendar,
  now,
  useUTC,
  onSelectAsset,
  onExit,
}: Props) {
  const nowMs = now.getTime();

  const watched = useMemo(
    () =>
      watchlist
        .map((id) => ASSET_BY_ID[id])
        .filter((a): a is AssetDef => Boolean(a)),
    [watchlist]
  );

  const upcomingEvents = useMemo(() => {
    if (!calendar?.events) return [];
    return nextHighImpact(calendar.events, nowMs, 5);
  }, [calendar, nowMs]);

  const dateLabel = now.toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (watched.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted">
          Star assets from the dashboard to see them here.
        </p>
        <button
          onClick={onExit}
          className="mt-4 flex items-center gap-1 rounded-full border border-border bg-surface2 px-4 py-1.5 text-xs text-muted hover:text-text"
        >
          <IconChevronLeft size={12} /> Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Digest
          </h1>
          <p className="text-xs text-muted">{dateLabel}</p>
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:text-text"
        >
          <IconChevronLeft size={12} /> Full dashboard
        </button>
      </div>

      {/* Watchlist rows */}
      <section className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <IconStar size={13} filled className="text-accent" />
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
            Watchlist — overnight changes
          </h2>
        </div>

        <div className="divide-y divide-border">
          {watched.map((asset) => {
            const q = quoteOf[asset.id];
            const up = (q?.changePct ?? 0) >= 0;
            const sessionInfo = nextSessionFor(asset, states);
            const assetNews = newsFor(asset, news);

            return (
              <div key={asset.id} className="px-4 py-3">
                {/* Asset row */}
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => onSelectAsset(asset.id)}
                    className="group flex min-w-0 items-baseline gap-2 text-left"
                  >
                    <span className="font-medium text-text group-hover:text-accent transition-colors">
                      {asset.symbol}
                    </span>
                    <span className="truncate text-xs text-muted">{asset.name}</span>
                  </button>

                  <div className="flex shrink-0 items-baseline gap-3">
                    {q ? (
                      <>
                        <span className="num text-sm font-medium text-text">
                          {q.price.toLocaleString(undefined, {
                            maximumFractionDigits:
                              asset.market === "forex"
                                ? 5
                                : q.price > 1000
                                ? 2
                                : 4,
                          })}
                        </span>
                        <span
                          className={`num flex items-center gap-0.5 text-xs font-medium ${
                            up ? "text-bull" : "text-bear"
                          }`}
                        >
                          {up ? "▲" : "▼"}
                          {formatChangePct(q.changePct)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted/60">—</span>
                    )}
                  </div>
                </div>

                {/* Session context */}
                {sessionInfo && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <IconClock size={11} className="shrink-0 text-muted/60" />
                    {sessionInfo.status === "open" ? (
                      <span className="text-[11px] text-muted">
                        <span
                          className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-bull align-middle"
                          aria-hidden="true"
                        />
                        {sessionInfo.state.def.name} live
                        {sessionInfo.state.closesAt && (
                          <span className="num text-muted/70">
                            {" · closes in "}
                            {formatCountdown(sessionInfo.state.closesAt - nowMs)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted">
                        {sessionInfo.state.def.name} opens in{" "}
                        <span className="num">
                          {formatCountdown(
                            (sessionInfo.state.opensAt as number) - nowMs
                          )}
                        </span>
                      </span>
                    )}
                  </div>
                )}

                {/* Tagged news */}
                {assetNews.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {assetNews.map((item, i) => (
                      <li key={i}>
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-muted underline-offset-2 hover:text-text hover:underline"
                        >
                          {item.title}
                        </a>
                        <span className="ml-1.5 text-[10px] text-muted/50">
                          {timeAgo(item.ts, nowMs)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Next high-impact events */}
      {upcomingEvents.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <IconCalendar size={13} className="text-muted" />
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
              Next high-impact events
            </h2>
          </div>
          <div className="divide-y divide-border">
            {upcomingEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className="h-2 w-2 shrink-0 rotate-45 rounded-[2px]"
                  style={{ backgroundColor: "#ef5350" }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 text-xs text-text">{e.title}</span>
                <span className="num shrink-0 text-[11px] text-muted">
                  {formatEventTime(e.ts, useUTC)}
                </span>
                <span className="num shrink-0 text-xs font-medium text-accent">
                  {eventCountdown(e.ts, nowMs)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All-market news that isn't watchlist-specific */}
      {news.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <IconTrendingUp size={13} className="text-muted" />
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
              Top headlines
            </h2>
          </div>
          <div className="divide-y divide-border">
            {news.slice(0, 6).map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-3 px-4 py-2.5 text-xs text-text transition-colors hover:bg-surface2"
              >
                <span className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase"
                  style={{
                    backgroundColor:
                      item.market === "crypto"
                        ? "#00D4AA22"
                        : item.market === "forex"
                        ? "#4FA8E822"
                        : "#E8B44F22",
                    color:
                      item.market === "crypto"
                        ? "#00D4AA"
                        : item.market === "forex"
                        ? "#4FA8E8"
                        : "#E8B44F",
                  }}
                >
                  {item.market}
                </span>
                <span className="min-w-0 flex-1 leading-relaxed">{item.title}</span>
                <span className="num shrink-0 text-muted/60">
                  {timeAgo(item.ts, nowMs)}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
