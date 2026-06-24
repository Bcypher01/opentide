import type { Market } from "./assets";
import type { SessionId } from "./sessions";

/**
 * Trader-profile presets (IDEAS.md #11). A preset is a one-shot bundle of config
 * written into the store fields that already drive the UI (`marketFilter`,
 * `sessionFilter`, `selectedAsset`, `watchlist`) — not a live merge layer. The
 * moment the user tweaks anything afterward they're mutating those same fields,
 * which is "custom" for free. See docs/TRADER_PRESETS_PLAN.md.
 */

export type PresetId = "london-fx" | "ny-equities" | "crypto-247" | "swing";

/** Active-persona breadcrumb: a preset id, "custom" once the user diverges,
 *  or null for the full board (skipped / never chosen). */
export type ActivePreset = PresetId | "custom" | null;

/** Dashboard panels a preset can emphasize or hide. Phase 3 wires the ordering
 *  into Dashboard.tsx; until then this is persisted-but-unread config. */
export type PanelId =
  | "sessionStats"
  | "calendar"
  | "derivs"
  | "movers"
  | "macro"
  | "heatmap"
  | "riskDial";

export interface PresetPanelPrefs {
  /** panels to surface first, in order */
  order: PanelId[];
  /** panels to hide for this persona */
  hidden: PanelId[];
}

export interface TraderPreset {
  id: PresetId;
  /** card title in the picker */
  label: string;
  /** one-line description shown under the title */
  blurb: string;
  marketFilter: Market | "all";
  /** session the clock highlights; null = no single focus (always-on / swing) */
  sessionFilter: SessionId | null;
  /** asset the chart opens on (timeframe is left at the TradingView default in v1) */
  selectedAsset: string;
  /** curated asset ids seeded into the watchlist on first apply */
  seedWatchlist: string[];
  panelPrefs: PresetPanelPrefs;
}

export const PRESETS: TraderPreset[] = [
  {
    id: "london-fx",
    label: "London FX scalper",
    blurb: "Majors around the London session and the New York overlap.",
    marketFilter: "forex",
    sessionFilter: "london",
    selectedAsset: "forex:EUR/USD",
    seedWatchlist: [
      "forex:EUR/USD",
      "forex:GBP/USD",
      "forex:USD/JPY",
      "forex:EUR/GBP",
    ],
    panelPrefs: { order: ["sessionStats", "calendar"], hidden: ["derivs"] },
  },
  {
    id: "ny-equities",
    label: "NY equities",
    blurb: "US large caps, the New York session, macro on the clock.",
    marketFilter: "stocks",
    sessionFilter: "newyork",
    selectedAsset: "stocks:NVDA",
    seedWatchlist: ["stocks:NVDA", "stocks:AAPL", "stocks:MSFT", "stocks:META"],
    panelPrefs: { order: ["movers", "calendar", "macro"], hidden: [] },
  },
  {
    id: "crypto-247",
    label: "Crypto 24/7",
    blurb: "Always-on crypto with funding, open interest and the heatmap.",
    marketFilter: "crypto",
    sessionFilter: null,
    selectedAsset: "crypto:BTC",
    seedWatchlist: ["crypto:BTC", "crypto:ETH", "crypto:SOL"],
    panelPrefs: { order: ["derivs", "heatmap"], hidden: [] },
  },
  {
    id: "swing",
    label: "Swing",
    blurb: "Cross-market dailies — calendar, macro and the risk dial.",
    marketFilter: "all",
    sessionFilter: null,
    selectedAsset: "forex:EUR/USD",
    seedWatchlist: ["forex:EUR/USD", "crypto:BTC", "stocks:NVDA"],
    panelPrefs: { order: ["calendar", "macro", "riskDial"], hidden: [] },
  },
];

export const PRESETS_BY_ID = Object.fromEntries(
  PRESETS.map((p) => [p.id, p]),
) as Record<PresetId, TraderPreset>;

export const DEFAULT_PANEL_PREFS: PresetPanelPrefs = { order: [], hidden: [] };

/**
 * Pure watchlist seeding, factored out of the store so it's unit-testable
 * without zustand/DOM.
 * - replace=false (default): additive merge — never clobbers curated stars.
 * - replace=true: swap in the seed and prune orphaned custom-asset metadata,
 *   mirroring how toggleWatch avoids leaving registry orphans.
 */
export function seedWatchlist<C>(
  current: string[],
  customAssets: Record<string, C>,
  preset: TraderPreset,
  replace: boolean,
): { watchlist: string[]; customAssets: Record<string, C> } {
  if (replace) {
    const watchlist = [...preset.seedWatchlist];
    const pruned: Record<string, C> = {};
    for (const k of Object.keys(customAssets)) {
      if (watchlist.includes(k)) pruned[k] = customAssets[k];
    }
    return { watchlist, customAssets: pruned };
  }
  const watchlist = [...current];
  for (const id of preset.seedWatchlist) {
    if (!watchlist.includes(id)) watchlist.push(id);
  }
  return { watchlist, customAssets };
}

/** State transition for `activePreset` when the user edits a preset-controlled
 *  field: a concrete preset becomes "custom"; "custom"/null are unchanged. */
export function presetAfterUserEdit(active: ActivePreset): ActivePreset {
  return active && active !== "custom" ? "custom" : active;
}

/**
 * Resolve the render order of a fixed set of dashboard panels under a preset's
 * panelPrefs: drop hidden panels, surface `order`-listed ones first (in that
 * order), and keep the rest in their default order. Pure, so it's unit-testable
 * and the Dashboard just maps over the result.
 */
export function resolvePanelLayout(
  defaults: PanelId[],
  prefs: PresetPanelPrefs,
): PanelId[] {
  const hidden = new Set(prefs.hidden);
  const visible = defaults.filter((p) => !hidden.has(p));
  return [...visible].sort((a, b) => {
    const ia = prefs.order.indexOf(a);
    const ib = prefs.order.indexOf(b);
    if (ia === -1 && ib === -1) return visible.indexOf(a) - visible.indexOf(b);
    if (ia === -1) return 1; // unlisted panels fall after listed ones
    if (ib === -1) return -1;
    return ia - ib;
  });
}
