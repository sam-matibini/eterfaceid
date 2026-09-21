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

async function requireAdmin(supabase: any, userId: string, orgId?: string | null) {
  const membership = await membershipForOrg(supabase, userId, orgId);
  if (!membership) throw new Error("You are not part of a team yet");
  if (membership.role !== "admin" && !membership.is_owner) {
    throw new Error("Only team administrators can do that");
  }
  return membership;
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
    if (already) return { orgId: already.org_id, existing: true };

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
      if (member.error) throw new Error(companyCreateErrorMessage(member.error.message));
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

    return { orgId: org.id as string, existing: false };
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
        country: z.string().trim().max(2).optional(),
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
    const profile = {
      name: data.name,
      legal_name: data.legalName || data.name,
      registration_number: data.registrationNumber || null,
      country: data.country?.toUpperCase() || null,
      address_line1: data.addressLine1 || null,
      city: data.city || null,
      region: data.region || null,
      postal_code: data.postalCode || null,
      website: data.website || null,
    };
    const updated = await writeIgnoringUnknownColumns(async (payload) => {
      const result = await context.supabase.from("organizations").update(payload as never).eq("id", membership.org_id);
      return { data: result.error ? null : { ok: true }, error: result.error };
    }, profile);
    if (updated.error) throw new Error(updated.error.message);
    await writeIgnoringUnknownColumns(async (payload) => {
      const result = await context.supabase.from("org_applications").insert(payload as never);
      return { data: result.error ? null : { ok: true }, error: result.error };
    }, {
      org_id: membership.org_id,
      legal_name: data.legalName || data.name,
      registration_number: data.registrationNumber || null,
      country: data.country?.toUpperCase() || null,
      address_line1: data.addressLine1 || null,
      city: data.city || null,
      region: data.region || null,
      postal_code: data.postalCode || null,
      website: data.website || null,
      submitted_by: context.userId,
      status: "draft",
    });
    await context.supabase.from("audit_events").insert({
      org_id: membership.org_id,
      actor_id: context.userId,
      action: "org.profile_updated",
      entity_type: "organization",
      entity_id: membership.org_id,
      detail: { name: data.name } as never,
    });
    return { ok: true };
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
    if (data.liveAccess && membership.role !== "admin") {
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

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = invitationExpiryIso();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("organization_invites")
      .insert({
        org_id: membership.org_id,
        email: data.email.toLowerCase(),
        role: mapAccessRoleToAppRole(accessRole),
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
      })
      .select("id, email, role, access_role, expires_at")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_events").insert({
      org_id: membership.org_id,
      actor_id: context.userId,
      action: "team.invited",
      entity_type: "organization_invite",
      entity_id: invite.id,
      detail: {
        email: data.email,
        role: accessRole,
        sandbox: data.sandboxAccess,
        live: data.liveAccess,
        permissions,
      } as never,
    });

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
    const emailed = await sendNotification(supabaseAdmin, {
      event: "team.invite",
      to: data.email,
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

    return { invite, token, emailed };
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
