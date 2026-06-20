# User-Story & Ease-of-Use Revamp — Plan

> Goal: make OpenTide easier to *understand and act on* without losing the
> density power-users like. This plan audits the current flows, reframes them as
> explicit user stories, and proposes a phased revamp. It assumes the new
> **"Explain this"** affordance (newswire) and **structured recommendations**
> have landed — both are load-bearing in the "self-explaining app" theme below.

---

## 1. Where we are

**Information architecture (5 tabs):** Dashboard · Pulse · Buzz · News · FAQ.
**Spine:** the watchlist (star an asset) — it personalizes recommendations,
`useAwayDiff`, and alerts.
**Connective UX already present:** session clock, `CommandPalette` (search),
`WelcomeBack`/"while you were away", `EconCalendar` plain-language explainers,
self-hiding `AiInsights`, PWA install, push alerts, and now per-headline `Explain`.

**What's strong:** the session-first framing is genuinely differentiated; graceful
degradation everywhere; tap-anything-to-chart is consistent.

**Where new/returning users get friction (hypotheses to validate, §6):**

1. **Cold open is dense.** A first-time visitor lands on a full dashboard with no
   narrative about *why sessions matter* or what to do first. The "aha" (markets
   are awake/overlapping right now) is present but not foregrounded.
2. **Two attention tabs.** *Pulse* (sentiment/macro) and *Buzz* (trending/attention)
   are adjacent concepts; users may not predict which holds what. Risk of
   "where was that thing?" navigation cost.
3. **The watchlist is the spine but its payoff isn't obvious.** Starring drives
   personalization, but a new user doesn't see what they unlock by doing it.
4. **AI features are islands.** Recommendations, Explain, and (future) assistant
   each help, but they don't yet visibly *connect* into "the app explains itself."
5. **Return-visit value is implicit.** `useAwayDiff` is a great hook but easy to
   miss; the "60-second catch-up" story could be the headline reason to come back.

---

## 2. Principles for the revamp

- **One primary action per surface.** Every view should answer "what do I do here?"
  in one glance (open a chart, star an asset, read the catch-up).
- **Progressive disclosure.** Beginners get explainers on demand (Explain / event
  cards); veterans get density and keyboard speed. Same screen, layered.
- **The app explains itself.** Lean on the AI layer so users never hit a term they
  can't decode in place — no leaving for Google.
- **Personalization compounds.** Make the watchlist's payoff visible so starring
  feels rewarding, which in turn improves recommendations and catch-ups.
- **Never punish a cold start.** Keep the zero-key / zero-account graceful posture.

---

## 3. Target user stories

Framed as `As a <persona>, I want <capability> so that <outcome>`. Each maps to
existing surfaces so the revamp is mostly *re-sequencing and connecting*, not net-new.

### Persona A — First-time visitor ("what is this?")
- A1. *...land on a 1-line story of what's happening right now* (which markets are
  awake, the next big event) *so that* the dashboard feels legible in 5 seconds.
  → Foreground a `WelcomeBack`-style **"Right now" strip** above the fold for
  first sessions; `SessionClock` + `nextHighImpact` already supply the data.
- A2. *...understand any unfamiliar term or headline in place* *so that* I don't
  bounce. → **Explain** (shipped) on headlines; extend to funding chips and movers.
- A3. *...see what starring an asset does before I commit* *so that* I bother to
  personalize. → A one-time inline nudge on first star: "Now your insights &
  catch-ups follow this."

### Persona B — Returning trader ("what did I miss?")
- B1. *...get a 60-second catch-up of what moved since I last looked* *so that* I'm
  oriented instantly. → Promote `useAwayDiff` into a dismissible **"Since you left"**
  card at the top of the dashboard; tie it to the watchlist.
- B2. *...jump straight to my watchlist + its AI insights* *so that* I act fast.
  → A persistent "My markets" lane; `AiInsights` already personalizes to it.
- B3. *...be alerted to a watchlist-relevant catalyst even with the tab closed.*
  → Tighten the push-alert setup flow (fewer steps, clearer value preview).

### Persona C — Power user ("speed & density")
- C1. *...drive everything from the keyboard* *so that* I never reach for the mouse.
  → Audit `CommandPalette` coverage: search, navigate, star, open chart, toggle
  UTC, jump to next event — all keyboard-reachable.
