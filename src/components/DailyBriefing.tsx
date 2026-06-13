"use client";

import { useMemo } from "react";
import type { CalendarPayload } from "@/app/api/calendar/route";
import type { DerivsPayload } from "@/app/api/derivs/route";
import type { PulsePayload } from "@/app/api/pulse/route";
import { composeBriefing, localDateKey, type Seg } from "@/lib/briefing";
import type { SessionState } from "@/lib/sessions";
import { useStore } from "@/lib/store";
import {
  IconActivity,
  IconCalendar,
  IconCandles,
  IconChevronRight,
  IconClock,
  IconNews,
  IconSun,
  IconTrendingUp,
  IconZap,
} from "./Icons";
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

const TONE_CLASS: Record<NonNullable<Seg["tone"]>, string> = {
  bull: "text-bull",
  bear: "text-bear",
  accent: "text-accent",
  muted: "text-muted",
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

const LINE_ICON: Record<string, React.ReactNode> = {
  sessions: <IconClock size={14} />,
  sentiment: <IconActivity size={14} />,
  macro: <IconCandles size={14} />,
  calendar: <IconCalendar size={14} />,
  movers: <IconTrendingUp size={14} />,
  funding: <IconZap size={14} />,
  headline: <IconNews size={14} />,
};

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
    briefingStats,
    trackBriefing,
    useUTC,
    watchlist,
    setDigestMode,
  } = useStore();
  const today = localDateKey(now);
  const collapsed = briefingReadDate === today;

  // Engagement over the trailing 14 days — the dogfooding gate for building
  // more into this card. Reads = days "Got it" was clicked at least once.
  const engagement = useMemo(() => {
    const since = localDateKey(new Date(now.getTime() - 13 * 864e5));
    let daysRead = 0;
    let reopens = 0;
    for (const [d, s] of Object.entries(briefingStats)) {
      if (d < since || d > today) continue;
      if (s.read > 0) daysRead++;
      reopens += s.reopen;
    }
    return { daysRead, reopens };
  }, [briefingStats, now, today]);

  const { lines, summary } = useMemo(
    () =>
      composeBriefing({ now, states, useUTC, pulse, quoteOf, derivs, calendar, news }),
    [now, states, useUTC, pulse, quoteOf, derivs, calendar, news]
  );

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
        className="group mt-4 flex w-full items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-2.5 text-left text-xs transition-colors hover:border-accent/40"
      >
        <span className="text-accent">
          <IconSun size={14} />
        </span>
        <span className="shrink-0 font-medium text-text">
          Your day in 60s
        </span>
        {summary.length > 0 && (
          <span className="num min-w-0 truncate text-muted">
            <Segs segs={summary} />
          </span>
        )}
        <span className="ml-auto shrink-0 text-muted transition-colors group-hover:text-accent">
          expand ›
        </span>
      </button>
    );
  }

  return (
    <section
      aria-label="Daily briefing"
      className="mt-4 rounded-2xl border border-accent/25 bg-surface p-4 sm:p-5"
    >
      <div className="relative flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <IconSun size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold leading-tight tracking-tight">
            Your day in 60 seconds
          </h2>
          <p className="text-[11px] text-muted">{dateLabel}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {watchlist.length > 0 && (
            <button
              type="button"
              onClick={() => setDigestMode(true)}
              title="Switch to watchlist digest view"
              className="flex min-h-[32px] items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1 text-xs text-accent transition-colors hover:bg-accent/20"
            >
              Digest <IconChevronRight size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              trackBriefing(today, "read");
              setBriefingReadDate(today);
            }}
            className="min-h-[32px] rounded-full border border-border bg-surface2 px-3.5 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-text"
          >
            Got it ✓
          </button>
        </div>
      </div>

      <div className="relative mt-4 grid gap-x-8 gap-y-1 lg:grid-cols-2">
        {lines.map((l) => (
          <div
            key={l.key}
            className="flex gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface2/60"
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface2 text-accent">
              {LINE_ICON[l.key] ?? <IconActivity size={14} />}
            </span>
            <div className="min-w-0 text-sm leading-relaxed">
              <span className="mr-2 text-[10px] font-medium uppercase tracking-wider text-muted">
                {l.label}
              </span>
              <span className="text-text/90">
                <Segs segs={l.segs} />
                {l.link && (
                  <a
                    href={l.link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-text underline decoration-accent/40 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
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
                      className="whitespace-nowrap text-xs text-accent hover:underline"
                    >
                      chart it →
                    </button>
                  </>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="relative mt-3 border-t border-border/60 px-2 pt-2.5 text-[11px] text-muted/70">
        Composed from the live data on this page — collapses once read, back fresh
        tomorrow. Educational, not investment advice.
        {(engagement.daysRead > 0 || engagement.reopens > 0) && (
          <span className="num">
            {" · read "}
            {engagement.daysRead}/14d
            {engagement.reopens > 0 && `, ${engagement.reopens} reopens`}
          </span>
        )}
      </p>
    </section>
  );
}
