/** Public project values already shipped in the browser client. Safe to use as server fallbacks. */

import {
  FALLBACK_SUPABASE_PUBLISHABLE_KEY,
  FALLBACK_SUPABASE_URL,
  SUPABASE_PROJECT,
} from "./supabase-project";

export { FALLBACK_SUPABASE_PUBLISHABLE_KEY, FALLBACK_SUPABASE_URL, SUPABASE_PROJECT };
export { supabaseAccessKey, supabaseServiceRoleKey } from "@/lib/supabase-project";

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
  return readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL") || SUPABASE_PROJECT.url;
}

export function publicSupabasePublishableKey() {
  return (
    readEnv("SUPABASE_PUBLISHABLE_KEY") ||
    readEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    readEnv("SUPABASE_ANON_KEY") ||
    SUPABASE_PROJECT.publishableKey
  );
}

export function ensurePublicSupabaseEnv() {
  writeEnv("SUPABASE_URL", publicSupabaseUrl());
  writeEnv("SUPABASE_PUBLISHABLE_KEY", publicSupabasePublishableKey());
  writeEnv("VITE_SUPABASE_URL", publicSupabaseUrl());
  writeEnv("VITE_SUPABASE_PUBLISHABLE_KEY", publicSupabasePublishableKey());
  writeEnv("SUPABASE_PROJECT_ID", SUPABASE_PROJECT.id);
  writeEnv("VITE_SUPABASE_PROJECT_ID", SUPABASE_PROJECT.id);
}
