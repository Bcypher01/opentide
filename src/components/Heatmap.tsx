"use client";

import { useMemo, useState } from "react";
import type { CurrencyStrength } from "@/app/api/forex/route";
import { CRYPTO_ASSETS, STOCK_ASSETS, type AssetDef } from "@/lib/assets";

interface Props {
  quoteOf: Record<string, { price: number; changePct: number | null }>;
  strength: CurrencyStrength[] | null;
  onSelect: (assetId: string) => void;
}

type Tab = "crypto" | "forex" | "stocks";

/** Background wash whose opacity scales with the move's size. */
function tileBg(pct: number, scale: number): string {
  const a = 0.1 + Math.min(Math.abs(pct) / scale, 1) * 0.5;
  return pct >= 0 ? `rgba(38,166,154,${a})` : `rgba(239,83,80,${a})`;
}

function Tiles({
  assets,
  quoteOf,
  scale,
  onSelect,
}: {
  assets: AssetDef[];
  quoteOf: Props["quoteOf"];
  scale: number;
  onSelect: (id: string) => void;
}) {
  const tiles = useMemo(
    () =>
      assets
        .map((a) => ({ a, pct: quoteOf[a.id]?.changePct }))
        .filter((x): x is { a: AssetDef; pct: number } => typeof x.pct === "number" && Number.isFinite(x.pct))
        .sort((x, y) => y.pct - x.pct),
    [assets, quoteOf]
  );

  // No quotes yet → skeleton tiles in the same grid, so the panel doesn't
  // collapse to a one-line message and then pop a full grid into place.
  if (tiles.length === 0)
    return (
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
        {Array.from({ length: assets.length || 16 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[5/4] rounded-lg" />
        ))}
      </div>
    );

  return (
    <div className="fade-in grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
      {tiles.map(({ a, pct }) => (
        <button
          key={a.id}
          onClick={() => onSelect(a.id)}
          title={`${a.name} · ${pct > 0 ? "+" : ""}${pct.toFixed(2)}% 24h — tap to chart`}
          style={{ backgroundColor: tileBg(pct, scale) }}
          className="flex aspect-[5/4] flex-col items-center justify-center rounded-lg border border-border/60 transition-transform hover:scale-[1.04]"
        >
          <span className="text-xs font-semibold text-text">{a.symbol}</span>
          <span className="num text-[10px] text-text/80">
            {pct > 0 ? "+" : ""}
            {pct.toFixed(1)}%
          </span>
        </button>
      ))}
    </div>
  );
}

function StrengthMeter({ strength }: { strength: CurrencyStrength[] }) {
  const max = Math.max(0.05, ...strength.map((s) => Math.abs(s.pct)));
  return (
    <div className="space-y-1.5">
      {strength.map((s) => {
        const w = (Math.abs(s.pct) / max) * 50; // % of half-width
        const up = s.pct >= 0;
        return (
          <div key={s.ccy} className="flex items-center gap-2">
            <span className="num w-10 shrink-0 text-xs font-medium text-text">{s.ccy}</span>
            <div className="relative h-3 flex-1 overflow-hidden rounded bg-surface2">
              <span className="absolute left-1/2 top-0 h-full w-px bg-border" />
              <span
                className={`absolute top-0 h-full ${up ? "bg-bull/70" : "bg-bear/70"}`}
                style={up ? { left: "50%", width: `${w}%` } : { left: `${50 - w}%`, width: `${w}%` }}
              />
            </div>
            <span
              className={`num w-16 shrink-0 text-right text-[11px] ${up ? "text-bull" : "text-bear"}`}
            >
              {s.pct > 0 ? "+" : ""}
              {s.pct.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Heatmaps — the "scan the whole market in one glance" panel. Crypto and stock
 * grids are coloured by 24h change (composed from quotes already on the page);
 * the forex tab is a currency-strength meter built from the full ECB cross
 * matrix. Tabs keep it compact on mobile.
 */
export default function Heatmap({ quoteOf, strength, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>("crypto");

  const tabs: Array<{ id: Tab; label: string; available: boolean }> = [
    { id: "crypto", label: "Crypto", available: true },
    { id: "forex", label: "Forex strength", available: !!strength && strength.length > 0 },
    { id: "stocks", label: "Stocks", available: true },
  ];

  return (
    <section className="mt-5" aria-label="Market heatmaps">
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-base font-semibold tracking-tight">Heatmap</h2>
        <span className="text-xs text-muted">
          {tab === "forex" ? "currency strength · ECB daily" : "24h change at a glance"}
        </span>
        <nav className="ml-auto flex gap-1.5" aria-label="Heatmap market">
          {tabs.map((t) => (
            <button
              key={t.id}
              disabled={!t.available}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1 text-[11px] transition-colors ${
                tab === t.id
                  ? "bg-text font-medium text-bg"
                  : t.available
                    ? "border border-border bg-surface2 text-muted hover:text-text"
                    : "cursor-not-allowed border border-border/50 text-muted/40"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-3">
        {tab === "crypto" && (
          <Tiles assets={CRYPTO_ASSETS} quoteOf={quoteOf} scale={6} onSelect={onSelect} />
        )}
        {tab === "stocks" && (
          <Tiles assets={STOCK_ASSETS} quoteOf={quoteOf} scale={3} onSelect={onSelect} />
        )}
        {tab === "forex" &&
          (strength && strength.length > 0 ? (
            <>
              <StrengthMeter strength={strength} />
              <p className="mt-2.5 text-[10px] leading-relaxed text-muted/70">
                Each bar is a currency&apos;s average move against all the others today — the
                strongest at the top. Derived from ECB daily reference rates, so it refreshes once
                per business day.
              </p>
            </>
          ) : (
            <p className="px-1 py-6 text-center text-xs text-muted">Currency strength unavailable.</p>
          ))}
      </div>
    </section>
  );
}
