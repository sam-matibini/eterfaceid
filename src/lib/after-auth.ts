export type AfterSignInPath = "/auth/mfa" | "/onboarding" | "/console";

export function authCallbackUrl(origin: string) {
  return `${origin.trim().replace(/\/$/, "")}/auth`;
}

export function isAuthCallbackLocation(search: string, hash: string) {
  const combined = `${search} ${hash}`;
  if (/[?&]code=/.test(search)) return true;
  return /access_token=|refresh_token=|type=(signup|magiclink|recovery|invite|email)/i.test(combined);
}

export function pathAfterSignIn(input: { mfaNeeded: boolean; hasOrganization: boolean }): AfterSignInPath {
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
  if (!options?.skipMfa) {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") return "/auth/mfa";
  }
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return "/onboarding";
  return pathAfterSignIn({
    mfaNeeded: false,
    hasOrganization: await resolveHasOrganization(userId),
  });
}
