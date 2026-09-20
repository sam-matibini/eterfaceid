import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AuthFrame, authButtonClass } from "@/components/auth/AuthFrame";
import { setActiveOrganization, useOrganization } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/select-organization")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Select organization — eterfaceID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SelectOrganizationPage,
});

function SelectOrganizationPage() {
  const navigate = useNavigate();
  const { memberships } = useOrganization();

  return (
    <AuthFrame title="Organization Selection" subtitle="You belong to more than one eterfaceID company. Choose which workspace to open.">
      <div className="space-y-3">
        {memberships.map((org) => (
          <button
            key={org.orgId}
            type="button"
            className="w-full rounded-md border border-[var(--rule)] px-4 py-3 text-left text-sm hover:bg-[var(--paper-deep)]"
            onClick={() => {
              setActiveOrganization(org.orgId);
              void navigate({ to: "/console" });
            }}
          >
            <div className="font-medium">{org.legalName || org.name}</div>
            <div className="text-xs text-muted-foreground">{org.accessRole}</div>
          </button>
        ))}
        <button type="button" className={authButtonClass} onClick={() => navigate({ to: "/console" })}>
          Continue
        </button>
      </div>
    </AuthFrame>
  );
}
