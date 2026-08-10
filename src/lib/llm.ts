// ---------------------------------------------------------------------------
// llm.ts — provider-agnostic LLM access with a MODEL LADDER + automatic fallback.
//
// One `generate()` entry point walks an ordered list of (provider, model)
// attempts and returns the first success:
//
//   gemini:2.5-flash → gemini:2.0-flash → gemini:2.5-flash-lite
//     → openrouter/free
//
// Why a ladder: free quota on Gemini is PER-MODEL, so a 429 on one model is a
// fresh bucket on the next — and OpenRouter's free models route to different
// upstream providers, so swapping dodges a throttled one. Error handling is
// class-aware: a 404 / 429 / 5xx / timeout advances to the next model, but an
// auth/bad-request (400/401/403) skips the rest of THAT provider's models
// (they'd fail identically) and jumps to the next provider.
//
// Reached with plain `fetch` — no SDKs, no new deps. Ladders are env-overridable
// (GEMINI_MODELS / OPENROUTER_MODELS, comma-separated) so model churn never
// needs a code change. Configure no keys and the whole thing reports
// unavailable; callers degrade gracefully.
// ---------------------------------------------------------------------------

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// Defaults: flash-tier / free models, each in a SEPARATE quota bucket. "Best"
// here means good-enough quality with independent limits — not a pricey Pro
// model (Gemini Pro's free quota is far smaller and worse for this).
const DEFAULT_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
];
// NOTE: specific free OpenRouter slugs churn: a model can go paid and its
// `:free` variant then returns 404. The generic free router keeps the fallback
// usable without code changes, while OPENROUTER_MODELS remains available when
// you want to pin specific slugs.
const DEFAULT_OPENROUTER_MODELS = [
  "openrouter/free",
];

/** Read a comma-separated ladder from env, honoring the legacy singular var,
 *  else the built-in defaults. */
function modelLadder(
  pluralVar: string,
  singularVar: string,
  defaults: string[],
): string[] {
  const raw = process.env[pluralVar] || process.env[singularVar];
  if (!raw) return defaults;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : defaults;
}

const GEMINI_MODELS = modelLadder(
  "GEMINI_MODELS",
  "GEMINI_MODEL",
  DEFAULT_GEMINI_MODELS,
);
const OPENROUTER_MODELS = modelLadder(
  "OPENROUTER_MODELS",
  "OPENROUTER_MODEL",
  DEFAULT_OPENROUTER_MODELS,
);

// Per-attempt wall-clock budget. Recommendations are non-blocking UI, so we'd
// rather advance the ladder / degrade than hang a request.
const TIMEOUT_MS = 12_000;

// Auth / bad-request statuses: every model of the same provider will fail the
// same way, so skip the rest of that provider's ladder. 404 is deliberately not
// fatal because free model slugs disappear independently; the next rung may work.
const PROVIDER_FATAL = new Set([400, 401, 403]);

export type LlmProvider = "gemini" | "openrouter";

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmResult {
  text: string;
  provider: LlmProvider;
  /** The specific model that produced the result (telemetry). */
  model: string;
}

export interface GenerateOpts {
  /** Ask the provider for strict JSON output (response_format / responseMimeType). */
  json?: boolean;
  /** 0–1, lower = more deterministic. Defaults to 0.4 for grounded analysis. */
  temperature?: number;
  /**
   * OpenAPI-subset JSON schema to HARD-constrain the output shape. Applied on
   * Gemini via `responseSchema` (the model is forced to emit conforming JSON),
   * which drops the "malformed item" failure mode at the source. Implies JSON
   * mode. OpenRouter free models don't reliably support `json_schema` and a
   * 400 there would short-circuit the whole provider in our ladder, so on the
   * fallback path we stay on plain `json_object` and lean on the prompt +
   * caller-side validation — same guarantees as before, just no regression.
   */
  schema?: Record<string, unknown>;
  /**
   * Per-attempt wall-clock budget (ms). Defaults to TIMEOUT_MS (12s). Latency-
   * sensitive callers (e.g. the AI-insights card) pass a tighter value so a
   * slow/stalled model is abandoned for the next rung sooner.
   */
  timeoutMs?: number;
  /**
   * Cap on how many ladder rungs to try before giving up. Defaults to the full
   * ladder. Trades a little fallback resiliency for a bounded worst-case
   * latency (worst case ≈ maxAttempts × timeoutMs).
   */
  maxAttempts?: number;
}

