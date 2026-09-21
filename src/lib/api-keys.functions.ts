import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasPermission, secretKeyPrefix, type PermissionCode } from "@/lib/access";
import { sha256Hex } from "@/lib/crypto-hash";
import { writeWithFallback } from "@/lib/schema-fallback";

const KEY_SCOPES = [
  "sandbox.api",
  "live.api",
  "kyc.reports.view",
  "kyb.reports.view",
  "aml.results.view",
  "api_logs.view",
] as const;

async function callerMembership(supabase: any, userId: string) {
  const full = await supabase
    .from("organization_members")
    .select("org_id, role, access_role, is_owner, live_access, sandbox_access, permissions, status")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const row =
    full.error && /does not exist|schema cache|could not find/i.test(full.error.message)
      ? await supabase.from("organization_members").select("org_id, role").eq("user_id", userId).limit(1).maybeSingle()
      : full;
  let data = row.data as {
    org_id: string;
    role: string;
    access_role?: string;
    is_owner?: boolean;
    live_access?: boolean;
    sandbox_access?: boolean;
    permissions?: string[];
    status?: string;
  } | null;
  if (data?.status === "disabled") data = null;
  if (!data) {
    const owned = await supabase
      .from("organizations")
      .select("id")
      .eq("created_by", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (owned.data?.id) {
      data = {
        org_id: owned.data.id as string,
        role: "admin",
        access_role: "owner",
        is_owner: true,
        live_access: true,
        sandbox_access: true,
        permissions: [],
        status: "active",
      };
      return { ...normalize(data), needsJoin: true };
    }
  }
  if (!data) throw new Error("You are not part of a team yet");
  return { ...normalize(data), needsJoin: false };

  function normalize(row: NonNullable<typeof data>) {
    return {
      org_id: row.org_id,
      role: row.role,
      access_role: row.access_role ?? (row.role === "admin" ? "owner" : "viewer"),
      is_owner: Boolean(row.is_owner) || row.role === "admin",
      live_access: Boolean(row.live_access) || row.role === "admin",
      sandbox_access: row.sandbox_access !== false,
      permissions: row.permissions ?? [],
      status: row.status ?? "active",
    };
  }
}

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(60),
        environment: z.enum(["sandbox", "live"]),
        kind: z.enum(["secret", "publishable"]).default("secret"),
        scopes: z.array(z.enum(KEY_SCOPES)).optional(),
        aal: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await callerMembership(context.supabase, context.userId);
    if (!hasPermission(membership, "api_keys.create")) {
      throw new Error("You do not have permission to create API keys");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (membership.needsJoin) {
      await supabaseAdmin.from("organization_members").insert({
        org_id: membership.org_id,
        user_id: context.userId,
        role: "admin",
      } as never);
    }
    if (data.environment === "sandbox" && membership.sandbox_access === false) {
      throw new Error("Your account does not have Sandbox access");
    }
    if (data.environment === "live") {
      if (!membership.live_access && membership.role !== "admin" && !membership.is_owner) {
        throw new Error("Live API access is not authorized for your account. Request it from an administrator.");
      }
      const aal = data.aal ?? (context.claims?.aal as string | undefined);
      if (aal !== "aal2") {
        throw new Error("Creating a Live key requires MFA re-authentication.");
      }
      const { data: org } = await context.supabase
        .from("organizations")
        .select("live_access")
        .eq("id", membership.org_id)
        .maybeSingle();
      const access = (org as { live_access?: string } | null)?.live_access ?? "locked";
      if (access === "suspended") {
        throw new Error("Live access for this account is suspended. Contact eterfaceID.");
      }
      if (access !== "approved") {
        throw new Error("Live access is not approved yet. Complete Go live first, then we will review it.");
      }
      const { data: contract } = await context.supabase
        .from("org_contracts")
        .select("id")
        .eq("org_id", membership.org_id)
        .eq("status", "accepted")
        .limit(1)
        .maybeSingle();
      if (!contract) throw new Error("The commercial agreement must be signed before live keys can be created.");
    }

    const raw = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const prefix =
      data.kind === "publishable"
        ? data.environment === "live"
          ? "ef_live_"
          : "ef_test_"
        : secretKeyPrefix(data.environment);
    const secret = `${prefix}${raw}`;
    const keyHash = await sha256Hex(secret);
    const scopes = (data.scopes?.length
      ? data.scopes
      : data.environment === "live"
        ? ["live.api"]
        : ["sandbox.api"]) as PermissionCode[];

    const insertedRow = await writeWithFallback(
      async (payload) => {
        const result = await supabaseAdmin
          .from("api_keys")
          .insert(payload as never)
          .select("id, name, environment, key_prefix, created_at")
          .single();
        return { data: result.data, error: result.error };
      },
      {
        org_id: membership.org_id,
        name: data.name,
        environment: data.environment,
        key_kind: data.kind,
        key_prefix: secret.slice(0, 18),
        key_hash: keyHash,
        created_by: context.userId,
        scopes,
      },
      {
        org_id: membership.org_id,
        name: data.name,
        environment: data.environment,
        key_prefix: secret.slice(0, 18),
        key_hash: keyHash,
        created_by: context.userId,
      },
    );
    if (insertedRow.error || !insertedRow.data) {
      throw new Error(insertedRow.error?.message ?? "The API key could not be created");
    }
    const inserted = insertedRow.data;

    await supabaseAdmin.from("audit_events").insert({
      org_id: membership.org_id,
      actor_id: context.userId,
      action: data.environment === "live" ? "api_key.live_created" : "api_key.created",
      entity_type: "api_key",
      entity_id: inserted.id,
      environment: data.environment,
      detail: { name: data.name, environment: data.environment, kind: data.kind, scopes } as never,
    });

    try {
      const { sendNotification } = await import("@/lib/email.server");
      const email = context.claims?.email as string | undefined;
      if (email) {
        const { data: org } = await context.supabase
          .from("organizations")
          .select("name")
          .eq("id", membership.org_id)
          .maybeSingle();
        await sendNotification(context.supabase as never, {
          event: data.environment === "live" ? "api_key.live_created" : "api_key.created",
          to: email,
          orgId: membership.org_id,
          data: {
            org: org?.name ?? "your organization",
            name: data.name,
            environment: data.environment,
          },
        });
      }
    } catch {
      /* email must not block key creation */
    }

    return { key: inserted, secret };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await callerMembership(context.supabase, context.userId);
    if (!hasPermission(membership, "api_keys.create")) {
      throw new Error("You do not have permission to revoke API keys");
    }

    const { error } = await context.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_events").insert({
      actor_id: context.userId,
      action: "api_key.revoked",
      entity_type: "api_key",
      entity_id: data.id,
      detail: {} as never,
    });

    return { ok: true };
  });
