import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  compareRegistry,
  maskApiKey,
  pickBestMatch,
  THEKYB_PROVIDER,
  type RegistryComparison,
  type RegistryMatch,
} from "@/lib/thekyb";

async function requireStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("platform_staff").select("id").eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("This area is for eterfaceID staff only");
}

async function ensureWriter(context: { supabase: any; userId: string }) {
  const { data: allowed } = await context.supabase.rpc("can_write", { _user_id: context.userId });
  if (!allowed) throw new Error("You do not have permission to make this change");
}

async function ensureEnabled(supabase: any) {
  const { data } = await supabase
    .from("integration_settings")
    .select("enabled")
    .eq("provider", THEKYB_PROVIDER)
    .maybeSingle();
  if (!data?.enabled) throw new Error("The KYB is switched off. Turn it on in App admin.");
}

async function caseContext(supabase: any, caseId: string) {
  const { data } = await supabase
    .from("cases")
    .select("id, org_id, subject_name, country, reference, case_type")
    .eq("id", caseId)
    .maybeSingle();
  if (!data) throw new Error("That case could not be found");
  return data as {
    id: string;
    org_id: string;
    subject_name: string;
    country: string | null;
    reference: string;
    case_type: string;
  };
}

export const thekybStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { thekybConfigured } = await import("@/lib/thekyb.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: setting } = await context.supabase
      .from("integration_settings")
      .select("enabled, last_error, last_checked_at")
      .eq("provider", THEKYB_PROVIDER)
      .maybeSingle();
    let last4: string | null = null;
    try {
      const { data: secret } = await supabaseAdmin
        .from("integration_secrets")
        .select("last4")
        .eq("provider", THEKYB_PROVIDER)
        .maybeSingle();
      last4 = (secret as { last4?: string } | null)?.last4 ?? null;
    } catch {
      /* table may not exist until the migration is applied */
    }
    return {
      enabled: Boolean(setting?.enabled),
      configured: await thekybConfigured(),
      last4,
      lastError: setting?.last_error ?? null,
      lastCheckedAt: setting?.last_checked_at ?? null,
    };
  });

export const saveTheKybApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ apiKey: z.string().trim().min(8).max(400) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const last4 = data.apiKey.slice(-4);
    await supabaseAdmin.from("integration_secrets").upsert(
      {
        provider: THEKYB_PROVIDER,
        api_key: data.apiKey,
        last4,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      } as never,
      { onConflict: "provider" },
    );

    process.env["THEKYB_API_KEY"] = data.apiKey;

    let countries = 0;
    let lastError: string | null = null;
    try {
      const { thekyb } = await import("@/lib/thekyb.server");
      countries = (await thekyb.ping()).countries;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "The KYB key could not be checked";
    }

    await supabaseAdmin
      .from("integration_settings")
      .update({
        enabled: !lastError,
        status: lastError ? "error" : "live",
        last_checked_at: new Date().toISOString(),
        last_error: lastError,
        config: { last4, backoffice: "https://backoffice.thekyb.com/" } as never,
      } as never)
      .eq("provider", THEKYB_PROVIDER);

    const { data: notepad } = await supabaseAdmin
      .from("api_notepad")
      .select("id")
      .eq("title", "The KYB")
      .maybeSingle();
    if (notepad) {
      await supabaseAdmin
        .from("api_notepad")
        .update({
          status: lastError ? "connecting" : "live",
          notes: lastError
            ? `Key saved ending ${maskApiKey(data.apiKey)}. Check failed: ${lastError}`
            : `Key saved ending ${maskApiKey(data.apiKey)}. Generate or rotate it at https://backoffice.thekyb.com/ (Settings → API integration).`,
        } as never)
        .eq("id", (notepad as { id: string }).id);
    }

    if (lastError) throw new Error(lastError);
    return { ok: true, last4: maskApiKey(data.apiKey), countries };
  });

const searchInput = z.object({
  caseId: z.string().uuid(),
  name: z.string().trim().min(3).max(128).optional(),
  registrationNumber: z.string().trim().max(80).optional(),
  country: z.string().trim().max(40).optional(),
});

export const searchTheKyb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => searchInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureWriter(context);
    await ensureEnabled(context.supabase);
    const kase = await caseContext(context.supabase, data.caseId);
    const { thekyb } = await import("@/lib/thekyb.server");
    const result = await thekyb.search({
      name: data.name ?? kase.subject_name,
      registrationNumber: data.registrationNumber,
      country: data.country ?? kase.country,
    });
    return result;
  });

export const verifyTheKybCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        caseId: z.string().uuid(),
        kybResponseId: z.string().trim().min(4).max(80),
        kybRequestId: z.string().trim().max(80).optional(),
        claimedRegistration: z.string().trim().max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureWriter(context);
    await ensureEnabled(context.supabase);
    const kase = await caseContext(context.supabase, data.caseId);
    const { thekyb } = await import("@/lib/thekyb.server");
    const profile = await thekyb.profile(data.kybResponseId);
    return persistLookup({
      supabase: context.supabase,
      userId: context.userId,
      kase,
      profile,
      kybRequestId: data.kybRequestId ?? profile.kyb_request_id ?? null,
      claimedRegistration: data.claimedRegistration,
    });
  });

