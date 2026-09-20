import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ConsoleShell, Panel, StatusPill } from "@/components/console/shell";
import { useEnvironment } from "@/hooks/useEnvironment";
import { useOrganization } from "@/hooks/useSession";
import { fetchApiKeys, fetchWebhookEndpoints } from "@/lib/console";

export const Route = createFileRoute("/_authenticated/console/environments")({
  head: () => ({
    meta: [{ title: "Environments — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: EnvironmentsPage,
});

function mask(prefix: string | undefined) {
  return `${prefix ?? "ef_"}********`;
}

function EnvironmentsPage() {
  const { organization } = useOrganization();
  const { setEnvironment } = useEnvironment();
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: fetchApiKeys });
  const hooks = useQuery({ queryKey: ["webhook-endpoints"], queryFn: fetchWebhookEndpoints });

  function sample(env: "sandbox" | "live", kind: string) {
    return (keys.data ?? []).find((k) => k.environment === env && (k.key_kind ?? "secret") === kind && !k.revoked_at);
  }

  function hookSecret(env: "sandbox" | "live") {
    return (hooks.data ?? []).find((h) => h.environment === env && h.enabled !== false);
  }

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Environments</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Sandbox is a test environment. Live is production. API credentials are completely separate.
      </p>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title="SANDBOX"
          action={
            <button type="button" className="text-xs text-[var(--signal)]" onClick={() => setEnvironment("sandbox")}>
              Use sandbox
            </button>
          }
        >
          <p className="text-sm text-muted-foreground">Test environment</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">Publishable Key</dt>
              <dd className="font-mono text-xs">{mask(sample("sandbox", "publishable")?.key_prefix ?? "ef_test_")}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">Secret Key</dt>
              <dd className="font-mono text-xs">{mask(sample("sandbox", "secret")?.key_prefix ?? "ef_test_secret_")}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">Webhook Secret</dt>
              <dd className="font-mono text-xs">
                {hookSecret("sandbox") ? "whsec_test_********" : "whsec_test_********"}
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel
          title="LIVE"
          action={
            <button type="button" className="text-xs text-[var(--signal)]" onClick={() => setEnvironment("live")}>
              Use live
            </button>
          }
        >
          <p className="text-sm text-muted-foreground">Production environment</p>
          <p className="mt-2">
            <StatusPill tone={organization?.orgLiveAccess === "approved" ? "approved" : "pending"}>
              org {organization?.orgLiveAccess ?? "locked"}
            </StatusPill>{" "}
            <StatusPill tone={organization?.liveAccess ? "approved" : "closed"}>
              user {organization?.liveAccess ? "authorized" : "not authorized"}
            </StatusPill>
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">Publishable Key</dt>
              <dd className="font-mono text-xs">{mask(sample("live", "publishable")?.key_prefix ?? "ef_live_")}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">Secret Key</dt>
              <dd className="font-mono text-xs">{mask(sample("live", "secret")?.key_prefix ?? "ef_live_secret_")}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">Webhook Secret</dt>
              <dd className="font-mono text-xs">whsec_live_********</dd>
            </div>
          </dl>
          {!organization?.liveAccess ? (
            <Link to="/console/live-access" className="mt-4 inline-block text-sm text-[var(--signal)]">
              Request Live Access
            </Link>
          ) : null}
        </Panel>
      </div>
    </ConsoleShell>
  );
}
