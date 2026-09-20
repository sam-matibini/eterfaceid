import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defaultPermissions, type PermissionCode } from "@/lib/access";

async function membership(supabase: any, userId: string, orgId?: string | null) {
  let query = supabase
    .from("organization_members")
    .select("org_id, role, access_role, is_owner, live_access, sandbox_access, permissions, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at");
  if (orgId) query = query.eq("org_id", orgId);
  const { data } = await query.limit(1).maybeSingle();
  if (!data) throw new Error("You are not part of a team yet");
  return data as {
    org_id: string;
    role: string;
    access_role: string;
    is_owner: boolean;
    live_access: boolean;
    sandbox_access: boolean;
    permissions: string[];
    status: string;
  };
}

function isAdmin(row: { role: string; is_owner: boolean; access_role: string }) {
  return row.is_owner || row.role === "admin" || row.access_role === "owner" || row.access_role === "administrator";
}

export const requestLiveAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid().optional(),
        reason: z.string().trim().min(8, "Explain why you need Live access").max(1000),
        scopes: z
          .array(z.enum(["live.api", "kyc.reports.view", "kyb.reports.view", "aml.results.view"]))
          .min(1)
          .default(["live.api", "kyc.reports.view", "kyb.reports.view", "aml.results.view"]),
        origin: z.string().trim().url().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const member = await membership(context.supabase, context.userId, data.orgId);
    if (member.live_access) return { already: true as const };

    const { data: existing } = await context.supabase
      .from("live_access_requests")
      .select("id, status")
      .eq("org_id", member.org_id)
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) return { id: existing.id as string, already: false as const, pending: true as const };

    const { data: row, error } = await context.supabase
      .from("live_access_requests")
      .insert({
        org_id: member.org_id,
        user_id: context.userId,
        requested_by: context.userId,
        reason: data.reason,
        scopes: data.scopes,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_events").insert({
      org_id: member.org_id,
      actor_id: context.userId,
      action: "live.access_requested",
      entity_type: "live_access_request",
      entity_id: row.id,
      environment: "live",
      detail: { reason: data.reason, scopes: data.scopes } as never,
    });

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendNotification, orgNotifyRecipients } = await import("@/lib/email.server");
      const [{ data: profile }, { data: org }] = await Promise.all([
        supabaseAdmin.from("profiles").select("email, full_name").eq("id", context.userId).maybeSingle(),
        supabaseAdmin.from("organizations").select("name").eq("id", member.org_id).maybeSingle(),
      ]);
      const admins = await orgNotifyRecipients(supabaseAdmin, member.org_id);
      if (admins.length) {
        await sendNotification(supabaseAdmin, {
          event: "live.access_requested",
          to: admins,
          orgId: member.org_id,
          data: {
            org: org?.name ?? "your organization",
            name: profile?.full_name ?? profile?.email ?? "A teammate",
            email: profile?.email ?? "",
            reason: data.reason,
            link: `${data.origin ?? "https://eterfaceid.lovable.app"}/console/live-access`,
          },
        });
      }
    } catch {
      /* email must not block the request */
    }

    return { id: row.id as string, already: false as const, pending: false as const };
  });

export const decideLiveAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(500).optional(),
        origin: z.string().trim().url().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: request } = await context.supabase
      .from("live_access_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!request) throw new Error("That request was not found");
    const member = await membership(context.supabase, context.userId, request.org_id);
    if (!isAdmin(member)) throw new Error("Only administrators can approve Live access");
    if (request.status !== "pending") throw new Error("This request has already been decided");

    const { error } = await context.supabase
      .from("live_access_requests")
      .update({
        status: data.decision,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        decision_note: data.note || null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.decision === "approved") {
      const { data: target } = await context.supabase
        .from("organization_members")
        .select("permissions, access_role")
        .eq("org_id", request.org_id)
        .eq("user_id", request.user_id)
        .maybeSingle();
      const extras = [...(target?.permissions ?? []), ...(request.scopes ?? [])] as PermissionCode[];
      const permissions = defaultPermissions((target?.access_role as "developer") ?? "developer", extras);
      if (!permissions.includes("live.api")) permissions.push("live.api");
      await context.supabase
        .from("organization_members")
        .update({
          live_access: true,
          permissions,
          mfa_required: true,
        })
        .eq("org_id", request.org_id)
        .eq("user_id", request.user_id);
    }

    await context.supabase.from("audit_events").insert({
      org_id: request.org_id,
      actor_id: context.userId,
      action: data.decision === "approved" ? "live.access_approved" : "live.access_rejected",
      entity_type: "live_access_request",
      entity_id: data.id,
      environment: "live",
      detail: { userId: request.user_id, note: data.note ?? null } as never,
    });

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendNotification } = await import("@/lib/email.server");
      const [{ data: profile }, { data: org }] = await Promise.all([
        supabaseAdmin.from("profiles").select("email, full_name").eq("id", request.user_id).maybeSingle(),
        supabaseAdmin.from("organizations").select("name").eq("id", request.org_id).maybeSingle(),
      ]);
      if (profile?.email) {
        await sendNotification(supabaseAdmin, {
          event: data.decision === "approved" ? "live.access_approved" : "live.access_rejected",
          to: profile.email,
          orgId: request.org_id,
          data: {
            org: org?.name ?? "your organization",
            name: profile.full_name ?? profile.email,
            note: data.note ?? "",
            link: `${data.origin ?? "https://eterfaceid.lovable.app"}/console/developers`,
          },
        });
      }
    } catch {
      /* notification must not block the decision */
    }

    return { ok: true };
  });

export const recordLoginEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        event: z.enum(["login", "mfa_verified", "mfa_enrolled", "mfa_failed", "password_changed"]),
        success: z.boolean().default(true),
        orgId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await context.supabase.from("login_events").insert({
      user_id: context.userId,
      org_id: data.orgId ?? null,
      email: (context.claims?.email as string | undefined) ?? null,
      event: data.event,
      success: data.success,
      detail: {} as never,
    });
    return { ok: true };
  });
