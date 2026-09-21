import { inferAccessRole, type AccessRole, type AppRole } from "@/lib/access";

export type OrganizationMembership = {
  orgId: string;
  role: AppRole;
  accessRole: AccessRole;
  isOwner: boolean;
  name: string;
  legalName: string;
  orgLiveAccess: string;
  sandboxAccess: boolean;
  liveAccess: boolean;
  permissions: string[];
  mfaRequired: boolean;
  jobTitle: string | null;
  userType: string;
};

type MemberQuery = {
  data: unknown[] | null;
  error: { message: string } | null;
};

export const OPENING_COMPANY_KEY = "eid_opening_company";
export const CREATED_WORKSPACE_KEY = "eid_workspace";

const FULL_SELECT =
  "org_id, role, access_role, is_owner, sandbox_access, live_access, permissions, mfa_required, job_title, user_type, status, organizations(id, name, slug, legal_name, live_access)";
const LIVE_SELECT = "org_id, role, organizations(id, name, slug, live_access)";
const MIN_SELECT = "org_id, role";

export function membershipFromCreate(input: { orgId: string; name: string; role?: AppRole }): OrganizationMembership {
  const role = input.role ?? "admin";
  return {
    orgId: input.orgId,
    role,
    accessRole: inferAccessRole(role),
    isOwner: role === "admin",
    name: input.name,
    legalName: input.name,
    orgLiveAccess: "locked",
    sandboxAccess: true,
    liveAccess: role === "admin",
    permissions: [],
    mfaRequired: role === "admin",
    jobTitle: null,
    userType: "employee",
  };
}

/** Creator still owns the company when the membership insert was blocked by RLS. */
export function mergeOwnedOrganizations(
  memberships: OrganizationMembership[],
  owned: Array<{ id?: unknown; name?: unknown; legal_name?: unknown }>,
) {
  const seen = new Set(memberships.map((row) => row.orgId));
  const extra = owned
    .map((row) => {
      const orgId = typeof row.id === "string" ? row.id : "";
      const name = String(row.legal_name || row.name || "Your team");
      return membershipFromCreate({ orgId, name });
    })
    .filter((row) => row.orgId && !seen.has(row.orgId));
  return extra.length ? [...memberships, ...extra] : memberships;
}

export function workspaceFromStorage(raw: string | null): OrganizationMembership | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { orgId?: unknown; name?: unknown; legalName?: unknown; role?: unknown };
    const orgId = typeof parsed.orgId === "string" ? parsed.orgId : "";
    if (!orgId) return null;
    const name = String(parsed.legalName || parsed.name || "Your team");
    const role = parsed.role === "analyst" || parsed.role === "viewer" ? parsed.role : "admin";
    return membershipFromCreate({ orgId, name, role });
  } catch {
    return null;
  }
}

export function persistCreatedWorkspace(row: OrganizationMembership) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    CREATED_WORKSPACE_KEY,
    JSON.stringify({ orgId: row.orgId, name: row.name, legalName: row.legalName, role: row.role }),
  );
}

export function readPersistedWorkspace(): OrganizationMembership | null {
  if (typeof window === "undefined") return null;
  try {
    return workspaceFromStorage(window.localStorage.getItem(CREATED_WORKSPACE_KEY));
  } catch {
    return null;
  }
}

export function clearPersistedWorkspace() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CREATED_WORKSPACE_KEY);
  window.sessionStorage.removeItem(OPENING_COMPANY_KEY);
}

export function shouldRedirectToOnboarding(input: {
  ready: boolean;
  loaded: boolean;
  fetching?: boolean;
  organization: unknown;
  openingCompany?: boolean;
}) {
  if (input.openingCompany || input.fetching) return false;
  return Boolean(input.ready && input.loaded && !input.organization);
}

export function isMembershipQueryError(message: string) {
  return /does not exist|schema cache|column|Could not find/i.test(message);
}

export function mapMembershipRows(data: unknown[] | null): OrganizationMembership[] {
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => row["status"] !== "disabled")
    .map((raw) => {
      const org = (raw["organizations"] as Record<string, unknown> | null) ?? null;
      const role = (raw["role"] as AppRole) ?? "viewer";
      return {
        orgId: String(raw["org_id"] ?? ""),
        role,
        accessRole: (raw["access_role"] as AccessRole | null) ?? inferAccessRole(role),
        isOwner: Boolean(raw["is_owner"]) || role === "admin",
        name: String(org?.["name"] ?? "Your team"),
        legalName: String(org?.["legal_name"] ?? org?.["name"] ?? "Your team"),
        orgLiveAccess: String(org?.["live_access"] ?? "locked"),
        sandboxAccess: raw["sandbox_access"] !== false,
        liveAccess: Boolean(raw["live_access"]) || role === "admin",
        permissions: (raw["permissions"] as string[] | null) ?? [],
        mfaRequired: Boolean(raw["mfa_required"]) || role === "admin",
        jobTitle: (raw["job_title"] as string | null) ?? null,
        userType: String(raw["user_type"] ?? "employee"),
      };
    })
    .filter((row) => row.orgId);
}

export async function fetchMembershipRows(
  query: (select: string, orderByCreatedAt: boolean) => Promise<MemberQuery>,
) {
  const attempts: Array<{ select: string; order: boolean }> = [
    { select: FULL_SELECT, order: true },
    { select: FULL_SELECT, order: false },
    { select: LIVE_SELECT, order: true },
    { select: LIVE_SELECT, order: false },
    { select: MIN_SELECT, order: false },
  ];
  let lastError: { message: string } | null = null;
  for (const attempt of attempts) {
    const result = await query(attempt.select, attempt.order);
    if (!result.error) return { data: result.data ?? [], error: null };
    lastError = result.error;
    if (!isMembershipQueryError(result.error.message)) break;
  }
  return { data: [] as unknown[], error: lastError };
}
