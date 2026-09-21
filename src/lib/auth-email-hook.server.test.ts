import { hookConfirmOrigin, parseAuthEmailHook } from "./auth-email-hook.server";
import { confirmUrlFromAuthHook } from "./auth-email.server";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(parseAuthEmailHook(null) === null, "empty body is rejected");
assert(parseAuthEmailHook({ user: {} }) === null, "missing email is rejected");

const parsed = parseAuthEmailHook({
  user: { email: "sam@efin.money" },
  email_data: {
    token_hash: "abc123",
    email_action_type: "signup",
    redirect_to: "https://app.eterfaceid.com/auth/confirm?next=/console",
    site_url: "https://app.eterfaceid.com",
  },
});
assert(parsed?.email === "sam@efin.money", "hook reads the recipient");
assert(parsed?.event === "account.verify", "signup hook uses the verify template");

const reset = parseAuthEmailHook({
  user: { email: "sam@efin.money" },
  email_data: { token_hash: "reset-hash", email_action_type: "recovery" },
});
assert(reset?.event === "account.password_reset", "recovery hook uses the reset template");

assert(
  hookConfirmOrigin("https://worker.example/api/hooks/auth-email", {
    redirect_to: "https://app.eterfaceid.com/auth/confirm",
  }) === "https://app.eterfaceid.com",
  "hook origin prefers redirect_to",
);

const link = confirmUrlFromAuthHook("https://app.eterfaceid.com", parsed!.emailData);
assert(link.includes("/auth/confirm"), "hook mail lands on the app confirm page");
assert(link.includes("token_hash=abc123"), "hook mail includes the Auth token");

console.log("auth-email-hook.server.test.ts passed");
