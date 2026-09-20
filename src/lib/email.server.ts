import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { NOTIFICATION_EVENT_LIST, type NotificationEvent } from "@/lib/notification-events";

export const RESEND_PROVIDER = "resend";
export const DEFAULT_FROM_NAME = "eterfaceID";
export const VERIFIED_RESEND_DOMAIN = "verify.eterfaceid.com";
export const DEFAULT_FROM_ADDRESS = `info@${VERIFIED_RESEND_DOMAIN}`;

export function normalizeResendFromAddress(address?: string | null) {
  const raw = (address ?? "").trim() || DEFAULT_FROM_ADDRESS;
  const at = raw.lastIndexOf("@");
  if (at < 1) return DEFAULT_FROM_ADDRESS;
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1).toLowerCase();
  if (domain === "eterfaceid.com" || domain === "www.eterfaceid.com") {
    return `${local}@${VERIFIED_RESEND_DOMAIN}`;
  }
  return raw;
}

export const RESEND_API_URL = "https://api.resend.com/emails";
export const RESEND_GATEWAY_URL = "https://connector-gateway.lovable.dev/resend/emails";

export function formatSender(name?: string | null, address?: string | null) {
  const fromName = (name ?? "").trim() || DEFAULT_FROM_NAME;
  const fromAddress = normalizeResendFromAddress(address);
  return `${fromName} <${fromAddress}>`;
}

export function resendSendPlan(keys: { resendKey?: string | null; lovableKey?: string | null }) {
  const resendKey = keys.resendKey?.trim() ?? "";
  const lovableKey = keys.lovableKey?.trim() ?? "";
  if (resendKey.startsWith("re_")) {
    return {
      mode: "direct" as const,
      url: RESEND_API_URL,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
    };
  }
  if (resendKey && lovableKey) {
    return {
      mode: "gateway" as const,
      url: RESEND_GATEWAY_URL,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
    };
  }
  return { mode: "unconfigured" as const };
}

export function parseProviderError(status: number, body: string) {
  const trimmed = body.trim();
  try {
    const parsed = JSON.parse(trimmed) as { message?: string; name?: string };
    if (parsed.message) return `[${status}] ${parsed.message}`;
  } catch {
    /* keep raw body */
  }
  return `[${status}] ${trimmed || "provider error"}`.slice(0, 500);
}

type Admin = SupabaseClient<Database>;

export type { NotificationEvent };
export const NOTIFICATION_EVENTS = NOTIFICATION_EVENT_LIST;

