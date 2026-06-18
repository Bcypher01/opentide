import type { Metadata } from "next";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { FAQ, faqJsonLd } from "@/lib/faq";

const DESCRIPTION =
  "When the forex sessions open, close and overlap, which session has the most liquidity, and how Opentide tracks market sessions, crypto, stocks and forex in one place — free, no signup.";

export const metadata: Metadata = {
  title: "FAQ — market sessions, overlaps & trading hours",
  description: DESCRIPTION,
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "Opentide FAQ — market sessions, overlaps & trading hours",
    description: DESCRIPTION,
    url: "/faq",
  },
};

// Server component: the prose and answers render straight into the initial HTML
// so search engines index them, and the FAQPage JSON-LD lives on the page that
// actually shows the questions (Google requires the markup to match visible
// text). AppShell supplies the header, nav and footer for a consistent frame.
export default function FaqPage() {
  return (
    <AppShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <article className="mx-auto w-full max-w-[760px] pb-12">
        <header>
          <h1 className="text-2xl font-medium text-text">
            Market sessions, overlaps and trading hours
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Opentide is a free market companion built around{" "}
            <strong className="font-medium text-text">trading sessions</strong>. A live
            session clock shows which of the four major forex centres — Sydney, Tokyo,
            London and New York — are open right now, where their hours overlap, and how
            much time is left in each, in your local time or UTC. Forex, crypto and US
            stocks share one surface, every headline in the newswire is tagged to the
            markets it moves, and there is no signup and no API keys.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The sessions run on local business hours in their home cities, so the markets
            hand off around the clock: Sydney and Tokyo cover the Asian session, London
            opens Europe, and New York carries the US session. The{" "}
            <strong className="font-medium text-text">London–New York overlap</strong> —
            the London afternoon into the New York morning, roughly 13:00–17:00 UTC — is
            the deepest-liquidity window of the day, when spreads tighten and major pairs
            see their heaviest volume.
          </p>
        </header>

        <section aria-labelledby="faq-heading" className="mt-10">
          <h2 id="faq-heading" className="text-lg font-medium text-text">
            Frequently asked questions
          </h2>
          <div className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group px-4 py-3">
                <summary className="cursor-pointer list-none text-sm font-medium text-text marker:content-none">
                  {q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <p className="mt-8 text-sm text-muted">
          <Link href="/" className="text-accent hover:underline">
            ← Back to the dashboard
          </Link>
        </p>
      </article>
    </AppShell>
  );
}
