"use client";

import { useEffect, useMemo, useState } from "react";
import { ASSET_BY_ID } from "@/lib/assets";
import { useStore } from "@/lib/store";
import type {
  AiRecommendation,
  RecAction,
  RecommendationsResult,
} from "@/lib/recommendations";
import { IconChevronDown, IconChevronRight, IconZap } from "./Icons";

// ---------------------------------------------------------------------------
// AiInsights — actionable AI recommendations card.
//
// POSTs the user's watchlist to /api/recommendations so recommendations are
// personalized to what they're tracking (server keys its 10-min cache per
// watchlist, so this stays cheap and quota-safe). Refetches ~1.5s after the
// watchlist changes (debounced — rapid starring collapses into one call) and
// on a 10-min interval. Renders nothing until there's at least one
// recommendation, so when AI keys aren't configured the dashboard looks
// exactly as before. Each card taps through to its asset chart.
// ---------------------------------------------------------------------------

const POLL_MS = 600_000; // 10 min, matches the server cache window
const DEBOUNCE_MS = 1500; // collapse rapid watchlist edits into one request

interface Props {
  onSelectAsset: (id: string) => void;
}

// Action → short label + accent token (reuses existing theme colors).
const ACTION_META: Record<RecAction, { label: string; cls: string }> = {
  long: { label: "Long bias", cls: "text-bull border-bull/40 bg-bull/10" },
  short: { label: "Short bias", cls: "text-bear border-bear/40 bg-bear/10" },
  hedge: { label: "Hedge", cls: "text-accent border-accent/40 bg-accent/10" },
  watch: { label: "Watch", cls: "text-muted border-border bg-surface2" },
};

function RecRow({
  rec,
  onSelectAsset,
}: {
  rec: AiRecommendation;
  onSelectAsset: (id: string) => void;
}) {
  const asset = rec.assetId ? ASSET_BY_ID[rec.assetId] : undefined;
  const meta = ACTION_META[rec.action];
  const tappable = Boolean(asset);

  return (
    <div
      onClick={() => asset && onSelectAsset(asset.id)}
      className={`flex gap-3 rounded-xl border border-border bg-surface2/40 p-3 transition-colors ${
        tappable ? "cursor-pointer hover:border-accent/50" : ""
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 h-6 w-1 shrink-0 rounded-full ${
          rec.priority === 1
            ? "bg-accent"
            : rec.priority === 2
              ? "bg-accent/50"
              : "bg-border"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.cls}`}
          >
            {meta.label}
          </span>
          {asset && (
            <span className="num text-[11px] text-muted">{asset.symbol}</span>
          )}
        </div>
        <p className="mt-1 text-sm font-medium leading-snug text-text">
          {rec.title}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-muted">{rec.rationale}</p>
      </div>
      {tappable && (
        <IconChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted/60" />
      )}
    </div>
  );
}

/** Placeholder shown only during the initial load so the card's presence is
 *  immediate instead of popping in after the LLM round-trip. */
function AiInsightsSkeleton() {
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-2 px-4 py-3">
        <IconZap className="h-4 w-4 text-accent" />
        <span className="text-sm font-medium text-text">AI insights</span>
        <span className="rounded-full border border-border bg-surface2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted/70">
          analyzing…
        </span>
      </div>
      <div className="space-y-2 px-3 pb-3" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-3 rounded-xl border border-border bg-surface2/40 p-3"
          >
            <span className="mt-0.5 h-6 w-1 shrink-0 rounded-full bg-border" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-3 w-20 rounded-full" />
              <div className="skeleton h-3.5 w-3/4" />
              <div className="skeleton h-3 w-5/6" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AiInsights({ onSelectAsset }: Props) {
  const watchlist = useStore((s) => s.watchlist);
  const [data, setData] = useState<RecommendationsResult | null>(null);
  // True once the first fetch has completed (success OR failure) — lets us show
  // a skeleton only during the initial load, not on every background refetch.
  const [settled, setSettled] = useState(false);
  const [open, setOpen] = useState(true);

  // Stable primitive key so the effect only re-runs when the SET changes,
  // not on every new array reference from the store.
  const wlKey = useMemo(() => [...watchlist].sort().join(","), [watchlist]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ watchlist: wlKey ? wlKey.split(",") : [] }),
          signal: controller.signal,
        });
        if (res.ok) {
          const json = (await res.json()) as RecommendationsResult;
          if (!cancelled) setData(json);
        }
      } catch {
        // network/abort — keep last good data, next tick retries
      } finally {
        // Mark settled so the skeleton gives way (to the card or to nothing).
        if (!cancelled) setSettled(true);
      }
    };

    const debounce = setTimeout(run, DEBOUNCE_MS);
    const interval = setInterval(run, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(debounce);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [wlKey]);

  const recs = useMemo(() => data?.recommendations ?? [], [data]);
  const personalized = Boolean(data?.personalized);

  // No recommendations yet: show a skeleton while the FIRST request is in
  // flight, then hide entirely once settled with nothing (no keys / degraded).
  if (recs.length === 0) {
    return settled ? null : <AiInsightsSkeleton />;
  }

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <IconZap className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium text-text">AI insights</span>
          {personalized && (
            <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
              Watchlist
            </span>
          )}
          <span className="rounded-full border border-border bg-surface2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            {recs.length} ideas
          </span>
        </span>
        <IconChevronDown
          className={`h-4 w-4 text-muted transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>

      {open && (
        <div className="space-y-2 px-3 pb-3">
          {recs.map((rec, i) => (
            <RecRow
              key={`${rec.title}-${i}`}
              rec={rec}
              onSelectAsset={onSelectAsset}
            />
          ))}
          <p className="px-1 pt-1 text-[10px] leading-snug text-muted/60">
            AI-generated from live market data · not financial advice. Verify
            before acting.
          </p>
        </div>
      )}
    </section>
  );
}
