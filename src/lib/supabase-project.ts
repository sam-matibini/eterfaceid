/**
 * The live Supabase project this app talks to.
 * Values come from Project Settings → General (Eterfaceid / ca-central-1).
 * The server uses this project's Data API directly — Lovable Cloud is not required.
 */

export const SUPABASE_PROJECT = {
  name: "Eterfaceid",
  id: "euuexozkxjuvyuikevrx",
  region: "ca-central-1",
  url: "https://euuexozkxjuvyuikevrx.supabase.co",
  publishableKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1dWV4b3preGp1dnl1aWtldnJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NjAxNDUsImV4cCI6MjEwNTMzNjE0NX0.TPM3o-454ydySCc5AUpBvjjNaH4xkQA8INowoQ5H6jg",
} as const;

export const FALLBACK_SUPABASE_URL = SUPABASE_PROJECT.url;
export const FALLBACK_SUPABASE_PUBLISHABLE_KEY = SUPABASE_PROJECT.publishableKey;

function readEnv(name: string) {
  try {
    return process.env[name]?.trim() || "";
  } catch {
    return "";
  }
}

export function supabaseServiceRoleKey() {
  return (
    readEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    readEnv("SUPABASE_SECRET_KEY") ||
    readEnv("SERVICE_ROLE_KEY") ||
    ""
  );
}

/** Prefer a service-role key when the Worker has one; otherwise the project publishable key. */
export function supabaseAccessKey() {
  return supabaseServiceRoleKey() || SUPABASE_PROJECT.publishableKey;
}

export function supabaseRestUrl(table: string, query = "") {
  const path = table.replace(/^\//, "");
  return `${SUPABASE_PROJECT.url}/rest/v1/${path}${query ? `?${query}` : ""}`;
}

export function supabaseProjectHeaders(init?: HeadersInit) {
  const key = supabaseAccessKey();
  const headers = new Headers(init);
  headers.set("apikey", key);
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${key}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return headers;
}

export type ProjectRestResult<T> = {
  data: T | null;
  error: string | null;
  status: number;
};

/** Direct PostgREST call to this project's Data API. */
export async function projectRest<T = unknown>(
  table: string,
  options: {
    method?: string;
    query?: string;
    body?: unknown;
    prefer?: string;
  } = {},
): Promise<ProjectRestResult<T>> {
  const response = await fetch(supabaseRestUrl(table, options.query ?? ""), {
    method: options.method ?? "GET",
    headers: supabaseProjectHeaders(options.prefer ? { Prefer: options.prefer } : undefined),
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
