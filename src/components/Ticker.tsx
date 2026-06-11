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
}

/** Full-width marquee ticker tape across the very top — pure CSS, no deps. */
export default function Ticker({ quoteOf, onSelect }: Props) {
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
    <div className="w-full overflow-hidden border-b border-border bg-surface" aria-hidden="true">
      <div className="marquee flex h-9 items-center whitespace-nowrap">
        <div className="marquee-track flex items-center">
          {strip}
          {strip}
        </div>
      </div>
    </div>
  );
}
