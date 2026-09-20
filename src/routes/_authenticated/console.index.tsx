import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ConsoleShell, inkButtonClass, Panel, StatusPill } from "@/components/console/shell";
import { useEnvironment } from "@/hooks/useEnvironment";
import { useOrganization, useRoles } from "@/hooks/useSession";
import { displayRole } from "@/lib/access";
import { fetchDashboardStats } from "@/lib/console";

export const Route = createFileRoute("/_authenticated/console/")({
  head: () => ({
    meta: [
      { title: "Dashboard — eterfaceID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { organization } = useOrganization();
  const { has, isAdmin } = useRoles();
  const { environment, setEnvironment, canUseLive } = useEnvironment();
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchDashboardStats,
    retry: false,
  });
  const developer = organization?.accessRole === "developer" || has("api_keys.create");
  const data = stats.data;

  return (
    <ConsoleShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {developer ? "Developer Dashboard" : "Dashboard"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {organization?.legalName ?? organization?.name} ·{" "}
            {displayRole(organization?.role, organization?.accessRole, organization?.isOwner)}
          </p>
        </div>
        {developer ? (
          <label className="text-xs uppercase tracking-widest text-muted-foreground">
            Environment
            <select
              className="ml-2 h-10 rounded-md border border-[var(--rule)] bg-background px-2 text-sm normal-case tracking-normal text-foreground"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as "sandbox" | "live")}
            >
              <option value="sandbox">SANDBOX</option>
              <option value="live" disabled={!canUseLive}>
                LIVE
              </option>
            </select>
          </label>
        ) : null}
      </div>

      <div className="mt-8 grid gap-px border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "API Status", value: "Operational" },
          { label: "API Requests Today", value: data?.requestsToday ?? 0 },
          { label: "Successful", value: data?.successful ?? 0 },
          { label: "Failed", value: data?.failed ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="bg-background px-5 py-4">
            <div className="font-display text-2xl font-bold">{stat.value}</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-px grid gap-px border-x border-b border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-3">
        {[
          { label: "KYC Checks", value: data?.kyc ?? 0 },
          { label: "KYB Checks", value: data?.kyb ?? 0 },
          { label: "AML Screens", value: data?.aml ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="bg-background px-5 py-4">
            <div className="font-display text-2xl font-bold">{stat.value}</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Quick Actions">
          <div className="flex flex-wrap gap-2">
            {has("api_keys.create") || isAdmin ? (
              <Link to="/console/api-keys" className={`${inkButtonClass} inline-flex items-center`}>
                Create API Key
              </Link>
            ) : null}
            <a
              href="/developers"
              className="inline-flex h-10 items-center rounded-md border border-[var(--rule)] px-4 text-sm"
            >
              View API Documentation
            </a>
            {has("webhooks.manage") || isAdmin ? (
              <Link
                to="/console/webhooks"
                className="inline-flex h-10 items-center rounded-md border border-[var(--rule)] px-4 text-sm"
              >
                Create Webhook
              </Link>
            ) : null}
            {has("api_logs.view") || isAdmin ? (
              <Link
                to="/console/api-logs"
                className="inline-flex h-10 items-center rounded-md border border-[var(--rule)] px-4 text-sm"
              >
                View API Logs
              </Link>
            ) : null}
            <Link
              to="/console/cases"
              className="inline-flex h-10 items-center rounded-md border border-[var(--rule)] px-4 text-sm"
            >
              Run Sandbox Test
            </Link>
          </div>
        </Panel>

        <Panel title="Access">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span>Sandbox access</span>
              <StatusPill tone={organization?.sandboxAccess ? "approved" : "closed"}>
                {organization?.sandboxAccess ? "granted" : "off"}
              </StatusPill>
            </li>
            <li className="flex items-center justify-between">
              <span>Live API access</span>
              <StatusPill tone={organization?.liveAccess ? "approved" : "closed"}>
                {organization?.liveAccess ? "authorized" : "not authorized"}
              </StatusPill>
            </li>
            <li className="flex items-center justify-between">
              <span>Organization live status</span>
              <StatusPill tone={organization?.orgLiveAccess === "approved" ? "approved" : "pending"}>
                {organization?.orgLiveAccess ?? "locked"}
              </StatusPill>
            </li>
          </ul>
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
