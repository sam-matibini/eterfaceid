import { supabase } from "@/integrations/supabase/client";
import type { AccessRole, AppRole } from "@/lib/access";
import { inferAccessRole } from "@/lib/access";
import { isEmployeeReference } from "@/lib/case-purpose";

export type { AppRole, AccessRole };
export type CaseType = "person" | "business";
export type CaseStatus = "pending" | "in_review" | "approved" | "rejected";
export type RiskLevel = "low" | "medium" | "high";

export const statusLabel: Record<CaseStatus, string> = {
  pending: "Pending",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

export const riskLabel: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const categoryLabel: Record<string, string> = {
  sanctions: "Sanctions",
  pep: "PEP",
  rca: "RCA",
  watchlist: "Watchlist",
  adverse_media: "Adverse media",
};

export async function fetchCases() {
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchCase(id: string) {
  const [caseRow, checks, owners, hits, alerts] = await Promise.all([
    supabase.from("cases").select("*").eq("id", id).maybeSingle(),
    supabase.from("case_checks").select("*").eq("case_id", id).order("checked_at"),
    supabase.from("business_owners").select("*").eq("case_id", id).order("ownership_pct", { ascending: false }),
    supabase.from("screening_hits").select("*").eq("case_id", id).order("match_score", { ascending: false }),
    supabase.from("monitoring_alerts").select("*").eq("case_id", id).order("created_at", { ascending: false }),
  ]);
  const err = caseRow.error ?? checks.error ?? owners.error ?? hits.error ?? alerts.error;
  if (err) throw err;
  return {
    record: caseRow.data,
    checks: checks.data ?? [],
    owners: owners.data ?? [],
    hits: hits.data ?? [],
    alerts: alerts.data ?? [],
  };
}

export async function fetchAlerts() {
  const { data, error } = await supabase
    .from("monitoring_alerts")
    .select("*, cases(reference, subject_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchAuditEvents() {
  const { data, error } = await supabase
    .from("audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

export async function fetchTeam() {
  const [members, profiles, invites] = await Promise.all([
    supabase
      .from("organization_members")
      .select(
        "user_id, role, access_role, is_owner, user_type, job_title, sandbox_access, live_access, permissions, mfa_required, status, created_at",
      ),
    supabase.from("profiles").select("*"),
    supabase
      .from("organization_invites")
      .select("*")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (members.error) {
    if (/does not exist|schema cache/i.test(members.error.message)) {
      const legacy = await supabase.from("organization_members").select("user_id, role, created_at");
      const legacyProfiles = await supabase.from("profiles").select("*");
      return {
        members: (legacy.data ?? []).map((m) => {
          const profile = (legacyProfiles.data ?? []).find((p) => p.id === m.user_id);
          return {
            userId: m.user_id,
            role: m.role as AppRole,
            accessRole: inferAccessRole(m.role),
            isOwner: m.role === "admin",
            userType: "employee",
            jobTitle: null,
            sandboxAccess: true,
            liveAccess: m.role === "admin",
            permissions: [],
            mfaRequired: m.role === "admin",
            status: "active",
            email: profile?.email ?? null,
            fullName: profile?.full_name ?? null,
          };
        }),
        invites: [],
      };
    }
    throw members.error;
  }
  if (profiles.error) throw profiles.error;
  if (invites.error) throw invites.error;
  return {
    members: (members.data ?? []).map((m) => {
      const profile = (profiles.data ?? []).find((p) => p.id === m.user_id);
      return {
        userId: m.user_id,
        role: m.role as AppRole,
        accessRole: (m.access_role as AccessRole | null) ?? "viewer",
        isOwner: Boolean(m.is_owner),
        userType: m.user_type ?? "employee",
        jobTitle: m.job_title ?? null,
        sandboxAccess: m.sandbox_access !== false,
        liveAccess: Boolean(m.live_access),
        permissions: (m.permissions as string[] | null) ?? [],
        mfaRequired: Boolean(m.mfa_required),
        status: m.status ?? "active",
        email: profile?.email ?? null,
        fullName: profile?.full_name ?? null,
      };
    }),
    invites: invites.data ?? [],
  };
}

export async function fetchLiveAccessRequests() {
  const { data, error } = await supabase
    .from("live_access_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return data;
}

export async function fetchApiRequestLogs() {
  const { data, error } = await supabase
    .from("api_request_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return data ?? [];
}

export async function fetchOrganizationProfile(orgId: string) {
  const { data, error } = await supabase.from("organizations").select("*").eq("id", orgId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchDashboardStats() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [cases, logs, keys] = await Promise.all([
    supabase.from("cases").select("id, case_type, status, reference, created_at"),
    supabase
      .from("api_request_logs")
      .select("id, success, created_at, environment")
      .gte("created_at", since.toISOString()),
    supabase.from("api_keys").select("id, environment, revoked_at").is("revoked_at", null),
  ]);
  if (cases.error) throw cases.error;
  const allCases = cases.data ?? [];
  const allLogs = logs.error ? [] : (logs.data ?? []);
  const employees = allCases.filter((c) => isEmployeeReference(c.reference)).length;
  return {
    kyc: allCases.filter((c) => c.case_type === "person" && !isEmployeeReference(c.reference)).length,
    kyb: allCases.filter((c) => c.case_type === "business").length,
    aml: allCases.length,
    employees,
    requestsToday: allLogs.length,
    successful: allLogs.filter((l) => l.success !== false).length,
    failed: allLogs.filter((l) => l.success === false).length,
    sandboxKeys: (keys.data ?? []).filter((k) => k.environment !== "live").length,
    liveKeys: (keys.data ?? []).filter((k) => k.environment === "live").length,
  };
}


export async function fetchApiKeys() {
  const { data, error } = await supabase
    .from("api_keys")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchWatchlistSources() {
  const { data, error } = await supabase
    .from("watchlist_sources")
    .select("*")
    .order("category")
    .order("title");
  if (error) throw error;
  return data;
}

export async function fetchWatchlistVersions() {
  const { data, error } = await supabase
    .from("watchlist_versions")
    .select("*, watchlist_sources(title, code)")
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function fetchScreeningRuns(caseId: string) {
  const { data, error } = await supabase
    .from("screening_runs")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return data;
}

export async function logAudit(
  action: string,
  entityType: string,
  entityId: string | null,
  detail: Record<string, unknown> = {},
) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("audit_events").insert({
    actor_id: data.user.id,
    actor_email: data.user.email ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail: detail as never,
  });
}

export async function fetchTransactions() {
  const { data, error } = await supabase
    .from("transactions")
    .select("*, cases(reference, subject_name), transaction_alerts(*)")
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function fetchReports() {
  const { data, error } = await supabase
    .from("regulatory_reports")
    .select("*, cases(reference, subject_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function fetchWebhookEndpoints() {
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchWebhookDeliveries() {
  const { data, error } = await supabase
    .from("webhook_deliveries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}