/** Thrown only when NO attempt produced a result. Callers catch this and
 *  surface a degraded (non-AI) state rather than a 500. */
export class LlmUnavailableError extends Error {
  constructor(message = "No LLM provider available") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

/** Carries the HTTP status (or null for network/timeout/empty) so generate()
 *  can classify whether to advance the ladder or skip the provider. */
class ProviderError extends Error {
  constructor(
    public provider: LlmProvider,
    public model: string,
    public status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** True when at least one provider key is configured. */
export function llmEnabled(): boolean {
  return Boolean(GEMINI_KEY || OPENROUTER_KEY);
}

/** fetch with an AbortController timeout (defaults to TIMEOUT_MS). */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

// --- Gemini (Google AI Studio, generateContent) ---------------------------
async function callGemini(
  model: string,
  messages: LlmMessage[],
  opts: GenerateOpts,
): Promise<string> {
  const system = messages.find((m) => m.role === "system")?.content;
  const userParts = messages
    .filter((m) => m.role === "user")
    .map((m) => ({ text: m.content }));

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: userParts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      // A schema implies JSON mode. responseSchema forces conforming output.
      ...(opts.json || opts.schema ? { responseMimeType: "application/json" } : {}),
      ...(opts.schema ? { responseSchema: opts.schema } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_KEY as string,
        },
        body: JSON.stringify(body),
      },
      opts.timeoutMs,
    );
  } catch (e) {
    // Network error / timeout (AbortError) → retryable (null status).
    throw new ProviderError(
      "gemini",
      model,
      null,
      e instanceof Error ? e.message : "network error",
    );
  }
  if (!res.ok) {
    throw new ProviderError(
      "gemini",
      model,
      res.status,
      `${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new ProviderError("gemini", model, null, "empty completion");
  return text;
}

// --- OpenRouter (OpenAI-compatible chat completions) ----------------------
async function callOpenRouter(
  model: string,
  messages: LlmMessage[],
  opts: GenerateOpts,
): Promise<string> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_KEY as string}`,
          "HTTP-Referer": process.env.APP_URL || "https://opentide.app",
          "X-Title": "OpenTide",
        },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: opts.temperature ?? 0.4,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      opts.timeoutMs,
    );
  } catch (e) {
    throw new ProviderError(
      "openrouter",
      model,
      null,
      e instanceof Error ? e.message : "network error",
    );
  }
  if (!res.ok) {
    throw new ProviderError(
      "openrouter",
      model,
      res.status,
      `${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text)
    throw new ProviderError("openrouter", model, null, "empty completion");
  return text;
}

interface Attempt {
  provider: LlmProvider;
  model: string;
  run: () => Promise<string>;
}

/** Flatten the configured ladders into an ordered attempt list. Providers
 *  without a key contribute nothing. */
function buildAttempts(messages: LlmMessage[], opts: GenerateOpts): Attempt[] {
  const attempts: Attempt[] = [];
  if (GEMINI_KEY) {
    for (const model of GEMINI_MODELS) {
      attempts.push({
        provider: "gemini",
        model,
        run: () => callGemini(model, messages, opts),
      });
    }
  }
  if (OPENROUTER_KEY) {
    for (const model of OPENROUTER_MODELS) {
      attempts.push({
        provider: "openrouter",
        model,
        run: () => callOpenRouter(model, messages, opts),
      });
    }
  }
  return attempts;
}

/**
 * Generate a completion, walking the model ladder across providers. First
 * non-empty result wins. On a retryable failure (404 / 429 / 5xx / timeout)
 * advance to the next model; on an auth/bad-request failure skip the rest of that
 * provider's models. Throws LlmUnavailableError only if every attempt fails.
 */
export async function generate(
  messages: LlmMessage[],
  opts: GenerateOpts = {},
): Promise<LlmResult> {
  const all = buildAttempts(messages, opts);
  if (all.length === 0) throw new LlmUnavailableError();

  // Optionally cap the ladder so worst-case latency is bounded for latency-
  // sensitive callers (≈ maxAttempts × timeoutMs).
  const attempts =
    opts.maxAttempts && opts.maxAttempts > 0
      ? all.slice(0, opts.maxAttempts)
      : all;

  const errors: string[] = [];
  const skip = new Set<LlmProvider>();

  for (const { provider, model, run } of attempts) {
    if (skip.has(provider)) continue;
    try {
      const text = await run();
      return { text, provider, model };
    } catch (err) {
      const status = err instanceof ProviderError ? err.status : null;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider}:${model} → ${msg}`);
      console.warn(`[llm] ${provider}:${model} failed:`, msg);

      // Auth / bad request: the rest of this provider's ladder will fail the
      // same way, so don't waste calls — jump to the next provider.
      if (status !== null && PROVIDER_FATAL.has(status)) skip.add(provider);
    }
  }

  throw new LlmUnavailableError(`All providers failed: ${errors.join(" || ")}`);
}

