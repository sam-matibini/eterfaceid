import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { hasPermission, mfaRequiredFor, type PermissionCode } from "@/lib/access";
import { loadMyWorkspace, type WorkspaceMembership } from "@/lib/teams.functions";

const ACTIVE_ORG_KEY = "eid_active_org";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, ready, user: session?.user ?? null };
}

export type OrganizationMembership = WorkspaceMembership;

function readStoredOrg() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_ORG_KEY);
}

export function setActiveOrganization(orgId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_ORG_KEY, orgId);
}

export function useOrganization() {
  const { user, ready } = useSession();
  const loadWorkspace = useServerFn(loadMyWorkspace);
  const query = useQuery({
    queryKey: ["my-org", user?.id],
    enabled: Boolean(user?.id),
    retry: 2,
    queryFn: async () => {
      const result = await loadWorkspace();
      const memberships = result.memberships as OrganizationMembership[];
      if (!memberships.length) return { memberships: [], current: null as OrganizationMembership | null };
      const stored = readStoredOrg();
      const current = memberships.find((m) => m.orgId === stored) ?? memberships[0] ?? null;
      if (current) setActiveOrganization(current.orgId);
      return { memberships, current };
    },
  });
  const current = query.data?.current ?? null;
  return {
    organization: current,
    memberships: query.data?.memberships ?? [],
    loading: !ready || Boolean(user?.id && query.isLoading),
    ready: ready && (!user?.id || !query.isLoading),
    setActive: (orgId: string) => {
      setActiveOrganization(orgId);
      void query.refetch();
    },
  };
}

export function useRoles() {
  const { organization, loading } = useOrganization();
  const roles = organization ? [organization.role] : [];
  return {
    roles,
    isAdmin: organization?.role === "admin" || organization?.isOwner === true,
    isOwner: Boolean(organization?.isOwner),
    canWrite: organization?.role === "admin" || organization?.role === "analyst",
    liveAccess: Boolean(organization?.liveAccess),
    sandboxAccess: organization ? organization.sandboxAccess !== false : false,
    mfaRequired: mfaRequiredFor({
      is_owner: organization?.isOwner,
      access_role: organization?.accessRole,
      role: organization?.role,
      live_access: organization?.liveAccess,
      mfa_required: organization?.mfaRequired,
    }),
    loading,
    has: (code: PermissionCode) =>
      hasPermission(
        organization
          ? {
              role: organization.role,
              access_role: organization.accessRole,
              permissions: organization.permissions,
              is_owner: organization.isOwner,
            }
          : null,
        code,
      ),
  };
}
