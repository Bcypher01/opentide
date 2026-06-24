# Opentide — Feature Brainstorm

> Goal: every financial market trader opens Opentide once a day to **start their day**. All ideas below are buildable at $0 (free APIs, free tiers, zero paid infra), consistent with the current architecture.

## The strategic frame

A daily habit needs three things: a **trigger** (a reason to open the tab at a specific moment), a **ritual** (a 2–5 minute routine the site completes faster than anywhere else), and a **reward** (the trader leaves feeling oriented). Finviz owns the "nightly screen" ritual; TradingView owns "chart analysis." The unowned slot is **"the first 3 minutes of the trading day"** — orientation, not analysis. Opentide's session clock is already pointed at this. Everything below either strengthens that morning ritual or adds a second daily trigger (pre-session, post-close).

The litmus test for every feature: *does this answer "what do I need to know before I trade today?" faster than the trader's current routine?*

---

## Status (June 2026)

**Shipped (14 of 17):** #1 daily briefing, #2 economic calendar on the clock, #3 sentiment strip, #4 "while you were away" diff, #5 session statistics engine (crypto), #6 funding rates + OI, #7 cross-market risk dial, #8 heatmaps (crypto + stocks + forex strength), #9 yield & macro panel (folded into the pulse strip), #10 session push alerts (PWA), #12 watchlist daily digest, #15 daily wrap / OG cards, #16 embeddable session-clock widget, #17 ICS feed. Also built beyond this doc: an assistant/agent layer, AI insights, Buzz, command palette, and search.

**Remaining (3):**
- #11 Trader-profile presets — no backend needed, value on day one. **Do this first.**
- #13 Streaks / "day started" check-in — low effort, keep whisper-quiet.
- #14 Post-close journal — **pinned until account creation + sync exists.** A localStorage-only journal can't persist months of entries safely, and Opentide can't see real trades (no broker link), so the entry is necessarily a thin mood/discipline check-in. It only pays off once (a) entries sync across devices and (b) the session-correlation insight has weeks of data to work with. Revisit when accounts ship.

---

## Tier 1 — The Morning Ritual (highest leverage)

