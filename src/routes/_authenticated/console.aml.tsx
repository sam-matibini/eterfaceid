import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { CasesWorkspace } from "@/components/console/cases-workspace";
import { ConsoleShell, compactFieldClass, inkButtonClass, Panel } from "@/components/console/shell";
import { screenName } from "@/lib/screening.functions";

export const Route = createFileRoute("/_authenticated/console/aml")({
  head: () => ({
    meta: [{ title: "AML — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: AmlPage,
});

function AmlPage() {
  const search = useServerFn(screenName);
  const [query, setQuery] = useState("");
  const testSearch = useMutation({
    mutationFn: (name: string) => search({ data: { name } }),
  });

  return (
    <ConsoleShell>
      <CasesWorkspace purpose="aml" showCreate={false} />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Ad-hoc screen"
          action={
            <Link to="/console/watchlists" className="text-sm underline underline-offset-4">
              Manage watchlists
            </Link>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) testSearch.mutate(query.trim());
            }}
            className="flex flex-wrap gap-2"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name to screen"
              className={`${compactFieldClass} max-w-xs flex-1`}
            />
            <button type="submit" disabled={testSearch.isPending} className={inkButtonClass}>
              Screen
            </button>
          </form>
          {testSearch.isError ? (
            <p className="mt-3 text-sm text-[var(--signal)]">{(testSearch.error as Error).message}</p>
          ) : null}
          {testSearch.data ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {testSearch.data.results?.length ?? 0} match(es) from {testSearch.data.candidates ?? 0} candidates
            </p>
          ) : null}
        </Panel>
        <Panel title="Monitoring">
          <p className="text-sm text-muted-foreground">
            Payments, alerts and regulatory reports share this AML workspace. Use sandbox names{" "}
            <code className="font-mono text-xs">test-sanctioned</code> and{" "}
            <code className="font-mono text-xs">test-pep</code> to exercise every branch before going live.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link to="/console/transactions" className="underline underline-offset-4">
              Transactions
            </Link>
            <Link to="/console/alerts" className="underline underline-offset-4">
              Alerts
            </Link>
            <Link to="/console/reports" className="underline underline-offset-4">
              Reports
            </Link>
          </div>
        </Panel>
      </div>
    </ConsoleShell>
  );
}
