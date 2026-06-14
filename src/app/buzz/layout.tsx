import type { Metadata } from "next";

const DESCRIPTION =
  "See what the market is paying attention to right now — the most-searched coins and stocks, the names dominating the news cycle, upcoming IPOs, and the scheduled releases most likely to move price.";

export const metadata: Metadata = {
  title: "Buzz — what the market is watching right now",
  description: DESCRIPTION,
  alternates: { canonical: "/buzz" },
  openGraph: {
    title: "Opentide Buzz — what the market is watching right now",
    description: DESCRIPTION,
    url: "/buzz",
  },
};

// Client page can't export metadata itself; this server layout supplies it.
export default function BuzzLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
