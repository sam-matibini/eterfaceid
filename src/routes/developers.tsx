import { createFileRoute } from "@tanstack/react-router";
import { CTASection, DefinitionRow, PageHero, Section } from "@/components/site/primitives";

export const Route = createFileRoute("/developers")({
  head: () => ({
    meta: [
      { title: "Developers & API — eterfaceID" },
      {
        name: "description",
        content:
          "REST API for creating verification cases, collecting documents and biometrics, screening against watchlists and receiving webhooks.",
      },
      { property: "og:title", content: "Developers & API — eterfaceID" },
      {
        property: "og:description",
        content: "One resource model for people, businesses and screening. Webhooks for everything asynchronous.",
      },
    ],
  }),
  component: Developers,
});

const createCase = `POST /v1/verifications
Authorization: Bearer sk_live_...
Content-Type: application/json

{
  "type": "person",
  "method": "government_photo_id",
  "reference": "customer_8842",
  "person": {
    "given_name": "Amelia",
    "family_name": "Okonkwo",
    "date_of_birth": "1991-04-17",
    "address": {
      "line1": "220 Portage Ave",
      "city": "Winnipeg",
      "region": "MB",
      "postal_code": "R3C 0A5",
      "country": "CA"
    },
    "phone": "+12045550188",
    "email": "amelia@example.com"
  },
  "checks": ["document", "liveness", "face_match", "address", "phone", "email", "screening"]
}`;

const result = `{
  "id": "ver_01JB7K2T9Q",
  "status": "completed",
  "decision": "approved",
  "method": "government_photo_id",
  "checks": {
    "document": { "result": "pass", "type": "passport", "country": "CA" },
    "liveness": { "result": "pass", "mode": "passive" },
    "face_match": { "result": "pass", "similarity": 0.94 },
    "address": { "result": "pass", "sources": 2 },
    "phone": { "result": "pass", "line_type": "mobile" },
    "email": { "result": "pass", "first_seen": "2013-08-02" },
    "screening": { "result": "no_match", "sources_checked": 1428 }
  },
  "monitoring": { "enabled": true, "frequency": "continuous" },
  "created_at": "2026-09-16T14:22:08Z",
  "retention_until": "2033-09-16T14:22:08Z"
}`;

const webhook = `{
  "event": "screening.match.created",
  "verification_id": "ver_01JB7K2T9Q",
  "match": {
    "id": "mat_01JB9X4M2P",
    "list": "OFAC SDN",
    "published_at": "2026-09-14T00:00:00Z",
    "score": 0.88,
    "matched_fields": ["name", "date_of_birth"],
    "conflicting_fields": ["nationality"]
  }
}`;

function Block({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {title}
      </h3>
      <pre className="mt-3 overflow-x-auto rounded-sm border border-rule bg-paper p-5 font-mono text-[0.78rem] leading-[1.7] text-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Developers() {
  return (
    <>
      <PageHero
        eyebrow="Developers"
        title="A REST API that returns reasons, not just verdicts"
        lede="Create a verification, collect what you need from the customer, and receive a result whose every field tells you where it came from. Asynchronous outcomes arrive by webhook."
      />

      <Section title="The verification lifecycle">
        <div className="border-b border-rule">
          <DefinitionRow term="Create">
            One POST creates the case and returns a hosted flow URL, or a session token for the
            embedded SDK.
          </DefinitionRow>
          <DefinitionRow term="Collect">
            The customer completes document capture and the selfie. You can also skip collection
            entirely for data-only checks.
          </DefinitionRow>
          <DefinitionRow term="Resolve">
            Checks run in parallel. The case moves to completed with a decision of approved,
            declined or review.
          </DefinitionRow>
          <DefinitionRow term="Monitor">
            Once completed, the subject is enrolled in ongoing screening. New matches arrive as
            webhook events for as long as monitoring stays enabled.
          </DefinitionRow>
        </div>
      </Section>

      <Section title="Examples" className="bg-paper-deep">
        <div className="grid gap-8 lg:grid-cols-2">
          <Block title="Create a person verification" code={createCase} />
          <Block title="Completed result" code={result} />
        </div>
        <div className="mt-8 max-w-[46rem]">
          <Block title="Monitoring webhook" code={webhook} />
        </div>
        <p className="mt-8 max-w-[70ch] text-[0.85rem] leading-[1.7] text-ink-soft">
          Illustrative payloads. Field names are stable within a major version; new fields may be
          added without a version bump, so parse defensively.
        </p>
      </Section>

      <Section title="Practical notes">
        <div className="border-b border-rule">
          <DefinitionRow term="Authentication">
            Bearer keys, scoped per environment. Live keys never leave your server; the browser
            only ever holds a short-lived session token.
          </DefinitionRow>
          <DefinitionRow term="Idempotency">
            Send an idempotency key on every create. A retried request returns the original case
            rather than charging you twice.
          </DefinitionRow>
          <DefinitionRow term="Sandbox">
            A full sandbox with deterministic test identities for each outcome — pass, fail,
            review, sanctions hit, PEP hit.
          </DefinitionRow>
          <DefinitionRow term="Webhook security">
            Every delivery is signed. Verify the signature against the raw body before acting on
            the payload, and expect at-least-once delivery.
          </DefinitionRow>
          <DefinitionRow term="Rate limits">
            Per-key limits with clear headers. Burst allowances are raised on request for
            batch backfills.
          </DefinitionRow>
        </div>
      </Section>

      <CTASection
        title="Want sandbox access?"
        body="Tell us what you are building and we will issue test keys and walk your engineers through the first integration."
      />
    </>
  );
}
