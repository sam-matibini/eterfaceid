/** HMAC confirm tokens. Server-only — never import from client modules. */

export type SignupConfirmPurpose = "verify" | "recovery";

export type SignupConfirmPayload = {
  email: string;
  purpose: SignupConfirmPurpose;
  exp: number;
  next?: string;
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

export async function signSignupConfirm(input: {
  email: string;
  purpose: SignupConfirmPurpose;
  next?: string | null;
  ttlMs?: number;
}) {
  const payload: SignupConfirmPayload = {
    email: input.email.trim().toLowerCase(),
    purpose: input.purpose,
    exp: Date.now() + (input.ttlMs ?? 24 * 60 * 60 * 1000),
    ...(input.next ? { next: input.next } : {}),
  };
  const json = JSON.stringify(payload);
  return `${textToB64Url(json)}.${await hmac(json)}`;
}

export async function verifySignupConfirm(token: string): Promise<SignupConfirmPayload | null> {
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
    const payload = JSON.parse(json) as SignupConfirmPayload;
    if (!payload.email || (payload.purpose !== "verify" && payload.purpose !== "recovery")) return null;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
