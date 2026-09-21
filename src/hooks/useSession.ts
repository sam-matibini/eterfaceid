import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { hasPermission, mfaRequiredFor, type PermissionCode } from "@/lib/access";
import { creatorJoinTargets, creatorRpcAccepted, isCreatorDeniedError, joinCreatedCompanyArgs, liveMemberInsert } from "@/lib/create-company";
import {
  fetchMembershipRows,
  mapMembershipRows,
  mergeOwnedOrganizations,
  readPersistedWorkspace,
  type OrganizationMembership,
} from "@/lib/organization-memberships";

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

export type { OrganizationMembership };

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
  const query = useQuery({
    queryKey: ["my-org", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const result = await fetchMembershipRows(async (select, orderByCreatedAt) => {
        let request = supabase.from("organization_members").select(select).eq("user_id", user!.id);
        if (orderByCreatedAt) request = request.order("created_at");
        return request;
      });
      if (result.error) throw new Error(result.error.message);
      let memberships = mapMembershipRows(result.data);
      const realMemberIds = memberships.map((row) => row.orgId);
      const owned = await supabase.from("organizations").select("id, name").eq("created_by", user!.id);
      if (!owned.error && owned.data?.length) {
        memberships = mergeOwnedOrganizations(memberships, owned.data);
      }
      const persisted = readPersistedWorkspace();
      if (persisted) {
        memberships = mergeOwnedOrganizations(memberships, [{ id: persisted.orgId, name: persisted.name }]);
      }
      const joinTargets = creatorJoinTargets({
        membershipOrgIds: realMemberIds,
        ownedOrgIds: !owned.error ? (owned.data ?? []).map((row) => String(row.id)) : [],
        persistedOrgId: persisted?.orgId,
      });
      for (const orgId of joinTargets) {
        const rpc = await supabase.rpc("join_created_company" as never, joinCreatedCompanyArgs(orgId) as never);
        const rpcError = (rpc as { error?: { message?: string } | null }).error?.message ?? null;
        if (isCreatorDeniedError(rpcError ?? "")) continue;
        if (!creatorRpcAccepted(rpcError)) {
          await supabase.from("organization_members").insert(liveMemberInsert({ orgId, userId: user!.id }) as never);
        }
      }
      if (joinTargets.length) {
        const refreshed = await fetchMembershipRows(async (select, orderByCreatedAt) => {
          let request = supabase.from("organization_members").select(select).eq("user_id", user!.id);
          if (orderByCreatedAt) request = request.order("created_at");
          return request;
        });
        if (!refreshed.error) {
          memberships = mergeOwnedOrganizations(mapMembershipRows(refreshed.data), [
            ...(!owned.error ? owned.data ?? [] : []),
            ...(persisted ? [{ id: persisted.orgId, name: persisted.name }] : []),
          ]);
        }
      }
      if (!memberships.length) return { memberships: [], current: null as OrganizationMembership | null };
      const stored = readStoredOrg();
      const current = memberships.find((m) => m.orgId === stored) ?? memberships[0];
      return { memberships, current };
    },
  });
  const persisted = readPersistedWorkspace();
  const current = query.data?.current ?? persisted ?? null;
  const memberships = query.data?.memberships?.length ? query.data.memberships : persisted ? [persisted] : [];
  return {
    organization: current,
    memberships,
    loading: !ready || (Boolean(user?.id) && query.isLoading),
    fetching: query.isFetching,
    ready: ready && (!user?.id || query.isFetched),
    loaded: query.isSuccess,
    failed: query.isError,
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
