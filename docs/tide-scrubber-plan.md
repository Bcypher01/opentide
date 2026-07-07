# Liquidity Tide Scrubber — Implementation Plan

## Concept

Opentide's signature element is the session clock: four flat bands on a 24h axis. The upgrade turns it into the app's namesake — a **living tide**. The 24h axis becomes a continuous waveform where height = expected market liquidity/volatility at that moment (session envelopes summed, swelling at overlaps, amplified by real hourly volatility stats). The now-cursor becomes a **draggable playhead**: scrub it forward or back and the entire dashboard previews that moment — which sessions are open, what events are due, what the market typically does at that hour. Release (or hit "Back to now") and everything snaps back to live.

Why it works: everyone already knows how to scrub a video. It answers the question this app exists for — *"what is the market doing at time X?"* — for any X, not just now.

## Why it's cheap to build here

- `getAllSessionStates(date)` in `src/lib/sessions.ts` is a pure function of a `Date`. Preview mode = call it with the scrubbed time instead of `now`. No new session math.
- `/api/sessionstats` already fetches ~41 days of hourly Binance candles. An hour-of-day volatility profile (24 numbers) falls out of data already being downloaded — it just needs to be aggregated and exposed.
- `SessionClock.tsx` already computes `nowFrac`, session segments, and today's event markers on the same 24h axis. The scrubber reuses all of it.
- `framer-motion` and `zustand` are already dependencies (playhead spring, shared preview state).

## Architecture

```
src/lib/tide.ts            NEW  pure curve math (testable, no deps)
src/lib/previewStore.ts    NEW  zustand: { previewTime: number | null }
src/components/TideScrubber.tsx  NEW  replaces the band strip inside SessionClock
src/app/api/sessionstats/route.ts  EXTEND  add hourlyVolProfile: number[24]
src/components/Dashboard.tsx     EXTEND  effectiveNow = previewTime ?? now
```

### 1. `lib/tide.ts` — the curve

`buildTideCurve(now: Date, states: SessionState[], volProfile?: number[]): TidePoint[]`

- Sample the 24h UTC day at 15-min resolution (96 points).
- Per session: activity envelope = smoothstep ramp-up over the first 90 min after open, plateau, ramp-down over the last 90 min (matches how liquidity actually behaves; avoids square waves).
- Height at t = Σ session envelopes, each weighted by a base liquidity weight (London 1.0, NY 0.95, Tokyo 0.6, Sydney 0.4).
- If `volProfile` (from sessionstats) is present, multiply by normalized hour-of-day volatility → the wave reflects reality, not just theory.
- Also return per-point `dominant: SessionId` for gradient coloring, and `overlap: boolean` for the swell highlight.
- Weekend flattening: reuse the session windows so Sat/Sun tide goes near-zero (crypto floor ~0.15).

### 2. sessionstats extension

Add to the existing route's payload: `hourlyVolProfile: number[]` — for each UTC hour, mean high-low range % across the covered crypto assets over the sample window, normalized to max=1. No new route (existing caching + the project's rate-limiting rule stay untouched). If a separate route ever becomes necessary, it must enforce rate limiting per CLAUDE.md.

### 3. `TideScrubber.tsx`

- SVG area chart: smooth path via Catmull-Rom → cubic Bézier over the 96 points; gradient fill segments keyed to `dominant` session color at low opacity; overlap regions get an accent glow.
- Existing event markers, past-dimming, and the UTC/local toggle carry over unchanged.
- **Playhead**: pointer-event drag (mouse + touch), `requestAnimationFrame`-throttled; keyboard ← → (15 min) / shift ← → (1 h) for a11y; ARIA slider role with time announcement.
- **Snap points** (magnetic within ~10 min): session opens/closes, overlap starts, high-impact calendar events.
- While dragging: tooltip shows time (respecting `useUTC`), open sessions, tide height as "expected activity: low/med/high", next snap label.

### 4. Preview mode (Dashboard)

