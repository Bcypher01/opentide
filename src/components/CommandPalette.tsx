"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_ASSETS, type CustomAsset } from "@/lib/assets";
import {
  rank,
  searchAssets,
  searchCalendar,
  searchCryptoUniverse,
  searchNews,
  searchPresets,
  searchStockUniverse,
  type CalendarLike,
  type CryptoHit,
  type NewsLike,
  type SearchResult,
  type StockHit,
} from "@/lib/search";
import { useStore } from "@/lib/store";
import { IconCalendar, IconCandles, IconNews, IconStar, IconZap } from "./Icons";

// --- Session-level caches (survive palette open/close, reset on reload) -----
const NEWS_TTL = 5 * 60_000;
let newsCache: { items: NewsLike[]; ts: number } | null = null;
let calCache: { events: CalendarLike[]; ts: number } | null = null;
let cryptoUniverse: CryptoHit[] | null = null;
let cryptoUniversePromise: Promise<CryptoHit[]> | null = null;

async function loadCryptoUniverse(): Promise<CryptoHit[]> {
  if (cryptoUniverse) return cryptoUniverse;
  if (!cryptoUniversePromise) {
    cryptoUniversePromise = fetch("/api/search/crypto")
      .then((r) => r.json())
      .then((j) => {
        cryptoUniverse = Array.isArray(j.list) ? (j.list as CryptoHit[]) : [];
        return cryptoUniverse;
      })
      .catch(() => {
        cryptoUniversePromise = null; // allow a later retry
        return [];
      });
  }
  return cryptoUniversePromise;
}

interface Group {
  label: string;
  results: SearchResult[];
}

const KIND_META: Record<
  SearchResult["kind"],
  { badge: string; color: string }
> = {
  asset: { badge: "Asset", color: "#00d4aa" },
  symbol: { badge: "Market", color: "#4fa8e8" },
  news: { badge: "News", color: "#e8b44f" },
  calendar: { badge: "Event", color: "#7c6ff0" },
  preset: { badge: "Persona", color: "#00d4aa" },
};

