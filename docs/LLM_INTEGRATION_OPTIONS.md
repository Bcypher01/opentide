# LLM Integration — Options & Roadmap

> Research date: 2026-06-20. Scope: how to integrate LLMs into OpenTide *better*,
> across four axes you asked for — **new user-facing features**, **engineering/DX**,
> **cost/quota resilience**, and **quality/grounding**. Recommendations are ranked
> by impact ÷ effort and mapped onto the files you already have.

---

## 1. Where you are today

You are not starting from zero — you have a genuinely well-built free-tier LLM layer:

| Piece | File | What it does |
|---|---|---|
| Provider-agnostic client | `src/lib/llm.ts` | Model **ladder** Gemini → OpenRouter, plain `fetch` (no SDK), JSON mode, per-attempt timeout, error-class-aware fallback, graceful "unavailable" state |
| Domain layer | `src/lib/recommendations.ts` | Builds a token-lean market snapshot, strict-JSON prompt, validates every item against the asset universe |
| API surface | `src/app/api/recommendations/route.ts` | Per-watchlist 10-min shared cache, LRU bound, `GET` (global) + `POST` (personalized), never 502s |
| UI | `src/components/AiInsights.tsx`, `src/app/buzz/page.tsx` | Self-hiding card, debounced refetch, tap-to-chart |
| Rate limiting | `src/middleware.ts` | Dedicated `api-ai` bucket (10/IP/min) |
| Daily briefing | `src/lib/briefing.ts` | **Deterministic templates, no LLM** — a prime upgrade candidate |

**Strengths to preserve:** the no-SDK/plain-fetch ethos, env-overridable model ladders,
graceful degradation, and shared caching. Anything below should respect those.

**Repo rule that constrains new work:** per `CLAUDE.md`, *every new route must enforce
rate limiting*. Each new endpoint proposed here (`/api/explain`, `/api/assistant`, etc.)
must be wired into a `middleware.ts` bucket. This is called out per-item below.

---

## 2. What changed in the landscape (and what it means for you)

A few things moved since this code was written, all of which you can adopt cheaply:

- **Gemini free tier refreshed.** As of April 1 2026 the free tier dropped Pro models and
  now offers **Gemini 3 Flash** and **3.1 Flash-Lite** (plus 2.5 Flash / 2.5 Flash-Lite),
  ~1,500 requests/day per model. Your ladder still names `2.5-flash / 2.0-flash /
  2.5-flash-lite`. Because the ladder is **env-overridable**, you can adopt the newer
  models with *zero code change* — just set `GEMINI_MODELS`.
- **Implicit caching is on by default for Gemini 2.5+.** Repeated prompt prefixes get up to
  ~90% input-token discount automatically. Your stable system prompt already benefits;
  prompt **ordering** (§5C) squeezes more out of it.
- **Vercel AI SDK 5** shipped with first-class streaming (`streamText`, `streamObject`),
  Zod structured output (`generateObject`), tool/agent loops, and `useChat`. It's the
  fastest path to streaming UX — at the cost of a dependency (tradeoff in §5B).
- **Free embeddings exist now.** `gemini-embedding-001` (and Gemini Embedding 2) are
  reachable on the free tier — this unlocks RAG over your newswire without new spend.
- **OpenRouter free tier** is 20 req/min, 50 req/day; a one-time **$10** (never expires)
  raises the daily floor to 1,000 forever. Worth it if you lean on OpenRouter fallback.

---

## 3. The shortlist (if you read nothing else)

Ranked by impact ÷ effort:

1. **Refresh the model ladder via env** — 5 min, pure win. (§5B-1)
2. **Pre-generate global recommendations on your existing Inngest cron** — makes the common
   case a cache hit: instant, quota-free. (§5C-1)
3. **"Explain this" on tap** (headline / event / funding) — small feature, high delight,
   cheap & cacheable. (§5A-2)
4. **Native structured output (`responseSchema`)** — fewer malformed drops, less defensive
   parsing. (§5B-2 / §5D-1)
