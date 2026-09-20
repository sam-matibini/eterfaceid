import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { FALLBACK_SUPABASE_URL, STAFF_BYPASS_EMAIL } from "@/lib/staff-bypass";

const pinInput = z.object({
  pin: z.string().min(1, "Enter the staff access code").max(72),
});

async function attemptKey() {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded || request.headers.get("x-real-ip") || "local";
  } catch {
    return "local";
  }
}

async function findUserByEmail(admin: SupabaseClient<Database>, email: string): Promise<User | null> {
  for (let page = 1; page <= 20; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw listed.error;
    const found = listed.data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (listed.data.users.length < 200) return null;
  }
  return null;
}

async function ensureStaffUser(admin: SupabaseClient<Database>): Promise<User> {
  const created = await admin.auth.admin.createUser({
    email: STAFF_BYPASS_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: "eterfaceID staff" },
  });
  if (!created.error && created.data.user) return created.data.user;

  const already = /already|registered|exists/i.test(created.error?.message ?? "");
  if (!already && created.error) throw created.error;

  const existing = await findUserByEmail(admin, STAFF_BYPASS_EMAIL);
  if (!existing) throw new Error("Could not create the staff account");
  return existing;
}

async function dropMfaFactors(admin: SupabaseClient<Database>, userId: string) {
  try {
    const listed = await admin.auth.admin.mfa.listFactors({ userId });
    const factors = listed.data?.factors ?? [];
    for (const factor of factors) {
      await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    }
  } catch {
    /* MFA admin APIs are optional; a fresh ops user has no factors */
  }
}

async function adminFromRuntime() {
  const { readRuntimeEnv, resolveSupabaseAdminCredentials } = await import("@/lib/staff-bypass.server");
  const creds = resolveSupabaseAdminCredentials(await readRuntimeEnv());
  const url = creds.url ?? FALLBACK_SUPABASE_URL;
  if (!creds.serviceRole) return null;
  return createClient<Database>(url, creds.serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

export const enterStaffBypass = createServerFn({ method: "POST" })
  .inputValidator((input) => pinInput.parse(input))
  .handler(async ({ data }) => {
    const {
      clearPinAttempts,
      configuredStaffBypassPin,
      consumePinAttempt,
      extractStaffSessionToken,
      pinsMatch,
    } = await import("@/lib/staff-bypass.server");

    const key = await attemptKey();
    const gate = consumePinAttempt(key);
    if (!gate.allowed) {
      throw new Error("Too many attempts. Wait a few minutes and try again.");
    }

    const expected = configuredStaffBypassPin();
    if (!expected) {
      throw new Error("Staff bootstrap is disabled on this deployment.");
    }
    if (!pinsMatch(data.pin.trim(), expected)) {
      throw new Error("That access code is not valid.");
    }

    const admin = await adminFromRuntime();
    if (!admin) {
      clearPinAttempts(key);
      return { email: STAFF_BYPASS_EMAIL, mode: "unlock" as const };
    }

    const user = await ensureStaffUser(admin);
    const { error: staffError } = await admin.from("platform_staff").upsert(
      { user_id: user.id, email: STAFF_BYPASS_EMAIL, level: "owner" },
      { onConflict: "user_id" },
    );
    if (staffError) throw new Error(staffError.message);

    await dropMfaFactors(admin, user.id);

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: STAFF_BYPASS_EMAIL,
    });
    if (linkError) throw new Error(linkError.message);

    const tokenHash = extractStaffSessionToken(link.properties);
    if (!tokenHash) {
      clearPinAttempts(key);
      return { email: STAFF_BYPASS_EMAIL, mode: "unlock" as const };
    }

    clearPinAttempts(key);
    return { tokenHash, email: STAFF_BYPASS_EMAIL, mode: "otp" as const };
  });

async function assertBootstrapPin(pin: string) {
  const { configuredStaffBypassPin, pinsMatch } = await import("@/lib/staff-bypass.server");
  const expected = configuredStaffBypassPin();
  if (!expected || !pinsMatch(pin.trim(), expected)) {
    throw new Error("That access code is not valid.");
  }
}

export const bootstrapSaveResendApiKey = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        pin: z.string().min(1).max(72),
        apiKey: z
          .string()
          .trim()
          .min(8)
          .max(400)
          .refine((value) => value.startsWith("re_"), "Resend API keys start with re_"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await assertBootstrapPin(data.pin);
    const { setBootstrapResendKey } = await import("@/lib/email.server");
    setBootstrapResendKey(data.apiKey);
    const last4 = data.apiKey.slice(-4);
    const admin = await adminFromRuntime();
    if (admin) {
      await admin.from("integration_secrets").upsert(
        {
          provider: "resend",
          api_key: data.apiKey,
          last4,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "provider" },
      );
      await admin
        .from("integration_settings")
        .update({
          enabled: true,
          status: "connected",
          last_checked_at: new Date().toISOString(),
          last_error: null,
          config: { last4 } as never,
        } as never)
        .eq("provider", "resend");
    }
    return { last4, persisted: Boolean(admin) };
  });

export const bootstrapResendStatus = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ pin: z.string().min(1).max(72) }).parse(input))
  .handler(async ({ data }) => {
    await assertBootstrapPin(data.pin);
    const { peekBootstrapResendKey } = await import("@/lib/email.server");
    const key = peekBootstrapResendKey();
    return {
      enabled: true,
      configured: Boolean(key),
      last4: key ? key.slice(-4) : null,
      lastError: null,
      lastCheckedAt: null,
      status: key ? "connected" : "unknown",
    };
  });

export const bootstrapSendTestEmail = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ pin: z.string().min(1).max(72), to: z.string().trim().email().max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    await assertBootstrapPin(data.pin);
    const { peekBootstrapResendKey, resendSendPlan, formatSender, renderTemplate } = await import("@/lib/email.server");
    const resendKey = peekBootstrapResendKey();
    const plan = resendSendPlan({ resendKey, lovableKey: process.env["LOVABLE_API_KEY"] ?? null });
    if (plan.mode === "unconfigured") {
      return { sent: false as const, reason: "not_configured" as const, detail: "Paste a Resend API key first." };
    }
    const { subject, html } = renderTemplate("test", {});
    const payload: Record<string, unknown> = {
      from: formatSender(null, null),
      to: [data.to],
      subject,
      html,
    };
    const response = await fetch(plan.url, {
      method: "POST",
      headers: plan.headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text();
      return { sent: false as const, reason: "provider" as const, detail: body.slice(0, 300) };
    }
    return { sent: true as const };
  });

export const bootstrapSaveTheKybApiKey = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ pin: z.string().min(1).max(72), apiKey: z.string().trim().min(8).max(400) }).parse(input),
  )
  .handler(async ({ data }) => {
    await assertBootstrapPin(data.pin);
    const { setBootstrapTheKybKey } = await import("@/lib/thekyb.server");
    setBootstrapTheKybKey(data.apiKey);
    const last4 = data.apiKey.slice(-4);
    const admin = await adminFromRuntime();
    if (admin) {
      await admin.from("integration_secrets").upsert(
        {
          provider: "thekyb",
          api_key: data.apiKey,
          last4,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "provider" },
      );
    }
    return { last4, persisted: Boolean(admin) };
  });
