import { createFileRoute } from "@tanstack/react-router";

import { ConsoleShell } from "@/components/console/shell";
import { TeamPanel } from "@/components/console/team";
import { useRoles } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/console/users")({
  head: () => ({
    meta: [{ title: "Users & Teams — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: UsersPage,
});

function UsersPage() {
  const { isAdmin } = useRoles();
  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Users & Teams</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Invite employees and developers. Sandbox is the default; Live access is authorized separately.
      </p>
      <div className="mt-8 max-w-4xl">
        <TeamPanel isAdmin={isAdmin} />
      </div>
    </ConsoleShell>
  );
}
