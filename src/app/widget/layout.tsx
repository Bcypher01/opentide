import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Opentide Session Clock",
  description: "Embeddable live market session clock",
  robots: { index: false },
};

/**
 * Widget route layout — no html/body (root layout owns those).
 * Just passes children through so the page renders without AppShell.
 */
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
