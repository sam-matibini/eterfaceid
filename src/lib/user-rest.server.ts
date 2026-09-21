/** PostgREST calls that keep the signed-in user's JWT so RLS sees auth.uid(). */

export function userRestHeaders(publishableKey: string, userToken: string, prefer?: string) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${userToken}`,
    "Content-Type": "application/json",
    Prefer: prefer ?? "return=representation",
  };
}

export async function callerAccessToken() {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const header = getRequest().headers.get("authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    return token || null;
  } catch {
    return null;
  }
}

export async function userRest<T = unknown>(
  table: string,
  options: {
    method?: string;
    query?: string;
    body?: unknown;
    prefer?: string;
    token?: string | null;
  } = {},
): Promise<{ data: T | null; error: string | null; status: number }> {
  const { publicSupabasePublishableKey, publicSupabaseUrl } = await import("@/lib/supabase-public-env");
  const token = options.token ?? (await callerAccessToken());
  if (!token) return { data: null, error: "Not signed in", status: 401 };
  const key = publicSupabasePublishableKey();
  const response = await fetch(`${publicSupabaseUrl()}/rest/v1/${table}${options.query ? `?${options.query}` : ""}`, {
    method: options.method ?? "GET",
    headers: userRestHeaders(key, token, options.prefer),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!text) {
    return { data: null, error: response.ok ? null : `HTTP ${response.status}`, status: response.status };
  }
  try {
    const parsed = JSON.parse(text) as T | { message?: string; error?: string };
    if (!response.ok) {
      const message =
        parsed && typeof parsed === "object"
          ? ("message" in parsed && parsed.message) || ("error" in parsed && parsed.error) || text
          : text;
      return { data: null, error: String(message), status: response.status };
    }
    return { data: parsed as T, error: null, status: response.status };
  } catch {
    return { data: null, error: response.ok ? null : text.slice(0, 300), status: response.status };
  }
}

export async function userRpc<T = unknown>(
  name: string,
  args: Record<string, unknown>,
  token?: string | null,
) {
  return userRest<T>(`rpc/${name}`, {
    method: "POST",
    body: args,
    prefer: "return=representation",
    token,
  });
}

export function firstRow<T>(data: T | T[] | null) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}
