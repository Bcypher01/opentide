"use client";

import type { DerivsPayload } from "@/app/api/derivs/route";

interface Props {
  data: DerivsPayload | null;
  onSelect: (assetId: string) => void;
}

const fmtFunding = (rate: number) => {
  const pct = rate * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(4)}%`;
};

const fmtOi = (usd: number) =>
  usd >= 1e9 ? `$${(usd / 1e9).toFixed(1)}B` : `$${(usd / 1e6).toFixed(0)}M`;

/** Loading state — pill-shaped placeholders matching the funding/OI chips. */
function DerivsPanelSkeleton() {
  return (
    <section key="derivs-loading" className="mt-4" aria-label="Derivatives pulse">
      <div className="mb-2 flex items-baseline gap-3">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-3 w-48 rounded" />
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {[112, 120, 104, 132, 128, 120].map((w, i) => (
          <div key={i} className="skeleton h-[34px] shrink-0 rounded-full" style={{ width: `${w}px` }} />
        ))}
      </div>
    </section>
  );
}

/**
 * Derivatives pulse — Binance Futures funding extremes + BTC/ETH open
 * interest. Positioning at a glance: extreme positive funding = crowded
 * longs, negative = crowded shorts. Hidden entirely if the upstream is
 * unavailable (fapi has no US-safe mirror).
 */
export default function DerivsPanel({ data, onSelect }: Props) {
  // data === null → still loading: show the skeleton. Once it resolves to an
  // error or an empty payload (e.g. fapi geo-blocked on Vercel), hide entirely.
  if (!data) return <DerivsPanelSkeleton />;
  if (data.error || data.funding.length === 0) return null;

  // Most-stretched funding first; show the 4 extremes.
  const extremes = [...data.funding]
    .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
    .slice(0, 4);

  return (
    <section key="derivs-loaded" className="fade-in mt-4" aria-label="Derivatives pulse">
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="font-display text-base font-semibold tracking-tight">
          Derivatives
        </h2>
        <span className="text-xs text-muted">
          funding extremes &amp; open interest · Binance Futures
        </span>
      </div>

      <div className="scrollbar-none flex gap-2 overflow-x-auto">
        {extremes.map((f) => {
          const crowdedLongs = f.rate > 0;
          return (
            <button
              key={f.symbol}
              onClick={() => onSelect(`crypto:${f.symbol}`)}
              title={`${f.symbol} perp funding rate — ${
                crowdedLongs ? "longs pay shorts" : "shorts pay longs"
              }. Tap to chart.`}
              className="flex shrink-0 items-baseline gap-2 rounded-full bg-surface px-3.5 py-1.5 transition-colors hover:bg-surface2"
            >
              <span className="text-xs font-medium">{f.symbol}</span>
              <span
                className={`num text-xs ${crowdedLongs ? "text-bull" : "text-bear"}`}
              >
                {fmtFunding(f.rate)}
              </span>
              <span className="text-[10px] text-muted">
                {crowdedLongs ? "longs pay" : "shorts pay"}
              </span>
            </button>
          );
        })}

        {data.detail.map((d) => (
          <button
            key={d.symbol}
            onClick={() => onSelect(`crypto:${d.symbol}`)}
            title={`${d.symbol} futures open interest${
              d.longShortRatio !== null
                ? ` · long/short account ratio ${d.longShortRatio.toFixed(2)}`
                : ""
            }`}
            className="flex shrink-0 items-baseline gap-2 rounded-full bg-surface px-3.5 py-1.5 transition-colors hover:bg-surface2"
          >
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
              {d.symbol} OI
            </span>
            {Number.isFinite(d.oiUsd) && (
              <span className="num text-xs">{fmtOi(d.oiUsd)}</span>
            )}
            {d.oiChangePct !== null && (
              <span
                className={`num text-[10px] ${
                  d.oiChangePct >= 0 ? "text-bull" : "text-bear"
                }`}
              >
                {d.oiChangePct > 0 ? "+" : ""}
                {d.oiChangePct.toFixed(1)}% 24h
              </span>
            )}
            {d.longShortRatio !== null && (
              <span className="num text-[10px] text-muted">
                L/S {d.longShortRatio.toFixed(2)}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
