import { createFileRoute } from "@tanstack/react-router";
import { CTASection, PageHero, Section } from "@/components/site/primitives";
import { industries } from "@/components/site/nav-data";

export const Route = createFileRoute("/industries")({
  head: () => ({
    meta: [
      { title: "Industries — eterfaceID" },
      {
        name: "description",
        content:
          "Identity and financial-crime controls for fintech, money services businesses, payment service providers, lending, digital assets, marketplaces, real estate and insurance.",
      },
      { property: "og:title", content: "Industries — eterfaceID" },
      {
        property: "og:description",
        content: "How regulated businesses across sectors use eterfaceID to onboard and monitor customers.",
      },
    ],
  }),
  component: Industries,
});

function Industries() {
  return (
    <>
      <PageHero
        eyebrow="Industries"
        title="Same obligations, very different onboarding flows"
        lede="The underlying requirement — know who you are dealing with and keep knowing — is constant. What changes is the friction your customers will tolerate and the evidence your regulator expects."
      />

      <Section>
        <div className="grid gap-px overflow-hidden border border-rule bg-rule sm:grid-cols-2">
          {industries.map((i) => (
            <div key={i.name} className="bg-background p-8">
              <h2 className="marker-bracket text-[1.1rem] font-semibold text-ink">{i.name}</h2>
              <p className="mt-3 pl-[1.1rem] text-[0.9rem] leading-[1.7] text-ink-soft">
                {i.summary}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <CTASection
        title="Not sure which obligations apply to you?"
        body="Tell us what you do and who your customers are. We will map it against FINTRAC's reporting-entity categories and the RPAA registration test before talking about product."
      />
    </>
  );
}
