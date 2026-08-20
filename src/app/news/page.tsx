"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CalendarPayload } from "@/app/api/calendar/route";
import { ASSET_BY_ID } from "@/lib/assets";
import { eventCountdown, IMPACT_COLOR, nextHighImpact } from "@/lib/calendar";
import { timeAgo } from "@/lib/format";
import { useNow, usePolling } from "@/lib/hooks";
import { useOpenChart } from "@/lib/nav";
import {
  BUCKET_LABEL,
  BUCKET_ORDER,
  dayBucket,
  MARKET_COLOR,
  NEWS_SOURCES,
  WEIGHT_META,
  type DayBucket,
} from "@/lib/news";
import AppShell from "@/components/AppShell";
import { NewsItemSkeleton } from "@/components/DashboardSkeleton";
import Explain from "@/components/Explain";
import NewsFilters, {
  EMPTY_FILTERS,
  type NewsFilterState,
} from "@/components/NewsFilters";
import { IconArrowUpRight } from "@/components/Icons";
import type { NewsItem } from "@/components/NewsFeed";

interface NewsPayload {
  items: NewsItem[];
  trending: Array<{ id: string; count: number }>;
  error?: string;
}

// --- URL <-> filter state --------------------------------------------------
function parseFilters(sp: URLSearchParams): NewsFilterState {
  const m = sp.get("market");
  return {
    market: m === "forex" || m === "crypto" || m === "stocks" ? m : "all",
    assets: sp.getAll("asset"),
    sources: sp.getAll("source"),
    q: sp.get("q") ?? "",
    sort: sp.get("sort") === "new" ? "new" : "top",
    highOnly: sp.get("impact") === "high",
  };
}

function buildQuery(f: NewsFilterState): string {
  const p = new URLSearchParams();
  if (f.market !== "all") p.set("market", f.market);
  for (const a of f.assets) p.append("asset", a);
  for (const s of f.sources) p.append("source", s);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.sort !== "top") p.set("sort", f.sort);
  if (f.highOnly) p.set("impact", "high");
  return p.toString();
}

