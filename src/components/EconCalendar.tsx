"use client";

import { useState } from "react";
import type { CalendarEvent, CalendarPayload } from "@/app/api/calendar/route";
import {
  IMPACT_COLOR,
  eventCountdown,
  explainEvent,
  filterEvents,
  forecastLine,
  formatEventDay,
  formatEventTime,
  nextHighImpact,
  sessionContext,
} from "@/lib/calendar";
import { formatCountdown, type SessionState } from "@/lib/sessions";

interface Props {
  calendar: CalendarPayload | null;
  now: number;
  states: SessionState[];
  useUTC: boolean;
  showAll: boolean;
  onToggleShowAll: () => void;
}

function ImpactDot({ impact }: { impact: CalendarEvent["impact"] }) {
  return (
    <span
      aria-label={`${impact} impact`}
      title={`${impact} impact`}
      className="inline-block h-2 w-2 shrink-0 rotate-45 rounded-[2px]"
      style={{ backgroundColor: IMPACT_COLOR[impact] }}
    />
  );
}

/**
 * Economic calendar woven into the session clock: countdown chips for the
 * next high-impact releases, an expandable full list, and a tap-to-open
 * plain-language explainer for every event — so a beginner can learn what
 * "CPI" means in the same place a veteran checks the time to it.
 */
export default function EconCalendar({
  calendar,
  now,
  states,
  useUTC,
  showAll,
  onToggleShowAll,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!calendar) return null;
  const { events, anchors } = calendar;

  // Feed down → fall back to the static US anchors so the clock still says
  // "next FOMC in 12 days". Feed up → show its chips, plus the FOMC anchor
  // when the meeting is beyond the feed's two-week window.
  const upcoming = events ? nextHighImpact(events, now, 3) : [];
  const lastEventTs = events?.length ? events[events.length - 1].ts : 0;
  const extraAnchors = (anchors ?? []).filter((a) =>
    events ? a.kind === "fomc" && a.ts > lastEventTs : a.ts > now
  );

  if (upcoming.length === 0 && extraAnchors.length === 0 && !events) return null;

  const open = openId
    ? (events ?? []).find((e) => e.id === openId) ?? null
    : null;

  const listed = events
    ? filterEvents(events, showAll).filter(
        (e) => e.ts > now - 12 * 3600_000 // keep the recent past for context
      )
    : [];

  // Group the expanded list by local day.
  const groups: Array<{ day: string; items: CalendarEvent[] }> = [];
  for (const e of listed) {
    const day = formatEventDay(e.ts, now);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <div id="econ-calendar" className="mt-3 scroll-mt-24 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted/70">
          Economic calendar
        </span>
        <span className="hidden text-[10px] text-muted/50 sm:inline">
          ◆ on the timeline = scheduled release · tap a chip to learn what it is
        </span>

        {events && (
          <button
            type="button"
            onClick={onToggleShowAll}
            aria-pressed={showAll}
            className={`ml-auto min-h-[28px] rounded-full border px-3 py-0.5 text-[11px] transition-colors ${
              showAll
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-border bg-surface2 text-muted hover:text-text"
            }`}
          >
            {showAll ? "All events ✓" : "Show all"}
          </button>
        )}
      </div>

      {/* Countdown chips: next 1–3 high-impact events + static anchors */}
      <div className="mt-2 flex flex-wrap gap-2">
        {upcoming.map((e) => {
          const isOpen = openId === e.id;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setOpenId(isOpen ? null : e.id)}
              aria-expanded={isOpen}
              className={`flex min-h-[34px] items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
                isOpen
                  ? "border-accent/60 bg-accent/10 text-text"
                  : "border-border bg-surface2 text-muted hover:text-text"
              }`}
            >
              <ImpactDot impact={e.impact} />
              <span className="font-medium text-text">
                {e.title}
                <span className="ml-1 text-muted">({e.country})</span>
              </span>
              <span className="num text-accent">{eventCountdown(e.ts, now)}</span>
            </button>
          );
        })}

        {extraAnchors.map((a) => (
          <span
            key={a.kind}
            title="From the official published schedule"
            className="flex min-h-[34px] items-center gap-2 rounded-full border border-border bg-surface2 px-3 py-1 text-xs text-muted"
          >
            <ImpactDot impact="High" />
            <span className="font-medium text-text">{a.title}</span>
            <span className="num">in {formatCountdown(a.ts - now)}</span>
          </span>
        ))}

        {events && upcoming.length === 0 && extraAnchors.length === 0 && (
          <span className="py-1 text-xs text-muted">
            No high-impact releases in the next two weeks.
          </span>
        )}
      </div>

      {/* Tap-to-open explainer (PulseStrip pattern) */}
      {open && (
        <div
          role="region"
          aria-label={`About ${open.title}`}
          className="mt-2 rounded-xl border border-accent/30 bg-surface p-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-xs font-semibold text-text">
              {open.title} ({open.country}) —{" "}
              <span className="num font-normal text-muted">
                {formatEventDay(open.ts, now)} at {formatEventTime(open.ts, useUTC)},{" "}
                {sessionContext(open.ts, states)}
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setOpenId(null)}
              aria-label="Close explainer"
              className="-mr-1 -mt-1 shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-surface2 hover:text-text"
            >
              ✕
            </button>
          </div>
          {(() => {
            const ex = explainEvent(open);
            const fc = forecastLine(open);
            return (
              <>
                <p className="mt-1.5 text-xs leading-relaxed text-text/90">
                  <span className="font-medium text-muted">What it is — </span>
                  {ex.what}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-text/90">
                  <span className="font-medium text-muted">Why it matters — </span>
                  {ex.why}
                </p>
                {fc && (
                  <p className="num mt-1.5 text-xs text-text/90">{fc}</p>
                )}
                <p className="mt-2 text-[10px] uppercase tracking-wider text-muted/60">
                  Source: ForexFactory (unofficial feed) · times shown in{" "}
                  {useUTC ? "UTC" : "your local time"}
                </p>
              </>
            );
          })()}
        </div>
      )}

      {/* "Show all" — compact two-week list grouped by day */}
      {showAll && events && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface2/50">
          {groups.map((g) => (
            <div key={g.day}>
              <div className="sticky top-0 bg-surface px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                {g.day}
              </div>
              {g.items.map((e) => {
                const past = e.ts <= now;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setOpenId(openId === e.id ? null : e.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface2"
                    style={{ opacity: past ? 0.45 : 1 }}
                  >
                    <span className="num w-14 shrink-0 text-muted">
                      {formatEventTime(e.ts, useUTC)}
                    </span>
                    <ImpactDot impact={e.impact} />
                    <span className="w-9 shrink-0 font-medium text-muted">
                      {e.country}
                    </span>
                    <span className="truncate text-text">{e.title}</span>
                    {e.forecast && (
                      <span className="num ml-auto shrink-0 text-muted">
                        exp {e.forecast}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {groups.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">Nothing scheduled.</p>
          )}
        </div>
      )}
    </div>
  );
}
