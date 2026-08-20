"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  formatCountdown,
  type SessionId,
  type SessionState,
} from "@/lib/sessions";
import { useStore } from "@/lib/store";
import { getTideReading } from "@/lib/tide";

interface Props {
  /** Live clock — the hero is permanent chrome now, so it re-reads every tick. */
  now: Date;
  states: SessionState[];
  /** Currently filtered session, or null. The session row doubles as the filter. */
  selected: SessionId | null;
  onSelect: (id: SessionId | null) => void;
  /** Normalized UTC hour-of-day volatility profile from /api/sessionstats. */
  volProfile?: number[];
}

// ---------------------------------------------------------------------------
// The sea — canvas simulation. One color family (accent teal), depth via
// opacity. Deliberately different from the Liquidity Tide chart: no time
// axis, no session colors — just water. Encodes the *current* reading:
// water level + swell size rise with market activity. The pointer adds a
// local "churn field": waves oscillate faster and lift under the cursor,
// easing out when it leaves.
// ---------------------------------------------------------------------------
interface Layer {
  /** wavelength as a fraction of the canvas width */
  lambdaFrac: number;
  /** vertical offset from the water level, px at 150px height (back = higher) */
  lift: number;
  ampScale: number;
  alpha: number;
  /** base phase speed, rad/s (sign = direction) */
  speed: number;
  /** per-layer flow multiplier so the sea does not move in lockstep */
  flowScale: number;
  /** slow speed for the amplitude envelope riding over this layer */
  swellSpeed: number;
  /** fixed offset for envelope/harmonic timing */
  offset: number;
  ridge?: boolean;
}

const LAYERS: Layer[] = [
  {
    lambdaFrac: 0.56,
    lift: -18,
    ampScale: 0.46,
    alpha: 0.08,
    speed: 0.34,
    flowScale: 0.72,
    swellSpeed: 0.12,
    offset: 0.4,
  },
  {
    lambdaFrac: 0.38,
    lift: -8,
    ampScale: 0.78,
    alpha: 0.13,
    speed: -0.58,
    flowScale: 1.08,
    swellSpeed: 0.2,
    offset: 2.1,
  },
  {
    lambdaFrac: 0.24,
    lift: 0,
    ampScale: 1,
    alpha: 0.22,
    speed: 0.82,
    flowScale: 1.34,
    swellSpeed: 0.28,
    offset: 4.3,
    ridge: true,
  },
];

// Shape-preserving cursor response. The wave phase is never perturbed
// locally (spatially varying phase compresses wavelengths and folds the
// wave into lumps) — the cursor only (a) raises a smooth amplitude envelope,
// (b) lifts the water surface slightly, and (c) speeds up the WHOLE flow
// uniformly while hovering. The default wave style always survives intact.
const CHURN_SIGMA = 260; // px radius of the cursor's influence (wide + gentle)
const CHURN_LIFT = 0.56; // extra amplitude fraction at the cursor's center
const CHURN_RISE = 12; // px the water surface rises under the cursor (at 150px height)
const FLOW_BOOST = 0.8; // whole-sea speed multiplier bonus while hovering
const SWELL_VARIATION = 0.34; // default crest-height variation across the sea
const SWELL_DRIFT = 0.18; // slow uniform drift for the default amplitude envelope
const SWELL_BREATH = 0.14; // slow per-layer amplitude breathing
const PEAK_CHOP = 0.24; // extra harmonic bite as liquidity rises
const PEAK_FLOW = 0.35; // baseline speed increase at peak liquidity

// Water level, in the sim's 150px reference frame. Higher = the waterline sits
// lower in the box, leaving air above it. Tuned against the shorter hero band
// so the crests read as waves without opening a hole under the copy.
const BASE_LEVEL = 50;

function headlineFor(open: SessionState[], next: SessionState | null, now: Date) {
  const names = open.map((s) => s.def.name);
  const nextIn = next?.opensAt ? formatCountdown(next.opensAt - now.getTime()) : null;
  if (names.length >= 2)
    return {
      title: `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are both awake.`,
      sub: "These are the loudest hours of the trading day — session overlaps are where liquidity peaks.",
    };
  if (names.length === 1)
    return {
      title: `${names[0]} is running the market right now.`,
      sub:
        next && nextIn
          ? `${next.def.name} joins in ${nextIn}. Opentide always knows what time it is.`
          : "Opentide always knows what time it is.",
    };
  return {
    title: "Markets are asleep. Crypto isn't.",
    sub:
      next && nextIn
        ? `${next.def.name} opens in ${nextIn} — watch the tide come back in.`
        : "Watch the tide come back in.",
  };
}

