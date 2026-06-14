import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

// display:"swap" renders text immediately in a fallback and swaps the webfont
// in when ready — no invisible-text flash, no render-blocking on the fonts.
// Only Inter (body copy) is preloaded; the mono and display faces load on
// demand to keep the initial font payload small.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jbmono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jbmono",
  display: "swap",
  preload: false,
});
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
  preload: false,
});

const SITE_URL = "https://opentide.vercel.app";

// The one-line pitch that leads with the differentiator (market sessions),
// reused across metadata and structured data so they never drift apart.
const DESCRIPTION =
  "The free market companion built around market sessions. A live session clock shows which markets are awake and where liquidity overlaps, an asset-tagged newswire pulls five free sources into one stream, and forex, crypto and US stocks share one surface — no signup, no API keys.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Opentide — every market, every session",
    template: "%s · Opentide",
  },
  description: DESCRIPTION,
  applicationName: "Opentide",
  keywords: [
    "market sessions",
    "session clock",
    "forex trading hours",
    "market overlap",
    "liquidity overlap",
    "real-time crypto prices",
    "US stock quotes",
    "forex rates",
    "market newswire",
    "asset-tagged news",
    "economic calendar",
    "free trading dashboard",
    "TradingView charts",
  ],
  authors: [{ name: "Opentide" }],
  creator: "Opentide",
  publisher: "Opentide",
  category: "finance",
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Opentide", statusBarStyle: "black-translucent" },
  openGraph: {
    type: "website",
    siteName: "Opentide",
    title: "Opentide — every market, every session",
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Opentide — every market, every session",
    description:
      "Free, real-time forex, crypto & US stocks organized around market sessions — a live session clock, liquidity overlaps, and an asset-tagged newswire. No signup, no keys.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0B0D",
  width: "device-width",
  initialScale: 1,
};

// Structured data — tells search engines exactly what Opentide is and what it
// uniquely offers, eligible for rich results. Mirrors the metadata copy.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Opentide",
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web, iOS, Android (PWA)",
  browserRequirements: "Requires JavaScript.",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Live market session clock with high-liquidity overlap windows",
    "Forex, crypto and US stocks on one full-width surface",
    "Free multi-source newswire tagged to the assets each story affects",
    "Top movers and trending assets across markets",
    "TradingView charts from any ticker, mover or headline tag",
    "Economic calendar with countdowns and beginner explainers",
    "No signup and no API keys required",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Note: JSON-LD is type="application/ld+json" — a data block, not executable
  // script — so the strict CSP doesn't apply to it and it needs no nonce.
  // Next automatically nonces its own scripts by reading the CSP header set in
  // middleware, so the nonce never has to be threaded through here.
  return (
    <html lang="en" className={`${inter.variable} ${jbmono.variable} ${grotesk.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
