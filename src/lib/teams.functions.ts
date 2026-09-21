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
import { randomToken, sha256Hex } from "@/lib/crypto-hash";
import {
  companyCreateErrorMessage,
  liveMemberInsert,
  liveOrganizationInsert,
  newCompanyId,
  resolveInsertedCompany,
  restAcceptedWrite,
} from "@/lib/create-company";
import { companyApplicationPayload, liveInviteInsert, liveOrganizationProfileUpdate, mergeCompanyProfile } from "@/lib/company-profile";
import { isMissingRpcError, isMissingSchemaError, isUniqueConflict, writeIgnoringUnknownColumns } from "@/lib/schema-compat";
import { callerAccessToken, firstRow, userRest, userRpc } from "@/lib/user-rest.server";

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

async function membershipsFor(supabase: any, userId: string) {
  const full = await supabase
    .from("organization_members")
    .select(
      "org_id, role, access_role, is_owner, sandbox_access, live_access, permissions, mfa_required, user_type, job_title, status",
    )
    .eq("user_id", userId);
  const result =
    full.error && isMissingSchemaError(full.error.message)
      ? await supabase.from("organization_members").select("org_id, role").eq("user_id", userId)
      : full;
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as Array<Partial<MembershipRow> & { org_id: string; role: MembershipRow["role"] }>)
    .filter((row) => row.status !== "disabled")
    .map((row) => ({
      org_id: row.org_id,
      role: row.role,
      access_role: row.access_role ?? (row.role === "admin" ? "owner" : "viewer"),
      is_owner: row.is_owner ?? row.role === "admin",
      sandbox_access: row.sandbox_access !== false,
      live_access: row.live_access ?? row.role === "admin",
      permissions: row.permissions ?? [],
      mfa_required: row.mfa_required ?? row.role === "admin",
      user_type: row.user_type ?? "employee",
      job_title: row.job_title ?? null,
      status: row.status ?? "active",
    })) as MembershipRow[];
}

async function membershipForOrg(supabase: any, userId: string, orgId?: string | null) {
  const rows = await membershipsFor(supabase, userId);
  if (!rows.length) return null;
  if (orgId) return rows.find((r) => r.org_id === orgId) ?? null;
  return rows[0];
}

function asAdminMembership(orgId: string): MembershipRow {
  return {
    org_id: orgId,
    role: "admin",
    access_role: "owner",
    is_owner: true,
    sandbox_access: true,
    live_access: true,
    permissions: [],
    mfa_required: true,
    user_type: "employee",
    job_title: null,
    status: "active",
  };
}

function isCompanyAdmin(membership: MembershipRow) {
  return membership.role === "admin" || membership.is_owner || membership.access_role === "administrator";
}

async function organizationCreatedBy(supabase: any, userId: string, orgId?: string | null) {
  if (orgId) {
    const { data } = await supabase.from("organizations").select("id, created_by").eq("id", orgId).maybeSingle();
    if (data && (data as { created_by?: string }).created_by === userId) return String((data as { id: string }).id);
    return null;
  }
  const { data } = await supabase
    .from("organizations")
    .select("id, created_by")
    .eq("created_by", userId)
    .limit(1)
    .maybeSingle();
  return data ? String((data as { id: string }).id) : null;
}

async function requireAdmin(supabase: any, userId: string, orgId?: string | null) {
  const membership = await membershipForOrg(supabase, userId, orgId);
  if (membership && isCompanyAdmin(membership)) return membership;
  const createdId = await organizationCreatedBy(supabase, userId, orgId ?? membership?.org_id);
  if (createdId) return asAdminMembership(createdId);
  if (!membership) throw new Error("You are not part of a team yet");
  throw new Error("Only team administrators can do that");
}

function originFrom(data: { origin?: string | undefined }) {
  return data.origin ?? "https://eterfaceid.lovable.app";
}

function environmentLabel(sandbox: boolean, live: boolean) {
  if (sandbox && live) return "Sandbox and Live";
  if (live) return "Live";
  return "Sandbox";
}

