"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_ASSETS,
  ASSET_BY_ID,
  resolveAsset,
  SUGGESTED_STARS,
  type AssetDef,
  type CustomAsset,
  type Market,
} from "@/lib/assets";
import type { CalendarPayload } from "@/app/api/calendar/route";
import type { DerivsPayload } from "@/app/api/derivs/route";
import type { PulsePayload } from "@/app/api/pulse/route";
import { timeAgo } from "@/lib/format";
import { useAwayDiff, useBinanceLive, useNow, usePolling, useServiceWorker } from "@/lib/hooks";
import {
  cancelAllNotifs,
  scheduleCalendarAlerts,
  scheduleSessionAlerts,
  syncPushSubscription,
} from "@/lib/notifications";
import { useOpenChart } from "@/lib/nav";
import { resolvePanelLayout, type PanelId } from "@/lib/presets";
import { getAllSessionStates, type SessionId } from "@/lib/sessions";
import { useStore } from "@/lib/store";
import AiInsights from "./AiInsights";
import AppShell from "./AppShell";
import DailyBriefing from "./DailyBriefing";
import DashboardSkeleton from "./DashboardSkeleton";
import DerivsPanel from "./DerivsPanel";
import Hero from "./Hero";
import PresetPicker from "./PresetPicker";

// ChartPanel embeds a TradingView iframe and sits below the fold; DigestView is
// a separate full-screen mode most sessions never enter. Both load on demand.
// ChartPanel keeps a height-matched placeholder so deferring it adds no CLS.
const ChartPanel = dynamic(() => import("./ChartPanel"), {
  loading: () => (
    <div className="rounded-2xl border border-border bg-surface lg:h-[604px]" />
  ),
});
const DigestView = dynamic(() => import("./DigestView"), { ssr: false });
import Movers from "./Movers";
import NewsFeed, { type NewsItem } from "./NewsFeed";
import PriceRow from "./PriceRow";
import PulseStrip from "./PulseStrip";
import SessionClock from "./SessionClock";
import Ticker from "./Ticker";
import WelcomeBack from "./WelcomeBack";

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

  // Register service worker (PWA + notification delivery)
  useServiceWorker();

  const now = useNow(1000);
  const states = useMemo(() => getAllSessionStates(now), [now]);

  const crypto = usePolling<ApiPayload>("/api/crypto", 30_000);
  const forex = usePolling<ApiPayload>("/api/forex", 300_000);
  const stocks = usePolling<ApiPayload>("/api/stocks", 60_000);
  const news = usePolling<NewsPayload>("/api/news", 300_000);
  const pulse = usePolling<PulsePayload>("/api/pulse", 600_000);
  const derivs = usePolling<DerivsPayload>("/api/derivs", 300_000);
  const calendar = usePolling<CalendarPayload>("/api/calendar", 1_800_000);
  const live = useBinanceLive();
  const openChart = useOpenChart();

  const {
    watchlist,
    customAssets,
    toggleWatch,
    marketFilter,
    setMarketFilter,
    sessionFilter,
    setSessionFilter,
    selectedAsset,
    heroDismissed,
    dismissHero,
    presetChosen,
    panelPrefs,
    useUTC,
    digestMode,
    setDigestMode,
    notifPrefs,
    openPalette,
  } = useStore();

  // Re-schedule alerts whenever calendar data or prefs change
  const calEvents = calendar.data?.events ?? [];
  useEffect(() => {
    if (!notifPrefs.enabled) return;
    cancelAllNotifs();
    scheduleSessionAlerts(states, notifPrefs);
    scheduleCalendarAlerts(calEvents, notifPrefs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifPrefs, calEvents.length, states]);

  // Keep the server-side push subscription's prefs + watchlist current when
  // they change outside the settings panel (e.g. starring an asset). No-op if
  // the user hasn't subscribed or push isn't configured.
  useEffect(() => {
    if (!notifPrefs.enabled) return;
    void syncPushSubscription({
      sessionAlerts: notifPrefs.sessionAlerts,
      calendarAlerts: notifPrefs.calendarAlerts,
      watchlistAlerts: notifPrefs.watchlistAlerts,
      leadMinutes: notifPrefs.leadMinutes,
      watchlist,
    });
  }, [notifPrefs, watchlist]);

  // Custom (non-curated) watchlist assets and their on-demand quote feed.
  const customWatched = useMemo(
    () =>
      watchlist
        .map((id) => customAssets[id])
        .filter((a): a is CustomAsset => Boolean(a)),
    [watchlist, customAssets],
  );
  const customQuoteUrl = useMemo(() => {
    if (!customWatched.length) return null;
    const cr = customWatched.filter((a) => a.market === "crypto").map((a) => a.quoteSymbol);
    const st = customWatched.filter((a) => a.market === "stocks").map((a) => a.quoteSymbol);
    const qs = new URLSearchParams();
    if (cr.length) qs.set("crypto", cr.join(","));
    if (st.length) qs.set("stocks", st.join(","));
    return `/api/quote?${qs.toString()}`;
  }, [customWatched]);

  const [customQuotes, setCustomQuotes] = useState<Record<string, Quote>>({});
  useEffect(() => {
    if (!customQuoteUrl) {
      setCustomQuotes({});
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const res = await fetch(customQuoteUrl);
        if (!res.ok) return;
        const json = (await res.json()) as {
          quotes?: Record<string, Quote>;
        };
        if (!cancelled && json.quotes) setCustomQuotes(json.quotes);
      } catch {
        // keep last good custom quotes; next tick retries
      }
    };
    void tick();
    const t = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [customQuoteUrl]);

  // id -> quote, with live WS ticks layered over REST for crypto, plus the
  // on-demand quotes for any custom assets the user tracks.
  const quoteOf = useMemo(() => {
    const map: Record<string, Quote> = {};
    for (const q of forex.data?.quotes ?? []) map[`forex:${q.symbol}`] = q;
    for (const q of crypto.data?.quotes ?? []) map[`crypto:${q.symbol}`] = q;
    for (const q of stocks.data?.quotes ?? []) map[`stocks:${q.symbol}`] = q;
    for (const [sym, tick] of Object.entries(live)) {
      map[`crypto:${sym}`] = { symbol: sym, price: tick.price, changePct: tick.changePct };
    }
    for (const [id, q] of Object.entries(customQuotes)) map[id] = q;
    return map;
  }, [forex.data, crypto.data, stocks.data, live, customQuotes]);

  // Auto-sync the session filter to whichever session is currently open
  // (e.g. Tokyo open → Tokyo pairs). During overlaps we pick the most recently
  // opened session (SESSIONS is chronological, so the last open one wins).
  // Once the user picks/clears a session manually we stop following.
  const sessionTouched = useRef(false);
  const primaryOpenSession = useMemo<SessionId | null>(() => {
    const open = states.filter((s) => s.isOpen);
    return open.length ? open[open.length - 1].def.id : null;
  }, [states]);

  useEffect(() => {
    if (sessionTouched.current) return;
    if (primaryOpenSession !== sessionFilter) setSessionFilter(primaryOpenSession);
  }, [primaryOpenSession, sessionFilter, setSessionFilter]);

  const handleSessionSelect = useCallback(
    (s: SessionId | null) => {
      sessionTouched.current = true;
      setSessionFilter(s);
    },
    [setSessionFilter]
  );

  // AI insights now sit below the session clock — well above the chart — so a
  // tap must bring the chart into view on every screen size (openChart only
  // auto-scrolls on mobile). rAF lets the asset switch paint before we scroll.
  const openChartAndScroll = useCallback(
    (id: string) => {
      openChart(id);
      if (typeof document !== "undefined") {
        requestAnimationFrame(() =>
          document
            .getElementById("chart")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        );
      }
    },
    [openChart]
  );

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
    .map((id) => resolveAsset(id, customAssets))
    .filter((a): a is AssetDef => Boolean(a));

  const { diff: awayDiff, dismiss: dismissAway } = useAwayDiff(quoteOf, watchlist);

  if (!mounted) {
    return (
      <AppShell>
        <DashboardSkeleton />
      </AppShell>
    );
  }

  const sectionMeta: Record<Market, { state: typeof crypto; note?: string }> = {
    forex: { state: forex, note: "ECB daily reference" },
    crypto: { state: crypto },
    stocks: { state: stocks },
  };

  const selQuote = quoteOf[selectedAsset];

  // Digest (morning) mode — focused view when the user has a watchlist
  if (digestMode) {
    return (
      <AppShell ticker={<Ticker quoteOf={quoteOf} onSelect={openChart} />}>
        <DigestView
          watchlist={watchlist}
          customAssets={customAssets}
          quoteOf={quoteOf}
          news={news.data?.items ?? []}
          states={states}
          calendar={calendar.data}
          now={now}
          useUTC={useUTC}
          onSelectAsset={openChart}
          onExit={() => setDigestMode(false)}
        />
      </AppShell>
    );
  }

  return (
    <AppShell ticker={<Ticker quoteOf={quoteOf} onSelect={openChart} />}>
      {/* First run: persona picker once, then the intro story (if not dismissed) */}
      {!presetChosen ? (
        <PresetPicker />
      ) : (
        !heroDismissed && <Hero onDismiss={dismissHero} />
      )}

      {/* Return visit: what moved while you were away */}
      {awayDiff && (
        <WelcomeBack
          diff={awayDiff}
          customAssets={customAssets}
          onDismiss={dismissAway}
          onSelect={openChart}
        />
      )}

      {/* Daily briefing: first visit of the local day, collapses after read */}
      <DailyBriefing
        now={now}
        states={states}
        pulse={pulse.data}
        quoteOf={quoteOf}
        derivs={derivs.data}
        calendar={calendar.data}
        news={news.data?.items ?? []}
        onSelectAsset={openChart}
      />

      {/* Market pulse: sentiment + macro strip (full read on /markets) */}
      <PulseStrip data={pulse.data} />

      {/* Session clock — with economic calendar markers + countdowns */}
      <div className="mt-4">
        <SessionClock
          now={now}
          states={states}
          useUTC={useUTC}
          selected={sessionFilter}
          onSelect={handleSessionSelect}
          calendar={calendar.data}
          calendarLoading={calendar.data === null && !calendar.error}
        />
      </div>

      {/* AI insights: actionable recommendations from live market context.
          Self-hides when no LLM key is configured. Taps scroll to the chart. */}
      <AiInsights onSelectAsset={openChartAndScroll} />

      {/* Movers + derivatives pulse — order/visibility follow the active preset
          (e.g. Crypto 24/7 surfaces derivs first; London FX hides them). */}
      {resolvePanelLayout(["movers", "derivs"] as PanelId[], panelPrefs).map(
        (panel) =>
          panel === "movers" ? (
            <Movers key="movers" quoteOf={quoteOf} onSelect={openChart} />
          ) : (
            <DerivsPanel key="derivs" data={derivs.data} onSelect={openChart} />
          ),
      )}

      {/* Main 3-column shell: markets | chart | news */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* LEFT — watchlist + one scrollable markets card. On lg+ the column is
            pinned to the chart card's height and the markets list flex-fills
            the remainder, so it never extends past the chart. */}
        <div className="flex flex-col gap-5 lg:col-span-4 lg:h-[604px] xl:col-span-3">
          {/* Watchlist — a lane here; the full destination lives at /watchlist */}
          <section className="shrink-0 rounded-2xl border border-border bg-surface p-2">
            <div className="flex items-baseline justify-between px-3 pb-1 pt-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
                Watchlist
              </h2>
              {watched.length > 0 && (
                <Link
                  href="/watchlist"
                  className="text-[11px] text-accent transition-colors hover:underline"
                >
                  View all →
                </Link>
              )}
            </div>
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
                  <div
                    key={a.id}
                    onClick={() => openChart(customAssets[a.id]?.chartId ?? a.id)}
                    className="cursor-pointer"
                  >
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

          {/* Markets — single card, scrollable; fills leftover column height on lg+ */}
          <section className="rounded-2xl border border-border bg-surface lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <div className="shrink-0 border-b border-border p-3">
              <div className="flex items-start gap-2">
                <nav
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                  aria-label="Market filter"
                >
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
                      onClick={() => handleSessionSelect(null)}
                      className="min-h-[32px] max-w-full truncate rounded-full border border-accent/50 bg-accent/10 px-3.5 py-1 text-xs text-accent"
                    >
                      {states.find((s) => s.def.id === sessionFilter)?.def.name} ✕
                    </button>
                  )}
                </nav>

                {/* Filters above only cover the curated list — this opens the
                    global ⌘K palette to search every listed stock and coin. */}
                <button
                  onClick={openPalette}
                  title="Search all markets (⌘K)"
                  aria-label="Search all markets"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface2 text-muted transition-colors hover:text-text"
                >
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="max-h-[560px] overflow-y-auto p-2 lg:max-h-none lg:min-h-0 lg:flex-1">
              {visible.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted">
                  No markets match this filter.
                </div>
              )}
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
