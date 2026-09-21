import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useEnvironment } from "@/hooks/useEnvironment";
import { useOrganization, useRoles, useSession } from "@/hooks/useSession";
import { usePlatformStaff } from "@/hooks/usePlatformStaff";
import { isStaffBypassUnlocked } from "@/lib/staff-bypass";
import { displayRole, type PermissionCode } from "@/lib/access";

type NavLeaf = { to: string; label: string; exact?: boolean; permission?: PermissionCode };
type NavGroup = { label: string; items: NavLeaf[] };

const navGroups: NavGroup[] = [
  { label: "Overview", items: [{ to: "/console", label: "Dashboard", exact: true }] },
  {
    label: "Organization",
    items: [
      { to: "/console/organization", label: "Company Profile", permission: "users.manage" },
      { to: "/console/users", label: "Users & Teams", permission: "users.manage" },
      { to: "/console/roles", label: "Roles & Permissions", permission: "roles.manage" },
      { to: "/console/security", label: "Security" },
    ],
  },
  {
    label: "Developers",
    items: [
      { to: "/console/developers", label: "Developer Accounts" },
      { to: "/console/api-keys", label: "API Keys", permission: "api_keys.create" },
      { to: "/console/webhooks", label: "Webhooks", permission: "webhooks.manage" },
      { to: "/console/api-logs", label: "API Logs", permission: "api_logs.view" },
    ],
  },
  {
    label: "Environments",
    items: [
      { to: "/console/environments", label: "Sandbox & Live" },
      { to: "/console/go-live", label: "Go live", permission: "live.environment.manage" },
      { to: "/console/live-access", label: "Live access" },
    ],
  },
  {
    label: "KYC / KYB",
    items: [
      { to: "/console/cases", label: "Customers", permission: "kyc.reports.view" },
      { to: "/console/watchlists", label: "AML Screening", permission: "aml.results.view" },
      { to: "/console/compliance", label: "Coverage" },
    ],
  },
  {
    label: "Transactions / Monitoring",
    items: [
      { to: "/console/transactions", label: "Transactions" },
      { to: "/console/alerts", label: "Alerts" },
      { to: "/console/cases", label: "Cases" },
    ],
  },
  {
    label: "Reports",
    items: [
      { to: "/console/reports", label: "KYC / KYB / AML Reports", permission: "reports.download" },
      { to: "/console/audit", label: "Audit Reports" },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/console/settings", label: "Notifications" },
      { to: "/console/security", label: "Security" },
      { to: "/console/api-keys", label: "API Configuration" },
      { to: "/console/billing", label: "Billing", permission: "billing.manage" },
    ],
  },
];

