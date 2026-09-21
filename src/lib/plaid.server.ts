/** Minimal Plaid REST client. Server-only: never import from client code. */

import { decodeReusableSecret, type ReusableSecret } from "./api-notepad";

type PlaidEnv = "sandbox" | "production";

let bootstrapPlaid: ReusableSecret | null = null;

function normalizeEnv(value: string | undefined | null): PlaidEnv {
  return (value ?? "").toLowerCase() === "production" ? "production" : "sandbox";
}

function pack(input: ReusableSecret) {
  const clientId = input.clientId?.trim() ?? "";
  const secret = input.secret.trim();
  const env = normalizeEnv(input.env);
  if (!clientId || !secret) return null;
  const host = env === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";
  return { clientId, secret, env, host };
}

function writeEnv(creds: ReusableSecret) {
  try {
    process.env["PLAID_SECRET"] = creds.secret.trim();
    if (creds.clientId) process.env["PLAID_CLIENT_ID"] = creds.clientId.trim();
    if (creds.env) process.env["PLAID_ENV"] = normalizeEnv(creds.env);
  } catch {
    /* process.env can be immutable on Workers */
  }
}

export function setBootstrapPlaidCredentials(input: ReusableSecret) {
  const secret = input.secret.trim();
  const clientId = input.clientId?.trim() || "";
  const env = input.env?.trim() || "";
  if (!secret) return;
  bootstrapPlaid = { secret, clientId: clientId || undefined, env: env || undefined };
  writeEnv(bootstrapPlaid);
}

export function peekBootstrapPlaidCredentials(): ReusableSecret | null {
  if (bootstrapPlaid?.secret) return bootstrapPlaid;
  const secret = process.env["PLAID_SECRET"]?.trim() ?? "";
  const clientId = process.env["PLAID_CLIENT_ID"]?.trim() ?? "";
  const env = process.env["PLAID_ENV"]?.trim() ?? "";
  if (!secret) return null;
  return { secret, clientId: clientId || undefined, env: env || undefined };
}

function peekCredentials() {
  return pack(peekBootstrapPlaidCredentials() ?? { secret: "" });
}

async function storedPlaidCredentials(): Promise<ReusableSecret | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("integration_secrets")
      .select("api_key")
      .eq("provider", "plaid")
      .maybeSingle();
    const raw = (data as { api_key?: string } | null)?.api_key?.trim();
    if (raw) {
      const decoded = decodeReusableSecret(raw);
      if (decoded.secret) return decoded;
    }
  } catch {
    /* service role may be missing */
  }
  try {
    const { projectRest } = await import("@/lib/supabase-project");
    const result = await projectRest<{ api_key?: string }[]>("integration_secrets", {
      query: "provider=eq.plaid&select=api_key",
    });
    const raw = result.data?.[0]?.api_key?.trim();
    if (raw) {
      const decoded = decodeReusableSecret(raw);
      if (decoded.secret) return decoded;
    }
  } catch {
    /* anon JWT cannot read secrets */
  }
  return null;
}

async function credentials() {
  const ready = peekCredentials();
  if (ready) return ready;
  const stored = await storedPlaidCredentials();
  if (stored) {
    setBootstrapPlaidCredentials(stored);
    const packed = pack(stored);
    if (packed) return packed;
  }
  throw new Error("Plaid is not configured yet. Add the Plaid credentials in App admin.");
}

export function plaidEnvironment(): PlaidEnv {
  return peekCredentials()?.env ?? normalizeEnv(process.env["PLAID_ENV"]);
}

export async function plaidConfigured(): Promise<boolean> {
  if (peekCredentials()) return true;
  const stored = await storedPlaidCredentials();
  if (!stored) return false;
  setBootstrapPlaidCredentials(stored);
  return Boolean(pack(stored));
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { clientId, secret, host } = await credentials();
  const response = await fetch(`${host}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`Plaid ${path} failed [${response.status}]: ${text}`);
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error_message?: string; error_code?: string };
      message = parsed.error_message ?? parsed.error_code ?? text;
    } catch {
      /* keep raw text */
    }
    throw new Error(`Plaid request failed: ${message}`);
  }
  return JSON.parse(text) as T;
}

export type PlaidAddress = {
  data: { street?: string; city?: string; region?: string; postal_code?: string; country?: string };
  primary?: boolean;
};

export type PlaidIdentityOwner = {
  names: string[];
  emails: { data: string }[];
  phone_numbers: { data: string }[];
  addresses: PlaidAddress[];
};

export const plaid = {
  createLinkToken: (userId: string, products: string[]) =>
    call<{ link_token: string; expiration: string }>("/link/token/create", {
      user: { client_user_id: userId },
      client_name: "eterfaceID",
      products,
      country_codes: ["CA", "US"],
      language: "en",
    }),

  exchangePublicToken: (publicToken: string) =>
    call<{ access_token: string; item_id: string }>("/item/public_token/exchange", {
      public_token: publicToken,
    }),

  identity: (accessToken: string) =>
    call<{ accounts: { owners: PlaidIdentityOwner[] }[]; item: { institution_id?: string } }>("/identity/get", {
      access_token: accessToken,
    }),

  institution: (institutionId: string) =>
    call<{ institution: { name: string } }>("/institutions/get_by_id", {
      institution_id: institutionId,
      country_codes: ["CA", "US"],
    }),

  transactionsSync: (accessToken: string, cursor: string | null) =>
    call<{
      added: PlaidTransaction[];
      next_cursor: string;
      has_more: boolean;
    }>("/transactions/sync", {
      access_token: accessToken,
      ...(cursor ? { cursor } : {}),
      count: 250,
    }),
};

export type PlaidTransaction = {
  transaction_id: string;
  amount: number;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
  date: string;
  datetime?: string | null;
  merchant_name?: string | null;
  name: string;
  payment_channel?: string | null;
  payment_meta?: { payer?: string | null; payee?: string | null } | null;
};
