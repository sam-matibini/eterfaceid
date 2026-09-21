/** Client-safe helpers for reusable API notepad keys (Plaid, and others). */

export type ApiCatalogEntry = {
  label: string;
  category: string;
  purpose: string;
  notes: string;
  needsClientId: boolean;
  keyLabel: string;
  clientIdLabel: string;
};

export const API_CATALOG: Record<string, ApiCatalogEntry> = {
  plaid: {
    label: "Plaid",
    category: "kyc",
    purpose: "Bank identity and transactions for KYC and AML",
    notes: "From dashboard.plaid.com → Keys. Paste the client ID and secret. Use Sandbox while testing, Production for live KYC/AML.",
    needsClientId: true,
    keyLabel: "Secret",
    clientIdLabel: "Client ID",
  },
  resend: {
    label: "Resend",
    category: "email",
    purpose: "Transactional email for invites, verification, password reset and alerts",
    notes: "Create a sending-access key at resend.com/api-keys.",
    needsClientId: false,
    keyLabel: "API key",
    clientIdLabel: "Client ID",
  },
  thekyb: {
    label: "The KYB",
    category: "registry",
    purpose: "Official company registry checks",
    notes: "Generate the secret in The KYB back office (Settings → API integration).",
    needsClientId: false,
    keyLabel: "API key",
    clientIdLabel: "Client ID",
  },
};

export function providerSlug(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
  return slug || "api";
}

export function catalogFor(title: string): ApiCatalogEntry {
  const slug = providerSlug(title);
  return (
    API_CATALOG[slug] ?? {
      label: title.trim() || "API",
      category: "other",
      purpose: "",
      notes: "",
      needsClientId: false,
      keyLabel: "API key",
      clientIdLabel: "Client ID",
    }
  );
}

/** Replace leftover catalog copy (e.g. Resend text on a Plaid row) with the matching API. */
export function applyCatalogFields(title: string, current: { purpose: string; notes: string }) {
  const catalog = catalogFor(title);
  const knownPurposes = Object.values(API_CATALOG)
    .map((row) => row.purpose)
    .filter(Boolean);
  const knownNotes = Object.values(API_CATALOG)
    .map((row) => row.notes)
    .filter(Boolean);
  return {
    purpose: !current.purpose.trim() || knownPurposes.includes(current.purpose) ? catalog.purpose : current.purpose,
    notes: !current.notes.trim() || knownNotes.includes(current.notes) ? catalog.notes : current.notes,
  };
}

export type ReusableSecret = {
  secret: string;
  clientId?: string;
  env?: string;
};

export function encodeReusableSecret(input: ReusableSecret) {
  const secret = input.secret.trim();
  const clientId = input.clientId?.trim() || "";
  const env = input.env?.trim() || "";
  if (!clientId && !env) return secret;
  return JSON.stringify({ secret, ...(clientId ? { clientId } : {}), ...(env ? { env } : {}) });
}

export function decodeReusableSecret(raw: string): ReusableSecret {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        secret?: string;
        apiKey?: string;
        clientId?: string;
        client_id?: string;
        env?: string;
        environment?: string;
      };
      const secret = (parsed.secret || parsed.apiKey || "").trim();
      if (secret) {
        return {
          secret,
          clientId: (parsed.clientId || parsed.client_id || "").trim() || undefined,
          env: (parsed.env || parsed.environment || "").trim() || undefined,
        };
      }
    } catch {
      /* store was a plain secret */
    }
  }
  return { secret: trimmed };
}

export function secretLast4(raw: string) {
  const secret = decodeReusableSecret(raw).secret;
  return secret ? secret.slice(-4) : null;
}