- C2. *...keep maximum information density* *so that* I see the whole board at once.
  → Keep current layout as the default for known/return users; reserve the guided
  framing for first sessions only (don't tax veterans).

---

## 4. Information-architecture proposal — ✅ SHIPPED

Implemented (the Pulse/Buzz split tested as the confusing one, §1.2):

- **Merged the attention story.** *Pulse* and *Buzz* are folded into one
  **"Markets"** destination (`/markets`) with two clearly-labeled bands — *Mood*
  (sentiment/macro: risk dial, heatmaps, session stats) and *Attention*
  (trending/news clusters/event risk/IPOs + personalized AI ideas). "Markets"
  was chosen over keeping "Pulse" because the original names didn't predict their
  contents. Deep-links stay stable: `/pulse` and `/buzz` 308-redirect to
  `/markets` (`next.config.ts`).
- **Watchlist is now both a lane and a first-class destination.** The dashboard
  lane stays (with a "View all →" link); `/watchlist` is the full destination —
  live prices for tracked assets, watchlist-personalized `AiInsights`, an
  empty-state with suggested stars, and a newswire filtered to stories that
  mention a watched asset.
- **Kept News and FAQ as-is.** News is a clear noun; FAQ doubles as SEO.

Resulting nav: **Dashboard · Markets · Watchlist · News · FAQ** (still five, each
mapping to a distinct job-to-be-done). `sitemap.ts` and the About tour copy were
updated to match. No new API routes were added, so the `CLAUDE.md` rate-limit
rule doesn't apply to this change (the two new entries are static page routes).

---

## 5. Phased roadmap

**Phase 0 — Instrument (do first).** Add lightweight, privacy-respecting funnel
events (first chart opened, first star, tab switches, Explain opened, catch-up
shown). You already run `@vercel/analytics`. Without this, §1's friction points
stay hypotheses.

**Phase 1 — Self-explaining app (low effort, builds on shipped work).**
- Extend `Explain` to funding chips (`DerivsPanel`) and top movers (`Movers`).
- First-star nudge (A3) and an empty-watchlist coach line in `AiInsights`.
- A "Right now" one-liner above the fold for first sessions (A1).

**Phase 2 — Return-visit loop.**
- Promote `useAwayDiff` to a "Since you left" card (B1), watchlist-weighted.
- Streamline push-alert setup (B3): one-tap enable with a value preview.

**Phase 3 — IA consolidation. ✅ SHIPPED (§4).**
- Pulse+Buzz merged into `/markets` with redirects; Watchlist destination + lane added (B2).
- Still to do: re-test the first-session funnel against Phase-0 baselines.

**Phase 4 — Conversational layer (the bigger bet from the LLM roadmap).**
- A grounded assistant ("why is BTC down?", "what should I watch this session?")
  reusing the same snapshot + RAG over the newswire. This is where the
  "self-explaining app" theme culminates. Gate behind the existing self-hiding
  pattern. (See `docs/LLM_INTEGRATION_OPTIONS.md` §4A-4.)

---

## 6. How we'll know it worked (validate, don't assume)

Pick 3–4 measurable signals before building Phase 1, from the Phase-0 instrumentation:

- **Activation:** % of first sessions that open ≥1 chart and star ≥1 asset.
- **Comprehension:** Explain open-rate, and bounce-rate on first session.
- **Retention:** 7-day return rate; "Since you left" card engagement.
- **Navigation cost:** tab back-and-forth before reaching an action (proxy for IA
  confusion — should drop after the Pulse/Buzz merge).

Run the IA merge (§4) as an A/B or staged rollout rather than a hard cutover.

---

## 7. Explicit non-goals / guardrails

- Don't add accounts or logins — the zero-account posture is a feature.
- Don't degrade density for power users to serve beginners; layer, don't replace.
- Don't let any AI surface block the render path or remove its graceful fallback.
- Per `CLAUDE.md`: any new route added during this work must enforce rate limiting.

---

### Open questions for you
1. Are **Pulse** and **Buzz** actually confused in practice, or is the split
   intentional and clear to your users? (Decides whether §4 happens.)
2. Is a guided/first-run mode worth the complexity, or do you prefer the current
   "drop them into the full board" stance for everyone?
3. How far do you want to take the **Watchlist** — a full destination, or a
   persistent lane inside the Dashboard?
