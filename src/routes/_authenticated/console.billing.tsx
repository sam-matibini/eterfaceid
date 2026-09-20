import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ConsoleShell, Panel, StatusPill } from "@/components/console/shell";
import { useOrganization } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/console/billing")({
  head: () => ({
    meta: [{ title: "Billing — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: BillingPage,
});

function BillingPage() {
  const { organization } = useOrganization();
  const sub = useQuery({
    queryKey: ["org-subscription", organization?.orgId],
    enabled: Boolean(organization?.orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_subscriptions")
        .select("*, plans(name, code, price_amount, included_volume)")
        .eq("org_id", organization!.orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Billing</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Plan, included volume and Live entitlement for {organization?.name}. Only administrators can manage billing.
      </p>
      <div className="mt-8 max-w-xl">
        <Panel title="Current plan">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt>Plan</dt>
              <dd>{(sub.data as { plans?: { name?: string } } | null)?.plans?.name ?? "Sandbox / trial"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Status</dt>
              <dd>
                <StatusPill tone="pending">{(sub.data as { status?: string } | null)?.status ?? "trial"}</StatusPill>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Live API</dt>
              <dd>{organization?.orgLiveAccess ?? "locked"}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </ConsoleShell>
  );
}
