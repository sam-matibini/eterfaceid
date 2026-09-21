import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { authCallbackUrl } from "@/lib/after-auth";

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
});

async function recentlyEmailed(admin: SupabaseClient<Database>, email: string, event: string) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("recipient", email)
    .eq("event", event)
    .gte("created_at", since);
  return (count ?? 0) >= 5;
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function deliverAuthLink(
  type: "magiclink" | "recovery",
  event: "account.verify" | "account.password_reset",
  email: string,
  origin: string,
) {
  let admin: SupabaseClient<Database>;
  try {
    admin = await adminClient();
    if (await recentlyEmailed(admin, email.toLowerCase(), event)) {
      return { sent: true, reason: "rate_limited" as const };
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Email delivery is not connected";
    return { sent: false, reason: "not_configured" as const, detail };
  }

  let link: string | null = null;
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type,
      email,
      options: { redirectTo: authCallbackUrl(origin) },
    });
    if (error) throw error;
    link = data.properties.action_link ?? null;
  } catch {
    /* do not reveal whether the address has an account */
    return { sent: true };
  }
  if (!link) return { sent: true };

  const { sendNotification } = await import("@/lib/email.server");
  return sendNotification(admin, {
    event,
    to: email.toLowerCase(),
    data: { link, name: email.split("@")[0] ?? "there" },
  });
}

export const sendSignupVerificationEmail = createServerFn({ method: "POST" })
  .inputValidator((input) => emailInput.parse(input))
  .handler(async ({ data }) => deliverAuthLink("magiclink", "account.verify", data.email, data.origin));

export const sendPasswordResetEmail = createServerFn({ method: "POST" })
  .inputValidator((input) => emailInput.parse(input))
  .handler(async ({ data }) => deliverAuthLink("recovery", "account.password_reset", data.email, data.origin));
