import { createFileRoute, Link } from "@tanstack/react-router";

import { ConsoleShell } from "@/components/console/shell";
import { NotificationsPanel } from "@/components/console/notifications";
import { useRoles } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/console/settings")({
  head: () => ({
    meta: [
      { title: "Settings — eterfaceID console" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { isAdmin } = useRoles();

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Notifications, security, API configuration and billing. Team members and keys now live under Organization
        and Developers.
      </p>
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link to="/console/security" className="underline underline-offset-4">
          Security
        </Link>
        <Link to="/console/api-keys" className="underline underline-offset-4">
          API Configuration
        </Link>
        <Link to="/console/billing" className="underline underline-offset-4">
          Billing
        </Link>
        <Link to="/console/users" className="underline underline-offset-4">
          Users
        </Link>
        <Link to="/console/team" className="underline underline-offset-4">
          Team
        </Link>
      </div>
      <div className="mt-8 max-w-2xl">
        <NotificationsPanel isAdmin={isAdmin} />
      </div>
    </ConsoleShell>
  );
}
