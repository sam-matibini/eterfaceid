import {
  FALLBACK_SUPABASE_PUBLISHABLE_KEY,
  FALLBACK_SUPABASE_URL,
  SUPABASE_PROJECT,
  supabaseAccessKey,
  supabaseRestUrl,
} from "./supabase-project";
import { ensurePublicSupabaseEnv, publicSupabasePublishableKey, publicSupabaseUrl } from "./supabase-public-env";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(SUPABASE_PROJECT.name === "Eterfaceid", "project name");
assert(SUPABASE_PROJECT.id === "euuexozkxjuvyuikevrx", "project id from Project Settings");
assert(SUPABASE_PROJECT.region === "ca-central-1", "Canada Central region");
assert(SUPABASE_PROJECT.url === `https://${SUPABASE_PROJECT.id}.supabase.co`, "url is built from the project id");
assert(FALLBACK_SUPABASE_URL === SUPABASE_PROJECT.url, "public fallback url is this project");
assert(FALLBACK_SUPABASE_PUBLISHABLE_KEY.startsWith("eyJ"), "publishable jwt");
assert(supabaseRestUrl("integration_secrets").startsWith(`${SUPABASE_PROJECT.url}/rest/v1/`), "data api path");
assert(supabaseAccessKey().length > 20, "access key is always present");

const previousUrl = process.env["SUPABASE_URL"];
const previousKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
delete process.env["SUPABASE_URL"];
delete process.env["SUPABASE_PUBLISHABLE_KEY"];
delete process.env["VITE_SUPABASE_URL"];
delete process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
delete process.env["SUPABASE_ANON_KEY"];

assert(publicSupabaseUrl() === SUPABASE_PROJECT.url, "url does not require Lovable Cloud env");
assert(publicSupabasePublishableKey() === SUPABASE_PROJECT.publishableKey, "publishable key does not require Lovable Cloud env");

ensurePublicSupabaseEnv();
assert(process.env["SUPABASE_URL"] === SUPABASE_PROJECT.url, "ensure writes the Eterfaceid url");
assert(process.env["SUPABASE_PROJECT_ID"] === SUPABASE_PROJECT.id, "ensure writes the project id");

if (previousUrl !== undefined) process.env["SUPABASE_URL"] = previousUrl;
if (previousKey !== undefined) process.env["SUPABASE_PUBLISHABLE_KEY"] = previousKey;

console.log("supabase-project.test.ts passed");
