import { createFileRoute } from "@tanstack/react-router";

import { ConsoleShell, Panel } from "@/components/console/shell";
import { PERMISSION_MATRIX, PERMISSIONS } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/console/roles")({
  head: () => ({
    meta: [{ title: "Roles & Permissions — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: RolesPage,
});

function mark(value: string) {
  if (value === "yes") return "✓";
  if (value === "no") return "—";
  return "Optional";
}

function RolesPage() {
  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Roles & Permissions</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        RBAC with granular permissions. Role names are templates — they are not hard-coded to job titles.
      </p>
      <div className="mt-8">
        <Panel title="Permission matrix">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="pb-3 font-medium">Permission</th>
                  <th className="pb-3 font-medium">Developer</th>
                  <th className="pb-3 font-medium">Compliance</th>
                  <th className="pb-3 font-medium">Admin</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MATRIX.map((row) => (
                  <tr key={row.permission} className="border-t border-[var(--rule)]">
                    <td className="py-3">
                      {PERMISSIONS.find((p) => p.code === row.permission)?.label ?? row.permission}
                    </td>
                    <td className="py-3">{mark(row.developer)}</td>
                    <td className="py-3">{mark(row.compliance)}</td>
                    <td className="py-3">{mark(row.admin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </ConsoleShell>
  );
}
