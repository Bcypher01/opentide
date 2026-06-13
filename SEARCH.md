# Search — implementation plan

> A global **⌘K command palette** that searches the curated universe, the **full
> stock/crypto universe**, the **newswire**, and the **economic calendar** — and
> opens the right thing (chart / link / calendar) on Enter.

## Guiding principle: tier by latency, not by source

The "most efficient" design isn't one search — it's **two tiers running in the same
box**:

- **Local tier (synchronous, zero network).** Curated 20 assets, already-loaded
  news items, and already-loaded calendar events are filtered in memory on every
  keystroke. Instant, free, works offline.
- **Remote tier (debounced, abortable).** The full stock universe (Finnhub symbol
  search) and full crypto universe (Binance symbol list) only fire when the query
  is ≥2 chars, after a ~200 ms debounce, and each new keystroke aborts the previous
  request. Crypto needs the network *once* per session, not per keystroke.

This keeps the common case (find one of our assets, or a headline) at 0 ms / 0
requests, and bounds the expensive case to stay inside Finnhub's 60-calls/min free
tier.

## What already exists (so we don't rebuild it)

- **`resolveChartTarget(id)`** in `src/lib/chart.ts` already accepts a synthetic
  `custom|TV:SYMBOL|Label` id and renders *any* TradingView symbol. **This means a
  searched non-curated ticker needs zero new chart plumbing** — we just build that
  id and call `openModal`.
- **`openModal(id)` / `closeModal()`** in `src/lib/store.ts` drive the global chart
  overlay.
- **`<ChartModal />`** is already mounted once in `src/components/AppShell.tsx`
  (line ~152) — the palette mounts right beside it, so it's available on every
  route (Dashboard, Buzz, News).
- **`framer-motion`** is already a dependency — reuse it for the overlay; no new
  animation lib.
- **`ASSET_BY_ID`, `ALL_ASSETS`, `tvSymbol()`** in `src/lib/assets.ts` are the
  local asset index.
- **`NewsItem`** (`{title, link, source, market, assets, ts}`) and **`CalendarEvent`**
  shapes already exist in the news route and `src/lib/calendar.ts`.

The app's ethos is **zero-dependency** (hand-rolled RSS parser, no chart lib). The
plan honors that: **no `fuse.js`, no `cmdk`** — a ~40-line scorer and a small custom
overlay.

## Architecture

```
src/
├── lib/
│   ├── search.ts            # NEW: types, scorer/ranker, result-merge logic (pure, testable)
│   └── store.ts             # EDIT: add paletteOpen + open/close palette
├── app/api/search/
│   ├── stocks/route.ts      # NEW: Finnhub /search?q= proxy, cached & deduped
│   └── crypto/route.ts      # NEW: Binance exchangeInfo → slim symbol list, cached 24h
└── components/
    ├── CommandPalette.tsx   # NEW: overlay UI, keybindings, grouped results, actions
    └── AppShell.tsx         # EDIT: mount <CommandPalette/>; global ⌘K listener
```

### 1. `lib/search.ts` — pure logic (no React, no network)

```ts
export type ResultKind = "asset" | "symbol" | "news" | "calendar";
export interface SearchResult {
  kind: ResultKind;
  id: string;          // asset id, "custom|TV:SYM|Label", news link, or event id
  title: string;       // "BTC", "Apple Inc.", headline, "US CPI"
  subtitle?: string;   // "Bitcoin · crypto", source + age, country + countdown
  score: number;
  action: "chart" | "link" | "calendar";
  href?: string;       // for news
}

// Dependency-free scorer: exact symbol = 100, symbol prefix = 80,
// name prefix = 60, word-boundary substring = 40, loose substring = 20.
export function scoreText(query: string, ...fields: string[]): number { ... }

export function searchLocal(q: string, assets, news, events): SearchResult[]
export function mergeRanked(...lists: SearchResult[][]): SearchResult[]  // sort, cap per group
```

Why a scorer and not fuzzy: tickers are short and exact-match-dominant; prefix +
boundary scoring is more predictable and faster, and avoids a dependency.

### 2. API routes (remote tier)

