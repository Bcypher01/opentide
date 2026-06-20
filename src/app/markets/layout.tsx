import type { Metadata } from "next";

const DESCRIPTION =
  "The whole market in one place — a cross-market risk-on/risk-off mood read with heatmaps and session stats, plus what's getting attention right now: trending coins and stocks, the names dominating the news, scheduled event risk and upcoming IPOs.";

export const metadata: Metadata = {
  title: "Markets — market mood & what's getting attention",
  description: DESCRIPTION,
  alternates: { canonical: "/markets" },
  openGraph: {
    title: "Opentide Markets — market mood & what's getting attention",
    description: DESCRIPTION,
    url: "/markets",
  },
};

// Client page can't export metadata itself; this server layout supplies it.
export default function MarketsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
