// ---------------------------------------------------------------------------
// llm.ts — provider-agnostic LLM access with a MODEL LADDER + automatic fallback.
//
// One `generate()` entry point walks an ordered list of (provider, model)
// attempts and returns the first success:
//
//   gemini:2.5-flash → gemini:2.0-flash → gemini:2.5-flash-lite
//     → openrouter:llama-3.3-70b → openrouter:deepseek-v3 → openrouter:qwen-2.5-72b
//
// Why a ladder: free quota on Gemini is PER-MODEL, so a 429 on one model is a
// fresh bucket on the next — and OpenRouter's free models route to different
// upstream providers, so swapping dodges a throttled one. Error handling is
// class-aware: a 429 / 5xx / timeout advances to the next model, but an
// auth/bad-request (400/401/403/404) skips the rest of THAT provider's models
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
const DEFAULT_OPENROUTER_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "qwen/qwen-2.5-72b-instruct:free",
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
// same way, so skip the rest of that provider's ladder.
const PROVIDER_FATAL = new Set([400, 401, 403, 404]);

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

/** fetch with an AbortController timeout. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: opts.temperature ?? 0.4,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
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
 * non-empty result wins. On a retryable failure (429 / 5xx / timeout) advance
 * to the next model; on an auth/bad-request failure skip the rest of that
 * provider's models. Throws LlmUnavailableError only if every attempt fails.
 */
export async function generate(
  messages: LlmMessage[],
  opts: GenerateOpts = {},
): Promise<LlmResult> {
  const attempts = buildAttempts(messages, opts);
  if (attempts.length === 0) throw new LlmUnavailableError();

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
