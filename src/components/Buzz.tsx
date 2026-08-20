"use client";

import { useState } from "react";
import { useNow, usePolling } from "@/lib/hooks";
import { formatCalendarDate, formatChangePct } from "@/lib/format";
import type { BuzzCoin, BuzzIpo } from "@/app/api/buzz/route";
import type { CalendarEvent, CalendarPayload } from "@/app/api/calendar/route";
import {
  IMPACT_COLOR,
  eventCountdown,
  explainEvent,
  forecastLine,
  formatEventDay,
  formatEventTime,
  nextHighImpact,
} from "@/lib/calendar";
import { formatCountdown } from "@/lib/sessions";
import { IconBell, IconCalendar, IconFlame, IconTrendingUp } from "./Icons";

interface BuzzPayload {
  coins: BuzzCoin[];
  stocks: string[];
  ipos: BuzzIpo[];
  iposNeedKey: boolean;
}

interface Props {
  /** open a chart for a custom TradingView symbol: "custom|TV:SYMBOL|Label" */
  onSelect: (id: string) => void;
}

function Panel({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="module flex flex-col p-4">
      <div className="flex items-baseline gap-3">
        <h3 className="module-title">{title}</h3>
        <span className="ml-auto text-[11px] text-dim">{sub}</span>
      </div>
      <div className="mt-3 min-h-0 flex-1">{children}</div>
    </div>
  );
}

function Skeletons({ n = 5 }: { n?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton h-7" />
      ))}
    </div>
  );
}

