"use client";

import { useStore } from "@/lib/store";
import { IconCandles, IconClock, IconZap } from "./Icons";

interface Props {
  onDismiss: () => void;
}

const STEPS = [
  {
    icon: IconClock,
    title: "Know when markets move",
    body: "The session clock shows which financial centers are awake and where the high-liquidity overlaps are — live.",
  },
  {
    icon: IconZap,
    title: "See what's moving and why",
    body: "A free newswire tagged to the exact assets it affects, across forex, crypto and stocks.",
  },
  {
    icon: IconCandles,
    title: "Chart it in one tap",
    body: "Tap any asset, mover or headline and a full chart opens instantly. No accounts, no paywall.",
  },
];

export default function Hero({ onDismiss }: Props) {
  const openAbout = useStore((s) => s.openAbout);
  return (
    <section
      className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-surface"
      aria-label="What is Opentide"
    >
      <button
        onClick={onDismiss}
        aria-label="Dismiss intro"
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface2 hover:text-text"
      >
        ✕
      </button>

      <div className="relative px-5 py-6 sm:px-8 sm:py-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
          Every market · Every session · Free
        </p>
        <h2 className="font-display mt-2 max-w-2xl text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          The market is a 24-hour tide.
          <span className="text-muted"> Opentide shows you exactly when — and what — to watch.</span>
        </h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-xl border border-border bg-bg/40 p-4">
              <s.icon size={18} className="text-accent" />
              <h3 className="mt-2 text-sm font-medium">{s.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
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
    </section>
  );
}
