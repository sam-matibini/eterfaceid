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

const FULL_SELECT =
  "org_id, role, access_role, is_owner, sandbox_access, live_access, permissions, mfa_required, job_title, user_type, status, organizations(id, name, slug, legal_name, live_access)";
const LIVE_SELECT = "org_id, role, organizations(id, name, slug, live_access)";

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