async function readCreatorMembership(supabase: any, userId: string, orgId: string, token: string) {
  try {
    const local = await membershipForOrg(supabase, userId, orgId);
    if (local) return { orgId: local.org_id, role: local.role };
  } catch {
    /* live membership select may omit extra columns */
  }
  const viaUser = await userRest<Array<{ org_id: string; role: MembershipRow["role"] }>>("organization_members", {
    query: `user_id=eq.${userId}&org_id=eq.${orgId}&select=org_id,role`,
    token,
  });
  const row = firstRow(viaUser.data);
  if (row && !viaUser.error) return { orgId: String(row.org_id), role: row.role || "admin" };
  return null;
}

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2, "Enter your company name").max(80),
        legalName: z.string().trim().min(2).max(200).optional(),
        registrationNumber: z.string().trim().max(60).optional(),
        country: z.string().trim().max(2).optional(),
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { projectRest, supabaseServiceRoleKey } = await import("@/lib/supabase-project");
    const db = context.supabase;
    let already: MembershipRow | null = null;
    try {
      already = await membershipForOrg(db, context.userId);
    } catch {
      already = null;
    }
    if (already) return { orgId: already.org_id, name: data.name, role: already.role, existing: true };

    const legalName = data.legalName?.trim() || data.name;
    const profile = {
      legal_name: legalName,
      registration_number: data.registrationNumber || null,
      country: data.country?.toUpperCase() || null,
      address_line1: data.addressLine1 || null,
      city: data.city || null,
      region: data.region || null,
      postal_code: data.postalCode || null,
      website: data.website || null,
    };
    const slug = slugify(data.name);
    const userToken = await callerAccessToken();
    if (!userToken) throw new Error("Sign in again after confirming your email, then create the company dashboard.");

    const known = { id: newCompanyId(), name: data.name };
    const rpc = await userRpc<string>("create_company_workspace", { _name: data.name, _slug: slug }, userToken);
    if (rpc.error && !isMissingRpcError(rpc.error)) {
      throw new Error(companyCreateErrorMessage(rpc.error));
    }
    const rpcId = firstRow(rpc.data);
    let org: { id: string; name: string } | null =
      rpcId && !rpc.error ? { id: String(rpcId), name: data.name } : null;

    if (!org && supabaseServiceRoleKey()) {
      const found = await projectRest<Array<{ id: string; name: string }>>("organizations", {
        query: `created_by=eq.${context.userId}&select=id,name&order=created_at.desc&limit=1`,
      });
      const row = firstRow(found.data);
      if (row && !found.error) org = { id: String(row.id), name: String(row.name ?? data.name) };
    }

    if (!org) {
      const created = await writeIgnoringUnknownColumns(async (payload) => {
        const viaUser = await userRest<Array<{ id: string; name: string }>>("organizations", {
          method: "POST",
          prefer: "return=minimal",
          body: payload,
          token: userToken,
        });
        if (restAcceptedWrite(viaUser)) {
          const resolved = resolveInsertedCompany(known, viaUser);
          return { data: resolved.org, error: resolved.error ? { message: resolved.error } : null };
        }
        if (isMissingSchemaError(viaUser.error ?? "")) {
          return { data: null, error: { message: viaUser.error ?? "" } };
        }
        if (supabaseServiceRoleKey()) {
          const viaAdmin = await projectRest<Array<{ id: string; name: string }>>("organizations", {
            method: "POST",
            query: "select=id,name",
            prefer: "return=representation",
            body: payload,
          });
          if (restAcceptedWrite(viaAdmin) || isUniqueConflict(viaAdmin.error ?? "")) {
            const resolved = resolveInsertedCompany(known, viaAdmin);
            return { data: resolved.org, error: resolved.error ? { message: resolved.error } : null };
          }
          if (isMissingSchemaError(viaAdmin.error ?? "")) {
            return { data: null, error: { message: viaAdmin.error ?? "" } };
          }
        }
        return { data: null, error: { message: viaUser.error ?? "The company could not be created" } };
      }, liveOrganizationInsert({ id: known.id, name: data.name, slug, createdBy: context.userId }));
      const resolved = resolveInsertedCompany(known, created);
      if (!resolved.org) {
        throw new Error(companyCreateErrorMessage(resolved.error ?? created.error?.message ?? "The company could not be created"));
      }
      org = resolved.org;
    }

    if (!org) throw new Error("The company could not be created");

    if (!rpcId || rpc.error || isMissingRpcError(String(rpc.error ?? ""))) {
      const member = await writeIgnoringUnknownColumns(async (payload) => {
        const viaUser = await userRest("organization_members", {
          method: "POST",
          prefer: "return=minimal",
          body: payload,
          token: userToken,
        });
        if (restAcceptedWrite(viaUser)) return { data: { ok: true }, error: null };
        if (isMissingSchemaError(viaUser.error ?? "")) {
          return { data: null, error: { message: viaUser.error ?? "" } };
        }
        if (supabaseServiceRoleKey()) {
          const viaAdmin = await projectRest("organization_members", {
            method: "POST",
            prefer: "return=minimal",
            body: payload,
          });
          if (restAcceptedWrite(viaAdmin)) return { data: { ok: true }, error: null };
          if (isMissingSchemaError(viaAdmin.error ?? "")) {
            return { data: null, error: { message: viaAdmin.error ?? "" } };
          }
        }
        const viaClient = await db.from("organization_members").insert(payload as never);
        if (!viaClient.error || isUniqueConflict(viaClient.error.message)) {
          return { data: { ok: true }, error: null };
        }
        const viaAdminClient = await supabaseAdmin.from("organization_members").insert(payload as never);
        if (!viaAdminClient.error || isUniqueConflict(viaAdminClient.error.message)) {
          return { data: { ok: true }, error: null };
        }
        return {
          data: null,
          error: viaAdminClient.error ?? viaClient.error ?? { message: viaUser.error ?? "Could not open the company dashboard" },
        };
      }, liveMemberInsert({ orgId: org.id, userId: context.userId }));
    }

    let opened = await readCreatorMembership(db, context.userId, org.id, userToken);
    if (!opened) {
      await writeIgnoringUnknownColumns(async (payload) => {
        const viaUser = await userRest("organization_members", {
          method: "POST",
          prefer: "return=minimal",
          body: payload,
          token: userToken,
        });
        if (restAcceptedWrite(viaUser) || isUniqueConflict(viaUser.error ?? "")) {
          return { data: { ok: true }, error: null };
        }
        if (supabaseServiceRoleKey()) {
          const viaAdmin = await projectRest("organization_members", {
            method: "POST",
            prefer: "return=minimal",
            body: payload,
          });
          if (restAcceptedWrite(viaAdmin) || isUniqueConflict(viaAdmin.error ?? "")) {
            return { data: { ok: true }, error: null };
          }
        }
        const viaAdminClient = await supabaseAdmin.from("organization_members").insert(payload as never);
        if (!viaAdminClient.error || isUniqueConflict(viaAdminClient.error.message ?? "")) {
          return { data: { ok: true }, error: null };
        }
        return { data: null, error: viaAdminClient.error ?? { message: viaUser.error ?? "Could not join the company" } };
      }, liveMemberInsert({ orgId: org.id, userId: context.userId }));
      opened = await readCreatorMembership(db, context.userId, org.id, userToken);
    }
    if (!opened) {
      throw new Error("The company was saved, but the dashboard could not be opened. Click Create company dashboard again.");
    }

    const environments = await writeIgnoringUnknownColumns(async (payload) => {
      const result = await supabaseAdmin.from("org_environments").insert(payload["rows"] as never);
      return { data: result.error ? null : { ok: true }, error: result.error };
    }, {
      rows: [
        { org_id: org.id, code: "sandbox", label: "Sandbox", publishable_prefix: "ef_test_" },
        { org_id: org.id, code: "live", label: "Live", publishable_prefix: "ef_live_" },
      ],
    });
    if (environments.error && !environments.skipped && !isMissingSchemaError(environments.error.message)) {
      /* environments are optional on the live project */
    }

    try {
      await writeIgnoringUnknownColumns(async (payload) => {
        const result = await userRest("org_applications", {
          method: "POST",
          prefer: "return=minimal",
          body: payload,
          token: userToken,
        });
        if (restAcceptedWrite(result)) return { data: { ok: true }, error: null };
        return { data: { ok: true }, error: null };
      }, {
        org_id: org.id,
        legal_name: legalName,
        ...profile,
        submitted_by: context.userId,
        status: "draft",
      });
    } catch {
      /* company profile is optional until Go live */
    }

    try {
      await db.from("audit_events").insert({
        org_id: org.id,
        actor_id: context.userId,
        action: "team.created",
        entity_type: "organization",
        entity_id: org.id,
        detail: { name: data.name, legalName, ...profile } as never,
      });
    } catch {
      /* audit must never block creating the company */
    }

    try {
      const email = context.claims?.email as string | undefined;
      if (email) {
        const { sendNotification } = await import("@/lib/email.server");
        await sendNotification(supabaseAdmin, {
          event: "team.welcome",
          to: [email],
          orgId: org.id as string,
          data: {
            org: org.name as string,
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

    return { orgId: org.id as string, name: org.name, role: opened.role, existing: false };
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
    const displayName = data.name.trim();
    const legalName = (data.legalName || data.name).trim();
    const orgUpdate = await writeIgnoringUnknownColumns(async (payload) => {
      const result = await context.supabase
        .from("organizations")
        .update(payload as never)
        .eq("id", membership.org_id)
        .select("id, name");
      return { data: result.error ? null : { ok: true }, error: result.error };
    }, {
      ...liveOrganizationProfileUpdate({ name: displayName }),
      legal_name: legalName,
      registration_number: data.registrationNumber || null,
      country: data.country?.toUpperCase() || null,
      address_line1: data.addressLine1 || null,
      city: data.city || null,
      region: data.region || null,
      postal_code: data.postalCode || null,
      website: data.website || null,
    });
    if (orgUpdate.error && !isMissingSchemaError(orgUpdate.error.message)) {
      throw new Error(orgUpdate.error.message);
    }

    const application = companyApplicationPayload({
      orgId: membership.org_id,
      userId: context.userId,
      legalName,
      registrationNumber: data.registrationNumber,
      country: data.country,
      addressLine1: data.addressLine1,
      city: data.city,
      region: data.region,
      postalCode: data.postalCode,
      website: data.website,
    });
    const existing = await context.supabase
      .from("org_applications")
      .select("id")
      .eq("org_id", membership.org_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.error && !isMissingSchemaError(existing.error.message)) {
      /* profile columns live on the application row; ignore read errors that are just missing extras */
    }
    const existingId = (existing.data as { id?: string } | null)?.id;
    if (existingId) {
      const updatedApp = await writeIgnoringUnknownColumns(async (payload) => {
        const result = await context.supabase
          .from("org_applications")
          .update(payload as never)
          .eq("id", existingId);
        return { data: result.error ? null : { ok: true }, error: result.error };
      }, application);
      if (updatedApp.error && !isMissingSchemaError(updatedApp.error.message) && !updatedApp.skipped) {
        throw new Error(updatedApp.error.message);
      }
    } else if (!(existing.error && isMissingSchemaError(existing.error.message))) {
      const insertedApp = await writeIgnoringUnknownColumns(async (payload) => {
        const result = await context.supabase.from("org_applications").insert(payload as never);
        if (result.error && isUniqueConflict(result.error.message) && existingId) {
          return { data: { ok: true }, error: null };
        }
        return { data: result.error ? null : { ok: true }, error: result.error };
      }, application);
      if (insertedApp.error && !isUniqueConflict(insertedApp.error.message) && !insertedApp.skipped) {
        if (!isMissingSchemaError(insertedApp.error.message)) throw new Error(insertedApp.error.message);
      }
    }

    try {
      await context.supabase.from("audit_events").insert({
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

    return mergeCompanyProfile(
      { id: membership.org_id, name: displayName, legal_name: legalName },
      application,
    );
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
    const expiresAt = invitationExpiryIso();
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const { data: orgRow } = await context.supabase
      .from("organizations")
      .select("name")
      .eq("id", membership.org_id)
      .maybeSingle();
    const orgName = (orgRow as { name?: string } | null)?.name || "your team";

    let added: { userId: string } | null = null;
    const { data: existingProfile } = await context.supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", email)
      .maybeSingle();
    const existingUserId = (existingProfile as { id?: string } | null)?.id;
    if (existingUserId) {
      const member = await writeIgnoringUnknownColumns(async (payload) => {
        const result = await context.supabase.from("organization_members").insert(payload as never).select("user_id").maybeSingle();
        if (result.error && isUniqueConflict(result.error.message)) {
          return { data: { user_id: existingUserId }, error: null };
        }
        return { data: result.data as { user_id: string } | null, error: result.error };
      }, {
        ...liveMemberInsert({ orgId: membership.org_id, userId: existingUserId }),
        role: mapAccessRoleToAppRole(accessRole),
        access_role: accessRole,
        is_owner: false,
        user_type: data.userType,
        job_title: data.jobTitle || null,
        sandbox_access: data.sandboxAccess,
        live_access: data.liveAccess,
        permissions,
        status: "active",
      });
      if (member.error && !isUniqueConflict(member.error.message)) {
        added = null;
      } else {
        added = { userId: existingUserId };
      }
    }

    const inviteRow = added
      ? { data: null as { id: string; email: string; role: string; access_role?: string; expires_at: string } | null, error: null }
      : await writeIgnoringUnknownColumns(async (payload) => {
          const result = await context.supabase
            .from("organization_invites")
            .insert(payload as never)
            .select("id, email, role, access_role, expires_at")
            .maybeSingle();
          return { data: result.data as { id: string; email: string; role: string; access_role?: string; expires_at: string } | null, error: result.error };
        }, {
          ...liveInviteInsert({
            orgId: membership.org_id,
            email,
            role: mapAccessRoleToAppRole(accessRole),
            tokenHash,
            invitedBy: context.userId,
            expiresAt,
          }),
          access_role: accessRole,
          first_name: data.firstName,
          last_name: data.lastName,
          job_title: data.jobTitle || null,
          user_type: data.userType,
          sandbox_access: data.sandboxAccess,
          live_access: data.liveAccess,
          permissions,
        });

    let signedToken = token;
    try {
      const { signTeamInvite } = await import("@/lib/team-invite.server");
      signedToken = await signTeamInvite({
        email,
        orgId: membership.org_id,
        orgName,
        firstName: data.firstName,
        lastName: data.lastName,
        jobTitle: data.jobTitle || null,
        accessRole,
        userType: data.userType,
        sandboxAccess: data.sandboxAccess,
        liveAccess: data.liveAccess,
      });
    } catch {
      signedToken = token;
    }

    try {
      await context.supabase.from("audit_events").insert({
        org_id: membership.org_id,
        actor_id: context.userId,
        action: added ? "team.member_added" : "team.invited",
        entity_type: "organization_invite",
        entity_id: inviteRow.data?.id ?? membership.org_id,
        detail: {
          email,
          role: accessRole,
          sandbox: data.sandboxAccess,
          live: data.liveAccess,
          added: Boolean(added),
        } as never,
      });
    } catch {
      /* audit must not block inviting */
    }

    const link = `${originFrom(data)}/invite/${signedToken}`;
    let emailed: { sent: boolean; reason?: string; detail?: string } = {
      sent: false,
      reason: added ? "already_member" : "not_attempted",
    };
    if (!added) {
      try {
        const { sendNotification } = await import("@/lib/email.server");
        const { data: inviter } = await context.supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", context.userId)
          .maybeSingle();
        emailed = await sendNotification(context.supabase as never, {
          event: "team.invite",
          to: email,
          orgId: membership.org_id,
          data: {
            org: orgName,
            name: data.firstName,
            inviter: (inviter as { full_name?: string; email?: string } | null)?.full_name
              ?? (inviter as { email?: string } | null)?.email
              ?? "A colleague",
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
    }

    return {
      invite: inviteRow.data ?? { email, role: mapAccessRoleToAppRole(accessRole), expires_at: expiresAt },
      token: signedToken,
      emailed,
      added,
    };
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
  .inputValidator((input) => z.object({ token: z.string().trim().min(10).max(8000) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const { verifyTeamInvite } = await import("@/lib/team-invite.server");
      const signed = await verifyTeamInvite(data.token);
      if (signed) {
        return {
          email: signed.email,
          firstName: signed.firstName,
          lastName: signed.lastName,
          jobTitle: signed.jobTitle ?? "",
          accessRole: signed.accessRole,
          roleLabel: displayRole(signed.role, signed.accessRole),
          userType: signed.userType,
          sandboxAccess: signed.sandboxAccess,
          liveAccess: signed.liveAccess,
          permissions: defaultPermissions(signed.accessRole),
          expiresAt: new Date(signed.exp).toISOString(),
          orgName: signed.orgName,
          inviterName: "An administrator",
        };
      }
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
        token: z.string().trim().min(10).max(8000),
        firstName: z.string().trim().max(80).optional(),
        lastName: z.string().trim().max(80).optional(),
        origin: z.string().trim().url().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { verifyTeamInvite } = await import("@/lib/team-invite.server");
    const signed = await verifyTeamInvite(data.token);
    const tokenHash = await sha256Hex(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: stored } = await supabaseAdmin
      .from("organization_invites")
      .select(
        "id, org_id, email, role, access_role, user_type, job_title, sandbox_access, live_access, permissions, first_name, last_name, expires_at, accepted_at, revoked_at",
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    const invite = stored
      ? stored
      : signed
        ? {
            id: null as string | null,
            org_id: signed.orgId,
            email: signed.email,
            role: signed.role,
            access_role: signed.accessRole,
            user_type: signed.userType,
            job_title: signed.jobTitle,
            sandbox_access: signed.sandboxAccess,
            live_access: signed.liveAccess,
            permissions: defaultPermissions(signed.accessRole),
            first_name: signed.firstName,
            last_name: signed.lastName,
            expires_at: new Date(signed.exp).toISOString(),
            accepted_at: null as string | null,
            revoked_at: null as string | null,
          }
        : null;

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
      const member = await writeIgnoringUnknownColumns(async (payload) => {
        const result = await context.supabase.from("organization_members").insert(payload as never);
        if (result.error && isUniqueConflict(result.error.message)) {
          return { data: { ok: true }, error: null };
        }
        return { data: result.error ? null : { ok: true }, error: result.error };
      }, {
        ...liveMemberInsert({ orgId: invite.org_id, userId: context.userId }),
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
      if (member.error) throw new Error(member.error.message);
    }

    if (invite.id) {
      await context.supabase
        .from("organization_invites")
        .update({ accepted_at: new Date().toISOString(), accepted_by: context.userId })
        .eq("id", invite.id);
    }

    const fullName = [data.firstName || invite.first_name, data.lastName || invite.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (fullName) {
      await supabaseAdmin.from("profiles").update({ full_name: fullName }).eq("id", context.userId);
    }

    try {
      await supabaseAdmin.from("audit_events").insert({
        org_id: invite.org_id,
        actor_id: context.userId,
        action: "team.joined",
        entity_type: "organization",
        entity_id: invite.org_id,
        detail: { role: invite.access_role || invite.role } as never,
      });
    } catch {
      /* audit must not block joining */
    }

    try {
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
    } catch {
      /* welcome email must not block joining the company */
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
