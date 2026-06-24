"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CUSTOM_STOCK_CAP,
  DEFAULT_CHART_ASSET,
  type CustomAsset,
  type Market,
} from "./assets";
import type { SessionId } from "./sessions";
import {
  DEFAULT_PANEL_PREFS,
  PRESETS_BY_ID,
  presetAfterUserEdit,
  seedWatchlist,
  type ActivePreset,
  type PresetId,
  type PresetPanelPrefs,
} from "./presets";

/** Result of trying to track a custom asset, so the UI can toast on a cap hit. */
export interface AddCustomResult {
  ok: boolean;
  reason?: string;
}

interface OpentideState {
  watchlist: string[]; // asset ids, e.g. "crypto:BTC"
  toggleWatch: (id: string) => void;
  isWatched: (id: string) => boolean;

  /** Metadata for non-curated assets the user added from universal search,
   *  keyed by id. Lets watchlist surfaces render/quote/chart them. */
  customAssets: Record<string, CustomAsset>;
  /** Register a custom asset and star it. Enforces the custom-stock cap. */
  addCustomAsset: (asset: CustomAsset) => AddCustomResult;

  marketFilter: Market | "all";
  setMarketFilter: (m: Market | "all") => void;

  sessionFilter: SessionId | null;
  setSessionFilter: (s: SessionId | null) => void;

  /** Trader-profile presets (see lib/presets.ts + docs/TRADER_PRESETS_PLAN.md). */
  activePreset: ActivePreset; // preset id, "custom" once diverged, null = full board
  presetChosen: boolean; // has the first-run picker been answered (pick or skip)?
  panelPrefs: PresetPanelPrefs; // persona panel order/visibility (Phase 3 reads it)
  /** Apply a preset: writes filter/asset/panel fields and seeds the watchlist
   *  (additive by default; replaceWatchlist swaps it for the persona's seed). */
  applyPreset: (id: PresetId, opts?: { replaceWatchlist?: boolean }) => void;
  /** Dismiss the first-run picker without a persona (keep the full board). */
  skipPreset: () => void;
  /** Return to the unfiltered full board: clear filters/panel prefs + preset,
   *  but keep the watchlist. Used by the "Full board" switcher option. */
  clearPreset: () => void;

  selectedAsset: string;
  setSelectedAsset: (id: string) => void;

  /** asset shown in the overlay chart modal (subpages), null = closed */
  modalAsset: string | null;
  openModal: (id: string) => void;
  closeModal: () => void;

  /** ⌘K command palette — global, never persisted */
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;

  heroDismissed: boolean;
  dismissHero: () => void;

  /** "What is Opentide" tour modal — opt-in, never auto-opened */
  aboutOpen: boolean;
  openAbout: () => void;
  closeAbout: () => void;
  /** persisted: has the user ever opened the tour? drives the header hint dot */
  aboutSeen: boolean;

  /** local date (YYYY-MM-DD) the daily briefing was last collapsed/read */
  briefingReadDate: string | null;
  setBriefingReadDate: (d: string | null) => void;

  /**
   * Per-day briefing engagement, e.g. { "2026-06-11": { read: 1, reopen: 2 } }.
   * Kept to the last 60 days. Gates the watchlist-digest step on the roadmap:
   * if we aren't reading the briefing ourselves, don't build more into it.
   */
  briefingStats: Record<string, { read: number; reopen: number }>;
  trackBriefing: (date: string, ev: "read" | "reopen") => void;

  useUTC: boolean;
  toggleUTC: () => void;

  /** Morning digest view mode — collapses dashboard to watchlist-only ritual */
  digestMode: boolean;
  setDigestMode: (on: boolean) => void;

  /** Notification preferences */
  notifPrefs: {
    enabled: boolean;
    sessionAlerts: boolean;
    calendarAlerts: boolean;
    /** watchlist >=3% move alerts (push only) */
    watchlistAlerts: boolean;
    leadMinutes: number;
  };
  setNotifPrefs: (prefs: Partial<OpentideState["notifPrefs"]>) => void;
}

