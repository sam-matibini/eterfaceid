import {
  DEFAULT_STAFF_BYPASS_PIN,
  PIN_ATTEMPT_MAX,
  STAFF_BYPASS_EMAIL,
  STAFF_BYPASS_HASH,
  STAFF_BYPASS_PATH,
  staffPinUnlocks,
} from "./staff-bypass";
import { applyWorkerEnv, FALLBACK_SUPABASE_URL } from "./staff-bypass";
import {
  clearPinAttempts,
  configuredStaffBypassPin,
  consumePinAttempt,
  extractStaffSessionToken,
  pinsMatch,
  resetPinAttemptsForTests,
  resolveSupabaseAdminCredentials,
} from "./staff-bypass.server";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(STAFF_BYPASS_EMAIL === "ops@eterfaceid.com", "bootstrap email");
assert(STAFF_BYPASS_PATH === "/admin/integrations", "lands on integrations");
assert(STAFF_BYPASS_HASH === "notepad", "opens the API notepad");
assert(DEFAULT_STAFF_BYPASS_PIN === "eterfaceid", "bootstrap pin");
assert(staffPinUnlocks("eterfaceid"), "default pin unlocks without Supabase");
assert(!staffPinUnlocks("wrong"), "wrong pin does not unlock");

assert(FALLBACK_SUPABASE_URL.includes("supabase.co"), "public supabase url fallback");

const fromVite = resolveSupabaseAdminCredentials({
  VITE_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
});
assert(fromVite.url === "https://example.supabase.co", "falls back to VITE_SUPABASE_URL");
assert(fromVite.serviceRole === "service-role", "reads service role");
assert(resolveSupabaseAdminCredentials({}).serviceRole === null, "missing service role is null");
assert(resolveSupabaseAdminCredentials({}).url === null, "missing url is null");

const previousUrl = process.env["TEST_WORKER_BIND"];
applyWorkerEnv({ TEST_WORKER_BIND: "bound-value", skip: 1 });
assert(process.env["TEST_WORKER_BIND"] === "bound-value", "worker bindings copy onto process.env");
if (previousUrl === undefined) delete process.env["TEST_WORKER_BIND"];

assert(configuredStaffBypassPin({}) === DEFAULT_STAFF_BYPASS_PIN, "default pin when unset");
assert(configuredStaffBypassPin({ STAFF_BYPASS_PIN: "  secret-pin  " }) === "secret-pin", "env pin wins");
assert(configuredStaffBypassPin({ STAFF_BYPASS_PIN: "off" }) === null, "off disables bypass");
assert(configuredStaffBypassPin({ STAFF_BYPASS_PIN: "disabled" }) === null, "disabled disables bypass");

assert(pinsMatch("eterfaceid", "eterfaceid"), "matching pins");
assert(!pinsMatch("eterfaceid", "wrong"), "wrong pin is rejected");
assert(!pinsMatch("eterfaceid", "eterfaceID"), "pin compare is case-sensitive");
assert(!pinsMatch("", DEFAULT_STAFF_BYPASS_PIN), "empty pin is rejected");

assert(extractStaffSessionToken({ hashed_token: "abc123" }) === "abc123", "hashed_token is preferred");
assert(
  extractStaffSessionToken({
    action_link: "https://example.supabase.co/auth/v1/verify?token=link-token&type=magiclink",
  }) === "link-token",
  "token is parsed from the action link",
);
assert(
  extractStaffSessionToken({
    hashed_token: "  hashed  ",
    action_link: "https://example.supabase.co/auth/v1/verify?token=ignored",
  }) === "hashed",
  "hashed_token beats the action link",
);
assert(extractStaffSessionToken(null) === null, "missing properties");
assert(extractStaffSessionToken({ action_link: "not-a-url" }) === null, "invalid action link");

resetPinAttemptsForTests();
const first = consumePinAttempt("test-ip", 1_000);
assert(first.allowed && first.remaining === PIN_ATTEMPT_MAX - 1, "first attempt is allowed");
for (let i = 0; i < PIN_ATTEMPT_MAX - 1; i += 1) {
  assert(consumePinAttempt("test-ip", 1_000).allowed, `attempt ${i + 2} still allowed`);
}
const locked = consumePinAttempt("test-ip", 1_000);
assert(!locked.allowed && locked.remaining === 0, "too many attempts lock the pin");
assert(consumePinAttempt("other-ip", 1_000).allowed, "lock is per key");
clearPinAttempts("test-ip");
assert(consumePinAttempt("test-ip", 1_000).allowed, "clearing unlocks the pin");

console.log("staff-bypass.test.ts passed");
