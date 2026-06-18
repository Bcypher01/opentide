// Q&A that targets real session-timing search intent. Shared by the root
// layout (which emits FAQPage JSON-LD) and the homepage (which renders the same
// answers as crawlable on-page text). The FAQPage rich result only stays
// eligible while the visible content matches the markup, so both must read from
// this single source.
export const FAQ: { q: string; a: string }[] = [
  {
    q: "When do the forex trading sessions open and close?",
    a: "The four major sessions run on local business hours in their home cities: Sydney 08:00–17:00 (AEST/AEDT), Tokyo 09:00–18:00 (JST), London 08:00–17:00 (GMT/BST) and New York 08:00–17:00 (ET). Because each is anchored to its own timezone, the equivalent UTC hours shift with daylight saving. Opentide's session clock converts all four to your local time or UTC live.",
  },
  {
    q: "When do the forex sessions overlap, and why does it matter?",
    a: "The London and New York sessions overlap through the London afternoon and New York morning — roughly 13:00–17:00 UTC. This is the deepest-liquidity window of the day: both of the largest forex centres are open at once, so spreads tighten and major pairs like EUR/USD and GBP/USD see their heaviest volume and biggest moves. A smaller Tokyo–London overlap happens around the European open.",
  },
  {
    q: "Which trading session has the most liquidity and volatility?",
    a: "The London–New York overlap carries the most liquidity and typically the largest intraday ranges. The London session alone is the single busiest for forex; the Tokyo session is quieter and tends to favour JPY, AUD and NZD pairs.",
  },
  {
    q: "Do crypto and US stock markets follow these sessions?",
    a: "Crypto trades 24/7, but its volume still rises and falls with the forex and equity sessions, so the same clock helps you read activity. US stocks trade during the New York session (09:30–16:00 ET regular hours), which is why Opentide groups stocks, forex and crypto against one session timeline.",
  },
  {
    q: "Is Opentide free, and does it need an account or API keys?",
    a: "Opentide is completely free with no signup. Forex, crypto and US stock quotes, the session clock, the multi-source newswire and the economic calendar all work out of the box — no account and no API keys required.",
  },
];

export const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};
