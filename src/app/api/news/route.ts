import { NextResponse } from "next/server";
import { tagAssets, impactKeywordHits, type Market } from "@/lib/assets";

// ---------------------------------------------------------------------------
// Free news engine: public RSS feeds (no keys, no rate limits), parsed with a
// tolerant zero-dependency RSS 2.0 reader, tagged by market + asset, cached
// and shared across all users via Next's fetch cache (revalidate 10 min).
// ---------------------------------------------------------------------------

const FEEDS: Array<{ url: string; source: string; market: Market }> = [
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk", market: "crypto" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph", market: "crypto" },
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC Markets", market: "stocks" },
  // Market Pulse (not Top Stories): markets-only bulletins. Top Stories mixed
  // in personal-finance advice columns (the "Moneyist" Q&As) that aren't
  // market-relevant; Market Pulse is terse, real-time market coverage only.
  { url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse", source: "MarketWatch", market: "stocks" },
  // Forex: multiple sources because FXStreet's WAF often rejects datacenter
  // IPs (e.g. Vercel), which would otherwise leave the forex tab empty.
  { url: "https://www.fxstreet.com/rss/news", source: "FXStreet", market: "forex" },
  { url: "https://investinglive.com/feed/news", source: "investingLive", market: "forex" },
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", source: "CNBC FX", market: "forex" },
];

export type NewsWeight = "high" | "med" | "low";

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  market: Market;
  assets: string[]; // tagged asset ids
  ts: number;
  summary?: string; // short plain-text blurb for search + preview
  relevance: number; // 0–1 heuristic importance score
  weight: NewsWeight; // bucketed relevance — the FF "impact" analogue
}

/** Numeric entities, hex (&#x2019;) and decimal (&#8217;) — covers smart
 *  quotes, dashes and anything else feeds throw at us. */
function decodeNumeric(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function decodeEntities(s: string): string {
  // Run the numeric pass twice: RSS titles are frequently double-encoded
  // (&amp;#x2019;), so numeric entities only appear after &amp; is decoded.
  return decodeNumeric(
    decodeNumeric(s)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
  );
}

function clean(s: string): string {
  return decodeEntities(
    s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function field(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1] : "";
}

function parseFeed(xml: string, source: string, market: Market): NewsItem[] {
  const out: NewsItem[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const b of blocks.slice(0, 20)) {
    const title = clean(field(b, "title"));
    const link = clean(field(b, "link"));
    const ts = Date.parse(clean(field(b, "pubDate"))) || Date.now();
    if (!title || !link) continue;
    const summary = clean(field(b, "description")).slice(0, 400);
    out.push({
      title,
      link,
      source,
      market,
      assets: tagAssets(`${title} ${summary}`),
      ts,
      summary: summary.slice(0, 220),
      // relevance/weight are filled in once the full set is known (GET) so we
      // can factor in cross-source coverage bursts.
      relevance: 0,
      weight: "low",
    });
  }
  return out;
}

export async function GET() {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const res = await fetch(f.url, {
        next: { revalidate: 600 },
        headers: {
          // Real browser UA — WAFs (FXStreet et al.) block obvious bot strings
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          accept: "application/rss+xml, application/xml, text/xml, */*",
        },
      });
      if (!res.ok) throw new Error(`${f.source} ${res.status}`);
      return parseFeed(await res.text(), f.source, f.market);
    })
  );

  const items: NewsItem[] = results
    .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 80);

  // Trending: assets most mentioned in the freshest 40 stories
  const counts: Record<string, number> = {};
  for (const it of items.slice(0, 40))
    for (const id of it.assets) counts[id] = (counts[id] ?? 0) + 1;
  const trending = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, count]) => ({ id, count }));

  // Relevance / impact weighting (the ForexFactory "impact" analogue). All
  // signals are already on hand — no extra fetches. Heuristic by design; the
  // UI keeps the "read the story" disclaimer.
  const scoredAt = Date.now();
  for (const it of items) {
    const kw = impactKeywordHits(`${it.title} ${it.summary ?? ""}`);
    let score = 0;
    if (kw >= 2) score += 0.55; // multi-signal macro headline → red folder
    else if (kw === 1) score += 0.38;
    score += Math.min(it.assets.length, 5) * 0.06; // breadth, ≤0.30
    const maxCov = it.assets.reduce((m, id) => Math.max(m, counts[id] ?? 0), 0);
    score += Math.min(maxCov, 8) * 0.035; // cross-source coverage burst, ≤0.28
    const ageH = Math.max(0, (scoredAt - it.ts) / 3_600_000);
    score += Math.max(0, 1 - ageH / 18) * 0.18; // recency, ≤0.18
    it.relevance = Math.min(1, Math.round(score * 100) / 100);
    it.weight = it.relevance >= 0.6 ? "high" : it.relevance >= 0.33 ? "med" : "low";
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: "upstream_unavailable", items: [], trending: [], ts: Date.now() }
    );
  }

  return NextResponse.json({ items, trending, ts: Date.now() });
}
