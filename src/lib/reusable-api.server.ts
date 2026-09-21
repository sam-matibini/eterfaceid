/** Persist reusable Integration notepad keys (Plaid, Resend, The KYB, custom APIs). Server-only. */

import { catalogFor, decodeReusableSecret, providerSlug, secretLast4 } from "./api-notepad";
import { projectRest } from "./supabase-project";

export async function applyReusableApiKey(provider: string, encodedKey: string) {
  const slug = providerSlug(provider);
  const decoded = decodeReusableSecret(encodedKey);
  if (slug === "resend" && decoded.secret.startsWith("re_")) {
    const { setBootstrapResendKey } = await import("@/lib/email.server");
    setBootstrapResendKey(decoded.secret);
  } else if (slug === "thekyb" && decoded.secret.length >= 8) {
    const { setBootstrapTheKybKey } = await import("@/lib/thekyb.server");
    setBootstrapTheKybKey(decoded.secret);
  } else if (slug === "plaid" && decoded.secret) {
    const { setBootstrapPlaidCredentials } = await import("@/lib/plaid.server");
    setBootstrapPlaidCredentials(decoded);
  }
}

export async function persistReusableApiKey(input: {
  provider: string;
  encodedKey: string;
  label?: string;
  category?: string;
  purpose?: string | null;
  notes?: string | null;
  updatedBy?: string | null;
}) {
  const provider = providerSlug(input.provider);
  const catalog = catalogFor(input.label ?? input.provider);
  const last4 = secretLast4(input.encodedKey);
  if (!last4) throw new Error("Paste a reusable API key first.");
  await applyReusableApiKey(provider, input.encodedKey);

  const now = new Date().toISOString();
  const secret = await projectRest("integration_secrets", {
    method: "POST",
    query: "on_conflict=provider",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      provider,
      api_key: input.encodedKey,
      last4,
      updated_at: now,
      ...(input.updatedBy ? { updated_by: input.updatedBy } : {}),
    },
  });

  const settingBody = {
    provider,
    label: input.label?.trim() || catalog.label,
    category: input.category ?? catalog.category,
    enabled: true,
    status: "live",
    last_checked_at: now,
    last_error: null,
    config: { last4, purpose: input.purpose ?? catalog.purpose ?? null },
  };

  const patched = await projectRest("integration_settings", {
    method: "PATCH",
    query: `provider=eq.${provider}`,
    prefer: "return=minimal",
    body: {
      enabled: true,
      status: "live",
      last_checked_at: now,
      last_error: null,
      config: settingBody.config,
      label: settingBody.label,
      category: settingBody.category,
    },
  });
  if (patched.error || patched.status === 404 || patched.status === 406) {
    await projectRest("integration_settings", {
      method: "POST",
      query: "on_conflict=provider",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: settingBody,
    });
  }

  return { last4, provider, persisted: !secret.error, label: settingBody.label };
}
