"use client";

import { useState } from "react";
import { ASSET_BY_ID, type Market } from "@/lib/assets";
import { timeAgo } from "@/lib/format";
import { NewsItemSkeleton } from "./DashboardSkeleton";

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  market: Market;
  assets: string[];
  ts: number;
}

interface Props {
  items: NewsItem[];
  loading: boolean;
  error: boolean;
  now: number;
  onSelectAsset: (id: string) => void;
  /** fixed-height class, e.g. "xl:h-[604px]" — list scrolls inside it */
  heightClass?: string;
  /** optional footer node (e.g. "All news →" link) */
  footer?: React.ReactNode;
}

const MARKET_COLOR: Record<Market, string> = {
  crypto: "#00D4AA",
  forex: "#4FA8E8",
  stocks: "#E8B44F",
};

const TABS: Array<{ id: Market | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "forex", label: "Forex" },
  { id: "crypto", label: "Crypto" },
  { id: "stocks", label: "Stocks" },
];

export default function NewsFeed({
  items,
  loading,
  error,
  now,
  onSelectAsset,
  heightClass = "",
  footer,
}: Props) {
  const [tab, setTab] = useState<Market | "all">("all");
  const visible = items.filter((it) => tab === "all" || it.market === tab).slice(0, 60);

  return (
    <section
      className={`flex h-full flex-col rounded-2xl border border-border bg-surface ${heightClass}`}
      aria-label="Market news"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Newswire</h2>
        <div className="flex gap-1 rounded-lg border border-border bg-surface2 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-[28px] rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                tab === t.id ? "bg-text text-bg" : "text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && items.length === 0 && (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <NewsItemSkeleton
                key={i}
                titleWidth={["w-2/3", "w-5/6", "w-1/2", "w-3/4"][i % 4]}
              />
            ))}
          </div>
        )}

        {error && items.length === 0 && (
          <p className="p-3 text-sm text-muted">
            Newswire unreachable right now — prices keep flowing. It retries automatically.
          </p>
        )}

        {visible.map((it, i) => (
          <article key={`${it.link}-${i}`} className="rounded-lg px-2 py-2.5 transition-colors hover:bg-surface2">
            <a href={it.link} target="_blank" rel="noreferrer" className="block">
              <h3 className="text-[13px] leading-snug text-text">{it.title}</h3>
            </a>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: MARKET_COLOR[it.market] }}
              />
              <span>{it.source}</span>
              <span className="num">{timeAgo(it.ts, now)}</span>
              {it.assets.slice(0, 3).map((id) => {
                const a = ASSET_BY_ID[id];
                if (!a) return null;
                return (
                  <button
                    key={id}
                    onClick={() => onSelectAsset(id)}
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
      </div>

      {footer}
    </section>
  );
}
