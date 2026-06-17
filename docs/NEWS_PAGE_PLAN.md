# Opentide — Making the Newswire (`/news`) easier to navigate

Goal: keep the thing you love — **every story tagged to the market and assets it
affects** — but make that connection *obvious* and turn the page into something
you can actually navigate, filter and come back to. ForexFactory is the
reference point: its whole value is that you can slice a firehose down to
"only what moves the pairs I trade" in two clicks (currency + impact filters),
and every row tells you at a glance *what it touches and how much it matters*.

This plan is grounded in the current code, not generic advice:

- Page: `src/app/news/page.tsx` (client component, polls `/api/news` every 5 min)
- Shared list: `src/components/NewsFeed.tsx` (also used on the dashboard)
- API: `src/app/api/news/route.ts` → returns `{ items: NewsItem[], trending: {id,count}[] }`
- Tagging engine: `src/lib/assets.ts` (`tagAssets()`, `ASSET_BY_ID`, 38 assets across forex/crypto/stocks)
- Adjacent surfaces that share `NewsItem`: `Dashboard.tsx`, `ChartModal.tsx`, `DailyBriefing.tsx`, `DigestView.tsx`, `EconCalendar.tsx`

---

## TL;DR — what's wrong and the fix

| Symptom (today) | Root cause | Fix | Phase |
|---|---|---|---|
| "Markets → their news" is the best feature but invisible | It only exists as the small **"Dominating the wire"** sidebar widget; the main column is one flat, undifferentiated stream | Make market/asset the *primary* axis: filterable, groupable, and clicking an asset filters the wire (not just opens a chart) | 1–2 |
| Tabs only filter by **market** (All/Forex/Crypto/Stocks) | No per-asset filter | Add an **asset/currency filter** like FF's currency picker; clicking any tag filters in-place | 2 |
| No sense of *importance* — every headline looks equal | `NewsItem` has no relevance/impact score | Add a lightweight **relevance score** + color weight (FF's red/orange/yellow analogue) | 3 |
| Can't search, can't bookmark a view | No search box; filter state lives only in `useState` | Add **search** + sync filters to the **URL** (`?market=&asset=&q=`) | 2–3 |
| One long undated list | No time grouping | **"New / Today / Earlier"** day separators | 1 |
| Sidebar (the good part) disappears on mobile | `lg:col-span-3` stacks below a long list | Move filters into a **sticky bar**; make trending a horizontal strip on mobile | 1 |
| Asset tags capped at 4, no weight | Display-only choice in `page.tsx` | Show a **+N** overflow and rank tags by relevance | 2 |

---

## Design principles (the ForexFactory lessons)

1. **The filter is the feature.** FF's calendar is overwhelming until you set
   "Red only + USD" — then it's indispensable. Our equivalent: market + asset +
   source + recency, always visible, two clicks to a focused view.
2. **Every row self-describes.** FF row = flag + event + impact dot + actual/forecast.
   Our row should = market dot + source + **age** + **ranked asset tags** + a
   **relevance weight**. No row should require a click to understand what it touches.
3. **One obvious primary axis.** FF's is currency. Ours should be
   **market → asset**, surfaced as the page's spine, not a sidebar afterthought.
4. **State is shareable.** A filtered FF view lives in the URL. Ours should too,
   so a view ("EUR/USD + FXStreet, last 6h") can be bookmarked and reopened.

---

## Target layout (wireframe)

```
┌────────────────────────────────────────────────────────────────────┐
│  Newswire                                          [⌕ search……… ]    │  ← header + search
├────────────────────────────────────────────────────────────────────┤
│  STICKY FILTER BAR                                                   │
│  [All][Forex][Crypto][Stocks]   Impact:[All][High]   Sort:[New▼]    │
│  Assets: (EUR/USD ×)(BTC ×)  + add…      Sources ▾    [Clear]        │  ← FF-style filters
├──────────────────────────────────────────────┬─────────────────────┤
│  ── NEW (last 30 min) ───────────────────     │  DOMINATING THE WIRE │
│  ● FXStreet · 4m · ◖high◗                      │  EUR/USD   ▇▇▇▇  12  │  ← clicking a row
│    ECB holds rates, signals…                   │  BTC       ▇▇▇    8  │     here FILTERS
│    [EUR/USD ↗·6][DXY ↗·3]  +2                   │  AAPL      ▇▇     5  │     the wire +
│  ── TODAY ──────────────────────────────       │  …                  │     charts it
│  ● CoinDesk · 2h · ◖med◗                        ├─────────────────────┤
│    Bitcoin ETF inflows…                         │  SOURCES (5)         │
│    [BTC ↗·9]  +1                                 │  CoinDesk   crypto  │
│  ── EARLIER ────────────────────────────        │  …                  │
│                                                  ├─────────────────────┤
│                                                  │  How tagging works  │
└──────────────────────────────────────────────┴─────────────────────┘
```

Key change vs. today: the filter bar is persistent and the **"Dominating the
wire" list becomes the navigation control** — clicking an asset there (or any
tag in a row) filters the stream to that asset *and* updates the URL, instead of
only opening a chart. A small "chart ↗" affordance preserves the open-chart action.

