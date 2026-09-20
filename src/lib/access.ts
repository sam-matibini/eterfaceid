/** Coarse role used by existing org RLS (write vs read). */
export type AppRole = "admin" | "analyst" | "viewer";

/**
 * Named access role shown in the console. Permissions are attached to the
 * membership, not hard-coded to the job title — this is only the template.
 */
export type AccessRole = "owner" | "administrator" | "developer" | "compliance" | "analyst" | "viewer";

export type UserType = "employee" | "contractor" | "consultant";

export type EnvironmentCode = "sandbox" | "live";

export const INVITE_TTL_HOURS = 72;

export const PERMISSIONS = [
  { code: "docs.view", label: "API Documentation", group: "developers" },
  { code: "sandbox.api", label: "Sandbox API", group: "developers" },
  { code: "live.api", label: "Live API", group: "developers" },
  { code: "kyc.reports.view", label: "View KYC Reports", group: "compliance" },
  { code: "kyb.reports.view", label: "View KYB Reports", group: "compliance" },
  { code: "aml.results.view", label: "View AML Results", group: "compliance" },
  { code: "reports.download", label: "Download Reports", group: "compliance" },
  { code: "api_keys.create", label: "Create API Keys", group: "developers" },
  { code: "webhooks.manage", label: "Manage Webhooks", group: "developers" },
  { code: "api_logs.view", label: "View API Logs", group: "developers" },
  { code: "users.manage", label: "Manage Users", group: "organization" },
  { code: "roles.manage", label: "Manage Roles", group: "organization" },
  { code: "billing.manage", label: "Billing", group: "organization" },
  { code: "live.environment.manage", label: "Manage Live Environment", group: "organization" },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

export const ALL_PERMISSIONS: PermissionCode[] = PERMISSIONS.map((p) => p.code);

const DEVELOPER_DEFAULT: PermissionCode[] = [
  "docs.view",
  "sandbox.api",
  "api_keys.create",
  "webhooks.manage",
  "api_logs.view",
];

const COMPLIANCE_DEFAULT: PermissionCode[] = [
  "docs.view",
  "sandbox.api",
  "kyc.reports.view",
  "kyb.reports.view",
  "aml.results.view",
  "reports.download",
];

export const ROLE_PERMISSIONS: Record<AccessRole, PermissionCode[]> = {
  owner: [...ALL_PERMISSIONS],
  administrator: [...ALL_PERMISSIONS],
  developer: [...DEVELOPER_DEFAULT],
  compliance: [...COMPLIANCE_DEFAULT],
  analyst: [...COMPLIANCE_DEFAULT],
  viewer: ["docs.view"],
};

export const ACCESS_ROLES: { value: AccessRole; label: string; description: string }[] = [
  {
    value: "administrator",
    label: "Administrator",
    description: "Full organization control, including users, billing and live access.",
  },
  {
    value: "developer",
    label: "Developer",
    description: "API keys, webhooks and logs. Live access is never implied.",
  },
  {
    value: "compliance",
    label: "Compliance Administrator",
    description: "KYC, KYB and AML reviews, reports and case work.",
  },
  {
    value: "analyst",
    label: "Analyst",
    description: "Works cases and screening hits. Legacy compliance role.",
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "Read-only access to documentation and assigned reports.",
  },
];

export const USER_TYPES: { value: UserType; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "contractor", label: "Contractor" },
  { value: "consultant", label: "Consultant" },
];

export const INVITE_PERMISSION_OPTIONS: PermissionCode[] = [
  "kyc.reports.view",
  "kyb.reports.view",
  "aml.results.view",
  "api_keys.create",
  "api_logs.view",
  "users.manage",
  "billing.manage",
  "live.environment.manage",
];

export function mapAccessRoleToAppRole(role: AccessRole): AppRole {
  if (role === "owner" || role === "administrator") return "admin";
  if (role === "compliance" || role === "analyst") return "analyst";
  return "viewer";
}

export function defaultPermissions(role: AccessRole, extras: PermissionCode[] = []): PermissionCode[] {
  const set = new Set<PermissionCode>(ROLE_PERMISSIONS[role]);
  for (const extra of extras) set.add(extra);
  return ALL_PERMISSIONS.filter((code) => set.has(code));
}

export function hasPermission(
  membership: {
    role?: string | null;
    access_role?: string | null;
    permissions?: string[] | null;
    is_owner?: boolean | null;
    live_access?: boolean | null;
  } | null
  | undefined,
  code: PermissionCode,
) {
  if (!membership) return false;
  if (membership.is_owner) return true;
  const accessRole = (membership.access_role as AccessRole | undefined) ?? inferAccessRole(membership.role);
  if (accessRole === "owner" || accessRole === "administrator") return true;
  const granted = membership.permissions?.length
    ? membership.permissions
    : ROLE_PERMISSIONS[accessRole] ?? [];
  return granted.includes(code);
}

