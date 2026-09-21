import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useEnvironment } from "@/hooks/useEnvironment";
import { useOrganization, useRoles, useSession } from "@/hooks/useSession";
import { usePlatformStaff } from "@/hooks/usePlatformStaff";
import { isStaffBypassUnlocked } from "@/lib/staff-bypass";
import { displayRole, type PermissionCode } from "@/lib/access";
import { OPENING_COMPANY_KEY, shouldRedirectToOnboarding } from "@/lib/organization-memberships";

type NavLeaf = { to: string; label: string; exact?: boolean; permission?: PermissionCode; external?: boolean };
type NavGroup = { label: string; items: NavLeaf[] };

const navGroups: NavGroup[] = [
  { label: "", items: [{ to: "/console", label: "Home", exact: true }] },
  {
    label: "Solutions",
    items: [
      { to: "/console/kyc", label: "KYC", permission: "kyc.reports.view" },
      { to: "/console/kyb", label: "KYB", permission: "kyb.reports.view" },
      { to: "/console/aml", label: "AML", permission: "aml.results.view" },
      { to: "/console/employees", label: "Employees", permission: "kyc.reports.view" },
    ],
  },
  {
    label: "Identity",
    items: [
      { to: "/console/inquiries", label: "Inquiries", permission: "kyc.reports.view" },
      { to: "/console/verifications", label: "Verifications", permission: "kyc.reports.view" },
      { to: "/console/watchlists", label: "Watchlists", permission: "aml.results.view" },
      { to: "/console/reports", label: "Reports", permission: "reports.download" },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/console/cases", label: "Cases" },
      { to: "/console/alerts", label: "Alerts" },
      { to: "/console/transactions", label: "Transactions" },
      { to: "/console/compliance", label: "Coverage" },
    ],
  },
  {
    label: "Developers",
    items: [
      { to: "/console/api-keys", label: "API", permission: "api_keys.create" },
      { to: "/console/webhooks", label: "Webhooks", permission: "webhooks.manage" },
      { to: "/console/api-logs", label: "Events", permission: "api_logs.view" },
      { to: "/developers", label: "Docs", external: true },
    ],
  },
  {
    label: "Organization",
    items: [
      { to: "/console/team", label: "Team", permission: "users.manage" },
      { to: "/console/users", label: "Users", permission: "users.manage" },
      { to: "/console/organization", label: "Company", permission: "users.manage" },
      { to: "/console/roles", label: "Roles", permission: "roles.manage" },
      { to: "/console/environments", label: "Environments" },
      { to: "/console/go-live", label: "Go live", permission: "live.environment.manage" },
      { to: "/console/live-access", label: "Live access" },
      { to: "/console/billing", label: "Billing", permission: "billing.manage" },
      { to: "/console/settings", label: "Settings" },
      { to: "/console/security", label: "Security" },
    ],
  },
];

const mobileLinks: NavLeaf[] = [
  { to: "/console", label: "Home", exact: true },
  { to: "/console/kyc", label: "KYC" },
  { to: "/console/kyb", label: "KYB" },
  { to: "/console/aml", label: "AML" },
  { to: "/console/employees", label: "Employees" },
  { to: "/console/inquiries", label: "Inquiries" },
  { to: "/console/api-keys", label: "API" },
  { to: "/console/team", label: "Team" },
];

