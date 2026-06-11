import { NextResponse } from "next/server";
import { tagAssets, type Market } from "@/lib/assets";

// ---------------------------------------------------------------------------
// Free news engine: public RSS feeds (no keys, no rate limits), parsed with a
// tolerant zero-dependency RSS 2.0 reader, tagged by market + asset, cached
// and shared across all users via Next's fetch cache (revalidate 10 min).
// ---------------------------------------------------------------------------

const FEEDS: Array<{ url: string; source: string; market: Market }> = [
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk", market: "crypto" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph", market: "crypto" },
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC Markets", market: "stocks" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", source: "MarketWatch", market: "stocks" },
  { url: "https://www.fxstreet.com/rss/news", source: "FXStreet", market: "forex" },
];

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  market: Market;
  assets: string[]; // tagged asset ids
  ts: number;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, "—")
    .replace(/&nbsp;/g, " ");
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
    });
  }
  return out;
}

export async function GET() {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const res = await fetch(f.url, {
        next: { revalidate: 600 },
        headers: { "user-agent": "Mozilla/5.0 (compatible; Opentide/1.0)" },
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

  if (items.length === 0) {
    return NextResponse.json(
      { error: "upstream_unavailable", items: [], trending: [] },
      { status: 502 }
    );
  }

  return NextResponse.json({ items, trending, ts: Date.now() });
}
