import { ASSET_BY_ID, tvSymbol, type Market } from "./assets";

export interface ChartTarget {
  /** TradingView symbol, e.g. "BINANCE:BTCUSDT" */
  symbol: string;
  displaySymbol: string;
  displayName: string;
  market: Market;
  /** asset id when it's one of ours, null for custom Buzz symbols */
  assetId: string | null;
}

/** Resolve an asset id — or a "custom|TV:SYMBOL|Label" id from Buzz — to a chart target. */
export function resolveChartTarget(id: string): ChartTarget {
  if (id.startsWith("custom|")) {
    const [, tv, label] = id.split("|");
    return {
      symbol: tv,
      displaySymbol: label ?? tv,
      displayName: "from Buzz — markets to watch",
      market: "stocks",
      assetId: null,
    };
  }
  const asset = ASSET_BY_ID[id] ?? ASSET_BY_ID["crypto:BTC"];
  return {
    symbol: tvSymbol(asset),
    displaySymbol: asset.symbol,
    displayName: asset.name,
    market: asset.market,
    assetId: asset.id,
  };
}

export function tvEmbedUrl(symbol: string, interval: string): string {
  return (
    `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}&theme=dark&style=1&locale=en&hide_side_toolbar=1` +
    `&allow_symbol_change=0&save_image=0&withdateranges=1&hide_volume=0`
  );
}

export const CHART_INTERVALS = [
  { label: "15m", value: "15" },
  { label: "1H", value: "60" },
  { label: "4H", value: "240" },
  { label: "1D", value: "D" },
  { label: "1W", value: "W" },
];
