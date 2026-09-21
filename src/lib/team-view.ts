import type { AccessRole, AppRole } from "@/lib/access";
import { inferAccessRole } from "@/lib/access";
import { dedupeByUserId } from "@/lib/schema-fallback";

export type TeamMemberView = {
  userId: string;
  role: AppRole;
  accessRole: AccessRole;
  isOwner: boolean;
  userType: string;
  jobTitle: string | null;
  sandboxAccess: boolean;
  liveAccess: boolean;
  permissions: string[];
  mfaRequired: boolean;
  status: string;
  email: string | null;
  fullName: string | null;
};

export type TeamInviteView = {
  id: string;
  org_id?: string;
  email: string;
  role: AppRole;
  access_role?: string | null;
  live_access?: boolean | null;
  expires_at: string;
};

type ProfileRow = { id?: string; email?: string | null; full_name?: string | null };

export function toTeamMemberView(
  row: Record<string, unknown>,
  profile?: ProfileRow | null,
  fallbackEmail?: string | null,
): TeamMemberView {
  const appRole = (row["role"] as AppRole | undefined) ?? "viewer";
  return {
    userId: String(row["user_id"] ?? ""),
    role: appRole,
    accessRole: (row["access_role"] as AccessRole | null | undefined) ?? inferAccessRole(appRole),
    isOwner: Boolean(row["is_owner"]) || appRole === "admin",
    userType: String(row["user_type"] ?? "employee"),
    jobTitle: (row["job_title"] as string | null | undefined) ?? null,
    sandboxAccess: row["sandbox_access"] !== false,
    liveAccess: Boolean(row["live_access"]) || appRole === "admin",
    permissions: (row["permissions"] as string[] | null | undefined) ?? [],
    mfaRequired: Boolean(row["mfa_required"]) || appRole === "admin",
    status: String(row["status"] ?? "active"),
    email: profile?.email ?? fallbackEmail ?? null,
    fullName: profile?.full_name ?? null,
  };
}

export function creatorMemberView(input: {
  userId: string;
  email?: string | null;
  fullName?: string | null;
}): TeamMemberView {
  return {
    userId: input.userId,
    role: "admin",
    accessRole: "owner",
    isOwner: true,
    userType: "employee",
    jobTitle: null,
    sandboxAccess: true,
    liveAccess: true,
    permissions: [],
    mfaRequired: true,
    status: "active",
    email: input.email ?? null,
    fullName: input.fullName ?? null,
  };
}

export function withCreatorOnTeam(
  members: TeamMemberView[],
  creator: { userId: string; email?: string | null; fullName?: string | null } | null,
) {
  if (!creator?.userId) return dedupeByUserId(members);
  if (members.some((row) => row.userId === creator.userId)) return dedupeByUserId(members);
  return dedupeByUserId([creatorMemberView(creator), ...members]);
}
