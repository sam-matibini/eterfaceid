import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { isStaffBypassUnlocked } from "@/lib/staff-bypass";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if ((error || !data.user) && !isStaffBypassUnlocked()) throw redirect({ to: "/auth" });
    return { user: data.user ?? null };
  },
  component: () => <Outlet />,
});
