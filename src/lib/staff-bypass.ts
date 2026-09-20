/** Client-safe constants for the staff bootstrap on /auth. */

export const STAFF_BYPASS_EMAIL = "ops@eterfaceid.com";
export const STAFF_BYPASS_FLAG = "eid_staff_bypass";
export const STAFF_BYPASS_PATH = "/admin/integrations";
export const STAFF_BYPASS_HASH = "notepad";
export const DEFAULT_STAFF_BYPASS_PIN = "eterfaceid";

export const PIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const PIN_ATTEMPT_MAX = 8;

export const FALLBACK_SUPABASE_URL = "https://euuexozkxjuvyuikevrx.supabase.co";

export function applyWorkerEnv(env: unknown) {
  if (!env || typeof env !== "object") return;
  for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
    if (typeof value !== "string" || !value) continue;
    try {
      if (!process.env[key]) process.env[key] = value;
    } catch {
      /* process.env can be immutable on some Workers runtimes */
    }
  }
}
