import {
  authConfirmUrl,
  authLinkFromGenerate,
  generateLinkTypes,
  rewriteAuthActionLink,
  verifyOtpType,
} from "./auth-email.server";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

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

console.log("auth-email.server.test.ts passed");
