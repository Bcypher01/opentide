"use client";

import { useState } from "react";
import { ASSET_BY_ID } from "@/lib/assets";
import { CHART_INTERVALS, resolveChartTarget, tvEmbedUrl } from "@/lib/chart";
import { formatChangePct, formatPrice } from "@/lib/format";
import { useInView } from "@/lib/hooks";

interface Props {
  assetId: string;
  price: number | null;
  changePct: number | null;
  /** trending-in-news suggestions: [{id, count}] */
  trending: Array<{ id: string; count: number }>;
  onSelect: (id: string) => void;
}

export default function ChartPanel({ assetId, price, changePct, trending, onSelect }: Props) {
  const [interval, setInterval] = useState("60");
  const { symbol, displaySymbol, displayName, market } = resolveChartTarget(assetId);
  const up = (changePct ?? 0) >= 0;
  const src = tvEmbedUrl(symbol, interval);
  // Defer the TradingView iframe until the chart scrolls near the viewport,
  // keeping its render-blocking JS + WebSockets off the initial-load path.
  const [chartRef, chartInView] = useInView<HTMLDivElement>("300px");

  return (
    <section
      id="chart"
      className="overflow-hidden rounded-2xl border border-border bg-surface"
      aria-label={`Chart for ${displaySymbol}`}
    >
      {/* Chart header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-base font-semibold">{displaySymbol}</h2>
            <span className="truncate text-xs text-muted">{displayName}</span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            {price !== null && (
              <span className="num text-lg leading-none">{formatPrice(price, market)}</span>
            )}
            {changePct !== null && (
              <span className={`num text-sm ${up ? "text-bull" : "text-bear"}`}>
                {up ? "▲ " : "▼ "}
                {formatChangePct(changePct)}
              </span>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-surface2 p-0.5">
          {CHART_INTERVALS.map((iv) => (
            <button
              key={iv.value}
              onClick={() => setInterval(iv.value)}
              className={`num min-h-[30px] rounded-md px-2.5 py-1 text-xs transition-colors ${
                interval === iv.value ? "bg-text text-bg" : "text-muted hover:text-text"
              }`}
            >
              {iv.label}
            </button>
          ))}
        </div>
      </div>

      {/* In the news — chart suggestions driven by the news engine */}
      {trending.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border px-4 py-2">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted">
            In the news
          </span>
          {trending.map(({ id, count }) => {
            const a = ASSET_BY_ID[id];
            if (!a) return null;
            const active = id === assetId;
            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                title={`${count} recent stories mention ${a.name} — view chart`}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-accent/60 bg-accent/10 text-accent"
                    : "border-border bg-surface2 text-muted hover:text-text"
                }`}
              >
                {a.symbol}
                <span className="num rounded-full bg-bg px-1.5 text-[10px] text-muted">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* TradingView free embed — mounted only once scrolled into view */}
      <div ref={chartRef} className="h-[420px] w-full bg-bg sm:h-[480px]">
        {chartInView ? (
          <iframe
            key={`${symbol}-${interval}`}
            src={src}
            title={`TradingView chart — ${displaySymbol}`}
            className="h-full w-full"
            frameBorder="0"
            allowFullScreen
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-surface2/40" aria-hidden />
        )}
      </div>
    </section>
  );
}
