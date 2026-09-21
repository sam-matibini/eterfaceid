/** HMAC team-invite tokens. Server-only — never import from client modules. */

import { mapAccessRoleToAppRole, type AccessRole, type AppRole, type UserType } from "./access";

export type TeamInvitePayload = {
  purpose: "team-invite";
  email: string;
  orgId: string;
  orgName: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  accessRole: AccessRole;
  userType: UserType;
  sandboxAccess: boolean;
  liveAccess: boolean;
  role: AppRole;
  exp: number;
};

function confirmSecret() {
  return (
    process.env["AUTH_EMAIL_SECRET"]?.trim() ||
    process.env["RESEND_API_KEY"]?.trim() ||
    process.env["STAFF_BYPASS_PIN"]?.trim() ||
    "eterfaceid-confirm"
  );
}

function bytesToB64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function textToB64Url(value: string) {
  return bytesToB64Url(new TextEncoder().encode(value));
}

function b64UrlToText(value: string) {
  return new TextDecoder().decode(b64UrlToBytes(value));
}

function timingSafeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(confirmSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToB64Url(new Uint8Array(signature));
}

export async function signTeamInvite(input: Omit<TeamInvitePayload, "purpose" | "role" | "exp"> & { ttlMs?: number }) {
  const payload: TeamInvitePayload = {
    purpose: "team-invite",
    email: input.email.trim().toLowerCase(),
    orgId: input.orgId,
    orgName: input.orgName,
    firstName: input.firstName,
    lastName: input.lastName,
    jobTitle: input.jobTitle,
    accessRole: input.accessRole,
    userType: input.userType,
    sandboxAccess: input.sandboxAccess,
    liveAccess: input.liveAccess,
    role: mapAccessRoleToAppRole(input.accessRole),
    exp: Date.now() + (input.ttlMs ?? 72 * 60 * 60 * 1000),
  };
  const json = JSON.stringify(payload);
  return `${textToB64Url(json)}.${await hmac(json)}`;
}

export async function verifyTeamInvite(token: string): Promise<TeamInvitePayload | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  let json: string;
  try {
    json = b64UrlToText(body);
  } catch {
    return null;
  }
  const expected = await hmac(json);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(json) as TeamInvitePayload;
    if (payload.purpose !== "team-invite" || !payload.email || !payload.orgId) return null;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
