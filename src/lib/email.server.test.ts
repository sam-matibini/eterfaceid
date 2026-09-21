import { formatSender, parseProviderError, renderTemplate, resendSendPlan } from "./email.server";
import { publicEmailFailureMessage } from "./email-copy";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(formatSender(null, null) === "eterfaceID <support@eterfaceid.com>", "default sender is eterfaceid.com");
assert(
  formatSender("eterfaceID", "support@eterfaceid.com") === "eterfaceID <support@eterfaceid.com>",
  "named sender",
);
assert(formatSender("  ", "  ") === "eterfaceID <support@eterfaceid.com>", "blank sender falls back");

const direct = resendSendPlan({ resendKey: "re_test_key", lovableKey: null });
assert(direct.mode === "direct", "own Resend API keys send directly");
assert(direct.mode === "direct" && direct.url === "https://api.resend.com/emails", "direct URL is Resend");

const gateway = resendSendPlan({ resendKey: "conn_opaque", lovableKey: "lvbl_key" });
assert(gateway.mode === "gateway", "opaque connection keys still use the Lovable gateway");

const missing = resendSendPlan({ resendKey: null, lovableKey: "lvbl_key" });
assert(missing.mode === "unconfigured", "Lovable key alone is not enough");

const verify = renderTemplate("account.verify", { link: "https://example.com/confirm", name: "Sam" });
assert(verify.subject.includes("Confirm"), "verification subject");
assert(verify.html.includes("https://example.com/confirm"), "verification link");
assert(!verify.html.includes("eterfaceID test email"), "verification is not the test template");

const reset = renderTemplate("account.password_reset", { link: "https://example.com/reset", name: "Sam" });
assert(reset.subject.toLowerCase().includes("reset"), "reset subject");
assert(reset.html.includes("https://example.com/reset"), "reset link");

const parsed = parseProviderError(403, JSON.stringify({ message: "The eterfaceid.com domain is not verified." }));
assert(parsed.includes("not verified"), "Resend JSON errors are readable");

assert(
  publicEmailFailureMessage({ sent: false, reason: "not_configured", detail: "Resend API key is missing" }) ===
    "Email delivery is not connected yet. Add a Resend API key in App admin → Integrations.",
  "missing Resend key is not shown raw",
);

console.log("email.server.test.ts passed");