export function ConsoleShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useSession();
  const { roles, has, isAdmin } = useRoles();
  const { organization, memberships, ready, loaded, setActive } = useOrganization();
  const { isStaff } = usePlatformStaff();
  const { environment, setEnvironment, canUseLive } = useEnvironment();

  useEffect(() => {
    if (isStaffBypassUnlocked()) return;
    if (ready && loaded && !organization) void navigate({ to: "/onboarding", replace: true });
  }, [ready, loaded, organization, navigate]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  function visible(item: NavLeaf) {
    if (!item.permission) return true;
    if (isAdmin) return true;
    return has(item.permission);
  }

  return (
    <div className="flex min-h-screen bg-[var(--paper)]">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--rule)] bg-background lg:flex">
        <Link to="/console" className="border-b border-[var(--rule)] px-5 py-4 font-display text-lg font-bold tracking-tight">
          <span className="text-[var(--ink)]">eterface</span>
          <span className="text-[var(--signal)]">ID</span>
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => {
            const items = group.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={group.label} className="mb-4">
                <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
                    return (
                      <li key={`${group.label}-${item.to}-${item.label}`}>
                        <Link
                          to={item.to as "/console"}
                          className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                            active
                              ? "bg-[var(--paper-deep)] font-medium text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--rule)] bg-background">
          <div className="flex flex-wrap items-center gap-4 px-6 py-3">
            <Link to="/console" className="font-display text-lg font-bold tracking-tight lg:hidden">
              <span className="text-[var(--ink)]">eterface</span>
              <span className="text-[var(--signal)]">ID</span>
            </Link>
            <EnvironmentSwitch environment={environment} canUseLive={canUseLive} onChange={setEnvironment} />
            <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
              {memberships.length > 1 ? (
                <select
                  value={organization?.orgId ?? ""}
                  onChange={(e) => setActive(e.target.value)}
                  className="h-8 rounded-md border border-[var(--rule)] bg-background px-2 text-xs"
                >
                  {memberships.map((m) => (
                    <option key={m.orgId} value={m.orgId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="hidden text-muted-foreground sm:inline">{organization?.name}</span>
              )}
              {isStaff ? (
                <Link to="/admin" className="text-[var(--signal)] transition-opacity hover:opacity-80">
                  App admin
                </Link>
              ) : null}
              <span className="hidden text-muted-foreground md:inline">
                {user?.email}
                {organization
                  ? ` · ${displayRole(organization.role, organization.accessRole, organization.isOwner)}`
                  : roles.length
                    ? ` · ${roles.join(", ")}`
                    : ""}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-md border border-[var(--rule)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--paper-deep)]"
              >
                Sign out
              </button>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto border-t border-[var(--rule)] px-4 py-2 lg:hidden">
            {navGroups[0]?.items.concat(navGroups.flatMap((g) => g.items).slice(1, 8)).map((item) => (
              <Link
                key={item.to + item.label}
                to={item.to as "/console"}
                className="whitespace-nowrap text-xs text-muted-foreground"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </header>
        <EnvironmentBanner environment={environment} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">{children}</main>
      </div>
    </div>
  );
}

function EnvironmentSwitch({
  environment,
  canUseLive,
  onChange,
}: {
  environment: "sandbox" | "live";
  canUseLive: boolean;
  onChange: (value: "sandbox" | "live") => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-[var(--rule)] p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("sandbox")}
        className={`rounded px-2 py-1 ${environment === "sandbox" ? "bg-[var(--paper-deep)] font-medium" : "text-muted-foreground"}`}
      >
        SANDBOX
      </button>
      <button
        type="button"
        disabled={!canUseLive}
        onClick={() => onChange("live")}
        className={`rounded px-2 py-1 ${
          environment === "live" ? "bg-[var(--signal)]/10 font-medium text-[var(--signal)]" : "text-muted-foreground"
        } disabled:opacity-40`}
      >
        LIVE
      </button>
    </div>
  );
}

export function EnvironmentBanner({ environment }: { environment: "sandbox" | "live" }) {
  const live = environment === "live";
  return (
    <div
      className={`border-b px-6 py-2 text-xs ${
        live
          ? "border-[var(--signal)]/40 bg-[var(--signal)]/10 text-[var(--signal)]"
          : "border-[var(--rule)] bg-[var(--paper-deep)] text-muted-foreground"
      }`}
    >
      <span className="font-medium uppercase tracking-widest">{live ? "LIVE" : "SANDBOX"}</span>
      <span className="ml-2">{live ? "Production environment" : "Test environment"}</span>
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: string; children: ReactNode }) {
  const tones: Record<string, string> = {
    approved: "border-[var(--verify)] text-[var(--verify)]",
    low: "border-[var(--verify)] text-[var(--verify)]",
    pass: "border-[var(--verify)] text-[var(--verify)]",
    clear: "border-[var(--verify)] text-[var(--verify)]",
    closed: "border-[var(--rule)] text-muted-foreground",
    false_positive: "border-[var(--rule)] text-muted-foreground",
    not_run: "border-[var(--rule)] text-muted-foreground",
    pending: "border-[var(--rule)] text-muted-foreground",
    in_review: "border-[var(--ink)] text-[var(--ink)]",
    review: "border-[var(--ink)] text-[var(--ink)]",
    medium: "border-[var(--ink)] text-[var(--ink)]",
    open: "border-[var(--signal)] text-[var(--signal)]",
    high: "border-[var(--signal)] text-[var(--signal)]",
    fail: "border-[var(--signal)] text-[var(--signal)]",
    rejected: "border-[var(--signal)] text-[var(--signal)]",
    true_positive: "border-[var(--signal)] text-[var(--signal)]",
    hit: "border-[var(--signal)] text-[var(--signal)]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        tones[tone] ?? "border-[var(--rule)] text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-[var(--rule)] bg-background${className ? ` ${className}` : ""}`}>
      <div className="flex items-center justify-between gap-4 border-b border-[var(--rule)] px-5 py-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export const fieldClass =
  "h-10 w-full rounded-md border border-[var(--rule)] bg-background px-3 text-sm outline-none focus-visible:border-[var(--signal)]";
export const inkButtonClass =
  "h-10 rounded-md bg-[var(--ink)] px-4 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50";
