import { useCallback, useEffect, useState } from "react";

import { canUseEnvironment, type EnvironmentCode } from "@/lib/access";
import { useOrganization } from "@/hooks/useSession";

const ENV_KEY = "eid_environment";

export function useEnvironment() {
  const { organization } = useOrganization();
  const [environment, setEnvironmentState] = useState<EnvironmentCode>("sandbox");

  useEffect(() => {
    const stored = window.localStorage.getItem(ENV_KEY);
    if (stored === "live" || stored === "sandbox") setEnvironmentState(stored);
  }, []);

  const setEnvironment = useCallback(
    (next: EnvironmentCode) => {
      if (
        next === "live" &&
        !canUseEnvironment(
          { sandbox_access: organization?.sandboxAccess, live_access: organization?.liveAccess },
          "live",
        )
      ) {
        return;
      }
      window.localStorage.setItem(ENV_KEY, next);
      setEnvironmentState(next);
    },
    [organization],
  );

  const allowed: EnvironmentCode =
    environment === "live" &&
    !canUseEnvironment(
      { sandbox_access: organization?.sandboxAccess, live_access: organization?.liveAccess },
      "live",
    )
      ? "sandbox"
      : environment;

  return {
    environment: allowed,
    setEnvironment,
    canUseLive: canUseEnvironment(
      { sandbox_access: organization?.sandboxAccess, live_access: organization?.liveAccess },
      "live",
    ),
    orgLiveApproved: organization?.orgLiveAccess === "approved",
  };
}
