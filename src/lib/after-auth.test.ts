import { authCallbackUrl, isAuthCallbackLocation, pathAfterSignIn } from "./after-auth";

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

assert(pathAfterSignIn({ mfaNeeded: true, hasOrganization: false }) === "/auth/mfa", "MFA first");
assert(pathAfterSignIn({ mfaNeeded: false, hasOrganization: false }) === "/onboarding", "new company goes to KYB");
assert(pathAfterSignIn({ mfaNeeded: false, hasOrganization: true }) === "/console", "existing company goes to console");

console.log("after-auth.test.ts passed");
