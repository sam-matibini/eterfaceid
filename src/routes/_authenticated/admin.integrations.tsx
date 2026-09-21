import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { AdminShell, buttonClass, ghostButtonClass, inputClass } from "@/components/admin/shell";
import { Panel, StatusPill } from "@/components/console/shell";
import { fetchApiNotepad, fetchIntegrations, type ApiNotepadEntry } from "@/lib/platform";
import {
  API_CATALOG,
  applyCatalogFields,
  catalogFor,
  encodeReusableSecret,
  providerSlug,
  secretLast4,
} from "@/lib/api-notepad";
import {
  deleteApiNotepadEntry,
  resendStatus,
  saveApiNotepadEntry,
  saveResendApiKey,
  saveReusableApiKey,
  sendTestEmail,
  setIntegrationEnabled,
} from "@/lib/platform.functions";
import {
  bootstrapResendStatus,
  bootstrapRestoreApiKeys,
  bootstrapSaveResendApiKey,
  bootstrapSaveReusableApiKey,
  bootstrapSaveTheKybApiKey,
  bootstrapSendTestEmail,
  bootstrapTheKybStatus,
} from "@/lib/staff-bypass.functions";
import { DEFAULT_STAFF_BYPASS_PIN, isStaffBypassUnlocked, readStaffBypassPin } from "@/lib/staff-bypass";
import { saveTheKybApiKey, thekybStatus } from "@/lib/thekyb.functions";
import { THEKYB_BACKOFFICE_URL, THEKYB_PROVIDER } from "@/lib/thekyb";
import {
  isApiPersistEnabled,
  readIntegrationVault,
  removeVaultNote,
  rememberResendKey,
  rememberedResendKey,
  restoreAllVaultKeys,
  vaultedTheKybKey,
  setApiPersistEnabled,
  setVaultApiEnabled,
  upsertVaultApi,
  upsertVaultNote,
  vaultApiLast4,
  vaultAsIntegrationRows,
} from "@/lib/integration-vault";

const EMPTY_NOTEPAD = {
  title: "",
  purpose: "",
  status: "idea" as ApiNotepadEntry["status"],
  notes: "",
  apiKey: "",
  clientId: "",
  env: "" as "" | "sandbox" | "production",
};

