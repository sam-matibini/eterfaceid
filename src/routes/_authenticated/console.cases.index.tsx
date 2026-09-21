import { createFileRoute } from "@tanstack/react-router";

import { CasesWorkspace } from "@/components/console/cases-workspace";
import { ConsoleShell } from "@/components/console/shell";

export const Route = createFileRoute("/_authenticated/console/cases/")({
  head: () => ({
    meta: [
      { title: "Cases — eterfaceID console" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CasesPage,
});

function CasesPage() {
  return (
    <ConsoleShell>
      <CasesWorkspace
        purpose="all"
        title="Cases"
        lede="Investigations across KYC, KYB, AML and employee onboarding. Open a row for verification, screening and the audit trail."
        showCreate={false}
      />
    </ConsoleShell>
  );
}
