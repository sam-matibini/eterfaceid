import { createFileRoute } from "@tanstack/react-router";

import { CasesWorkspace } from "@/components/console/cases-workspace";
import { ConsoleShell } from "@/components/console/shell";

export const Route = createFileRoute("/_authenticated/console/verifications")({
  head: () => ({
    meta: [{ title: "Verifications — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <ConsoleShell>
      <CasesWorkspace
        purpose="kyc"
        title="Verifications"
        lede="Hosted and API identity checks for individuals — documents, liveness, address and bank-confirmed identity."
      />
    </ConsoleShell>
  ),
});
