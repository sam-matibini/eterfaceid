export function publicEmailFailureMessage(
  result: { sent: boolean; reason?: string; detail?: string },
  opts?: { savedLast4?: string | null },
) {
  if (result.sent) return null;
  const detail = result.detail ?? "";
  const last4 = opts?.savedLast4?.trim();
  if (/invalid.*api key|api key is invalid|\[401\]/i.test(detail)) {
    return last4
      ? `Resend rejected the saved sending key (••••${last4}) for this request. Open App admin → Integrations once so the on-file key can be reused, then send again.`
      : "Resend rejected the API key. Open App admin → Integrations and confirm the sending key is on, then send again.";
  }
  if (result.reason === "not_configured" || /SUPABASE_|RESEND_|API_KEY|SERVICE_ROLE/i.test(detail)) {
    return last4
      ? `A Resend key is already on file (••••${last4}). Open App admin → Integrations once so it can be reused for account emails, then send again.`
      : "Email delivery is not connected yet. Add a Resend API key in App admin → Integrations.";
  }
  if (result.reason === "integration_off") return "Email delivery is turned off in App admin → Integrations.";
  if (result.reason === "provider_error") return detail || "The email provider rejected the message. Check the Email log.";
  return detail || "The email could not be sent. Try again shortly.";
}
