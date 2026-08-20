import type { Metadata } from "next";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { IconArrowUpRight, IconChevronDown } from "@/components/Icons";
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

      <article className="max-w-6xl pb-16">
        <header className="mt-2">
          <h1 className="font-display text-[28px] font-semibold tracking-tight">
            Sessions &amp; FAQ
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Opentide is a free market companion built around{" "}
            <strong className="font-medium text-text">trading sessions</strong>. A live
            session clock shows which of the four major forex centres are open right now,
            where their hours overlap, and how much time is left — in your local time or
            UTC. Forex, crypto and US stocks share one surface, every headline is tagged to
            the markets it moves, and there&apos;s no signup and no API keys.
          </p>
        </header>

        {/* Wide/landscape viewports have a lot of room next to a 5-question
            accordion — instead of floating everything in one narrow column
            with empty space either side, the sessions reference sits as a
            sticky sidebar next to the questions so the page actually uses
            the width. Both stack on mobile. */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr] lg:items-start lg:gap-8">
          {/* Session-times reference card — the core concept, scannable at a glance */}
          <section
            aria-labelledby="sessions-heading"
            className="module p-5 lg:sticky lg:top-20"
          >
            <h2 id="sessions-heading" className="module-title">
              The four major sessions
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-2">
              {[
                { city: "Sydney", hours: "08:00–17:00", zone: "AEST / AEDT" },
                { city: "Tokyo", hours: "09:00–18:00", zone: "JST" },
                { city: "London", hours: "08:00–17:00", zone: "GMT / BST" },
                { city: "New York", hours: "08:00–17:00", zone: "ET" },
              ].map((s) => (
                <div
                  key={s.city}
                  className="flex items-baseline justify-between gap-3 rounded-lg bg-surface2 px-3.5 py-2.5"
                >
                  <dt className="text-sm font-medium text-text">{s.city}</dt>
                  <dd className="text-right">
                    <span className="num text-sm text-text">{s.hours}</span>
                    <span className="ml-2 text-xs text-muted">{s.zone}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Each session runs on local business hours, so the equivalent UTC times shift
              with daylight saving. The{" "}
              <strong className="font-medium text-text">London–New York overlap</strong>{" "}
              (London afternoon into the New York morning, ~13:00–17:00 UTC) is the
              deepest-liquidity window of the day.
            </p>
          </section>

          {/* Accordion */}
          <section aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="font-display text-xl font-semibold tracking-tight text-text">
              Frequently asked questions
            </h2>
            <div className="mt-4 space-y-2.5">
              {FAQ.map(({ q, a }) => (
                <details
                  key={q}
                  className="group module transition-colors open:bg-surface2 hover:border-border/80"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-text marker:content-none [&::-webkit-details-marker]:hidden">
                    {q}
                    <IconChevronDown
                      size={16}
                      className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
                    />
                  </summary>
                  <p className="px-5 pb-4 text-sm leading-relaxed text-muted">{a}</p>
                </details>
              ))}
            </div>

            <Link
              href="/"
              className="mt-10 inline-flex items-center gap-1.5 text-[13.5px] text-muted underline decoration-muted/40 underline-offset-4 transition-colors hover:text-text"
            >
              Open the dashboard
              <IconArrowUpRight size={15} />
            </Link>
          </section>
        </div>
      </article>
    </AppShell>
  );
}
