// ---------------------------------------------------------------------------
// explain.ts — on-demand, plain-English "what is this & why might it matter"
// for a single market object the user tapped: a news headline, a calendar
// event, or a funding extreme.
//
// Same posture as recommendations.ts: token-lean prompt, STRICT JSON against a
// fixed schema (hard-enforced on Gemini via responseSchema), every field
// validated, never throws. If no provider key is configured (or all fail) the
// caller gets { degraded: true } and the UI simply doesn't offer the affordance.
//
// Not financial advice — the prompt and UI both keep it descriptive.
// ---------------------------------------------------------------------------

import { generate, type LlmMessage, type LlmProvider } from "./llm";

export type ExplainKind = "headline" | "event" | "funding" | "mover";

/** Discriminated request — one shape per tappable object. Kept minimal so the
 *  cache key is stable and the token cost is tiny. */
export type ExplainTarget =
  | { kind: "headline"; title: string; source?: string; market?: string; assets?: string[] }
  | { kind: "event"; title: string; country?: string; impact?: string }
  | { kind: "funding"; symbol: string; ratePct: number }
  | { kind: "mover"; symbol: string; name?: string; market?: string; changePct: number };

export interface ExplainResult {
  /** 1 sentence: what the thing is, in plain language. */
  what: string;
  /** 1-2 sentences: why a trader watching this app might care today. */
  why: string;
  /** Optional one-liner on the risk / what could go wrong. */
  risk?: string;
  provider?: LlmProvider;
  ts: number;
  /** True when AI was unavailable; what/why are empty. */
  degraded: boolean;
  /** Dev-only failure reason when degraded. */
  error?: string;
}

// OpenAPI-subset schema → Gemini responseSchema (see llm.ts). UPPERCASE types:
// the REST Schema enum is case-sensitive and a bad schema 400s (fatal for the
// provider in our ladder). Shape only; parseExplanation() does the rest.
const EXPLAIN_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    what: { type: "STRING" },
    why: { type: "STRING" },
    risk: { type: "STRING", nullable: true },
  },
  required: ["what", "why"],
};

const SYSTEM = [
  "You explain a single market item to a retail trader using OpenTide, a real-time markets dashboard.",
  "Be concrete, neutral and brief. No hype, no price targets, no 'buy/sell' calls — this is education, not advice.",
  "Ground the explanation in what the item plainly is; do not invent specific numbers, dates or events not given.",
  "If you genuinely don't recognise the item, explain the general category it belongs to rather than guessing specifics.",
  "",
  "Respond with ONLY a JSON object of this exact shape (no markdown, no prose):",
  '{ "what": string, "why": string, "risk": string|null }',
  "what: <= 1 sentence, plain language. why: 1-2 sentences on why it might matter today. risk: <= 1 sentence or null.",
].join("\n");

/** Render the tapped object into a compact user prompt. */
function describeTarget(t: ExplainTarget): string {
  switch (t.kind) {
    case "headline":
      return [
        "Explain this NEWS HEADLINE:",
        `Headline: ${t.title}`,
        t.source ? `Source: ${t.source}` : "",
        t.market ? `Market: ${t.market}` : "",
        t.assets?.length ? `Tagged assets: ${t.assets.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "event":
      return [
        "Explain this ECONOMIC CALENDAR EVENT:",
        `Event: ${t.title}`,
        t.country ? `Country: ${t.country}` : "",
        t.impact ? `Expected impact: ${t.impact}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "funding":
      return [
        "Explain this PERPETUAL FUTURES FUNDING reading:",
        `Symbol: ${t.symbol}`,
        `Funding rate: ${t.ratePct}% (positive = longs pay shorts; negative = shorts pay longs)`,
        "Cover what funding rate means and what this sign/magnitude implies about positioning.",
      ].join("\n");
    case "mover":
      return [
        "Explain why this asset is a TOP MOVER right now:",
        `Asset: ${t.name ? `${t.name} (${t.symbol})` : t.symbol}`,
        t.market ? `Market: ${t.market}` : "",
        `Move: ${t.changePct >= 0 ? "+" : ""}${t.changePct}% so far`,
        "Explain what a large move like this generally signals and what tends to drive it; do not invent a specific news catalyst you weren't given.",
      ]
        .filter(Boolean)
        .join("\n");
  }
}

function buildMessages(t: ExplainTarget): LlmMessage[] {
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `${describeTarget(t)}\n\nReturn the JSON object now.` },
  ];
}