export function TrendingCoinsPanel({ onSelect }: Props) {
  const { data } = usePolling<BuzzPayload>("/api/buzz", 600_000);
  return (
    <Panel title="Trending coins" sub="most searched · CoinGecko">
      {!data ? (
        <Skeletons />
      ) : data.coins.length === 0 ? (
        <p className="text-xs text-muted">Trend data unreachable — retries automatically.</p>
      ) : (
        <ul className="space-y-1">
          {data.coins.map((c, i) => {
            const up = (c.pct24h ?? 0) >= 0;
            return (
              <li key={c.symbol + i}>
                <button
                  onClick={() => onSelect(`custom|CRYPTO:${c.symbol}USD|${c.name} (${c.symbol})`)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface2"
                  title={`View ${c.name} chart`}
                >
                  <span className="num w-5 shrink-0 text-center text-[11px] text-dim">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium">{c.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">{c.name}</span>
                  {c.rank !== null && (
                    <span className="num hidden rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-muted sm:inline">
                      #{c.rank}
                    </span>
                  )}
                  <span
                    className={`num text-xs ${c.pct24h === null ? "text-muted" : up ? "text-bull" : "text-bear"}`}
                  >
                    {c.pct24h !== null && (up ? "▲ " : "▼ ")}
                    {formatChangePct(c.pct24h)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function HotStocksPanel({ onSelect }: Props) {
  const { data } = usePolling<BuzzPayload>("/api/buzz", 600_000);
  return (
    <Panel title="Hot stocks" sub="most searched · Yahoo">
      {!data ? (
        <Skeletons />
      ) : data.stocks.length === 0 ? (
        <p className="text-xs text-muted">
          Trend feed unreachable right now — the Movers strip on the dashboard still shows the
          biggest actual movers.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {data.stocks.map((s) => (
            <button
              key={s}
              onClick={() => onSelect(`custom|${s}|${s}`)}
              className="rounded-full bg-surface2 px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent/50 hover:text-accent"
              title={`View ${s} chart`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

/**
 * Scheduled event risk — the next high-impact economic releases, with the
 * same tap-to-learn explainers as the dashboard clock. Attention tells you
 * *where* volatility may show up; the calendar tells you *when*.
 */
export function EventRiskPanel() {
  const { data } = usePolling<CalendarPayload>("/api/calendar", 1_800_000);
  const [openId, setOpenId] = useState<string | null>(null);
  const now = useNow(30_000).getTime(); // countdowns refresh every 30s

  const upcoming: CalendarEvent[] = data?.events
    ? nextHighImpact(data.events, now, 6)
    : [];
  const anchorsFallback = !data?.events
    ? (data?.anchors ?? []).filter((a) => a.ts > now).sort((a, b) => a.ts - b.ts)
    : [];

  return (
    <Panel title="Event risk"
      sub="high impact · ForexFactory"
    >
      {!data ? (
        <Skeletons />
      ) : upcoming.length === 0 && anchorsFallback.length === 0 ? (
        <p className="text-xs text-muted">
          No high-impact releases on the radar — calm waters (scheduled ones,
          anyway).
        </p>
      ) : upcoming.length > 0 ? (
        <ul className="space-y-1">
          {upcoming.map((e) => {
            const isOpen = openId === e.id;
            const ex = isOpen ? explainEvent(e) : null;
            const fc = isOpen ? forecastLine(e) : null;
            return (
              <li key={e.id}>
                <button
                  onClick={() => setOpenId(isOpen ? null : e.id)}
                  aria-expanded={isOpen}
                  title="What is this release?"
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    isOpen ? "bg-surface2" : "hover:bg-surface2"
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rotate-45 rounded-[2px]"
                    style={{ backgroundColor: IMPACT_COLOR[e.impact] }}
                  />
                  <span className="w-9 shrink-0 text-xs font-medium text-muted">
                    {e.country}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                  <span className="num hidden text-[10px] text-dim sm:inline">
                    {formatEventDay(e.ts, now)} {formatEventTime(e.ts, false)}
                  </span>
                  <span className="num shrink-0 text-xs text-accent">
                    {eventCountdown(e.ts, now)}
                  </span>
                </button>
                {isOpen && ex && (
                  <div className="mx-2 mb-1 rounded-lg border border-accent/25 bg-surface2/60 p-2.5 text-xs leading-relaxed">
                    <p className="text-text/90">
                      <span className="font-medium text-muted">What it is — </span>
                      {ex.what}
                    </p>
                    <p className="mt-1 text-text/90">
                      <span className="font-medium text-muted">Why it matters — </span>
                      {ex.why}
                    </p>
                    {fc && <p className="num mt-1 text-muted">{fc}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="space-y-1">
          {anchorsFallback.map((a) => (
            <li
              key={a.kind}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rotate-45 rounded-[2px]"
                style={{ backgroundColor: IMPACT_COLOR.High }}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{a.title}</span>
              <span className="num shrink-0 text-xs text-accent">
                in {formatCountdown(a.ts - now)}
              </span>
            </li>
          ))}
          <li className="px-2 pt-1 text-[10px] text-dim">
            Live feed unreachable — showing the official published schedule.
          </li>
        </ul>
      )}
    </Panel>
  );
}

export function IpoPanel() {
  const { data } = usePolling<BuzzPayload>("/api/buzz", 600_000);
  return (
    <Panel title="Upcoming IPOs" sub="next 45 days · Finnhub">
      {!data ? (
        <Skeletons />
      ) : data.iposNeedKey ? (
        <p className="text-xs text-muted">
          Add your free <code className="num">FINNHUB_API_KEY</code> to unlock the IPO calendar
          (same key as stocks).
        </p>
      ) : data.ipos.length === 0 ? (
        <p className="text-xs text-muted">No IPOs scheduled in the next 45 days.</p>
      ) : (
        <ul className="space-y-1">
          {data.ipos.map((ipo, i) => (
            <li key={ipo.symbol + i} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <span className="num shrink-0 rounded-md bg-surface2 px-1.5 py-0.5 text-[10px] text-accent">
                {formatCalendarDate(ipo.date)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">{ipo.name}</span>
              <span className="num hidden text-[10px] text-dim sm:inline">{ipo.exchange}</span>
              <span className="num text-[11px] text-muted">{ipo.price}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