### 1. Daily Briefing ("Your day in 60 seconds")
A single generated panel at the top of the page, rebuilt server-side a few times daily: overnight movers in each market, what happened while you slept (based on user's local timezone vs. session activity), today's high-impact calendar events, and which session overlap is next. This is the feature that converts Opentide from "a dashboard I check" to "a briefing I read."
- **Data:** everything you already have (movers, news, sessions) + economic calendar (below). Pure composition, no new APIs.
- **Why unique:** nobody composes this for free across forex + crypto + stocks. CNBC does stocks; CoinDesk does crypto; no one does "your markets, your timezone."
- **Effort:** medium. Mostly templating + ranking logic.

### 2. Economic Calendar with session-clock integration
Already on your roadmap — but the unique twist is rendering calendar events **on the session clock timeline itself** ("CPI drops 90 minutes into NY session"). Countdown chips for the next high-impact event. This fuses your signature element with the single most habit-forming data type in trading: traders check calendars *every single day*.
- **Data:** Finnhub free tier has a calendar endpoint (verify current free-tier inclusion — Finnhub has moved endpoints between tiers before). Fallbacks: scrape-free RSS/ICS from ForexFactory is against their ToS, so prefer Finnhub, or FRED release calendar (free key) for US macro, plus a small hand-maintained JSON of recurring events (FOMC, NFP, CPI dates are published a year ahead by BLS/Fed — free, official, static).
- **Effort:** medium. The hand-maintained recurring-events file is a genuinely $0, zero-API-risk core.

### 3. Sentiment strip: Fear & Greed (crypto + stocks) + BTC dominance
A thin strip near the ticker tape: crypto Fear & Greed, stock-market Fear & Greed, BTC dominance, and yesterday-vs-today arrows. Sentiment numbers are candy — low information density, extremely high check-daily compulsion.
- **Data:** [alternative.me F&G API](https://alternative.me/crypto/api/) (free, no key); CoinMarketCap's keyless standard API includes their F&G and Altcoin Season Index; stock F&G can be approximated from free inputs (VIX proxy via Finnhub quote, % movers up vs down, etc.) if CNN's isn't accessible — label it "Opentide composite" and it becomes a *brand asset*.
- **Effort:** low for crypto, medium for a composite stock index.

### 4. "While you were away" diff
On revisit, show what changed since the user's last visit: watchlist movers, news count per tagged asset, sessions opened/closed. Uses `localStorage` timestamp — no accounts needed. This is the single cheapest retention mechanic that exists, and almost no finance dashboard does it.
- **Data:** none new. **Effort:** low.

---

## Tier 2 — Unique intelligence (differentiators)

### 5. Session statistics engine ("What does the London open usually do?")
You already have DST-aware session math, which is rare. Extend it: for each asset, compute average range/volatility *per session* from historical candles ("EURUSD moves 0.42% on average during London; today it's already moved 0.61%"). A "session volatility vs. normal" gauge is a genuinely novel free feature and deepens your moat — everything routes back to sessions.
- **Data:** Binance klines (free, no key) for crypto; Finnhub candles for stocks (verify free-tier candle access); forex candles are the hard one — Frankfurter is daily-only, so start crypto-first.
- **Effort:** medium-high, but it's the most defensible idea on this list.

### 6. Crypto derivatives panel: funding rates + open interest
Funding rates are the closest free thing to "what is positioning right now," and day traders check them obsessively. A small panel: top funding rates (positive/negative extremes), OI change 24h, long/short ratio.
- **Data:** Binance Futures public REST — funding, OI, long/short ratio, all free and keyless, same caching pattern you already use.
- **Effort:** low-medium. Very high value per line of code.

### 7. Cross-market "risk dial"
One synthesized gauge: risk-on / risk-off, computed from free signals — BTC 24h move, DXY direction (derivable from Frankfurter EUR/USD inverse + JPY), S&P proxy (SPY quote via Finnhub), gold direction. Traders in *any* market care about regime. Another composite that becomes a brand asset and a screenshot people share.
- **Data:** all existing sources. **Effort:** medium (mostly deciding the formula; be transparent about it).

### 8. Heatmaps (sector / forex grid / crypto)
The #2 reason traders open Finviz daily is the heatmap glance. A forex *strength grid* (each currency vs. all others, from Frankfurter cross-rates) is particularly cheap and forex traders love them. Crypto heatmap from Binance 24h tickers. Stocks limited by Finnhub quota — do top-50 only, cached aggressively.
- **Data:** existing sources. **Effort:** medium (it's a rendering problem, not a data problem).

### 9. Yield & macro mini-panel
US 2Y/10Y yields, the 2s10s spread, DXY — three numbers macro-aware traders check daily.
- **Data:** US Treasury's official API (free, no key) for yields; FRED (free key) as a backup; DXY approximated from Frankfurter.
- **Effort:** low.

---

## Tier 3 — Personalization & second-visit triggers

### 10. Session alerts / push notifications (PWA)
Already on your roadmap. Sharpen it: "Notify me 15 min before London open," "Notify me when a high-impact event is 30 min out," "Notify me if a watchlist asset moves >3% in a session." Web Push is free; Vercel cron (free tier) can drive scheduled checks. Notifications are *external triggers* — they create visits rather than waiting for them.
- **Effort:** medium-high (service worker + push plumbing), but it's the strongest pure-retention feature here.

### 11. Trader profile presets
One-tap personas that reorder the whole surface: "London FX scalper," "NY equities," "Crypto degen (24/7)," "Swing — show me dailies." Stored in `localStorage`/zustand. Personalization without accounts; makes the product feel *theirs* on day one.
- **Effort:** low-medium.

### 12. Watchlist daily digest view
A dedicated "my morning" view: only watchlist assets, their overnight change, tagged news, next relevant session, next calendar event affecting them. This *is* the ritual page; consider making it the default tab for returning users.
- **Effort:** low (recomposition of existing data).

### 13. Streaks & "day started" check-in (use with restraint)
A subtle "Day 12" streak for opening your briefing, maybe a satisfying "mark day started" interaction. Duolingo-style mechanics work but can cheapen a calm-intensity brand — keep it whisper-quiet, opt-in, never guilt-trippy.
- **Effort:** low.

### 14. Lightweight journal prompt — ⏸ PINNED until accounts/sync
Post-close (detected by session clock!): "How did today go?" — one emoji + optional note, stored locally, with a calendar heat view of your month. Journaling is the #1 advice given to every trader and nobody has a frictionless free version. Pairs naturally with sessions ("you rate London days 2x better than NY days").
- **Blocked on:** persistence. A localStorage-only journal silently loses months of entries on cache-clear or device change — unacceptable for this data type. Opentide also can't see real trades (no broker link), so the entry is a thin mood/discipline check-in, not a trade ledger. Only worth building once entries sync across devices and there's enough history for the session-correlation insight to land.
- **Effort:** medium. High emotional lock-in; their data lives in your product.

---

## Tier 4 — Shareables & growth loops (free marketing)

### 15. Daily market wrap image / OG cards
Auto-generated end-of-day summary card (top movers, session stats, F&G) rendered via Vercel OG image generation (free) — one click to share to X/Telegram/Discord. Every share is an ad with your branding. Same machinery gives every asset page a rich link preview.
- **Effort:** medium.

### 16. Embeddable session clock widget
Let anyone embed your session clock on their blog/Notion/Discord. The session clock is your signature — make it spread. A `/widget` route + iframe snippet costs almost nothing and builds backlinks/SEO.
- **Effort:** low.

### 17. "Market open" calendar feed (.ics)
A subscribable ICS feed of session opens/closes + high-impact events, in the user's timezone. Lives in their actual calendar app — a daily trigger you don't even have to send.
- **Effort:** low. Genuinely unique.

---

## Deliberate "no" list (free ≠ worth it)

- **Signals / buy-sell recommendations** — destroys trust positioning, legal gray zone, and free signal sites are a graveyard.
- **Chat/community** — moderation cost is real even when infra is free; Discord exists.
- **Real-time forex quotes** — no honest free source; your "ECB daily, labeled honestly" stance is a trust feature. Don't fake it.
- **Full screener** — Finviz wins on data depth you can't get free; compete on orientation, not screening.
- **Accounts before they're needed** — `localStorage` + export/import JSON covers sync for v1 without auth costs/friction.

---

## Suggested sequence

| Phase | Ship | Why this order |
|---|---|---|
| 1 | #4 while-you-were-away, #3 sentiment strip, #9 yield panel, #6 funding rates | Days of work each, immediate daily-check pull |
| 2 | #2 economic calendar (on the clock), #1 daily briefing, #12 watchlist digest | The morning ritual, assembled |
| 3 | #10 push alerts, #17 ICS feed, #16 embeddable clock | External triggers + growth |
| 4 | #5 session stats engine, #7 risk dial, #14 journal | The moat |

**One-sentence strategy:** own the first three minutes of every trader's day by being the only free product organized around *time* — sessions, calendars, countdowns, and "what changed since yesterday" — then let composites (briefing, risk dial, session stats) become the things people screenshot.

---

*API notes: alternative.me F&G and Binance (spot + futures) public endpoints are keyless. CoinMarketCap exposes keyless standard routes incl. their F&G index. Finnhub free tier limits/endpoints shift over time — verify calendar + candle access before building on them. BLS/Fed publish CPI/FOMC/NFP schedules ~a year ahead (free, static). Treasury yields: official treasury.gov API, no key.*