/** Pull the first JSON object out of a possibly-fenced model response. */
function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return end > start && start >= 0 ? body.slice(start, end + 1) : body;
}

/** Parse + validate. Returns null if nothing usable came back. */
function parseExplanation(text: string): Pick<ExplainResult, "what" | "why" | "risk"> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJsonObject(text));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const what = typeof o.what === "string" ? o.what.trim() : "";
  const why = typeof o.why === "string" ? o.why.trim() : "";
  if (!what || !why) return null;

  const risk = typeof o.risk === "string" && o.risk.trim() ? o.risk.trim() : undefined;
  // Cap lengths so a runaway response can't bloat the cache or the card.
  return {
    what: what.slice(0, 400),
    why: why.slice(0, 600),
    ...(risk ? { risk: risk.slice(0, 400) } : {}),
  };
}

/**
 * One-shot: build prompt → call LLM (Gemini → OpenRouter) → validate.
 * Never throws; returns a degraded result if AI is unavailable.
 */
export async function getExplanation(t: ExplainTarget): Promise<ExplainResult> {
  try {
    const { text, provider } = await generate(buildMessages(t), {
      json: true,
      schema: EXPLAIN_SCHEMA,
      temperature: 0.3,
    });
    const parsed = parseExplanation(text);
    if (!parsed) {
      return {
        what: "",
        why: "",
        ts: Date.now(),
        degraded: true,
        ...(process.env.NODE_ENV !== "production"
          ? { error: "LLM returned no parseable explanation" }
          : {}),
      };
    }
    return { ...parsed, provider, ts: Date.now(), degraded: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[explain] failed:", message);
    return {
      what: "",
      why: "",
      ts: Date.now(),
      degraded: true,
      ...(process.env.NODE_ENV !== "production" ? { error: message } : {}),
    };
  }
}

/** Stable, length-bounded cache key for a target (route-level shared cache). */
export function explainCacheKey(t: ExplainTarget): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
  switch (t.kind) {
    case "headline":
      return `h:${norm(t.title)}`;
    case "event":
      return `e:${norm(t.title)}|${norm(t.country ?? "")}`;
    case "funding":
      // Bucket the rate so near-identical readings share one explanation.
      return `f:${t.symbol.toUpperCase()}|${t.ratePct >= 0 ? "+" : "-"}`;
    case "mover":
      // Bucket by symbol + direction — magnitude varies tick to tick, the
      // explanation of "why a big move happens" doesn't.
      return `m:${t.symbol.toUpperCase()}|${t.changePct >= 0 ? "+" : "-"}`;
  }
}

/** Validate + normalize an untrusted request body into an ExplainTarget. */
export function sanitizeTarget(input: unknown): ExplainTarget | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const str = (v: unknown, max = 300): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

  switch (o.kind) {
    case "headline": {
      const title = str(o.title);
      if (!title) return null;
      const assets = Array.isArray(o.assets)
        ? o.assets.filter((a): a is string => typeof a === "string").slice(0, 5)
        : undefined;
      return {
        kind: "headline",
        title,
        source: str(o.source, 80),
        market: str(o.market, 20),
        ...(assets?.length ? { assets } : {}),
      };
    }
    case "event": {
      const title = str(o.title);
      if (!title) return null;
      return {
        kind: "event",
        title,
        country: str(o.country, 40),
        impact: str(o.impact, 20),
      };
    }
    case "funding": {
      const symbol = str(o.symbol, 20);
      const ratePct = Number(o.ratePct);
      if (!symbol || !Number.isFinite(ratePct)) return null;
      return { kind: "funding", symbol, ratePct };
    }
    case "mover": {
      const symbol = str(o.symbol, 20);
      const changePct = Number(o.changePct);
      if (!symbol || !Number.isFinite(changePct)) return null;
      return {
        kind: "mover",
        symbol,
        changePct,
        name: str(o.name, 60),
        market: str(o.market, 20),
      };
    }
    default:
      return null;
  }
}