**`/api/search/stocks?q=`** — proxy to
`https://finnhub.io/api/v1/search?q=<q>&token=<key>`. Wrap in
`fetch(..., { next: { revalidate: 3600 } })` so identical queries are shared across
all users (same caching pattern as the existing `/api/stocks` route → popular
queries cost ~0 quota). Return a slim `{symbol, description, type}[]`, filtered to
`Common Stock`. Degrade gracefully to `[]` when `FINNHUB_API_KEY` is missing,
exactly like the existing stocks route.

**`/api/search/crypto`** — fetch `https://api.binance.com/api/v3/exchangeInfo` once,
keep only `status === "TRADING"` USDT/USDC pairs, return a slim
`{symbol, base}[]`. Cache server-side `revalidate: 86400` (the list changes rarely).
The client fetches this **once on first palette open**, stores it in a module-level
variable, and filters it locally thereafter — so crypto search costs **one request
per session**, then 0.

Map a remote hit to a chart via the existing custom id:
- stock → `custom|<EXCHANGE-or->:<SYM>|<SYM>` (Finnhub gives the symbol; default
  TradingView exchange resolution handles most US tickers).
- crypto → `custom|BINANCE:<SYMBOL>|<base>`.

### 3. `store.ts` — minimal state

```ts
paletteOpen: boolean;
openPalette: () => void;
closePalette: () => void;
```

Not persisted (leave `partialize` untouched).

### 4. `CommandPalette.tsx` — UI + keybindings

- Mounted once in `AppShell` next to `<ChartModal/>`.
- **Keys:** ⌘K / Ctrl+K toggle (global); `/` opens when focus isn't in an input;
  `Esc` closes; `↑/↓` move; `Enter` runs the highlighted result's action.
- **Input handling:** local results render synchronously; a 200 ms debounce +
  `AbortController` drives the two remote fetches; a tiny spinner shows only while
  remote is in flight.
- **Layout:** centered overlay (framer-motion fade/scale), grouped sections —
  **Assets · Markets (universe) · News · Calendar** — each capped (e.g. 5) so the
  list stays scannable.
- **Actions:** asset/symbol → `openModal(id)` + `closePalette()`; news → open
  `href` (new tab); calendar → close palette and route to the calendar (scroll to /
  highlight the event).
- **A11y:** `role="dialog"`, `aria-activedescendant` on the active row, focus trap,
  restore focus on close.
- Add a small ⌘K affordance in the header next to the bell/help icons for
  discoverability.

## Phasing — ship value fastest

1. **Phase A — Local palette (≈½ day).** `search.ts` + store + `CommandPalette`
   wired to curated assets, loaded news, calendar. Full ⌘K UX, **zero new network**.
   This alone covers most real use and de-risks the UI.
2. **Phase B — Stock universe.** Add `/api/search/stocks` + debounced/abortable
   remote tier + custom-id chart routing.
3. **Phase C — Crypto universe.** Add `/api/search/crypto`, fetch-once-per-session
   cache, local filtering.
4. **Phase D — Polish.** Recent searches (in-memory), per-group caps, empty/error
   states, header affordance, keyboard help row.

## Efficiency summary

| Source | Cost on keystroke | Network |
|---|---|---|
| Curated assets | O(20) in-memory | none |
| News (loaded) | O(items) in-memory | none |
| Calendar (loaded) | O(events) in-memory | none |
| Stock universe | debounced 200 ms, prev aborted | Finnhub `/search`, cached 1 h, shared |
| Crypto universe | in-memory filter | Binance list fetched **once/session**, cached 24 h |

## Verification checklist

- `npm run lint` and `tsc --noEmit` clean.
- ⌘K opens/closes on every route; Esc and outside-click close; arrows + Enter work;
  `/` doesn't hijack typing inside inputs.
- Selecting a non-curated ticker opens a correct TradingView chart via the
  `custom|` id (confirms no chart plumbing was needed).
- Throttle network: confirm remote tier stays ≤ a few requests while typing a
  word, and Finnhub stays under 60/min.
- Missing `FINNHUB_API_KEY` → stock universe silently empty, local results still
  work (matches existing route behavior).
```