- `previewStore`: `previewTime: number | null`, `setPreview`, `clearPreview`.
- `Dashboard.tsx`: `const effectiveNow = previewTime ? new Date(previewTime) : now;` feed `effectiveNow` to session states, countdowns, SessionStats, and calendar "due soon" logic. **Prices stay live** — they get a subtle dim + a lock chip so nobody mistakes preview for a price forecast.
- Sticky banner while previewing: `⏪ Previewing Wed 14:30 UTC — London·NY overlap — [Back to now]`. Esc also clears.
- Auto-clear after 60 s idle so the app never gets stuck in the past.

### 5. Page-wide revamp — the whole surface answers to the tide

The scrubber is the control; every panel is a listener. One shared signal (`effectiveNow` + `isPreview`) drives:

- **Ambient session tint**: a low-alpha wash on the page background keyed to the dominant session's color (`states` → dominant by envelope weight). The app visibly "knows what time it is" even before you read anything. Implemented as a CSS variable (`--session-tint`) set on `<body>` by Dashboard; panels pick it up for header underlines and the chart backdrop.
- **Ticker tape** (`Ticker.tsx`): live = normal scroll; preview = paused + dimmed with a lock chip (prices are not time-traveled — ever).
- **Movers** (`Movers.tsx`): live = real top movers; preview = "typically most active at this hour" — ranked from the sessionstats hourly profile + session `hint` metadata (e.g. JPY pairs during Tokyo). Clearly labeled "typical", never numeric fake prices.
- **Markets & watchlist** (`PriceRow.tsx`): rows keep live prices (dimmed in preview) and gain a session-state chip at preview time: `London open`, `wakes in 2h 10m`, `closed`. Tick-flash animations pause during preview.
- **Chart panel** (`ChartPanel.tsx`): backdrop tinted by the dominant session at `effectiveNow`; "In the news" suggestions re-rank to assets tied to sessions open at that time.
- **Newswire** (`NewsFeed.tsx`): preview highlights headlines whose asset tags belong to sessions open at `effectiveNow`, dims the rest — "this is what matters at that hour".
- **Preview banner**: sticky, one instance, owned by Dashboard.

All of it derives from the two store values — no panel talks to the scrubber directly, so panels stay independently shippable.

## Phases

| Phase | Scope | Est. |
|---|---|---|
| 1 | `lib/tide.ts` + unit sanity checks (overlap swells > singles, weekend flat, DST day) | 0.5 d |
| 2 | `TideScrubber` static render behind `NEXT_PUBLIC_TIDE=1` flag; live playhead, no drag | 1 d |
| 3 | Drag + previewStore + Dashboard preview mode + banner | 1 d |
| 4 | sessionstats `hourlyVolProfile` + wave amplitude wiring; snap points; mobile touch pass | 1 d |
| 5 | Page-wide propagation: ambient tint, ticker pause, movers "typical" mode, price-row session chips, chart tint, newswire highlighting | 1.5 d |
| 6 | Polish: framer-motion wave morph on data load, memo/rAF perf, skeleton, a11y audit, remove flag | 0.5 d |

Total ≈ 5.5 days. Each phase ships independently; the app is never broken in between.

## Risks & guardrails

- **Misreading preview as prediction** → prices dim + lock chip; wave labeled "typical activity", never price.
- **Perf** (96-pt SVG + drag re-renders) → curve memoized on (day, volProfile); drag updates only playhead + tooltip via rAF; preview propagation debounced 150 ms.
- **DST edges** → curve built from the same `zoneOffsetMinutes` windows as the clock; add a DST-transition-day test.
- **Mobile** → drag handle ≥ 44px hit area; scrubber takes vertical-drag precedence only when horizontal intent detected (8px slop).

## Mockup

`docs/tide-scrubber-mockup.html` — self-contained full-page mockup using the app's design tokens: ticker tape → tide scrubber → movers → three columns (markets | chart | newswire). Drag the playhead (or arrow keys) and watch the whole page enter preview mode: ambient session tint, paused ticker, "typically active now" movers, session chips on price rows, chart backdrop, newswire highlighting. "Back to now" or Esc returns to live.
