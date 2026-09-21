import { createFileRoute } from "@tanstack/react-router";

import { CasesWorkspace } from "@/components/console/cases-workspace";
import { ConsoleShell } from "@/components/console/shell";

export const Route = createFileRoute("/_authenticated/console/kyb")({
  head: () => ({
    meta: [{ title: "KYB — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <ConsoleShell>
      <CasesWorkspace purpose="kyb" />
    </ConsoleShell>
  ),
});
