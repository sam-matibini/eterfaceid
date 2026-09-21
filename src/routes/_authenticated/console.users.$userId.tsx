import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ConsoleShell, Panel, StatusPill } from "@/components/console/shell";
import { useOrganization } from "@/hooks/useSession";
import { displayRole, PERMISSIONS } from "@/lib/access";
import { fetchTeam } from "@/lib/console";

export const Route = createFileRoute("/_authenticated/console/users/$userId")({
  head: () => ({
    meta: [{ title: "User profile — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: UserProfilePage,
});

function UserProfilePage() {
  const { userId } = Route.useParams();
  const { organization } = useOrganization();
  const team = useQuery({ queryKey: ["team"], queryFn: fetchTeam });
  const member = (team.data?.members ?? []).find((row) => row.userId === userId);

  return (
    <ConsoleShell>
      <Link to="/console/users" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← Users
      </Link>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
        {member?.fullName ?? member?.email ?? "User profile"}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Team profile for {organization?.name ?? "this company"}.
      </p>

      <div className="mt-8 grid max-w-4xl gap-6 lg:grid-cols-2">
        <Panel title="Profile">
          {member ? (
            <dl className="space-y-3 text-sm">
              <Row label="Email" value={member.email ?? "—"} />
              <Row label="Job title" value={member.jobTitle ?? "—"} />
              <Row label="User type" value={member.userType} />
              <Row
                label="Team role"
                value={displayRole(member.role, member.accessRole, member.isOwner)}
              />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              {team.isLoading ? "Loading…" : "This person is not on the company team."}
            </p>
          )}
        </Panel>

        <Panel title="Team access">
          {member ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-1">
                <StatusPill tone={member.sandboxAccess ? "approved" : "closed"}>Sandbox</StatusPill>
                <StatusPill tone={member.liveAccess ? "high" : "closed"}>Live</StatusPill>
              </div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Permissions</p>
              <ul className="space-y-1 text-sm">
                {(member.permissions.length
                  ? member.permissions
                  : ["No extra permissions recorded"]
                ).map((code) => (
                  <li key={code}>
                    {PERMISSIONS.find((p) => p.code === code)?.label ?? code}
                  </li>
                ))}
              </ul>
              <Link to="/console/team" className="inline-block text-sm underline underline-offset-4">
                Manage on the Team page
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Invite them from{" "}
              <Link to="/console/team" className="underline underline-offset-4">
                Team
              </Link>
              .
            </p>
          )}
        </Panel>
      </div>
    </ConsoleShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
