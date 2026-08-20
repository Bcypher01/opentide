"use client";

import { resolveAsset, type CustomAsset } from "@/lib/assets";
import { formatChangePct } from "@/lib/format";
import type { AwayDiff } from "@/lib/hooks";

interface Props {
  diff: AwayDiff;
  customAssets: Record<string, CustomAsset>;
  onDismiss: () => void;
  onSelect: (assetId: string) => void;
}

function awayLabel(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)} days`;
}

/**
 * "While you were away" — shown once per return visit (>30 min gap), listing
 * what moved on the trader's watchlist since they last looked. The cheapest
 * possible answer to "what did I miss?".
 */
export default function WelcomeBack({
  diff,
  customAssets,
  onDismiss,
  onSelect,
}: Props) {
  return (
    <section
      aria-label="While you were away"
      className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-accent/[0.07] px-4 py-2.5"
    >
      <span className="text-xs font-medium text-accent">
        While you were away ({awayLabel(diff.awayMs)})
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {diff.moves.map((m) => {
          const a = resolveAsset(m.id, customAssets);
          if (!a) return null;
          const up = m.pct >= 0;
          return (
            <button
              key={m.id}
              onClick={() => onSelect(customAssets[m.id]?.chartId ?? m.id)}
              title={`Chart ${a.symbol}`}
              className="flex items-baseline gap-1.5 rounded-full bg-surface px-3 py-1 text-xs transition-colors hover:bg-surface2"
            >
              <span className="font-medium">{a.symbol}</span>
              <span className={`num ${up ? "text-bull" : "text-bear"}`}>
                {up ? "▲" : "▼"} {formatChangePct(m.pct)}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-auto rounded-full px-2 py-0.5 text-xs text-muted transition-colors hover:text-text"
      >
        ✕
      </button>
    </section>
  );
}
