import type { Metadata } from "next";

const DESCRIPTION =
  "Your watchlist — live prices for the coins, stocks and forex pairs you track, AI insights tuned to your picks, and a newswire filtered to just your names. Starring also powers your catch-ups and alerts.";

export const metadata: Metadata = {
  title: "Watchlist — your tracked markets, insights & news",
  description: DESCRIPTION,
  alternates: { canonical: "/watchlist" },
  openGraph: {
    title: "Opentide Watchlist — your tracked markets, insights & news",
    description: DESCRIPTION,
    url: "/watchlist",
  },
};

// Client page can't export metadata itself; this server layout supplies it.
export default function WatchlistLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
