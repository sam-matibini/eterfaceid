import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ConsoleShell, Panel, StatusPill } from "@/components/console/shell";
import { useOrganization } from "@/hooks/useSession";
import { displayRole } from "@/lib/access";
import { fetchTeam } from "@/lib/console";

export const Route = createFileRoute("/_authenticated/console/users/")({
  head: () => ({
    meta: [{ title: "Users — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: UsersPage,
});

function UsersPage() {
  const { organization } = useOrganization();
  const team = useQuery({ queryKey: ["team"], queryFn: fetchTeam });

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Users</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Profiles for people in {organization?.name ?? "this company"}. Open a person to see their team role and
        access.
      </p>
      <div className="mt-8 max-w-4xl">
        <Panel
          title="Directory"
          action={
            <Link to="/console/team" className="text-sm underline underline-offset-4">
              Manage team
            </Link>
          }
        >
          <div className="space-y-4 text-sm">
            {(team.data?.members ?? []).map((member) => (
              <Link
                key={member.userId}
                to="/console/users/$userId"
                params={{ userId: member.userId }}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)]/60 pb-4 last:border-0"
              >
                <div>
                  <div className="font-medium">{member.fullName ?? member.email ?? "Team member"}</div>
                  <div className="text-xs text-muted-foreground">
                    {member.email}
                    {member.jobTitle ? ` · ${member.jobTitle}` : ""}
                  </div>
                </div>
                <StatusPill tone="pending">
                  {displayRole(member.role, member.accessRole, member.isOwner)}
                </StatusPill>
              </Link>
            ))}
            {(team.data?.members ?? []).length === 0 ? (
              <p className="text-muted-foreground">
                No users yet.{" "}
                <Link to="/console/team" className="underline underline-offset-4">
                  Add someone on the Team page
                </Link>
                .
              </p>
            ) : null}
          </div>
        </Panel>
      </div>
    </ConsoleShell>
  );
}
