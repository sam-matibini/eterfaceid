/** Public project values already shipped in the browser client. Safe to use as server fallbacks. */

export const FALLBACK_SUPABASE_URL = "https://euuexozkxjuvyuikevrx.supabase.co";
export const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1dWV4b3preGp1dnl1aWtldnJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NjAxNDUsImV4cCI6MjEwNTMzNjE0NX0.TPM3o-454ydySCc5AUpBvjjNaH4xkQA8INowoQ5H6jg";

function readEnv(name: string) {
  try {
    return process.env[name]?.trim() || "";
  } catch {
    return "";
  }
}

function writeEnv(name: string, value: string) {
  if (!value) return;
  try {
    if (!process.env[name]) process.env[name] = value;
  } catch {
    /* process.env can be immutable on Workers */
  }
}

export function publicSupabaseUrl() {
  return readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL") || FALLBACK_SUPABASE_URL;
}

export function publicSupabasePublishableKey() {
  return (
    readEnv("SUPABASE_PUBLISHABLE_KEY") ||
    readEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    readEnv("SUPABASE_ANON_KEY") ||
    FALLBACK_SUPABASE_PUBLISHABLE_KEY
  );
}

export function ensurePublicSupabaseEnv() {
  writeEnv("SUPABASE_URL", publicSupabaseUrl());
  writeEnv("SUPABASE_PUBLISHABLE_KEY", publicSupabasePublishableKey());
  writeEnv("VITE_SUPABASE_URL", publicSupabaseUrl());
  writeEnv("VITE_SUPABASE_PUBLISHABLE_KEY", publicSupabasePublishableKey());
}
