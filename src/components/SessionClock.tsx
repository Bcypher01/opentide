"use client";

import { useState } from "react";
import type { CalendarPayload } from "@/app/api/calendar/route";
import { SessionState, type SessionId } from "@/lib/sessions";
import EconCalendar from "./EconCalendar";
import TideScrubber from "./TideScrubber";

interface Props {
  now: Date;
  states: SessionState[];
  useUTC: boolean;
  selected: SessionId | null;
  onSelect: (id: SessionId | null) => void;
  calendar?: CalendarPayload | null;
  /** True while the calendar feed is still loading (drives the skeleton). */
  calendarLoading?: boolean;
  /** Normalized UTC hour-of-day volatility profile from /api/sessionstats. */
  hourlyVolProfile?: number[];
}

export default function SessionClock({
  now,
  states,
  useUTC,
  selected,
  onSelect,
  calendar = null,
  calendarLoading = false,
  hourlyVolProfile,
}: Props) {
  const t = now.getTime();
  const [showAllEvents, setShowAllEvents] = useState(false);

  return (
    <section
      aria-label="Liquidity tide"
      className="module-raised p-4 sm:p-5"
    >
      <div className="mb-2 flex items-center gap-3 text-[11px] text-dim">
        <span>drag to time-travel</span>
        <span className="h-px flex-1 bg-border" />
        <span className="hidden sm:inline">wave = typical activity, swells at overlaps</span>
      </div>

      {/* Timeline */}
      <div className="relative">
        <TideScrubber
          now={now}
          states={states}
          useUTC={useUTC}
          selected={selected}
          onSelect={onSelect}
          calendar={calendar}
          showAllEvents={showAllEvents}
          volProfile={hourlyVolProfile}
        />
      </div>

      {/* Economic calendar: countdown chips, explainers, full list */}
      <EconCalendar
        calendar={calendar}
        now={t}
        states={states}
        useUTC={useUTC}
        showAll={showAllEvents}
        onToggleShowAll={() => setShowAllEvents((v) => !v)}
        loading={calendarLoading}
      />
    </section>
  );
}
