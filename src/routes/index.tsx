import { createFileRoute, Link } from "@tanstack/react-router";
import { Container, CTASection, Section } from "@/components/site/primitives";
import { solutionsGroup } from "@/components/site/nav-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "eterfaceID — KYC, KYB and AML in one API" },
      {
        name: "description",
        content:
          "Verify people, verify businesses and screen against sanctions and PEP lists through a single Canadian-built API. FINTRAC and RPAA aligned.",
      },
      { property: "og:title", content: "eterfaceID — KYC, KYB and AML in one API" },
      {
        property: "og:description",
        content:
          "Identity, business and financial-crime checks for fintechs, MSBs and payment service providers.",
      },
    ],
  }),
  component: Home,
});

const pillars = [
  {
    kicker: "Verify people",
    title: "Know the person on the other side",
    body: "Government ID and passport capture, name, date of birth and address checks, phone and email validation, selfie with liveness, and face-to-ID matching — run as one request or composed step by step.",
    to: "/solutions/person-verification",
  },
  {
    kicker: "Verify businesses",
    title: "Know the entity and who controls it",
    body: "Registry lookups across federal and provincial sources, operating status, directors and officers, and beneficial ownership traced through to the natural persons behind the structure.",
    to: "/solutions/business-verification",
  },
  {
    kicker: "Screen continuously",
    title: "Catch the list hit before your regulator does",
    body: "Sanctions, PEP and RCA, government and law-enforcement watchlists, and adverse media — screened at onboarding and rescreened for as long as the relationship lasts.",
    to: "/solutions/aml-screening",
  },
];

const coverage = [
  { value: "195", label: "countries and territories in the identity graph" },
  { value: "1,400+", label: "sanctions, PEP and watchlist sources monitored" },
  { value: "< 30s", label: "median decision time for a full person check" },
  { value: "7 years", label: "default record retention, matching FINTRAC rules" },
];

function Home() {
  return (
    <>
      <section className="border-b border-rule">
        <Container className="grid gap-14 py-20 md:py-28 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-signal">
              KYC &middot; KYB &middot; AML
            </p>
            <h1 className="mt-5 max-w-[17ch] text-[2.6rem] font-semibold leading-[1.04] text-ink md:text-[4rem]">
              One interface for identity, entities and financial crime.
            </h1>
            <p className="mt-7 max-w-[58ch] text-[1.05rem] leading-[1.65] text-ink-soft">
              eterfaceID verifies the people and businesses you onboard, screens them against
              sanctions and politically exposed person lists, and keeps watching after the
              account is open — through one API and one review console.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/contact"
                className="rounded-sm bg-primary px-5 py-3 text-[0.88rem] font-medium text-primary-foreground transition-colors hover:bg-ink"
              >
                Book a walkthrough
              </Link>
              <Link
                to="/developers"
                className="rounded-sm border border-ink/25 px-5 py-3 text-[0.88rem] font-medium text-ink transition-colors hover:border-ink"
              >
                Read the API docs
              </Link>
            </div>
          </div>

          <div className="rounded-sm border border-rule bg-paper p-6">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              A single verification record
            </p>
            <dl className="mt-5 divide-y divide-rule text-[0.85rem]">
              {[
                ["Document", "Passport — authentic, MRZ matched"],
                ["Liveness", "Passed, active challenge"],
                ["Face match", "0.94 similarity to document portrait"],
                ["Address", "Matched to two independent sources"],
                ["Phone", "Carrier-confirmed, held 4 years"],
                ["Sanctions", "No match across 1,400+ sources"],
                ["PEP", "No match"],
                ["Device risk", "Low — no emulator or proxy signals"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-6 py-2.5">
                  <dt className="text-ink-soft">{k}</dt>
                  <dd className="text-right font-mono text-[0.78rem] text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 border-t border-rule pt-4 text-[0.75rem] leading-relaxed text-ink-soft">
              Illustrative record. Every field carries its source, timestamp and the reviewer who
              adjudicated it.
            </p>
          </div>
        </Container>
      </section>

      <Section>
        <div className="grid gap-px overflow-hidden border border-rule bg-rule md:grid-cols-3">
          {pillars.map((p) => (
            <Link
              key={p.kicker}
              to={p.to}
              className="group bg-background p-8 transition-colors hover:bg-paper"
            >
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-signal">
                {p.kicker}
              </p>
              <h2 className="mt-4 text-[1.2rem] font-semibold leading-snug text-ink">{p.title}</h2>
              <p className="mt-3 text-[0.9rem] leading-[1.7] text-ink-soft">{p.body}</p>
              <span className="mt-5 inline-block text-[0.82rem] font-medium text-ink group-hover:text-signal">
                Explore &rarr;
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <section className="border-y border-rule bg-paper">
        <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          {coverage.map((c) => (
            <div key={c.label}>
              <p className="font-display text-[2.1rem] font-semibold leading-none text-ink">
                {c.value}
              </p>
              <p className="mt-3 max-w-[24ch] text-[0.82rem] leading-relaxed text-ink-soft">
                {c.label}
              </p>
            </div>
          ))}
        </Container>
      </section>

      <Section
        title="Built for the Canadian rulebook, usable anywhere"
        intro="Identity requirements are specific here. eterfaceID implements the methods FINTRAC recognises — government-issued photo identification, the credit file method, and the dual-process method — and records the evidence in the form an examiner expects to see."
      >
        <div className="grid gap-x-12 gap-y-8 md:grid-cols-3">
          {[
            {
              h: "FINTRAC identification methods",
              b: "Each verification is tagged with the method used, the source consulted, and the date, so your records hold up during an examination.",
            },
            {
              h: "RPAA registration support",
              b: "Payment service providers registering with the Bank of Canada can evidence end-user identification, risk management and incident-ready record keeping.",
            },
            {
              h: "Global coverage",
              b: "Document templates, registry connections and watchlist sources extend past Canada, so expansion does not mean a second vendor.",
            },
          ].map((x) => (
            <div key={x.h} className="border-t border-rule pt-5">
              <h3 className="text-[1rem] font-semibold text-ink">{x.h}</h3>
              <p className="mt-2.5 text-[0.9rem] leading-[1.7] text-ink-soft">{x.b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Every capability, one contract">
        <ul className="grid gap-x-12 gap-y-4 sm:grid-cols-2">
          {solutionsGroup.links.map((l) => (
            <li key={l.to} className="border-t border-rule pt-4">
              <Link to={l.to} className="marker-bracket text-[1rem] font-semibold text-ink hover:text-signal">
                {l.label}
              </Link>
              <p className="mt-2 pl-[1.1rem] text-[0.88rem] leading-relaxed text-ink-soft">
                {l.blurb}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <CTASection />
    </>
  );
}
