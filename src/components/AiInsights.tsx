"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { resolveAsset, type CustomAsset } from "@/lib/assets";
import { useStore } from "@/lib/store";
import type {
  AiRecommendation,
  RecAction,
  RecommendationsResult,
} from "@/lib/recommendations";
import { IconChevronDown, IconChevronRight, IconStar, IconZap } from "./Icons";

// ---------------------------------------------------------------------------
// AiInsights — actionable AI recommendations card.
//
// POSTs the user's watchlist to /api/recommendations so recommendations are
// personalized to what they're tracking (server keys its 10-min cache per
// watchlist, so this stays cheap and quota-safe). Refetches ~1.5s after the
// watchlist changes (debounced — rapid starring collapses into one call) and
// on a 10-min interval. Each card taps through to its asset chart.
//
// States, in priority order:
//   · AI not configured  → render NOTHING (the dashboard looks exactly as
//     before). We detect this with the shared LLM capability probe
//     (GET /api/assistant → { enabled }), the same one the Assistant uses —
//     both gate on the same provider keys. This is what lets us tell "feature
//     off → hide" apart from "configured but failing → show unavailable".
//   · First load (configured)         → skeleton loader
//   · Configured but degraded/errored → "currently unavailable" message
//   · Empty watchlist                 → market-wide ideas + a nudge to star
//     assets for personalized insights (an empty watchlist still returns
//     useful market-wide ideas, so we never show a dead empty state)
//   · Has ideas                       → the cards
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
  customAssets,
  onSelectAsset,
}: {
  rec: AiRecommendation;
  customAssets: Record<string, CustomAsset>;
  onSelectAsset: (id: string) => void;
}) {
  const asset = rec.assetId ? resolveAsset(rec.assetId, customAssets) : undefined;
  const meta = ACTION_META[rec.action];
  const tappable = Boolean(asset);
  // Custom assets chart via their stored TradingView id, curated via their id.
  const chartTarget = asset
    ? (customAssets[asset.id]?.chartId ?? asset.id)
    : null;

  return (
    <div
      onClick={() => chartTarget && onSelectAsset(chartTarget)}
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

/** Card shell shared by the skeleton + unavailable states so the header never
 *  shifts as the card moves between loading → ready. */
function CardShell({ children }: { children: ReactNode }) {
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
      {children}
    </section>
  );
}

// The categories of data the /api/recommendations route actually composes
// (pulse, news, derivatives, calendar, movers) before the model ranks them.
// The endpoint is single-shot (no progress stream), so we reveal these on a
// timer to make the wait legible — the same "show the work" feel as the Ask
// OpenTide chips, mapped to the real work happening server-side.
const GATHER_STEPS = [
  "Reading market sentiment",
  "Scanning the newswire",
  "Checking funding & derivatives",
  "Scanning the economic calendar",
  "Ranking today's movers",
  "Composing your insights",
] as const;

const STEP_MS = 1500; // cadence at which the next gathering chip appears

/** Engaging initial loader: progressively reveals the data being gathered as
 *  status chips (mirroring the Ask OpenTide popup), over two skeleton rows so
 *  the card keeps its shape until the real ideas land. */
function InsightsLoading() {
  const [shown, setShown] = useState(1);

  useEffect(() => {
    if (shown >= GATHER_STEPS.length) return; // settle on the last chip
    const t = setTimeout(() => setShown((n) => n + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <CardShell>
      <div className="flex items-center gap-2 px-4 py-3">
        <IconZap className="h-4 w-4 text-accent" />
        <span className="text-sm font-medium text-text">AI insights</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          Gathering…
        </span>
      </div>

      <div className="px-3 pb-3">
        <div className="flex flex-wrap gap-1.5">
          {GATHER_STEPS.slice(0, shown).map((label, i) => {
            const active = i === shown - 1;
            return (
              <span
                key={label}
                className={`fade-in flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                  active
                    ? "border-accent/40 bg-accent/10 text-text"
                    : "border-border bg-surface2 text-muted"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full bg-accent ${
                    active ? "animate-pulse" : ""
                  }`}
                />
                {label}
                {active ? "…" : ""}
              </span>
            );
          })}
        </div>

        {/* Two faint skeleton rows preserve the card's shape under the chips. */}
        <div className="mt-3 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-3 rounded-xl border border-border bg-surface2/40 p-3"
            >
              <div className="skeleton h-6 w-1 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="skeleton h-4 w-20 rounded-full" />
                <div className="skeleton mt-2 h-3.5 w-3/4 rounded" />
                <div className="skeleton mt-1.5 h-3 w-full rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </CardShell>
  );
}

/** Shown only when AI IS configured but the backend is degraded or the request
 *  failed — never for the no-keys case (that renders nothing). */
function InsightsUnavailable() {
  return (
    <CardShell>
      <div className="flex items-center gap-2 px-4 py-3">
        <IconZap className="h-4 w-4 text-muted" />
        <span className="text-sm font-medium text-text">AI insights</span>
        <span className="ml-auto rounded-full border border-border bg-surface2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
          unavailable
        </span>
      </div>
      <p className="px-4 pb-4 text-xs leading-snug text-muted">
        AI insights are currently unavailable. We&apos;ll keep retrying — check
        back in a moment.
      </p>
    </CardShell>
  );
}

export default function AiInsights({ onSelectAsset }: Props) {
  const watchlist = useStore((s) => s.watchlist);
  const customAssets = useStore((s) => s.customAssets);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [data, setData] = useState<RecommendationsResult | null>(null);
  const [errored, setErrored] = useState(false);
  const [open, setOpen] = useState(true);
  const loadedOnce = useRef(false);

  // Stable primitive key so the effect only re-runs when the SET changes,
  // not on every new array reference from the store.
  const wlKey = useMemo(() => [...watchlist].sort().join(","), [watchlist]);

  // Capability probe — is any LLM provider configured? Shared signal with the
  // Assistant. Until this resolves true we render nothing, so a no-keys setup
  // never flashes a skeleton that then vanishes.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j: { enabled?: boolean }) => {
        if (!cancelled) setEnabled(Boolean(j.enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Wait until we know AI is configured before spending a request.
    if (enabled !== true) return;

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
          if (!cancelled) {
            setData(json);
            setErrored(false);
          }
        } else if (!cancelled) {
          // HTTP error (e.g. rate-limited): surface "unavailable" only if we
          // have nothing to show yet; otherwise keep the last good ideas.
          setErrored(true);
        }
      } catch {
        // Ignore aborts (cleanup); flag other network failures as errored so a
        // cold start with no data shows the unavailable message, not a stuck
        // skeleton. A later tick retries and can clear it.
        if (!controller.signal.aborted && !cancelled) setErrored(true);
      } finally {
        loadedOnce.current = true;
      }
    };

    // First load fires immediately so the skeleton resolves fast; later
    // watchlist edits are debounced into a single request.
    const delay = loadedOnce.current ? DEBOUNCE_MS : 0;
    const debounce = setTimeout(run, delay);
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
  }, [wlKey, enabled]);

  const recs = useMemo(() => data?.recommendations ?? [], [data]);
  const personalized = Boolean(data?.personalized);
  const hasRecs = recs.length > 0;

  // Self-hide entirely when AI isn't configured (or while the probe is still
  // pending) — preserves the "looks unchanged when AI is off" posture.
  if (enabled !== true) return null;

  // Configured-but-no-ideas: degraded backend or a failed cold request →
  // tell the user it's unavailable rather than showing nothing.
  if (!hasRecs) {
    if (data?.degraded || errored) return <InsightsUnavailable />;
    // No data yet and no error → first load in progress.
    return <InsightsLoading />;
  }

  return (
    <section className="fade-in mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <IconZap className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium text-text">AI insights</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
              personalized
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-surface2 text-muted"
            }`}
          >
            {personalized ? "Watchlist" : "Market-wide"}
          </span>
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
          {/* Empty watchlist → these are market-wide ideas. Nudge the user to
              star assets so future insights are tailored to what they track. */}
          {!personalized && (
            <div className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-surface2/30 px-3 py-2">
              <IconStar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted/70" />
              <p className="text-xs leading-snug text-muted">
                These are market-wide ideas. Star assets in your watchlist to get
                insights tailored to what you&apos;re tracking.
              </p>
            </div>
          )}
          {recs.map((rec, i) => (
            <RecRow
              key={`${rec.title}-${i}`}
              rec={rec}
              customAssets={customAssets}
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
