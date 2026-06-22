# Agentic Layer — Plan & Roadmap

> Plan date: 2026-06-20. Scope: evolve OpenTide's **single-shot** LLM features
> (`getRecommendations`, `getExplanation`) into an **agentic layer** — a model that
> fetches its own live data, screens & ranks markets across multiple steps, and
> holds a goal across a multi-turn conversation. Greenfield design, but mapped onto
> the files you already have and constrained by the repo rules in `CLAUDE.md`
> (every new route enforces rate limiting; conventional-commit messages).
>
> Companion to `docs/LLM_INTEGRATION_OPTIONS.md` — this picks up where that doc's
> §4A-4 "grounded assistant" left off.

---

## 1. Single-shot today vs. agentic target

What you have is an **inference pipeline**, not an agent. The route does the thinking
about *what data to gather*; the model only fills in the final text:

```
route (composeContext) → gather() pulls ALL routes in parallel → one generate() call → validate → return
```

The model never decides what it needs. It gets a fixed snapshot and emits JSON once.
That's the right design for a glanceable card — keep it. "Agentic" is a **different
shape** for a different job (open-ended questions, screening, dialog):

```
agent loop:  user goal
  └─► model decides next action ──► run a TOOL (fetch quotes, screen, search news…)
        ▲                                   │
        └───────── observe result ◄─────────┘   (repeat until model answers, or budget hit)
  └─► final grounded answer (streamed)
```

| Axis | Single-shot (today) | Agentic (target) |
|---|---|---|
| Who picks the data | the route (`gather()` pulls everything) | the **model**, one tool call at a time |
| Calls per request | exactly 1 | 1…N (bounded) |
| Shape | input → JSON out | observe → decide → act → loop |
| State | stateless | multi-turn conversation memory |
| Best for | the recommendations/explain cards | "why is BTC down?", "screen X", follow-ups |
| Cost profile | predictable, cacheable | variable — needs budgets + caps |

**Key principle: this is additive.** The agent does NOT replace `getRecommendations`
or `getExplanation`. Those stay as fast, cached, single-shot paths (and they become
*tools the agent can call*). The agent is a new surface for open-ended work.

---

## 2. The four capabilities → what each requires

You selected all four. Here's what each one actually demands from the architecture:

| Capability | Mechanism it needs |
|---|---|
| **Fetch live market data** | Tool calling + a tool registry wrapping your existing `/api/*` routes |
| **Screen & rank markets** | A `screen_markets` tool (deterministic filter/sort) the model invokes with structured args |
| **Multi-turn dialog** | A conversation message history + a `generateAgent()` loop that accepts prior turns |
| **Explain / summarize** | Reuse `getExplanation` as a tool, or let the agent answer directly from fetched context |

So the build is really **three new primitives** — (a) tool calling in `llm.ts`,
(b) a tool registry over your data, (c) an agent loop — plus one streaming route
and a thin chat UI. Everything else you already have.

---

## 3. Target architecture (greenfield, mapped to your tree)

```
src/lib/llm.ts            ← ADD generateAgent() + tool-calling to the ladder (keep generate())
src/lib/agent/
  ├─ runtime.ts           ← the observe→decide→act loop, step/token budgets, tracing
  ├─ tools.ts             ← tool registry: name, JSON-schema args, validated handler
  ├─ tools/
  │    ├─ getQuotes.ts        wraps /api/crypto|forex|stocks
  │    ├─ getPulse.ts         wraps /api/pulse
  │    ├─ getDerivs.ts        wraps /api/derivs
  │    ├─ getCalendar.ts      wraps /api/calendar
  │    ├─ getNews.ts          wraps /api/news (later: RAG, §LLM doc 5D-2)
  │    ├─ screenMarkets.ts    deterministic filter/rank over the asset universe
  │    ├─ explainItem.ts      reuses getExplanation()
  │    └─ getRecommendations.ts  reuses getRecommendations()
  ├─ session.ts           ← conversation store (Upstash Redis), TTL'd, per-session id
  └─ guardrails.ts        ← system prompt, refusal rules, output filters, "no execution"
src/app/api/assistant/route.ts  ← NEW streaming, multi-turn endpoint (rate-limited!)
src/components/Assistant.tsx     ← chat panel (self-hiding when no key, like AiInsights)
```

