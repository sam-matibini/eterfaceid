import {
  authActionToEvent,
  authConfirmEidUrl,
  authConfirmUrl,
  authLinkFromGenerate,
  confirmUrlFromAuthHook,
  generateLinkTypes,
  isAuthEmailAlreadySent,
  rewriteAuthActionLink,
  verifyOtpType,
} from "./auth-email.server";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(isAuthEmailAlreadySent({ sent: true }), "sent is already sent");
assert(!isAuthEmailAlreadySent({ sent: false, reason: "rate_limited" }), "rate_limited is not treated as sent");
assert(
  !isAuthEmailAlreadySent({
    sent: false,
    reason: "provider_error",
    detail: "For security purposes, you can only request this after 59 seconds.",
  }),
  "supabase cooldown is not treated as sent",
);
assert(!isAuthEmailAlreadySent({ sent: false, reason: "not_configured" }), "missing resend is not already sent");

assert(authConfirmUrl("https://eterfaceid.com") === "https://eterfaceid.com/auth/confirm", "confirm url");
assert(
  authConfirmUrl("https://eterfaceid.com/", "/console") === "https://eterfaceid.com/auth/confirm?next=%2Fconsole",
  "confirm url keeps next",
);

assert(generateLinkTypes("account.verify")[0] === "signup", "verify uses signup links first");
assert(generateLinkTypes("account.password_reset")[0] === "recovery", "reset uses recovery links");
assert(verifyOtpType("signup") === "signup", "otp type signup");
assert(verifyOtpType("recovery") === "recovery", "otp type recovery");

const rewritten = rewriteAuthActionLink(
  "https://euuexozkxjuvyuikevrx.supabase.co/auth/v1/verify?token=abc&type=signup&redirect_to=https://old.example",
  "https://eterfaceid.com/auth/confirm",
);
assert(rewritten.includes("redirect_to=https%3A%2F%2Feterfaceid.com%2Fauth%2Fconfirm"), "redirect is rewritten");

const fromHash = authLinkFromGenerate(
  { hashed_token: "tok123" },
  "https://eterfaceid.com",
  "signup",
);
assert(fromHash?.includes("token_hash=tok123"), "hashed token becomes a confirm url");
assert(fromHash?.includes("/auth/confirm"), "hashed token lands on confirm");

assert(
  authLinkFromGenerate(null, "https://eterfaceid.com", "signup") === null,
  "missing generateLink properties are not treated as sent",
);

assert(authActionToEvent("signup") === "account.verify", "signup maps to verify");
assert(authActionToEvent("recovery") === "account.password_reset", "recovery maps to reset");

const hookUrl = confirmUrlFromAuthHook("https://eterfaceid.com", {
  token_hash: "hook-hash",
  email_action_type: "signup",
  redirect_to: "https://eterfaceid.com/auth/confirm?next=/console",
});
assert(hookUrl.includes("token_hash=hook-hash"), "hook confirm keeps the auth token");
assert(hookUrl.includes("type=signup"), "hook confirm keeps the action type");
assert(hookUrl.includes("next=%2Fauth%2Fconfirm"), "hook confirm keeps the app path");

const eidUrl = authConfirmEidUrl("https://eterfaceid.com", "signed.token", "/console");
assert(eidUrl.includes("eid=signed.token"), "signed token is on the confirm url");
assert(eidUrl.includes("next=%2Fconsole"), "signed token keeps next");

console.log("auth-email.server.test.ts passed");
