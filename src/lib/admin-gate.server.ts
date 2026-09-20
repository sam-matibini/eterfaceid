import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

export type AdminGateSession = { unlocked?: boolean; userId?: string };

const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function sessionConfig() {
  const password = process.env["ADMIN_SESSION_SECRET"];
  if (!password || password.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET is not configured");
  }
  return {
    password,
    name: "eid-admin",
    maxAge: MAX_AGE,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export async function getAdminSession() {
  return useSession<AdminGateSession>(sessionConfig());
}

export function codeMatches(input: string, expected: string) {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function isAdminUnlocked(userId: string) {
  try {
    const session = await getAdminSession();
    return Boolean(session.data.unlocked) && session.data.userId === userId;
  } catch {
    return false;
  }
}

export async function requireAdminUnlocked(userId: string) {
  const ok = await isAdminUnlocked(userId);
  if (!ok) throw new Error("Enter the admin access code to continue");
  return true;
}