Nothing here breaks the existing `generate()` ladder, the recommendations route, or
the explain route. The agent is a parallel stack that *calls into* them.

---

## 4. Component-by-component

### 4.1 · Tool calling in `llm.ts` — the core enabler  ★ start here
Today `generate()` returns text. Add a sibling `generateAgent()` (or extend `GenerateOpts`
with `tools`) that:

- Passes a **tool/function declaration list** to the provider:
  - Gemini: `tools: [{ functionDeclarations: [...] }]` on `generateContent`; the response
    may contain a `functionCall` part instead of text.
  - OpenRouter (OpenAI-compatible): `tools: [{ type: "function", function: {...} }]`;
    response has `tool_calls`.
- Returns a discriminated result: `{ type: "text", … }` **or** `{ type: "tool_call", name, args }`.
- **Preserves the ladder & fallback ethos.** Tool calling is uneven across free models —
  Gemini Flash supports it well; some OpenRouter free models don't. So: keep a
  *tool-capable* sub-ladder for the agent (Gemini first), and treat a `400` on tools as
  provider-fatal exactly like the existing `PROVIDER_FATAL` logic. Plain `generate()` is
  untouched.
- Stays **plain `fetch`, no SDK** for the core — same as today. (See §6 on the AI SDK
  trade-off if/when you want `useChat` streaming UX.)

### 4.2 · Tool registry (`agent/tools.ts`)
Each tool is `{ name, description, parameters (JSON-schema), handler }`. The handler
reuses code you already have — your `readRoute<T>()` helper in the recommendations route
is exactly the right pattern; lift it into a shared `lib/internalFetch.ts`.

Start with **read-only tools only.** This is non-negotiable for a markets product:
the agent can *read* anything and *recommend*, but it has **no tool that places an order,
moves money, or mutates state.** That property should be structural (no such handler
exists), not just prompt-instructed.

Suggested v1 toolset:

| Tool | Wraps | Args |
|---|---|---|
| `get_quotes` | `/api/crypto`,`/forex`,`/stocks` | `{ market, symbols[] }` |
| `get_pulse` | `/api/pulse` | `{}` |
| `get_funding` | `/api/derivs` | `{ topN? }` |
| `get_calendar` | `/api/calendar` | `{ impact?, withinHours? }` |
| `get_news` | `/api/news` | `{ assets?, limit? }` |
| `screen_markets` | new, deterministic | `{ market?, minChangePct?, sentiment?, sortBy?, limit? }` |
| `explain_item` | `getExplanation()` | the existing `ExplainTarget` |

`screen_markets` is the heart of "screen & rank": it does **no LLM work** — it filters/sorts
the asset universe (`ASSET_BY_ID` + the quote payloads) and returns rows. The model picks
the *criteria*; the code does the *math*. Same philosophy as your "keep the LLM out of the
render path" note in the LLM doc (§4A-3). Validate every arg against the universe exactly
like `sanitizeWatchlist` / `sanitizeTarget` already do.

### 4.3 · Agent runtime (`agent/runtime.ts`)
A bounded loop:

```
for step in 1..MAX_STEPS (e.g. 6):
   result = generateAgent(messages, tools)
   if result is text → return it (done)
   if result is tool_call:
       output = registry[name].handler(validatedArgs)   // never throws; returns {error} on fail
       append tool_call + tool_result to messages
   enforce: token budget, wall-clock budget, dedupe identical calls
return best-effort answer or graceful degrade
```

Hard limits matter more here than anywhere else in the codebase, because cost is no longer
fixed at 1 call:

