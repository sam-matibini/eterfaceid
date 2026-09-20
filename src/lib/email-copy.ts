export function publicEmailFailureMessage(result: { sent: boolean; reason?: string; detail?: string }) {
  if (result.sent) return null;
  const detail = result.detail ?? "";
  if (/invalid.*api key|api key is invalid|\[401\]/i.test(detail)) {
    return "Resend rejected the API key. Paste a current sending key in App admin → Integrations, then send the verification email again.";
  }
  if (result.reason === "not_configured" || /SUPABASE_|RESEND_|API_KEY|SERVICE_ROLE/i.test(detail)) {
    return "Email delivery is not connected yet. Add a Resend API key in App admin → Integrations.";
  }
  if (result.reason === "integration_off") return "Email delivery is turned off in App admin → Integrations.";
  if (result.reason === "provider_error") return detail || "The email provider rejected the message. Check the Email log.";
  return detail || "The email could not be sent. Try again shortly.";
}
