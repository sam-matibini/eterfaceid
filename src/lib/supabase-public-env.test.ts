import {
  FALLBACK_SUPABASE_PUBLISHABLE_KEY,
  FALLBACK_SUPABASE_URL,
  ensurePublicSupabaseEnv,
  publicSupabasePublishableKey,
  publicSupabaseUrl,
} from "./supabase-public-env";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(publicSupabaseUrl().startsWith("https://"), "url is https");
assert(publicSupabaseUrl() === FALLBACK_SUPABASE_URL || publicSupabaseUrl().includes("supabase.co"), "url is supabase");
assert(publicSupabasePublishableKey().length > 20, "publishable key is present");
assert(FALLBACK_SUPABASE_PUBLISHABLE_KEY.startsWith("eyJ"), "fallback key is the anon jwt");

ensurePublicSupabaseEnv();
assert(process.env["SUPABASE_URL"], "ensure writes SUPABASE_URL");
assert(process.env["SUPABASE_PUBLISHABLE_KEY"], "ensure writes SUPABASE_PUBLISHABLE_KEY");

console.log("supabase-public-env.test.ts passed");
