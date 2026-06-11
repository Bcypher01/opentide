"use client";

import { useMemo } from "react";
import {
  SessionState,
  formatCountdown,
  type SessionId,
} from "@/lib/sessions";

interface Props {
  now: Date;
  states: SessionState[];
  useUTC: boolean;
  selected: SessionId | null;
  onSelect: (id: SessionId | null) => void;
}

/** A band may wrap midnight UTC → render as up to two segments. */
function segments(start: number, end: number): Array<[number, number]> {
  if (start === end) return [[0, 1]];
  if (start < end) return [[start, end]];
  return [
    [start, 1],
    [0, end],
  ];
}

export default function SessionClock({ now, states, useUTC, selected, onSelect }: Props) {
  const t = now.getTime();

  // Now-cursor position on the 24h UTC axis
  const nowFrac =
    (now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60) / 1440;

  // Liquidity strip: intervals where ≥2 sessions are scheduled simultaneously
  const overlaps = useMemo(() => {
    const points = new Set<number>([0, 1]);
    for (const s of states)
      for (const [a, b] of segments(s.bandStart, s.bandEnd)) {
        points.add(a);
        points.add(b);
      }
    const sorted = [...points].sort((a, b) => a - b);
    const out: Array<[number, number]> = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const mid = (sorted[i] + sorted[i + 1]) / 2;
      const count = states.filter((s) =>
        segments(s.bandStart, s.bandEnd).some(([a, b]) => mid >= a && mid < b)
      ).length;
      if (count >= 2) out.push([sorted[i], sorted[i + 1]]);
    }
    return out;
  }, [states]);

  const fmtAxis = (utcHour: number) => {
    const d = new Date(Date.UTC(2000, 0, 1, utcHour));
    if (useUTC) return `${String(utcHour).padStart(2, "0")}:00`;
    // Use a fixed reference date offset by today's local offset for label only
    const local = new Date(now);
    local.setUTCHours(utcHour, 0, 0, 0);
    return local.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <section
      aria-label="Market session clock"
      className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
    >
      {/* Timeline */}
      <div className="relative">
        {/* Hour gridlines + labels */}
        <div className="pointer-events-none absolute inset-0">
          {[0, 6, 12, 18].map((h) => (
            <div
              key={h}
              className="absolute top-0 bottom-0 border-l border-border/70"
              style={{ left: `${(h / 24) * 100}%` }}
            />
          ))}
        </div>

        {/* Session lanes */}
        <div className="space-y-1.5 py-1">
          {states.map((s) => {
            const active = s.isOpen;
            const dimmed = selected !== null && selected !== s.def.id;
            return (
              <button
                key={s.def.id}
                onClick={() => onSelect(selected === s.def.id ? null : s.def.id)}
                aria-pressed={selected === s.def.id}
                title={`${s.def.name} — ${s.def.hint}`}
                className="relative block h-7 w-full cursor-pointer rounded-md transition-opacity duration-200"
                style={{ opacity: dimmed ? 0.35 : 1 }}
              >
                <span className="absolute left-1 top-1/2 z-10 -translate-y-1/2 text-[10px] font-medium uppercase tracking-wider text-muted">
                  {s.def.name}
                </span>
                {segments(s.bandStart, s.bandEnd).map(([a, b], i) => (
                  <span
                    key={i}
                    className="absolute top-0 h-full rounded-md"
                    style={{
                      left: `${a * 100}%`,
                      width: `${(b - a) * 100}%`,
                      backgroundColor: s.def.color,
                      opacity: active ? 0.9 : 0.2,
                      boxShadow: active ? `0 0 12px ${s.def.color}55` : "none",
                      transition: "opacity 300ms var(--ease-glide)",
                    }}
                  />
                ))}
              </button>
            );
          })}

          {/* Crypto lane — never closes */}
          <div className="relative h-7 w-full rounded-md" title="Crypto trades 24/7">
            <span className="absolute left-1 top-1/2 z-10 -translate-y-1/2 text-[10px] font-medium uppercase tracking-wider text-muted">
              Crypto
            </span>
            <span className="absolute inset-0 rounded bg-accent/15">
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-accent">
                <span className="pulse-dot mr-1 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
                24/7
              </span>
            </span>
          </div>
        </div>

        {/* Overlap liquidity strip */}
        <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded bg-surface2">
          {overlaps.map(([a, b], i) => (
            <span
              key={i}
              className="absolute top-0 h-full"
              style={{
                left: `${a * 100}%`,
                width: `${(b - a) * 100}%`,
                background: "var(--color-accent)",
                opacity: 0.7,
                boxShadow: "0 0 8px var(--color-accent)",
              }}
            />
          ))}
        </div>

        {/* Now cursor */}
        <div
          className="pointer-events-none absolute -top-1 -bottom-1 z-20 w-px bg-accent"
          style={{ left: `${nowFrac * 100}%`, boxShadow: "0 0 8px var(--color-accent)" }}
        >
          <span className="absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent" />
        </div>

        {/* Axis labels */}
        <div className="relative mt-1.5 h-4 text-[10px] text-muted">
          {[0, 6, 12, 18].map((h) => (
            <span
              key={h}
              className="num absolute -translate-x-1/2"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {fmtAxis(h)}
            </span>
          ))}
        </div>
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
    </section>
  );
}