export function ConsoleShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useSession();
  const { roles, has, isAdmin } = useRoles();
  const { organization, memberships, ready, loaded, fetching, setActive } = useOrganization();
  const { isStaff } = usePlatformStaff();
  const { environment, setEnvironment, canUseLive } = useEnvironment();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (isStaffBypassUnlocked()) return;
    const opening =
      typeof window !== "undefined" && Boolean(window.sessionStorage.getItem(OPENING_COMPANY_KEY));
    if (organization && opening) window.sessionStorage.removeItem(OPENING_COMPANY_KEY);
    if (shouldRedirectToOnboarding({ ready, loaded, fetching, organization, openingCompany: opening })) {
      void navigate({ to: "/onboarding", replace: true });
    }
  }, [ready, loaded, fetching, organization, navigate]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  function visible(item: NavLeaf) {
    if (!item.permission) return true;
    if (isAdmin || isStaff || isStaffBypassUnlocked()) return true;
    return has(item.permission);
  }

  function isActive(item: NavLeaf) {
    if (item.external) return false;
    if (item.exact) return pathname === item.to;
    if (item.to === "/console/kyc" && pathname.startsWith("/console/employees")) return false;
    if (item.to === "/console/kyc" && pathname.startsWith("/console/verifications")) return false;
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }

  return (
    <div className="flex min-h-screen bg-[var(--paper)]">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--rule)] bg-background lg:flex">
        <div className="border-b border-[var(--rule)] px-3 py-3">
          <EnvironmentMenu environment={environment} canUseLive={canUseLive} onChange={setEnvironment} />
        </div>
        <form
          className="border-b border-[var(--rule)] px-3 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void navigate({ to: "/console/inquiries" });
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or ask"
            className="h-9 w-full rounded-md border border-[var(--rule)] bg-[var(--paper)] px-3 text-sm outline-none focus-visible:border-[var(--signal)]"
          />
        </form>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {navGroups.map((group, index) => {
            const items = group.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={group.label || `g-${index}`} className="mb-4">
                {group.label ? (
                  <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    {group.label}
                  </p>
                ) : null}
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = isActive(item);
                    const className = `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-[var(--paper-deep)] font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`;
                    return (
                      <li key={`${group.label}-${item.to}-${item.label}`}>
                        {item.external ? (
                          <a href={item.to} className={className}>
                            {item.label}
                          </a>
                        ) : (
                          <Link to={item.to as "/console"} className={className}>
                            {item.label}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-[var(--rule)] px-3 py-3">
          <OrganizationMenu
            organization={organization}
            memberships={memberships}
            onChange={setActive}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--rule)] bg-background">
          <div className="flex flex-wrap items-center gap-4 px-6 py-3">
            <Link to="/console" className="font-display text-lg font-bold tracking-tight lg:hidden">
              <span className="text-[var(--ink)]">eterface</span>
              <span className="text-[var(--signal)]">ID</span>
            </Link>
            <div className="lg:hidden">
              <EnvironmentMenu environment={environment} canUseLive={canUseLive} onChange={setEnvironment} />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
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
            {mobileLinks.map((item) => (
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

function EnvironmentMenu({
  environment,
  canUseLive,
  onChange,
}: {
  environment: "sandbox" | "live";
  canUseLive: boolean;
  onChange: (value: "sandbox" | "live") => void;
}) {
  const live = environment === "live";
  return (
    <div className="relative">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--paper-deep)]">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-background ${
              live ? "bg-[var(--brand-shield)]" : "bg-[var(--signal)]"
            }`}
          >
            *
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-medium">{live ? "Production" : "Sandbox"}</span>
            <span className="block text-[11px] text-muted-foreground">
              {live ? "Live data" : "Simulated data"}
            </span>
          </span>
        </summary>
        <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-[var(--rule)] bg-background shadow-sm">
          <button
            type="button"
            onClick={() => onChange("live")}
            disabled={!canUseLive}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--paper-deep)] disabled:opacity-40"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--brand-shield)] text-xs font-bold text-background">
              *
            </span>
            Production
          </button>
          <button
            type="button"
            onClick={() => onChange("sandbox")}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--paper-deep)]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--signal)] text-xs font-bold text-background">
              *
            </span>
            <span>
              Sandbox
              <span className="ml-2 text-xs text-muted-foreground">Simulated data</span>
            </span>
          </button>
        </div>
      </details>
    </div>
  );
}

function OrganizationMenu({
  organization,
  memberships,
  onChange,
}: {
  organization: { orgId: string; name: string } | null;
  memberships: Array<{ orgId: string; name: string }>;
  onChange: (orgId: string) => void;
}) {
  const name = organization?.name ?? "No company";
  const initial = name.slice(0, 1).toUpperCase();
  if (memberships.length > 1) {
    return (
      <label className="flex items-center gap-2 rounded-md px-1 py-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--brand-cyan)] text-sm font-bold text-background">
          {initial}
        </span>
        <select
          value={organization?.orgId ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-[var(--rule)] bg-background px-2 text-sm"
        >
          {memberships.map((m) => (
            <option key={m.orgId} value={m.orgId}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--brand-cyan)] text-sm font-bold text-background">
        {initial}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">Workspace</span>
      </span>
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
      <span className="font-medium uppercase tracking-widest">{live ? "PRODUCTION" : "SANDBOX"}</span>
      <span className="ml-2">{live ? "Production environment" : "Test environment · simulated data"}</span>
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
export const compactFieldClass =
  "h-10 rounded-md border border-[var(--rule)] bg-background px-3 text-sm outline-none focus-visible:border-[var(--signal)]";
export const inkButtonClass =
  "h-10 rounded-md bg-[var(--ink)] px-4 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50";
