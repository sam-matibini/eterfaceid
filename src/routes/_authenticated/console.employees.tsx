import { createFileRoute } from "@tanstack/react-router";

import { CasesWorkspace } from "@/components/console/cases-workspace";
import { ConsoleShell } from "@/components/console/shell";

export const Route = createFileRoute("/_authenticated/console/employees")({
  head: () => ({
    meta: [{ title: "Employee onboarding — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <ConsoleShell>
      <CasesWorkspace purpose="employee" />
    </ConsoleShell>
  ),
});
