"use client";

import { ALL_ASSETS, type AssetDef } from "@/lib/assets";
import { formatChangePct, formatPrice } from "@/lib/format";
import type { SessionState } from "@/lib/sessions";
import { MoverCardSkeleton } from "./DashboardSkeleton";

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

// One grid, hairline gaps, no per-tile borders: the 1px background shows
// through the gap and reads as a rule. Headers live on the shelf above, so
// this component renders content only.
const GRID =
  "grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-3 lg:grid-cols-6";
const CELL = "bg-surface p-3.5 text-left transition-colors hover:bg-surface2";

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
      <section key="movers-preview" className="fade-in mt-4" aria-label="Typically active now">
        <div className={GRID}>
          {typical.map(({ a, label }) => (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={CELL}
              title={`View ${a.symbol} chart`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[12.5px] font-medium">{a.symbol}</span>
                <span className="text-[11px] text-dim">typical</span>
              </div>
              <div className="mt-1.5 truncate text-xs text-dim">{a.name}</div>
              <div className="mt-2 truncate text-xs text-muted">{label}</div>
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
      <section key="movers-loading" className="mt-4" aria-label="Top movers">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <MoverCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section key="movers-loaded" className="fade-in mt-4" aria-label="Top movers">
      <div className={GRID}>
        {movers.map(({ a, q }) => {
          const up = q.changePct >= 0;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={CELL}
              title={`View ${a.symbol} chart`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[12.5px] font-medium">{a.symbol}</span>
                <span className={`num text-[12.5px] ${up ? "text-bull" : "text-bear"}`}>
                  {formatChangePct(q.changePct)}
                </span>
              </div>
              <div className="num mt-1.5 text-[15px]">{formatPrice(q.price, a.market)}</div>
              <div className="mt-0.5 truncate text-xs text-dim">{a.name}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
