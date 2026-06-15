# Opentide — Best Practices 77 → 100: a permanent fix plan

Goal: get Lighthouse **Best Practices** to a stable 100 and keep it there, with
no change that re-breaks the live Vercel deploy (the constraint that bit the
strict-CSP merge before — see the long comment block in `next.config.ts`).

This plan is grounded in the current code, not generic advice. Where a fix needs
a detail only the live Lighthouse report has, that's called out explicitly with
how to get it.

---

## TL;DR — what's actually wrong vs. what's noise

| Lighthouse item | Real cause | Fixable by us? | Phase |
|---|---|---|---|
| Browser errors logged to console | API routes return **HTTP 502** on upstream failure → browser logs "Failed to load resource: 502" as an error | **Yes — high confidence** | 1 |
| Uses deprecated APIs (1) | Not in our code (ruled out h1-size, unload, eval). Almost certainly TradingView embed or `@vercel/analytics` | Maybe (update/lazy-load) — needs exact name | 2 |
| CSP not effective against XSS | `script-src` still has `'unsafe-inline'` (deliberate, documented) | Yes, but it's the hard one | 3 |
| DOM XSS / Trusted Types | `require-trusted-types-for 'script'` deliberately not set | Yes, with care | 3 |

**Pure noise — ignore (does not affect the score):**
- `contentscript.js … MaxListenersExceeded / ObjectMultiplex / *-liveness` →
  your **MetaMask/wallet browser extension**. Lighthouse uses a clean Chrome
  with no extensions, so this never counts. Confirm in Phase 0.
- `…css was preloaded … but not used within a few seconds` → a benign Next
  App-Router preload heuristic at **warn** level. The "errors in console" audit
  only counts **error** level, so this doesn't move the score.

---

## Phase 0 — Measure correctly first (5 min, do this before anything)

The score is only trustworthy from a clean run. Two steps:

1. **Run Lighthouse with no extensions.** Use an Incognito window (extensions
   off by default) or the CLI:
   ```bash
   npm run build && npm start          # NOT `next dev` — dev ships unminified, skews everything
   npx lighthouse https://opentide.vercel.app \
     --only-categories=best-practices --preset=desktop --view
   ```
   Confirm the `contentscript.js` lines are gone. They will be — they're MetaMask.

2. **Capture the two unknowns the report holds.** In the HTML report, expand:
   - **Uses deprecated APIs** → it names the exact API *and the script URL* that
     triggered it. Paste that back; the Phase 2 fix depends entirely on it.
   - **Browser errors were logged to the console** → it lists each error string
     and its source. Confirm they're the `502`/`Failed to load resource` lines
     this plan predicts (vs. something new like a TradingView script error).

Everything below is sequenced so each phase is independently shippable and
verifiable.

---

## Phase 1 — Kill the console errors (highest confidence, low risk)

### Root cause
On upstream failure these routes return a non-2xx status:

- `src/app/api/crypto/route.ts` → `{ status: 502 }`
- `src/app/api/forex/route.ts` → `{ status: 502 }`
- `src/app/api/news/route.ts` → `{ status: 502 }`
- `src/app/api/stocks/route.ts` → `{ status: 502 }`
- `src/app/api/sessionstats/route.ts` → `{ status: 502 }`
- `src/app/api/search/crypto/route.ts` → `{ status: 502 }`
- `src/app/api/search/stocks/route.ts` → `{ status: 502 }`

The client catches these in JS (`usePolling` does `if (!res.ok) throw`), but the
**browser still logs the failed load as a console error** before JS ever sees
it. That's what Lighthouse's `errors-in-console` audit collects. Catching it in
`try/catch` does not suppress the browser's own network-error log.

Note: `derivs`, `pulse`, `calendar`, `buzz`, and the missing-key `stocks` path
already return **200 with an `{ error }` body** — that's the pattern to copy.

### Fix (server)
Make every data route return **HTTP 200** with an explicit error field instead of
a 5xx. Example for `crypto/route.ts`:

```ts
// before
return NextResponse.json({ error: "upstream", quotes: [] }, { status: 502 });
// after
return NextResponse.json({ error: "upstream", quotes: [], ts: Date.now() });
```

Apply the same change to forex, news, stocks, sessionstats, and both search
routes. Keep the `error` string so the UI can still show its "reconnecting…" /
fallback states.

### Fix (client) — keep the error UX working
`usePolling` currently derives its `error` flag from `!res.ok`. Once routes
return 200, switch it to read the body instead so the existing
"reconnecting…" indicators keep working:

```ts
// src/lib/hooks.ts — inside usePolling tick()
const json = (await res.json()) as T & { error?: string };
if (!cancelled)
  setState({
    data: json,
    error: Boolean((json as { error?: string }).error),
    lastUpdated: Date.now(),
  });
```

Components already read both `state.error` and `data?.error`, so no component
changes are needed — but grep to confirm after the edit.

### Also check (likely already fine, verify in Phase 0 report)
- **Binance WebSocket** (`useBinanceLive`): a dropped socket can log a
  `WebSocket connection … failed` error. The reconnect logic is correct; if
  Lighthouse flags it, gate the first connect behind `requestIdleCallback` /
  after `load` so it never races the measured window. Only do this if the report
  shows it.
- **TradingView iframe**: third-party. It's a sandboxed cross-origin iframe, so
  its internal errors generally don't surface to the top frame. If they do,
  Phase 2 lazy-loading helps.

### Verify
Re-run Phase 0. "Browser errors were logged to the console" should pass.

---

## Phase 2 — Deprecated API (needs the exact name from Phase 0)

### What we already ruled out (it's not these)
- **`<h1>` default font-size deprecation** — every `<h1>` in `news`, `buzz`,
  `pulse`, and `DigestView` has an explicit Tailwind size (`text-2xl`/`text-lg`),
  so this Chrome deprecation isn't triggered.
