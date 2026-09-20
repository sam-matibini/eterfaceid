import { createHash, timingSafeEqual } from "node:crypto";

import {
  DEFAULT_STAFF_BYPASS_PIN,
  PIN_ATTEMPT_MAX,
  PIN_ATTEMPT_WINDOW_MS,
} from "@/lib/staff-bypass";

function digest(value: string) {
  return createHash("sha256").update(value.normalize("NFKC"), "utf8").digest();
}

export function configuredStaffBypassPin(env: NodeJS.Dict<string> = process.env): string | null {
  const raw = env["STAFF_BYPASS_PIN"]?.trim() ?? "";
  if (raw && /^(off|disabled|false|0)$/i.test(raw)) return null;
  if (raw) return raw;
  return DEFAULT_STAFF_BYPASS_PIN;
}

export function pinsMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}

type AttemptBucket = { count: number; resetAt: number };

const attempts = new Map<string, AttemptBucket>();

export function resetPinAttemptsForTests() {
  attempts.clear();
}

export function consumePinAttempt(key: string, now = Date.now()): { allowed: boolean; remaining: number } {
  const existing = attempts.get(key);
  if (!existing || existing.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + PIN_ATTEMPT_WINDOW_MS });
    return { allowed: true, remaining: PIN_ATTEMPT_MAX - 1 };
  }
  if (existing.count >= PIN_ATTEMPT_MAX) {
    return { allowed: false, remaining: 0 };
  }
  existing.count += 1;
  return { allowed: true, remaining: PIN_ATTEMPT_MAX - existing.count };
}

export function clearPinAttempts(key: string) {
  attempts.delete(key);
}

export function extractStaffSessionToken(
  properties: { hashed_token?: string | null; action_link?: string | null } | null | undefined,
): string | null {
  const hashed = properties?.hashed_token?.trim();
  if (hashed) return hashed;
  const link = properties?.action_link?.trim();
  if (!link) return null;
  try {
    const url = new URL(link);
    return (
      url.searchParams.get("token_hash") ??
      url.searchParams.get("token") ??
      url.hash.replace(/^#/, "").split("&").reduce<string | null>((found, part) => {
        if (found) return found;
        const [name, value] = part.split("=");
        return name === "token_hash" || name === "token" ? decodeURIComponent(value ?? "") : null;
      }, null)
    );
  } catch {
    return null;
  }
}
