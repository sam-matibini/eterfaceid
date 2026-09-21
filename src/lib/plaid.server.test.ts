import { decodeReusableSecret, encodeReusableSecret } from "./api-notepad";
import {
  peekBootstrapPlaidCredentials,
  plaidConfigured,
  plaidEnvironment,
  setBootstrapPlaidCredentials,
} from "./plaid.server";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

delete process.env["PLAID_CLIENT_ID"];
delete process.env["PLAID_SECRET"];
delete process.env["PLAID_ENV"];

setBootstrapPlaidCredentials({
  secret: "plaid-secret-kyc1",
  clientId: "id_client_aml",
  env: "production",
});

assert((await plaidConfigured()) === true, "bootstrap marks plaid configured");
assert(plaidEnvironment() === "production", "production env is stored");
assert(peekBootstrapPlaidCredentials()?.secret === "plaid-secret-kyc1", "secret is in memory");
assert(peekBootstrapPlaidCredentials()?.clientId === "id_client_aml", "client id is in memory");
assert(process.env["PLAID_CLIENT_ID"] === "id_client_aml", "client id is on process.env");

const blob = encodeReusableSecret({
  secret: "sandbox-secret-zz99",
  clientId: "sandbox-client",
  env: "sandbox",
});
setBootstrapPlaidCredentials(decodeReusableSecret(blob));
assert(plaidEnvironment() === "sandbox", "sandbox env round-trips from notepad blob");
assert((await plaidConfigured()) === true, "sandbox credentials still count as configured");

console.log("plaid.server.test.ts passed");
