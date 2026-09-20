import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import {
  authConfirmEidUrl,
  authConfirmUrl,
  authLinkFromGenerate,
  generateLinkTypes,
} from "@/lib/auth-email.server";

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

const resendKeySchema = z
  .string()
  .trim()
  .max(400)
  .refine((value) => !value || value.startsWith("re_"), "Resend API keys start with re_")
  .optional();

const emailInput = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  origin: originSchema,
  next: z.string().trim().max(200).optional(),
  resendKey: resendKeySchema,
});

async function recentlySentViaResend(admin: SupabaseClient<Database>, email: string, event: string) {
  try {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .eq("recipient", email)
      .eq("event", event)
      .eq("status", "sent")
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

async function recordEmailLog(
  admin: SupabaseClient<Database> | null,
  event: string,
  email: string,
  subject: string,
  status: "sent" | "failed",
  errorDetail?: string,
) {
  if (!admin) return;
  try {
    await admin.from("email_log").insert({
      event,
      recipient: email,
      subject,
      status,
      error_detail: errorDetail ?? null,
    });
  } catch {
    /* logging must never block delivery */
  }
}

async function buildAuthLink(
  event: "account.verify" | "account.password_reset",
  email: string,
  origin: string,
  next?: string | null,
) {
  const redirectTo = authConfirmUrl(origin, next);
  let admin: SupabaseClient<Database> | null = null;
  try {
    admin = await adminClient();
  } catch {
    admin = null;
  }

  if (admin) {
    for (const type of generateLinkTypes(event)) {
      try {
        const { data, error } = await admin.auth.admin.generateLink({
          type,
          email,
          options: { redirectTo },
        });
        if (error) continue;
        const link = authLinkFromGenerate(data.properties, origin, type, next);
        if (link) return { admin, link, via: "generateLink" as const };
      } catch {
        /* anon/publishable clients cannot generate Auth links */
      }
    }
  }

  const { signSignupConfirm } = await import("@/lib/signup-confirm.server");
  const eid = await signSignupConfirm({
    email,
    purpose: event === "account.password_reset" ? "recovery" : "verify",
    next,
  });
  return { admin, link: authConfirmEidUrl(origin, eid, next), via: "signed" as const };
}

async function deliverAuthLink(
  event: "account.verify" | "account.password_reset",
  email: string,
  origin: string,
  next?: string | null,
  resendKey?: string | null,
) {
  const address = email.toLowerCase();
  if (resendKey?.startsWith("re_")) {
    const { setBootstrapResendKey } = await import("@/lib/email.server");
    setBootstrapResendKey(resendKey);
  }

  let admin: SupabaseClient<Database> | null = null;
  try {
    admin = await adminClient();
    if (await recentlySentViaResend(admin, address, event)) {
      return { sent: true as const, reason: "already_sent" as const };
    }
  } catch {
    admin = null;
  }

  const built = await buildAuthLink(event, address, origin, next);
  admin = admin ?? built.admin;

  const { sendAuthEmailViaResend } = await import("@/lib/auth-email-delivery.server");
  const mailed = await sendAuthEmailViaResend(event, address, built.link, resendKey);
  const subject = event === "account.verify" ? "Confirm your eterfaceID email" : "Reset your eterfaceID password";
  await recordEmailLog(
    admin,
    event,
    address,
    subject,
    mailed.sent ? "sent" : "failed",
    mailed.sent ? undefined : mailed.detail,
  );
  return mailed;
}

export const sendSignupVerificationEmail = createServerFn({ method: "POST" })
  .inputValidator((input) => emailInput.parse(input))
  .handler(async ({ data }) =>
    deliverAuthLink("account.verify", data.email, data.origin, data.next, data.resendKey),
  );

export const sendPasswordResetEmail = createServerFn({ method: "POST" })
  .inputValidator((input) => emailInput.parse(input))
  .handler(async ({ data }) =>
    deliverAuthLink("account.password_reset", data.email, data.origin, data.next, data.resendKey),
  );

export const completeSignupVerification = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ eid: z.string().trim().min(10).max(2000) }).parse(input))
  .handler(async ({ data }) => {
    const { verifySignupConfirm } = await import("@/lib/signup-confirm.server");
    const payload = await verifySignupConfirm(data.eid);
    if (!payload) {
      return { confirmed: false as const, reason: "invalid" as const };
    }

    try {
      const admin = await adminClient();
      let user = null;
      for (let page = 1; page <= 20; page += 1) {
        const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
        user = listed.data.users.find((row) => row.email?.toLowerCase() === payload.email) ?? null;
        if (user || listed.data.users.length < 200) break;
      }
      if (!user) {
        return { confirmed: false as const, reason: "not_found" as const, email: payload.email, next: payload.next };
      }
      if (!user.email_confirmed_at) {
        const { error } = await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
        if (error) {
          return { confirmed: false as const, reason: "provider_error" as const, email: payload.email, next: payload.next };
        }
      }
      const magic = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: payload.email,
      });
      const tokenHash = magic.data.properties?.hashed_token?.trim() ?? null;
      return {
        confirmed: true as const,
        email: payload.email,
        next: payload.next ?? "/console",
        tokenHash,
      };
    } catch {
      return { confirmed: false as const, reason: "needs_service_role" as const, email: payload.email, next: payload.next };
    }
  });
