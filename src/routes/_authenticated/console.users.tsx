import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/console/users")({
  beforeLoad: () => {
    throw redirect({ to: "/console/team" });
  },
});
