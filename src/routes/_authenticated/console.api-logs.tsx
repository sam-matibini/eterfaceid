import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ConsoleShell, Panel } from "@/components/console/shell";
import { useEnvironment } from "@/hooks/useEnvironment";
import { fetchApiRequestLogs } from "@/lib/console";

export const Route = createFileRoute("/_authenticated/console/api-logs")({
  head: () => ({
    meta: [{ title: "API logs — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: ApiLogsPage,
});

function ApiLogsPage() {
  const { environment } = useEnvironment();
  const logs = useQuery({ queryKey: ["api-logs"], queryFn: fetchApiRequestLogs, retry: false });
  const rows = (logs.data ?? []).filter((row) => !environment || row.environment === environment);

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">API Logs</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Requests attributed to this organization and environment. Sandbox traffic never mixes with Live.
      </p>
      <div className="mt-8">
        <Panel title={`${environment} requests`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="pb-3 font-medium">When</th>
                  <th className="pb-3 font-medium">Method</th>
                  <th className="pb-3 font-medium">Path</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Request</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--rule)]">
                    <td className="py-3 text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="py-3 font-mono text-xs">{row.method}</td>
                    <td className="py-3 font-mono text-xs">{row.path}</td>
                    <td className="py-3">{row.status ?? "—"}</td>
                    <td className="py-3 font-mono text-xs">{row.request_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="pt-3 text-sm text-muted-foreground">No API requests recorded in this environment yet.</p>
            ) : null}
          </div>
        </Panel>
      </div>
    </ConsoleShell>
  );
}
