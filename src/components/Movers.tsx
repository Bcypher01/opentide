"use client";

import { ALL_ASSETS, type AssetDef } from "@/lib/assets";
import { formatChangePct, formatPrice } from "@/lib/format";
import type { SessionState } from "@/lib/sessions";
import { MoverCardSkeleton } from "./DashboardSkeleton";
import { IconTrendingUp } from "./Icons";

interface Quote {
  price: number;
  changePct: number | null;
}

interface Props {
  quoteOf: Record<string, Quote>;
  onSelect: (id: string) => void;
  states?: SessionState[];
  isPreview?: boolean;
}

/** Top movers across all three markets, computed from data we already have. */
export default function Movers({ quoteOf, onSelect, states = [], isPreview = false }: Props) {
  const openSessions = states.filter((s) => s.isOpen);

  if (isPreview) {
    const typical = ALL_ASSETS.map((a) => {
      const openMatches = openSessions.filter((s) => a.sessions.includes(s.def.id));
      return {
        a,
        score:
          openMatches.length * 3 +
          (a.market === "crypto" ? 1 : 0) +
          (a.sessions.length <= 2 ? 0.5 : 0),
        label: openMatches.map((s) => s.def.name).join(" + ") || "24/7",
      };
    })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score || x.a.symbol.localeCompare(y.a.symbol))
      .slice(0, 6);

    return (
      <section key="movers-preview" className="fade-in mt-5" aria-label="Typically active now">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="font-display flex items-center gap-2 text-base font-semibold tracking-tight">
            <IconTrendingUp size={16} className="text-accent" /> Typically active now
          </h2>
          <span className="text-xs text-muted">session fit at the preview time</span>
        </div>
        <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {typical.map(({ a, label }) => (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className="rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-accent/40"
              title={`View ${a.symbol} chart`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs font-medium">{a.symbol}</span>
                <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                  typical
                </span>
              </div>
              <div className="mt-1.5 truncate text-[11px] text-muted">{a.name}</div>
              <div className="mt-2 truncate text-[11px] text-text/80">{label}</div>
            </button>
          ))}
        </div>
      </section>
    );
  }

  const movers = ALL_ASSETS.map((a) => ({ a, q: quoteOf[a.id] }))
    .filter(
      (x): x is { a: AssetDef; q: Quote & { changePct: number } } =>
        Boolean(x.q) && x.q.changePct !== null && Number.isFinite(x.q.changePct)
    )
    .sort((x, y) => Math.abs(y.q.changePct) - Math.abs(x.q.changePct))
    .slice(0, 6);

  if (movers.length === 0) {
    return (
      <section key="movers-loading" className="mt-5" aria-label="Top movers">
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
    <section key="movers-loaded" className="fade-in mt-5" aria-label="Top movers">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="font-display flex items-center gap-2 text-base font-semibold tracking-tight">
          <IconTrendingUp size={16} className="text-accent" /> Movers
        </h2>
        <span className="text-xs text-muted">biggest moves across all three markets</span>
      </div>
      <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {movers.map(({ a, q }) => {
          const up = q.changePct >= 0;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className="flex flex-col rounded-xl border border-border bg-surface p-3 transition-colors hover:border-accent/40"
              title={`View ${a.symbol} chart`}
            >
              <div className="text-left">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-xs font-medium">{a.symbol}</span>
                  <span className={`num text-xs ${up ? "text-bull" : "text-bear"}`}>
                    {up ? "▲" : "▼"} {formatChangePct(q.changePct)}
                  </span>
                </div>
                <div className="num mt-1.5 text-sm">{formatPrice(q.price, a.market)}</div>
                <div className="mt-0.5 truncate text-[11px] text-muted">{a.name}</div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
