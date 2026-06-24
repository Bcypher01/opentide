# Trader-Profile Presets — Plan

> Goal: a one-tap, skippable persona picker that arranges the existing surface
> around the market a trader actually works — the lightest possible "guided
> first run." This is IDEAS.md #11, and it directly answers Open Question #2 in
> `USER_STORY_REVAMP_PLAN.md` (is a first-run mode worth the complexity?).
> Efficiency thesis: **reuse the store fields that already drive the UI**
> (`marketFilter`, `sessionFilter`, `selectedAsset`, `watchlist`) so a preset is
> mostly a *write* of existing levers, not a new rendering layer. No new API
> routes, so the `CLAUDE.md` rate-limit rule has no surface here.

---

## 1. The core idea (and why it's cheap)

A preset is **not a mode and not a live merge layer.** It's a one-shot action
that writes a bundle of config into the store fields the dashboard already reads.
The moment the user tweaks anything afterwards (stars an asset, changes the market
filter), they're just mutating those same fields — which *is* "custom," for free,
with zero extra machinery. `activePreset` is only a breadcrumb/label.

This avoids the expensive version of presets (a `merge(preset, overrides)`
computed every render) and reuses all existing wiring.

```
applyPreset("london-fx")  →  sets marketFilter="forex",
                              sessionFilter/highlight="london",
                              selectedAsset="forex:EUR/USD",
                              seeds watchlist with FX majors (non-destructive),
                              sets panelPrefs (order/hidden),
                              activePreset="london-fx"
user then stars USD/JPY    →  normal toggleWatch; activePreset→"custom"
```

---

## 2. The four presets (static config)

`src/lib/presets.ts` — one array, each entry a plain object. No logic, just data.

| Preset | Lead market | Session focus | Seed watchlist | Default asset | Emphasized panels |
|---|---|---|---|---|---|
| **London FX scalper** | forex | London (+ NY overlap countdown) | EUR/USD, GBP/USD, USD/JPY, EUR/GBP | EUR/USD | session stats, calendar, derivs off |
| **NY equities** | stocks | New York | NVDA, AAPL, MSFT, META | NVDA | movers, calendar, macro panel |
| **Crypto 24/7** | crypto | none (always-on) | BTC, ETH, SOL | BTC | derivs (funding/OI), crypto heatmap |
| **Swing** | all | none | EUR/USD, BTC, NVDA | EUR/USD | calendar, macro/yields, risk dial |

Asset ids follow the existing scheme (`forex:EUR/USD`, `crypto:BTC`,
`stocks:AAPL`); sessions use existing `SessionId`s (`london`, `newyork`, …).
Seeds use only curated assets that exist in `assets.ts` — DXY, SPY and QQQ
aren't in the universe, so the original sketch was swapped for real tickers.
Chart *timeframe* is not set in v1 (§9.2) — presets set the asset only.

---

## 3. State changes (minimal)

Extend `OpentideState` in `store.ts`:

```ts
activePreset: PresetId | "custom" | null;   // breadcrumb only
presetChosen: boolean;                       // gates the first-run picker
applyPreset: (id: PresetId) => void;         // writes existing fields + seeds
panelPrefs: { order: PanelId[]; hidden: PanelId[] };  // see §5, optional/Phase 3
```

- `applyPreset` seeds the watchlist **additively** (merge, never clobber) on first
  apply; mark `activePreset`.
- Flip `activePreset → "custom"` inside the existing mutators (`toggleWatch`,
  `setMarketFilter`, …) when a preset is active. One-line guard each.
- Add `activePreset`, `presetChosen`, `panelPrefs` to `partialize` so they persist
  in the existing `"opentide"` localStorage key. Losing them costs one tap — fine.

---

## 4. The flows (mapped to surfaces)

**First run (Persona A).** When `!presetChosen`, the first paint shows a
`PresetPicker` above the board: "What do you trade?" — four cards + a quiet
**"Skip → full board."** Picking calls `applyPreset` and sets `presetChosen=true`;
Skip sets `presetChosen=true`, `activePreset=null`. Shown once, ever. This is the
guided first-run from §Open-Question-2 — and it makes starring's payoff visible
(§1.3 of the user-story plan) because the watchlist is pre-seeded, so `AiInsights`
personalizes from second one.

**Return (Persona B).** Nothing re-seeds. The persisted fields mean the board is
exactly where they left it; "Since you left" already reads `watchlist`.

