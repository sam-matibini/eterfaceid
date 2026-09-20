import { createFileRoute } from "@tanstack/react-router";

import { ConsoleShell } from "@/components/console/shell";
import { WebhooksPanel } from "@/components/console/webhooks";
import { useRoles } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/console/webhooks")({
  head: () => ({
    meta: [{ title: "Webhooks — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: WebhooksPage,
});

function WebhooksPage() {
  const { isAdmin, has } = useRoles();
  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Webhooks</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Endpoint secrets are environment-specific. Use <span className="font-mono">whsec_test_</span> in Sandbox and{" "}
        <span className="font-mono">whsec_live_</span> in Live.
      </p>
      <div className="mt-8 max-w-3xl">
        <WebhooksPanel isAdmin={isAdmin || has("webhooks.manage")} />
      </div>
    </ConsoleShell>
  );
}