export function inferAccessRole(appRole: string | null | undefined): AccessRole {
  if (appRole === "admin") return "administrator";
  if (appRole === "analyst") return "analyst";
  if (appRole === "developer") return "developer";
  if (appRole === "compliance") return "compliance";
  if (appRole === "owner") return "owner";
  return "viewer";
}

export function displayRole(role: string | null | undefined, accessRole?: string | null, isOwner?: boolean | null) {
  if (isOwner) return "Organization Owner";
  const value = (accessRole as AccessRole | undefined) ?? inferAccessRole(role);
  return ACCESS_ROLES.find((r) => r.value === value)?.label ?? value;
}

export function mfaRequiredFor(membership: {
  is_owner?: boolean | null | undefined;
  access_role?: string | null | undefined;
  role?: string | null | undefined;
  live_access?: boolean | null | undefined;
  mfa_required?: boolean | null | undefined;
} | null) {
  if (!membership) return false;
  if (membership.mfa_required) return true;
  if (membership.is_owner) return true;
  const access = (membership.access_role as AccessRole | undefined) ?? inferAccessRole(membership.role);
  if (access === "owner" || access === "administrator" || access === "compliance") return true;
  if (access === "developer" && membership.live_access) return true;
  return false;
}

export function canUseEnvironment(
  membership: { sandbox_access?: boolean | null | undefined; live_access?: boolean | null | undefined } | null,
  environment: EnvironmentCode,
) {
  if (!membership) return false;
  if (environment === "sandbox") return membership.sandbox_access !== false;
  return Boolean(membership.live_access);
}

export function invitationExpiryIso(from = new Date(), hours = INVITE_TTL_HOURS) {
  return new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function invitationExpired(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < now;
}

export function environmentLabel(code: EnvironmentCode) {
  return code === "live" ? "Live" : "Sandbox";
}

export function secretKeyPrefix(environment: EnvironmentCode) {
  return environment === "live" ? "ef_live_secret_" : "ef_test_secret_";
}

export function publishableKeyPrefix(environment: EnvironmentCode) {
  return environment === "live" ? "ef_live_" : "ef_test_";
}

export function webhookSecretPrefix(environment: EnvironmentCode) {
  return environment === "live" ? "whsec_live_" : "whsec_test_";
}

export function isSecretApiKey(token: string) {
  return (
    token.startsWith("eid_test_") ||
    token.startsWith("eid_live_") ||
    token.startsWith("ef_test_secret_") ||
    token.startsWith("ef_live_secret_")
  );
}

export function isPublishableApiKey(token: string) {
  return (
    (token.startsWith("ef_test_") && !token.startsWith("ef_test_secret_")) ||
    (token.startsWith("ef_live_") && !token.startsWith("ef_live_secret_"))
  );
}

export type PermissionMatrixMark = "yes" | "no" | "optional";

/** Spec matrix used by the Roles page and unit tests. */
export const PERMISSION_MATRIX: {
  permission: PermissionCode;
  developer: PermissionMatrixMark;
  compliance: PermissionMatrixMark;
  admin: PermissionMatrixMark;
}[] = [
  { permission: "docs.view", developer: "yes", compliance: "yes", admin: "yes" },
  { permission: "sandbox.api", developer: "yes", compliance: "yes", admin: "yes" },
  { permission: "live.api", developer: "optional", compliance: "optional", admin: "yes" },
  { permission: "kyc.reports.view", developer: "optional", compliance: "yes", admin: "yes" },
  { permission: "kyb.reports.view", developer: "optional", compliance: "yes", admin: "yes" },
  { permission: "aml.results.view", developer: "optional", compliance: "yes", admin: "yes" },
  { permission: "reports.download", developer: "optional", compliance: "yes", admin: "yes" },
  { permission: "api_keys.create", developer: "yes", compliance: "optional", admin: "yes" },
  { permission: "webhooks.manage", developer: "yes", compliance: "optional", admin: "yes" },
  { permission: "api_logs.view", developer: "yes", compliance: "optional", admin: "yes" },
  { permission: "users.manage", developer: "no", compliance: "no", admin: "yes" },
  { permission: "roles.manage", developer: "no", compliance: "no", admin: "yes" },
  { permission: "billing.manage", developer: "no", compliance: "no", admin: "yes" },
];

export function matrixSatisfied(role: "developer" | "compliance" | "administrator", code: PermissionCode) {
  const row = PERMISSION_MATRIX.find((r) => r.permission === code);
  if (!row) return false;
  const mark = role === "administrator" ? row.admin : role === "developer" ? row.developer : row.compliance;
  const granted = ROLE_PERMISSIONS[role === "administrator" ? "administrator" : role];
  if (mark === "yes") return granted.includes(code);
  if (mark === "no") return !granted.includes(code);
  return true;
}