**Switch later (Persona C).** A small segmented switcher (header) + a
`CommandPalette` entry call `applyPreset`. On a *later* switch, seeding the
watchlist is opt-in — prompt "Replace watchlist with this persona's? / Keep mine"
rather than silently overwriting curated stars.

---

## 5. Panel ordering — defer if needed

Reordering/hiding dashboard panels (`panelPrefs`) is the only heavyweight part.
**Ship without it first:** presets that set `marketFilter` + `sessionFilter` +
`selectedAsset` + seed watchlist already deliver ~80% of the felt value using
zero net-new rendering. Add `panelPrefs` (a sort + filter over the existing panel
list in `Dashboard.tsx`) in Phase 3 only if the picker proves out.

---

## 6. Phased roadmap (value-first)

**Phase 0 — Config + store (no UI). ✅ SHIPPED.** `src/lib/presets.ts` (the four
configs + pure `seedWatchlist`/`presetAfterUserEdit` helpers) and the store slice
(`activePreset`, `presetChosen`, `panelPrefs`, `applyPreset`, `skipPreset`, plus
custom-drift guards in `toggleWatch`/`addCustomAsset`/`setMarketFilter`/
`setSessionFilter`, persisted via `partialize`). Verified: 5 unit checks pass and
`tsc --noEmit` is clean. Nothing user-visible yet.

**Phase 1 — First-run picker (the payoff). ✅ SHIPPED.** `PresetPicker.tsx`
gated on `!presetChosen` with a Skip link, mounted above the board in
`Dashboard.tsx` (it takes the Hero's first-run slot and dismisses the Hero on
resolve, so first-run is a single inline surface alongside the existing About
tour). Picking calls `applyPreset` (additive seed); Skip calls `skipPreset`.

**Phase 2 — Reversibility. ✅ SHIPPED.** `PresetSwitcher.tsx` in the header
(shows the active persona / "Custom" / "Full board") with the Replace / Keep-mine
prompt on switches when a watchlist exists; "Full board" calls `clearPreset`.
Palette entries added via `searchPresets` (a new `preset` result kind/action) —
type a persona name, synonym ("degen", "scalper") or "preset"/"profile" and apply
it from ⌘K; palette applies additively (lossless), so no prompt there.

**Phase 3 — Panel layout. ✅ SHIPPED.** `resolvePanelLayout` orders/hides the
movers + derivs panels in `Dashboard.tsx` per `panelPrefs` (Crypto 24/7 surfaces
derivs first; London FX hides them). The remaining `PanelId`s (sessionStats,
macro, heatmap, riskDial) live on `/markets` and stay forward-looking config.

**Verification.** 7 unit checks pass (seed validity, additive/replace/dedupe,
drift, panel layout, palette search) and `tsc --noEmit` is clean. `next lint`
can't run in this environment (it bus-errors and ESLint isn't installed
standalone) — run `npm run lint` locally before shipping.

---

## 7. How we'll know it worked

Reuse the Phase-0 instrumentation from the user-story plan (`@vercel/analytics`):

- **Adoption:** % of first sessions that pick a persona vs. Skip.
- **Activation lift:** chart-opened + ≥1 star, persona cohort vs. Skip cohort.
- **Reversibility health:** switcher usage; rate of "custom" drift (healthy = people
  make it theirs).

Run Phase 1 as a staged rollout against the current "drop them into the full
board" baseline, consistent with the user-story plan's A/B posture.

---

## 8. Non-goals / guardrails

- **No accounts.** Presets are localStorage; losing one is a one-tap re-pick. This
  is the reason presets are safe to ship *now* and the journal (#14) is not.
- **Never tax veterans.** Skip link on the picker; first-run only; full density
  preserved. (Honors the user-story plan's §7.)
- **Never clobber a curated watchlist.** Seed additively on first apply; prompt on
  later switches.
- **No new API routes** → no rate-limit surface, no `CLAUDE.md` obligation. If any
  route is later added (it shouldn't be), it must enforce rate limiting.

---

## 9. Decisions (resolved)

1. **Later preset switch → "Replace / Keep mine" prompt** (the default). Never
   silently overwrite a curated watchlist; first-apply still seeds additively.
2. **Skip chart-timeframe wiring in v1.** Charts open at the TradingView default;
   presets only set the *asset*, not the timeframe. Revisit later if asked for.
3. **Four presets is enough** — London FX scalper, NY equities, Crypto 24/7,
   Swing. No fifth for now.