// ===========================================================================
// AGENT MODE — tool-calling on top of the SAME ladder + fallback.
//
// generate() above is single-shot text. generateAgent() is its sibling for the
// agentic layer: it sends a list of TOOL declarations and may return a request
// to CALL a tool instead of a final answer. The runtime (agent/runtime.ts)
// drives the observe→decide→act loop; this function is one turn of it.
//
// Same ethos as generate(): plain fetch (no SDK), env-overridable ladder,
// class-aware fallback (429/5xx/timeout → next model; 400/401/403/404 → skip
// the rest of that provider). Tool calling is uneven across free models, so the
// ladder is Gemini-first (reliable function calling); a tools-related 400 on a
// provider is treated as provider-fatal exactly like any other bad request, so
// we degrade to the next provider rather than looping.
// ===========================================================================

/** A tool the model may call. `parameters` is a provider-agnostic JSON-schema
 *  object (OpenAPI subset) describing the args. */
export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A model's request to invoke a tool with concrete args. */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Provider-agnostic conversation message, including tool turns. The runtime
 *  builds these; each provider adapter translates to its own wire shape. */
export type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content?: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

/** One turn's result: either a final text answer, or tool calls to run (or
 *  both — we prefer toolCalls when present). */
export interface AgentResult {
  provider: LlmProvider;
  model: string;
  content: string | null;
  toolCalls?: ToolCall[];
}

export interface AgentOpts {
  /** 0–1; defaults to 0.2 — agent steps should be near-deterministic. */
  temperature?: number;
}

let toolCallSeq = 0;
function nextToolCallId(): string {
  return `tc_${Date.now().toString(36)}_${(toolCallSeq++).toString(36)}`;
}