- `MAX_STEPS` (≈4–6) — caps the loop; prevents runaway tool churn.
- **Per-conversation token + wall-clock budget** — degrade to a partial answer when hit.
- **Duplicate-call guard** — if the model requests the same tool+args twice, short-circuit.
- Reuse `TIMEOUT_MS` per provider attempt; add a separate whole-conversation deadline.

### 4.4 · Multi-turn state (`agent/session.ts`)
You already run **Upstash Redis** (rate limiter) — reuse it. Store conversation history under
a `sessionId` (client-generated, in `localStorage` — you already use `localStorage` for the
"while you were away" diff). TTL each session (e.g. 1–2h). Cap stored turns and total tokens
so history can't grow unbounded. No accounts needed, consistent with the app's no-auth posture.

### 4.5 · The route (`/api/assistant`) — **must be rate-limited (CLAUDE.md)**
`POST /api/assistant { sessionId, message }`, streaming (SSE). Per `CLAUDE.md`, **every new
route enforces rate limiting**, so before this ships:

- Add `/api/assistant` to a bucket in `src/middleware.ts`. Give it its **own** budget,
  stricter than `api-ai` (10/min) because one agent request fans out into several upstream
  calls — e.g. an `api-agent` bucket at ~5/IP/min, plus a per-session concurrency cap of 1
  (no overlapping loops for one session).
- Keep the **graceful-degradation** contract: no key, or all providers fail → a friendly
  "assistant unavailable" message and the UI self-hides, exactly like `AiInsights`. Never 502.
- Caching is weaker here (conversations are unique), so the budget + the precomputed
  single-shot tools are your main quota defense.

### 4.6 · UI (`components/Assistant.tsx`)
A `useChat`-style panel. Stream tokens in; render tool calls as subtle "checking funding…",
"screening crypto…" status chips so the multi-step work is legible (and reassuring). Self-hide
when `llmEnabled()` is false. Reuse the tap-to-chart affordance from `AiInsights` for any
asset the answer references.

---

## 5. Guardrails & safety (non-optional for a markets agent)

1. **No execution, ever.** No tool mutates state, places orders, or moves money — enforced by
   the registry, not just the prompt. Surfacing and explaining ideas is fine; acting is the
   user's job. (This also matches the platform's financial-action rule.)
2. **Grounding.** The agent answers from tool outputs, not memory. Forbid invented numbers
   (you already do this in the recommendations/explain prompts); reject/strip any asset id or
   symbol not present in the fetched data, reusing your `ASSET_BY_ID` membership checks.
3. **Not financial advice.** Carry the existing disclaimer posture into the system prompt and
   the UI. Measured tone, flag risk, no "buy/sell at price X" calls.
4. **Arg validation.** Every tool arg is sanitized against the universe before the handler runs
   — extend the `sanitizeWatchlist` / `sanitizeTarget` pattern to each tool.
5. **Budgets as safety.** `MAX_STEPS`, token/time budgets, duplicate-call guard, per-session
   concurrency 1. A bug or adversarial prompt can't run up unbounded free-tier quota.
6. **Prompt-injection awareness.** News headlines flow into context; treat tool-returned text
   as data, never as instructions. Keep the system prompt authoritative and don't let retrieved
   content redefine the agent's rules.

---

## 6. The SDK question (revisited for agents)

Your LLM doc concluded: stay plain-`fetch` for core `generate()`, adopt the Vercel AI SDK only
when you build the streaming assistant. **This is that moment** — but it's still optional:

| | Plain `fetch` (your ethos) | Vercel AI SDK 5 |
|---|---|---|
| Tool loop | you write `runtime.ts` (~150 lines) | `streamText` + `tools` + `maxSteps` built in |
| Streaming | manual SSE parse | `useChat` / `streamText` |
| Ladder/fallback | **already perfect** in `llm.ts` | you'd reimplement via provider registry |
| Deps | none | `ai`, `@ai-sdk/google`, `@ai-sdk/openai-compatible` |

