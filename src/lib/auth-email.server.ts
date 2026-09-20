/** Helpers for account verification and password-reset mail. Safe to unit-test. */

export function authConfirmUrl(origin: string, next?: string | null) {
  const base = `${origin.replace(/\/$/, "")}/auth/confirm`;
  if (!next) return base;
  const url = new URL(base);
  url.searchParams.set("next", next);
  return url.toString();
}

export function generateLinkTypes(event: "account.verify" | "account.password_reset") {
  return event === "account.verify" ? (["signup", "magiclink"] as const) : (["recovery"] as const);
}

export function verifyOtpType(generateType: string) {
  if (generateType === "recovery") return "recovery";
  if (generateType === "magiclink") return "magiclink";
  return "signup";
}

export function rewriteAuthActionLink(link: string, redirectTo: string) {
  try {
    const url = new URL(link);
    if (url.searchParams.has("redirect_to")) url.searchParams.set("redirect_to", redirectTo);
    return url.toString();
  } catch {
    return link;
  }
}

export function authLinkFromGenerate(
  properties: { action_link?: string | null; hashed_token?: string | null } | null | undefined,
  origin: string,
  generateType: string,
  next?: string | null,
) {
  const confirm = authConfirmUrl(origin, next);
  const action = properties?.action_link?.trim();
  if (action) return rewriteAuthActionLink(action, confirm);
  const hash = properties?.hashed_token?.trim();
  if (hash) {
    const url = new URL(confirm);
    url.searchParams.set("token_hash", hash);
    url.searchParams.set("type", verifyOtpType(generateType));
    return url.toString();
  }
  return null;
}
