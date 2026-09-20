import {
  DEFAULT_VAULT,
  INTEGRATION_VAULT_KEY,
  isApiPersistEnabled,
  readIntegrationVault,
  restoreKeysFromVault,
  setApiPersistEnabled,
  vaultedResendKey,
  upsertVaultApi,
  upsertVaultNote,
  vaultAsIntegrationRows,
} from "./integration-vault";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
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
assert(vaultedResendKey("wrong") === "", "vaulted key stays empty when no pin matches");

const rows = vaultAsIntegrationRows();
assert(rows.some((row) => row.provider === "resend" && row.enabled), "connected services lists resend");
assert(rows.some((row) => row.provider === "thekyb"), "connected services lists the kyb");

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
