/** Shared Resend send for Auth emails. Server-only. */

import type { NotificationEvent } from "@/lib/notification-events";

export type AuthEmailSendResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "provider_error"; detail: string };

export async function sendAuthEmailViaResend(
  event: Extract<NotificationEvent, "account.verify" | "account.password_reset"> | "test",
  email: string,
  link: string,
  resendKey?: string | null,
): Promise<AuthEmailSendResult> {
  const { formatSender, parseProviderError, peekBootstrapResendKey, renderTemplate, resendSendPlan, setBootstrapResendKey } =
    await import("@/lib/email.server");

  if (resendKey?.trim().startsWith("re_")) setBootstrapResendKey(resendKey.trim());

  const plan = resendSendPlan({
    resendKey: peekBootstrapResendKey(),
    lovableKey: process.env["LOVABLE_API_KEY"] ?? null,
  });
  if (plan.mode === "unconfigured") {
    return {
      sent: false,
      reason: "not_configured",
      detail: "Resend API key is missing. Add it in App admin → Integrations.",
    };
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
    return { sent: false, reason: "provider_error", detail: parseProviderError(response.status, body) };
  }
  return { sent: true };
}
