/** Client-side store so PIN-unlocked API keys survive a refresh or Worker restart. */

import { catalogFor, decodeReusableSecret, providerSlug, secretLast4 } from "./api-notepad";

export const INTEGRATION_VAULT_KEY = "eid_integration_vault";
export const LIVE_RESEND_KEY = "eid_resend_live";
export const VAULT_WRAP_PIN = "eterfaceid";
export const VAULT_SESSION_PIN = "session";

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

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sessionStore() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberResendKey(apiKey: string) {
  const key = apiKey.trim();
  if (!key.startsWith("re_")) return "";
  sessionStore()?.setItem(LIVE_RESEND_KEY, key);
  return key;
}

export function forgotResendKey() {
  sessionStore()?.removeItem(LIVE_RESEND_KEY);
}

function unwrapPins(extra: string[] = []) {
  return [VAULT_WRAP_PIN, VAULT_SESSION_PIN, ...extra].filter((pin, index, all) => pin.trim() && all.indexOf(pin) === index);
}

function looksLikeSecret(value: string) {
  if (value.length < 8) return false;
  if ([...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) > 126)) return false;
  if (value.startsWith("{")) {
    return decodeReusableSecret(value).secret.length >= 8;
  }
  return true;
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
  label?: string;
  purpose?: string | null;
  category?: string;
}) {
  const vault = readIntegrationVault();
  if (!vault.persist) return vault;
  const provider = providerSlug(input.provider || input.label || "api");
  const catalog = catalogFor(input.label ?? input.provider);
  const last4 = input.last4 ?? secretLast4(input.apiKey) ?? input.apiKey.slice(-4);
  const now = new Date().toISOString();
  const entry: VaultApi = {
    provider,
    label: input.label?.trim() || catalog.label,
    category: input.category ?? catalog.category,
    last4,
    status: input.status ?? "live",
    enabled: true,
    purpose: input.purpose ?? catalog.purpose ?? null,
    notes: input.notes ?? `Key on file ending ${last4}`,
    savedAt: now,
    wrappedKey: wrapKey(input.apiKey, VAULT_WRAP_PIN),
  };
  if (decodeReusableSecret(input.apiKey).secret.startsWith("re_")) {
    rememberResendKey(decodeReusableSecret(input.apiKey).secret);
  }
  const apis = vault.apis.filter((row) => row.provider !== provider);
  apis.unshift(entry);
  const noteId = `vault-${provider}`;
  const notes = vault.notes.filter(
    (row) => row.id !== noteId && row.title.toLowerCase() !== entry.label.toLowerCase(),
  );
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
  if (!vault.persist) return { resendKey: "", theKybKey: "", keys: {} as Record<string, string> };
  const keys: Record<string, string> = {};
  for (const row of vault.apis) {
    if (!row.wrappedKey) continue;
    const value = unwrapKey(row.wrappedKey, pin).trim();
    if (looksLikeSecret(value)) keys[row.provider] = value;
  }
  return {
    resendKey: keys.resend ?? "",
    theKybKey: keys.thekyb ?? "",
    keys,
  };
}

function unwrapProvider(provider: string, pins: string[]) {
  const vault = readIntegrationVault();
  if (!vault.persist) return "";
  const wrapped = vault.apis.find((row) => row.provider === provider)?.wrappedKey;
  if (!wrapped) return "";
  for (const pin of unwrapPins(pins)) {
    const value = unwrapKey(wrapped, pin).trim();
    if (looksLikeSecret(value)) return value;
  }
  return "";
}

export function unwrapVaultApi(provider: string, ...pins: string[]) {
  return unwrapProvider(providerSlug(provider), pins);
}

export function restoreAllVaultKeys(...pins: string[]) {
  const vault = readIntegrationVault();
  if (!vault.persist) return {} as Record<string, string>;
  const keys: Record<string, string> = {};
  for (const row of vault.apis) {
    const value = unwrapProvider(row.provider, pins);
    if (value) keys[row.provider] = value;
  }
  return keys;
}

function firstUnwrapped(provider: "resend" | "thekyb", pins: string[]) {
  const value = unwrapProvider(provider, pins);
  if (provider === "resend") {
    const secret = decodeReusableSecret(value).secret;
    return secret.startsWith("re_") ? secret : "";
  }
  return value.length >= 8 ? decodeReusableSecret(value).secret : "";
}

/** Unwrap the saved Resend key using the first pin that works. */
export function vaultedResendKey(...pins: string[]) {
  return firstUnwrapped("resend", pins);
}

export function vaultedTheKybKey(...pins: string[]) {
  return firstUnwrapped("thekyb", pins);
}

export function vaultResendLast4() {
  return readIntegrationVault().apis.find((row) => row.provider === "resend")?.last4 ?? null;
}

export function vaultApiLast4(titleOrProvider: string) {
  const slug = providerSlug(titleOrProvider);
  const vault = readIntegrationVault();
  return (
    vault.apis.find((row) => row.provider === slug || row.label.toLowerCase() === titleOrProvider.trim().toLowerCase())
      ?.last4 ?? null
  );
}

/** Prefer the live session key, then unwrap the Integrations vault (••••m9EL). */
export function rememberedResendKey(...pins: string[]) {
  const live = sessionStore()?.getItem(LIVE_RESEND_KEY)?.trim() ?? "";
  if (live.startsWith("re_")) return live;
  const fromVault = vaultedResendKey(...pins);
  if (fromVault) return rememberResendKey(fromVault);
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
