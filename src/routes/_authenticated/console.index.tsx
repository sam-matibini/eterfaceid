import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ConsoleShell, inkButtonClass, Panel, StatusPill } from "@/components/console/shell";
import { useOrganization, useRoles } from "@/hooks/useSession";
import { classifyCase, PURPOSE_LABEL } from "@/lib/case-purpose";
import { fetchDashboardStats, fetchCases, statusLabel, type CaseStatus } from "@/lib/console";

export const Route = createFileRoute("/_authenticated/console/")({
  head: () => ({
    meta: [
      { title: "Home — eterfaceID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HomePage,
});

const solutions = [
  {
    to: "/console/kyc" as const,
    title: "KYC",
    body: "Document, biometric and data checks for customers.",
  },
  {
    to: "/console/kyb" as const,
    title: "KYB",
    body: "Registry, status and beneficial ownership for entities.",
  },
  {
    to: "/console/aml" as const,
    title: "AML",
    body: "Sanctions, PEP, watchlists and ongoing rescreening.",
  },
  {
    to: "/console/employees" as const,
    title: "Employees",
    body: "Onboard staff with the same identity and screening controls.",
  },
];

function HomePage() {
  const { organization } = useOrganization();
  const { has, isAdmin } = useRoles();
  const [tab, setTab] = useState<"cases" | "inquiries">("cases");
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchDashboardStats,
    retry: false,
  });
  const cases = useQuery({ queryKey: ["cases"], queryFn: fetchCases, retry: false });
  const data = stats.data;
  const rows = cases.data ?? [];
  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const iso = start.toISOString();
    const mine = rows.filter((c) => c.created_at >= iso);
    return {
      resolved: rows.filter((c) => c.status === "approved" && (c.updated_at ?? c.created_at) >= iso).length,
      created: mine.length,
      inProgress: mine.filter((c) => c.status === "in_review").length,
    };
  }, [rows]);
  const recent = rows.slice(0, 8);
  const canInvite = isAdmin || has("users.manage");

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Home</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {organization?.legalName ?? organization?.name ?? "Your workspace"} · KYC, KYB, AML and employee onboarding
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.9fr)]">
        <div className="space-y-6">
          <Panel
            title="Recent activity"
            action={
              <div className="flex gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => setTab("cases")}
                  className={tab === "cases" ? "font-medium text-[var(--verify)]" : "text-muted-foreground"}
                >
                  Cases
                </button>
                <button
                  type="button"
                  onClick={() => setTab("inquiries")}
                  className={tab === "inquiries" ? "font-medium text-[var(--verify)]" : "text-muted-foreground"}
                >
                  Inquiries
                </button>
              </div>
            }
          >
            <div className="grid gap-px bg-[var(--rule)] sm:grid-cols-2">
              <div className="bg-background px-4 py-3">
                <div className="font-display text-3xl font-bold">{today.resolved}</div>
                <p className="mt-1 text-sm text-muted-foreground">Cases you resolved today</p>
              </div>
              <div className="bg-background px-4 py-3">
                <div className="flex gap-8">
                  <div>
                    <div className="font-display text-3xl font-bold">{today.created}</div>
                    <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">Open</p>
                  </div>
                  <div>
                    <div className="font-display text-3xl font-bold">{today.inProgress}</div>
                    <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">In progress</p>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Cases created in the past day</p>
              </div>
            </div>

            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="pb-2 font-medium">{tab === "cases" ? "Case ID" : "Inquiry"}</th>
                  <th className="pb-2 font-medium">Subject</th>
                  <th className="pb-2 font-medium">Solution</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No {tab} in the past month are assigned to you.
                    </td>
                  </tr>
                ) : (
                  recent.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--rule)]">
                      <td className="py-2 font-mono text-xs">
                        <Link
                          to="/console/cases/$caseId"
                          params={{ caseId: row.id }}
                          className="underline underline-offset-4 hover:text-[var(--signal)]"
                        >
                          {row.reference}
                        </Link>
                      </td>
                      <td className="py-2">{row.subject_name}</td>
                      <td className="py-2 text-muted-foreground">{PURPOSE_LABEL[classifyCase(row)]}</td>
                      <td className="py-2">
                        <StatusPill tone={row.status}>{statusLabel[row.status as CaseStatus]}</StatusPill>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Panel>

          <div className="grid gap-px border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-4">
            {[
              { label: "KYC", value: data?.kyc ?? 0, to: "/console/kyc" },
              { label: "KYB", value: data?.kyb ?? 0, to: "/console/kyb" },
              { label: "AML", value: data?.aml ?? 0, to: "/console/aml" },
              { label: "Employees", value: data?.employees ?? 0, to: "/console/employees" },
            ].map((stat) => (
              <Link key={stat.label} to={stat.to as "/console"} className="bg-background px-5 py-4 hover:bg-[var(--paper-deep)]">
                <div className="font-display text-2xl font-bold">{stat.value}</div>
                <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{stat.label}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <Panel title="Additional resources">
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/console/api-keys" className="text-[var(--verify)] underline-offset-4 hover:underline">
                  Getting started — API keys
                </Link>
              </li>
              <li>
                <a href="/developers" className="text-[var(--verify)] underline-offset-4 hover:underline">
                  Developer documentation
                </a>
              </li>
              <li>
                <a href="/compliance" className="text-[var(--verify)] underline-offset-4 hover:underline">
                  Regulatory coverage
                </a>
              </li>
            </ul>
          </Panel>

          <Panel title="Explore all solutions">
            <p className="text-sm text-muted-foreground">
              Pre-built KYC, KYB, AML and employee onboarding blocks for fintech and localized industries.
            </p>
            <div className="mt-4 space-y-3">
              {solutions.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="block rounded-md border border-[var(--rule)] px-3 py-2 hover:bg-[var(--paper-deep)]"
                >
                  <div className="text-sm font-medium">{item.title}</div>
                  <p className="text-xs text-muted-foreground">{item.body}</p>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="Invite your teammates">
            <p className="text-sm text-muted-foreground">
              Invite reviewers, developers and operations staff and assign sandbox or live access.
            </p>
            {canInvite ? (
              <Link to="/console/team" className={`${inkButtonClass} mt-4 inline-flex items-center`}>
                Invite users
              </Link>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">Ask an administrator to invite teammates.</p>
            )}
          </Panel>
        </div>
      </div>
    </ConsoleShell>
  );
}
