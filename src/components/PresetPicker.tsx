"use client";

import { PRESETS, type PresetId } from "@/lib/presets";
import { useStore } from "@/lib/store";
import { IconActivity, IconCandles, IconClock, IconZap } from "./Icons";

type IconCmp = React.ComponentType<{ size?: number; className?: string }>;

/** Icon per persona — kept here so presets.ts stays a pure, node-testable module. */
const PRESET_ICON: Record<PresetId, IconCmp> = {
  "london-fx": IconClock,
  "ny-equities": IconCandles,
  "crypto-247": IconZap,
  swing: IconActivity,
};

/**
 * First-run persona picker (Phase 1). Shown once, when the user hasn't yet
 * answered it (`!presetChosen`). Picking applies a preset (additive seed — never
 * clobbers an existing watchlist); Skip keeps the full board. The intro Hero is
 * NOT dismissed here: answering the picker flips `presetChosen`, and the
 * Dashboard then shows the Hero (still user-dismissible) as the second step of
 * first-run — picker first, welcome story second. Calling `dismissHero()` from
 * here meant new users never saw the Hero at all.
 */
export default function PresetPicker() {
  const applyPreset = useStore((s) => s.applyPreset);
  const skipPreset = useStore((s) => s.skipPreset);

  const pick = (id: PresetId) => {
    applyPreset(id);
  };
  const skip = () => {
    skipPreset();
  };

  return (
    <section
      className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-surface"
      aria-label="Choose a trader profile"
    >
      <div className="px-5 py-6 sm:px-8 sm:py-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
          Make it yours · 1 tap
        </p>
        <h2 className="font-display mt-2 max-w-2xl text-2xl font-semibold leading-tight tracking-tight sm:text-[28px]">
          What do you trade?
          <span className="text-muted">
            {" "}
            We&apos;ll arrange the board around it.
          </span>
        </h2>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PRESETS.map((p) => {
            const Icon = PRESET_ICON[p.id];
            return (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                className="group flex flex-col rounded-xl border border-border bg-bg/40 p-4 text-left transition-colors hover:border-accent/50 hover:bg-surface2"
              >
                <Icon
                  size={18}
                  className="text-accent transition-transform group-hover:scale-110"
                />
                <h3 className="mt-2 text-sm font-medium">{p.label}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {p.blurb}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={skip}
            className="text-sm text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
          >
            Skip → show me the full board
          </button>
          <span className="text-xs text-muted/60">
            You can switch any time from the header.
          </span>
        </div>
      </div>
    </section>
  );
}
