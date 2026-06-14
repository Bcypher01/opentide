import type { Metadata } from "next";

const DESCRIPTION =
  "A free, multi-source market newswire — CoinDesk, Cointelegraph, CNBC, MarketWatch and FXStreet in one stream, every headline tagged to the markets and assets it affects. Tap any tag to open its chart.";

export const metadata: Metadata = {
  title: "Newswire — market news tagged to every asset",
  description: DESCRIPTION,
  alternates: { canonical: "/news" },
  openGraph: {
    title: "Opentide Newswire — market news tagged to every asset",
    description: DESCRIPTION,
    url: "/news",
  },
};

// Client page can't export metadata itself; this server layout supplies it.
export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