---

## Phase 1 — Make the structure obvious (no API changes)

Pure front-end; everything below is computable from the current
`{ items, trending }` payload.

1. **Extract a `NewsFilters` component** (new: `src/components/NewsFilters.tsx`)
   holding the market tabs + (Phase 2) asset chips + sort + clear. Render it in a
   `sticky top-0 z-10` bar in `news/page.tsx` so filters never scroll away.
2. **Day grouping.** In `news/page.tsx`, bucket the filtered `items` into
   **New (<30m) / Today / Earlier** using `it.ts` and render a small section
   header before each group (reuse the muted uppercase header style already in
   `Dashboard.tsx` lines ~382). Empty groups are skipped.
3. **Promote "Dominating the wire".** Keep it in the sidebar on desktop, but
   relabel to **"Markets on the wire"** and render counts as tiny bars so it
   reads as a leaderboard. On mobile (`lg:hidden`), render the top 6 as a
   horizontal scroll strip directly under the filter bar so the feature survives
   the stack.
4. **Tag overflow + count.** In the row, show ranked tags `slice(0,3)` plus a
   `+N` chip; pass each tag's mention count (already derivable from `trending`)
   so heavily-covered assets sort first.

Deliverable: the page *looks* organized and the market→news link is visible
above the fold, with zero backend work.

---

## Phase 2 — Asset filtering + shareable state (the big navigation win)

1. **Click-to-filter.** Add an `activeAssets: string[]` filter. Clicking an
   asset tag in a row, or an entry in "Markets on the wire", **adds it to the
   filter** and scrolls to top — the wire narrows to stories touching that asset.
   Preserve open-chart via a dedicated small `↗` button on the tag (the tag body
   filters; the arrow charts). This is the single highest-leverage change: it
   makes "this market and its news" a first-class, one-click view.
2. **Asset picker.** A compact multi-select in the filter bar (grouped by
   market, searchable) mirroring FF's currency filter — defaults to your
   `watchlist` (already in `Dashboard.tsx` state / localStorage) so the page
   opens on the assets you care about.
3. **Source filter.** Convert the static `SOURCES` list into toggleable chips
   (CoinDesk, Cointelegraph, CNBC, MarketWatch, FXStreet, investingLive, CNBC FX
   — the real set from `api/news/route.ts`).
4. **Search.** Client-side `includes()` over `title` (+ summary if exposed) —
   instant, no API cost.
5. **URL sync.** Reflect `market`, `asset` (repeatable), `q`, `sort` in the query
   string via `useSearchParams`/`router.replace`. Makes views bookmarkable and
   lets the dashboard's "All news →" link deep-link to a pre-filtered wire
   (e.g. `/news?asset=crypto:BTC`).

---

## Phase 3 — Relevance/impact weighting (ForexFactory's killer signal)

