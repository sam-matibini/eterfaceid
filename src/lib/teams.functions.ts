import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  defaultPermissions,
  displayRole,
  invitationExpiryIso,
  invitationExpired,
  mapAccessRoleToAppRole,
  mfaRequiredFor,
  type AccessRole,
  type PermissionCode,
  type UserType,
} from "@/lib/access";
import { normalizeCountry } from "@/lib/company-country";
import { randomToken, sha256Hex } from "@/lib/crypto-hash";
import { publicEmailFailureMessage } from "@/lib/email-copy";
import {
  alreadyOnTeamMessage,
  isIgnorableSideWrite,
  isMissingColumnError,
  isRlsError,
  isUniqueConflict,
  liveInviteInsert,
  liveMemberInsert,
  liveOrganizationInsert,
  liveOrganizationProfileUpdate,
  writeWithFallback,
} from "@/lib/schema-fallback";
import { toTeamMemberView, withCreatorOnTeam, type TeamInviteView, type TeamMemberView } from "@/lib/team-view";
import {
  asAdminMembership,
  membershipsFor,
  resolveWorkspace,
  workspaceFromMemberships,
  type MembershipRow,
  type WorkspaceMembership,
} from "@/lib/workspace";

export type { MembershipRow, WorkspaceMembership };

const accessRoleSchema = z.enum(["administrator", "developer", "compliance", "analyst", "viewer"]);
const userTypeSchema = z.enum(["employee", "contractor", "consultant"]);
const permissionSchema = z.string().min(3).max(60);

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "team"}-${Math.random().toString(36).slice(2, 7)}`;
}

function isCompanyAdmin(row: Pick<MembershipRow, "role" | "is_owner" | "access_role">) {
  return row.is_owner || row.role === "admin" || row.access_role === "owner" || row.access_role === "administrator";
}

async function insertMembership(
  admin: any,
  payload: Record<string, unknown>,
  fallback: Record<string, unknown> = liveMemberInsert({
    orgId: String(payload["org_id"]),
    userId: String(payload["user_id"]),
    role: (payload["role"] as "admin" | "analyst" | "viewer") ?? "admin",
  }),
) {
  const result = await writeWithFallback(
    async (body) => {
      const inserted = await admin.from("organization_members").insert(body as never).select("user_id").maybeSingle();
      if (inserted.error && isUniqueConflict(inserted.error.message)) {
        return { data: { user_id: payload["user_id"] }, error: null };
      }
      return { data: inserted.data as { user_id: string } | null, error: inserted.error };
    },
    payload,
    fallback,
  );
  if (result.error && !isUniqueConflict(result.error.message)) throw new Error(result.error.message);
  return result.data;
}

async function loadAdmin() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    void supabaseAdmin.from;
    return supabaseAdmin;
  } catch {
    return null;
  }
}

async function joinCreatorIfNeeded(db: any, userId: string, orgId: string) {
  const ownerPayload = {
    org_id: orgId,
    user_id: userId,
    role: "admin",
    access_role: "owner",
    is_owner: true,
    user_type: "employee",
    sandbox_access: true,
    live_access: true,
    permissions: defaultPermissions("owner"),
    mfa_required: true,
    status: "active",
  };
  try {
    await insertMembership(db, ownerPayload, liveMemberInsert({ orgId, userId, role: "admin" }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!isUniqueConflict(message) && !isIgnorableSideWrite(message)) throw err;
  }
  return asAdminMembership(orgId);
}

async function membershipForOrg(supabase: any, userId: string, orgId?: string | null) {
  const rows = await membershipsFor(supabase, userId);
  if (!rows.length) return null;
  if (orgId) return rows.find((r) => r.org_id === orgId) ?? null;
  return rows[0] ?? null;
}

async function createdOrgId(db: any, userId: string, orgId?: string | null) {
  if (orgId) {
    const org = await db.from("organizations").select("id, created_by").eq("id", orgId).maybeSingle();
    if ((org.data as { created_by?: string } | null)?.created_by === userId) {
      return (org.data as { id: string }).id;
    }
    return null;
  }
  const created = await db
    .from("organizations")
    .select("id")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (created.data as { id?: string } | null)?.id ?? null;
}

async function fetchWorkspaceForUser(userClient: any, userId: string) {
  const admin = await loadAdmin();
  const readers = admin ? [admin, userClient] : [userClient];
  const writer = admin ?? userClient;

  for (const db of readers) {
    try {
      const found = await resolveWorkspace(db, userId, writer);
      if (found.hasOrganization) return found;
    } catch {
      /* try the service-role client if the user JWT cannot see memberships */
    }
  }

  return workspaceFromMemberships([]);
}

export const loadMyWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const space = await fetchWorkspaceForUser(context.supabase, context.userId);
    return {
      memberships: space.memberships,
      orgId: space.orgId,
      hasOrganization: space.hasOrganization,
    };
  });

async function requireAdmin(supabase: any, userId: string, orgId?: string | null) {
  let membership: MembershipRow | null = null;
  try {
    membership = await membershipForOrg(supabase, userId, orgId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!isIgnorableSideWrite(message) && !isMissingColumnError(message)) throw err;
  }
  if (membership && isCompanyAdmin(membership)) return membership;

  const admin = await loadAdmin();
  const dbs = admin ? [admin, supabase] : [supabase];
  let target = orgId ?? membership?.org_id ?? null;
  for (const db of dbs) {
    if (target) break;
    target = await createdOrgId(db, userId, null);
  }
  if (target) {
    for (const db of dbs) {
      const owned = await createdOrgId(db, userId, target);
      if (!owned) continue;
      if (admin) {
        try {
          return await joinCreatorIfNeeded(admin, userId, owned);
        } catch {
          /* fall through to the signed-in client / RPC */
        }
      }
      const rpc = await supabase.rpc("join_created_company" as never, { _org_id: owned } as never);
      if (!rpc.error || isUniqueConflict(rpc.error.message)) return asAdminMembership(owned);
      try {
        return await joinCreatorIfNeeded(supabase, userId, owned);
      } catch {
        return asAdminMembership(owned);
      }
    }
  }
  if (!membership) throw new Error("You are not part of a team yet");
  throw new Error("Only team administrators can do that");
}

async function writeOrganizationProfile(
  admin: any | null,
  user: any,
  orgId: string,
  profile: Record<string, unknown>,
  fallback: Record<string, unknown>,
) {
  const clients = admin ? [admin, user] : [user];
  let lastMessage = "The company details could not be saved";
  for (const client of clients) {
    const result = await writeWithFallback(
      async (payload) => {
        const updated = await client
          .from("organizations")
          .update(payload as never)
          .eq("id", orgId)
          .select("id, name")
          .maybeSingle();
        return { data: updated.data as { id: string; name: string } | null, error: updated.error };
      },
      profile,
      fallback,
    );
    if (!result.error) return result;
    lastMessage = result.error.message;
  }
  const rpc = await user.rpc("update_created_company" as never, {
    _org_id: orgId,
    _name: String(profile["name"] ?? ""),
  } as never);
  if (!rpc.error) return { data: { id: orgId, name: String(profile["name"] ?? "") }, error: null };
  if (isRlsError(lastMessage) || isRlsError(rpc.error.message)) {
    throw new Error("The company details could not be saved. Refresh and try again.");
  }
  throw new Error(lastMessage === "The company details could not be saved" ? rpc.error.message : lastMessage);
}

async function findUserIdByEmail(
  admin: any | null,
  email: string,
  claimEmail: string | undefined,
  claimUserId: string,
) {
  if (claimEmail && claimEmail === email) return claimUserId;
  if (admin) {
    const { data } = await admin.from("profiles").select("id, email").eq("email", email).maybeSingle();
    if ((data as { id?: string } | null)?.id) return (data as { id: string }).id;
    try {
      const byAuth = await admin.auth.admin.getUserByEmail(email);
      const id = byAuth.data?.user?.id as string | undefined;
      if (id) return id;
    } catch {
      /* Auth admin lookup is optional; invite by email still works. */
    }
  }
  return null;
}

function publicizeEmailResult(result: { sent: boolean; reason?: string; detail?: string }) {
  if (result.sent) return { sent: true as const };
  const detail = publicEmailFailureMessage(result) ?? result.detail ?? "The invitation email could not be sent";
  return result.reason ? { sent: false as const, reason: result.reason, detail } : { sent: false as const, detail };
}

function originFrom(data: { origin?: string | undefined }) {
  return data.origin ?? "https://eterfaceid.lovable.app";
}

function environmentLabel(sandbox: boolean, live: boolean) {
  if (sandbox && live) return "Sandbox and Live";
  if (live) return "Live";
  return "Sandbox";
}

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2, "Enter your company name").max(80),
        legalName: z.string().trim().min(2).max(200).optional(),
        registrationNumber: z.string().trim().max(60).optional(),
        country: z.string().trim().max(80).optional(),
        addressLine1: z.string().trim().max(200).optional(),
        city: z.string().trim().max(80).optional(),
        region: z.string().trim().max(80).optional(),
        postalCode: z.string().trim().max(20).optional(),
        website: z.string().trim().max(200).optional(),
        origin: z.string().trim().url().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await loadAdmin();
    const db = admin ?? context.supabase;
    const legalName = data.legalName?.trim() || data.name;
    const country = data.country ? normalizeCountry(data.country) : null;

    const existingSpace = await fetchWorkspaceForUser(context.supabase, context.userId);
    const already = existingSpace.orgId ?? (await createdOrgId(db, context.userId, null));
    if (already) {
      await joinCreatorIfNeeded(db, context.userId, already);
      try {
        await writeOrganizationProfile(
          admin,
          context.supabase,
          already,
          {
            name: data.name,
            legal_name: legalName,
            registration_number: data.registrationNumber || null,
            country,
            address_line1: data.addressLine1 || null,
            city: data.city || null,
            region: data.region || null,
            postal_code: data.postalCode || null,
            website: data.website || null,
          },
          liveOrganizationProfileUpdate({ name: data.name }),
        );
      } catch {
        /* existing company still opens the dashboard */
      }
      return { orgId: already, existing: true };
    }

    const slug = slugify(data.name);
    let inserted = await writeWithFallback(
      async (payload) => {
        const result = await db
          .from("organizations")
          .insert(payload as never)
          .select("id, name")
          .maybeSingle();
        return { data: result.data as { id: string; name: string } | null, error: result.error };
      },
      {
        name: data.name,
        legal_name: legalName,
        slug,
        created_by: context.userId,
        primary_admin_user_id: context.userId,
        registration_number: data.registrationNumber || null,
        country,
        address_line1: data.addressLine1 || null,
        city: data.city || null,
        region: data.region || null,
        postal_code: data.postalCode || null,
        website: data.website || null,
      },
      liveOrganizationInsert({ name: data.name, slug, createdBy: context.userId }),
    );
    if (inserted.error && isUniqueConflict(inserted.error.message)) {
      const retrySlug = slugify(data.name);
      inserted = await writeWithFallback(
        async (payload) => {
          const result = await db
            .from("organizations")
            .insert(payload as never)
            .select("id, name")
            .maybeSingle();
          return { data: result.data as { id: string; name: string } | null, error: result.error };
        },
        {
          name: data.name,
          legal_name: legalName,
          slug: retrySlug,
          created_by: context.userId,
          primary_admin_user_id: context.userId,
          registration_number: data.registrationNumber || null,
          country,
          address_line1: data.addressLine1 || null,
          city: data.city || null,
          region: data.region || null,
          postal_code: data.postalCode || null,
          website: data.website || null,
        },
        liveOrganizationInsert({ name: data.name, slug: retrySlug, createdBy: context.userId }),
      );
    }
    if (inserted.error || !inserted.data?.id) {
      throw new Error(inserted.error?.message ?? "The company could not be created");
    }
    const org = inserted.data;

    try {
      await joinCreatorIfNeeded(db, context.userId, org.id);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Could not open the company dashboard");
    }

    try {
      await db.from("org_environments").insert([
        { org_id: org.id, code: "sandbox", label: "Sandbox", publishable_prefix: "ef_test_" },
        { org_id: org.id, code: "live", label: "Live", publishable_prefix: "ef_live_" },
      ]);
    } catch {
      /* environments are optional on older schemas */
    }

    try {
      await db.from("audit_events").insert({
        org_id: org.id,
        actor_id: context.userId,
        action: "team.created",
        entity_type: "organization",
        entity_id: org.id,
        detail: { name: data.name, legalName } as never,
      });
    } catch {
      /* audit must not block creating the company */
    }

    try {
      const email = context.claims?.email as string | undefined;
      if (email && admin) {
        const { sendNotification } = await import("@/lib/email.server");
        await sendNotification(admin, {
          event: "team.welcome",
          to: [email],
          orgId: org.id,
          data: {
            org: org.name,
            name: (context.claims?.user_metadata as { full_name?: string } | undefined)?.full_name ?? email,
            role: "Organization Owner",
            access: "Sandbox, company administration, API documentation",
            link: `${originFrom(data)}/console`,
          },
        });
      }
    } catch {
      /* the welcome email must never block sign-up */
    }

    return { orgId: org.id, existing: false };
  });

export const updateOrganizationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(80),
        legalName: z.string().trim().max(200).optional(),
        registrationNumber: z.string().trim().max(60).optional(),
        country: z.string().trim().max(80).optional(),
        addressLine1: z.string().trim().max(200).optional(),
        city: z.string().trim().max(80).optional(),
        region: z.string().trim().max(80).optional(),
        postalCode: z.string().trim().max(20).optional(),
        website: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireAdmin(context.supabase, context.userId, data.orgId);
    const admin = await loadAdmin();
    const displayName = data.name.trim();
    const legalName = (data.legalName || data.name).trim();
    const country = normalizeCountry(data.country);
    const profile = {
      name: displayName,
      legal_name: legalName,
      registration_number: data.registrationNumber || null,
      country,
      address_line1: data.addressLine1 || null,
      city: data.city || null,
      region: data.region || null,
      postal_code: data.postalCode || null,
      website: data.website || null,
    };
    await writeOrganizationProfile(
      admin,
      context.supabase,
      membership.org_id,
      profile,
      liveOrganizationProfileUpdate({ name: displayName }),
    );

    try {
      const db = admin ?? context.supabase;
      await db.from("audit_events").insert({
        org_id: membership.org_id,
        actor_id: context.userId,
        action: "org.profile_updated",
        entity_type: "organization",
        entity_id: membership.org_id,
        detail: { name: displayName, legalName } as never,
      });
    } catch {
      /* audit must not block saving the company */
    }

    return {
      ok: true,
      id: membership.org_id,
      name: displayName,
      legal_name: legalName,
      registration_number: data.registrationNumber || "",
      country: country || "",
      address_line1: data.addressLine1 || "",
      city: data.city || "",
      region: data.region || "",
      postal_code: data.postalCode || "",
      website: data.website || "",
    };
  });

export const listTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orgId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }): Promise<{ members: TeamMemberView[]; invites: TeamInviteView[] }> => {
    let membership: MembershipRow | null = null;
    try {
      membership = await membershipForOrg(context.supabase, context.userId, data.orgId);
    } catch {
      membership = null;
    }
    if (!membership) {
      membership = await requireAdmin(context.supabase, context.userId, data.orgId);
    }
    const admin = await loadAdmin();
    const db = admin ?? context.supabase;
    const orgId = membership.org_id;

    const memberSelect =
      "org_id, user_id, role, access_role, is_owner, user_type, job_title, sandbox_access, live_access, permissions, mfa_required, status, created_at";
    const fullMembers = await db.from("organization_members").select(memberSelect).eq("org_id", orgId);
    let memberRows: Array<Record<string, unknown>> = [];
    if (!fullMembers.error) {
      memberRows = (fullMembers.data ?? []) as Array<Record<string, unknown>>;
    } else if (isMissingColumnError(fullMembers.error.message)) {
      const legacy = await db.from("organization_members").select("org_id, user_id, role, created_at").eq("org_id", orgId);
      if (legacy.error && !isIgnorableSideWrite(legacy.error.message)) throw new Error(legacy.error.message);
      memberRows = (legacy.data ?? []) as Array<Record<string, unknown>>;
    } else if (!isIgnorableSideWrite(fullMembers.error.message)) {
      throw new Error(fullMembers.error.message);
    }

    const profiles = await db.from("profiles").select("id, email, full_name");
    const profileRows = ((profiles.data ?? []) as Array<{ id: string; email?: string | null; full_name?: string | null }>);
    const profileById = new Map(profileRows.map((row) => [row.id, row]));

    const mapped = memberRows
      .filter((row) => (row["status"] ?? "active") !== "disabled")
      .map((row) => {
        const userId = String(row["user_id"] ?? "");
        const profile = profileById.get(userId);
        const fallbackEmail = userId === context.userId ? ((context.claims?.email as string | undefined) ?? null) : null;
        return toTeamMemberView(row, profile, fallbackEmail);
      });

    const org = await db.from("organizations").select("id, created_by").eq("id", orgId).maybeSingle();
    const createdBy = (org.data as { created_by?: string } | null)?.created_by ?? null;
    const creatorProfile = createdBy ? profileById.get(createdBy) : undefined;
    const members = withCreatorOnTeam(mapped, createdBy
      ? {
          userId: createdBy,
          email:
            creatorProfile?.email ??
            (createdBy === context.userId ? ((context.claims?.email as string | undefined) ?? null) : null),
          fullName: creatorProfile?.full_name ?? null,
        }
      : null);

    const fullInvites = await db
      .from("organization_invites")
      .select("id, org_id, email, role, access_role, live_access, expires_at")
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    let invites: TeamInviteView[] = [];
    if (!fullInvites.error) {
      invites = (fullInvites.data ?? []) as TeamInviteView[];
    } else if (isMissingColumnError(fullInvites.error.message)) {
      const legacyInvites = await db
        .from("organization_invites")
        .select("id, org_id, email, role, expires_at")
        .eq("org_id", orgId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (legacyInvites.error && !isIgnorableSideWrite(legacyInvites.error.message)) {
        throw new Error(legacyInvites.error.message);
      }
      invites = (legacyInvites.data ?? []) as TeamInviteView[];
    } else if (!isIgnorableSideWrite(fullInvites.error.message)) {
      throw new Error(fullInvites.error.message);
    }

    return { members, invites };
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid().optional(),
        email: z.string().trim().email("Enter a valid email address").max(255),
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().min(1).max(80),
        jobTitle: z.string().trim().max(80).optional(),
        userType: userTypeSchema.default("employee"),
        accessRole: accessRoleSchema.default("developer"),
        sandboxAccess: z.boolean().default(true),
        liveAccess: z.boolean().default(false),
        permissions: z.array(permissionSchema).default([]),
        origin: z.string().trim().url().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireAdmin(context.supabase, context.userId, data.orgId);
    if (data.liveAccess && membership.role !== "admin" && !membership.is_owner) {
      throw new Error("Only administrators can grant Live access");
    }

    const accessRole = data.accessRole as AccessRole;
    const extras = data.permissions as PermissionCode[];
    let permissions = defaultPermissions(accessRole, extras);
    if (!data.liveAccess) {
      permissions = permissions.filter((p) => p !== "live.api" && p !== "live.environment.manage");
    } else if (!permissions.includes("live.api")) {
      permissions = defaultPermissions(accessRole, [...extras, "live.api"]);
    }
    if (accessRole !== "administrator" && data.liveAccess === false) {
      permissions = permissions.filter((p) => p !== "live.api");
    }

    const email = data.email.toLowerCase();
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = invitationExpiryIso();
    const appRole = mapAccessRoleToAppRole(accessRole);
    const admin = await loadAdmin();
    const supabaseAdmin = admin ?? context.supabase;
    const claimEmail = (context.claims?.email as string | undefined)?.toLowerCase();
    const existingUserId = await findUserIdByEmail(admin, email, claimEmail, context.userId);

    if (existingUserId) {
      const { data: existingMember } = await supabaseAdmin
        .from("organization_members")
        .select("user_id")
        .eq("org_id", membership.org_id)
        .eq("user_id", existingUserId)
        .maybeSingle();
      if (existingMember) throw new Error(alreadyOnTeamMessage(email));

      const addingCreator = existingUserId === context.userId;
      await insertMembership(
        supabaseAdmin,
        addingCreator
          ? {
              org_id: membership.org_id,
              user_id: existingUserId,
              role: "admin",
              access_role: "owner",
              is_owner: true,
              user_type: data.userType,
              job_title: data.jobTitle || null,
              sandbox_access: true,
              live_access: true,
              permissions: defaultPermissions("owner"),
              mfa_required: true,
              status: "active",
            }
          : {
              org_id: membership.org_id,
              user_id: existingUserId,
              role: appRole,
              access_role: accessRole,
              is_owner: false,
              user_type: data.userType,
              job_title: data.jobTitle || null,
              sandbox_access: data.sandboxAccess,
              live_access: data.liveAccess,
              permissions,
              mfa_required: mfaRequiredFor({ access_role: accessRole, live_access: data.liveAccess }),
              status: "active",
            },
        liveMemberInsert({
          orgId: membership.org_id,
          userId: existingUserId,
          role: addingCreator ? "admin" : appRole,
        }),
      );

      const fullName = `${data.firstName} ${data.lastName}`.trim();
      if (fullName) {
        await supabaseAdmin.from("profiles").update({ full_name: fullName }).eq("id", existingUserId);
      }

      try {
        await supabaseAdmin.from("audit_events").insert({
          org_id: membership.org_id,
          actor_id: context.userId,
          action: "team.member_added",
          entity_type: "user",
          entity_id: existingUserId,
          detail: { email, role: accessRole, added: true } as never,
        });
      } catch {
        /* audit must not block adding */
      }

      return {
        invite: { email, role: appRole, access_role: accessRole, expires_at: expiresAt },
        token,
        emailed: { sent: false, reason: "already_member" as const },
        added: { userId: existingUserId },
      };
    }

    const { data: pending } = await supabaseAdmin
      .from("organization_invites")
      .select("id")
      .eq("org_id", membership.org_id)
      .eq("email", email)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .maybeSingle();

    const invitePayload = {
      org_id: membership.org_id,
      email,
      role: appRole,
      access_role: accessRole,
      first_name: data.firstName,
      last_name: data.lastName,
      job_title: data.jobTitle || null,
      user_type: data.userType,
      sandbox_access: data.sandboxAccess,
      live_access: data.liveAccess,
      permissions,
      token_hash: tokenHash,
      invited_by: context.userId,
      expires_at: expiresAt,
    };
    const liveInvite = liveInviteInsert({
      orgId: membership.org_id,
      email,
      role: appRole,
      tokenHash,
      invitedBy: context.userId,
      expiresAt,
    });

    let invite: { id: string; email: string; role: string; access_role?: string; expires_at: string } | null = null;
    if ((pending as { id?: string } | null)?.id) {
      const updated = await writeWithFallback(
        async (payload) => {
          const result = await supabaseAdmin
            .from("organization_invites")
            .update(payload as never)
            .eq("id", (pending as { id: string }).id)
            .select("id, email, role, access_role, expires_at")
            .maybeSingle();
          return {
            data: result.data as { id: string; email: string; role: string; access_role?: string; expires_at: string } | null,
            error: result.error,
          };
        },
        { token_hash: tokenHash, expires_at: expiresAt, revoked_at: null },
        { token_hash: tokenHash, expires_at: expiresAt },
      );
      invite = updated.data;
      if (updated.error) throw new Error(updated.error.message);
    } else {
      const inserted = await writeWithFallback(
        async (payload) => {
          const result = await supabaseAdmin
            .from("organization_invites")
            .insert(payload as never)
            .select("id, email, role, access_role, expires_at")
            .maybeSingle();
          if (result.error && isUniqueConflict(result.error.message)) {
            return { data: { id: membership.org_id, email, role: appRole, expires_at: expiresAt }, error: null };
          }
          return {
            data: result.data as { id: string; email: string; role: string; access_role?: string; expires_at: string } | null,
            error: result.error,
          };
        },
        invitePayload,
        liveInvite,
      );
      if (inserted.error) throw new Error(inserted.error.message);
      invite = inserted.data;
    }

    try {
      await supabaseAdmin.from("audit_events").insert({
        org_id: membership.org_id,
        actor_id: context.userId,
        action: "team.invited",
        entity_type: "organization_invite",
        entity_id: invite?.id ?? membership.org_id,
        detail: {
          email,
          role: accessRole,
          sandbox: data.sandboxAccess,
          live: data.liveAccess,
          permissions,
        } as never,
      });
    } catch {
      /* audit must not block inviting */
    }

    const { sendNotification } = await import("@/lib/email.server");
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name, legal_name")
      .eq("id", membership.org_id)
      .maybeSingle();
    const { data: inviter } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const link = `${originFrom(data)}/invite/${token}`;
    const orgName = org?.legal_name || org?.name || "your team";
    let emailed: { sent: boolean; reason?: string; detail?: string };
    try {
      emailed = await sendNotification(supabaseAdmin, {
        event: "team.invite",
        to: email,
        orgId: membership.org_id,
        data: {
          org: orgName,
          name: data.firstName,
          inviter: inviter?.full_name ?? inviter?.email ?? "A colleague",
          role: displayRole(mapAccessRoleToAppRole(accessRole), accessRole),
          environment: environmentLabel(data.sandboxAccess, data.liveAccess),
          hours: "72",
          link,
        },
      });
    } catch (err) {
      emailed = {
        sent: false,
        reason: "email_failed",
        detail: err instanceof Error ? err.message : "The invitation email could not be sent",
      };
    }
    if (!emailed.sent) {
      emailed = publicizeEmailResult(emailed);
    }

    return { invite, token, emailed, added: null };
  });

export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), origin: z.string().trim().url().max(300).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireAdmin(context.supabase, context.userId);
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = invitationExpiryIso();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error } = await supabaseAdmin
      .from("organization_invites")
      .update({
        token_hash: tokenHash,
        expires_at: expiresAt,
        resent_at: new Date().toISOString(),
        revoked_at: null,
      })
      .eq("id", data.id)
      .eq("org_id", membership.org_id)
      .is("accepted_at", null)
      .select("id, email, first_name, access_role, sandbox_access, live_access")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("That invitation could not be resent");

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name, legal_name")
      .eq("id", membership.org_id)
      .maybeSingle();
    const { data: inviter } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const { sendNotification } = await import("@/lib/email.server");
    const emailed = await sendNotification(supabaseAdmin, {
      event: "team.invite",
      to: invite.email,
      orgId: membership.org_id,
      data: {
        org: org?.legal_name || org?.name || "your team",
        name: invite.first_name ?? "there",
        inviter: inviter?.full_name ?? inviter?.email ?? "A colleague",
        role: displayRole(null, invite.access_role),
        environment: environmentLabel(invite.sandbox_access, invite.live_access),
        hours: "72",
        link: `${originFrom(data)}/invite/${token}`,
      },
    });
    if (!emailed.sent) {
      return { token, emailed: publicizeEmailResult(emailed) };
    }
    return { token, emailed };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("organization_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("org_id", membership.org_id);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_events").insert({
      org_id: membership.org_id,
      actor_id: context.userId,
      action: "team.invite_revoked",
      entity_type: "organization_invite",
      entity_id: data.id,
      detail: {} as never,
    });
    return { ok: true };
  });

export const peekInvite = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ token: z.string().trim().min(10).max(200) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const tokenHash = await sha256Hex(data.token);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: invite } = await supabaseAdmin
        .from("organization_invites")
        .select(
          "id, org_id, email, first_name, last_name, job_title, access_role, user_type, sandbox_access, live_access, permissions, expires_at, accepted_at, revoked_at, invited_by",
        )
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (!invite) throw new Error("This invitation link is not valid");
      if (invite.revoked_at) throw new Error("This invitation was cancelled");
      if (invite.accepted_at) throw new Error("This invitation has already been used");
      if (invitationExpired(invite.expires_at)) throw new Error("This invitation has expired");

      const [{ data: org }, { data: inviter }] = await Promise.all([
        supabaseAdmin.from("organizations").select("name, legal_name").eq("id", invite.org_id).maybeSingle(),
        invite.invited_by
          ? supabaseAdmin.from("profiles").select("full_name, email").eq("id", invite.invited_by).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      return {
        email: invite.email,
        firstName: invite.first_name ?? "",
        lastName: invite.last_name ?? "",
        jobTitle: invite.job_title ?? "",
        accessRole: invite.access_role,
        roleLabel: displayRole(null, invite.access_role),
        userType: invite.user_type,
        sandboxAccess: invite.sandbox_access,
        liveAccess: invite.live_access,
        permissions: invite.permissions ?? [],
        expiresAt: invite.expires_at,
        orgName: org?.legal_name || org?.name || "an organization",
        inviterName: inviter?.full_name ?? inviter?.email ?? "An administrator",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "This invitation link is not valid";
      if (/missing supabase|service_role|not configured/i.test(message)) {
        throw new Error("This invitation link is not valid");
      }
      throw err instanceof Error ? err : new Error("This invitation link is not valid");
    }
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        token: z.string().trim().min(10).max(200),
        firstName: z.string().trim().max(80).optional(),
        lastName: z.string().trim().max(80).optional(),
        origin: z.string().trim().url().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const tokenHash = await sha256Hex(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite } = await supabaseAdmin
      .from("organization_invites")
      .select(
        "id, org_id, email, role, access_role, user_type, job_title, sandbox_access, live_access, permissions, first_name, last_name, expires_at, accepted_at, revoked_at",
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!invite) throw new Error("This invitation link is not valid");
    if (invite.revoked_at) throw new Error("This invitation was cancelled");
    if (invite.accepted_at) throw new Error("This invitation has already been used");
    if (invitationExpired(invite.expires_at)) throw new Error("This invitation has expired");

    const claimEmail = (context.claims?.email as string | undefined)?.toLowerCase();
    if (claimEmail && claimEmail !== invite.email.toLowerCase()) {
      throw new Error("Sign in with the email address this invitation was sent to");
    }

    const existing = await membershipForOrg(context.supabase, context.userId, invite.org_id);
    if (!existing) {
      const accessRole = (invite.access_role as AccessRole) || "viewer";
      const { error: memberError } = await supabaseAdmin.from("organization_members").insert({
        org_id: invite.org_id,
        user_id: context.userId,
        role: invite.role,
        access_role: accessRole,
        is_owner: false,
        user_type: (invite.user_type as UserType) || "employee",
        job_title: invite.job_title,
        sandbox_access: invite.sandbox_access,
        live_access: invite.live_access,
        permissions: invite.permissions?.length ? invite.permissions : defaultPermissions(accessRole),
        mfa_required: mfaRequiredFor({
          access_role: accessRole,
          live_access: invite.live_access,
        }),
        status: "active",
      });
      if (memberError) throw new Error(memberError.message);
    }

    await supabaseAdmin
      .from("organization_invites")
      .update({ accepted_at: new Date().toISOString(), accepted_by: context.userId })
      .eq("id", invite.id);

    const fullName = [data.firstName || invite.first_name, data.lastName || invite.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (fullName) {
      await supabaseAdmin.from("profiles").update({ full_name: fullName }).eq("id", context.userId);
    }

    await supabaseAdmin.from("audit_events").insert({
      org_id: invite.org_id,
      actor_id: context.userId,
      action: "team.joined",
      entity_type: "organization",
      entity_id: invite.org_id,
      detail: { role: invite.access_role || invite.role } as never,
    });

    const { sendNotification } = await import("@/lib/email.server");
    const [{ data: joiner }, { data: org }, { data: admins }] = await Promise.all([
      supabaseAdmin.from("profiles").select("email, full_name").eq("id", context.userId).maybeSingle(),
      supabaseAdmin.from("organizations").select("name, legal_name").eq("id", invite.org_id).maybeSingle(),
      supabaseAdmin
        .from("organization_members")
        .select("user_id")
        .eq("org_id", invite.org_id)
        .eq("role", "admin"),
    ]);
    const orgName = org?.legal_name || org?.name || "your team";
    const accessBits = [
      invite.sandbox_access ? "Sandbox" : null,
      invite.live_access ? "Live" : null,
      "API Documentation",
      (invite.permissions ?? []).includes("api_logs.view") ? "API Logs" : null,
    ].filter(Boolean);
    if (joiner?.email) {
      await sendNotification(supabaseAdmin, {
        event: "team.welcome",
        to: joiner.email,
        orgId: invite.org_id,
        data: {
          org: orgName,
          name: joiner.full_name ?? joiner.email,
          role: displayRole(invite.role, invite.access_role),
          access: accessBits.join(", "),
          link: `${originFrom(data)}/auth`,
        },
      });
    }
    const adminIds = (admins ?? []).map((a) => a.user_id).filter((id) => id !== context.userId);
    if (adminIds.length) {
      const { data: adminProfiles } = await supabaseAdmin.from("profiles").select("email").in("id", adminIds);
      const to = (adminProfiles ?? []).map((p) => p.email).filter((e): e is string => Boolean(e));
      if (to.length) {
        await sendNotification(supabaseAdmin, {
          event: "org.invite_accepted",
          to,
          orgId: invite.org_id,
          data: {
            org: orgName,
            name: joiner?.full_name ?? joiner?.email ?? invite.email,
            role: displayRole(invite.role, invite.access_role),
          },
        });
      }
    }

    return { orgId: invite.org_id as string };
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        accessRole: accessRoleSchema,
        permissions: z.array(permissionSchema).optional(),
        sandboxAccess: z.boolean().optional(),
        liveAccess: z.boolean().optional(),
        jobTitle: z.string().trim().max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireAdmin(context.supabase, context.userId);
    if (data.userId === context.userId && data.accessRole !== "administrator") {
      const { count } = await context.supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", membership.org_id)
        .eq("role", "admin");
      if ((count ?? 0) <= 1) throw new Error("Your team needs at least one administrator");
    }
    const accessRole = data.accessRole as AccessRole;
    const permissions = data.permissions?.length
      ? (data.permissions as PermissionCode[])
      : defaultPermissions(accessRole);
    const liveAccess = data.liveAccess ?? false;
    const { error } = await context.supabase
      .from("organization_members")
      .update({
        role: mapAccessRoleToAppRole(accessRole),
        access_role: accessRole,
        permissions,
        sandbox_access: data.sandboxAccess ?? true,
        live_access: liveAccess,
        job_title: data.jobTitle ?? null,
        mfa_required: mfaRequiredFor({ access_role: accessRole, live_access: liveAccess }),
      })
      .eq("org_id", membership.org_id)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_events").insert({
      org_id: membership.org_id,
      actor_id: context.userId,
      action: "team.role_changed",
      entity_type: "user",
      entity_id: data.userId,
      detail: { accessRole, liveAccess, permissions } as never,
    });
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot remove yourself");

    const { data: target } = await context.supabase
      .from("organization_members")
      .select("is_owner")
      .eq("org_id", membership.org_id)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (target?.is_owner) throw new Error("The organization owner cannot be removed");

    const { error } = await context.supabase
      .from("organization_members")
      .delete()
      .eq("org_id", membership.org_id)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_events").insert({
      org_id: membership.org_id,
      actor_id: context.userId,
      action: "team.member_removed",
      entity_type: "user",
      entity_id: data.userId,
      detail: {} as never,
    });
    return { ok: true };
  });
