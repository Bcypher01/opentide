"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarPayload } from "@/app/api/calendar/route";
import {
  IMPACT_COLOR,
  filterEvents,
  formatEventTime,
} from "@/lib/calendar";
import { usePreviewStore } from "@/lib/previewStore";
import { type SessionId, type SessionState } from "@/lib/sessions";
import {
  buildTideCurve,
  tideEnvelopeAt,
  type TidePoint,
} from "@/lib/tide";

interface Props {
  now: Date;
  states: SessionState[];
  useUTC: boolean;
  selected: SessionId | null;
  onSelect: (id: SessionId | null) => void;
  calendar?: CalendarPayload | null;
  showAllEvents: boolean;
  volProfile?: number[];
}

// Geometry fills the full viewBox: wave from TOP to BASE, session bands +
// snap dots on AXIS, hour labels at AXIS+17 ≈ 269 — no dead band at the
// bottom. (BASE was 210 in a 280-tall viewBox, so ~25% of the component's
// height rendered as empty space below the axis labels.)
const W = 1140;
const H = 280;
const TOP = 22;
const BASE = 250;
const AXIS = 252;
const SNAP_MINUTES = 10;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function dayStartUTC(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function fracToDate(now: Date, frac: number): Date {
  return new Date(dayStartUTC(now) + clamp01(frac) * 86_400_000);
}

function formatTime(d: Date, useUTC: boolean): string {
  if (useUTC) return `${d.toISOString().slice(11, 16)} UTC`;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function activityLabel(y: number): string {
  if (y >= 0.66) return "high";
  if (y >= 0.36) return "medium";
  return "low";
}

type Coord = readonly [number, number];

// Catmull-Rom → cubic Bézier through every sample point, shared by both the
// stroked line and the area fill so they trace the exact same smooth curve
// (previously only the area used this; the line drew straight segments
// between the 96 samples, which read as jagged/faceted next to the fill).
function smoothCurve(coords: readonly Coord[]): string {
  if (coords.length === 0) return "";
  let d = `M ${coords[0][0].toFixed(2)} ${coords[0][1].toFixed(2)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

function tideCoords(points: TidePoint[]): Coord[] {
  return points.map((p) => [p.x * W, BASE - p.y * (BASE - TOP)] as const);
}

// Exact Y (pixels) of the smoothed curve at a continuous x fraction, using
// the same Catmull-Rom segment math as smoothCurve but evaluated at the
// in-between parameter `t` instead of only at sample points. The playhead
// dot and the activity readout use this — snapping to the nearest of the 96
// samples instead (as before) let the dot sit visibly off the curve, since a
// Catmull-Rom segment can bow past its neighboring samples.
function curveYAt(coords: readonly Coord[], frac: number): number {
  if (coords.length === 0) return BASE;
  if (coords.length === 1) return coords[0][1];
  const maxIndex = coords.length - 1;
  // Samples sit at x_i = i / coords.length (see buildTideCurve's STEP_COUNT
  // division), so the last sample is at frac (coords.length-1)/coords.length
  // — short of 1 — not at frac 1. The continuous index for a given
  // day-fraction is therefore frac * coords.length, not frac * (length-1);
  // using the wrong divisor searched a drifting, wrong segment of the curve,
  // which is why the dot could visibly separate from the line mid-drag.
  const pos = Math.min(maxIndex, Math.max(0, clamp01(frac) * coords.length));
  const i = Math.min(maxIndex - 1, Math.floor(pos));
  const t = pos - i;
  const p0 = coords[Math.max(0, i - 1)];
  const p1 = coords[i];
  const p2 = coords[i + 1];
  const p3 = coords[Math.min(maxIndex, i + 2)];
  const c1y = p1[1] + (p2[1] - p0[1]) / 6;
  const c2y = p2[1] - (p3[1] - p1[1]) / 6;
  const mt = 1 - t;
  return mt * mt * mt * p1[1] + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * p2[1];
}

function pointsToArea(points: TidePoint[]): string {
  if (points.length === 0) return "";
  const coords = tideCoords(points);
  const curve = smoothCurve(coords);
  return `M ${coords[0][0].toFixed(2)} ${BASE} L ${curve.slice(2)} L ${W} ${BASE} Z`;
}

function pointsToLine(points: TidePoint[]): string {
  if (points.length === 0) return "";
  return smoothCurve(tideCoords(points));
}

function sessionEnvelopePath(points: TidePoint[], state: SessionState): string {
  if (points.length === 0) return "";
  let d = `M 0 ${BASE}`;
  for (const p of points) {
    const env = tideEnvelopeAt(p.x, state);
    const weight =
      state.def.id === "london"
        ? 1
        : state.def.id === "newyork"
          ? 0.95
          : state.def.id === "tokyo"
            ? 0.6
            : 0.4;
    const weighted = Math.min(1, env * weight);
    d += ` L ${(p.x * W).toFixed(2)} ${(BASE - weighted * (BASE - TOP)).toFixed(2)}`;
  }
  return `${d} L ${W} ${BASE} Z`;
}

function nearestPoint(points: TidePoint[], frac: number): TidePoint {
  const idx = Math.min(points.length - 1, Math.max(0, Math.round(frac * (points.length - 1))));
  return points[idx];
}

function segments(start: number, end: number): Array<[number, number]> {
  if (start === end) return [[0, 1]];
  if (start < end) return [[start, end]];
  return [
    [start, 1],
    [0, end],
  ];
}

export default function TideScrubber({
  now,
  states,
  useUTC,
  selected,
  onSelect,
  calendar = null,
  showAllEvents,
  volProfile,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [localFrac, setLocalFrac] = useState<number | null>(null);
  // The parent re-renders every second (clock tick) and every 150ms during a
  // drag (preview propagation), handing this component fresh `onSelect`
  // identities each time. Reading it through a ref keeps it out of the
  // static layer's dependency list so the memo can actually hold mid-drag.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const previewTime = usePreviewStore((s) => s.previewTime);
  const setPreview = usePreviewStore((s) => s.setPreview);

  // The global preview store fans out to the whole dashboard (session states,
  // tint, price rows, movers, newswire, …), so pushing to it on every
  // rAF-throttled drag frame (~60/s) was the source of the janky drag — each
  // frame paid for a full-page re-render. The playhead itself still updates
  // every frame via `localFrac` (cheap, local to this component); the global
  // store is throttled to ~150ms per the plan's perf guardrail, with a
  // trailing update so the last position is never dropped.
  const lastPropagateAt = useRef(0);
  const trailingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPropagateMs = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (trailingTimer.current) clearTimeout(trailingTimer.current);
    };
  }, []);

  const nowFrac =
    (now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60) / 1440;
  const dayStart = dayStartUTC(now);
  // Minute resolution is all the static layer needs (event past-dimming).
  // Depending on `now` directly re-invalidated the whole memo chain — curve,
  // paths, snaps, static layer — once per second, including mid-drag.
  const nowMinuteMs = Math.floor(now.getTime() / 60_000) * 60_000;
  // Content key for `states`: the array identity changes every clock tick,
  // but the bands/isOpen it renders from change rarely.
  const statesKey = states
    .map((s) => `${s.def.id}:${s.bandStart}:${s.bandEnd}:${s.isOpen}`)
    .join("|");
  const activeFrac = localFrac ?? (previewTime ? (previewTime - dayStart) / 86_400_000 : nowFrac);
  const activeDate = fracToDate(now, activeFrac);

  const todaysEvents = useMemo(() => {
    if (!calendar?.events) return [];
    return filterEvents(calendar.events, showAllEvents).filter(
      (e) => e.ts >= dayStart && e.ts < dayStart + 86_400_000,
    );
  }, [calendar, showAllEvents, dayStart]);

  // buildTideCurve only reads the UTC day boundary, so key the curve on the
  // day — not on `now`, which ticks every second.
  const tide = useMemo(
    () => buildTideCurve(new Date(dayStart + 43_200_000), volProfile),
    [dayStart, volProfile],
  );
  const coords = useMemo(() => tideCoords(tide), [tide]);
  const areaPath = useMemo(() => pointsToArea(tide), [tide]);
  const linePath = useMemo(() => pointsToLine(tide), [tide]);
  // Categorical bits (dominant session, overlap) come from the nearest
  // sample — they're already discrete. The dot's y-position and the activity
  // percentage instead read the exact smoothed curve at `activeFrac`, so the
  // dot always sits on the visible line and the number tracks it 1:1.
  const reading = nearestPoint(tide, activeFrac);
  const dotY = curveYAt(coords, activeFrac);
  const smoothActivity = clamp01((BASE - dotY) / (BASE - TOP));
  const previewStates = useMemo(() => states.filter((s) => s.isOpen), [states]);

  const snaps = useMemo(() => {
    const out: Array<{ frac: number; label: string }> = [];
    for (const s of states) {
      out.push({ frac: s.bandStart, label: `${s.def.name} opens` });
      out.push({ frac: s.bandEnd, label: `${s.def.name} closes` });
    }
    for (const e of todaysEvents) {
      const d = new Date(e.ts);
      out.push({
        frac: (d.getUTCHours() * 60 + d.getUTCMinutes()) / 1440,
        label: e.title,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesKey, todaysEvents]);

  function snapped(frac: number): { frac: number; label: string | null } {
    let best: { frac: number; label: string; dist: number } | null = null;
    for (const s of snaps) {
      const dist = Math.abs(s.frac - frac) * 1440;
      if (dist <= SNAP_MINUTES && (!best || dist < best.dist)) {
        best = { ...s, dist };
      }
    }
    return best ? { frac: best.frac, label: best.label } : { frac, label: null };
  }

  function applyLocal(frac: number, snap: boolean): number {
    // Magnetic snapping is only applied on discrete commits (tap, keyboard
    // step, release) — applying it while the pointer is continuously moving
    // made the dot jump in and out of snap points instead of tracking the
    // pointer, which read as a stuttery/jumpy drag. `snapLabel` below still
    // surfaces the nearby snap name without moving the dot, so the magnetic
    // points stay discoverable during a live drag.
    const target = snap ? snapped(clamp01(frac)).frac : clamp01(frac);
    setLocalFrac(target);
    return fracToDate(now, target).getTime();
  }

  function propagatePreview(ms: number) {
    latestPropagateMs.current = ms;
    const elapsed = performance.now() - lastPropagateAt.current;
    if (elapsed >= 150) {
      lastPropagateAt.current = performance.now();
      setPreview(ms);
      return;
    }
    if (trailingTimer.current) return;
    trailingTimer.current = setTimeout(() => {
      trailingTimer.current = null;
      lastPropagateAt.current = performance.now();
      if (latestPropagateMs.current !== null) setPreview(latestPropagateMs.current);
    }, 150 - elapsed);
  }

  /** High-frequency path (drag): playhead moves every frame, unsnapped, page-wide preview is throttled. */
  function commitFrac(frac: number) {
    propagatePreview(applyLocal(frac, false));
  }

  /** Low-frequency path (tap, keyboard, release): commit instantly, magnetic-snapped, no throttle. */
  function commitFracImmediate(frac: number) {
    const ms = applyLocal(frac, true);
    if (trailingTimer.current) {
      clearTimeout(trailingTimer.current);
      trailingTimer.current = null;
    }
    lastPropagateAt.current = performance.now();
    setPreview(ms);
  }

  // Cached for the duration of a drag so pointermove doesn't force a fresh
  // layout read (getBoundingClientRect) on every event — that reflow, on top
  // of everything else re-rendering, was adding to the stutter.
  const dragRect = useRef<DOMRect | null>(null);

  function fracFromEvent(e: React.PointerEvent<SVGSVGElement>): number {
    const rect = dragRect.current ?? svgRef.current?.getBoundingClientRect();
    if (!rect) return nowFrac;
    return (e.clientX - rect.left) / rect.width;
  }

  const snapLabel = snapped(activeFrac).label;
  const openNames = previewStates.map((s) => s.def.name).join(" + ") || "Crypto only";
  // Sorting only needs to happen when the snap set itself changes, not on
  // every drag frame — the `.find()` below is cheap enough to run per-frame
  // directly on the already-sorted list.
  const sortedSnaps = useMemo(() => [...snaps].sort((a, b) => a.frac - b.frac), [snaps]);
  const nextSnap = sortedSnaps.find((s) => s.frac > activeFrac + 1 / 1440) ?? sortedSnaps[0] ?? null;
  const nextLabel = nextSnap
    ? `${nextSnap.label} in ${Math.floor(((nextSnap.frac - activeFrac + 1) % 1) * 24)}h ${String(
        Math.round((((nextSnap.frac - activeFrac + 1) % 1) * 1440) % 60),
      ).padStart(2, "0")}m`
    : "—";

  // Everything below is independent of activeFrac/localFrac (the only things
  // that change every drag frame), so it's memoized as a single element tree.
  // Without this, every rAF-throttled drag frame was re-rendering ~100+ SVG
  // nodes (session paths, event markers, snap dots, axis labels) that never
  // actually change mid-drag — that reconciliation cost was the remaining
  // source of drag lag. Only the small playhead group below re-renders every
  // frame now.
  const staticLayer = useMemo(
    () => (
      <>
        <line x1={0} x2={W} y1={AXIS} y2={AXIS} stroke="var(--color-border)" />

        {states.map((s) => (
          <path
            key={s.def.id}
            d={sessionEnvelopePath(tide, s)}
            fill={s.def.color}
            opacity={selected && selected !== s.def.id ? 0.07 : 0.2}
          />
        ))}

        {states.map((s) =>
          segments(s.bandStart, s.bandEnd).map(([a, b], i) => (
            <rect
              key={`${s.def.id}-${i}`}
              x={a * W}
              y={AXIS - 1}
              width={(b - a) * W}
              height={5}
              rx={3}
              fill={s.def.color}
              opacity={selected && selected !== s.def.id ? 0.18 : 0.72}
              onClick={() => onSelectRef.current(selected === s.def.id ? null : s.def.id)}
            />
          )),
        )}

        {tide
          .filter((p) => p.overlap)
          .map((p, i) => (
            <rect
              key={i}
              x={p.x * W}
              y={TOP - 4}
              width={W / 96}
              height={BASE - TOP + 4}
              fill="var(--color-accent)"
              opacity={0.07}
            />
          ))}

        <path d={areaPath} fill="var(--color-accent)" opacity={0.1} />
        <path d={linePath} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeOpacity={0.9} />

        {todaysEvents.map((e) => {
          const d = new Date(e.ts);
          const frac = (d.getUTCHours() * 60 + d.getUTCMinutes()) / 1440;
          const past = e.ts <= nowMinuteMs;
          return (
            <g key={e.id} opacity={past ? 0.35 : 0.9}>
              <line
                x1={frac * W}
                x2={frac * W}
                y1={TOP + 8}
                y2={BASE}
                stroke={IMPACT_COLOR[e.impact]}
                strokeDasharray="2 3"
              />
              <circle cx={frac * W} cy={TOP + 5} r={3.5} fill={IMPACT_COLOR[e.impact]} />
              <text
                x={frac * W}
                y={TOP - 2}
                fill="var(--color-muted)"
                fontSize={9.5}
                textAnchor="middle"
              >
                {e.title.length > 16 ? `${e.title.slice(0, 15)}…` : e.title}
              </text>
              <title>
                {e.title} ({e.country}) - {formatEventTime(e.ts, useUTC)}
              </title>
            </g>
          );
        })}

        {snaps.map((s, i) => (
          <circle
            key={`${s.label}-${i}`}
            cx={s.frac * W}
            cy={AXIS}
            r={2.2}
            fill="var(--color-muted)"
            opacity={0.7}
          >
            <title>{s.label}</title>
          </circle>
        ))}

        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <text
            key={h}
            x={(h / 24) * W}
            y={AXIS + 17}
            fill="var(--color-muted)"
            fontSize={9.5}
            textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}
            className="num"
          >
            {String(h % 24).padStart(2, "0")}:00
          </text>
        ))}
      </>
    ),
    // `now`, `nowFrac` and `previewTime` are deliberately NOT deps: the
    // clock tick (1s) and the drag-time preview propagation (150ms) were
    // invalidating this memo exactly when it needed to hold. Everything the
    // tree renders from is covered by the content-keyed deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statesKey, selected, tide, areaPath, linePath, todaysEvents, snaps, useUTC, nowMinuteMs],
  );

  return (
    <div className="relative overflow-hidden">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="slider"
        tabIndex={0}
        aria-label="Tide scrubber"
        aria-valuemin={0}
        aria-valuemax={1440}
        aria-valuenow={Math.round(activeFrac * 1440)}
        aria-valuetext={`${formatTime(activeDate, useUTC)}, expected activity ${activityLabel(smoothActivity)}`}
        className="block h-[260px] w-full cursor-grab touch-none select-none outline-none ring-accent/40 focus:ring-2 active:cursor-grabbing sm:h-[340px]"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRect.current = e.currentTarget.getBoundingClientRect();
          // Instant feedback on first contact; subsequent moves go through
          // the rAF-throttled drag path.
          commitFracImmediate(fracFromEvent(e));
        }}
        onPointerMove={(e) => {
          // Browsers already coalesce pointermove to once per frame; the old
          // rAF wrapper only deferred the work to the *next* frame, which put
          // the playhead a visible frame behind the cursor.
          if (e.currentTarget.hasPointerCapture(e.pointerId)) commitFrac(fracFromEvent(e));
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          // Flush immediately so the rest of the page lands on the exact
          // released position instead of waiting out the drag throttle.
          if (localFrac !== null) commitFracImmediate(localFrac);
          setLocalFrac(null);
          dragRect.current = null;
        }}
        onPointerCancel={() => {
          setLocalFrac(null);
          dragRect.current = null;
        }}
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
          e.preventDefault();
          const step = e.shiftKey ? 60 / 1440 : 15 / 1440;
          if (e.key === "Home") commitFracImmediate(0);
          else if (e.key === "End") commitFracImmediate(1);
          else commitFracImmediate(activeFrac + (e.key === "ArrowRight" ? step : -step));
        }}
      >
        {staticLayer}

        <line
          x1={nowFrac * W}
          x2={nowFrac * W}
          y1={TOP - 6}
          y2={AXIS}
          stroke="var(--color-text)"
          strokeOpacity={previewTime ? 0.28 : 0.65}
          strokeDasharray="4 5"
        />

        <g transform={`translate(${clamp01(activeFrac) * W} 0)`}>
          {/* Glow as a wide translucent stroke, not filter="drop-shadow(…)":
              an SVG filter on the playhead re-rasterized its filter region on
              every frame of the drag — a per-frame paint cost no amount of
              React memoization could remove. */}
          <line
            y1={TOP - 6}
            y2={AXIS}
            stroke="var(--color-accent)"
            strokeWidth={5}
            strokeOpacity={0.18}
          />
          <line y1={TOP - 6} y2={AXIS} stroke="var(--color-accent)" strokeWidth={1.5} />
          <circle cy={dotY} r={5.5} fill="var(--color-accent)" />
          <circle cy={dotY} r={22} fill="transparent" />
        </g>
      </svg>

      {/* Full-width rail moved with transform (compositor-only) instead of
          `left: %` (layout + paint per frame). backdrop-blur and shadow-xl
          are gone: backdrop-filter re-samples the page behind the tooltip on
          every frame it moves — one of the main reasons the drag looked
          laggy even when JS was idle. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-3 z-10"
        style={{
          transform: `translateX(${(clamp01(activeFrac) * 100).toFixed(3)}%)`,
          willChange: "transform",
        }}
      >
        <div
          className="w-max max-w-[220px] rounded-lg border border-border bg-bg/95 px-3 py-2 text-xs"
          style={{
            transform: activeFrac > 0.82 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
          }}
        >
          <div className="num font-medium text-text">{formatTime(activeDate, useUTC)}</div>
          <div className="mt-1 text-muted">
            {openNames} · {activityLabel(smoothActivity)} expected activity
          </div>
          {snapLabel && <div className="mt-1 truncate text-accent">{snapLabel}</div>}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface2 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted">
            Sessions open
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-text">{openNames}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface2 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted">
            Expected activity
          </div>
          <div className="mt-1 text-sm font-semibold text-text">
            {reading.overlap ? "High — overlap swell" : activityLabel(smoothActivity)}
            <span className="num ml-1 text-muted">({Math.round(smoothActivity * 100)}%)</span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface2 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted">
            Next on the axis
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-text">{nextLabel}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface2 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted">
            Typical range (hour)
          </div>
          <div className="num mt-1 text-sm font-semibold text-text">
            ±{(0.3 + smoothActivity * 0.9).toFixed(2)}%
          </div>
        </div>
      </div>
    </div>
  );
}
