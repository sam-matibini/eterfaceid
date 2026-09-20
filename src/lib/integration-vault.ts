/** Client-side store so PIN-unlocked API keys survive a refresh or Worker restart. */

export const INTEGRATION_VAULT_KEY = "eid_integration_vault";

export type VaultApi = {
  provider: string;
  label: string;
  category: string;
  last4: string | null;
  status: string;
  enabled: boolean;
  purpose: string | null;
  notes: string | null;
  savedAt: string;
  wrappedKey?: string;
};

export type VaultNote = {
  id: string;
  title: string;
  purpose: string | null;
  status: "idea" | "keys_needed" | "connecting" | "live";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type IntegrationVault = {
  persist: boolean;
  apis: VaultApi[];
  notes: VaultNote[];
};

export const DEFAULT_VAULT: IntegrationVault = { persist: true, apis: [], notes: [] };

const KNOWN: Record<string, { label: string; category: string; purpose: string }> = {
  resend: {
    label: "Resend",
    category: "email",
    purpose: "Transactional email for invites, verification, password reset and alerts",
  },
  thekyb: {
    label: "The KYB",
    category: "registry",
    purpose: "Official company registry checks",
  },
};

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function wrapKey(apiKey: string, pin: string) {
  const secret = apiKey.normalize("NFKC");
  const key = pin.normalize("NFKC") || "eterfaceid";
  const bytes = Array.from(secret, (char, index) => char.charCodeAt(0) ^ key.charCodeAt(index % key.length));
  return btoa(String.fromCharCode(...bytes));
}

function unwrapKey(wrapped: string, pin: string) {
  try {
    const raw = atob(wrapped);
    const key = pin.normalize("NFKC") || "eterfaceid";
    return Array.from(raw, (char, index) =>
      String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(index % key.length)),
    ).join("");
  } catch {
    return "";
  }
}

export function readIntegrationVault(): IntegrationVault {
  const raw = storage()?.getItem(INTEGRATION_VAULT_KEY);
  if (!raw) return { ...DEFAULT_VAULT, apis: [], notes: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<IntegrationVault>;
    return {
      persist: parsed.persist !== false,
      apis: Array.isArray(parsed.apis) ? parsed.apis : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    };
  } catch {
    return { ...DEFAULT_VAULT, apis: [], notes: [] };
  }
}

export function writeIntegrationVault(vault: IntegrationVault) {
  storage()?.setItem(INTEGRATION_VAULT_KEY, JSON.stringify(vault));
  return vault;
}

export function isApiPersistEnabled() {
  return readIntegrationVault().persist;
}

export function setApiPersistEnabled(persist: boolean) {
  const vault = readIntegrationVault();
  return writeIntegrationVault({ ...vault, persist });
}

export function upsertVaultApi(input: {
  provider: string;
  apiKey: string;
  pin: string;
  last4?: string;
  status?: string;
  notes?: string | null;
}) {
  const vault = readIntegrationVault();
  if (!vault.persist) return vault;
  const known = KNOWN[input.provider];
  const last4 = input.last4 ?? input.apiKey.slice(-4);
  const now = new Date().toISOString();
  const entry: VaultApi = {
    provider: input.provider,
    label: known?.label ?? input.provider,
    category: known?.category ?? "other",
    last4,
    status: input.status ?? "live",
    enabled: true,
    purpose: known?.purpose ?? null,
    notes: input.notes ?? `Key on file ending ${last4}`,
    savedAt: now,
    wrappedKey: wrapKey(input.apiKey, input.pin),
  };
  const apis = vault.apis.filter((row) => row.provider !== input.provider);
  apis.unshift(entry);
  const noteId = `vault-${input.provider}`;
  const notes = vault.notes.filter((row) => row.id !== noteId && row.title !== entry.label);
  notes.unshift({
    id: noteId,
    title: entry.label,
    purpose: entry.purpose,
    status: "live",
    notes: entry.notes,
    created_at: now,
    updated_at: now,
  });
  return writeIntegrationVault({ ...vault, apis, notes });
}

export function setVaultApiEnabled(provider: string, enabled: boolean) {
  const vault = readIntegrationVault();
  return writeIntegrationVault({
    ...vault,
    apis: vault.apis.map((row) => (row.provider === provider ? { ...row, enabled } : row)),
  });
}

export function upsertVaultNote(
  entry: Omit<VaultNote, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string },
) {
  const vault = readIntegrationVault();
  if (!vault.persist) return vault;
  const now = new Date().toISOString();
  const id = entry.id || `vault-note-${crypto.randomUUID()}`;
  const existing = vault.notes.find((row) => row.id === id);
  const next: VaultNote = {
    id,
    title: entry.title,
    purpose: entry.purpose,
    status: entry.status,
    notes: entry.notes,
    created_at: existing?.created_at ?? entry.created_at ?? now,
    updated_at: now,
  };
  return writeIntegrationVault({
    ...vault,
    notes: [next, ...vault.notes.filter((row) => row.id !== id)],
  });
}

export function removeVaultNote(id: string) {
  const vault = readIntegrationVault();
  return writeIntegrationVault({
    ...vault,
    notes: vault.notes.filter((row) => row.id !== id),
  });
}

export function restoreKeysFromVault(pin: string) {
  const vault = readIntegrationVault();
  if (!vault.persist) return { resendKey: "", theKybKey: "" };
  const resend = vault.apis.find((row) => row.provider === "resend")?.wrappedKey;
  const thekyb = vault.apis.find((row) => row.provider === "thekyb")?.wrappedKey;
  return {
    resendKey: resend ? unwrapKey(resend, pin) : "",
    theKybKey: thekyb ? unwrapKey(thekyb, pin) : "",
  };
}

/** Unwrap the saved Resend key using the first pin that works. */
export function vaultedResendKey(...pins: string[]) {
  for (const pin of pins) {
    if (!pin.trim()) continue;
    const key = restoreKeysFromVault(pin).resendKey.trim();
    if (key.startsWith("re_")) return key;
  }
  return "";
}

export function vaultAsIntegrationRows() {
  return readIntegrationVault().apis.map((row) => ({
    id: `vault-${row.provider}`,
    provider: row.provider,
    label: row.label,
    category: row.category,
    enabled: row.enabled,
    last_checked_at: row.savedAt,
    last_error: null as string | null,
    status: row.status,
  }));
}
