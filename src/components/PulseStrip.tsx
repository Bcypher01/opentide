"use client";

import type { PulsePayload } from "@/app/api/pulse/route";
import { formatChangePct } from "@/lib/format";

interface Props {
  data: PulsePayload | null;
}

/** Color ramp for Fear & Greed: extreme fear → bear, extreme greed → bull. */
function fgColor(v: number): string {
  if (v <= 25) return "text-bear";
  if (v <= 45) return "text-bear/80";
  if (v < 55) return "text-muted";
  if (v < 75) return "text-bull/80";
  return "text-bull";
}

function Chip({
  label,
  value,
  sub,
  subClass,
  title,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  subClass?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex shrink-0 items-baseline gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="num text-xs text-text">{value}</span>
      {sub !== undefined && (
        <span className={`num text-[10px] ${subClass ?? "text-muted"}`}>{sub}</span>
      )}
    </div>
  );
}

/**
 * Market Pulse — a thin sentiment/macro strip: crypto Fear & Greed, BTC
 * dominance, total-mcap 24h, DXY (ECB daily) and US yields. Each chip hides
 * itself when its upstream is unavailable; the strip hides entirely when
 * nothing has loaded yet (the page never jitters).
 */
export default function PulseStrip({ data }: Props) {
  if (!data) return null;
  const { fearGreed: fg, btcDominance, mcapChangePct, dxy, yields } = data;
  if (!fg && btcDominance === null && !dxy && !yields) return null;

  const fgDelta =
    fg && fg.yesterday !== null ? fg.value - fg.yesterday : null;

  return (
    <section aria-label="Market pulse" className="mt-4">
      <div className="scrollbar-none flex items-center gap-2 overflow-x-auto">
        {fg && (
          <Chip
            label="Crypto F&G"
            title="Crypto Fear & Greed Index (alternative.me)"
            value={
              <>
                <span className={fgColor(fg.value)}>{fg.value}</span>
                <span className="ml-1.5 text-muted">{fg.classification}</span>
              </>
            }
            sub={
              fgDelta === null
                ? undefined
                : `${fgDelta > 0 ? "▲" : fgDelta < 0 ? "▼" : "·"} ${Math.abs(fgDelta)} vs yda`
            }
            subClass={
              fgDelta === null
                ? undefined
                : fgDelta > 0
                  ? "text-bull"
                  : fgDelta < 0
                    ? "text-bear"
                    : "text-muted"
            }
          />
        )}

        {btcDominance !== null && (
          <Chip
            label="BTC.D"
            title="Bitcoin dominance (CoinGecko)"
            value={`${btcDominance.toFixed(1)}%`}
          />
        )}

        {mcapChangePct !== null && (
          <Chip
            label="Crypto mcap 24h"
            value={formatChangePct(mcapChangePct)}
            subClass="text-muted"
            title="Total crypto market cap, 24h change (CoinGecko)"
          />
        )}

        {dxy && (
          <Chip
            label="DXY"
            title={`US Dollar Index approximation from ECB daily reference rates · as of ${dxy.asOf}`}
            value={dxy.value.toFixed(2)}
            sub={
              dxy.changePct === null
                ? "ECB daily"
                : `${formatChangePct(dxy.changePct)} · ECB daily`
            }
            subClass={
              dxy.changePct === null
                ? undefined
                : dxy.changePct >= 0
                  ? "text-bull"
                  : "text-bear"
            }
          />
        )}

        {yields && (
          <>
            <Chip
              label="US 10Y"
              title={`Daily Treasury par yield · as of ${yields.asOf}`}
              value={`${yields.y10.toFixed(2)}%`}
            />
            <Chip
              label="2s10s"
              title="10Y minus 2Y Treasury spread, basis points"
              value={`${yields.spread > 0 ? "+" : ""}${yields.spread} bps`}
              subClass={yields.spread < 0 ? "text-bear" : "text-muted"}
            />
          </>
        )}
      </div>
    </section>
  );
}
