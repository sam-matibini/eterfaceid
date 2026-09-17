import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AdminClient = SupabaseClient<Database>;

export type ApiContext = {
  keyId: string;
  orgId: string;
  environment: string;
  admin: AdminClient;
};


export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function adminClient() {
  return createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,idempotency-key",
  "access-control-max-age": "86400",
};

/** Answers a browser preflight so partner front-ends can call the API. */
export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS_HEADERS },
  });
}

export function apiError(error: string, message: string, status = 400) {
  return jsonResponse({ error, message }, status);
}

/** Reads ?limit= and ?offset= with safe bounds. */
export function paging(request: Request, defaultLimit = 50, maxLimit = 200) {
  const url = new URL(request.url);
  const limit = Math.min(maxLimit, Math.max(1, Number(url.searchParams.get("limit") ?? defaultLimit) || defaultLimit));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  return { limit, offset, searchParams: url.searchParams };
}

/** Parses a JSON body against a zod-like schema and returns a 422 when it fails. */
export async function readJson<T>(
  request: Request,
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown } } },
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: jsonResponse({ error: "invalid_request", issues: parsed.error.issues }, 422) };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Replays the stored answer when the same Idempotency-Key is sent twice,
 * so a retried create never produces a duplicate record.
 */
export async function withIdempotency(
  auth: ApiContext,
  request: Request,
  endpoint: string,
  run: () => Promise<Response>,
): Promise<Response> {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key) return run();

  const { data: existing } = await auth.admin
    .from("api_idempotency")
    .select("status_code, response")
    .eq("org_id", auth.orgId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) {
    return new Response(JSON.stringify((existing as any).response), {
      status: (existing as any).status_code ?? 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "idempotent-replay": "true",
        ...CORS_HEADERS,
      },
    });
  }

  const response = await run();
  if (response.status < 400) {
    const body = await response.clone().json().catch(() => ({}));
    await auth.admin.from("api_idempotency").insert({
      org_id: auth.orgId,
      idempotency_key: key,
      endpoint,
      status_code: response.status,
      response: body as never,
    });
  }
  return response;
}

/** Loads a case that belongs to the calling company, or null. */
export async function loadCase(auth: ApiContext, caseId: string, columns = "*") {
  const { data } = await auth.admin
    .from("cases")
    .select(columns)
    .eq("id", caseId)
    .eq("org_id", auth.orgId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/** Writes an audit entry for an API-driven action. */
export async function apiAudit(
  auth: ApiContext,
  action: string,
  entityType: string,
  entityId: string | null,
  detail: Record<string, unknown> = {},
) {
  await auth.admin.from("audit_events").insert({
    org_id: auth.orgId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail: { ...detail, via: "api", environment: auth.environment } as never,
  });
}

/** Counts one billable action against the company's month. Never throws. */
export async function countUsage(auth: ApiContext, kind: "verifications" | "screenings" | "transactions") {
  try {
    const { recordUsage } = await import("@/lib/usage.server");
    await recordUsage(auth.admin, auth.orgId, kind);
  } catch {
    /* usage counting must never block an API call */
  }
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
    .select("id, environment, revoked_at, org_id")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!key) return jsonResponse({ error: "invalid_api_key" }, 401);
  if ((key as any).revoked_at) return jsonResponse({ error: "revoked_api_key" }, 401);

  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", (key as any).id);
  return {
    keyId: (key as any).id as string,
    orgId: (key as any).org_id as string,
    environment: (key as any).environment as string,
    admin,
  };
}


/** Signs and delivers an event to every enabled webhook endpoint for the environment. */
export async function dispatchWebhook(
  admin: AdminClient,
  orgId: string,
  environment: string,
  event: string,
  payload: Record<string, unknown>,
) {
  const { data: endpoints } = await admin
    .from("webhook_endpoints")
    .select("id, url, secret, events, enabled, environment")
    .eq("enabled", true)
    .eq("org_id", orgId)
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
      payload: { event, data: payload } as never,
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
