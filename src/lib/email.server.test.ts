import {
  formatSender,
  normalizeResendFromAddress,
  parseProviderError,
  peekBootstrapResendKey,
  renderTemplate,
  resendSendPlan,
  setBootstrapResendKey,
} from "./email.server";
import { publicEmailFailureMessage } from "./email-copy";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(formatSender(null, null) === "eterfaceID <info@verify.eterfaceid.com>", "default sender uses the verified mailbox");
assert(
  formatSender("eterfaceID", "support@eterfaceid.com") === "eterfaceID <support@verify.eterfaceid.com>",
  "apex eterfaceid.com is remapped to the verified subdomain",
);
assert(formatSender("  ", "  ") === "eterfaceID <info@verify.eterfaceid.com>", "blank sender falls back");
assert(
  normalizeResendFromAddress("alerts@eterfaceid.com") === "alerts@verify.eterfaceid.com",
  "local part is kept when remapping",
);
assert(
  normalizeResendFromAddress("info@verify.eterfaceid.com") === "info@verify.eterfaceid.com",
  "already-verified addresses stay",
);

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
  publicEmailFailureMessage({ sent: false, reason: "not_configured", detail: "Missing SUPABASE_SERVICE_ROLE_KEY" })?.includes(
    "Resend API key",
  ),
  "env leaks are hidden from end users",
);
assert(
  publicEmailFailureMessage({ sent: false, reason: "provider_error", detail: "[401] API key is invalid" })?.includes(
    "Open App admin → Integrations",
  ),
  "invalid Resend keys point back to the saved Integrations key",
);
assert(
  publicEmailFailureMessage(
    { sent: false, reason: "not_configured" },
    { savedLast4: "m9EL" },
  )?.includes("••••m9EL"),
  "a key already on file is not treated as missing",
);

const previous = peekBootstrapResendKey();
setBootstrapResendKey("re_persisted_key");
assert(peekBootstrapResendKey() === "re_persisted_key", "bootstrap key is readable after save");
assert(process.env["RESEND_API_KEY"] === "re_persisted_key", "bootstrap key is copied onto process.env");
if (previous) setBootstrapResendKey(previous);
else delete process.env["RESEND_API_KEY"];

console.log("email.server.test.ts passed");