export default function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const closePalette = useStore((s) => s.closePalette);
  const openModal = useStore((s) => s.openModal);
  const watchlist = useStore((s) => s.watchlist);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const addCustomAsset = useStore((s) => s.addCustomAsset);
  const applyPreset = useStore((s) => s.applyPreset);
  const router = useRouter();

  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  // Transient message when a track attempt is rejected (e.g. custom-stock cap).
  const [notice, setNotice] = useState<string | null>(null);
  const [news, setNews] = useState<NewsLike[]>(() => newsCache?.items ?? []);
  const [cal, setCal] = useState<CalendarLike[]>(() => calCache?.events ?? []);
  const [stockHits, setStockHits] = useState<StockHit[]>([]);
  const [crypto, setCrypto] = useState<CryptoHit[]>(() => cryptoUniverse ?? []);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [cryptoLoading, setCryptoLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // On open: focus, reset, and lazily refresh local + universe data.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    setStockHits([]);
    inputRef.current?.focus();

    const nowTs = Date.now();
    if (!newsCache || nowTs - newsCache.ts > NEWS_TTL) {
      fetch("/api/news")
        .then((r) => r.json())
        .then((j) => {
          const items = (j.items ?? []) as NewsLike[];
          newsCache = { items, ts: Date.now() };
          setNews(items);
        })
        .catch(() => {});
    }
    if (!calCache || nowTs - calCache.ts > NEWS_TTL) {
      fetch("/api/calendar")
        .then((r) => r.json())
        .then((j) => {
          const events = (j.events ?? []) as CalendarLike[];
          calCache = { events, ts: Date.now() };
          setCal(events);
        })
        .catch(() => {});
    }
    if (!cryptoUniverse) {
      setCryptoLoading(true);
      loadCryptoUniverse()
        .then(setCrypto)
        .finally(() => setCryptoLoading(false));
    }
  }, [open]);

  // Scroll-lock + pause background animation while open (mirrors AboutModal:
  // the marquee ticker repaints continuously under the overlay otherwise).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("overlay-open");
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("overlay-open");
    };
  }, [open]);

  // Remote stock tier: debounced + abortable. Crypto is filtered locally.
  useEffect(() => {
    const query = q.trim();
    if (!open || query.length < 2) {
      setStockHits([]);
      setRemoteLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setRemoteLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search/stocks?q=${encodeURIComponent(query)}`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((j) => setStockHits((j.results ?? []) as StockHit[]))
        .catch(() => {
          /* aborted or upstream down — leave prior hits */
        })
        .finally(() => setRemoteLoading(false));
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  // Build grouped results.
  const groups = useMemo<Group[]>(() => {
    const query = q.trim();
    if (!query) return [];
    const now = Date.now();
    const assets = rank(searchAssets(query, ALL_ASSETS), 6);
    const presetRes = rank(searchPresets(query), 4);
    const universe = rank(
      [
        ...searchStockUniverse(query, stockHits),
        ...searchCryptoUniverse(query, crypto),
      ],
      6
    );
    const newsRes = rank(searchNews(query, news, now), 5);
    const calRes = rank(searchCalendar(query, cal), 4);
    return [
      { label: "Assets", results: assets },
      { label: "Trader profiles", results: presetRes },
      { label: "Markets — full universe", results: universe },
      { label: "News", results: newsRes },
      { label: "Calendar", results: calRes },
    ].filter((g) => g.results.length > 0);
  }, [q, news, cal, stockHits, crypto]);

  // Flat list for keyboard navigation.
  const flat = useMemo(() => groups.flatMap((g) => g.results), [groups]);

  // Still fetching the full universe? Don't claim "no matches" until it's in.
  const loading = remoteLoading || cryptoLoading;

  // Keep active index in range as results change.
  useEffect(() => {
    setActive((a) => (flat.length === 0 ? 0 : Math.min(a, flat.length - 1)));
  }, [flat.length]);

  const close = useCallback(() => {
    setQ("");
    setNotice(null);
    closePalette();
  }, [closePalette]);

  // A new query supersedes any stale cap/track notice.
  useEffect(() => {
    setNotice(null);
  }, [q]);

  const run = useCallback(
    (r: SearchResult | undefined) => {
      if (!r) return;
      if (r.action === "preset" && r.presetId) {
        // Apply additively from the palette — lossless, so no Replace/Keep prompt
        // (that choice lives in the header switcher).
        applyPreset(r.presetId);
        close();
      } else if (r.action === "chart" && r.chartId) {
        openModal(r.chartId);
        close();
      } else if (r.action === "link" && r.href) {
        window.open(r.href, "_blank", "noopener,noreferrer");
        close();
      } else if (r.action === "calendar") {
        close();
        router.push("/#econ-calendar");
        setTimeout(() => {
          document
            .getElementById("econ-calendar")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 350);
      }
    },
    [openModal, close, router, applyPreset]
  );

  // Star/unstar a full-universe hit without leaving the palette. Enforces the
  // custom-stock cap via the store and surfaces the reason inline on a reject.
  const toggleTrack = useCallback(
    (track: CustomAsset) => {
      if (watchlist.includes(track.id)) {
        toggleWatch(track.id);
        setNotice(null);
        return;
      }
      const res = addCustomAsset(track);
      setNotice(res.ok ? null : (res.reason ?? "Couldn't track that asset."));
    },
    [watchlist, toggleWatch, addCustomAsset]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(flat[active]);
    }
  };

  // Keep the active row scrolled into view.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // Running index across groups, so highlight + click map to the flat list.
  let idx = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center p-3 pt-[12vh] sm:p-6 sm:pt-[14vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Search Opentide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <button
            aria-label="Close search"
            onClick={close}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            className="relative flex max-h-[72vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={onKeyDown}
          >
            {/* search input */}
            <div className="flex items-center gap-3 border-b border-border px-4">
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="shrink-0 text-muted"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                placeholder="Search assets, markets, news, calendar…"
                className="w-full bg-transparent py-3.5 text-[15px] text-text outline-none placeholder:text-muted"
                aria-label="Search query"
                autoComplete="off"
                spellCheck={false}
              />
              {loading && q.trim() !== "" && <Spinner />}
            </div>

            {/* results */}
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-2">
              {q.trim() === "" ? (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  Search the curated universe, every listed stock and coin, the
                  newswire and the economic calendar.
                </p>
              ) : flat.length === 0 ? (
                loading ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted">
                    <Spinner />
                    <span>Searching every listed ticker and coin…</span>
                  </div>
                ) : (
                  <p className="px-4 py-6 text-center text-sm text-muted">
                    No matches for “{q.trim()}”.
                  </p>
                )
              ) : (
                <>
                  {groups.map((g) => (
                  <div key={g.label} className="mb-1">
                    <div className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted/70">
                      {g.label}
                    </div>
                    {g.results.map((r) => {
                      idx += 1;
                      const i = idx;
                      const meta = KIND_META[r.kind];
                      const watched = r.track
                        ? watchlist.includes(r.track.id)
                        : false;
                      return (
                        <div
                          key={r.key}
                          data-idx={i}
                          role="button"
                          tabIndex={-1}
                          onMouseMove={() => setActive(i)}
                          onClick={() => run(r)}
                          className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors ${
                            i === active ? "bg-surface2" : "hover:bg-surface2/60"
                          }`}
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                            style={{
                              backgroundColor: `${meta.color}1a`,
                              color: meta.color,
                            }}
                            aria-hidden="true"
                          >
                            {r.kind === "news" ? (
                              <IconNews size={14} />
                            ) : r.kind === "calendar" ? (
                              <IconCalendar size={14} />
                            ) : r.kind === "preset" ? (
                              <IconZap size={14} />
                            ) : (
                              <IconCandles size={14} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] leading-tight text-text">
                              {r.title}
                            </span>
                            {r.subtitle && (
                              <span className="block truncate text-[12px] leading-tight text-muted">
                                {r.subtitle}
                              </span>
                            )}
                          </span>
                          {/* Full-universe hits get a star so they can be tracked
                              (added to the watchlist) without leaving search. */}
                          {r.track ? (
                            <button
                              type="button"
                              aria-label={
                                watched
                                  ? `Stop tracking ${r.track.symbol}`
                                  : `Track ${r.track.symbol}`
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                if (r.track) toggleTrack(r.track);
                              }}
                              className={`shrink-0 rounded-md p-1.5 transition-colors ${
                                watched
                                  ? "text-accent"
                                  : "text-muted/50 hover:text-muted"
                              }`}
                            >
                              <IconStar size={15} filled={watched} />
                            </button>
                          ) : (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted/60">
                              {meta.badge}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 px-4 py-2 text-[12px] text-muted/70">
                      <Spinner />
                      <span>Searching every listed ticker and coin…</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Cap / track feedback */}
            {notice && (
              <div className="border-t border-border bg-surface2/40 px-4 py-2 text-[12px] text-bear">
                {notice}
              </div>
            )}

            {/* footer — keyboard hints */}
            <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted/70">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span>navigate</span>
              <Kbd>↵</Kbd>
              <span>open</span>
              <Kbd>esc</Kbd>
              <span>close</span>
              <span className="ml-auto">
                <IconStar size={11} /> star to track
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Spinner() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin text-muted"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="num rounded border border-border bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">
      {children}
    </kbd>
  );
}
