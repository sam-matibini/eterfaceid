/** Helpers for creating a company on the live organizations schema. */

import { isRlsError, isUniqueConflict } from "./schema-compat";

export { isRlsError, isUniqueConflict };

export function newCompanyId() {
  return crypto.randomUUID();
}

export function liveOrganizationInsert(input: {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
}) {
  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    created_by: input.createdBy,
  };
}

export function liveMemberInsert(input: { orgId: string; userId: string }) {
  return {
    org_id: input.orgId,
    user_id: input.userId,
    role: "admin" as const,
  };
}

export function restAcceptedWrite(result: { error: string | null; status: number }) {
  if (result.status === 200 || result.status === 201 || result.status === 204) return true;
  if (result.error && isUniqueConflict(result.error)) return true;
  return !result.error;
}

export function resolveInsertedCompany(
  known: { id: string; name: string },
  result: { data: unknown; error: string | { message: string } | null; status?: number },
): { org: { id: string; name: string } | null; error: string | null } {
  if (result.error) {
    const message = typeof result.error === "string" ? result.error : result.error.message;
    if (result.status && result.status < 300) return { org: known, error: null };
    if (isUniqueConflict(message) && known.id) return { org: known, error: null };
    return { org: null, error: message };
  }
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (row && typeof row === "object" && row !== null && "id" in row && row.id) {
    const id = String((row as { id: unknown }).id);
    const name =
      "name" in row && (row as { name?: unknown }).name
        ? String((row as { name?: unknown }).name)
        : known.name;
    return { org: { id, name }, error: null };
  }
  if (result.status === undefined || result.status < 300) {
    return { org: known, error: null };
  }
  return { org: null, error: "The company could not be created" };
}

export function companyCreateErrorMessage(message: string) {
  if (isRlsError(message) && /organization_members/i.test(message)) {
    return "The company was saved. Sign in again and click Create company dashboard to open it.";
  }
  if (isRlsError(message)) {
    return "Sign in again after confirming your email, then create the company dashboard.";
  }
  return message;
}

/** Membership SELECT is often hidden by circular RLS. The creator still owns the company. */
export function creatorDashboard(org: { id: string; name: string }) {
  return { orgId: org.id, name: org.name, role: "admin" as const, existing: false as const };
}

export function dashboardFromCreatedCompany(input: {
  org: { id: string; name: string } | null;
  membership: { orgId: string; role: "admin" | "analyst" | "viewer" } | null;
}) {
  if (!input.org) return null;
  return {
    orgId: input.org.id,
    name: input.org.name,
    role: input.membership?.role ?? "admin",
    existing: false as const,
  };
}