function layout(title: string, bodyHtml: string, footer: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:'Helvetica Neue',Arial,sans-serif;color:#15171a">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e3e1dc">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #e3e1dc;font-size:17px;font-weight:700;letter-spacing:-0.01em">
          eterface<span style="color:#d4462a">ID</span>
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 14px;font-size:19px;line-height:1.3">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #e3e1dc;font-size:12px;color:#6b6f76">${footer}</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function p(text: string) {
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#33383e">${text}</p>`;
}

function button(href: string, label: string) {
  return `<p style="margin:20px 0"><a href="${href}" style="background:#15171a;color:#ffffff;text-decoration:none;padding:11px 20px;font-size:14px;display:inline-block">${label}</a></p>`;
}

export function renderTemplate(
  event: NotificationEvent,
  data: Record<string, string>,
): { subject: string; html: string } {
  const org = data["org"] ?? "your team";
  const footer =
    data["footer"] ??
    "Sent by the eterfaceID Security &amp; Compliance Team. Never share passwords, MFA codes, API secret keys or webhook secrets.";
  switch (event) {
    case "team.invite":
      return {
        subject: `You've been invited to join ${org} on eterfaceID`,
        html: layout(
          `Join ${org} on eterfaceID`,
          p(`Hello ${data["name"] ?? "there"},`) +
            p(
              `${data["inviter"] ?? "A colleague"} has invited you to join <strong>${org}</strong>'s eterfaceID organization.`,
            ) +
            p(`Your assigned role: <strong>${data["role"] ?? "Team member"}</strong>`) +
            p(`Your initial environment access: <strong>${data["environment"] ?? "Sandbox"}</strong>`) +
            p(
              "eterfaceID provides identity verification, KYC, KYB and AML compliance services through a secure dashboard and API.",
            ) +
            button(data["link"] ?? "#", "Accept Invitation") +
            p(`This invitation will expire in ${data["hours"] ?? "72"} hours.`) +
            p("If you did not expect this invitation, please contact your organization's administrator."),
          footer,
        ),
      };
    case "team.welcome":
      return {
        subject: `Welcome to eterfaceID`,
        html: layout(
          `Welcome to eterfaceID, ${data["name"] ?? "there"}`,
          p(`Your account for <strong>${org}</strong> has been successfully activated.`) +
            p(`Role: <strong>${data["role"] ?? "Team member"}</strong>`) +
            p(`Access: ${data["access"] ?? "Sandbox"}`) +
            button(data["link"] ?? "#", "Login to eterfaceID") +
            p("Security reminder: never share your password, MFA codes, API secret keys, or webhook secrets."),
          footer,
        ),
      };
    case "live.access_requested":
      return {
        subject: `Live API access requested at ${org}`,
        html: layout(
          "Live access request",
          p(`<strong>${data["name"] ?? "A teammate"}</strong> (${data["email"] ?? ""}) requested Live API access.`) +
            p(`Reason: ${data["reason"] ?? ""}`) +
            button(data["link"] ?? "#", "Review request"),
          footer,
        ),
      };
    case "live.access_approved":
      return {
        subject: `Live API access approved at ${org}`,
        html: layout(
          "Live API access approved",
          p(`Hello ${data["name"] ?? "there"}, your Live API access for <strong>${org}</strong> has been approved.`) +
            (data["note"] ? p(data["note"]) : "") +
            button(data["link"] ?? "#", "Open the developer dashboard"),
          footer,
        ),
      };
    case "live.access_rejected":
      return {
        subject: `Live API access was not approved at ${org}`,
        html: layout(
          "Live API access not approved",
          p(`Hello ${data["name"] ?? "there"}, a request for Live API access at <strong>${org}</strong> was declined.`) +
            (data["note"] ? p(data["note"]) : "") +
            p("Contact your organization administrator if you still need production access."),
          footer,
        ),
      };
    case "api_key.created":
    case "api_key.live_created":
      return {
        subject: `${data["environment"] === "live" ? "Live" : "Sandbox"} API key created at ${org}`,
        html: layout(
          "API key created",
          p(
            `A ${data["environment"] ?? "sandbox"} API key named <strong>${data["name"] ?? "API key"}</strong> was created for ${org}. The secret is shown only once in the console.`,
          ),
          footer,
        ),
      };
    case "api_key.revoked":
      return {
        subject: `API key revoked at ${org}`,
        html: layout("API key revoked", p(`An API key was revoked for <strong>${org}</strong>.`), footer),
      };
    case "org.invite_accepted":
      return {
        subject: `${data["name"] ?? "A teammate"} joined ${org} on eterfaceID`,
        html: layout(
          "Invitation accepted",
          p(
            `<strong>${data["name"] ?? "A teammate"}</strong> accepted an invitation to ${org} as ${data["role"] ?? "a team member"}.`,
          ),
          footer,
        ),
      };
    case "account.verify":
      return {
        subject: "Confirm your eterfaceID email",
        html: layout(
          "Confirm your email",
          p(`Hello ${data["name"] ?? "there"},`) +
            p("Confirm this email address to finish creating your eterfaceID account.") +
            button(data["link"] ?? "#", "Confirm email") +
            p("If you did not create an account, you can ignore this message."),
          footer,
        ),
      };
    case "account.password_reset":
      return {
        subject: "Reset your eterfaceID password",
        html: layout(
          "Reset your password",
          p(`Hello ${data["name"] ?? "there"},`) +
            p("Use the button below to choose a new password for your eterfaceID account.") +
            button(data["link"] ?? "#", "Reset password") +
            p("If you did not ask for a reset, you can ignore this message."),
          footer,
        ),
      };
    case "account.mfa_enabled":
      return {
        subject: "Multi-factor authentication is on",
        html: layout("MFA enabled", p("Multi-factor authentication is now protecting your eterfaceID account."), footer),
      };
    case "case.decision":
      return {
        subject: `Case ${data["reference"] ?? ""} ${data["decision"] ?? "updated"}`,
        html: layout(
          `Case ${data["reference"] ?? ""} was ${data["decision"] ?? "updated"}`,
          p(`Subject: <strong>${data["subject"] ?? ""}</strong>`) +
            (data["note"] ? p(`Reviewer note: ${data["note"]}`) : "") +
            button(data["link"] ?? "#", "Open the case"),
          footer,
        ),
      };
    case "alert.opened":
      return {
        subject: `New monitoring alert on ${data["reference"] ?? "a case"}`,
        html: layout(
          "A monitoring alert was opened",
          p(`${data["detail"] ?? "A change was detected on a monitored customer."}`) +
            button(data["link"] ?? "#", "Review the alert"),
          footer,
        ),
      };
    case "screening.hit":
      return {
        subject: `Possible screening match on ${data["reference"] ?? "a case"}`,
        html: layout(
          "Screening found a possible match",
          p(`${data["count"] ?? "1"} possible match(es) for <strong>${data["subject"] ?? ""}</strong> need a decision.`) +
            button(data["link"] ?? "#", "Review the matches"),
          footer,
        ),
      };
    case "report.filed":
      return {
        subject: `Report ${data["reportType"] ?? ""} marked as filed`,
        html: layout(
          "Report marked as filed",
          p(`${data["reportType"] ?? "The report"} for ${data["reference"] ?? "a case"} was filed with ${data["authority"] ?? "the authority"}.`) +
            (data["referenceNumber"] ? p(`Authority reference: <strong>${data["referenceNumber"]}</strong>`) : ""),
          footer,
        ),
      };
    default:
      return {
        subject: "eterfaceID test email",
        html: layout("Test email", p("Your email delivery is working."), footer),
      };
  }
}

async function senderIdentity(admin: Admin) {
  const { data } = await admin
    .from("app_settings")
    .select("email_from_name, email_from_address, legal_name, support_email")
    .limit(1)
    .maybeSingle();
  return {
    from: formatSender(data?.email_from_name || data?.legal_name, data?.email_from_address),
    replyTo: data?.support_email?.trim() || null,
  };
}

let bootstrapResendKey: string | null = null;

export function setBootstrapResendKey(apiKey: string) {
  bootstrapResendKey = apiKey.trim();
  process.env["RESEND_API_KEY"] = bootstrapResendKey;
}

export function peekBootstrapResendKey() {
  return bootstrapResendKey ?? process.env["RESEND_API_KEY"]?.trim() ?? null;
}

async function storedResendKey(admin: Admin) {
  const fromBootstrap = peekBootstrapResendKey();
  if (fromBootstrap) return fromBootstrap;
  try {
    const { data } = await admin
      .from("integration_secrets")
      .select("api_key")
      .eq("provider", RESEND_PROVIDER)
      .maybeSingle();
    return (data as { api_key?: string } | null)?.api_key?.trim() || null;
  } catch {
    return null;
  }
}

async function notificationEnabled(admin: Admin, orgId: string | null, event: NotificationEvent) {
  if (!orgId) return true;
  const { data } = await admin
    .from("notification_preferences")
    .select("enabled")
    .eq("org_id", orgId)
    .eq("event", event)
    .maybeSingle();
  return data ? data.enabled : true;
}

export type SendNotificationResult = { sent: boolean; reason?: string; detail?: string };

/** Sends one notification through Resend and records the outcome. Never throws. */
export async function sendNotification(
  admin: Admin,
  opts: {
    event: NotificationEvent;
    to: string | string[];
    orgId?: string | null;
    data?: Record<string, string>;
  },
): Promise<SendNotificationResult> {
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(Boolean);
  if (!recipients.length) return { sent: false, reason: "no_recipient" };

  const orgId = opts.orgId ?? null;
  if (!(await notificationEnabled(admin, orgId, opts.event))) {
    return { sent: false, reason: "disabled" };
  }

  const { data: integration } = await admin
    .from("integration_settings")
    .select("enabled")
    .eq("provider", RESEND_PROVIDER)
    .maybeSingle();
  if (integration && integration.enabled === false) return { sent: false, reason: "integration_off" };

  const { subject, html } = renderTemplate(opts.event, opts.data ?? {});
  const plan = resendSendPlan({
    resendKey: await storedResendKey(admin),
    lovableKey: process.env["LOVABLE_API_KEY"] ?? null,
  });

  if (plan.mode === "unconfigured") {
    await admin.from("email_log").insert(
      recipients.map((r) => ({
        org_id: orgId,
        event: opts.event,
        recipient: r,
        subject,
        status: "failed",
        error_detail: "Resend is not connected. Add a Resend API key in App admin → Integrations.",
      })),
    );
    return { sent: false, reason: "not_configured", detail: "Resend API key is missing" };
  }

  const { from, replyTo } = await senderIdentity(admin);
  let ok = true;
  let lastError: string | null = null;

  for (const recipient of recipients) {
    let status = "sent";
    let providerId: string | null = null;
    let errorDetail: string | null = null;
    try {
      const payload: Record<string, unknown> = { from, to: [recipient], subject, html };
      if (replyTo) payload["reply_to"] = replyTo;
      const res = await fetch(plan.url, {
        method: "POST",
        headers: plan.headers,
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      if (!res.ok) {
        status = "failed";
        ok = false;
        errorDetail = parseProviderError(res.status, raw);
        lastError = errorDetail;
      } else {
        const body = raw ? (JSON.parse(raw) as { id?: string }) : {};
        providerId = body.id ?? null;
      }
    } catch (err) {
      status = "failed";
      ok = false;
      errorDetail = err instanceof Error ? err.message : "send failed";
      lastError = errorDetail;
    }
    await admin.from("email_log").insert({
      org_id: orgId,
      event: opts.event,
      recipient,
      subject,
      status,
      provider_id: providerId,
      error_detail: errorDetail,
    });
  }

  await admin
    .from("integration_settings")
    .update({
      last_checked_at: new Date().toISOString(),
      status: ok ? "connected" : "error",
      last_error: ok ? null : lastError,
    } as never)
    .eq("provider", RESEND_PROVIDER);

  return ok ? { sent: true } : { sent: false, reason: "provider_error", ...(lastError ? { detail: lastError } : {}) };
}

/** Admin + analyst email addresses for an organization. */
export async function orgNotifyRecipients(admin: Admin, orgId: string) {
  const { data: members } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("org_id", orgId)
    .in("role", ["admin", "analyst"]);
  const ids = (members ?? []).map((m) => m.user_id);
  if (!ids.length) return [] as string[];
  const { data: profiles } = await admin.from("profiles").select("email").in("id", ids);
  return (profiles ?? []).map((p) => p.email).filter((e): e is string => Boolean(e));
}
