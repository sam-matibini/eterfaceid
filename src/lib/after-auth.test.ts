import {
  authCallbackUrl,
  isAuthCallbackLocation,
  pathAfterSignIn,
  shouldResumeAuthSession,
} from "./after-auth";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(authCallbackUrl("https://eterfaceid.com") === "https://eterfaceid.com/auth", "origin becomes /auth");
assert(authCallbackUrl("https://eterfaceid.com/") === "https://eterfaceid.com/auth", "trailing slash is stripped");
assert(authCallbackUrl("http://localhost:8080") === "http://localhost:8080/auth", "local origin");

assert(isAuthCallbackLocation("", "#access_token=abc&type=signup"), "hash signup is an auth callback");
assert(isAuthCallbackLocation("", "#access_token=abc&type=magiclink"), "magic link is an auth callback");
assert(isAuthCallbackLocation("?code=pkce", ""), "pkce code is an auth callback");
assert(!isAuthCallbackLocation("", ""), "plain homepage is not an auth callback");
assert(!isAuthCallbackLocation("?utm=home", "#films"), "marketing query is not an auth callback");

assert(
  shouldResumeAuthSession({ search: "", hash: "", submitted: false }) === false,
  "plain Sign in does not skip the form",
);
assert(shouldResumeAuthSession({ search: "", hash: "", submitted: true }) === true, "submitted credentials continue");
assert(
  shouldResumeAuthSession({ search: "", hash: "#access_token=abc&type=signup", submitted: false }) === true,
  "email confirmation continues",
);

assert(pathAfterSignIn({ signedIn: false, mfaNeeded: false, hasOrganization: false }) === "/auth", "signed out stays on login");
assert(pathAfterSignIn({ signedIn: true, mfaNeeded: true, hasOrganization: false }) === "/auth/mfa", "MFA first");
assert(
  pathAfterSignIn({ signedIn: true, mfaNeeded: false, hasOrganization: false }) === "/onboarding",
  "new company goes to KYB after login",
);
assert(
  pathAfterSignIn({ signedIn: true, mfaNeeded: false, hasOrganization: true }) === "/console",
  "existing company goes to console",
);
assert(
  pathAfterSignIn({ signedIn: true, mfaNeeded: false, hasOrganization: false, lookupFailed: true }) === "/console",
  "a failed workspace lookup does not open company setup",
);

console.log("after-auth.test.ts passed");