export const runTheKybLookup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => searchInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensureWriter(context);
    await ensureEnabled(context.supabase);
    const kase = await caseContext(context.supabase, data.caseId);
    const { thekyb } = await import("@/lib/thekyb.server");
    const search = await thekyb.search({
      name: data.name ?? kase.subject_name,
      registrationNumber: data.registrationNumber,
      country: data.country ?? kase.country,
    });
    const picked = pickBestMatch(data.name ?? kase.subject_name, data.registrationNumber, search.matches);
    if (!picked) {
      throw new Error("The KYB found no company matching that name or registration number.");
    }
    const profile = await thekyb.profile(picked.kyb_response_id);
    return persistLookup({
      supabase: context.supabase,
      userId: context.userId,
      kase,
      profile,
      kybRequestId: search.kyb_request_id,
      claimedRegistration: data.registrationNumber,
      matches: search.matches,
    });
  });

async function persistLookup(input: {
  supabase: any;
  userId: string;
  kase: { id: string; org_id: string; subject_name: string; country: string | null };
  profile: {
    kyb_response_id?: string;
    name?: string;
    registration_number?: string | null;
    status?: string | null;
    type?: string | null;
    country_code?: string | null;
    risk_level?: string | null;
    verification_status?: string | null;
    fetch_status?: string | null;
    people_detail?: Array<{ name?: string; designation?: string }>;
    beneficial_owners_detail?: Array<{ name?: string; designation?: string }>;
    addresses_detail?: Array<{ address?: string }>;
    [key: string]: unknown;
  };
  kybRequestId: string | null;
  claimedRegistration?: string | null | undefined;
  matches?: RegistryMatch[] | undefined;
}) {
  const { comparisons, result } = compareRegistry({
    claimedName: input.kase.subject_name,
    claimedRegistration: input.claimedRegistration,
    matchedName: input.profile.name ?? "",
    matchedRegistration: input.profile.registration_number,
    registryStatus: input.profile.status,
  });

  const officers = (input.profile.people_detail ?? []).map((p) => p.name).filter(Boolean);
  const owners = (input.profile.beneficial_owners_detail ?? []).map((p) => p.name).filter(Boolean);
  const address = input.profile.addresses_detail?.[0]?.address ?? null;

  const { data: saved, error } = await input.supabase
    .from("thekyb_lookups")
    .insert({
      org_id: input.kase.org_id,
      case_id: input.kase.id,
      kyb_request_id: input.kybRequestId,
      kyb_response_id: input.profile.kyb_response_id ?? null,
      query_name: input.kase.subject_name,
      registration_number: input.claimedRegistration ?? input.profile.registration_number ?? null,
      country_code: input.profile.country_code ?? input.kase.country,
      matched_name: input.profile.name ?? null,
      registry_status: input.profile.status ?? null,
      company_type: input.profile.type ?? null,
      risk_level: input.profile.risk_level ?? null,
      verification_status: input.profile.verification_status ?? null,
      fetch_status: input.profile.fetch_status ?? null,
      profile: input.profile as never,
      comparisons: comparisons as never,
      result,
      created_by: input.userId,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await input.supabase.from("case_checks").insert({
    case_id: input.kase.id,
    org_id: input.kase.org_id,
    category: "entity",
    name: `Registry status (${input.profile.name ?? input.kase.subject_name})`,
    result,
    detail: [
      comparisons.map((c) => `${c.field}: ${c.status}`).join("; "),
      officers.length ? `Officers: ${officers.slice(0, 6).join(", ")}` : null,
      owners.length ? `Beneficial owners: ${owners.slice(0, 6).join(", ")}` : null,
      address ? `Address: ${address}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    source: "thekyb",
  });

  await input.supabase.from("audit_events").insert({
    actor_id: input.userId,
    action: "registry.looked_up",
    entity_type: "case",
    entity_id: input.kase.id,
    detail: {
      result,
      matched_name: input.profile.name,
      registration_number: input.profile.registration_number,
      source: "thekyb",
    },
  });

  const { recordUsage } = await import("@/lib/usage.server");
  await recordUsage(input.supabase as never, input.kase.org_id, "verifications");

  return {
    id: saved.id as string,
    result,
    comparisons,
    profile: {
      name: input.profile.name ?? null,
      registration_number: input.profile.registration_number ?? null,
      status: input.profile.status ?? null,
      type: input.profile.type ?? null,
      country_code: input.profile.country_code ?? null,
      risk_level: input.profile.risk_level ?? null,
      officers: officers.slice(0, 12),
      beneficial_owners: owners.slice(0, 12),
      address,
    },
    matches: input.matches ?? [],
  };
}

export type { RegistryComparison };