export default function Hero({ now, states, selected, onSelect, volProfile }: Props) {
  const openAbout = useStore((s) => s.openAbout);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pointer + churn state lives in refs: the animation reads it every frame
  // without a single React re-render.
  const pointer = useRef({ x: 0, targetX: 0, energy: 0, hover: false });
  const rectRef = useRef<DOMRect | null>(null);

  // Live, not a mount-time snapshot: this block is the permanent top of the
  // dashboard now, so the headline, the countdowns and the water level all have
  // to keep up with the clock.
  const scene = useMemo(() => {
    const open = states.filter((s) => s.isOpen);
    const next =
      states
        .filter((s) => !s.isOpen && s.opensAt)
        .sort((a, b) => (a.opensAt ?? 0) - (b.opensAt ?? 0))[0] ?? null;
    const tide = getTideReading(now, volProfile);
    const activity = tide.height; // 0..1, crypto floor included
    return {
      ...headlineFor(open, next, now),
      activity,
      overlap: tide.overlap,
      tideWord: activity >= 0.6 ? "High tide" : activity >= 0.3 ? "Mid tide" : "Low tide",
      dominantName: open[0]?.def.name ?? null,
      // One row, every session, in their own lane colours — and the session
      // filter, so the row that tells you what is awake also narrows the board.
      sessions: states.map((s) => ({
        id: s.def.id,
        name: s.def.name,
        color: s.def.color,
        isOpen: s.isOpen,
        detail: s.isOpen
          ? s.closesAt
            ? `${formatCountdown(s.closesAt - now.getTime())} left`
            : null
          : s.opensAt
            ? `in ${formatCountdown(s.opensAt - now.getTime())}`
            : null,
      })),
    };
  }, [now, states, volProfile]);

  // The canvas reads activity through a ref so the sim is set up exactly once.
  // Re-running the effect on every clock tick would restart the wave animation
  // once a second; instead the water level eases as the reading drifts.
  const actRef = useRef(scene.activity);
  const overlapRef = useRef(scene.overlap);
  actRef.current = scene.activity;
  overlapRef.current = scene.overlap;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const accent =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-accent")
        .trim() || "#3fd0a0";

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rectRef.current = null; // remeasure on next pointer move
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const drawFrame = (flowT: number) => {
      // Read live: the tide reading drifts as sessions open and close.
      const act = actRef.current;
      const peak = Math.min(1, Math.pow(act, 1.25) * (overlapRef.current ? 1.12 : 1));
      const chop = PEAK_CHOP * peak;
      const p = pointer.current;
      const level = (BASE_LEVEL + (1 - act) * 74) * (h / 150);
      const baseAmp = (4 + act * 14) * (h / 150);
      const rise = CHURN_RISE * (h / 150);
      ctx.clearRect(0, 0, w, h);
      for (const layer of LAYERS) {
        const layerT = flowT * layer.flowScale;
        const k = (Math.PI * 2) / Math.max(1, w * layer.lambdaFrac);
        const amp =
          baseAmp *
          layer.ampScale *
          (1 + SWELL_BREATH * (0.75 + peak * 0.5) * Math.sin(layerT * layer.swellSpeed + layer.offset));
        const y0 =
          level +
          layer.lift * (h / 150) +
          Math.sin(layerT * layer.swellSpeed * 0.7 + layer.offset) * (1.4 + peak * 2.2);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 5) {
          const dx = (x - p.x) / CHURN_SIGMA;
          const g = p.energy > 0.005 ? p.energy * Math.exp(-dx * dx) : 0;
          const ph = k * x + layer.speed * layerT + layer.offset;
          const swellPhase = (x / Math.max(1, w)) * Math.PI * 2;
          const naturalSwell =
            1 +
            SWELL_VARIATION *
              (0.72 + peak * 0.5) *
              (0.52 *
                Math.sin(
                  swellPhase * (0.85 + layer.lambdaFrac) -
                    layerT * (SWELL_DRIFT + layer.swellSpeed) +
                    layer.offset,
                ) +
                0.32 *
                  Math.sin(
                    swellPhase * (1.9 - layer.lambdaFrac * 0.5) +
                      layerT * (SWELL_DRIFT * 0.8 + layer.swellSpeed * 0.6) -
                      layer.offset,
                  ) +
                0.16 * Math.sin(swellPhase * 3.2 - layerT * SWELL_DRIFT * 1.6));
          const waveShape =
            Math.sin(ph) +
            (0.2 + chop) * Math.sin(2 * ph + 1.3 + layerT * layer.swellSpeed) +
            chop * 0.64 * Math.sin(3 * ph - 0.8 - layerT * layer.swellSpeed * 1.5);
          const y =
            y0 -
            rise * g * layer.ampScale +
            amp * naturalSwell * (1 + CHURN_LIFT * g) * waveShape;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.globalAlpha = layer.alpha * (0.85 + peak * 0.35);
        ctx.fillStyle = accent;
        ctx.fill();
        if (layer.ridge) {
          ctx.globalAlpha = 0.42 + peak * 0.28;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.35 + peak * 0.65;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      drawFrame(0);
      return () => ro.disconnect();
    }

    let raf = 0;
    let last = performance.now();
    let flowT = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);

    const loop = (tms: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (tms - last) / 1000);
      last = tms;
      if (!visible || w === 0) return;
      const p = pointer.current;
      const peak = Math.min(1, Math.pow(actRef.current, 1.25) * (overlapRef.current ? 1.12 : 1));
      // Ease the churn field toward the pointer; decay it after leave. Slow
      // constants on purpose — the water should follow the cursor like a
      // current, not snap to it.
      p.x += (p.targetX - p.x) * Math.min(1, dt * 4.5);
      p.energy += ((p.hover ? 1 : 0) - p.energy) * Math.min(1, dt * 1.8);
      // Uniform flow: hovering quickens the whole sea, never one spot.
      flowT += dt * (1 + PEAK_FLOW * peak + FLOW_BOOST * p.energy);
      drawFrame(flowT);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  const tidePct = Math.round(scene.activity * 100);

  return (
    <section
      // Full bleed to the VIEWPORT, not just to the content column: the hero
      // breaks out of the 1700px shell so the water reaches both screen edges
      // on any display. `mx-[calc(50%-50vw)]` re-centres a 100vw box inside a
      // centred parent; AppShell's overflow-x-clip absorbs the scrollbar.
      // Everything below the hero returns to the normal page inset.
      className="hero-block relative mx-[calc(50%-50vw)] mt-2 w-[100vw] overflow-hidden"
      aria-label="Market session clock"
    >
      {/* Tide gauge — scoped to the hero block, so no gutter is reserved
          anywhere else on the page. Fills to the current tide height. */}
      <div className="tide-gauge" aria-hidden="true">
        <span className="tide-gauge-label">
          {scene.tideWord} · {(scene.activity).toFixed(2)}
        </span>
        <div className="tide-gauge-fill" style={{ height: `${Math.max(6, tidePct)}%` }} />
      </div>

      <div className="relative z-10 pr-5 pt-7 sm:pt-8 lg:pr-10">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent">
          {scene.dominantName ? `${scene.dominantName} · ` : ""}
          {scene.tideWord}
        </p>
        <h2 className="font-display mt-3 max-w-[22ch] text-[28px] font-semibold leading-[1.1] tracking-tight sm:text-[34px]">
          {scene.title}
        </h2>
        <p className="mt-2.5 max-w-[56ch] text-sm leading-relaxed text-muted">{scene.sub}</p>

        {/* Session row — each session in its own lane colour when awake, and
            the board filter: tapping one narrows the markets list to it. */}
        <div className="mt-5 flex flex-wrap gap-x-2 gap-y-1.5" role="group" aria-label="Filter by session">
          {scene.sessions.map((s) => {
            const isSel = selected === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onSelect(isSel ? null : s.id)}
                aria-pressed={isSel}
                title={isSel ? `Clear the ${s.name} filter` : `Show only ${s.name} assets`}
                className={`-ml-2 flex min-h-[30px] items-center gap-2 rounded-full px-2.5 text-[11px] transition-colors first:ml-0 ${
                  isSel
                    ? "bg-surface2 text-text"
                    : s.isOpen
                      ? "text-text hover:bg-surface2"
                      : "text-dim hover:bg-surface2 hover:text-muted"
                }`}
              >
                <span
                  className={`h-[7px] w-[7px] shrink-0 rounded-full ${s.isOpen ? "pulse-dot" : ""}`}
                  style={
                    s.isOpen
                      ? {
                          backgroundColor: s.color,
                          boxShadow: `0 0 0 3px color-mix(in srgb, ${s.color} 18%, transparent)`,
                        }
                      : { backgroundColor: "#2b3438" }
                  }
                />
                {s.name}
                {s.detail && <span className={isSel ? "text-muted" : "text-dim"}>· {s.detail}</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <button
            onClick={openAbout}
            className="text-[13px] text-muted underline decoration-muted/40 underline-offset-4 transition-colors hover:text-text"
          >
            Take the 60-second tour
          </button>
          {selected && (
            <button
              onClick={() => onSelect(null)}
              className="text-[13px] text-dim underline decoration-dim/40 underline-offset-4 transition-colors hover:text-text"
            >
              Clear session filter
            </button>
          )}
        </div>
      </div>

      {/* The sea — bleeds past the gauge on the left and the page edge on the
          right, so the water reads as the page's own surface. */}
      <div
        className="relative ml-[calc(var(--hero-gutter)*-1)] mt-4 h-[104px] cursor-crosshair sm:h-[124px]"
        onPointerMove={(e) => {
          const rect =
            rectRef.current ?? (rectRef.current = e.currentTarget.getBoundingClientRect());
          pointer.current.targetX = e.clientX - rect.left;
          pointer.current.hover = true;
        }}
        onPointerLeave={() => {
          pointer.current.hover = false;
          rectRef.current = null;
        }}
      >
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      </div>
    </section>
  );
}
