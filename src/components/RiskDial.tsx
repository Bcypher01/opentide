"use client";

import { useEffect, useMemo, useState } from "react";
import type { PulsePayload } from "@/app/api/pulse/route";
import { compTone, computeRiskDial } from "@/lib/risk";

interface Props {
  pulse: PulsePayload | null;
  quoteOf: Record<string, { price: number; changePct: number | null }>;
}

const toneClass = (t: "bull" | "bear" | "muted") =>
  t === "bull" ? "text-bull" : t === "bear" ? "text-bear" : "text-muted";

/** Map score −100…+100 to a point on a 180° arc (r given, centre 100,100). */
function arcPoint(score: number, r: number) {
  const angle = (90 - score * 0.9) * (Math.PI / 180); // 180°(left)…0°(right)
  return { x: 100 + r * Math.cos(angle), y: 100 - r * Math.sin(angle) };
}

function Gauge({
  score,
  label,
  signStr,
  scoreTone,
}: {
  score: number;
  label: string;
  signStr: string;
  scoreTone: string;
}) {
  const mark = arcPoint(score, 80);
  return (
    <svg
      viewBox="0 0 200 116"
      className="w-full max-w-[200px]"
      role="img"
      aria-label={`Risk score ${score} out of 100 — ${label}`}
    >
      <defs>
        <linearGradient id="riskArc" x1="20" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-bear)" />
          <stop offset="50%" stopColor="var(--color-muted)" />
          <stop offset="100%" stopColor="var(--color-bull)" />
        </linearGradient>
      </defs>
      {/* track */}
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--color-border)" strokeWidth="11" strokeLinecap="round" />
      {/* coloured scale */}
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#riskArc)" strokeWidth="11" strokeLinecap="round" opacity="0.55" />
      {/* position marker on the arc */}
      <circle cx={mark.x} cy={mark.y} r="7" fill="var(--color-surface)" stroke="currentColor" strokeWidth="3.5" className={scoreTone} />
      {/* score + label, centred in the open dial — nothing crosses it */}
      <text x="100" y="78" textAnchor="middle" fontSize="30" fontWeight="600" fill="currentColor" className={`num ${scoreTone}`}>
        {signStr}
      </text>
      <text x="100" y="95" textAnchor="middle" fontSize="11" fontWeight="500" fill="currentColor" className={scoreTone}>
        {label}
      </text>
      {/* end labels */}
      <text x="14" y="113" fontSize="8" fill="var(--color-muted)" textAnchor="start">
        risk-off
      </text>
      <text x="186" y="113" fontSize="8" fill="var(--color-muted)" textAnchor="end">
        risk-on
      </text>
    </svg>
  );
}

/** Loading state — semicircle gauge + blurb/chips placeholder. */
function RiskDialSkeleton() {
  return (
    <section key="riskdial-loading" className="mt-5" aria-label="Cross-market risk dial">
      <div className="mb-2 flex items-baseline gap-3">
        <div className="skeleton h-4 w-20 rounded" />
        <div className="skeleton h-3 w-44 rounded" />
      </div>
      <div className="module p-4">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <div className="skeleton h-[104px] w-[200px] shrink-0 rounded-t-full" />
          <div className="min-w-0 flex-1">
            <div className="skeleton h-3.5 w-full rounded" />
            <div className="skeleton mt-2 h-3.5 w-4/5 rounded" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-6 w-28 rounded-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Cross-market risk dial — a single risk-on/risk-off gauge synthesised from
 * signals the dashboard already has (BTC, crypto breadth, equities, both
 * Fear & Greed readings, the dollar). A composite "brand asset": transparent
 * about its inputs via the tap-to-open breakdown. Hidden until enough signals
 * are available.
 */
export default function RiskDial({ pulse, quoteOf }: Props) {
  const [open, setOpen] = useState(false);
  const dial = useMemo(() => computeRiskDial({ pulse, quoteOf }), [pulse, quoteOf]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // No pulse data yet → loading: show the gauge skeleton. Once data is in but
  // there still aren't enough signals to score, hide the dial.
  if (!pulse) return <RiskDialSkeleton />;
  if (!dial) return null;

  const scoreTone =
    dial.score >= 18 ? "text-bull" : dial.score <= -18 ? "text-bear" : "text-text";
  const signStr = `${dial.score > 0 ? "+" : ""}${dial.score}`;

  return (
    <section key="riskdial-loaded" className="fade-in mt-5" aria-label="Cross-market risk dial">
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="section-label">Risk dial</h2>
        <span className="text-xs text-dim">risk-on / risk-off · composite</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="ml-auto rounded-full border border-white/[0.055] px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-text"
        >
          {open ? "Hide inputs" : "How it's built"}
        </button>
      </div>

      <div className="module p-4">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
          {/* Gauge with centred score */}
          <div className="shrink-0">
            <Gauge score={dial.score} label={dial.label} signStr={signStr} scoreTone={scoreTone} />
          </div>

          {/* Blurb + component chips */}
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-relaxed text-text/90">{dial.blurb}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {dial.components.map((c) => (
                <span
                  key={c.key}
                  className="flex items-baseline gap-1.5 rounded-full bg-surface2 px-2.5 py-1"
                  title={`${c.label}: ${c.detail}`}
                >
                  <span className="text-[10px] uppercase tracking-wider text-muted">{c.label}</span>
                  <span className={`num text-[11px] ${toneClass(compTone(c.norm))}`}>{c.detail}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {open && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs leading-relaxed text-muted">
              The dial averages each signal below onto a single −100 (risk-off) … +100 (risk-on)
              scale. Price moves and sentiment readings are weighted together; the dollar counts{" "}
              <span className="text-text">inversely</span> (a stronger dollar is risk-off). It&apos;s
              a regime gauge, not a trade signal.
            </p>
            <div className="mt-2.5 space-y-1.5">
              {dial.components.map((c) => {
                const pct = Math.round(((c.norm + 1) / 2) * 100);
                return (
                  <div key={c.key} className="flex items-center gap-2">
                    <span className="w-36 shrink-0 text-[11px] text-muted">{c.label}</span>
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
                      {/* centre tick */}
                      <span className="absolute left-1/2 top-0 h-full w-px bg-border" />
                      <span
                        className={`absolute top-0 h-full rounded-full ${
                          c.norm >= 0 ? "bg-bull/70" : "bg-bear/70"
                        }`}
                        style={
                          c.norm >= 0
                            ? { left: "50%", width: `${pct - 50}%` }
                            : { left: `${pct}%`, width: `${50 - pct}%` }
                        }
                      />
                    </div>
                    <span className={`num w-16 shrink-0 text-right text-[11px] ${toneClass(compTone(c.norm))}`}>
                      {c.detail}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
