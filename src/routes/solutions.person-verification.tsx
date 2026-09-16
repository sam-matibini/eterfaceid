import { createFileRoute } from "@tanstack/react-router";
import {
  CheckList,
  CTASection,
  DefinitionRow,
  PageHero,
  Section,
} from "@/components/site/primitives";

export const Route = createFileRoute("/solutions/person-verification")({
  head: () => ({
    meta: [
      { title: "Person Verification — eterfaceID" },
      {
        name: "description",
        content:
          "Government ID and passport checks, name, date of birth and address verification, phone and email validation, selfie, liveness and face-to-ID matching.",
      },
      { property: "og:title", content: "Person Verification — eterfaceID" },
      {
        property: "og:description",
        content:
          "Document, biometric and data checks that produce a defensible identity record for every customer.",
      },
    ],
  }),
  component: PersonVerification,
});

function PersonVerification() {
  return (
    <>
      <PageHero
        eyebrow="Person verification"
        title="Prove the person is real, present and who they claim to be"
        lede="Three layers of evidence — the document, the face in front of the camera, and the data trail behind the identity — reconciled into one decision you can defend."
      />

      <Section title="What gets checked">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              Document
            </h3>
            <div className="mt-4">
              <CheckList
                items={[
                  "Government-issued photo identification",
                  "Passports and travel documents",
                  "Provincial driver's licences and ID cards",
                  "Permanent resident and status documents",
                  "Security-feature and template authentication",
                  "MRZ, barcode and chip data cross-check",
                  "Tamper, reprint and screen-capture detection",
                  "Expiry and issuing-authority validation",
                ]}
              />
            </div>
          </div>
          <div>
            <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              Biometric
            </h3>
            <div className="mt-4">
              <CheckList
                items={[
                  "Selfie capture with guided framing",
                  "Passive and active liveness",
                  "Injection and deepfake detection",
                  "Face-to-ID portrait matching with a similarity score",
                  "Repeat-face detection across your own tenant",
                  "Configurable match thresholds per risk tier",
                ]}
              />
            </div>
          </div>
        </div>

        <div className="mt-12">
          <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            Identity data
          </h3>
          <div className="mt-4">
            <CheckList
              items={[
                "Full name verification against authoritative sources",
                "Date of birth confirmation",
                "Residential address validation and standardisation",
                "National and government ID number checks",
                "Phone ownership, carrier and line-type checks",
                "Email age, breach exposure and domain reputation",
                "Deceased and known-fraud file screening",
                "Synthetic identity indicators",
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title="How a check runs" className="bg-paper">
        <div className="border-b border-rule">
          <DefinitionRow term="1. Create the check">
            Call the API with whatever you already hold — name, date of birth, address, phone,
            email — and choose the verification method your policy requires.
          </DefinitionRow>
          <DefinitionRow term="2. Collect from the customer">
            Send them to a hosted flow or embed the capture SDK. The flow adapts to the document
            type and handles retries, poor lighting and accessibility needs.
          </DefinitionRow>
          <DefinitionRow term="3. Reconcile">
            Document data, biometric result and the data-source checks are compared. Conflicts are
            surfaced as specific reasons, not a single opaque score.
          </DefinitionRow>
          <DefinitionRow term="4. Decide and record">
            Auto-approve, auto-decline or route to an analyst. The outcome, the evidence and the
            reviewer are written to an append-only record.
          </DefinitionRow>
        </div>
      </Section>

      <Section
        title="Recognised identification methods"
        intro="Canadian reporting entities cannot simply pick any check. eterfaceID maps each verification to the method that satisfies the requirement."
      >
        <div className="border-b border-rule">
          <DefinitionRow term="Government-issued photo ID method">
            Authenticity of the document plus a match between the document portrait and the person
            presenting it, captured live.
          </DefinitionRow>
          <DefinitionRow term="Credit file method">
            A match against a credit file that has existed for the required minimum period, drawn
            from a Canadian credit bureau.
          </DefinitionRow>
          <DefinitionRow term="Dual-process method">
            Two independent, reliable sources confirming name with address, or name with date of
            birth, or name with a financial account.
          </DefinitionRow>
        </div>
      </Section>

      <CTASection />
    </>
  );
}