5. **Stream the recommendations** so cards appear progressively instead of a 12 s blank. (§5A-1)
6. **LLM-narrated briefing layer** over the deterministic `briefing.ts`. (§5A-5)
7. **RAG over the newswire** to ground explanations/assistant in real, cited headlines. (§5D-2)
8. **A lightweight eval + telemetry harness** before you ship more AI surface area. (§5D-3)

---

## 4. New user-facing features (UX)

These are the highest-leverage *product* moves. Each notes effort, cost posture, and where it lands.

### 4A-1 · Streaming recommendations  — **High impact / Medium effort**
Today a cold request can block up to `TIMEOUT_MS` (12 s) before the card renders. Switch the
recommendations path to **streaming** so cards pop in one-by-one as the model emits them.
- Plain-fetch route: call Gemini `:streamGenerateContent` (SSE) and parse partial JSON, or
  use AI SDK `streamObject` with `Output.array()` for typed element streaming.
- UI: render each rec as it arrives in `AiInsights.tsx`; show skeleton rows for the rest.
- Perceived latency drops from ~12 s to ~1 s to first card. Biggest single UX upgrade.

### 4A-2 · "Explain this" everywhere  — **High impact / Low effort**  ★ start here
A tap target on any headline, calendar event, funding extreme, or mover → one plain-English
paragraph ("what is this, why it might matter today"). You already pass these objects around.
- New `POST /api/explain` (body: `{kind, id}`); **add to `middleware.ts` `api-ai` bucket**.
- Cache aggressively per item id (headlines/events are stable for minutes-to-hours).
- Tiny prompt, tiny output → cheap. Reuses the `generate()` you already have.
- This is the cheapest way to make the whole app feel "AI-native".

### 4A-3 · Natural-language command bar  — **Medium impact / Medium effort**
Extend your existing search (`/api/search`) with an NL mode: "high-funding coins into FOMC",
"red forex pairs", "what's moving in the Asia session". Use **tool/function calling** to turn
the phrase into a structured filter you already support, then render the normal result UI.
- Keeps the LLM out of the render path — it only produces a *query object* you validate.
- Falls back to keyword search on any parse failure. New route → rate-limit bucket.

### 4A-4 · Grounded market assistant  — **High impact / High effort** (bigger bet)
A `useChat`-style panel that answers "why is BTC down?", "what should I watch this session?",
grounded in (a) the live snapshot you already compose and (b) **RAG over the newswire** (§5D-2)
so answers cite real headlines. This is where AI SDK 5 (`useChat` + tools + streaming) earns
its dependency. Gate it behind the same self-hiding pattern when no key is set.
- New `POST /api/assistant` (streaming) → rate-limit bucket; keep a strict per-IP budget.
- Highest build cost; do it *after* streaming + RAG + evals exist.

