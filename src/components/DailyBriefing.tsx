"use client";

import { useMemo } from "react";
import type { CalendarPayload } from "@/app/api/calendar/route";
import type { DerivsPayload } from "@/app/api/derivs/route";
import type { PulsePayload } from "@/app/api/pulse/route";
import { composeBriefing, localDateKey, type Seg } from "@/lib/briefing";
import type { SessionState } from "@/lib/sessions";
import { useStore } from "@/lib/store";
import type { NewsItem } from "./NewsFeed";

interface Props {
  now: Date;
  states: SessionState[];
  pulse: PulsePayload | null;
  quoteOf: Record<string, { price: number; changePct: number | null }>;
  derivs: DerivsPayload | null;
  calendar: CalendarPayload | null;
  news: NewsItem[];
  onSelectAsset: (id: string) => void;
}

// bull/bear stay coloured — those carry meaning. "accent" is the composer's
// generic emphasis, and accent is reserved for live/now, so emphasis is carried
// by weight and brightness instead of a second hue.
const TONE_CLASS: Record<NonNullable<Seg["tone"]>, string> = {
  bull: "text-bull",
  bear: "text-bear",
  accent: "font-medium text-text",
  muted: "text-dim",
};

function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((seg, i) =>
        seg.tone ? (
          <span key={i} className={TONE_CLASS[seg.tone]}>
            {seg.t}
          </span>
        ) : (
          <span key={i}>{seg.t}</span>
        )
      )}
    </>
  );
}


/**
 * "Your day in 60 seconds" — the morning ritual's front door. Expanded on the
 * first visit of each local day, then collapses to a one-line bar that keeps a
 * live digest (mood + next event) so it stays useful all day. Written in plain
 * language so it reads as well on day 1 as on day 1,000.
 */
export default function DailyBriefing({
  now,
  states,
  pulse,
  quoteOf,
  derivs,
  calendar,
  news,
  onSelectAsset,
}: Props) {
  const {
    briefingReadDate,
    setBriefingReadDate,
    trackBriefing,
    useUTC,
    watchlist,
    setDigestMode,
  } = useStore();
  const today = localDateKey(now);
  const collapsed = briefingReadDate === today;

  const { lines, summary } = useMemo(
    () =>
      composeBriefing({ now, states, useUTC, pulse, quoteOf, derivs, calendar, news }),
    [now, states, useUTC, pulse, quoteOf, derivs, calendar, news]
  );

  // The hero directly above this card already leads with the session state, in
  // bigger type and with live countdowns. Repeating it here was the single most
  // duplicated sentence on the page.
  const visibleLines = useMemo(() => lines.filter((l) => l.key !== "sessions"), [lines]);

  const dateLabel = now.toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => {
          trackBriefing(today, "reopen");
          setBriefingReadDate(null);
        }}
        aria-label="Reopen daily briefing"
        className="group mt-5 flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-2.5 text-left text-xs transition-colors hover:bg-surface2"
      >
        <span className="section-label shrink-0">Your day in 60s</span>
        {summary.length > 0 && (
          <span className="num min-w-0 truncate text-muted">
            <Segs segs={summary} />
          </span>
        )}
        <span className="ml-auto shrink-0 text-dim transition-colors group-hover:text-text">
          expand
        </span>
      </button>
    );
  }

  return (
    <section
      aria-label="Daily briefing"
      className="module mt-5 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="module-title">Your day in 60 seconds</h2>
        <span className="text-[11px] text-dim">{dateLabel}</span>
        <div className="ml-auto flex shrink-0 items-center gap-4">
          {watchlist.length > 0 && (
            <button
              type="button"
              onClick={() => setDigestMode(true)}
              title="Switch to watchlist digest view"
              className="text-[12.5px] text-muted underline decoration-muted/40 underline-offset-4 transition-colors hover:text-text"
            >
              Open digest
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              trackBriefing(today, "read");
              setBriefingReadDate(today);
            }}
            className="min-h-[30px] rounded-full bg-surface2 px-3.5 py-1 text-xs text-dim transition-colors hover:text-text"
          >
            Got it
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-x-12 gap-y-3 lg:grid-cols-2">
        {visibleLines.map((l) => (
          <div key={l.key} className="flex gap-4 text-sm leading-relaxed">
            {/* A label spine, not an icon chip per row: seven accent glyphs
                stacked down a card was the loudest thing on the page. */}
            <span className="section-label w-[72px] shrink-0 pt-[3px]">{l.label}</span>
            <span className="min-w-0 text-text">
              <Segs segs={l.segs} />
              {l.link && (
                <a
                  href={l.link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-muted/40 underline-offset-4 transition-colors hover:text-muted"
                >
                  {l.link.title}
                </a>
              )}
              {l.assetId && !l.link && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => onSelectAsset(l.assetId!)}
                    className="whitespace-nowrap text-[13px] text-muted underline decoration-muted/40 underline-offset-4 transition-colors hover:text-text"
                  >
                    chart it
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-dim">
        Composed from the live data on this page — collapses once read, back fresh
        tomorrow. Educational, not investment advice.
      </p>

    </section>
  );
}
