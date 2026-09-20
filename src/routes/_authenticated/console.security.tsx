import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ConsoleShell, Panel, StatusPill } from "@/components/console/shell";
import { useRoles, useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/console/security")({
  head: () => ({
    meta: [{ title: "Security — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const { user } = useSession();
  const { mfaRequired } = useRoles();
  const factors = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data;
    },
  });
  const logins = useQuery({
    queryKey: ["login-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("login_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });
  const totp = factors.data?.totp?.length ?? 0;

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Security</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        MFA, sessions and login events for {user?.email}. Privileged roles cannot skip MFA.
      </p>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Multi-factor authentication">
          <p className="text-sm">
            Status:{" "}
            <StatusPill tone={totp ? "approved" : mfaRequired ? "high" : "pending"}>
              {totp ? "enabled" : mfaRequired ? "required" : "optional"}
            </StatusPill>
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Authenticator apps are enforced today. Passkeys and security keys are offered in enrolment.
          </p>
          <Link to="/security/mfa" className="mt-4 inline-block text-sm text-[var(--signal)]">
            Set up or change MFA
          </Link>
        </Panel>
        <Panel title="Recent login events">
          <div className="space-y-2 text-sm">
            {(logins.data ?? []).map((row) => (
              <div key={row.id} className="flex justify-between gap-3">
                <span>
                  {row.event} · {row.success ? "ok" : "failed"}
                </span>
                <span className="text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span>
              </div>
            ))}
            {(logins.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">No login events recorded yet.</p>
            ) : null}
          </div>
        </Panel>
      </div>
    </ConsoleShell>
  );
}