export const Route = createFileRoute("/_authenticated/admin/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — eterfaceID app admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const queryClient = useQueryClient();
  const pinUnlocked = isStaffBypassUnlocked();
  const vault = useQuery({
    queryKey: ["integration-vault"],
    queryFn: async () => readIntegrationVault(),
  });
  const integrations = useQuery({
    queryKey: ["integrations", pinUnlocked],
    queryFn: async () => {
      if (pinUnlocked) return vaultAsIntegrationRows();
      try {
        return await fetchIntegrations();
      } catch {
        return vaultAsIntegrationRows();
      }
    },
  });
  const notepad = useQuery({
    queryKey: ["api-notepad", pinUnlocked],
    queryFn: async () => {
      if (pinUnlocked) return readIntegrationVault().notes;
      try {
        return await fetchApiNotepad();
      } catch {
        return readIntegrationVault().notes;
      }
    },
  });
  const toggle = useServerFn(setIntegrationEnabled);
  const test = useServerFn(sendTestEmail);
  const bootstrapTest = useServerFn(bootstrapSendTestEmail);
  const resendInfo = useServerFn(resendStatus);
  const bootstrapStatus = useServerFn(bootstrapResendStatus);
  const saveResend = useServerFn(saveResendApiKey);
  const bootstrapSaveResend = useServerFn(bootstrapSaveResendApiKey);
  const saveEntry = useServerFn(saveApiNotepadEntry);
  const saveReusable = useServerFn(saveReusableApiKey);
  const bootstrapSaveReusable = useServerFn(bootstrapSaveReusableApiKey);
  const removeEntry = useServerFn(deleteApiNotepadEntry);
  const [testTo, setTestTo] = useState("");
  const [resendKey, setResendKey] = useState("");
  const [editing, setEditing] = useState<ApiNotepadEntry | null>(null);
  const [form, setForm] = useState(EMPTY_NOTEPAD);
  const notepadTitleRef = useRef<HTMLInputElement>(null);
  const [theKybKey, setTheKybKey] = useState("");
  const statusFn = useServerFn(thekybStatus);
  const saveKey = useServerFn(saveTheKybApiKey);
  const bootstrapStatusTheKyb = useServerFn(bootstrapTheKybStatus);
  const bootstrapSaveTheKyb = useServerFn(bootstrapSaveTheKybApiKey);
  const restoreApis = useServerFn(bootstrapRestoreApiKeys);
  const [persistApis, setPersistApis] = useState(true);
  const theKyb = useQuery({
    queryKey: ["thekyb-status", pinUnlocked],
    queryFn: () =>
      pinUnlocked ? bootstrapStatusTheKyb({ data: { pin: readStaffBypassPin() } }) : statusFn({}),
  });
  const resend = useQuery({
    queryKey: ["resend-status", pinUnlocked],
    queryFn: () =>
      pinUnlocked ? bootstrapStatus({ data: { pin: readStaffBypassPin() } }) : resendInfo({}),
  });

  useEffect(() => {
    setPersistApis(isApiPersistEnabled());
  }, []);

  useEffect(() => {
    const pin = readStaffBypassPin() || (pinUnlocked ? DEFAULT_STAFF_BYPASS_PIN : "");
    const resendKey = rememberedResendKey(pin, DEFAULT_STAFF_BYPASS_PIN, "session");
    const theKybKey = vaultedTheKybKey(pin, DEFAULT_STAFF_BYPASS_PIN, "session");
    const keys = restoreAllVaultKeys(pin, DEFAULT_STAFF_BYPASS_PIN, "session");
    if (resendKey) rememberResendKey(resendKey);
    const payloadKeys = Object.entries(keys)
      .filter(([provider, apiKey]) => apiKey && provider !== "resend" && provider !== "thekyb")
      .map(([provider, apiKey]) => ({ provider, apiKey }));
    if (!resendKey && !theKybKey && payloadKeys.length === 0) return;
    if (!pinUnlocked && !pin) return;
    void restoreApis({
      data: {
        pin: pin || DEFAULT_STAFF_BYPASS_PIN,
        ...(resendKey ? { resendKey } : {}),
        ...(theKybKey ? { theKybKey } : {}),
        ...(payloadKeys.length ? { keys: payloadKeys } : {}),
      },
    }).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["resend-status"] });
      void queryClient.invalidateQueries({ queryKey: ["thekyb-status"] });
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    });
  }, [pinUnlocked, restoreApis, queryClient]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash.replace("#", "") !== "notepad") return;
    window.requestAnimationFrame(() => notepadTitleRef.current?.focus());
  }, []);

  const switching = useMutation({
    mutationFn: async (input: { provider: string; enabled: boolean }) => {
      if (pinUnlocked) {
        setVaultApiEnabled(input.provider, input.enabled);
        return { ok: true };
      }
      return toggle({ data: input });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      void queryClient.invalidateQueries({ queryKey: ["integration-vault"] });
    },
  });

  const testing = useMutation({
    mutationFn: async () =>
      pinUnlocked
        ? bootstrapTest({ data: { pin: readStaffBypassPin(), to: testTo.trim() } })
        : test({ data: { to: testTo.trim() } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      void queryClient.invalidateQueries({ queryKey: ["email-log"] });
      void queryClient.invalidateQueries({ queryKey: ["resend-status"] });
    },
  });

  const savingEntry = useMutation({
    mutationFn: async (input: typeof EMPTY_NOTEPAD & { id?: string }) => {
      const catalog = catalogFor(input.title);
      const provider = providerSlug(input.title);
      const pin = readStaffBypassPin();
      const encoded = input.apiKey.trim()
        ? encodeReusableSecret({
            secret: input.apiKey,
            clientId: input.clientId,
            env: input.env,
          })
        : "";
      if (encoded && catalog.needsClientId && !input.clientId.trim()) {
        throw new Error(`${catalog.label} needs a ${catalog.clientIdLabel.toLowerCase()} and ${catalog.keyLabel.toLowerCase()}.`);
      }
      const status = encoded ? "live" : input.status;
      const last4 = encoded ? secretLast4(encoded) : null;
      const notes =
        encoded && !input.notes.trim() ? `Key on file ending ${last4}` : input.notes.trim() || null;
      if (encoded && isApiPersistEnabled()) {
        upsertVaultApi({
          provider,
          apiKey: encoded,
          pin: pin || "session",
          label: input.title.trim(),
          purpose: input.purpose.trim() || catalog.purpose,
          notes,
          category: catalog.category,
        });
      }
      if (encoded) {
        const payload = {
          provider,
          apiKey: encoded,
          label: input.title.trim(),
          category: catalog.category,
          purpose: input.purpose.trim() || catalog.purpose,
          notes,
        };
        if (pinUnlocked) {
          await bootstrapSaveReusable({ data: { pin: pin || DEFAULT_STAFF_BYPASS_PIN, ...payload } });
        } else {
          await saveReusable({ data: payload });
        }
      }
      if (pinUnlocked) {
        if (!encoded) {
          upsertVaultNote({
            id: input.id,
            title: input.title,
            purpose: input.purpose.trim() || null,
            status,
            notes,
          });
        }
      } else {
        await saveEntry({
          data: {
            ...(input.id && !input.id.startsWith("vault-") ? { id: input.id } : {}),
            title: input.title,
            purpose: input.purpose.trim() || null,
            status,
            notes,
          },
        });
      }
      return { ok: true as const, last4, label: input.title.trim() };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-notepad"] });
      void queryClient.invalidateQueries({ queryKey: ["integration-vault"] });
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setEditing(null);
      setForm(EMPTY_NOTEPAD);
    },
  });

  const deletingEntry = useMutation({
    mutationFn: async (id: string) => {
      if (pinUnlocked) {
        removeVaultNote(id);
        return { ok: true };
      }
      return removeEntry({ data: { id } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-notepad"] });
      void queryClient.invalidateQueries({ queryKey: ["integration-vault"] });
    },
  });

  const savingKey = useMutation({
    mutationFn: async () => {
      const apiKey = theKybKey.trim();
      const pin = readStaffBypassPin();
      const remember = () => {
        if (isApiPersistEnabled() && apiKey.length >= 8) {
          upsertVaultApi({ provider: THEKYB_PROVIDER, apiKey, pin: pin || "session", last4: apiKey.slice(-4) });
        }
      };
      try {
        const result = pinUnlocked
          ? await bootstrapSaveTheKyb({ data: { pin, apiKey } })
          : await saveKey({ data: { apiKey } });
        remember();
        return result;
      } catch (error) {
        remember();
        throw error;
      }
    },
    onSuccess: () => {
      setTheKybKey("");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["thekyb-status"] });
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      void queryClient.invalidateQueries({ queryKey: ["api-notepad"] });
      void queryClient.invalidateQueries({ queryKey: ["integration-vault"] });
    },
  });

  const savingResend = useMutation({
    mutationFn: async () => {
      const apiKey = resendKey.trim();
      const pin = readStaffBypassPin();
      const result = pinUnlocked
        ? await bootstrapSaveResend({ data: { pin, apiKey } })
        : await saveResend({ data: { apiKey } });
      if (isApiPersistEnabled()) {
        upsertVaultApi({ provider: "resend", apiKey, pin: pin || "session", last4: apiKey.slice(-4) });
      }
      return result;
    },
    onSuccess: () => {
      setResendKey("");
      void queryClient.invalidateQueries({ queryKey: ["resend-status"] });
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      void queryClient.invalidateQueries({ queryKey: ["api-notepad"] });
      void queryClient.invalidateQueries({ queryKey: ["integration-vault"] });
    },
  });

  function startEdit(entry: ApiNotepadEntry) {
    const catalog = applyCatalogFields(entry.title, {
      purpose: entry.purpose ?? "",
      notes: entry.notes ?? "",
    });
    setEditing(entry);
    setForm({
      ...EMPTY_NOTEPAD,
      title: entry.title,
      purpose: catalog.purpose,
      status: entry.status,
      notes: catalog.notes,
      env: providerSlug(entry.title) === "plaid" ? "production" : "",
    });
  }

  function fillCatalog(slug: keyof typeof API_CATALOG) {
    const catalog = API_CATALOG[slug];
    setEditing(null);
    setForm({
      ...EMPTY_NOTEPAD,
      title: catalog.label,
      purpose: catalog.purpose,
      status: "keys_needed",
      notes: catalog.notes,
      env: slug === "plaid" ? "sandbox" : "",
    });
    window.requestAnimationFrame(() => notepadTitleRef.current?.focus());
  }

  const catalog = catalogFor(form.title);
  const showClientId = catalog.needsClientId || Boolean(form.clientId);
  const showEnv = providerSlug(form.title) === "plaid" || Boolean(form.env);

  return (
    <AdminShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Integrations</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Outside services the platform can use. Keys are held in the secure store and never shown here.
      </p>

      <div className="mt-8">
        <Panel title="Save APIs to the system">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={persistApis}
              onChange={(event) => {
                const next = event.target.checked;
                setPersistApis(next);
                setApiPersistEnabled(next);
                void queryClient.invalidateQueries({ queryKey: ["integration-vault"] });
                void queryClient.invalidateQueries({ queryKey: ["integrations"] });
                void queryClient.invalidateQueries({ queryKey: ["api-notepad"] });
              }}
            />
            <span>
              Keep Resend, The KYB, Plaid and other notepad keys for future sessions. Keys are restored when you
              unlock with the staff access code, so a Worker restart does not drop the connections.
            </span>
          </label>
          {(vault.data?.apis.length ?? 0) > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Saved now:{" "}
              {vault.data?.apis
                .map((row) => `${row.label}${row.last4 ? ` (••••${row.last4})` : ""}`)
                .join(", ")}
              .
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Nothing stored yet. Leave this on, then save a key — it is recorded here automatically.
            </p>
          )}
        </Panel>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Connected services">
          <div className="space-y-4 text-sm">
            {(integrations.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">
                No APIs saved yet. Turn on Save APIs to the system, then add a reusable key in the notepad (for
                example Plaid for KYC and AML).
              </p>
            ) : null}
            {(integrations.data ?? []).map((row: any) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)]/60 pb-4 last:border-0">
                <div>
                  <div className="font-medium">{row.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.category}
                    {row.last_checked_at ? ` · last used ${new Date(row.last_checked_at).toLocaleString()}` : ""}
                  </div>
                  {row.last_error ? (
                    <div className="mt-1 text-xs text-[var(--signal)]">{row.last_error}</div>
                  ) : null}
                  {row.provider === THEKYB_PROVIDER && theKyb.data?.last4 ? (
                    <div className="mt-1 text-xs text-muted-foreground">Key on file ending {theKyb.data.last4}</div>
                  ) : null}
                  {row.provider === "resend" && resend.data?.last4 ? (
                    <div className="mt-1 text-xs text-muted-foreground">Key on file ending {resend.data.last4}</div>
                  ) : null}
                  {row.provider !== "resend" && row.provider !== THEKYB_PROVIDER && vaultApiLast4(row.provider) ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Key on file ending {vaultApiLast4(row.provider)}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={row.enabled ? "approved" : "pending"}>
                    {row.enabled ? "on" : "off"}
                  </StatusPill>
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={() => switching.mutate({ provider: row.provider, enabled: !row.enabled })}
                  >
                    {row.enabled ? "Turn off" : "Turn on"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="The KYB API key">
          <p className="text-sm text-muted-foreground">
            Generate the secret key in{" "}
            <a href={THEKYB_BACKOFFICE_URL} className="underline underline-offset-4" target="_blank" rel="noreferrer">
              The KYB back office
            </a>{" "}
            (Settings → API integration), then paste it here. It is stored in the secure store and never shown
            again.
          </p>
          <form
            className="mt-4 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (theKybKey.trim().length >= 8) savingKey.mutate();
            }}
          >
            <input
              id="thekyb-api-key"
              type="password"
              autoComplete="off"
              value={theKybKey}
              onChange={(e) => setTheKybKey(e.target.value)}
              placeholder={theKyb.data?.last4 ? `Replace key ending ${theKyb.data.last4}` : "Paste The KYB API secret key"}
              className={`${inputClass} flex-1`}
            />
            <button type="submit" className={buttonClass} disabled={savingKey.isPending || theKybKey.trim().length < 8}>
              {savingKey.isPending ? "Saving…" : "Save key"}
            </button>
          </form>
          {savingKey.data ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Key saved{savingKey.data.last4 ? ` (${savingKey.data.last4})` : ""}. The KYB is ready.
            </p>
          ) : null}
          {savingKey.isError ? (
            <p className="mt-3 text-sm text-[var(--signal)]">{(savingKey.error as Error).message}</p>
          ) : null}
        </Panel>

        <Panel title="Resend API key">
          <p className="text-sm text-muted-foreground">
            Create a sending-access key in{" "}
            <a href="https://resend.com/api-keys" className="underline underline-offset-4" target="_blank" rel="noreferrer">
              Resend → API Keys
            </a>
            , then paste it here. Emails go out from{" "}
            <span className="font-medium text-foreground">info@verify.eterfaceid.com</span> (the domain verified in
            Resend). Apex @eterfaceid.com addresses are remapped to that domain automatically.
          </p>
          <form
            className="mt-4 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (resendKey.trim().startsWith("re_")) savingResend.mutate();
            }}
          >
            <input
              id="resend-api-key"
              type="password"
              autoComplete="off"
              value={resendKey}
              onChange={(e) => setResendKey(e.target.value)}
              placeholder={
                resend.data?.last4 ? `Replace key ending ${resend.data.last4}` : "Paste Resend API key (re_…)"
              }
              className={`${inputClass} flex-1`}
            />
            <button
              type="submit"
              className={buttonClass}
              disabled={savingResend.isPending || !resendKey.trim().startsWith("re_")}
            >
              {savingResend.isPending ? "Saving…" : "Save key"}
            </button>
          </form>
          {savingResend.data ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Key saved{savingResend.data.last4 ? ` (••••${savingResend.data.last4})` : ""}. Send a test email next.
            </p>
          ) : null}
          {savingResend.isError ? (
            <p className="mt-3 text-sm text-[var(--signal)]">{(savingResend.error as Error).message}</p>
          ) : null}
          {resend.data?.lastError ? (
            <p className="mt-3 text-sm text-[var(--signal)]">{resend.data.lastError}</p>
          ) : null}
        </Panel>

        <Panel title="Send a test email">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (testTo.trim()) testing.mutate();
            }}
          >
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              className={`${inputClass} flex-1`}
            />
            <button type="submit" className={buttonClass} disabled={testing.isPending}>
              Send test
            </button>
          </form>
          {testing.data ? (
            <p className={`mt-3 text-sm ${testing.data.sent ? "text-muted-foreground" : "text-[var(--signal)]"}`}>
              {testing.data.sent
                ? "Test email sent. Check the inbox and the Email log."
                : `Not sent: ${testing.data.detail ?? testing.data.reason ?? "unknown reason"}`}
            </p>
          ) : null}
          {testing.isError ? (
            <p className="mt-3 text-sm text-[var(--signal)]">{(testing.error as Error).message}</p>
          ) : null}
          <p className="mt-5 border-t border-[var(--rule)] pt-4 text-xs text-muted-foreground">
            Invites, welcomes, verification and password-reset messages all use this Resend connection. Check App
            admin → Email log if a send is not accepted.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            To send Supabase Auth mail through the same Resend account, set Authentication → Hooks → Send Email to{" "}
            <code className="break-all">
              {typeof window !== "undefined" ? `${window.location.origin}/api/hooks/auth-email` : "/api/hooks/auth-email"}
            </code>
            .
          </p>
        </Panel>
      </div>

      <div className="mt-8">
        <Panel title="API notepad">
          <p id="notepad" className="text-sm text-muted-foreground">
            Add a reusable API key the platform can keep using. Name the service, say what it is for, then paste the
            key. Secrets go into the secure store and are never shown again. Example: Plaid for KYC and AML — paste
            the client ID and secret from dashboard.plaid.com.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(API_CATALOG) as Array<keyof typeof API_CATALOG>).map((slug) => (
              <button
                key={slug}
                type="button"
                className={ghostButtonClass}
                onClick={() => fillCatalog(slug)}
              >
                {API_CATALOG[slug].label}
              </button>
            ))}
          </div>

          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.title.trim()) return;
              savingEntry.mutate({
                ...(editing?.id ? { id: editing.id } : {}),
                ...form,
                title: form.title.trim(),
              });
            }}
          >
            <input
              ref={notepadTitleRef}
              value={form.title}
              onChange={(e) => {
                const title = e.target.value;
                const next = applyCatalogFields(title, { purpose: form.purpose, notes: form.notes });
                setForm({
                  ...form,
                  title,
                  purpose: next.purpose,
                  notes: next.notes,
                  env: providerSlug(title) === "plaid" ? form.env || "sandbox" : form.env,
                });
              }}
              placeholder="API name (e.g. Plaid)"
              className={inputClass}
            />
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ApiNotepadEntry["status"] })}
              className={inputClass}
            >
              <option value="idea">Idea</option>
              <option value="keys_needed">Waiting on keys</option>
              <option value="connecting">Connecting</option>
              <option value="live">Live</option>
            </select>
            <input
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              placeholder={catalog.purpose || "What it is for (e.g. KYC and AML)"}
              className={`${inputClass} md:col-span-2`}
            />
            {showClientId ? (
              <input
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                placeholder={catalog.clientIdLabel}
                autoComplete="off"
                className={inputClass}
              />
            ) : null}
            <input
              type="password"
              autoComplete="off"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder={
                vaultApiLast4(form.title)
                  ? `Replace ${catalog.keyLabel.toLowerCase()} ending ${vaultApiLast4(form.title)}`
                  : catalog.keyLabel
              }
              className={showClientId ? inputClass : `${inputClass} md:col-span-2`}
            />
            {showEnv ? (
              <select
                value={form.env || "sandbox"}
                onChange={(e) => setForm({ ...form, env: e.target.value as "sandbox" | "production" })}
                className={`${inputClass} md:col-span-2`}
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Production (live KYC / AML)</option>
              </select>
            ) : null}
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={catalog.notes || "Notes — where the key comes from, monthly cost, anything else"}
              rows={2}
              className={`${inputClass} md:col-span-2`}
            />
            <div className="flex items-center gap-2 md:col-span-2">
              <button
                type="submit"
                className={buttonClass}
                disabled={
                  savingEntry.isPending ||
                  !form.title.trim() ||
                  (Boolean(form.apiKey.trim()) && form.apiKey.trim().length < 8)
                }
              >
                {form.apiKey.trim() ? "Save API key" : editing ? "Save changes" : "Add to notepad"}
              </button>
              {editing ? (
                <button
                  type="button"
                  className={ghostButtonClass}
                  onClick={() => {
                    setEditing(null);
                    setForm(EMPTY_NOTEPAD);
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
          {savingEntry.isError ? (
            <p className="mt-2 text-sm text-[var(--signal)]">{(savingEntry.error as Error).message}</p>
          ) : null}
          {savingEntry.isSuccess && savingEntry.data.last4 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Key saved (••••{savingEntry.data.last4}). {savingEntry.data.label} is ready for reuse.
            </p>
          ) : null}

          <div className="mt-6 space-y-4 text-sm">
            {(notepad.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">Nothing recorded yet.</p>
            ) : null}
            {(notepad.data ?? []).map((entry: ApiNotepadEntry) => {
              const last4 = vaultApiLast4(entry.title);
              return (
                <div key={entry.id} className="border-b border-[var(--rule)]/60 pb-4 last:border-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{entry.title}</div>
                      {entry.purpose ? <div className="text-xs text-muted-foreground">{entry.purpose}</div> : null}
                      {entry.notes ? <div className="mt-1 text-xs text-muted-foreground">{entry.notes}</div> : null}
                      {last4 ? (
                        <div className="mt-1 text-xs text-muted-foreground">Key on file ending {last4}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusPill tone={entry.status === "live" ? "approved" : "pending"}>{entry.status}</StatusPill>
                      <button type="button" className={ghostButtonClass} onClick={() => startEdit(entry)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={ghostButtonClass}
                        onClick={() => deletingEntry.mutate(entry.id)}
                        disabled={deletingEntry.isPending}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </AdminShell>
  );
}
