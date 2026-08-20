"use client";

import { useMemo, useState } from "react";
import { ALL_ASSETS, ASSET_BY_ID, type Market } from "@/lib/assets";
import { MARKET_LABEL, NEWS_SOURCES } from "@/lib/news";
import { IconChevronDown, IconSearch, IconX } from "./Icons";

export type NewsSort = "top" | "new";

export interface NewsFilterState {
  market: Market | "all";
  assets: string[]; // asset ids
  sources: string[]; // source names; empty = all
  q: string;
  sort: NewsSort;
  highOnly: boolean;
}

export const EMPTY_FILTERS: NewsFilterState = {
  market: "all",
  assets: [],
  sources: [],
  q: "",
  sort: "top",
  highOnly: false,
};

const MARKET_TABS: Array<{ id: Market | "all"; label: string }> = [
  { id: "all", label: "All markets" },
  { id: "forex", label: "Forex" },
  { id: "crypto", label: "Crypto" },
  { id: "stocks", label: "Stocks" },
];

interface Props {
  filters: NewsFilterState;
  onChange: (patch: Partial<NewsFilterState>) => void;
  onClear: () => void;
  /** total matched after filtering, for the result counter */
  resultCount: number;
}

export default function NewsFilters({ filters, onChange, onClear, resultCount }: Props) {
  const [assetOpen, setAssetOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [assetQuery, setAssetQuery] = useState("");

  const hasFilters =
    filters.market !== "all" ||
    filters.assets.length > 0 ||
    filters.sources.length > 0 ||
    filters.q.trim() !== "" ||
    filters.highOnly;

  const grouped = useMemo(() => {
    const q = assetQuery.trim().toLowerCase();
    const markets: Market[] = ["forex", "crypto", "stocks"];
    return markets.map((m) => ({
      market: m,
      assets: ALL_ASSETS.filter(
        (a) =>
          a.market === m &&
          (q === "" ||
            a.symbol.toLowerCase().includes(q) ||
            a.name.toLowerCase().includes(q))
      ),
    }));
  }, [assetQuery]);

  const toggleAsset = (id: string) =>
    onChange({
      assets: filters.assets.includes(id)
        ? filters.assets.filter((x) => x !== id)
        : [...filters.assets, id],
    });

  const toggleSource = (name: string) =>
    onChange({
      sources: filters.sources.includes(name)
        ? filters.sources.filter((x) => x !== name)
        : [...filters.sources, name],
    });

  return (
    <div className="space-y-2.5">
      {/* Row 1 — market tabs + sort + impact */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-surface p-0.5">
          {MARKET_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange({ market: t.id })}
              className={`min-h-[32px] rounded-md px-3 py-1 text-xs transition-colors ${
                filters.market === t.id
                  ? "bg-text font-medium text-bg"
                  : "text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => onChange({ highOnly: !filters.highOnly })}
            aria-pressed={filters.highOnly}
            title="Show only high-impact stories"
            className={`min-h-[32px] rounded-lg border px-3 py-1 text-xs transition-colors ${
              filters.highOnly
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-border bg-surface text-muted hover:text-text"
            }`}
          >
            High impact
          </button>

          <div className="flex gap-1 rounded-lg bg-surface p-0.5">
            {(["top", "new"] as const).map((s) => (
              <button
                key={s}
                onClick={() => onChange({ sort: s })}
                className={`min-h-[28px] rounded-md px-2.5 py-0.5 text-[11px] transition-colors ${
                  filters.sort === s ? "bg-text font-medium text-bg" : "text-muted hover:text-text"
                }`}
              >
                {s === "top" ? "Top" : "Newest"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2 — search + asset picker + source picker + clear */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <IconSearch
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder="Search headlines…"
            className="min-h-[34px] w-full rounded-lg bg-surface py-1 pl-8 pr-8 text-xs text-text outline-none transition-colors placeholder:text-dim focus:border-accent/50"
          />
          {filters.q && (
            <button
              onClick={() => onChange({ q: "" })}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text"
            >
              <IconX size={13} />
            </button>
          )}
        </div>

        {/* Asset picker */}
        <div className="relative">
          <button
            onClick={() => {
              setAssetOpen((v) => !v);
              setSourceOpen(false);
            }}
            className="flex min-h-[34px] items-center gap-1.5 rounded-lg bg-surface px-3 py-1 text-xs text-muted transition-colors hover:text-text"
          >
            Assets
            {filters.assets.length > 0 && (
              <span className="num rounded-full bg-accent/15 px-1.5 text-[10px] text-accent">
                {filters.assets.length}
              </span>
            )}
            <IconChevronDown size={13} />
          </button>
          {assetOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setAssetOpen(false)} />
              <div className="absolute right-0 z-30 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl bg-surface p-2 shadow-xl">
                <input
                  autoFocus
                  value={assetQuery}
                  onChange={(e) => setAssetQuery(e.target.value)}
                  placeholder="Filter assets…"
                  className="mb-2 w-full rounded-lg bg-surface2 px-2.5 py-1.5 text-xs text-text outline-none placeholder:text-dim focus:border-accent/50"
                />
                {grouped.map((g) => (
                  <div key={g.market} className="mb-1.5 last:mb-0">
                    <p className="px-1 py-1 text-[10px] font-medium uppercase tracking-wider text-dim">
                      {MARKET_LABEL[g.market]}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {g.assets.map((a) => {
                        const on = filters.assets.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            onClick={() => toggleAsset(a.id)}
                            className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                              on
                                ? "border-accent/60 bg-accent/10 text-accent"
                                : "border-border bg-surface2 text-muted hover:text-text"
                            }`}
                          >
                            {a.symbol}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Source picker */}
        <div className="relative">
          <button
            onClick={() => {
              setSourceOpen((v) => !v);
              setAssetOpen(false);
            }}
            className="flex min-h-[34px] items-center gap-1.5 rounded-lg bg-surface px-3 py-1 text-xs text-muted transition-colors hover:text-text"
          >
            Sources
            {filters.sources.length > 0 && (
              <span className="num rounded-full bg-accent/15 px-1.5 text-[10px] text-accent">
                {filters.sources.length}
              </span>
            )}
            <IconChevronDown size={13} />
          </button>
          {sourceOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setSourceOpen(false)} />
              <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl bg-surface p-2 shadow-xl">
                {NEWS_SOURCES.map((s) => {
                  const on = filters.sources.includes(s.name);
                  return (
                    <button
                      key={s.name}
                      onClick={() => toggleSource(s.name)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface2"
                    >
                      <span className={on ? "text-accent" : "text-text"}>{s.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] text-dim">{MARKET_LABEL[s.market]}</span>
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-[4px] border ${
                            on ? "border-accent bg-accent/20" : "border-border"
                          }`}
                        >
                          {on && <span className="block text-center text-[9px] text-accent">✓</span>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {hasFilters && (
          <button
            onClick={onClear}
            className="min-h-[34px] rounded-lg px-2.5 py-1 text-xs text-muted transition-colors hover:text-text"
          >
            Clear
          </button>
        )}
      </div>

      {/* Active asset chips + result counter */}
      {(filters.assets.length > 0 || hasFilters) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.assets.map((id) => {
            const a = ASSET_BY_ID[id];
            if (!a) return null;
            return (
              <button
                key={id}
                onClick={() => toggleAsset(id)}
                className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] text-accent transition-colors hover:bg-accent/20"
              >
                {a.symbol}
                <IconX size={11} />
              </button>
            );
          })}
          <span className="num ml-auto text-[11px] text-dim">
            {resultCount} {resultCount === 1 ? "story" : "stories"}
          </span>
        </div>
      )}
    </div>
  );
}
