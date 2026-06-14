"use client";

import { useEffect, useMemo, useState } from "react";
import type { SessionStatsPayload, SessionStat } from "@/app/api/sessionstats/route";
import type { SessionState } from "@/lib/sessions";

interface Props {
  data: SessionStatsPayload | null;
  states: SessionState[];
  onSelect: (assetId: string) => void;
}

/** Which session to spotlight: the open one, else the next to open. */
function focusSession(states: SessionState[]): string {
  const open = states.find((s) => s.isOpen);
  if (open) return open.def.id;
  const next = states
    .filter((s) => s.opensAt !== null)
    .sort((a, b) => (a.opensAt as number) - (b.opensAt as number))[0];
  return next?.def.id ?? states[0]?.def.id ?? "london";
}

function ratioTone(ratio: number): string {
  if (ratio >= 1.25) return "text-bull";
  if (ratio <= 0.6) return "text-muted";
  return "text-text";
}

function Spotlight({ stat, inProgress }: { stat: SessionStat; inProgress: boolean }) {
  const hasNormal = stat.avgRangePct !== null;
  const hasToday = stat.todayRangePct !== null;
  const ratio = hasNormal && hasToday ? stat.todayRangePct! / stat.avgRangePct! : null;

  // Bar: normal = 100% reference line; today fills relative to it (capped 200%).
  const todayWidth = ratio !== null ? Math.min(ratio, 2) * 50 : 0;

  return (
    <div className="rounded-xl border border-border bg-surface2 p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-text">{stat.name} session</span>
        {hasNormal ? (
          <span className="num text-[10px] text-muted">avg from {stat.samples} days</span>
        ) : (
          <span className="text-[10px] text-muted">not enough history yet</span>
        )}
      </div>

      {hasNormal ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-text/90">
            Typically ranges{" "}
            <span className="num text-text">{stat.avgRangePct!.toFixed(2)}%</span> during this
            session.
            {hasToday && ratio !== null && (
              <>
                {" "}
                Today{inProgress ? " so far" : ""}:{" "}
                <span className={`num ${ratioTone(ratio)}`}>{stat.todayRangePct!.toFixed(2)}%</span>{" "}
                <span className={`num ${ratioTone(ratio)}`}>
                  ({Math.round(ratio * 100)}% of normal)
                </span>
                .
              </>
            )}
          </p>

          {/* normal vs today bar */}
          <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-surface">
            {todayWidth > 0 && (
              <span
                className={`absolute left-0 top-0 h-full rounded-full ${
                  ratio !== null && ratio >= 1 ? "bg-bull/70" : "bg-accent/60"
                }`}
                style={{ width: `${todayWidth}%` }}
              />
            )}
            {/* 100%-of-normal marker */}
            <span className="absolute left-1/2 top-0 h-full w-px bg-text/50" />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted/70">
            <span>0</span>
            <span>normal</span>
            <span>2× normal</span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Building a baseline for this session — check back once more history accrues.
        </p>
      )}
    </div>
  );
}

/** Loading state — mirrors the spotlight card + the four per-session tiles. */
function SessionStatsSkeleton() {
  return (
    <section key="sessionstats-loading" className="mt-5" aria-label="Session statistics">
      <div className="mb-2 flex items-center gap-3">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-3 w-48 rounded" />
      </div>
      <div className="rounded-2xl border border-border bg-surface p-3">
        <div className="rounded-xl border border-border bg-surface2 p-3.5">
          <div className="flex justify-between">
            <div className="skeleton h-3.5 w-28 rounded" />
            <div className="skeleton h-3 w-20 rounded" />
          </div>
          <div className="skeleton mt-2.5 h-3.5 w-3/4 rounded" />
          <div className="skeleton mt-3 h-2 w-full rounded-full" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface2/50 p-2.5">
              <div className="skeleton h-3 w-14 rounded" />
              <div className="skeleton mt-1.5 h-3 w-16 rounded" />
              <div className="skeleton mt-1.5 h-3 w-12 rounded" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Session statistics — extends the DST-aware session math into a genuinely
 * novel free feature: how each asset typically behaves *per session*, and how
 * today compares. Everything routes back to the session clock (the moat).
 * Crypto-first (the only free intraday source); hidden if the upstream fails.
 */
export default function SessionStats({ data, states, onSelect }: Props) {
  const [assetId, setAssetId] = useState<string | null>(null);

  const assets = data?.assets ?? [];
  const active = useMemo(
    () => assets.find((a) => a.assetId === assetId) ?? assets[0] ?? null,
    [assets, assetId]
  );

  // Keep selection valid if the asset list changes.
  useEffect(() => {
    if (assets.length && !assets.some((a) => a.assetId === assetId)) {
      setAssetId(assets[0].assetId);
    }
  }, [assets, assetId]);

  // data === null → still loading: hold the layout with a skeleton. A resolved
  // error / empty payload (upstream unavailable) hides the section.
  if (!data) return <SessionStatsSkeleton />;
  if (data.error || assets.length === 0 || !active) return null;

  const focusId = focusSession(states);
  const focusStat = active.stats.find((s) => s.session === focusId) ?? active.stats[0];
  const focusState = states.find((s) => s.def.id === focusStat.session);
  const inProgress = !!focusState?.isOpen && focusStat.todayInProgress;

  return (
    <section key="sessionstats-loaded" className="fade-in mt-5" aria-label="Session statistics">
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-base font-semibold tracking-tight">Session stats</h2>
        <span className="text-xs text-muted">
          how {active.symbol} usually moves per session · {data.lookbackDays}d
        </span>
        <nav className="ml-auto flex gap-1.5" aria-label="Asset">
          {assets.map((a) => (
            <button
              key={a.assetId}
              onClick={() => setAssetId(a.assetId)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                active.assetId === a.assetId
                  ? "bg-text font-medium text-bg"
                  : "border border-border bg-surface2 text-muted hover:text-text"
              }`}
            >
              {a.symbol}
            </button>
          ))}
        </nav>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-3">
        <Spotlight stat={focusStat} inProgress={inProgress} />

        {/* All four sessions at a glance */}
        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {active.stats.map((s) => {
            const isFocus = s.session === focusStat.session;
            const ratio =
              s.avgRangePct && s.todayRangePct !== null ? s.todayRangePct / s.avgRangePct : null;
            return (
              <div
                key={s.session}
                className={`rounded-lg border p-2.5 ${
                  isFocus ? "border-accent/40 bg-surface2" : "border-border bg-surface2/50"
                }`}
              >
                <div className="text-[11px] font-medium text-text">{s.name}</div>
                <div className="num mt-1 text-[11px] text-muted">
                  {s.avgRangePct !== null ? `${s.avgRangePct.toFixed(2)}% avg` : "—"}
                </div>
                <div className="num text-[11px] text-text/80">
                  {s.todayRangePct !== null ? (
                    <>
                      {s.todayRangePct.toFixed(2)}%
                      {ratio !== null && (
                        <span className={`ml-1 ${ratioTone(ratio)}`}>{Math.round(ratio * 100)}%</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted/60">no session today</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2.5 flex items-center justify-between">
          <p className="text-[10px] leading-relaxed text-muted/70">
            Range = session high-low as a % of the session-open price. &ldquo;Of normal&rdquo;
            compares today to the {data.lookbackDays}-day average. Binance · informational only.
          </p>
          <button
            onClick={() => onSelect(active.assetId)}
            className="ml-3 shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-text"
          >
            Chart {active.symbol}
          </button>
        </div>
      </div>
    </section>
  );
}
