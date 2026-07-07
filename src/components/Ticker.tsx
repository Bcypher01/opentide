"use client";

import { ALL_ASSETS } from "@/lib/assets";
import { formatChangePct, formatPrice } from "@/lib/format";

interface Quote {
  price: number;
  changePct: number | null;
}

interface Props {
  quoteOf: Record<string, Quote>;
  onSelect: (id: string) => void;
  isPreview?: boolean;
}

/** Full-width marquee ticker tape across the very top — pure CSS, no deps. */
export default function Ticker({ quoteOf, onSelect, isPreview = false }: Props) {
  const entries = ALL_ASSETS.filter((a) => quoteOf[a.id]);

  if (entries.length === 0) {
    return <div className="h-9 w-full border-b border-border bg-surface" />;
  }

  const strip = (
    <>
      {entries.map((a) => {
        const q = quoteOf[a.id];
        const up = (q.changePct ?? 0) >= 0;
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            className="flex shrink-0 items-center gap-2 px-4 text-xs transition-colors hover:text-text"
            title={`View ${a.symbol} chart`}
          >
            <span className="font-medium text-muted">{a.symbol}</span>
            <span className="num text-text">{formatPrice(q.price, a.market)}</span>
            <span className={`num ${up ? "text-bull" : "text-bear"}`}>
              {up ? "▲" : "▼"} {formatChangePct(q.changePct)}
            </span>
          </button>
        );
      })}
    </>
  );

  return (
    <div
      className={`relative w-full overflow-hidden border-b border-border bg-surface ${isPreview ? "opacity-75" : ""}`}
      aria-hidden="true"
    >
      {isPreview && (
        <span className="absolute right-3 top-1 z-10 rounded-full border border-border bg-bg/90 px-2 py-0.5 text-[10px] text-muted">
          live locked
        </span>
      )}
      <div className="marquee flex h-9 items-center whitespace-nowrap">
        <div className={`marquee-track flex items-center ${isPreview ? "[animation-play-state:paused]" : ""}`}>
          {strip}
          {strip}
        </div>
      </div>
    </div>
  );
}
