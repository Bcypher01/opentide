"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  formatCountdown,
  getAllSessionStates,
  type SessionState,
} from "@/lib/sessions";
import { useStore } from "@/lib/store";
import { getTideReading } from "@/lib/tide";
import { IconCandles, IconClock, IconZap } from "./Icons";

interface Props {
  onDismiss: () => void;
}

const FEATURES = [
  { icon: IconClock, label: "Live session clock" },
  { icon: IconZap, label: "Asset-tagged newswire" },
  { icon: IconCandles, label: "One-tap charts" },
];

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

export default function Hero({ onDismiss }: Props) {
  const openAbout = useStore((s) => s.openAbout);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pointer + churn state lives in refs: the animation reads it every frame
  // without a single React re-render.
  const pointer = useRef({ x: 0, targetX: 0, energy: 0, hover: false });
  const rectRef = useRef<DOMRect | null>(null);

  // Snapshot at mount: the hero shows a handful of times to a new user, so a
  // static "now" is honest enough and costs zero subscriptions.
  const scene = useMemo(() => {
    const now = new Date();
    const states = getAllSessionStates(now);
    const open = states.filter((s) => s.isOpen);
    const next =
      states
        .filter((s) => !s.isOpen && s.opensAt)
        .sort((a, b) => (a.opensAt ?? 0) - (b.opensAt ?? 0))[0] ?? null;
    const tide = getTideReading(now);
    const activity = tide.height; // 0..1, crypto floor included
    return {
      ...headlineFor(open, next, now),
      activity,
      overlap: tide.overlap,
      tideWord: activity >= 0.6 ? "High tide" : activity >= 0.3 ? "Mid tide" : "Low tide",
      tideDetail:
        open.length > 0
          ? open.map((s) => s.def.name).join(" + ")
          : next?.opensAt
            ? `next: ${next.def.name} in ${formatCountdown(next.opensAt - now.getTime())}`
            : "crypto only",
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const accent =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-accent")
        .trim() || "#00d4aa";

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

    // Water level + base amplitude from the mount-time activity reading.
    const act = scene.activity;
    const peak = Math.min(1, Math.pow(act, 1.25) * (scene.overlap ? 1.12 : 1));
    const chop = PEAK_CHOP * peak;

    const drawFrame = (flowT: number) => {
      const p = pointer.current;
      const level = (46 + (1 - act) * 74) * (h / 150);
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
  }, [scene.activity, scene.overlap]);

  return (
    <section
      className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-bg"
      aria-label="What is Opentide"
    >
      <button
        onClick={onDismiss}
        aria-label="Dismiss intro"
        className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface2 hover:text-text"
      >
        ✕
      </button>

      {/* Sky: live generated headline */}
      <div className="relative z-10 px-5 pt-7 sm:px-8 sm:pt-9">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
          Every market · Every session · Free
        </p>
        <h2 className="font-display mt-2.5 max-w-3xl text-[26px] font-semibold leading-[1.12] tracking-tight sm:text-4xl">
          {scene.title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-[15px]">{scene.sub}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={onDismiss}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
          >
            Show me the markets →
          </button>
          <button
            onClick={openAbout}
            className="rounded-lg border border-border bg-surface2 px-5 py-2.5 text-sm text-muted transition-colors hover:border-accent/40 hover:text-text"
          >
            Take the 60-second tour
          </button>
        </div>
      </div>

      {/* The sea */}
      <div
        className="relative mt-6 h-[120px] cursor-crosshair sm:h-[150px]"
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

        {/* Floating on the water: features left, tide gauge right */}
        <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-2 sm:flex">
          {FEATURES.map((f) => (
            <span
              key={f.label}
              className="flex items-center gap-1.5 rounded-full border border-border bg-bg/75 px-3 py-1 text-[11px] text-muted"
            >
              <f.icon size={12} className="text-accent" />
              {f.label}
            </span>
          ))}
        </div>
        <div className="num pointer-events-none absolute bottom-3 right-3 rounded-full border border-accent/30 bg-bg/80 px-2.5 py-1 text-[10px] font-medium text-accent">
          {scene.tideWord} · {scene.tideDetail}
        </div>
      </div>
    </section>
  );
}
