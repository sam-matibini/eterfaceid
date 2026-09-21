import { createFileRoute } from "@tanstack/react-router";

import { CasesWorkspace } from "@/components/console/cases-workspace";
import { ConsoleShell } from "@/components/console/shell";

export const Route = createFileRoute("/_authenticated/console/inquiries")({
  head: () => ({
    meta: [{ title: "Inquiries — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <ConsoleShell>
      <CasesWorkspace purpose="all" title="Inquiries" />
    </ConsoleShell>
  ),
});
