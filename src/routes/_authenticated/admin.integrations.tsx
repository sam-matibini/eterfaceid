import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { AdminShell, buttonClass, ghostButtonClass, inputClass } from "@/components/admin/shell";
import { Panel, StatusPill } from "@/components/console/shell";
import { fetchApiNotepad, fetchIntegrations, type ApiNotepadEntry } from "@/lib/platform";
import {
  deleteApiNotepadEntry,
  saveApiNotepadEntry,
  sendTestEmail,
  setIntegrationEnabled,
} from "@/lib/platform.functions";

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
  const integrations = useQuery({ queryKey: ["integrations"], queryFn: fetchIntegrations });
  const toggle = useServerFn(setIntegrationEnabled);
  const test = useServerFn(sendTestEmail);
  const [testTo, setTestTo] = useState("");

  const switching = useMutation({
    mutationFn: async (input: { provider: string; enabled: boolean }) => toggle({ data: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const testing = useMutation({
    mutationFn: async () => test({ data: { to: testTo.trim() } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      void queryClient.invalidateQueries({ queryKey: ["email-log"] });
    },
  });

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
            <p className="mt-3 text-sm text-muted-foreground">
              {testing.data.sent ? "Test email sent." : `Not sent: ${testing.data.reason ?? "unknown reason"}`}
            </p>
          ) : null}
          {testing.isError ? (
            <p className="mt-3 text-sm text-[var(--signal)]">{(testing.error as Error).message}</p>
          ) : null}
          <p className="mt-5 border-t border-[var(--rule)] pt-4 text-xs text-muted-foreground">
            Emails come from the sender name and address set under Company details. Until your own domain is
            verified with the email provider, delivery is limited to your own address.
          </p>
        </Panel>
      </div>
    </AdminShell>
  );
}
