import { authActionToEvent, confirmUrlFromAuthHook } from "@/lib/auth-email.server";

export type AuthEmailHookPayload = {
  user?: { email?: string | null; user_metadata?: { full_name?: string; name?: string } | null };
  email_data?: {
    token?: string | null;
    token_hash?: string | null;
    redirect_to?: string | null;
    email_action_type?: string | null;
    site_url?: string | null;
  };
};

export function parseAuthEmailHook(body: unknown): {
  email: string;
  event: "account.verify" | "account.password_reset";
  emailData: NonNullable<AuthEmailHookPayload["email_data"]>;
} | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as AuthEmailHookPayload;
  const email = payload.user?.email?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) return null;
  const emailData = payload.email_data ?? {};
  return {
    email,
    event: authActionToEvent(emailData.email_action_type),
    emailData,
  };
}

export function hookConfirmOrigin(requestUrl: string, emailData: { site_url?: string | null; redirect_to?: string | null }) {
  const redirect = emailData.redirect_to?.trim();
  if (redirect) {
    try {
      return new URL(redirect).origin;
    } catch {
      /* fall through */
    }
  }
  const site = emailData.site_url?.trim();
  if (site) {
    try {
      return new URL(site).origin;
    } catch {
      /* fall through */
    }
  }
  return new URL(requestUrl).origin;
}

export async function deliverAuthHookEmail(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false as const, status: 400, error: "invalid json" };
  }
  const parsed = parseAuthEmailHook(body);
  if (!parsed) return { ok: false as const, status: 400, error: "missing email" };

  const origin = hookConfirmOrigin(request.url, parsed.emailData);
  const link = confirmUrlFromAuthHook(origin, parsed.emailData);
  if (!parsed.emailData.token_hash && !parsed.emailData.token) {
    return { ok: false as const, status: 400, error: "missing auth token" };
  }

  const { sendAuthEmailViaResend } = await import("@/lib/auth-email-delivery.server");
  const mailed = await sendAuthEmailViaResend(parsed.event, parsed.email, link);
  if (!mailed.sent) {
    return { ok: false as const, status: mailed.reason === "not_configured" ? 503 : 502, error: mailed.detail };
  }
  return { ok: true as const, status: 200 };
}
