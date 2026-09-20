/** Client-safe constants for the staff bootstrap on /auth. */

export const STAFF_BYPASS_EMAIL = "ops@eterfaceid.com";
export const STAFF_BYPASS_FLAG = "eid_staff_bypass";
export const STAFF_BYPASS_PIN_KEY = "eid_staff_pin";
export const STAFF_BYPASS_PATH = "/admin/integrations";
export const STAFF_BYPASS_HASH = "notepad";
export const DEFAULT_STAFF_BYPASS_PIN = "eterfaceid";

export function staffPinUnlocks(pin: string) {
  return pin.trim() === DEFAULT_STAFF_BYPASS_PIN;
}

export function isStaffBypassUnlocked() {
  return typeof window !== "undefined" && window.sessionStorage.getItem(STAFF_BYPASS_FLAG) === "1";
}

export function readStaffBypassPin() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(STAFF_BYPASS_PIN_KEY) ?? "";
}

export function unlockStaffBypass(pin: string) {
  window.sessionStorage.setItem(STAFF_BYPASS_FLAG, "1");
  window.sessionStorage.setItem(STAFF_BYPASS_PIN_KEY, pin.trim());
}

export function lockStaffBypass() {
  window.sessionStorage.removeItem(STAFF_BYPASS_FLAG);
  window.sessionStorage.removeItem(STAFF_BYPASS_PIN_KEY);
}

export const PIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const PIN_ATTEMPT_MAX = 8;

export { FALLBACK_SUPABASE_URL } from "@/lib/supabase-public-env";

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
