import {
  DEFAULT_VAULT,
  INTEGRATION_VAULT_KEY,
  isApiPersistEnabled,
  readIntegrationVault,
  rememberResendKey,
  rememberedResendKey,
  restoreAllVaultKeys,
  restoreKeysFromVault,
  setApiPersistEnabled,
  vaultApiLast4,
  vaultResendLast4,
  vaultedResendKey,
  unwrapVaultApi,
  upsertVaultApi,
  upsertVaultNote,
  vaultAsIntegrationRows,
} from "./integration-vault";
import { encodeReusableSecret } from "./api-notepad";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const memory = new Map<string, string>();
const session = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    },
    sessionStorage: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => void session.set(key, value),
      removeItem: (key: string) => void session.delete(key),
    },
  },
  configurable: true,
});

assert(readIntegrationVault().persist === DEFAULT_VAULT.persist, "default persist is on");
assert(isApiPersistEnabled(), "setting defaults to save APIs");

const saved = upsertVaultApi({
  provider: "resend",
  apiKey: "re_test_key_m9EL",
  pin: "eterfaceid",
  last4: "m9EL",
});
assert(saved.apis[0]?.last4 === "m9EL", "resend last4 is stored");
assert(saved.apis[0]?.wrappedKey && !saved.apis[0].wrappedKey.includes("re_"), "raw key is not stored in the clear");
assert(saved.notes.some((note) => note.title === "Resend" && note.status === "live"), "resend notepad row is recorded");

upsertVaultApi({
  provider: "thekyb",
  apiKey: "kyb-secret-5289",
  pin: "eterfaceid",
  last4: "5289",
});
const restored = restoreKeysFromVault("eterfaceid");
assert(restored.resendKey === "re_test_key_m9EL", "resend key restores with the staff pin");
assert(restored.theKybKey === "kyb-secret-5289", "the kyb key restores with the staff pin");
assert(restoreKeysFromVault("wrong").resendKey !== "re_test_key_m9EL", "wrong pin does not restore the key");
assert(vaultedResendKey("wrong", "eterfaceid") === "re_test_key_m9EL", "vaulted key tries pins until one works");
assert(vaultedResendKey("wrong") === "re_test_key_m9EL", "saved keys unwrap with the stable wrap pin");
assert(vaultResendLast4() === "m9EL", "last4 stays on file");
assert(rememberedResendKey() === "re_test_key_m9EL", "remembered key comes from the vault");
assert(rememberResendKey("re_live_from_session") === "re_live_from_session", "live key is cached");
assert(rememberedResendKey("wrong") === "re_live_from_session", "session cache beats a bad pin");

upsertVaultApi({
  provider: "resend",
  apiKey: "re_wrapped_with_session_pin",
  pin: "session",
  last4: "pinX",
});
session.clear();
assert(vaultedResendKey("session") === "re_wrapped_with_session_pin", "legacy session wrap still unwraps");
assert(rememberedResendKey() === "re_wrapped_with_session_pin", "new saves also unwrap with the stable pin");

const rows = vaultAsIntegrationRows();
assert(rows.some((row) => row.provider === "resend" && row.enabled), "connected services lists resend");
assert(rows.some((row) => row.provider === "thekyb"), "connected services lists the kyb");

const plaidBlob = encodeReusableSecret({
  secret: "plaid-secret-kyc1",
  clientId: "client_plaid_aml",
  env: "production",
});
upsertVaultApi({
  provider: "plaid",
  apiKey: plaidBlob,
  pin: "eterfaceid",
  label: "Plaid",
  purpose: "Bank identity and transactions for KYC and AML",
});
assert(vaultApiLast4("Plaid") === "kyc1", "plaid last4 is the secret");
assert(unwrapVaultApi("plaid", "eterfaceid").includes("plaid-secret-kyc1"), "plaid key unwraps");
assert(restoreAllVaultKeys("eterfaceid").plaid?.includes("client_plaid_aml"), "all keys include plaid");
assert(
  readIntegrationVault().apis.some((row) => row.provider === "plaid" && row.category === "kyc"),
  "plaid is stored as a kyc api",
);
assert(
  vaultAsIntegrationRows().some((row) => row.provider === "plaid" && row.label === "Plaid"),
  "connected services lists plaid",
);

upsertVaultNote({
  id: "manual-1",
  title: "Plaid",
  purpose: "Bank",
  status: "keys_needed",
  notes: "Waiting on production keys",
});
assert(readIntegrationVault().notes.some((note) => note.title === "Plaid"), "manual notepad rows persist");

setApiPersistEnabled(false);
assert(!isApiPersistEnabled(), "setting can be turned off");
assert(restoreKeysFromVault("eterfaceid").resendKey === "", "off setting does not restore keys");
assert(memory.get(INTEGRATION_VAULT_KEY), "vault remains on disk when persist is off");

console.log("integration-vault.test.ts passed");
