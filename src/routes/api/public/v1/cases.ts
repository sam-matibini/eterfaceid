import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  authenticateApiRequest,
  corsPreflight,
  dispatchWebhook,
  jsonResponse,
  paging,
  withIdempotency,
} from "@/lib/api-gateway.server";
import {
  CASE_PRODUCTS,
  CASE_PURPOSES,
  INDUSTRIES,
  classifyCase,
  ensureReference,
  isEmployeeReference,
  resolveCaseCreate,
} from "@/lib/case-purpose";

const createSchema = z.object({
  case_type: z.enum(["person", "business"]).optional(),
  subject_name: z.string().trim().min(2).max(200),
  country: z.string().trim().length(2).optional(),
  reference: z.string().trim().max(60).optional(),
  purpose: z.enum(CASE_PURPOSES).optional(),
  product: z.enum(CASE_PRODUCTS).optional(),
  industry: z.enum(INDUSTRIES).optional(),
});

export const Route = createFileRoute("/api/public/v1/cases")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (auth instanceof Response) return auth;
        const { limit, offset, searchParams } = paging(request);
        let query = auth.admin
          .from("cases")
          .select("id, reference, case_type, subject_name, country, status, risk_level, risk_score, created_at")
          .eq("org_id", auth.orgId)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        const status = searchParams.get("status");
        const caseType = searchParams.get("case_type");
        const purpose = searchParams.get("purpose");
        if (status) query = query.eq("status", status as never);
        if (caseType) query = query.eq("case_type", caseType as never);
        if (purpose === "employee") {
          query = query.or("reference.ilike.EMP-%,reference.ilike.EMPLOYEE-%,reference.ilike.HR-%");
        } else if (purpose === "kyb") query = query.eq("case_type", "business");
        else if (purpose === "kyc") query = query.eq("case_type", "person");
        const { data, error } = await query;
        if (error) return jsonResponse({ error: "query_failed", message: error.message }, 500);
        const rows = (data ?? []).filter((row) => {
          if (purpose === "kyc") return !isEmployeeReference((row as { reference?: string }).reference);
          if (purpose && purpose !== "aml" && purpose !== "employee" && purpose !== "kyb" && purpose !== "kyc") {
            return false;
          }
          return true;
        });
        const decorated = rows.map((row) => ({
          ...row,
          purpose: classifyCase(row as { case_type: string; reference: string }),
        }));
        return jsonResponse({ data: decorated, paging: { limit, offset, count: decorated.length } });
      },
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (auth instanceof Response) return auth;
        const parsed = createSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return jsonResponse({ error: "invalid_request", issues: parsed.error.issues }, 422);
        }
        return withIdempotency(auth, request, "cases", async () => {
        const resolved = resolveCaseCreate({
          case_type: parsed.data.case_type,
          purpose: parsed.data.purpose,
          product: parsed.data.product,
        });
        const reference = ensureReference(resolved.purpose, parsed.data.reference);
        const { data, error } = await auth.admin
          .from("cases")
          .insert({
            org_id: auth.orgId,
            reference,
            case_type: resolved.case_type,
            subject_name: parsed.data.subject_name,
            country: parsed.data.country?.toUpperCase() ?? null,
          })
          .select("id, reference, case_type, subject_name, country, status, risk_level, risk_score, created_at")
          .single();
        if (error) return jsonResponse({ error: "create_failed", message: error.message }, 500);

        await auth.admin.from("audit_events").insert({
          org_id: auth.orgId,
          action: "case.created.api",
          entity_type: "case",
          entity_id: (data as any).id,
          detail: {
            environment: auth.environment,
            reference,
            purpose: resolved.purpose,
            product: parsed.data.product ?? null,
            industry: parsed.data.industry ?? "fintech",
          },
        });
        await dispatchWebhook(auth.admin, auth.orgId, auth.environment, "case.created", {
          ...(data as Record<string, unknown>),
          purpose: resolved.purpose,
          product: parsed.data.product ?? null,
          industry: parsed.data.industry ?? "fintech",
        });
        return jsonResponse(
          {
            data: {
              ...data,
              purpose: resolved.purpose,
              product: parsed.data.product ?? null,
              industry: parsed.data.industry ?? "fintech",
            },
          },
          201,
        );
        });
      },
    },
  },
});
