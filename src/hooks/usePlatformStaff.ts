import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";

export function usePlatformStaff() {
  const { user, ready } = useSession();
  const query = useQuery({
    queryKey: ["platform-staff", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_staff")
        .select("id, level")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error && /does not exist|schema cache|permission denied|row-level security/i.test(error.message)) {
        return null;
      }
      if (error) throw error;
      return data;
    },
  });
  return {
    isStaff: Boolean(query.data),
    loading: !ready || query.isLoading,
    ready: ready && !query.isLoading,
  };
}