### 4A-5 · LLM-narrated daily briefing  — **Medium impact / Low-Med effort**
`briefing.ts` is deterministic today (good — it always renders). Add an **optional** LLM layer
that turns the toned segments into a 2–3 sentence natural narrative ("Risk-on into the London
open; watch EUR/USD around the ECB print"). Keep the deterministic version as the guaranteed
fallback, exactly like `AiInsights` self-hides. Pre-generate it on the Inngest cron (§5C-1).

### 4A-6 · "Why is it moving?" on chart open  — **Medium / Low-Med**
When a user opens an asset chart, surface a one-line AI take built from that asset's recent
news + funding + change. Naturally cacheable per asset for a few minutes.

---

## 5. Engineering / DX (usage ease)

### 5B-1 · Refresh the model ladder (env only)  — **5 minutes** ★
No code change — your `modelLadder()` already reads env. Suggested:
```bash
GEMINI_MODELS=gemini-3-flash,gemini-2.5-flash,gemini-3.1-flash-lite,gemini-2.5-flash-lite
OPENROUTER_MODELS=openrouter/free
```
Verify any pinned model ids against the provider's current model list before deploying (they churn).

### 5B-2 · Native structured output instead of hand-validated JSON  — **Low-Med**
You currently request `json` mode then defensively drop malformed items. Gemini supports a
**`responseSchema`** (JSON-Schema) that constrains the model to your exact shape; OpenRouter
supports `response_format: json_schema`. This cuts the malformed-drop rate and shrinks your
validation code to a final type-guard. Add an optional `schema` to `GenerateOpts` and pass it
through `callGemini` (`responseSchema`) / `callOpenRouter` (`json_schema`).

### 5B-3 · A typed `generateObject<T>()` helper in `llm.ts`  — **Low**
Wrap `generate()` with a Zod schema so internal callers get parsed, typed objects and you
validate in one place. Two ways:
- **No new dep:** keep plain fetch + a hand-written type guard (matches current ethos).
- **With AI SDK:** `import { generateObject } from 'ai'` + Zod — less code, adds `ai` +
  `@ai-sdk/google`. Reasonable if you also adopt streaming/`useChat`.

### 5B-4 · A streaming primitive `generateStream()` in `llm.ts`  — **Med**
Add a sibling to `generate()` that yields tokens/partials via SSE, so the recommendations,
assistant, and briefing features share one streaming path with the same ladder/fallback logic.

### 5B-5 · Decide the SDK question deliberately
| | Plain `fetch` (today) | Vercel AI SDK 5 |
|---|---|---|
| Deps | none | `ai`, `@ai-sdk/google`, `@ai-sdk/openai-compatible` |
| Streaming | manual SSE parsing | `streamText`/`streamObject` built in |
| Structured output | hand-rolled / `responseSchema` | `generateObject` + Zod |
| Chat UI | build it | `useChat` hook |
| Your ladder/fallback | already perfect | you'd reimplement via `providerRegistry`/`fallback` |
| Ethos fit | ✅ matches "no SDK" | adds surface area |

**Recommendation:** stay plain-fetch for the *core* `generate()` (don't rewrite what works).
Adopt the AI SDK *only* if/when you build the streaming assistant (§4A-4) — `useChat` alone
justifies it there. Keep both behind the `llm.ts` boundary so callers don't care.

---

## 6. Cost / quota resilience

### 5C-1 · Pre-generate the global snapshot on Inngest  — **High value / Low effort** ★
You already run Inngest every 5 min (`/api/inngest`, push cron). Add a function that calls
`getRecommendations([])` (and the narrated briefing) on a schedule and writes them into the
same shared cache. Result: the **most common requests are always warm cache hits** — instant
for users, near-zero live quota, and no user ever waits on the model. This is the single best
cost+UX lever because the infrastructure already exists.

### 5C-2 · Maximize implicit cache hits via prompt ordering  — **Low**
Gemini 2.5+ implicit caching rewards a **stable prefix**. Put the invariant parts first
(system prompt, valid asset-id list) and the volatile market snapshot **last**. Your system
prompt is already static; just keep the asset-id catalogue ahead of the per-request snapshot.

### 5C-3 · Trim tokens  — **Low**
`composeContext` is `JSON.stringify(ctx, null, 2)` — the pretty-print whitespace is pure token
cost. Minify (`JSON.stringify(ctx)`) for the wire; keep indentation only in dev logs. Also cap
list lengths (you already slice movers/headlines — good).

### 5C-4 · Raise the OpenRouter floor  — **$10 one-time, optional**
If OpenRouter is a real fallback for you, the one-time $10 lifts the daily cap 50 → 1,000.
Otherwise the Gemini free tier (1,500 RPD × several models via the ladder) is plenty for now.

### 5C-5 · When to actually pay
Stay free until you hit *sustained* free-tier 429s on the global precompute path. The first
paid step is enabling billing on the Gemini project (note: that *removes* the free tier on
that project — use a separate project/key if you want to keep a free fallback).

---

## 7. Quality / grounding

### 5D-1 · Schema-enforced output  — see §5B-2
Guaranteeing the shape is the cheapest quality win; it removes a class of "dropped rec" bugs.

### 5D-2 · RAG over the newswire  — **High value / Med effort**
Your strongest grounding asset is the newswire you already parse. Embed headlines and retrieve
the most relevant ones for explanations/assistant answers so the model **cites real sources**
instead of paraphrasing from memory.
- **Embeddings:** `gemini-embedding-001` (free tier), 768/1536/3072 dims.
- **Vector store:** you already run **Upstash Redis** — use **Upstash Vector** (same vendor,
  free tier, zero new infra) to store headline embeddings; re-embed on the existing 10-min
  news refresh. Alternatives: Qdrant/Chroma if you outgrow it.
- Payoff: "explain this headline" and the assistant answer with *retrieved, attributable*
  context, which is the difference between "feels smart" and "feels trustworthy" for a markets
  tool. It also enables semantic **dedupe/clustering** of near-identical wire items.

### 5D-3 · Evals + telemetry before you scale surface area  — **Med, do early** ★
You already return `provider`/`model` telemetry — extend it into a feedback loop:
- **Offline golden set:** ~20 saved market snapshots → assert (a) schema validity, (b) every
  `assetId` exists, (c) no invented numbers, via a small script in CI. Catches regressions when
  you swap models in the ladder.
- **LLM-as-judge** for groundedness/specificity (you forbid generic advice in the prompt —
  measure it).
- **Observability:** for a lightweight start, log structured traces (prompt hash, model,
  latency, token estimate, degraded flag) to your existing store. If you want a UI,
  **Langfuse** (open-source, MIT, JS SDK) is the standard self-host option — but it needs
  Postgres/ClickHouse/Redis, so only adopt it once volume justifies the infra.

### 5D-4 · Anti-hallucination guardrails  — **Low**
You already instruct "do not invent data." Reinforce mechanically: keep raw numbers in the
*data* fields (which you validate) and out of free-text `rationale` where possible, and reject
recs whose `assetId` or referenced symbol isn't in the snapshot.

---

## 8. Suggested sequence

**Week 1 — quick wins, no new deps**
1. Refresh model ladder env (§5B-1)
2. Inngest global pre-generation (§5C-1)
3. Prompt ordering + token trim (§5C-2/3)
4. Native `responseSchema` structured output (§5B-2)

**Week 2 — first new feature + safety net**
5. "Explain this" feature + `/api/explain` route & rate-limit bucket (§4A-2)
6. Eval/telemetry harness in CI (§5D-3)
7. Stream the recommendations (§4A-1)

**Week 3+ — bigger bets**
8. RAG over newswire with Upstash Vector (§5D-2)
9. LLM-narrated briefing (§4A-5)
10. Grounded assistant with AI SDK `useChat` (§4A-4) — last, on top of the above

**Don't:** rewrite the working `generate()` ladder to chase an SDK; enable Gemini billing on
your only key (kills the free fallback); add an LLM to the render-blocking path without a
streaming or cache-warmed escape hatch; ship a new `/api/*` route without a `middleware.ts`
bucket (repo rule).

---

## Sources

- [AI SDK 5 — Vercel](https://vercel.com/blog/ai-sdk-5)
- [AI SDK Core: Output (generateObject / streamObject / Output.array)](https://ai-sdk.dev/docs/reference/ai-sdk-core/output)
- [Vercel AI SDK docs](https://vercel.com/docs/ai-sdk)
- [Gemini API Free Tier 2026: limits, quotas](https://pecollective.com/tools/gemini-free-tier-guide/)
- [Google AI Studio 2026: models + free tier](https://turion.ai/blog/google-ai-studio-2026-features-guide/)
- [Gemini context caching — official docs](https://ai.google.dev/gemini-api/docs/caching)
- [Gemini 2.5 implicit caching — Google Developers Blog](https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/)
- [OpenRouter free tier 2026: rate limits, BYOK](https://klymentiev.com/blog/openrouter-free-tier)
- [OpenRouter free models list (Jun 2026)](https://costgoat.com/pricing/openrouter-free-models)
- [Gemini Embeddings — official docs](https://ai.google.dev/gemini-api/docs/embeddings)
- [Gemini Embedding 2 — Google Developers Blog](https://developers.googleblog.com/building-with-gemini-embedding-2/)
- [LLM observability tools 2026 (Langfuse, Braintrust)](https://latitude.so/blog/best-llm-observability-tools-agents-latitude-vs-langfuse-langsmith)
