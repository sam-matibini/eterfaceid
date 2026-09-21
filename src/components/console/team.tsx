import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { fieldClass, inkButtonClass, Panel, StatusPill } from "@/components/console/shell";
import { useOrganization } from "@/hooks/useSession";
import {
  ACCESS_ROLES,
  INVITE_PERMISSION_OPTIONS,
  PERMISSIONS,
  USER_TYPES,
  defaultPermissions,
  displayRole,
  type AccessRole,
  type PermissionCode,
  type UserType,
} from "@/lib/access";
import { fetchTeam } from "@/lib/console";
import { inviteMember, removeMember, resendInvite, revokeInvite, setMemberRole } from "@/lib/teams.functions";

export function TeamPanel({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const invite = useServerFn(inviteMember);
  const cancelInvite = useServerFn(revokeInvite);
  const resend = useServerFn(resendInvite);
  const changeRole = useServerFn(setMemberRole);
  const kick = useServerFn(removeMember);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    jobTitle: "",
    userType: "employee" as UserType,
    accessRole: "developer" as AccessRole,
    sandboxAccess: true,
    liveAccess: false,
    permissions: defaultPermissions("developer") as PermissionCode[],
  });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteEmailed, setInviteEmailed] = useState<{ sent: boolean; reason?: string; detail?: string } | null>(null);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  const team = useQuery({
    queryKey: ["team", organization?.orgId],
    enabled: Boolean(organization?.orgId),
    queryFn: () => fetchTeam(organization?.orgId),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["team"] });
    void queryClient.invalidateQueries({ queryKey: ["my-org"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
  };

  function applyRole(role: AccessRole) {
    setForm((current) => ({
      ...current,
      accessRole: role,
      liveAccess: role === "administrator" ? current.liveAccess : false,
      permissions: defaultPermissions(role),
    }));
  }

  const sendInvite = useMutation({
    mutationFn: async () =>
      invite({
        data: {
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          jobTitle: form.jobTitle || undefined,
          userType: form.userType,
          accessRole: form.accessRole === "owner" ? "administrator" : form.accessRole,
          sandboxAccess: form.sandboxAccess,
          liveAccess: form.liveAccess,
          permissions: form.permissions,
          orgId: organization?.orgId,
          origin: window.location.origin,
        },
      }),
    onSuccess: (result) => {
      const email = form.email;
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        jobTitle: "",
        userType: "employee",
        accessRole: "developer",
        sandboxAccess: true,
        liveAccess: false,
        permissions: defaultPermissions("developer"),
      });
      setOpen(false);
      if (result.added) {
        setInviteLink(null);
        setInviteEmailed(null);
        setAddedNotice(`${email} was added to the company.`);
      } else {
        setAddedNotice(`Invitation ready for ${email}.`);
        setInviteLink(`${window.location.origin}/invite/${result.token}`);
        setInviteEmailed(result.emailed);
      }
      refresh();
    },
  });

  const roleMutation = useMutation({
    mutationFn: async (vars: { userId: string; accessRole: AccessRole }) => changeRole({ data: vars }),
    onSuccess: refresh,
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => kick({ data: { userId } }),
    onSuccess: refresh,
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => cancelInvite({ data: { id } }),
    onSuccess: refresh,
  });

  const resendMutation = useMutation({
    mutationFn: async (id: string) => resend({ data: { id, origin: window.location.origin } }),
    onSuccess: (result) => {
      setInviteLink(`${window.location.origin}/invite/${result.token}`);
      setInviteEmailed(result.emailed);
      refresh();
    },
  });

  function togglePermission(code: PermissionCode) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(code)
        ? current.permissions.filter((p) => p !== code)
        : [...current.permissions, code],
    }));
  }

  return (
    <Panel
      title={organization ? `${organization.name} — Team` : "Team"}
      action={
        isAdmin ? (
          <button type="button" className={inkButtonClass} onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "Add teammate"}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4 text-sm">
        {team.isLoading ? <p className="text-muted-foreground">Loading team…</p> : null}
        {team.isError ? (
          <p className="text-[var(--signal)]">{(team.error as Error).message}</p>
        ) : null}
        {(team.data?.members ?? []).map((member) => (
          <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">{member.fullName ?? member.email ?? "Team member"}</div>
              <div className="text-xs text-muted-foreground">
                {member.email}
                {member.jobTitle ? ` · ${member.jobTitle}` : ""}
                {` · ${member.userType}`}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <StatusPill tone={member.sandboxAccess ? "approved" : "closed"}>Sandbox</StatusPill>
                <StatusPill tone={member.liveAccess ? "high" : "closed"}>Live</StatusPill>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && !member.isOwner ? (
                <select
                  value={member.accessRole === "owner" ? "administrator" : member.accessRole}
                  onChange={(e) =>
                    roleMutation.mutate({ userId: member.userId, accessRole: e.target.value as AccessRole })
                  }
                  className="h-9 rounded-md border border-[var(--rule)] bg-background px-2 text-sm"
                >
                  {ACCESS_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              ) : (
                <StatusPill tone="pending">
                  {displayRole(member.role, member.accessRole, member.isOwner)}
                </StatusPill>
              )}
              {isAdmin && !member.isOwner ? (
                <button
                  type="button"
                  onClick={() => removeMutation.mutate(member.userId)}
                  className="rounded-md border border-[var(--rule)] px-3 py-1.5 text-xs transition-colors hover:bg-[var(--paper-deep)]"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {(team.data?.members ?? []).length === 0 && !team.isLoading ? (
          <p className="text-muted-foreground">No team members yet.</p>
        ) : null}
      </div>

      {open && isAdmin ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendInvite.mutate();
          }}
          className="mt-5 space-y-4 border-t border-[var(--rule)] pt-5"
        >
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Add teammate</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              First Name *
              <input
                required
                className={`${fieldClass} mt-1 normal-case tracking-normal text-foreground`}
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </label>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Last Name *
              <input
                required
                className={`${fieldClass} mt-1 normal-case tracking-normal text-foreground`}
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </label>
            <label className="text-xs uppercase tracking-widest text-muted-foreground sm:col-span-2">
              Email Address *
              <input
                required
                type="email"
                className={`${fieldClass} mt-1 normal-case tracking-normal text-foreground`}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Job Title
              <input
                className={`${fieldClass} mt-1 normal-case tracking-normal text-foreground`}
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              />
            </label>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              User Type *
              <select
                className={`${fieldClass} mt-1 normal-case tracking-normal text-foreground`}
                value={form.userType}
                onChange={(e) => setForm({ ...form, userType: e.target.value as UserType })}
              >
                {USER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs uppercase tracking-widest text-muted-foreground sm:col-span-2">
              Role *
              <select
                className={`${fieldClass} mt-1 normal-case tracking-normal text-foreground`}
                value={form.accessRole}
                onChange={(e) => applyRole(e.target.value as AccessRole)}
              >
                {ACCESS_ROLES.filter((r) => r.value !== "analyst").map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Environment Access</p>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.sandboxAccess}
                onChange={(e) => setForm({ ...form, sandboxAccess: e.target.checked })}
              />
              Sandbox
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.liveAccess}
                onChange={(e) => setForm({ ...form, liveAccess: e.target.checked })}
              />
              Live — must be authorized explicitly. Developer role does not grant it.
            </label>
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Permissions</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {INVITE_PERMISSION_OPTIONS.map((code) => {
                const meta = PERMISSIONS.find((p) => p.code === code);
                return (
                  <label key={code} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.permissions.includes(code)}
                      onChange={() => togglePermission(code)}
                    />
                    {meta?.label ?? code}
                  </label>
                );
              })}
            </div>
          </div>

          {sendInvite.isError ? (
            <p className="text-sm text-[var(--signal)]">{(sendInvite.error as Error).message}</p>
          ) : null}

          <button type="submit" disabled={sendInvite.isPending} className={inkButtonClass}>
            {sendInvite.isPending ? "Saving…" : "Add to company"}
          </button>
        </form>
      ) : null}

      {addedNotice ? <p className="mt-3 text-sm text-[var(--verify)]">{addedNotice}</p> : null}

      {inviteLink ? (
        <div className="mt-4 border border-[var(--signal)] bg-[var(--paper-deep)] p-3">
          <p className="text-xs uppercase tracking-widest text-[var(--signal)]">
            {inviteEmailed?.sent
              ? "Invitation emailed. Share this link if it does not arrive."
              : `Invitation created, but email was not sent${inviteEmailed?.detail ? `: ${inviteEmailed.detail}` : inviteEmailed?.reason ? ` (${inviteEmailed.reason})` : ""}. Share this link.`}
          </p>
          <code className="mt-2 block break-all font-mono text-xs">{inviteLink}</code>
        </div>
      ) : null}

      {(team.data?.invites ?? []).length ? (
        <div className="mt-5 space-y-2 border-t border-[var(--rule)] pt-4 text-sm">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Pending invites</p>
          {(team.data?.invites ?? []).map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {row.email} · {displayRole(row.role, row.access_role)}
                {row.live_access ? " · Live" : " · Sandbox"}
                <span className="block text-xs text-muted-foreground">
                  Expires {new Date(row.expires_at).toLocaleString()}
                </span>
              </span>
              {isAdmin ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => resendMutation.mutate(row.id)}
                    className="rounded-md border border-[var(--rule)] px-3 py-1.5 text-xs transition-colors hover:bg-[var(--paper-deep)]"
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelMutation.mutate(row.id)}
                    className="rounded-md border border-[var(--rule)] px-3 py-1.5 text-xs transition-colors hover:bg-[var(--paper-deep)]"
                  >
                    Revoke
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-5 border-t border-[var(--rule)] pt-4 text-xs text-muted-foreground">
        Roles are templates. Permissions on each person can be changed independently. Live access is never granted
        just because someone is a developer. Invitations expire after 72 hours and can be resent or revoked.
      </p>
    </Panel>
  );
}
