"use client";

import { ALL_ASSETS, type AssetDef } from "@/lib/assets";
import { formatChangePct, formatPrice } from "@/lib/format";
import { MoverCardSkeleton } from "./DashboardSkeleton";
import { IconTrendingUp } from "./Icons";

interface Quote {
  price: number;
  changePct: number | null;
}

interface Props {
  quoteOf: Record<string, Quote>;
  onSelect: (id: string) => void;
}

/** Top movers across all three markets, computed from data we already have. */
export default function Movers({ quoteOf, onSelect }: Props) {
  const movers = ALL_ASSETS.map((a) => ({ a, q: quoteOf[a.id] }))
    .filter(
      (x): x is { a: AssetDef; q: Quote & { changePct: number } } =>
        Boolean(x.q) && x.q.changePct !== null && Number.isFinite(x.q.changePct)
    )
    .sort((x, y) => Math.abs(y.q.changePct) - Math.abs(x.q.changePct))
    .slice(0, 6);

  if (movers.length === 0) {
    return (
      <section className="mt-5" aria-label="Top movers">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="font-display flex items-center gap-2 text-base font-semibold tracking-tight">
            <IconTrendingUp size={16} className="text-accent" /> Movers
          </h2>
          <span className="text-xs text-muted">biggest moves across all three markets</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <MoverCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-5" aria-label="Top movers">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="font-display flex items-center gap-2 text-base font-semibold tracking-tight">
          <IconTrendingUp size={16} className="text-accent" /> Movers
        </h2>
        <span className="text-xs text-muted">biggest moves across all three markets</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {movers.map(({ a, q }) => {
          const up = q.changePct >= 0;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className="group rounded-xl border border-border bg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/40"
              title={`View ${a.symbol} chart`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs font-medium">{a.symbol}</span>
                <span className={`num text-xs ${up ? "text-bull" : "text-bear"}`}>
                  {up ? "▲" : "▼"} {formatChangePct(q.changePct)}
                </span>
              </div>
              <div className="num mt-1.5 text-sm">{formatPrice(q.price, a.market)}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted">{a.name}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
