import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { authConfirmUrl, authLinkFromGenerate, generateLinkTypes } from "@/lib/auth-email.server";

const originSchema = z
  .string()
  .trim()
  .url()
  .max(200)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  }, "Enter a valid site origin");

const emailInput = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  origin: originSchema,
  next: z.string().trim().max(200).optional(),
});

async function recentlyEmailed(admin: SupabaseClient<Database>, email: string, event: string) {
  try {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .eq("recipient", email)
      .eq("event", event)
      .gte("created_at", since);
    return (count ?? 0) >= 5;
  } catch {
    return false;
  }
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function publicAuthClient() {
  const { ensurePublicSupabaseEnv, publicSupabasePublishableKey, publicSupabaseUrl } = await import(
    "@/lib/supabase-public-env"
  );
  ensurePublicSupabaseEnv();
  return createClient<Database>(publicSupabaseUrl(), publicSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

async function sendViaResend(
  event: "account.verify" | "account.password_reset",
  email: string,
  link: string,
) {
  const { formatSender, peekBootstrapResendKey, renderTemplate, resendSendPlan } = await import("@/lib/email.server");
  const plan = resendSendPlan({
    resendKey: peekBootstrapResendKey(),
    lovableKey: process.env["LOVABLE_API_KEY"] ?? null,
  });
  if (plan.mode === "unconfigured") {
    return { sent: false as const, reason: "not_configured" as const, detail: "Resend API key is missing" };
  }
  const { subject, html } = renderTemplate(event, { link, name: email.split("@")[0] ?? "there" });
  const response = await fetch(plan.url, {
    method: "POST",
    headers: plan.headers,
    body: JSON.stringify({
      from: formatSender(null, null),
      to: [email],
      subject,
      html,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    return { sent: false as const, reason: "provider_error" as const, detail: body.slice(0, 300) };
  }
  return { sent: true as const };
}

async function resendThroughSupabaseAuth(
  event: "account.verify" | "account.password_reset",
  email: string,
  redirectTo: string,
) {
  const client = await publicAuthClient();
  const { error } = await client.auth.resend({
    type: event === "account.verify" ? "signup" : "recovery",
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    return { sent: false as const, reason: "provider_error" as const, detail: error.message };
  }
  return { sent: true as const };
}

async function deliverAuthLink(
  event: "account.verify" | "account.password_reset",
  email: string,
  origin: string,
  next?: string | null,
) {
  const redirectTo = authConfirmUrl(origin, next);
  let admin: SupabaseClient<Database> | null = null;
  try {
    admin = await adminClient();
    if (await recentlyEmailed(admin, email.toLowerCase(), event)) {
      return { sent: true as const, reason: "rate_limited" as const };
    }
  } catch {
    admin = null;
  }

  let link: string | null = null;
  let generateError: string | null = null;
  if (admin) {
    for (const type of generateLinkTypes(event)) {
      try {
        const { data, error } = await admin.auth.admin.generateLink({
          type,
          email,
          options: { redirectTo },
        });
        if (error) {
          generateError = error.message;
          continue;
        }
        link = authLinkFromGenerate(data.properties, origin, type, next);
        if (link) break;
      } catch (err) {
        generateError = err instanceof Error ? err.message : "generateLink failed";
      }
    }
  }

  if (link) {
    const mailed = await sendViaResend(event, email.toLowerCase(), link);
    if (mailed.sent || mailed.reason !== "not_configured") return mailed;
  }

  const fallback = await resendThroughSupabaseAuth(event, email.toLowerCase(), redirectTo);
  if (fallback.sent) return fallback;

  return {
    sent: false as const,
    reason: "provider_error" as const,
    detail:
      fallback.detail ||
      generateError ||
      "The verification email could not be sent. Add a Resend API key in App admin → Integrations, then try again.",
  };
}

export const sendSignupVerificationEmail = createServerFn({ method: "POST" })
  .inputValidator((input) => emailInput.parse(input))
  .handler(async ({ data }) => deliverAuthLink("account.verify", data.email, data.origin, data.next));

export const sendPasswordResetEmail = createServerFn({ method: "POST" })
  .inputValidator((input) => emailInput.parse(input))
  .handler(async ({ data }) => deliverAuthLink("account.password_reset", data.email, data.origin, data.next));
