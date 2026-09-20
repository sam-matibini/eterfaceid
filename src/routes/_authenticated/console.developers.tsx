import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ConsoleShell, inkButtonClass, Panel, StatusPill } from "@/components/console/shell";
import { useEnvironment } from "@/hooks/useEnvironment";
import { useOrganization, useRoles } from "@/hooks/useSession";
import { fetchDashboardStats } from "@/lib/console";

export const Route = createFileRoute("/_authenticated/console/developers")({
  head: () => ({
    meta: [{ title: "Developers — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: DevelopersPage,
});

function DevelopersPage() {
  const { organization } = useOrganization();
  const { has, isAdmin } = useRoles();
  const { environment, setEnvironment, canUseLive } = useEnvironment();
  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: fetchDashboardStats, retry: false });

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Developer Dashboard</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        API credentials, webhooks and logs are separated by environment. Sandbox keys can never read Live data.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="text-xs uppercase tracking-widest text-muted-foreground">
          Environment
          <select
            className="ml-2 h-10 rounded-md border border-[var(--rule)] bg-background px-2 text-sm normal-case text-foreground"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as "sandbox" | "live")}
          >
            <option value="sandbox">SANDBOX</option>
            <option value="live" disabled={!canUseLive}>
              LIVE
            </option>
          </select>
        </label>
        <StatusPill tone="approved">API Status · Operational</StatusPill>
      </div>

      <div className="mt-8 grid gap-px border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-3">
        {[
          ["API Requests Today", stats.data?.requestsToday ?? 0],
          ["Successful", stats.data?.successful ?? 0],
          ["Failed", stats.data?.failed ?? 0],
          ["KYC Checks", stats.data?.kyc ?? 0],
          ["KYB Checks", stats.data?.kyb ?? 0],
          ["AML Screens", stats.data?.aml ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-background px-5 py-4">
            <div className="font-display text-2xl font-bold">{value}</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Quick Actions">
          <div className="flex flex-wrap gap-2">
            <Link to="/console/api-keys" className={`${inkButtonClass} inline-flex items-center`}>
              Create API Key
            </Link>
            <a href="/developers" className="inline-flex h-10 items-center rounded-md border border-[var(--rule)] px-4 text-sm">
              View API Documentation
            </a>
            <Link to="/console/webhooks" className="inline-flex h-10 items-center rounded-md border border-[var(--rule)] px-4 text-sm">
              Create Webhook
            </Link>
            <Link to="/console/api-logs" className="inline-flex h-10 items-center rounded-md border border-[var(--rule)] px-4 text-sm">
              View API Logs
            </Link>
          </div>
        </Panel>
        <Panel title="Live API Access">
          <p className="text-sm">Your account currently has:</p>
          <ul className="mt-3 space-y-1 text-sm">
            <li>✓ Sandbox Access</li>
            <li>✓ API Development</li>
            {has("api_logs.view") || isAdmin ? <li>✓ API Logs</li> : null}
            {has("kyc.reports.view") || isAdmin ? <li>✓ KYC Reports</li> : null}
          </ul>
          <p className="mt-4 text-sm">
            Live API Access ·{" "}
            <StatusPill tone={organization?.liveAccess ? "approved" : "closed"}>
              {organization?.liveAccess ? "Authorized" : "Not Authorized"}
            </StatusPill>
          </p>
          {!organization?.liveAccess ? (
            <Link to="/console/live-access" className={`${inkButtonClass} mt-4 inline-flex items-center`}>
              Request Live Access
            </Link>
          ) : null}
        </Panel>
      </div>
    </ConsoleShell>
  );
}
