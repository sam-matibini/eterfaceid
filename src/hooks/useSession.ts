import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import {
  hasPermission,
  inferAccessRole,
  mfaRequiredFor,
  type AccessRole,
  type AppRole,
  type PermissionCode,
} from "@/lib/access";
import { isMissingColumnError, liveMemberInsert } from "@/lib/schema-fallback";

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

export type OrganizationMembership = {
  orgId: string;
  role: AppRole;
  accessRole: AccessRole;
  isOwner: boolean;
  name: string;
  legalName: string;
  orgLiveAccess: string;
  sandboxAccess: boolean;
  liveAccess: boolean;
  permissions: string[];
  mfaRequired: boolean;
  jobTitle: string | null;
  userType: string;
};

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
      const full = await supabase
        .from("organization_members")
        .select(
          "org_id, role, access_role, is_owner, sandbox_access, live_access, permissions, mfa_required, job_title, user_type, status, organizations(id, name, slug, legal_name, live_access)",
        )
        .eq("user_id", user!.id)
        .order("created_at");
      const { data, error } =
        full.error && isMissingColumnError(full.error.message)
          ? await supabase
              .from("organization_members")
              .select("org_id, role, organizations(id, name, slug, live_access)")
              .eq("user_id", user!.id)
              .order("created_at")
          : full;
      if (error) throw error;
      const rows = (data ?? []).filter((row) => (row as { status?: string }).status !== "disabled");
      const memberships: OrganizationMembership[] = rows.map((raw) => {
        const row = raw as {
          org_id: string;
          role: AppRole;
          access_role?: AccessRole | null;
          is_owner?: boolean | null;
          sandbox_access?: boolean | null;
          live_access?: boolean | null;
          permissions?: string[] | null;
          mfa_required?: boolean | null;
          job_title?: string | null;
          user_type?: string | null;
          organizations?: {
            name?: string;
            legal_name?: string | null;
            live_access?: string;
          } | null;
        };
        const org = row.organizations ?? null;
        return {
          orgId: row.org_id,
          role: row.role,
          accessRole: row.access_role ?? inferAccessRole(row.role),
          isOwner: Boolean(row.is_owner) || row.role === "admin",
          name: org?.name ?? "Your team",
          legalName: org?.legal_name ?? org?.name ?? "Your team",
          orgLiveAccess: org?.live_access ?? "locked",
          sandboxAccess: row.sandbox_access !== false,
          liveAccess: Boolean(row.live_access) || row.role === "admin",
          permissions: row.permissions ?? [],
          mfaRequired: Boolean(row.mfa_required) || row.role === "admin",
          jobTitle: row.job_title ?? null,
          userType: row.user_type ?? "employee",
        };
      });
      const seen = new Set(memberships.map((row) => row.orgId));
      const owned = await supabase.from("organizations").select("id, name, legal_name").eq("created_by", user!.id);
      if (!owned.error) {
        for (const org of owned.data ?? []) {
          if (seen.has(org.id)) continue;
          const join = await supabase.rpc("join_created_company" as never, { _org_id: org.id } as never);
          if (join.error) {
            await supabase.from("organization_members").insert(
              liveMemberInsert({ orgId: org.id, userId: user!.id, role: "admin" }) as never,
            );
          }
          memberships.push({
            orgId: org.id,
            role: "admin",
            accessRole: "owner",
            isOwner: true,
            name: org.name ?? "Your team",
            legalName: org.legal_name ?? org.name ?? "Your team",
            orgLiveAccess: "locked",
            sandboxAccess: true,
            liveAccess: true,
            permissions: [],
            mfaRequired: true,
            jobTitle: null,
            userType: "employee",
          });
          seen.add(org.id);
        }
      }
      if (!memberships.length) return { memberships: [], current: null as OrganizationMembership | null };
      const stored = readStoredOrg();
      const current = memberships.find((m) => m.orgId === stored) ?? memberships[0];
      return { memberships, current };
    },
  });
  const current = query.data?.current ?? null;
  return {
    organization: current,
    memberships: query.data?.memberships ?? [],
    loading: !ready || query.isLoading,
    ready: ready && !query.isLoading,
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
