import { createClient } from "@supabase/supabase-js";

export type ApiContext = {
  keyId: string;
  environment: string;
  admin: ReturnType<typeof createClient>;
};

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function adminClient() {
  return createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Authenticates a request with an eterfaceID API key (Authorization: Bearer eid_...). */
export async function authenticateApiRequest(request: Request): Promise<ApiContext | Response> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith("eid_")) {
    return jsonResponse({ error: "missing_api_key", message: "Send your key as: Authorization: Bearer eid_..." }, 401);
  }
  const admin = adminClient();
  const hash = await sha256Hex(token);
  const { data: key } = await admin
    .from("api_keys")
    .select("id, environment, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!key) return jsonResponse({ error: "invalid_api_key" }, 401);
  if ((key as any).revoked_at) return jsonResponse({ error: "revoked_api_key" }, 401);

  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", (key as any).id);
  return { keyId: (key as any).id as string, environment: (key as any).environment as string, admin };
}

/** Signs and delivers an event to every enabled webhook endpoint for the environment. */
export async function dispatchWebhook(
  admin: ReturnType<typeof createClient>,
  environment: string,
  event: string,
  payload: Record<string, unknown>,
) {
  const { data: endpoints } = await admin
    .from("webhook_endpoints")
    .select("id, url, secret, events, enabled, environment")
    .eq("enabled", true)
    .eq("environment", environment);

  for (const endpoint of (endpoints ?? []) as any[]) {
    if (Array.isArray(endpoint.events) && endpoint.events.length && !endpoint.events.includes(event)) continue;
    const body = JSON.stringify({ event, created_at: new Date().toISOString(), data: payload });
    const signature = await hmacHex(endpoint.secret, body);
    let status = "delivered";
    let responseCode: number | null = null;
    let errorDetail: string | null = null;
    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "eterfaceid-event": event,
          "eterfaceid-signature": `sha256=${signature}`,
        },
        body,
      });
      responseCode = res.status;
      if (!res.ok) status = "failed";
    } catch (err) {
      status = "failed";
      errorDetail = err instanceof Error ? err.message : "delivery failed";
    }
    await admin.from("webhook_deliveries").insert({
      endpoint_id: endpoint.id,
      event,
      payload: { event, data: payload },
      status,
      response_code: responseCode,
      error_detail: errorDetail,
      attempts: 1,
    });
  }
}

export async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