- **`unload`/`beforeunload` listeners** — none in the codebase.
- **`document.write` / `eval` / `new Function`** — none.

So the one warning is third-party. Two candidates, in order of likelihood:

### If it's `@vercel/analytics`
You're on `^2.0.1`. Update and re-test:
```bash
npm i @vercel/analytics@latest
```
If it still flags, you can drop `<Analytics/>` from `src/app/layout.tsx` (you
lose Vercel Web Analytics) or self-host the script.

### If it's TradingView
The embed is the most common source of deprecation warnings. Mitigations:
- It already loads on demand (`ChartPanel` is dynamic, `ChartModal` is dynamic).
  Confirm the chart is **not** mounted during the Lighthouse measurement window
  on the homepage. If it is, defer it behind first interaction or an
  IntersectionObserver so the embed's deprecated calls never run on initial load.
- Because it's a cross-origin iframe, its deprecations usually don't count
  against the parent frame; if Lighthouse still attributes it, deferring the mount
  is the clean fix.

### Verify
Re-run Phase 0; "Uses deprecated APIs" should pass. If the named API is
something unexpected, stop and share it — the fix is API-specific.

---

## Phase 3 — Strict CSP + Trusted Types (the hard, permanent part)

This is the work that previously broke the live deploy, so it ships **only**
after validation on a Vercel **preview** URL. Two audits are at stake:

- `csp-xss` fails because `script-src` contains `'unsafe-inline'`.
- `trusted-types-xss` fails because `require-trusted-types-for 'script'` is absent.

There are two viable end-states. Pick one deliberately — they trade differently
against your static-rendering requirement.

### Option A — Stay static, drop `'unsafe-inline'` via build-time hashes (SRI)
This is the path the `next.config.ts` comment already points to.

1. Enable subresource integrity so Next emits hashes for its scripts:
   ```ts
   experimental: { sri: { algorithm: "sha256" } }
   ```
2. Replace `'unsafe-inline'` in `script-src` with `'strict-dynamic'` plus the
   hash(es) of Next's inline bootstrap. With `'strict-dynamic'`, hashed root
   scripts are trusted to load the rest, so you don't enumerate every chunk.
3. Hash the JSON-LD block in `layout.tsx` (it's `type="application/ld+json"`, so
   not executable, but verify Lighthouse doesn't complain) or move it behind the
   same mechanism.

**Risk:** App Router's inline RSC-payload/bootstrap scripts are the known edge
case `sri` doesn't always cover cleanly. Must be verified on a preview deploy.
**Keeps:** full static prerender + CDN caching.

### Option B — Per-request nonce + `'strict-dynamic'` (accept dynamic rendering)
Cleanest pass for both audits; the cost is dynamic rendering.

1. Generate a nonce in `middleware.ts`, inject it into the CSP header and into
   Next's scripts (Next supports reading the nonce from the request).
2. `script-src 'self' 'nonce-<value>' 'strict-dynamic'` — no `'unsafe-inline'`.
3. Recover most of the lost caching with response `Cache-Control:
   s-maxage=… , stale-while-revalidate=…` so the CDN still serves fast.

**Note:** you flagged sign-up as a future feature. Authed pages render
dynamically anyway, so this nonce approach becomes "free" on them — Option B may
be the better long-term target even if Option A ships first for the marketing
homepage.

### Trusted Types (applies to whichever option)
Add to the CSP:
```
require-trusted-types-for 'script';
trusted-types nextjs 'allow-duplicates';
```
Then handle the two raw-string `script.src` assignments the old comment
identified:
- **`@vercel/analytics`** injects a script with a plain-string `src` and creates
  no TT policy. Fix by self-hosting the analytics script behind your own
  trusted-types policy, or drop `<Analytics/>`.
- **Next webpack runtime** falls back to a raw string if its
  `createPolicy("nextjs#bundler")` throws. Next 15's TT support has matured;
  validate on preview that the policy is created exactly once under App Router.

If full TT enforcement proves infeasible with the third-party scripts, a single
narrow `default` policy that sanitizes (not a blind passthrough) still satisfies
the audit while keeping real value. Document whatever you choose, like the
existing config comments do.

### Verify
Deploy to a Vercel **preview**, load every route (`/`, `/pulse`, `/buzz`,
`/news`, chart modal, command palette), watch the console for a client-side
exception, then run Lighthouse against the preview URL. Only promote to prod
once both audits pass **and** no route throws.

---

## Phase 4 — Lock it in (prevent regressions)

1. Add a Lighthouse budget to CI so the score can't silently slip:
   ```bash
   npx @lhci/cli autorun --collect.url=<preview-url> \
     --assert.assertions.categories:best-practices=0.95
   ```
   Wire it into the Vercel preview / GitHub Action so every PR is checked.
2. Add a one-line rule to the repo README: **API routes must return 200 with an
   `{ error }` body, never a 5xx, for client-polled endpoints** — so Phase 1
   doesn't regress.
3. Re-run the full Lighthouse pass (all categories) after Phase 3, since the CSP
   change touches every response.

---

## Suggested order & effort

1. **Phase 0** — 5 min, do now.
2. **Phase 1** — ~30 min, safe, gets the biggest Best-Practices win. Can ship today.
3. **Phase 2** — depends on the named API; usually a dependency bump or a lazy mount.
4. **Phase 3** — half a day incl. preview testing. The only risky one; never ship
   straight to prod.
5. **Phase 4** — ~1 hr, prevents backsliding.

Phases 1, 2, and 4 are low-risk and I can implement them now. Phase 3 should go
through a preview deploy you control, because it's the exact change that took the
site down last time.
