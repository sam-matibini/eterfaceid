export type AfterSignInPath = "/auth" | "/auth/mfa" | "/onboarding" | "/console";

export function authCallbackUrl(origin: string) {
  return `${origin.trim().replace(/\/$/, "")}/auth`;
}

export function isAuthCallbackLocation(search: string, hash: string) {
  const combined = `${search} ${hash}`;
  if (/[?&]code=/.test(search)) return true;
  return /access_token=|refresh_token=|type=(signup|magiclink|recovery|invite|email)/i.test(combined);
}

/** Login/signup stays on /auth until the user submits credentials or returns from an email link. */
export function shouldResumeAuthSession(input: { search: string; hash: string; submitted: boolean }) {
  return input.submitted || isAuthCallbackLocation(input.search, input.hash);
}

export function pathAfterSignIn(input: {
  signedIn: boolean;
  mfaNeeded: boolean;
  hasOrganization: boolean;
  lookupFailed?: boolean;
}): AfterSignInPath {
  if (!input.signedIn) return "/auth";
  if (input.mfaNeeded) return "/auth/mfa";
  if (input.hasOrganization || input.lookupFailed) return "/console";
  return "/onboarding";
}

export async function mfaChallengeRequired() {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