export const useStore = create<OpentideState>()(
  persist(
    (set, get) => ({
      watchlist: [],
      toggleWatch: (id) =>
        set((s) => {
          // Editing the watchlist diverges from a clean preset → mark "custom".
          const activePreset = presetAfterUserEdit(s.activePreset);
          if (!s.watchlist.includes(id)) {
            return { watchlist: [...s.watchlist, id], activePreset };
          }
          // Un-starring: drop the id and, if it was a custom asset, forget its
          // metadata too so the registry can't accumulate orphans.
          const watchlist = s.watchlist.filter((x) => x !== id);
          if (s.customAssets[id]) {
            const next = { ...s.customAssets };
            delete next[id];
            return { watchlist, customAssets: next, activePreset };
          }
          return { watchlist, activePreset };
        }),
      isWatched: (id) => get().watchlist.includes(id),

      customAssets: {},
      addCustomAsset: (asset) => {
        const s = get();
        if (s.watchlist.includes(asset.id)) return { ok: true };
        if (asset.market === "stocks") {
          const tracked = s.watchlist.filter(
            (id) => s.customAssets[id]?.market === "stocks",
          ).length;
          if (tracked >= CUSTOM_STOCK_CAP) {
            return {
              ok: false,
              reason: `You can track up to ${CUSTOM_STOCK_CAP} custom stocks. Remove one first.`,
            };
          }
        }
        set({
          customAssets: { ...s.customAssets, [asset.id]: asset },
          watchlist: [...s.watchlist, asset.id],
          activePreset: presetAfterUserEdit(s.activePreset),
        });
        return { ok: true };
      },

      marketFilter: "all",
      setMarketFilter: (m) =>
        set((s) => ({
          marketFilter: m,
          activePreset: presetAfterUserEdit(s.activePreset),
        })),

      sessionFilter: null,
      setSessionFilter: (sess) =>
        set((s) => ({
          sessionFilter: sess,
          activePreset: presetAfterUserEdit(s.activePreset),
        })),

      activePreset: null,
      presetChosen: false,
      panelPrefs: DEFAULT_PANEL_PREFS,
      applyPreset: (id, opts) =>
        set((s) => {
          const preset = PRESETS_BY_ID[id];
          if (!preset) return {};
          const { watchlist, customAssets } = seedWatchlist(
            s.watchlist,
            s.customAssets,
            preset,
            opts?.replaceWatchlist ?? false,
          );
          // Note: writes the underlying fields directly (not via their setters),
          // so this does NOT trip the custom-drift guards — applying a preset
          // is the clean state, not a divergence from it.
          return {
            watchlist,
            customAssets,
            marketFilter: preset.marketFilter,
            sessionFilter: preset.sessionFilter,
            selectedAsset: preset.selectedAsset,
            panelPrefs: preset.panelPrefs,
            activePreset: id,
            presetChosen: true,
          };
        }),
      skipPreset: () => set({ presetChosen: true, activePreset: null }),
      clearPreset: () =>
        set({
          activePreset: null,
          presetChosen: true,
          marketFilter: "all",
          sessionFilter: null,
          panelPrefs: DEFAULT_PANEL_PREFS,
        }),

      selectedAsset: DEFAULT_CHART_ASSET,
      setSelectedAsset: (id) => set({ selectedAsset: id }),

      modalAsset: null,
      openModal: (id) => set({ modalAsset: id }),
      closeModal: () => set({ modalAsset: null }),

      paletteOpen: false,
      openPalette: () => set({ paletteOpen: true }),
      closePalette: () => set({ paletteOpen: false }),
      togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),

      heroDismissed: false,
      dismissHero: () => set({ heroDismissed: true }),

      aboutOpen: false,
      openAbout: () => set({ aboutOpen: true, aboutSeen: true }),
      closeAbout: () => set({ aboutOpen: false }),
      aboutSeen: false,

      briefingReadDate: null,
      setBriefingReadDate: (d) => set({ briefingReadDate: d }),

      briefingStats: {},
      trackBriefing: (date, ev) =>
        set((s) => {
          const day = s.briefingStats[date] ?? { read: 0, reopen: 0 };
          const next = {
            ...s.briefingStats,
            [date]: { ...day, [ev]: day[ev] + 1 },
          };
          // YYYY-MM-DD sorts chronologically as strings; drop oldest past 60
          const keys = Object.keys(next).sort();
          while (keys.length > 60) delete next[keys.shift()!];
          return { briefingStats: next };
        }),

      useUTC: false,
      toggleUTC: () => set((s) => ({ useUTC: !s.useUTC })),

      digestMode: false,
      setDigestMode: (on) => set({ digestMode: on }),

      notifPrefs: {
        enabled: false,
        sessionAlerts: true,
        calendarAlerts: true,
        watchlistAlerts: false,
        leadMinutes: 15,
      },
      setNotifPrefs: (prefs) =>
        set((s) => ({ notifPrefs: { ...s.notifPrefs, ...prefs } })),
    }),
    {
      name: "opentide",
      partialize: (s) => ({
        watchlist: s.watchlist,
        customAssets: s.customAssets,
        useUTC: s.useUTC,
        heroDismissed: s.heroDismissed,
        aboutSeen: s.aboutSeen,
        briefingReadDate: s.briefingReadDate,
        briefingStats: s.briefingStats,
        selectedAsset: s.selectedAsset,
        notifPrefs: s.notifPrefs,
        activePreset: s.activePreset,
        presetChosen: s.presetChosen,
        panelPrefs: s.panelPrefs,
      }),
    }
  )
);
