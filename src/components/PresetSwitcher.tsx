"use client";

import { useEffect, useRef, useState } from "react";
import { PRESETS, PRESETS_BY_ID, type PresetId } from "@/lib/presets";
import { useStore } from "@/lib/store";
import { IconChevronDown } from "./Icons";

/**
 * Header persona switcher (Phase 2). Shows the active preset and lets the user
 * switch or return to the full board. Switching into a preset while a non-empty
 * watchlist exists asks Replace / Keep mine first (decision §9.1) so a curated
 * watchlist is never silently overwritten; first apply and empty watchlists go
 * straight through (additive, lossless).
 */
export default function PresetSwitcher() {
  const activePreset = useStore((s) => s.activePreset);
  const applyPreset = useStore((s) => s.applyPreset);
  const clearPreset = useStore((s) => s.clearPreset);
  const watchlistLen = useStore((s) => s.watchlist.length);

  const [open, setOpen] = useState(false);
  // When set, we're asking Replace/Keep for this pending preset switch.
  const [pending, setPending] = useState<PresetId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPending(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setPending(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label =
    activePreset && activePreset !== "custom"
      ? PRESETS_BY_ID[activePreset].label
      : activePreset === "custom"
        ? "Custom"
        : "Full board";

  const choose = (id: PresetId) => {
    if (id === activePreset) {
      setOpen(false);
      return;
    }
    // Non-empty watchlist → ask before seeding; otherwise apply additively.
    if (watchlistLen > 0) {
      setPending(id);
      return;
    }
    applyPreset(id);
    setOpen(false);
  };

  const resolvePending = (replace: boolean) => {
    if (pending) applyPreset(pending, { replaceWatchlist: replace });
    setPending(null);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Trader profile"
        className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors sm:text-sm ${
          activePreset && activePreset !== "custom"
            ? "border-accent/50 bg-accent/10 text-accent"
            : "border-border bg-surface text-muted hover:text-text"
        }`}
      >
        <span className="max-w-[7.5rem] truncate">{label}</span>
        <IconChevronDown size={14} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl bg-surface p-1 shadow-2xl"
        >
          {pending ? (
            <div className="p-3">
              <p className="text-sm font-medium text-text">
                Switch to {PRESETS_BY_ID[pending].label}?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                You have a watchlist. Replace it with this profile&apos;s assets,
                or keep yours and just rearrange the board?
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => resolvePending(false)}
                  className="flex-1 rounded-lg bg-surface2 px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-surface2"
                >
                  Keep mine
                </button>
                <button
                  onClick={() => resolvePending(true)}
                  className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-bg transition-opacity hover:opacity-90"
                >
                  Replace
                </button>
              </div>
              <button
                onClick={() => setPending(null)}
                className="mt-2 w-full rounded-lg px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-dim">
                Trader profile
              </p>
              {PRESETS.map((p) => {
                const active = p.id === activePreset;
                return (
                  <button
                    key={p.id}
                    role="menuitem"
                    onClick={() => choose(p.id)}
                    className={`flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors ${
                      active ? "bg-surface2" : "hover:bg-surface2/60"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm text-text">
                      {p.label}
                      {active && (
                        <span className="text-[10px] uppercase tracking-wide text-accent">
                          ✓
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 truncate text-xs text-muted">
                      {p.blurb}
                    </span>
                  </button>
                );
              })}
              <div className="my-1 border-t border-border" />
              <button
                role="menuitem"
                onClick={() => {
                  clearPreset();
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  !activePreset ? "bg-surface2 text-text" : "text-muted hover:bg-surface2/60 hover:text-text"
                }`}
              >
                Full board
                {!activePreset && (
                  <span className="text-[10px] uppercase tracking-wide text-accent">
                    ✓
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
