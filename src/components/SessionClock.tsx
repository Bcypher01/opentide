"use client";

import { useState } from "react";
import type { CalendarPayload } from "@/app/api/calendar/route";
import {
  SessionState,
  formatCountdown,
  type SessionId,
} from "@/lib/sessions";
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
      aria-label="Market session clock"
      className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted">
        <span>Liquidity tide — drag to time-travel</span>
        <span className="h-px flex-1 bg-border" />
        <span className="hidden normal-case tracking-normal sm:inline">
          wave = typical activity, swells at overlaps
        </span>
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

      {/* Countdown chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {states.map((s) => {
          const isSel = selected === s.def.id;
          let label: string;
          if (s.isOpen && s.closesAt) {
            label = `closes in ${formatCountdown(s.closesAt - t)}`;
          } else if (s.opensAt) {
            label = `opens in ${formatCountdown(s.opensAt - t)}`;
          } else {
            label = "—";
          }
          return (
            <button
              key={s.def.id}
              onClick={() => onSelect(isSel ? null : s.def.id)}
              className={`flex min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors duration-200 ${
                isSel
                  ? "border-accent/60 bg-accent/10 text-text"
                  : "border-border bg-surface2 text-muted hover:text-text"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${s.isOpen ? "pulse-dot" : ""}`}
                style={{ backgroundColor: s.isOpen ? s.def.color : "#3a3f4a" }}
              />
              <span className="font-medium" style={{ color: s.isOpen ? s.def.color : undefined }}>
                {s.def.name}
              </span>
              <span className="num">{label}</span>
            </button>
          );
        })}
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
