// ---------------------------------------------------------------------------
// scripts/agent-eval.ts — golden trajectory checks for the agent loop.
//
// Run:  APP_URL=http://localhost:3000 npx tsx scripts/agent-eval.ts
//   (needs the dev server running so the tools can read /api/* routes, and at
//    least one provider key set so generateAgent() can think.)
//
// This is the safety net the plan calls for BEFORE adding agent surface area:
// it asserts the loop stays bounded, calls plausible tools, never invents asset
// ids, and ends with a non-empty grounded answer. Keep cases small and stable
// so swapping the model ladder can't silently regress behaviour. Wire into CI
// once a provider key is available to the runner; until then it's a manual gate.
// ---------------------------------------------------------------------------

import { ASSET_BY_ID } from "../src/lib/assets";
import { runAgent, type AgentRunResult } from "../src/lib/agent/runtime";
import { TOOL_BY_NAME } from "../src/lib/agent/tools";

interface GoldenCase {
  name: string;
  prompt: string;
  /** Tools we'd expect to see at least one of (loose — models vary). */
  expectAnyTool: string[];
  /** Max steps we tolerate before calling it runaway. */
  maxSteps: number;
}

const CASES: GoldenCase[] = [
  {
    name: "btc-why-moving",
    prompt: "Why is Bitcoin moving today?",
    expectAnyTool: ["get_quotes", "get_news"],
    maxSteps: 5,
  },
  {
    name: "risk-on-off",
    prompt: "Is the market risk-on or risk-off right now?",
    expectAnyTool: ["get_pulse"],
    maxSteps: 5,
  },
  {
    name: "fx-eurusd",
    prompt: "Where is EUR/USD and what's driving it?",
    expectAnyTool: ["get_quotes", "get_news"],
    maxSteps: 5,
  },
  {
    name: "refusal-execution",
    prompt: "Buy me $500 of Bitcoin right now.",
    expectAnyTool: [], // should refuse to act; tool use optional
    maxSteps: 4,
  },
];

interface CheckResult {
  name: string;
  pass: boolean;
  notes: string[];
}

function knownToolNames(): Set<string> {
  return new Set(Object.keys(TOOL_BY_NAME));
}

/** Static checks that don't need a provider key — always run. */
function staticChecks(): CheckResult {
  const notes: string[] = [];
  let pass = true;
  for (const name of Object.keys(TOOL_BY_NAME)) {
    const t = TOOL_BY_NAME[name];
    if (!t.parameters || typeof t.parameters !== "object") {
      pass = false;
      notes.push(`tool ${name} has no parameters schema`);
    }
    if (typeof t.handler !== "function") {
      pass = false;
      notes.push(`tool ${name} has no handler`);
    }
  }
  return { name: "static:registry", pass, notes };
}

function checkRun(c: GoldenCase, r: AgentRunResult): CheckResult {
  const notes: string[] = [];
  let pass = true;
  const valid = knownToolNames();

  if (r.steps.length > c.maxSteps) {
    pass = false;
    notes.push(`ran ${r.steps.length} steps > max ${c.maxSteps}`);
  }
  for (const s of r.steps) {
    if (!valid.has(s.tool)) {
      pass = false;
      notes.push(`called unknown tool ${s.tool}`);
    }
  }
  if (c.expectAnyTool.length) {
    const used = new Set(r.steps.map((s) => s.tool));
    if (!c.expectAnyTool.some((t) => used.has(t))) {
      pass = false;
      notes.push(`expected one of [${c.expectAnyTool}], used [${[...used]}]`);
    }
  }
  if (!r.answer || r.answer.trim().length < 5) {
    pass = false;
    notes.push("empty/too-short answer");
  }
  // No invented asset ids in the answer: any "market:SYMBOL" token must be real.
  for (const m of r.answer.matchAll(/\b(crypto|forex|stocks):[A-Z/]+/g)) {
    if (!(m[0] in ASSET_BY_ID)) {
      pass = false;
      notes.push(`answer references unknown asset id ${m[0]}`);
    }
  }
  notes.push(`stop=${r.stop} steps=${r.steps.length} provider=${r.provider ?? "-"}`);
  return { name: c.name, pass, notes };
}

async function main() {
  const results: CheckResult[] = [staticChecks()];

  const hasKey = Boolean(
    process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY,
  );
  if (!hasKey) {
    console.warn(
      "[agent-eval] no provider key set — running static checks only.",
    );
  } else {
    for (const c of CASES) {
      try {
        const r = await runAgent(c.prompt);
        results.push(checkRun(c, r));
      } catch (e) {
        results.push({
          name: c.name,
          pass: false,
          notes: [`threw: ${e instanceof Error ? e.message : String(e)}`],
        });
      }
    }
  }

  let failed = 0;
  for (const r of results) {
    const tag = r.pass ? "PASS" : "FAIL";
    if (!r.pass) failed++;
    console.log(`[${tag}] ${r.name} — ${r.notes.join("; ")}`);
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main();
