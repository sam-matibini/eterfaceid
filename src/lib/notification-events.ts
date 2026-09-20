export const NOTIFICATION_EVENT_LIST = [
  { event: "team.invite", label: "User invitation", description: "Invitation to join your organization.", group: "account" },
  { event: "team.welcome", label: "Welcome email", description: "Sent when an account is activated.", group: "account" },
  { event: "account.password_reset", label: "Password reset", description: "Password reset instructions.", group: "account" },
  { event: "account.password_changed", label: "Password changed", description: "Confirmation that a password was changed.", group: "account" },
  { event: "account.mfa_enabled", label: "MFA enabled", description: "When multi-factor authentication is turned on.", group: "account" },
  { event: "account.mfa_changed", label: "MFA changed", description: "When an MFA method is added or removed.", group: "account" },
  { event: "account.locked", label: "Account locked", description: "When an account is locked after failed attempts.", group: "account" },
  { event: "account.deactivated", label: "Account deactivated", description: "When an account is deactivated.", group: "account" },
  { event: "org.user_added", label: "New user added", description: "Administrators are told when a teammate is invited.", group: "organization" },
  { event: "org.invite_accepted", label: "Invitation accepted", description: "Administrators are told when an invitation is accepted.", group: "organization" },
  { event: "org.user_removed", label: "User removed", description: "When a teammate is removed from the organization.", group: "organization" },
  { event: "org.role_changed", label: "Role changed", description: "When a teammate's role or permissions change.", group: "organization" },
  { event: "live.access_requested", label: "Live access requested", description: "A developer asked for Live API access.", group: "organization" },
  { event: "live.access_approved", label: "Live access approved", description: "Live API access was granted.", group: "organization" },
  { event: "live.access_rejected", label: "Live access rejected", description: "Live API access was declined.", group: "organization" },
  { event: "api_key.created", label: "API key created", description: "A sandbox or live API key was created.", group: "organization" },
  { event: "api_key.live_created", label: "Live API key created", description: "A production secret key was issued.", group: "security" },
  { event: "api_key.revoked", label: "API key revoked", description: "An API key was revoked.", group: "organization" },
  { event: "security.new_login", label: "New login", description: "A successful sign-in from a new session.", group: "security" },
  { event: "security.new_device", label: "New device", description: "A sign-in from an unrecognized device.", group: "security" },
  { event: "security.suspicious_login", label: "Suspicious login", description: "A sign-in that looks unusual.", group: "security" },
  { event: "security.mfa_failure", label: "MFA failure", description: "A failed multi-factor authentication attempt.", group: "security" },
  { event: "case.decision", label: "Case decisions", description: "When a case is approved or rejected.", group: "compliance" },
  { event: "alert.opened", label: "Monitoring alerts", description: "When a new monitoring alert opens.", group: "compliance" },
  { event: "screening.hit", label: "New screening matches", description: "When screening finds a possible match.", group: "compliance" },
  { event: "report.filed", label: "Report filed", description: "Confirmation once a report is marked as filed.", group: "compliance" },
  { event: "kyc.completed", label: "KYC completed", description: "A person verification finished successfully.", group: "compliance" },
  { event: "kyc.failed", label: "KYC failed", description: "A person verification failed.", group: "compliance" },
  { event: "kyb.completed", label: "KYB completed", description: "A business verification finished.", group: "compliance" },
  { event: "aml.alert", label: "AML alert", description: "A sanctions, PEP or adverse-media alert.", group: "compliance" },
  { event: "case.assigned", label: "Case assigned", description: "A case was assigned to a reviewer.", group: "compliance" },
  { event: "case.escalated", label: "Case escalated", description: "A case was escalated.", group: "compliance" },
  { event: "report.available", label: "Report available", description: "A compliance report is ready to download.", group: "compliance" },
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENT_LIST)[number]["event"] | "test";

export const NOTIFICATION_EVENTS: Record<string, string> = Object.fromEntries(
  NOTIFICATION_EVENT_LIST.map((e) => [e.event, e.label]),
);
NOTIFICATION_EVENTS["test"] = "Test message";
