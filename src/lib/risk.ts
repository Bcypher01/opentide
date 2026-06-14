// ---------------------------------------------------------------------------
// Cross-market risk dial — one synthesized "risk-on / risk-off" reading.
// Pure composition over data the dashboard already polls (pulse strip + 24h
// quotes); no new APIs. Every component is optional, so the dial renders with
// whatever is available and is fully transparent about its inputs.
//
// Each signal is normalised to [-1, +1] where −1 = maximally risk-OFF and
// +1 = maximally risk-ON, then weighted and averaged into a [-100, +100] score.
// ---------------------------------------------------------------------------

import type { PulsePayload } from "@/app/api/pulse/route";
import { STOCK_ASSETS } from "./assets";

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

export type Tone = "bull" | "bear" | "muted";

export interface RiskComponent {
  key: string;
  label: string;
  /** normalised contribution in [-1, +1] (risk-off → risk-on) */
  norm: number;
  /** human-readable raw value, e.g. "+2.4%" or "27" */
  detail: string;
  weight: number;
}

export interface RiskDial {
  /** −100 (risk-off) … +100 (risk-on) */
  score: number;
  label: string;
  /** one-line plain-language read */
  blurb: string;
  components: RiskComponent[];
}

interface Inputs {
  pulse: PulsePayload | null;
  quoteOf: Record<string, { price: number; changePct: number | null }>;
}

function band(score: number): { label: string; blurb: string } {
  if (score >= 50)
    return {
      label: "Risk-on",
      blurb: "Money is leaning into risk: crypto and equities firm, sentiment warm, the dollar soft.",
    };
  if (score >= 18)
    return {
      label: "Leaning risk-on",
      blurb: "A modest appetite for risk — more green than red across the cross-market signals.",
    };
  if (score > -18)
    return {
      label: "Mixed",
      blurb: "No clear regime today: risk-on and risk-off signals roughly cancel out.",
    };
  if (score > -50)
    return {
      label: "Leaning risk-off",
      blurb: "A defensive tilt — softer risk assets and/or a firmer dollar are pulling the dial down.",
    };
  return {
    label: "Risk-off",
    blurb: "Broad risk-off: risk assets under pressure, fearful sentiment, a bid for the dollar.",
  };
}

export function computeRiskDial(inputs: Inputs): RiskDial | null {
  const { pulse, quoteOf } = inputs;
  const components: RiskComponent[] = [];

  // 1. Bitcoin 24h — the market's clearest real-time risk barometer.
  const btc = quoteOf["crypto:BTC"]?.changePct;
  if (typeof btc === "number" && Number.isFinite(btc)) {
    components.push({
      key: "btc",
      label: "Bitcoin 24h",
      norm: clamp(btc / 5),
      detail: `${btc > 0 ? "+" : ""}${btc.toFixed(1)}%`,
      weight: 1,
    });
  }

  // 2. Whole crypto market 24h (breadth, not just BTC).
  if (pulse && pulse.mcapChangePct !== null) {
    const m = pulse.mcapChangePct;
    components.push({
      key: "mcap",
      label: "Crypto market 24h",
      norm: clamp(m / 5),
      detail: `${m > 0 ? "+" : ""}${m.toFixed(1)}%`,
      weight: 0.8,
    });
  }

  // 3. Equity proxy — average 24h move of the tracked mega-caps.
  const stockPcts = STOCK_ASSETS.map((a) => quoteOf[a.id]?.changePct).filter(
    (p): p is number => typeof p === "number" && Number.isFinite(p)
  );
  if (stockPcts.length >= 3) {
    const avg = stockPcts.reduce((a, b) => a + b, 0) / stockPcts.length;
    components.push({
      key: "equities",
      label: "Equities 24h",
      norm: clamp(avg / 2.5),
      detail: `${avg > 0 ? "+" : ""}${avg.toFixed(1)}% avg`,
      weight: 1,
    });
  }

  // 4. Crypto Fear & Greed — sentiment.
  if (pulse?.fearGreed) {
    const v = pulse.fearGreed.value;
    components.push({
      key: "cfg",
      label: "Crypto Fear & Greed",
      norm: clamp((v - 50) / 50),
      detail: `${v}`,
      weight: 0.8,
    });
  }

  // 5. Stock Fear & Greed — sentiment.
  if (pulse?.stockFearGreed) {
    const v = pulse.stockFearGreed.value;
    components.push({
      key: "sfg",
      label: "Stocks Fear & Greed",
      norm: clamp((v - 50) / 50),
      detail: `${v}`,
      weight: 0.8,
    });
  }

  // 6. Dollar — INVERSE: a stronger dollar is risk-off. ±0.6% daily is large
  //    for DXY (ECB daily approximation).
  if (pulse?.dxy && pulse.dxy.changePct !== null) {
    const d = pulse.dxy.changePct;
    components.push({
      key: "dxy",
      label: "US dollar (DXY)",
      norm: clamp(-d / 0.6),
      detail: `${d > 0 ? "+" : ""}${d.toFixed(2)}%`,
      weight: 1,
    });
  }

  if (components.length < 2) return null;

  const totalW = components.reduce((a, c) => a + c.weight, 0);
  const raw = components.reduce((a, c) => a + c.norm * c.weight, 0) / totalW;
  const score = Math.round(clamp(raw) * 100);
  const { label, blurb } = band(score);
  return { score, label, blurb, components };
}

/** Tone for a normalised component value. */
export function compTone(norm: number): Tone {
  if (norm > 0.1) return "bull";
  if (norm < -0.1) return "bear";
  return "muted";
}
