import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { AdminShell, buttonClass, ghostButtonClass, inputClass } from "@/components/admin/shell";
import { Panel, StatusPill } from "@/components/console/shell";
import { fetchApiNotepad, fetchIntegrations, type ApiNotepadEntry } from "@/lib/platform";
import {
  deleteApiNotepadEntry,
  resendStatus,
  saveApiNotepadEntry,
  saveResendApiKey,
  sendTestEmail,
  setIntegrationEnabled,
} from "@/lib/platform.functions";
import {
  bootstrapResendStatus,
  bootstrapSaveResendApiKey,
  bootstrapSendTestEmail,
} from "@/lib/staff-bypass.functions";
import { isStaffBypassUnlocked, readStaffBypassPin } from "@/lib/staff-bypass";
import { saveTheKybApiKey, thekybStatus } from "@/lib/thekyb.functions";
import { THEKYB_BACKOFFICE_URL, THEKYB_PROVIDER } from "@/lib/thekyb";

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
  const integrations = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      try {
        return await fetchIntegrations();
      } catch {
        return [];
      }
    },
  });
  const notepad = useQuery({
    queryKey: ["api-notepad"],
    queryFn: async () => {
      try {
        return await fetchApiNotepad();
      } catch {
        return [];
      }
    },
  });
  const toggle = useServerFn(setIntegrationEnabled);
  const pinUnlocked = isStaffBypassUnlocked();
  const test = useServerFn(sendTestEmail);
  const bootstrapTest = useServerFn(bootstrapSendTestEmail);
  const resendInfo = useServerFn(resendStatus);
  const bootstrapStatus = useServerFn(bootstrapResendStatus);
  const saveResend = useServerFn(saveResendApiKey);
  const bootstrapSaveResend = useServerFn(bootstrapSaveResendApiKey);
  const saveEntry = useServerFn(saveApiNotepadEntry);
  const removeEntry = useServerFn(deleteApiNotepadEntry);
  const [testTo, setTestTo] = useState("");
  const [resendKey, setResendKey] = useState("");
  const [editing, setEditing] = useState<ApiNotepadEntry | null>(null);
  const [form, setForm] = useState({ title: "", purpose: "", status: "idea" as ApiNotepadEntry["status"], notes: "" });
  const notepadTitleRef = useRef<HTMLInputElement>(null);
  const [theKybKey, setTheKybKey] = useState("");
  const statusFn = useServerFn(thekybStatus);
  const saveKey = useServerFn(saveTheKybApiKey);
  const theKyb = useQuery({
    queryKey: ["thekyb-status"],
    enabled: !pinUnlocked,
    queryFn: () => statusFn({}),
  });
  const resend = useQuery({
    queryKey: ["resend-status", pinUnlocked],
    queryFn: () =>
      pinUnlocked ? bootstrapStatus({ data: { pin: readStaffBypassPin() } }) : resendInfo({}),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash.replace("#", "") !== "notepad") return;
    setForm({
      title: "Resend",
      purpose: "Transactional email for invites, verification, password reset and alerts",
      status: "keys_needed",
      notes: "Create a sending-access key at resend.com/api-keys and paste it in the Resend API key field above.",
    });
    window.requestAnimationFrame(() => notepadTitleRef.current?.focus());
  }, []);

  const switching = useMutation({
    mutationFn: async (input: { provider: string; enabled: boolean }) => toggle({ data: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["integrations"] }),
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
    mutationFn: async (input: {
      id?: string;
      title: string;
      purpose: string | null;
      status: string;
      notes: string | null;
    }) => saveEntry({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-notepad"] });
      setEditing(null);
      setForm({ title: "", purpose: "", status: "idea", notes: "" });
    },
  });

  const deletingEntry = useMutation({
    mutationFn: async (id: string) => removeEntry({ data: { id } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["api-notepad"] }),
  });

  const savingKey = useMutation({
    mutationFn: async () => saveKey({ data: { apiKey: theKybKey.trim() } }),
    onSuccess: () => {
      setTheKybKey("");
      void queryClient.invalidateQueries({ queryKey: ["thekyb-status"] });
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      void queryClient.invalidateQueries({ queryKey: ["api-notepad"] });
    },
  });

  const savingResend = useMutation({
    mutationFn: async () =>
      pinUnlocked
        ? bootstrapSaveResend({ data: { pin: readStaffBypassPin(), apiKey: resendKey.trim() } })
        : saveResend({ data: { apiKey: resendKey.trim() } }),
    onSuccess: () => {
      setResendKey("");
      void queryClient.invalidateQueries({ queryKey: ["resend-status"] });
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });

  function startEdit(entry: ApiNotepadEntry) {
    setEditing(entry);
    setForm({
      title: entry.title,
      purpose: entry.purpose ?? "",
      status: entry.status,
      notes: entry.notes ?? "",
    });
  }

  return (
    <AdminShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Integrations</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Outside services the platform can use. Keys are held in the secure store and never shown here.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Connected services">
          <div className="space-y-4 text-sm">
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
            <span className="font-medium text-foreground">support@eterfaceid.com</span> unless you change the sender
            under Company details.
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
        </Panel>
      </div>

      <div className="mt-8">
        <Panel title="API notepad">
          <p id="notepad" className="text-sm text-muted-foreground">
            APIs you want to add to the platform. Record them here; connecting one needs its keys, which always go
            into the secure store and are never shown. Paste the Resend sending key in the Resend API key field
            above, then save this notepad row.
          </p>

          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.title.trim()) return;
              savingEntry.mutate({
                ...(editing?.id ? { id: editing.id } : {}),
                title: form.title.trim(),
                purpose: form.purpose.trim() || null,
                status: form.status,
                notes: form.notes.trim() || null,
              });
            }}
          >
            <input
              ref={notepadTitleRef}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="API name (e.g. Resend)"
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
              placeholder="What it is for"
              className={`${inputClass} md:col-span-2`}
            />
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notes — where the key comes from, monthly cost, anything else"
              rows={2}
              className={`${inputClass} md:col-span-2`}
            />
            <div className="flex items-center gap-2 md:col-span-2">
              <button type="submit" className={buttonClass} disabled={savingEntry.isPending}>
                {editing ? "Save changes" : "Add to notepad"}
              </button>
              {editing ? (
                <button
                  type="button"
                  className={ghostButtonClass}
                  onClick={() => {
                    setEditing(null);
                    setForm({ title: "", purpose: "", status: "idea", notes: "" });
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

          <div className="mt-6 space-y-4 text-sm">
            {(notepad.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">Nothing recorded yet.</p>
            ) : null}
            {(notepad.data ?? []).map((entry: ApiNotepadEntry) => (
              <div key={entry.id} className="border-b border-[var(--rule)]/60 pb-4 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{entry.title}</div>
                    {entry.purpose ? <div className="text-xs text-muted-foreground">{entry.purpose}</div> : null}
                    {entry.notes ? <div className="mt-1 text-xs text-muted-foreground">{entry.notes}</div> : null}
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
            ))}
          </div>
        </Panel>
      </div>
    </AdminShell>
  );
}
