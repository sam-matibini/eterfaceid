export type AfterSignInPath = "/auth" | "/auth/mfa" | "/onboarding" | "/console";

export const NEW_SIGNUP_KEY = "eid_new_signup";
export const RETURNING_USER_KEY = "eid_returning_user";

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

export function markNewSignup() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(NEW_SIGNUP_KEY, "1");
  window.localStorage.removeItem(RETURNING_USER_KEY);
}

export function markReturningUser() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RETURNING_USER_KEY, "1");
  window.sessionStorage.removeItem(NEW_SIGNUP_KEY);
  window.sessionStorage.removeItem("eid_company");
}

export function isNewSignupSession() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(NEW_SIGNUP_KEY) === "1";
}

/** An account that already exists should never be sent through company setup again. */
export function isReturningAccount(user?: {
  created_at?: string | null;
  last_sign_in_at?: string | null;
} | null) {
  if (isNewSignupSession()) return false;
  if (typeof window !== "undefined" && window.localStorage.getItem(RETURNING_USER_KEY) === "1") return true;
  if (!user?.created_at) return false;
  const created = Date.parse(user.created_at);
  if (!Number.isFinite(created)) return false;
  const lastSignIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN;
  if (Number.isFinite(lastSignIn) && lastSignIn - created > 30_000) return true;
  return Date.now() - created > 10 * 60 * 1000;
}

export function pathAfterSignIn(input: {
  signedIn: boolean;
  mfaNeeded: boolean;
  hasOrganization: boolean;
  lookupFailed?: boolean;
  returning?: boolean;
  newSignup?: boolean;
}): AfterSignInPath {
  if (!input.signedIn) return "/auth";
  if (input.mfaNeeded) return "/auth/mfa";
  if (input.hasOrganization || input.lookupFailed) return "/console";
  if (input.returning && !input.newSignup) return "/console";
  return "/onboarding";
}

export async function mfaChallengeRequired() {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
