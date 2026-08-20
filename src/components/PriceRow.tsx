"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { AssetDef } from "@/lib/assets";
import { formatChangePct, formatPrice } from "@/lib/format";
import { IconStar } from "./Icons";

interface Props {
  asset: AssetDef;
  price: number | null;
  changePct: number | null;
  live?: boolean;
  isPreview?: boolean;
  sessionLabel?: string | null;
  watched: boolean;
  onToggleWatch: (id: string) => void;
}

function PriceRowInner({
  asset,
  price,
  changePct,
  live,
  isPreview = false,
  sessionLabel = null,
  watched,
  onToggleWatch,
}: Props) {
  const prevPrice = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    if (isPreview) {
      prevPrice.current = price;
      setFlash(null);
      return;
    }
    if (price !== null && prevPrice.current !== null && price !== prevPrice.current) {
      setFlash(price > prevPrice.current ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 850);
      prevPrice.current = price;
      return () => clearTimeout(t);
    }
    prevPrice.current = price;
  }, [price, isPreview]);

  const up = (changePct ?? 0) >= 0;

  return (
    <div
      className={`flex min-h-[52px] items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface2 ${
        flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : ""
      } ${isPreview ? "opacity-[0.78]" : ""}`}
    >
      <button
        aria-label={watched ? `Remove ${asset.symbol} from watchlist` : `Add ${asset.symbol} to watchlist`}
        onClick={(e) => {
          e.stopPropagation();
          setPop(true);
          setTimeout(() => setPop(false), 150);
          onToggleWatch(asset.id);
        }}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors ${
          watched ? "text-accent" : "text-dim/60 hover:text-muted"
        } ${pop ? "star-pop" : ""}`}
      >
        <IconStar size={15} filled={watched} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-medium">{asset.symbol}</span>
          {live && !isPreview && (
            <span
              className="pulse-dot h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
              title="Live via Binance WebSocket"
            />
          )}
          {isPreview && (
            <span
              className="shrink-0 rounded-full bg-surface2 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-dim"
              title="Preview context; price remains live"
            >
              locked
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs text-dim">{asset.name}</span>
          {sessionLabel && (
            <span className="shrink-0 truncate rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
              {sessionLabel}
            </span>
          )}
        </div>
      </div>

      <div className="text-right">
        {price === null ? (
          <div className="skeleton ml-auto h-4 w-20" />
        ) : (
          <div className="num text-[13.5px]">{formatPrice(price, asset.market)}</div>
        )}
        <div
          className={`num text-xs ${
            changePct === null ? "text-dim" : up ? "text-bull" : "text-bear"
          }`}
        >
          {formatChangePct(changePct)}
        </div>
      </div>
    </div>
  );
}

const PriceRow = memo(PriceRowInner);
export default PriceRow;
