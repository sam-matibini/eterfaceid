import {
  canUseEnvironment,
  defaultPermissions,
  hasPermission,
  invitationExpired,
  invitationExpiryIso,
  INVITE_TTL_HOURS,
  isPublishableApiKey,
  isSecretApiKey,
  mapAccessRoleToAppRole,
  matrixSatisfied,
  mfaRequiredFor,
  PERMISSION_MATRIX,
  publishableKeyPrefix,
  secretKeyPrefix,
  webhookSecretPrefix,
} from "./access";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(mapAccessRoleToAppRole("owner") === "admin", "owner maps to admin");
assert(mapAccessRoleToAppRole("administrator") === "admin", "administrator maps to admin");
assert(mapAccessRoleToAppRole("developer") === "viewer", "developer is not a case writer");
assert(mapAccessRoleToAppRole("compliance") === "analyst", "compliance can work cases");
assert(mapAccessRoleToAppRole("viewer") === "viewer", "viewer stays viewer");

assert(!defaultPermissions("developer").includes("live.api"), "developer template does not include live API");
assert(!defaultPermissions("developer").includes("users.manage"), "developer cannot manage users");
assert(defaultPermissions("developer").includes("api_keys.create"), "developer can create API keys");
assert(defaultPermissions("compliance").includes("kyc.reports.view"), "compliance sees KYC reports");
assert(!defaultPermissions("compliance").includes("billing.manage"), "compliance cannot manage billing");
assert(defaultPermissions("administrator").includes("live.api"), "admin has live API");

assert(
  !hasPermission({ access_role: "developer", permissions: defaultPermissions("developer"), live_access: false }, "live.api"),
  "live API is not implied by the developer role",
);
assert(
  hasPermission(
    { access_role: "developer", permissions: defaultPermissions("developer", ["kyc.reports.view"]) },
    "kyc.reports.view",
  ),
  "granular extras are honoured",
);
assert(hasPermission({ is_owner: true, access_role: "owner" }, "billing.manage"), "owner has every permission");

assert(canUseEnvironment({ sandbox_access: true, live_access: false }, "sandbox"), "sandbox is available");
assert(!canUseEnvironment({ sandbox_access: true, live_access: false }, "live"), "live requires explicit grant");
assert(canUseEnvironment({ sandbox_access: true, live_access: true }, "live"), "explicit live grant works");

assert(mfaRequiredFor({ is_owner: true }), "owner must use MFA");
assert(mfaRequiredFor({ access_role: "administrator" }), "admin must use MFA");
assert(mfaRequiredFor({ access_role: "compliance" }), "compliance must use MFA");
assert(mfaRequiredFor({ access_role: "developer", live_access: true }), "developer with live access must use MFA");
assert(!mfaRequiredFor({ access_role: "developer", live_access: false }), "sandbox-only developer MFA is optional");
assert(!mfaRequiredFor({ access_role: "viewer" }), "viewer MFA is optional");

assert(INVITE_TTL_HOURS === 72, "invitations expire in 72 hours");
const expiry = invitationExpiryIso(new Date("2026-09-20T12:00:00.000Z"));
assert(expiry === "2026-09-23T12:00:00.000Z", `72h expiry, got ${expiry}`);
assert(invitationExpired("2026-09-20T11:00:00.000Z", Date.parse("2026-09-20T12:00:00.000Z")), "past invites are expired");
assert(!invitationExpired("2026-09-20T13:00:00.000Z", Date.parse("2026-09-20T12:00:00.000Z")), "future invites are valid");

assert(secretKeyPrefix("sandbox") === "ef_test_secret_", "sandbox secret prefix");
assert(secretKeyPrefix("live") === "ef_live_secret_", "live secret prefix");
assert(publishableKeyPrefix("sandbox") === "ef_test_", "sandbox publishable prefix");
assert(webhookSecretPrefix("live") === "whsec_live_", "live webhook prefix");
assert(isSecretApiKey("ef_test_secret_abc"), "new secret keys are recognised");
assert(isSecretApiKey("eid_live_abc"), "legacy live keys are still recognised");
assert(!isSecretApiKey("ef_test_pk_abc"), "publishable keys are not secrets");
assert(isPublishableApiKey("ef_test_pk_abc"), "publishable test keys");
assert(!isPublishableApiKey("ef_test_secret_abc"), "secrets are not publishable");

for (const row of PERMISSION_MATRIX) {
  assert(matrixSatisfied("developer", row.permission), `developer default matches matrix for ${row.permission}`);
  assert(matrixSatisfied("compliance", row.permission), `compliance default matches matrix for ${row.permission}`);
  assert(matrixSatisfied("administrator", row.permission), `admin default matches matrix for ${row.permission}`);
}

console.log("access.test.ts passed");
