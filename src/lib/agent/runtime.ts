// ---------------------------------------------------------------------------
// agent/runtime.ts — the observe → decide → act loop.
//
// One runAgent() call drives a bounded conversation: ask the model (generateAgent),
// and while it requests tools, run them (validated, never-throw) and feed the
// results back, until it produces a final answer or a budget trips. Returns the
// answer plus a full TRACE of every step (tool, args, latency, ok) so the eval
// harness and telemetry can see exactly what happened.
//
// Variable cost is the whole risk of going agentic, so the limits here are the
// real safety mechanism, not decoration:
//   · MAX_STEPS        — hard cap on loop iterations
//   · DEADLINE_MS      — whole-conversation wall-clock budget
//   · duplicate guard  — identical tool+args call short-circuits (no churn)
//
// Like the rest of the LLM layer it degrades gracefully: no provider key, or all
// providers failing, yields { degraded: true } and a friendly message — never a
// thrown 500 to the caller.
//
// NOT financial advice; READ-ONLY tools only (see agent/tools.ts).
// ---------------------------------------------------------------------------

import {
  generateAgent,
  LlmUnavailableError,
  type AgentMessage,
  type LlmProvider,
} from "@/lib/llm";
import {
  buildSystemPrompt,
  encodeToolResult,
  groundedTermsFrom,
  ungroundedAssetIds,
} from "./guardrails";
import { assetCatalogue, TOOL_BY_NAME, TOOL_DECLARATIONS } from "./tools";

const MAX_STEPS = 6;
const DEADLINE_MS = 30_000;

const SYSTEM = buildSystemPrompt(assetCatalogue());

/** One recorded step of the run (telemetry + evals). */
export interface AgentTraceStep {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
}

export interface AgentRunResult {
  answer: string;
  steps: AgentTraceStep[];
  degraded: boolean;
  provider?: LlmProvider;
  model?: string;
  /** Why it stopped: "answered" | "max_steps" | "deadline" | "unavailable". */
  stop: "answered" | "max_steps" | "deadline" | "unavailable";
  /** Explicit asset ids (market:SYMBOL) the answer named that no tool returned —
   *  a grounding red flag for telemetry/evals. Empty on a clean run. */
  ungroundedRefs?: string[];
  /** Dev-only failure detail. */
  error?: string;
}

/** Streamed progress events so a UI can show what the agent is doing live. */
export type AgentEvent =
  | { type: "tool"; tool: string; label: string }
  | {
      type: "answer";
      answer: string;
      degraded: boolean;
      stop: AgentRunResult["stop"];
    };

/** Human-friendly chip labels for each tool (UI status while it runs). */
const TOOL_LABELS: Record<string, string> = {
  get_quotes: "Checking prices",
  get_pulse: "Reading market sentiment",
  get_news: "Scanning headlines",
  get_funding: "Checking positioning",
  get_calendar: "Checking the calendar",
  screen_markets: "Screening markets",
  get_recommendations: "Pulling today's ideas",
  lookup_asset: "Looking up the asset",
};

export interface RunAgentOpts {
  /** Prior conversation turns for multi-turn memory (see agent/session.ts). */
  history?: AgentMessage[];
  temperature?: number;
  /** Fires as the agent works, so a route can stream progress to the client. */
  onEvent?: (e: AgentEvent) => void;
}

/**
 * Run the agent loop for one user message. Never throws.
 */
export async function runAgent(
  userMessage: string,
  opts: RunAgentOpts = {},
): Promise<AgentRunResult> {
  const messages: AgentMessage[] = [
    { role: "system", content: SYSTEM },
    ...(opts.history ?? []),
    { role: "user", content: userMessage },
  ];

  const steps: AgentTraceStep[] = [];
  const seen = new Set<string>(); // duplicate tool+args guard
  const grounded = new Set<string>(); // asset ids/symbols the tools actually returned
  const deadline = Date.now() + DEADLINE_MS;
  let lastProvider: LlmProvider | undefined;
  let lastModel: string | undefined;

  for (let step = 1; step <= MAX_STEPS; step++) {
    if (Date.now() > deadline) {
      return {
        answer:
          "I ran out of time gathering data for that. Try a narrower question.",
        steps,
        degraded: false,
        provider: lastProvider,
        model: lastModel,
        stop: "deadline",
      };
    }

    let turn;
    try {
      turn = await generateAgent(messages, TOOL_DECLARATIONS, {
        temperature: opts.temperature ?? 0.2,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const unavailable = err instanceof LlmUnavailableError;
      return {
        answer: unavailable
          ? "The assistant is unavailable right now."
          : "Something went wrong answering that.",
        steps,
        degraded: true,
        stop: "unavailable",
        ...(process.env.NODE_ENV !== "production" ? { error: message } : {}),
      };
    }

    lastProvider = turn.provider;
    lastModel = turn.model;

    // No tool calls → this is the final answer.
    if (!turn.toolCalls || turn.toolCalls.length === 0) {
      const answer = turn.content?.trim() || "I couldn't find anything useful on that.";
      return {
        answer,
        steps,
        degraded: false,
        provider: turn.provider,
        model: turn.model,
        stop: "answered",
        ungroundedRefs: ungroundedAssetIds(answer, grounded),
      };
    }

    // Record the assistant's tool-call turn so the next request has context.
    messages.push({
      role: "assistant",
      content: turn.content ?? null,
      toolCalls: turn.toolCalls,
    });

    // Execute each requested tool (validated, never-throw).
    for (const call of turn.toolCalls) {
      const sig = `${call.name}:${JSON.stringify(call.args)}`;
      const tool = TOOL_BY_NAME[call.name];
      const t0 = Date.now();

      // Emit a progress event so the UI can show a "Checking prices…" chip
      // while the tool runs.
      opts.onEvent?.({
        type: "tool",
        tool: call.name,
        label: TOOL_LABELS[call.name] ?? call.name,
      });

      let result: unknown;
      let ok = false;
      if (!tool) {
        result = { error: `unknown tool: ${call.name}` };
      } else if (seen.has(sig)) {
        result = { error: "duplicate call skipped — use the earlier result" };
      } else {
        seen.add(sig);
        try {
          result = await tool.handler(call.args ?? {});
          ok = !(result && typeof result === "object" && "error" in result);
          if (ok) for (const t of groundedTermsFrom(result)) grounded.add(t);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "tool failed" };
        }
      }

      const ms = Date.now() - t0;
      steps.push({ step, tool: call.name, args: call.args ?? {}, ok, ms });
      console.info(
        `[agent] step ${step} ${call.name}(${JSON.stringify(call.args)}) → ${
          ok ? "ok" : "err"
        } in ${ms}ms`,
      );

      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: encodeToolResult(call.name, result),
      });
    }
  }

  // Budget exhausted — ask for one final answer with no tools so we don't
  // return empty-handed.
  try {
    const final = await generateAgent(
      [
        ...messages,
        {
          role: "user",
          content:
            "Give your best concise answer now using only the data already gathered. Do not call more tools.",
        },
      ],
      [],
      { temperature: opts.temperature ?? 0.2 },
    );
    const answer =
      final.content?.trim() || "I gathered some data but couldn't conclude.";
    return {
      answer,
      steps,
      degraded: false,
      provider: final.provider,
      model: final.model,
      stop: "max_steps",
      ungroundedRefs: ungroundedAssetIds(answer, grounded),
    };
  } catch {
    return {
      answer: "I gathered some data but ran over my step budget before concluding.",
      steps,
      degraded: false,
      provider: lastProvider,
      model: lastModel,
      stop: "max_steps",
    };
  }
}
