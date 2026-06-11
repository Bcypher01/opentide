# Phase 2 — The Morning Ritual

> **Status (2026-06-11):** Steps 1 & 2 shipped — `/api/calendar` (ForexFactory + static `us-macro-schedule.json` anchors), markers/countdowns/explainers on the session clock, and the daily briefing card. Step 3 (watchlist digest) remains gated on briefing engagement.
>
> **Also shipped 2026-06-11:**
> - **Briefing engagement counter** — the Step 3 gate is now measurable. Per-day read/reopen counts persist in `localStorage` (`briefingStats`, capped to 60 days); a trailing-14-day readout ("read N/14d, M reopens") shows in the briefing card footer. Decision rule: dogfood ~2 weeks, build the digest only if the read-rate holds.
> - **Onboarding tour** (`AboutModal`, "What is Opentide") — six-slide framer-motion modal with per-feature "where to find it" pins. Auto-opens once for first-time visitors; afterwards reachable via the header `?` or the intro hero. Phase-3-spirited (new-visitor conversion), not part of the ritual itself.
> - A reminder is scheduled (Dec 1, 2026) to regenerate `us-macro-schedule.json` with 2027 Fed/BLS dates.

Phase 1 is fully shipped (#4 while-you-were-away, #3 sentiment strip crypto + stocks, #9 yield panel, #6 funding rates). Phase 2 assembles the morning ritual: **#2 economic calendar → #1 daily briefing → #12 watchlist digest**, in that order, because the briefing consumes the calendar and the digest consumes both.

## Data-source verdict (verified 2026-06-11)

**Drop Finnhub for the economic calendar.** `/calendar/economic` requires a paid plan — confirmed against the community-verified endpoint list in [Finnhub-API issue #405](https://github.com/finnhubio/Finnhub-API/issues/405). Free tier only includes earnings/IPO/FDA calendars, market status, and market holidays. Update the README "Next" line accordingly.

**Use the ForexFactory feed instead** — verified working, keyless:

- `https://nfs.faireconomy.media/ff_calendar_thisweek.json` (also `_nextweek.json`)
- Shape: `{title, country, date (ISO w/ TZ), impact: "High"|"Medium"|"Low"|"Holiday", forecast, previous}`
- Covers all majors (USD, EUR, GBP, JPY, AUD, CAD, NZD, CNY) with impact ratings and consensus forecasts — exactly the fields the chip/clock UI needs.
- Caveats: unofficial widget feed, so same posture as the CNN F&G source — cache 1h server-side, never hammer it, null-tolerant fetcher, hide the panel if it breaks. Attribute "ForexFactory" in the explainer.

**Optional enrichment (beyond the 2-week window):** FOMC meeting dates from federalreserve.gov and the BLS release schedule (CPI/NFP/PPI) are published ~a year ahead. Ship a small static `us-macro-schedule.json` checked into the repo, regenerated yearly, so the session clock can show "next FOMC in 12 days" even when the FF feed only covers two weeks.

## Build order & scope

### Step 1 — #2 Economic calendar on the session clock
- `/api/calendar` route, same pattern as `/api/pulse`: fetch thisweek + nextweek, merge, cache 1h, null on failure.
- Filter default: High-impact only, majors only; "show all" toggle.
- Integration is the differentiator: render event markers **on the session clock timeline** ("CPI in 2h 14m, during NY open"), not a separate table. Countdown chips for the next 1–3 high-impact events.
- Past events within the session keep their slot, dimmed (pairs with while-you-were-away).

### Step 2 — #1 Daily briefing ("Your day in 60 seconds")
- Pure composition, no new sources: pulse strip values (both F&G readings, DXY, yields), top movers, funding extremes, today's high-impact calendar events, biggest tagged headline.
- Server-rendered text blocks from templates ("Stocks in Fear (27), crypto neutral — divergence day. CPI at 8:30 ET.") — deterministic, no LLM dependency.
- Placement: top card at first visit of the local day; collapses after read.

### Step 3 — #12 Watchlist daily digest
- Per-asset rollup reusing briefing primitives: 24h move, related headlines, any calendar event touching its market.
- Gate: only build once briefing engagement is proven.

## Done criteria
- Calendar markers visible on the clock with accurate local-time conversion and countdowns.
- Briefing renders complete even when any single upstream is null.
- README roadmap updated (Finnhub reference removed).