function NewsPageInner() {
  const now = useNow(30_000);
  const nowMs = now.getTime();
  const openChart = useOpenChart();
  const news = usePolling<NewsPayload>("/api/news", 300_000);
  const calendar = usePolling<CalendarPayload>("/api/calendar", 1_800_000);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [filters, setFilters] = useState<NewsFilterState>(() =>
    parseFilters(new URLSearchParams(searchParams.toString()))
  );

  // Reflect filter state into the URL (shareable / bookmarkable views).
  useEffect(() => {
    const qs = buildQuery(filters);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, pathname, router]);

  const patch = (p: Partial<NewsFilterState>) => setFilters((f) => ({ ...f, ...p }));
  const clear = () => setFilters(EMPTY_FILTERS);
  const toggleAsset = (id: string) => {
    setFilters((f) =>
      f.assets.includes(id)
        ? { ...f, assets: f.assets.filter((x) => x !== id) }
        : { ...f, assets: [...f.assets, id] }
    );
    // Scroll up only when narrowing the wire (adding), not when clearing.
    if (typeof window !== "undefined" && !filters.assets.includes(id))
      window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const all = useMemo(() => news.data?.items ?? [], [news.data]);
  const trending = news.data?.trending ?? [];
  const maxTrend = trending[0]?.count ?? 1;

  // Global coverage map (how often each asset appears) → ranks row tags.
  const coverage = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of all) for (const id of it.assets) c[id] = (c[id] ?? 0) + 1;
    return c;
  }, [all]);

  // Filter
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return all.filter((it) => {
      if (filters.market !== "all" && it.market !== filters.market) return false;
      if (filters.assets.length && !it.assets.some((id) => filters.assets.includes(id)))
        return false;
      if (filters.sources.length && !filters.sources.includes(it.source)) return false;
      if (filters.highOnly && it.weight !== "high") return false;
      if (q && !`${it.title} ${it.summary ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, filters]);

  // Group into time buckets; sort within each by the chosen order.
  const groups = useMemo(() => {
    const byBucket: Record<DayBucket, NewsItem[]> = { new: [], today: [], earlier: [] };
    for (const it of filtered) byBucket[dayBucket(it.ts, nowMs)].push(it);
    const sortFn = (a: NewsItem, b: NewsItem) =>
      filters.sort === "new"
        ? b.ts - a.ts
        : (b.relevance ?? 0) - (a.relevance ?? 0) || b.ts - a.ts;
    return BUCKET_ORDER.map((bucket) => ({
      bucket,
      items: [...byBucket[bucket]].sort(sortFn),
    })).filter((g) => g.items.length > 0);
  }, [filtered, filters.sort, nowMs]);

  const loading = news.data === null;
  const upcoming = calendar.data?.events
    ? nextHighImpact(calendar.data.events, nowMs, 3)
    : [];

  // The filter bar sticks below the global app header. Bucket dividers stay in
  // normal document flow so they never float over a headline while scrolling.
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(56);
  useEffect(() => {
    const filterEl = filterBarRef.current;
    if (!filterEl) return;
    const measure = () => {
      const appHeader = document.querySelector("header.sticky") as HTMLElement | null;
      const hh = appHeader?.offsetHeight ?? 56;
      setHeaderH(hh);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(filterEl);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [loading]);

  return (
    <AppShell>
      <div>
        <header className="mt-2">
          <h1 className="font-display text-[28px] font-semibold tracking-tight">Newswire</h1>
          <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-muted">
            Seven free wires, one stream — every story tagged to the assets it affects and
            weighted by likely impact. Tap an asset to chart it.
          </p>
        </header>

        {/* Sticky filter bar — pinned just below the global app header */}
        <div
          ref={filterBarRef}
          style={{ top: headerH }}
          className="sticky z-10 -mx-1 mt-4 rounded-xl border border-white/[0.055] bg-bg/85 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-bg/70"
        >
          <NewsFilters
            filters={filters}
            onChange={patch}
            onClear={clear}
            resultCount={filtered.length}
          />
        </div>

        {/* Mobile "markets on the wire" strip */}
        {loading && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 xl:hidden">
            {[64, 56, 72, 52, 60].map((w, i) => (
              <div
                key={i}
                className="skeleton h-[30px] shrink-0 rounded-full"
                style={{ width: `${w}px` }}
              />
            ))}
          </div>
        )}
        {!loading && trending.length > 0 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 xl:hidden">
            {trending.map(({ id, count }) => {
              const a = ASSET_BY_ID[id];
              if (!a) return null;
              const active = filters.assets.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleAsset(id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-border bg-surface text-muted hover:text-text"
                  }`}
                >
                  {a.symbol}
                  <span className="num text-[10px] text-dim">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 grid gap-5 lg:grid-cols-12">
          {/* The wire */}
          <div className="lg:col-span-9">
            <section className="module p-2">
              {loading && (
                <div className="p-1">
                  {[
                    { rows: 3, w: "w-24" },
                    { rows: 6, w: "w-16" },
                  ].map((g, gi) => (
                    <div key={gi}>
                      {/* day-group header placeholder */}
                      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
                        <div className={`skeleton h-2.5 rounded ${g.w}`} />
                        <div className="skeleton h-2.5 w-4 rounded" />
                      </div>
                      {Array.from({ length: g.rows }).map((_, i) => (
                        <NewsItemSkeleton
                          key={i}
                          titleWidth={["w-2/3", "w-5/6", "w-1/2", "w-3/4"][i % 4]}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {news.error && all.length === 0 && (
                <p className="p-4 text-sm text-muted">
                  Newswire unreachable right now — it retries automatically.
                </p>
              )}

              {!loading && all.length > 0 && filtered.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted">No stories match these filters.</p>
                  <button
                    onClick={clear}
                    className="mt-2 text-[12.5px] text-muted underline decoration-muted/40 underline-offset-4 transition-colors hover:text-text"
                  >
                    Clear filters
                  </button>
                </div>
              )}

              {groups.map((g) => (
                <div key={g.bucket} className="relative">
                  <div
                    className="mb-1 flex min-h-10 items-center gap-2 border-b border-white/[0.055] bg-surface px-3 py-2"
                  >
                    <h2 className="section-label truncate">{BUCKET_LABEL[g.bucket]}</h2>
                    <span className="num shrink-0 text-[10px] text-dim">{g.items.length}</span>
                  </div>

                  {g.items.map((it, i) => {
                    const weight = it.weight ?? "low";
                    const ranked = [...it.assets].sort(
                      (a, b) => (coverage[b] ?? 0) - (coverage[a] ?? 0)
                    );
                    return (
                      <article
                        key={`${it.link}-${i}`}
                        className="relative z-0 rounded-xl px-3 py-3 transition-colors hover:bg-surface2"
                      >
                        <a href={it.link} target="_blank" rel="noreferrer" className="block">
                          <h3 className="text-[13.5px] leading-snug text-text">{it.title}</h3>
                        </a>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: MARKET_COLOR[it.market] }}
                          />
                          {weight === "high" && (
                            <span
                              className="rounded px-1.5 text-[10px] font-medium"
                              style={{
                                color: WEIGHT_META.high.color,
                                backgroundColor:
                                  "color-mix(in srgb, var(--accent, #00D4AA) 14%, transparent)",
                              }}
                            >
                              High impact
                            </span>
                          )}
                          <span>{it.source}</span>
                          <span className="num">{timeAgo(it.ts, nowMs)}</span>

                          {ranked.slice(0, 3).map((id) => {
                            const a = ASSET_BY_ID[id];
                            if (!a) return null;
                            const active = filters.assets.includes(id);
                            const cov = coverage[id] ?? 0;
                            return (
                              <span
                                key={id}
                                className={`inline-flex items-center overflow-hidden rounded-full border ${
                                  active
                                    ? "border-accent/60 bg-accent/10"
                                    : "border-border bg-surface2"
                                }`}
                              >
                                <button
                                  onClick={() => toggleAsset(id)}
                                  title={`Filter the wire to ${a.symbol}`}
                                  className={`py-0.5 pl-2 pr-1 text-[10px] transition-colors ${
                                    active ? "text-accent" : "text-muted hover:text-text"
                                  }`}
                                >
                                  {a.symbol}
                                  {cov > 1 && (
                                    <span className="num ml-1 text-dim">{cov}</span>
                                  )}
                                </button>
                                <button
                                  onClick={() => openChart(id)}
                                  title={`Chart ${a.symbol}`}
                                  className="border-l border-white/[0.06] py-0.5 pl-1 pr-1.5 text-[10px] text-dim transition-colors hover:text-text"
                                >
                                  <IconArrowUpRight size={11} />
                                </button>
                              </span>
                            );
                          })}
                          {ranked.length > 3 && (
                            <span className="rounded-full px-1.5 py-0.5 text-[10px] text-dim">
                              +{ranked.length - 3}
                            </span>
                          )}

                          <Explain
                            className="w-full"
                            target={{
                              kind: "headline",
                              title: it.title,
                              source: it.source,
                              market: it.market,
                              assets: ranked.slice(0, 3),
                            }}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              ))}
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-5 lg:col-span-3">
            <section className="module hidden p-4 xl:block">
              <h2 className="module-title">Markets on the wire</h2>
              <p className="mt-0.5 text-[11px] text-dim">
                most-covered assets right now — tap to filter the stream
              </p>
              <div className="mt-3">
                {loading ? (
                  <ul className="space-y-1.5">
                    {[80, 55, 70, 45, 60, 40].map((bar, i) => (
                      <li key={i} className="flex items-center gap-2 px-2 py-1.5">
                        <div className="skeleton h-3.5 w-12 rounded" />
                        <span className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface2">
                          <span
                            className="skeleton absolute inset-y-0 left-0 rounded-full"
                            style={{ width: `${bar}%` }}
                          />
                        </span>
                        <div className="skeleton h-3 w-4 rounded" />
                      </li>
                    ))}
                  </ul>
                ) : trending.length === 0 ? (
                  <p className="text-xs text-muted">No strong clusters right now.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {trending.map(({ id, count }) => {
                      const a = ASSET_BY_ID[id];
                      if (!a) return null;
                      const active = filters.assets.includes(id);
                      return (
                        <li key={id} className="flex items-center gap-1">
                          <button
                            onClick={() => toggleAsset(id)}
                            className={`group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                              active ? "bg-accent/10" : "hover:bg-surface2"
                            }`}
                          >
                            <span
                              className={`text-sm font-medium ${active ? "text-accent" : ""}`}
                            >
                              {a.symbol}
                            </span>
                            <span className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface2">
                              <span
                                className="absolute inset-y-0 left-0 rounded-full bg-accent/50"
                                style={{ width: `${Math.round((count / maxTrend) * 100)}%` }}
                              />
                            </span>
                            <span className="num text-[10px] text-muted">{count}</span>
                          </button>
                          <button
                            onClick={() => openChart(id)}
                            title={`Chart ${a.symbol}`}
                            className="shrink-0 rounded-md p-1 text-dim transition-colors hover:text-text"
                          >
                            <IconArrowUpRight size={13} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Phase 4 — upcoming high-impact events */}
            {upcoming.length > 0 && (
              <section className="module p-4">
                <h2 className="module-title">Coming up</h2>
                <p className="mt-1.5 text-[11px] text-dim">next high-impact economic releases</p>
                <ul className="mt-3 space-y-2">
                  {upcoming.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-xs">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 shrink-0 rotate-45 rounded-[2px]"
                        style={{ backgroundColor: IMPACT_COLOR[e.impact] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-text">
                        {e.title}
                        <span className="ml-1 text-dim">{e.country}</span>
                      </span>
                      <span className="num shrink-0 text-accent">
                        {eventCountdown(e.ts, nowMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="module p-4">
              <h2 className="module-title">Sources</h2>
              <p className="mt-0.5 text-[11px] text-dim">
                free public wires, refreshed every 10 minutes — tap to filter
              </p>
              <ul className="mt-3 space-y-1">
                {NEWS_SOURCES.map((s) => {
                  const on = filters.sources.includes(s.name);
                  return (
                    <li key={s.name}>
                      <button
                        onClick={() =>
                          patch({
                            sources: on
                              ? filters.sources.filter((x) => x !== s.name)
                              : [...filters.sources, s.name],
                          })
                        }
                        className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs transition-colors hover:bg-surface2 ${
                          on ? "text-accent" : ""
                        }`}
                      >
                        <span>{s.name}</span>
                        <span className="text-dim">{s.market}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="module p-4 text-xs leading-relaxed text-dim">
              <span className="font-medium text-text">How tagging &amp; impact work.</span> Each
              headline is scanned for asset names, tickers and central-bank keywords, then tagged
              to the markets it touches and scored for likely impact (macro keywords, breadth and
              cross-source coverage). Both are heuristic — read the story before acting on it.
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function NewsPage() {
  return (
    <Suspense fallback={null}>
      <NewsPageInner />
    </Suspense>
  );
}