**Recommendation:** build the *runtime + tools* yourself (it's not much code and keeps your
ladder/fallback, which the SDK would force you to re-create). Consider the AI SDK **only** for
the **UI streaming layer** (`useChat`) if hand-rolling SSE proves annoying. Keep both behind the
`llm.ts` boundary so callers don't care which is underneath.

---

## 7. Evals & telemetry — do this early

An agent has more ways to go wrong than a single call, so the eval harness from the LLM doc
(§5D-3) becomes a prerequisite, not a nicety:

- **Trajectory traces.** Log every step: tool calls + args, tool latency, model/provider,
  tokens, total steps, degraded flag. You already return `provider`/`model` telemetry — extend it.
- **Golden tasks.** ~15 saved (question → expected tool path) cases. Assert: stays within
  `MAX_STEPS`, calls plausible tools, no invented asset ids, ends with a grounded answer.
  Run in CI so swapping the ladder (or models churning) can't silently regress behavior.
- **LLM-as-judge** for groundedness/specificity and a "did it refuse to give execution/advice"
  check.
- **Cost watch.** Alert on avg steps/conversation and free-tier 429 rate — your earliest signal
  to precompute more or raise a quota floor.

---

## 8. Suggested sequence

**Phase 0 — foundations (no new user surface)**
1. `generateAgent()` + tool calling in `llm.ts`, tool-capable sub-ladder, plain `fetch`. (§4.1)
2. Tool registry + 3 read-only tools (`get_quotes`, `get_pulse`, `get_news`); lift `readRoute`
   into `lib/internalFetch.ts`. (§4.2)
3. `runtime.ts` loop with `MAX_STEPS` + token/time budgets + dedupe. (§4.3)
4. Trace logging + a 10-case golden eval in CI. (§7)

**Phase 1 — first agent surface**
5. `screen_markets` tool (deterministic) + `explain_item`/`get_recommendations` tools. (§4.2)
6. `/api/assistant` **single-turn** (no history yet), streaming, **wired into a new
   `api-agent` rate-limit bucket in `middleware.ts`.** (§4.5)
7. `Assistant.tsx` panel, self-hiding, tool-status chips. (§4.6)

**Phase 2 — multi-turn + grounding**
8. `session.ts` conversation memory on Upstash Redis; per-session concurrency 1. (§4.4)
9. RAG over the newswire so the agent **cites** headlines (builds on LLM doc §5D-2). (§4.2)
10. Harden guardrails (injection, refusal evals), expand golden set. (§5, §7)

**Phase 3 — proactive**
11. Inngest-scheduled agent runs (e.g. a daily "what changed & what to watch" digest) reusing
    the same toolset, written to cache/push — leverages infra you already have.

---

## 9. Don'ts

- **Don't** replace the recommendations/explain cards with the agent — keep them fast, cached,
  single-shot, and expose them *as tools*.
- **Don't** ship `/api/assistant` without a `middleware.ts` bucket (repo rule) — and don't let
  it share the `api-ai` budget; the fan-out is bigger.
- **Don't** give the agent any tool that trades, transfers, or mutates — read-only by construction.
- **Don't** rewrite the working `generate()` ladder to adopt an SDK; add a sibling path instead.
- **Don't** run the loop without `MAX_STEPS` + token/time budgets — variable cost is the whole
  risk of going agentic.
- **Don't** trust tool-returned text (headlines) as instructions — it's data, the system prompt
  is law.
- **Don't** skip traces/evals "for now" — an agent's failure modes are multi-step and invisible
  without them.

---

## 10. First commit (per `CLAUDE.md` conventional-commit rule)

```
feat(agent): add tool-calling generateAgent() to the llm ladder

Adds a sibling to generate() that passes function declarations to Gemini /
OpenRouter and returns a text|tool_call result, preserving the existing
ladder + class-aware fallback. No change to generate(); plain fetch, no SDK.
```
