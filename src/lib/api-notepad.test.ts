import {
  applyCatalogFields,
  catalogFor,
  decodeReusableSecret,
  encodeReusableSecret,
  providerSlug,
  secretLast4,
} from "./api-notepad";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(providerSlug("Plaid") === "plaid", "plaid slug");
assert(providerSlug("The KYB") === "thekyb", "the kyb slug");
assert(providerSlug("Resend") === "resend", "resend slug");

assert(catalogFor("Plaid").needsClientId === true, "plaid needs client id");
assert(catalogFor("Plaid").purpose.includes("KYC"), "plaid is for kyc/aml");
assert(catalogFor("Custom Watchlist").needsClientId === false, "unknown apis are a single key");

const encoded = encodeReusableSecret({
  secret: "plaid-secret-5289",
  clientId: "id_1234abcd",
  env: "production",
});
assert(encoded.includes("plaid-secret-5289"), "secret is in the reusable blob");
const decoded = decodeReusableSecret(encoded);
assert(decoded.secret === "plaid-secret-5289", "secret round-trips");
assert(decoded.clientId === "id_1234abcd", "client id round-trips");
assert(decoded.env === "production", "environment round-trips");
assert(decodeReusableSecret("plain-key-m9EL").secret === "plain-key-m9EL", "plain secrets stay plain");
assert(secretLast4(encoded) === "5289", "last4 is the secret, not the json blob");

const swapped = applyCatalogFields("Plaid", {
  purpose: "Transactional email for invites, verification, password reset and alerts",
  notes: "Create a sending-access key at resend.com/api-keys.",
});
assert(swapped.purpose.includes("KYC"), "plaid replaces leftover resend purpose");
assert(swapped.notes.includes("dashboard.plaid.com"), "plaid replaces leftover resend notes");
assert(
  applyCatalogFields("Plaid", { purpose: "Custom AML vendor notes", notes: "keep me" }).purpose === "Custom AML vendor notes",
  "custom copy is kept",
);

console.log("api-notepad.test.ts passed");
