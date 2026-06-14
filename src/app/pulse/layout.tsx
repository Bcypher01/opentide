import type { Metadata } from "next";

const DESCRIPTION =
  "The deeper read behind Opentide's market pulse — a cross-market risk-on/risk-off dial, crypto, stock and forex heatmaps, and how each asset typically moves per trading session versus today.";

export const metadata: Metadata = {
  title: "Pulse — cross-market risk, heatmaps & session stats",
  description: DESCRIPTION,
  alternates: { canonical: "/pulse" },
  openGraph: {
    title: "Opentide Pulse — cross-market risk, heatmaps & session stats",
    description: DESCRIPTION,
    url: "/pulse",
  },
};

// Client page can't export metadata itself; this server layout supplies it.
export default function PulseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
