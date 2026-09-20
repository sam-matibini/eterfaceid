import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { ConsoleShell, inkButtonClass, Panel, StatusPill } from "@/components/console/shell";
import { useOrganization, useRoles, useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { decideLiveAccess, requestLiveAccess } from "@/lib/access.functions";
import { fetchLiveAccessRequests } from "@/lib/console";

export const Route = createFileRoute("/_authenticated/console/live-access")({
  head: () => ({
    meta: [{ title: "Live access — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: LiveAccessPage,
});

function LiveAccessPage() {
  const { organization } = useOrganization();
  const { isAdmin } = useRoles();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const request = useServerFn(requestLiveAccess);
  const decide = useServerFn(decideLiveAccess);
  const [reason, setReason] = useState("Production integration for customer onboarding.");
  const rows = useQuery({ queryKey: ["live-access-requests"], queryFn: fetchLiveAccessRequests, retry: false });

  const apply = useMutation({
    mutationFn: async () =>
      request({
        data: {
          reason,
          origin: window.location.origin,
          scopes: ["live.api", "kyc.reports.view", "kyb.reports.view", "aml.results.view"],
        },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["live-access-requests"] }),
  });

  const decideMut = useMutation({
    mutationFn: async (vars: { id: string; decision: "approved" | "rejected" }) =>
      decide({ data: { ...vars, origin: window.location.origin } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["live-access-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["my-org"] });
    },
  });

  const mine = (rows.data ?? []).filter((r) => r.user_id === user?.id);
  const pending = (rows.data ?? []).filter((r) => r.status === "pending");

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Live API Access</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Live access is not granted because someone is a developer. An organization administrator must approve it.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Your access">
          <ul className="space-y-2 text-sm">
            <li>✓ Sandbox Access</li>
            <li>✓ API Development</li>
            <li>✓ API Logs</li>
            <li>✓ KYC Reports (when permitted)</li>
          </ul>
          <p className="mt-4 text-sm">
            Live API Access ·{" "}
            <StatusPill tone={organization?.liveAccess ? "approved" : "closed"}>
              {organization?.liveAccess ? "Authorized" : "Not Authorized"}
            </StatusPill>
          </p>
          {!organization?.liveAccess ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                apply.mutate();
              }}
            >
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Reason
                <textarea
                  className="mt-1 min-h-24 w-full rounded-md border border-[var(--rule)] bg-background p-3 text-sm normal-case tracking-normal text-foreground"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <p className="text-xs text-muted-foreground">Requested: Live API, KYC API, KYB API, AML Screening API</p>
              <button type="submit" className={inkButtonClass} disabled={apply.isPending}>
                Request Live Access
              </button>
              {apply.isError ? (
                <p className="text-sm text-[var(--signal)]">{(apply.error as Error).message}</p>
              ) : null}
            </form>
          ) : null}
          {mine.length ? (
            <div className="mt-4 space-y-2 text-sm">
              {mine.map((row) => (
                <div key={row.id}>
                  Your request ·{" "}
                  <StatusPill tone={row.status === "approved" ? "approved" : row.status}>{row.status}</StatusPill>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>

        {isAdmin ? (
          <Panel title="Live Access Request queue">
            <div className="space-y-4">
              {pending.map((row) => (
                <LiveRequestCard
                  key={row.id}
                  row={row}
                  onDecide={(decision) => decideMut.mutate({ id: row.id, decision })}
                />
              ))}
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending Live access requests.</p>
              ) : null}
            </div>
          </Panel>
        ) : (
          <Panel title="Organization Live status">
            <p className="text-sm">
              Company Live API:{" "}
              <StatusPill tone={organization?.orgLiveAccess === "approved" ? "approved" : "pending"}>
                {organization?.orgLiveAccess ?? "locked"}
              </StatusPill>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              The organization must complete Go live before anyone can issue production keys.
            </p>
          </Panel>
        )}
      </div>
    </ConsoleShell>
  );
}

function LiveRequestCard({
  row,
  onDecide,
}: {
  row: {
    id: string;
    user_id: string;
    reason: string | null;
    scopes: string[] | null;
    created_at: string;
  };
  onDecide: (decision: "approved" | "rejected") => void;
}) {
  const profile = useQuery({
    queryKey: ["profile", row.user_id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("email, full_name").eq("id", row.user_id).maybeSingle();
      return data;
    },
  });
  return (
    <div className="border border-[var(--rule)] p-3 text-sm">
      <div className="font-medium">{profile.data?.full_name ?? "Team member"}</div>
      <div className="text-muted-foreground">{profile.data?.email}</div>
      <p className="mt-2">Requested:</p>
      <ul className="mt-1 text-xs">
        {(row.scopes ?? []).map((s) => (
          <li key={s}>✓ {s}</li>
        ))}
      </ul>
      <p className="mt-2 text-muted-foreground">Reason: {row.reason}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className={inkButtonClass} onClick={() => onDecide("approved")}>
          Approve
        </button>
        <button
          type="button"
          className="h-10 rounded-md border border-[var(--rule)] px-4 text-sm"
          onClick={() => onDecide("rejected")}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
