import { defaultPermissions, inferAccessRole, type AccessRole, type AppRole, type UserType } from "@/lib/access";
import { isMissingColumnError, isRlsError, isUniqueConflict } from "@/lib/schema-fallback";

export type MembershipRow = {
  org_id: string;
  role: "admin" | "analyst" | "viewer";
  access_role: AccessRole;
  is_owner: boolean;
  sandbox_access: boolean;
  live_access: boolean;
  permissions: string[];
  mfa_required: boolean;
  user_type: UserType;
  job_title: string | null;
  status: string;
};

export type WorkspaceMembership = {
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

export type WorkspaceLookup = {
  memberships: WorkspaceMembership[];
  orgId: string | null;
  hasOrganization: boolean;
  lookupFailed: boolean;
};

export const emptyWorkspace: WorkspaceLookup = {
  memberships: [],
  orgId: null,
  hasOrganization: false,
  lookupFailed: false,
};

export function asAdminMembership(orgId: string): MembershipRow {
  return {
    org_id: orgId,
    role: "admin",
    access_role: "owner",
    is_owner: true,
    sandbox_access: true,
    live_access: true,
    permissions: defaultPermissions("owner"),
    mfa_required: true,
    user_type: "employee",
    job_title: null,
    status: "active",
  };
}

export function toWorkspaceMembership(
  row: MembershipRow,
  org?: { name?: string; legal_name?: string | null; live_access?: string },
): WorkspaceMembership {
  return {
    orgId: row.org_id,
    role: row.role,
    accessRole: row.access_role ?? inferAccessRole(row.role),
    isOwner: Boolean(row.is_owner) || row.role === "admin",
    name: org?.name ?? "Your team",
    legalName: org?.legal_name ?? org?.name ?? "Your team",
    orgLiveAccess: org?.live_access ?? "locked",
    sandboxAccess: row.sandbox_access !== false,
    liveAccess: Boolean(row.live_access) || row.role === "admin",
    permissions: row.permissions ?? [],
    mfaRequired: Boolean(row.mfa_required) || row.role === "admin",
    jobTitle: row.job_title ?? null,
    userType: row.user_type ?? "employee",
  };
}

function asMembershipRows(rows: MembershipRow[]) {
  return rows.filter((row) => row.status !== "disabled");
}

function fromLegacyRole(role: MembershipRow["role"]): MembershipRow {
  const accessRole = role === "admin" ? "administrator" : role === "analyst" ? "analyst" : "viewer";
  return {
    org_id: "",
    role,
    access_role: accessRole,
    is_owner: role === "admin",
    sandbox_access: true,
    live_access: role === "admin",
    permissions: defaultPermissions(accessRole),
    mfa_required: role === "admin",
    user_type: "employee",
    job_title: null,
    status: "active",
  };
}

export async function membershipsFor(supabase: any, userId: string): Promise<MembershipRow[]> {
  const full = await supabase
    .from("organization_members")
    .select(
      "org_id, role, access_role, is_owner, sandbox_access, live_access, permissions, mfa_required, user_type, job_title, status",
    )
    .eq("user_id", userId)
    .order("created_at");
  if (!full.error) {
    return asMembershipRows((full.data ?? []) as MembershipRow[]);
  }

  const legacy = await supabase.from("organization_members").select("org_id, role").eq("user_id", userId);
  if (!legacy.error) {
    return ((legacy.data ?? []) as Array<{ org_id: string; role: MembershipRow["role"] }>).map((row) => ({
      ...fromLegacyRole(row.role),
      org_id: row.org_id,
    }));
  }

  if (isRlsError(full.error.message) || isRlsError(legacy.error.message)) return [];
  if (isMissingColumnError(full.error.message) || isMissingColumnError(legacy.error.message)) return [];
  throw new Error(legacy.error.message || full.error.message);
}

export async function createdOrgs(db: any, userId: string) {
  const full = await db.from("organizations").select("id, name, legal_name, live_access").eq("created_by", userId);
  const list =
    full.error && isMissingColumnError(full.error.message)
      ? await db.from("organizations").select("id, name").eq("created_by", userId)
      : full;
  if (list.error) return [];
  return (list.data ?? []) as Array<{ id: string; name?: string; legal_name?: string | null; live_access?: string }>;
}

export async function orgIdsFromRpc(db: any): Promise<string[]> {
  const ids = new Set<string>();
  try {
    const current = await db.rpc("current_org_ids");
    if (!current.error) {
      for (const value of (current.data ?? []) as unknown[]) {
        if (value) ids.add(String(value));
      }
    }
  } catch {
    /* optional on older schemas */
  }
  try {
    const caller = await db.rpc("caller_org_id");
    if (!caller.error && caller.data) ids.add(String(caller.data));
  } catch {
    /* optional on older schemas */
  }
  try {
    const found = await db.rpc("find_my_company");
    if (!found.error && found.data) ids.add(String(found.data));
  } catch {
    /* optional until the creator migration is applied */
  }
  return [...ids];
}

export async function orgDirectory(db: any, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const names = new Map<string, { id: string; name?: string; legal_name?: string | null; live_access?: string }>();
  if (!unique.length) return names;
  const full = await db.from("organizations").select("id, name, legal_name, live_access").in("id", unique);
  const list =
    full.error && isMissingColumnError(full.error.message)
      ? await db.from("organizations").select("id, name").in("id", unique)
      : full;
  for (const org of (list.data ?? []) as Array<{ id: string; name?: string; legal_name?: string | null; live_access?: string }>) {
    names.set(org.id, org);
  }
  return names;
}

export async function joinCreatedCompany(db: any, orgId: string, userId: string) {
  try {
    const rpc = await db.rpc("join_created_company", { _org_id: orgId });
    if (!rpc.error || isUniqueConflict(rpc.error.message)) return true;
  } catch {
    /* fall through to a direct insert */
  }
  try {
    const inserted = await db.from("organization_members").insert({ org_id: orgId, user_id: userId, role: "admin" });
    if (!inserted.error || isUniqueConflict(inserted.error.message) || isRlsError(inserted.error.message)) return true;
  } catch {
    /* membership is optional once we already know the org */
  }
  return false;
}

function addRow(rows: MembershipRow[], seen: Set<string>, row: MembershipRow) {
  if (!row.org_id || seen.has(row.org_id)) return;
  seen.add(row.org_id);
  rows.push(row);
}

export async function resolveWorkspace(db: any, userId: string, writer: any = db): Promise<WorkspaceLookup> {
  if (!userId) return emptyWorkspace;

  const rows: MembershipRow[] = [];
  const seen = new Set<string>();
  const created: Array<{ id: string; name?: string; legal_name?: string | null; live_access?: string }> = [];

  try {
    for (const row of await membershipsFor(db, userId)) addRow(rows, seen, row);
  } catch {
    /* other lookups still run */
  }

  for (const org of await createdOrgs(db, userId)) {
    created.push(org);
    if (seen.has(org.id)) continue;
    await joinCreatedCompany(writer, org.id, userId);
    addRow(rows, seen, asAdminMembership(org.id));
  }

  for (const orgId of await orgIdsFromRpc(db)) {
    if (seen.has(orgId)) continue;
    await joinCreatedCompany(writer, orgId, userId);
    addRow(rows, seen, asAdminMembership(orgId));
  }

  const directory = await orgDirectory(writer, rows.map((row) => row.org_id));
  for (const org of created) {
    if (!directory.has(org.id)) directory.set(org.id, org);
  }

  const memberships = rows.map((row) => toWorkspaceMembership(row, directory.get(row.org_id)));
  const orgId = memberships[0]?.orgId ?? null;
  return { memberships, orgId, hasOrganization: Boolean(orgId), lookupFailed: false };
}

export function workspaceFromMemberships(memberships: WorkspaceMembership[]): WorkspaceLookup {
  const orgId = memberships[0]?.orgId ?? null;
  return { memberships, orgId, hasOrganization: Boolean(orgId), lookupFailed: false };
}

export async function fetchWorkspaceClient(userId: string): Promise<WorkspaceLookup> {
  const { supabase } = await import("@/integrations/supabase/client");
  return resolveWorkspace(supabase, userId);
}

export async function resolveWorkspaceAfterAuth(
  loadServer: () => Promise<{ memberships?: WorkspaceMembership[]; orgId?: string | null; hasOrganization?: boolean }>,
  userId?: string | null,
): Promise<WorkspaceLookup> {
  let serverFailed = false;
  try {
    const server = await loadServer();
    const memberships = (server.memberships ?? []) as WorkspaceMembership[];
    if (memberships.length || server.hasOrganization || server.orgId) {
      return workspaceFromMemberships(
        memberships.length
          ? memberships
          : server.orgId
            ? [toWorkspaceMembership(asAdminMembership(server.orgId))]
            : [],
      );
    }
  } catch {
    serverFailed = true;
  }

  if (!userId) {
    return serverFailed ? { ...emptyWorkspace, lookupFailed: true } : emptyWorkspace;
  }

  try {
    const client = await fetchWorkspaceClient(userId);
    if (client.hasOrganization) return client;
    return serverFailed ? { ...emptyWorkspace, lookupFailed: true } : emptyWorkspace;
  } catch {
    return { ...emptyWorkspace, lookupFailed: true };
  }
}
