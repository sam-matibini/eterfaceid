import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  apiAudit,
  authenticateApiRequest,
  corsPreflight,
  jsonResponse,
  loadCase,
  readJson,
} from "@/lib/api-gateway.server";
import { compareRegistry, pickBestMatch, THEKYB_PROVIDER } from "@/lib/thekyb";

const schema = z
  .object({
    name: z.string().trim().min(3).max(128).optional(),
    registration_number: z.string().trim().max(80).optional(),
    country: z.string().trim().max(40).optional(),
    kyb_response_id: z.string().trim().min(4).max(80).optional(),
  })
  .default({});

async function thekybEnabled(auth: { admin: any }) {
  const { data } = await auth.admin
    .from("integration_settings")
    .select("enabled")
    .eq("provider", THEKYB_PROVIDER)
    .maybeSingle();
  return Boolean(data?.enabled);
}

export const Route = createFileRoute("/api/public/v1/cases/$caseId/registry")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request);
        if (auth instanceof Response) return auth;
        const { data } = await auth.admin
          .from("thekyb_lookups")
          .select(
            "id, matched_name, registration_number, country_code, registry_status, company_type, risk_level, comparisons, result, created_at",
          )
          .eq("case_id", params.caseId)
          .eq("org_id", auth.orgId)
          .order("created_at", { ascending: false });
        return jsonResponse({ data: { lookups: data ?? [] } });
      },
      POST: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request);
        if (auth instanceof Response) return auth;
        const parsed = await readJson(request, schema);
        if (!parsed.ok) return parsed.response;
        const record = await loadCase(auth, params.caseId, "id, subject_name, country, case_type");
        if (!record) return jsonResponse({ error: "not_found", message: "Unknown case" }, 404);

        const subjectName = String((record as any).subject_name ?? "");
        const country = parsed.data.country ?? ((record as any).country as string | null);

        if (auth.sandbox) {
          const { sandboxRegistryLookup } = await import("@/lib/sandbox.server");
          const identity = sandboxRegistryLookup(subjectName);
          await apiAudit(auth, "registry.looked_up", "case", params.caseId, { sandbox: true });
          return jsonResponse({ data: { sandbox: true, ...identity } });
        }

        if (!(await thekybEnabled(auth))) {
          return jsonResponse(
            { error: "integration_disabled", message: "The KYB registry lookup is switched off for this platform." },
            409,
          );
        }

        const { thekyb, thekybConfigured } = await import("@/lib/thekyb.server");
        if (!(await thekybConfigured())) {
          return jsonResponse(
            { error: "integration_not_configured", message: "The KYB API key has not been added yet." },
            409,
          );
        }

        try {
          const search = await thekyb.search({
            name: parsed.data.name ?? subjectName,
            registrationNumber: parsed.data.registration_number,
            country,
          });

          const picked = parsed.data.kyb_response_id
            ? search.matches.find((m) => m.kyb_response_id === parsed.data.kyb_response_id) ?? {
                kyb_response_id: parsed.data.kyb_response_id,
                name: parsed.data.name ?? subjectName,
                registration_number: parsed.data.registration_number ?? null,
                country_code: country,
                type: null,
                status: null,
                risk_level: null,
                verification_status: null,
                fetch_status: null,
              }
            : pickBestMatch(parsed.data.name ?? subjectName, parsed.data.registration_number, search.matches);

          if (!picked) {
            return jsonResponse({ error: "not_found", message: "No company matched that search." }, 404);
          }

          const profile = await thekyb.profile(picked.kyb_response_id);
          const { comparisons, result } = compareRegistry({
            claimedName: subjectName,
            claimedRegistration: parsed.data.registration_number,
            matchedName: profile.name ?? picked.name,
            matchedRegistration: profile.registration_number ?? picked.registration_number,
            registryStatus: profile.status ?? picked.status,
          });

          const { data: row, error } = await auth.admin
            .from("thekyb_lookups")
            .insert({
              org_id: auth.orgId,
              case_id: params.caseId,
              kyb_request_id: search.kyb_request_id,
              kyb_response_id: picked.kyb_response_id,
              query_name: parsed.data.name ?? subjectName,
              registration_number: parsed.data.registration_number ?? profile.registration_number ?? null,
              country_code: profile.country_code ?? country,
              matched_name: profile.name ?? picked.name,
              registry_status: profile.status ?? picked.status,
              company_type: profile.type ?? picked.type,
              risk_level: profile.risk_level ?? picked.risk_level,
              verification_status: profile.verification_status ?? picked.verification_status,
              fetch_status: profile.fetch_status ?? picked.fetch_status,
              profile: profile as never,
              comparisons: comparisons as never,
              result,
            } as never)
            .select("id")
            .single();
          if (error) return jsonResponse({ error: "create_failed", message: error.message }, 500);

          await auth.admin.from("case_checks").insert({
            case_id: params.caseId,
            org_id: auth.orgId,
            category: "entity",
            name: `Registry status (${profile.name ?? subjectName})`,
            result,
            detail: comparisons.map((c) => `${c.field}: ${c.status}`).join("; "),
            source: "thekyb",
          } as never);

          await apiAudit(auth, "registry.looked_up", "case", params.caseId, {
            result,
            matched_name: profile.name,
          });

          return jsonResponse(
            {
              data: {
                id: (row as any).id,
                result,
                comparisons,
                matches: search.matches,
                profile: {
                  name: profile.name ?? null,
                  registration_number: profile.registration_number ?? null,
                  status: profile.status ?? null,
                  type: profile.type ?? null,
                },
              },
            },
            201,
          );
        } catch (err) {
          return jsonResponse(
            { error: "registry_failed", message: err instanceof Error ? err.message : "registry request failed" },
            502,
          );
        }
      },
    },
  },
});