/**
 * Translate a standard (lowercase) JSON-schema into the shape Gemini's REST
 * function declarations require: the `type` field is the Type ENUM and must be
 * UPPERCASE ("object" → "OBJECT"). A malformed schema 400s, which our ladder
 * treats as provider-fatal — so a lowercase type silently kills every Gemini
 * attempt. (Same gotcha documented for responseSchema in recommendations.ts.)
 * OpenRouter keeps the lowercase JSON-schema as-is, so we only normalise here.
 * Recurses through `properties` and `items`.
 */
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "type" && typeof v === "string") {
      out.type = v.toUpperCase();
    } else if (k === "properties" && v && typeof v === "object") {
      const props: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        props[pk] = toGeminiSchema(pv);
      }
      out.properties = props;
    } else if (k === "items") {
      out.items = toGeminiSchema(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// --- Gemini agent turn ------------------------------------------------------
async function callGeminiAgent(
  model: string,
  messages: AgentMessage[],
  tools: LlmTool[],
  opts: AgentOpts,
): Promise<Omit<AgentResult, "provider" | "model">> {
  // System messages → a single systemInstruction; everything else → contents.
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => (m as { content: string }).content)
    .join("\n");

  const contents: Array<{ role: "user" | "model"; parts: unknown[] }> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls ?? [])
        parts.push({ functionCall: { name: tc.name, args: tc.args } });
      if (parts.length) contents.push({ role: "model", parts });
    } else {
      // tool result — Gemini expects a functionResponse with an OBJECT payload.
      let response: unknown;
      try {
        response = JSON.parse(m.content);
      } catch {
        response = { result: m.content };
      }
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: m.name, response } }],
      });
    }
  }

  const body: Record<string, unknown> = {
    contents,
    tools: [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: toGeminiSchema(t.parameters),
        })),
      },
    ],
    generationConfig: { temperature: opts.temperature ?? 0.2 },
  };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_KEY as string,
        },
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    throw new ProviderError(
      "gemini",
      model,
      null,
      e instanceof Error ? e.message : "network error",
    );
  }
  if (!res.ok) {
    throw new ProviderError(
      "gemini",
      model,
      res.status,
      `${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          functionCall?: { name?: string; args?: Record<string, unknown> };
        }>;
      };
    }>;
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  const toolCalls: ToolCall[] = parts
    .filter((p) => p.functionCall?.name)
    .map((p) => ({
      id: nextToolCallId(),
      name: p.functionCall!.name as string,
      args: p.functionCall!.args ?? {},
    }));

  if (!text && toolCalls.length === 0)
    throw new ProviderError("gemini", model, null, "empty completion");
  return { content: text || null, ...(toolCalls.length ? { toolCalls } : {}) };
}

// --- OpenRouter agent turn (OpenAI-compatible tools) ------------------------
async function callOpenRouterAgent(
  model: string,
  messages: AgentMessage[],
  tools: LlmTool[],
  opts: AgentOpts,
): Promise<Omit<AgentResult, "provider" | "model">> {
  const wire = messages.map((m) => {
    if (m.role === "assistant") {
      return {
        role: "assistant",
        content: m.content ?? null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: { name: tc.name, arguments: JSON.stringify(tc.args) },
              })),
            }
          : {}),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    return { role: m.role, content: m.content };
  });

  let res: Response;
  try {
    res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_KEY as string}`,
        "HTTP-Referer": process.env.APP_URL || "https://opentide.app",
        "X-Title": "OpenTide",
      },
      body: JSON.stringify({
        model,
        messages: wire,
        temperature: opts.temperature ?? 0.2,
        tools: tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      }),
    });
  } catch (e) {
    throw new ProviderError(
      "openrouter",
      model,
      null,
      e instanceof Error ? e.message : "network error",
    );
  }
  if (!res.ok) {
    throw new ProviderError(
      "openrouter",
      model,
      res.status,
      `${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };
  const msg = json.choices?.[0]?.message;
  const content = msg?.content?.trim() || null;
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? [])
    .filter((t) => t.function?.name)
    .map((t) => {
      let args: Record<string, unknown> = {};
      try {
        args = t.function?.arguments ? JSON.parse(t.function.arguments) : {};
      } catch {
        args = {};
      }
      return { id: t.id ?? nextToolCallId(), name: t.function!.name as string, args };
    });

  if (!content && toolCalls.length === 0)
    throw new ProviderError("openrouter", model, null, "empty completion");
  return { content, ...(toolCalls.length ? { toolCalls } : {}) };
}

interface AgentAttempt {
  provider: LlmProvider;
  model: string;
  run: () => Promise<Omit<AgentResult, "provider" | "model">>;
}

/** Tool-capable ladder: Gemini first (reliable function calling), OpenRouter
 *  after. Reuses the same env-overridable model lists as generate(). */
function buildAgentAttempts(
  messages: AgentMessage[],
  tools: LlmTool[],
  opts: AgentOpts,
): AgentAttempt[] {
  const attempts: AgentAttempt[] = [];
  if (GEMINI_KEY) {
    for (const model of GEMINI_MODELS) {
      attempts.push({
        provider: "gemini",
        model,
        run: () => callGeminiAgent(model, messages, tools, opts),
      });
    }
  }
  if (OPENROUTER_KEY) {
    for (const model of OPENROUTER_MODELS) {
      attempts.push({
        provider: "openrouter",
        model,
        run: () => callOpenRouterAgent(model, messages, tools, opts),
      });
    }
  }
  return attempts;
}

/**
 * One agent turn across the tool-capable ladder. Returns the first provider
 * that yields either a final answer or tool calls. Same fallback rules as
 * generate(). Throws LlmUnavailableError only if every attempt fails.
 */
export async function generateAgent(
  messages: AgentMessage[],
  tools: LlmTool[],
  opts: AgentOpts = {},
): Promise<AgentResult> {
  const attempts = buildAgentAttempts(messages, tools, opts);
  if (attempts.length === 0) throw new LlmUnavailableError();

  const errors: string[] = [];
  const skip = new Set<LlmProvider>();

  for (const { provider, model, run } of attempts) {
    if (skip.has(provider)) continue;
    try {
      const out = await run();
      return { provider, model, ...out };
    } catch (err) {
      const status = err instanceof ProviderError ? err.status : null;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider}:${model} → ${msg}`);
      console.warn(`[llm:agent] ${provider}:${model} failed:`, msg);
      if (status !== null && PROVIDER_FATAL.has(status)) skip.add(provider);
    }
  }

  throw new LlmUnavailableError(`All providers failed: ${errors.join(" || ")}`);
}
