import { createFileRoute } from "@tanstack/react-router";

import { ConsoleShell } from "@/components/console/shell";
import { TeamPanel } from "@/components/console/team";
import { useOrganization, useRoles } from "@/hooks/useSession";
import { canEditCompany } from "@/lib/company-profile";
import { isStaffBypassUnlocked } from "@/lib/staff-bypass";

export const Route = createFileRoute("/_authenticated/console/team")({
  head: () => ({
    meta: [{ title: "Team — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: TeamPage,
});

function TeamPage() {
  const { organization } = useOrganization();
  const { isAdmin, isOwner, has } = useRoles();
  const canManage = canEditCompany({
    isAdmin,
    isOwner,
    hasUsersManage: has("users.manage"),
    pinUnlocked: isStaffBypassUnlocked(),
    hasOrganization: Boolean(organization?.orgId),
  });
  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Team</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        People in this company. Add employees, developers and operations staff. Sandbox is the default; Live
        access is authorized separately.
      </p>
      <div className="mt-8 max-w-4xl">
        <TeamPanel canManage={canManage} defaultOpen />
      </div>
    </ConsoleShell>
  );
}
