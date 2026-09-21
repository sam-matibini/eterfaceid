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
}): AfterSignInPath {
  if (!input.signedIn) return "/auth";
  if (input.mfaNeeded) return "/auth/mfa";
  return input.hasOrganization ? "/console" : "/onboarding";
}

export async function resolveHasOrganization(userId: string) {
  const { supabase } = await import("@/integrations/supabase/client");
  const members = await supabase.from("organization_members").select("org_id").eq("user_id", userId).limit(1);
  if (members.data?.length) return true;
  const owned = await supabase.from("organizations").select("id").eq("created_by", userId).limit(1);
  return Boolean(owned.data?.length);
}

export async function continueSignedIn(options?: { skipMfa?: boolean }): Promise<AfterSignInPath> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return "/auth";
  if (!options?.skipMfa) {
    const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.data?.nextLevel === "aal2" && aal.data.currentLevel !== "aal2") return "/auth/mfa";
  }
  return pathAfterSignIn({
    signedIn: true,
    mfaNeeded: false,
    hasOrganization: await resolveHasOrganization(userId),
  });
}
