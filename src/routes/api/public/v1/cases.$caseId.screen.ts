import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  apiAudit,
  authenticateApiRequest,
  corsPreflight,
  countUsage,
  dispatchWebhook,
  jsonResponse,
  loadCase,
  readJson,
} from "@/lib/api-gateway.server";
import { screenCaseWithAdmin } from "@/lib/screening-core.server";

const schema = z.object({ threshold: z.number().min(0.3).max(1).optional() }).default({});

export const Route = createFileRoute("/api/public/v1/cases/$caseId/screen")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request);
        if (auth instanceof Response) return auth;
        const parsed = await readJson(request, schema);
        if (!parsed.ok) return parsed.response;

        const record = await loadCase(auth, params.caseId, "id, subject_name, reference");
        if (!record) return jsonResponse({ error: "not_found", message: "Unknown case" }, 404);

        try {
          const outcome = await screenCaseWithAdmin(auth.admin, {
            caseId: params.caseId,
            orgId: auth.orgId,
            ...(parsed.data.threshold !== undefined ? { threshold: parsed.data.threshold } : {}),
          });
          await apiAudit(auth, "screening.run", "case", params.caseId, outcome);
          await countUsage(auth, "screenings");
          if (outcome.new_hits > 0) {
            await dispatchWebhook(auth.admin, auth.orgId, auth.environment, "screening.hit", {
              case_id: params.caseId,
              ...outcome,
            });
            try {
              const { notifyOrg } = await import("@/lib/usage.server");
              await notifyOrg(auth.orgId, "screening.hit", {
                subject: String((record as any).subject_name ?? ""),
                reference: String((record as any).reference ?? ""),
                count: String(outcome.new_hits),
                link: `/console/cases/${params.caseId}`,
              });
            } catch {
              /* notifications never block screening */
            }
          }
          return jsonResponse({ data: outcome });
        } catch (err) {
          return jsonResponse(
            { error: "screening_failed", message: err instanceof Error ? err.message : "screening failed" },
            500,
          );
        }
      },
    },
  },
});
