import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(60),
        environment: z.enum(["sandbox", "live"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error("Could not verify your permissions");
    if (!isAdmin) throw new Error("Only administrators can create API keys");

    const raw = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const secret = `eid_${data.environment === "live" ? "live" : "test"}_${raw}`;
    const keyHash = await sha256Hex(secret);

    const { data: inserted, error } = await context.supabase
      .from("api_keys")
      .insert({
        name: data.name,
        environment: data.environment,
        key_prefix: secret.slice(0, 16),
        key_hash: keyHash,
        created_by: context.userId,
      })
      .select("id, name, environment, key_prefix, created_at")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_events").insert({
      actor_id: context.userId,
      action: "api_key.created",
      entity_type: "api_key",
      entity_id: inserted.id,
      detail: { name: data.name, environment: data.environment },
    });

    return { key: inserted, secret };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only administrators can revoke API keys");

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
      detail: {},
    });

    return { ok: true };
  });