FF's red/orange/yellow impact dots are *the* reason the calendar is scannable.
News has no native impact field, so derive a cheap proxy in
`api/news/route.ts` and add it to `NewsItem`.

1. **Add `relevance: number` (0–1) and/or `weight: "high"|"med"|"low"`** to
   `NewsItem`. Compute server-side from signals already at hand:
   - **# of distinct assets tagged** (broad-impact stories touch more assets)
   - **coverage burst** — same asset appearing across multiple sources in a short
     window (already half-computed for `trending`)
   - **keyword tier** — high-impact terms in `assets.ts` (central banks: `ecb`,
     `boj`, `fomc`, `cpi`, `rate decision`) score higher. Add a small
     `HIGH_IMPACT_KEYWORDS` set next to the existing `newsKeywords`.
2. **Color-weight the row** with a left border or dot intensity (high = accent,
   med = muted, low = faint) — the FF analogue, themed to existing CSS vars.
3. **"High impact only" toggle** in the filter bar (FF's "Red only").
4. **Default sort = "Top"** (relevance × recency) with "Newest" as an option, so
   the page leads with what matters, not just what's latest.

> Scope note: this is heuristic, like the existing tagger. Keep the "tags are
> heuristic — read the story" disclaimer and extend it to impact.

---

## Phase 4 — Tie in the calendar (optional, high synergy)

You already have `EconCalendar` (`src/components/EconCalendar.tsx`, fed by
`/api/calendar`) living inside `SessionClock`. FF's audience treats *news + the
economic calendar* as one workflow. Consider a slim **"Upcoming high-impact
events"** card in the `/news` sidebar (next 24h, high-impact only), so the page
covers both "what just happened" and "what's about to." Reuses existing data;
no new API.

---

## Data / type changes summary

| Where | Change | Phase |
|---|---|---|
| `NewsItem` (`route.ts` + `NewsFeed.tsx`) | add `summary?`, `relevance`, `weight` | 2–3 |
| `/api/news` payload | unchanged shape; richer per-item fields | 3 |
| `assets.ts` | add `HIGH_IMPACT_KEYWORDS`; expose per-asset mention counts helper | 3 |
| `NewsFeed.tsx` | accept `activeAssets`, `onFilterAsset`, render weight + day groups | 1–2 |
| new `NewsFilters.tsx` | sticky filter bar (market/asset/source/impact/sort/search) | 1–2 |
| `news/page.tsx` | URL sync, grouping, sidebar-as-nav | 1–2 |

Because `NewsFeed` is shared with the dashboard, keep all new props **optional**
so the dashboard's capped 16-item view is unaffected (it can opt into `weight`
display but skip filtering).

---

## Suggested sequencing & effort

1. **Phase 1** (structure, grouping, sticky bar, mobile fix) — ~half day, no risk, immediate clarity gain.
2. **Phase 2** (asset filter + click-to-filter + URL) — ~1 day, the core navigation upgrade.
3. **Phase 3** (relevance/impact) — ~1 day, needs a little tuning.
4. **Phase 4** (calendar tie-in) — ~half day, optional.

Ship 1 and 2 first; they deliver most of the "easier to navigate" goal on their
own. 3 is what makes it feel like ForexFactory.

---

## Verification

- **Visual**: `npm run build && npm start`, check `/news` at mobile (375px),
  tablet (768px) and desktop widths — confirm sticky bar, group headers, and the
  mobile trending strip.
- **Behavior**: clicking a tag filters + updates URL; reload restores the view;
  "All news →" deep-link from the dashboard lands pre-filtered.
- **Regression**: confirm the dashboard `NewsFeed` (16-item, `xl:h-[604px]`)
  renders unchanged since props are additive/optional.
- **Data**: spot-check relevance scoring against a known high-impact day
  (e.g. an FOMC/CPI headline should outrank a routine market recap).

---

## What explicitly stays

The thing you like is preserved and amplified, not replaced: the wire stays a
single tagged stream, the five-free-wires framing stays, and tags stay clickable.
We're adding *ways in* (filter, group, weight, share) — not changing the soul of
the page.
