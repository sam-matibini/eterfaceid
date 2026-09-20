/** The KYB REST client (v2). Server-only: never import from client code. */

import { THEKYB_PROVIDER, toTheKybCountryCode, type RegistryMatch } from "@/lib/thekyb";

const HOST = "https://api.thekyb.com";

type TheKybEnvelope<T> = {
  error?: boolean;
  message?: string;
  data?: T;
};

export type TheKybSearchHit = RegistryMatch;

export type TheKybSearchResult = {
  kyb_request_id: string | null;
  status: string | null;
  matches: TheKybSearchHit[];
};

export type TheKybProfile = {
  kyb_response_id?: string;
  kyb_request_id?: string;
  name?: string;
  registration_number?: string | null;
  registration_date?: string | null;
  status?: string | null;
  type?: string | null;
  country_code?: string | null;
  incorporation_date?: string | null;
  tax_number?: string | null;
  risk_level?: string | null;
  verification_status?: string | null;
  fetch_status?: string | null;
  addresses_detail?: Array<{ address?: string; type?: string }>;
  people_detail?: Array<{ name?: string; designation?: string; status?: string }>;
  beneficial_owners_detail?: Array<{
    name?: string;
    designation?: string;
    shares_detail?: { ownership_min_shares?: string; ownership_max_shares?: string };
  }>;
  [key: string]: unknown;
};

let bootstrapTheKybKey: string | null = null;

export function setBootstrapTheKybKey(apiKey: string) {
  bootstrapTheKybKey = apiKey.trim();
  try {
    process.env["THEKYB_API_KEY"] = bootstrapTheKybKey;
  } catch {
    /* process.env can be immutable on Workers */
  }
}

export function peekBootstrapTheKybKey() {
  return bootstrapTheKybKey ?? process.env["THEKYB_API_KEY"]?.trim() ?? null;
}

async function storedApiKey(): Promise<string | null> {
  const fromBootstrap = peekBootstrapTheKybKey();
  if (fromBootstrap) return fromBootstrap;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("integration_secrets")
      .select("api_key")
      .eq("provider", THEKYB_PROVIDER)
      .maybeSingle();
    const key = (data as { api_key?: string } | null)?.api_key?.trim();
    return key || null;
  } catch {
    return null;
  }
}

export async function thekybConfigured(): Promise<boolean> {
  return Boolean(await storedApiKey());
}

async function call<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
  const token = await storedApiKey();
  if (!token) {
    throw new Error("The KYB is not configured yet. Add the API key in App admin → Integrations.");
  }

  const response = await fetch(`${HOST}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      token,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed: TheKybEnvelope<T> | null = null;
  try {
    parsed = JSON.parse(text) as TheKybEnvelope<T>;
  } catch {
    /* keep raw */
  }
  if (!response.ok || parsed?.error) {
    const message = parsed?.message || text || `HTTP ${response.status}`;
    console.error(`The KYB ${method} ${path} failed [${response.status}]: ${message}`);
    throw new Error(`The KYB request failed: ${message}`);
  }
  return (parsed?.data ?? parsed) as T;
}

function asMatch(row: Record<string, unknown>): TheKybSearchHit {
  return {
    kyb_response_id: String(row["kyb_response_id"] ?? ""),
    name: String(row["name"] ?? ""),
    registration_number: row["registration_number"] != null ? String(row["registration_number"]) : null,
    country_code: row["country_code"] != null ? String(row["country_code"]) : null,
    type: row["type"] != null ? String(row["type"]) : null,
    status: row["status"] != null ? String(row["status"]) : null,
    risk_level: row["risk_level"] != null ? String(row["risk_level"]) : null,
    verification_status: row["verification_status"] != null ? String(row["verification_status"]) : null,
    fetch_status: row["fetch_status"] != null ? String(row["fetch_status"]) : null,
  };
}

export const thekyb = {
  /** Confirms the secret key works by listing covered countries. */
  async ping(): Promise<{ countries: number }> {
    const data = await call<Array<unknown>>("GET", "/v2/countries");
    return { countries: Array.isArray(data) ? data.length : 0 };
  },

  async search(input: {
    name?: string | undefined;
    registrationNumber?: string | undefined;
    country?: string | null | undefined;
    searchType?: "contains" | "start_with" | "fuzzy" | undefined;
  }): Promise<TheKybSearchResult> {
    const country = toTheKybCountryCode(input.country);
    const payload: Record<string, unknown> = {
      country_codes: [country],
      search_type: input.searchType ?? "contains",
    };
    if (input.name?.trim()) payload["name"] = input.name.trim();
    if (input.registrationNumber?.trim()) payload["registration_number"] = input.registrationNumber.trim();

    const data = await call<{
      kyb_request?: { kyb_request_id?: string; status?: string };
      kyb_responses?: Array<Record<string, unknown>>;
    }>("POST", "/v2/kyb", payload);

    return {
      kyb_request_id: data.kyb_request?.kyb_request_id ?? null,
      status: data.kyb_request?.status ?? null,
      matches: (data.kyb_responses ?? []).map(asMatch).filter((m) => m.kyb_response_id),
    };
  },

  async results(requestId: string, page = 1, limit = 25): Promise<TheKybSearchResult> {
    const params = new URLSearchParams({
      kyb_request_id: requestId,
      page: String(page),
      limit: String(limit),
    });
    const data = await call<{
      kyb_request?: { kyb_request_id?: string; status?: string };
      kyb_responses?: Array<Record<string, unknown>>;
    }>("GET", `/v2/kyb?${params.toString()}`);
    return {
      kyb_request_id: data.kyb_request?.kyb_request_id ?? requestId,
      status: data.kyb_request?.status ?? null,
      matches: (data.kyb_responses ?? []).map(asMatch).filter((m) => m.kyb_response_id),
    };
  },

  async profile(responseId: string): Promise<TheKybProfile> {
    return call<TheKybProfile>("GET", `/v2/kyb/${encodeURIComponent(responseId)}`);
  },
};
