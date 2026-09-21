import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CASE_PRODUCTS, CASE_PURPOSES, INDUSTRIES, ensureReference, resolveCaseCreate } from "@/lib/case-purpose";
import { isMissingSchemaError, writeIgnoringUnknownColumns } from "@/lib/schema-compat";

const createInquirySchema = z.object({
  subjectName: z.string().trim().min(2).max(200),
  country: z.string().trim().length(2).optional(),
  reference: z.string().trim().max(60).optional(),
  purpose: z.enum(CASE_PURPOSES).optional(),
  product: z.enum(CASE_PRODUCTS).optional(),
  industry: z.enum(INDUSTRIES).optional(),
  caseType: z.enum(["person", "business"]).optional(),
});

export const createInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createInquirySchema.parse(input))
  .handler(async ({ data, context }) => {
    let membership = await context.supabase
      .from("organization_members")
      .select("org_id, role, status")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (membership.error && isMissingSchemaError(membership.error.message)) {
      membership = await context.supabase
        .from("organization_members")
        .select("org_id, role")
        .eq("user_id", context.userId)
        .limit(1)
        .maybeSingle();
    }
    if (membership.error) throw new Error(membership.error.message);
    const orgId = (membership.data as { org_id?: string } | null)?.org_id;
    if (!orgId) throw new Error("You are not part of a company yet");

    const resolved = resolveCaseCreate({
      case_type: data.caseType,
      purpose: data.purpose,
      product: data.product,
    });
    const reference = ensureReference(resolved.purpose, data.reference);

    const created = await writeIgnoringUnknownColumns<{ id: string; reference: string }>(async (payload) => {
      const result = await context.supabase
        .from("cases")
        .insert(payload)
        .select("id, reference")
        .single();
      return { data: result.data as { id: string; reference: string } | null, error: result.error };
    }, {
      org_id: orgId,
      reference,
      case_type: resolved.case_type,
      subject_name: data.subjectName,
      country: data.country?.toUpperCase() ?? null,
      created_by: context.userId,
    });
    if (created.error) throw new Error(created.error.message);
    const row = created.data;
    if (!row?.id) throw new Error("The inquiry could not be created");

    try {
      await context.supabase.from("audit_events").insert({
        org_id: orgId,
        actor_id: context.userId,
        action: "case.created.console",
        entity_type: "case",
        entity_id: row.id,
        detail: {
          purpose: resolved.purpose,
          product: data.product ?? null,
          industry: data.industry ?? "fintech",
          reference,
        } as never,
      });
    } catch {
      /* audit must not block */
    }

    return { id: row.id as string, reference, purpose: resolved.purpose, case_type: resolved.case_type };
  });
