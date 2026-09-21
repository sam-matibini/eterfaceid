import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { AdminShell, buttonClass, ghostButtonClass, inputClass } from "@/components/admin/shell";
import { Panel, StatusPill } from "@/components/console/shell";
import {
  STAFF_LEVEL_OPTIONS,
  type StaffLevel,
} from "@/lib/admin-staff";
import {
  addPlatformStaff,
  listPlatformStaff,
  removePlatformStaff,
  setPlatformStaffLevel,
} from "@/lib/admin-staff.functions";
import {
  mergeStaffLists,
  readAdminStaffVault,
  removeAdminStaffVault,
  upsertAdminStaffVault,
  type AdminStaffRow,
} from "@/lib/admin-staff-vault";
import { DEFAULT_STAFF_BYPASS_PIN, isStaffBypassUnlocked, readStaffBypassPin } from "@/lib/staff-bypass";
import { bootstrapAddPlatformStaff, bootstrapListPlatformStaff } from "@/lib/staff-bypass.functions";

export const Route = createFileRoute("/_authenticated/admin/team")({
  head: () => ({
    meta: [
      { title: "Admin team — eterfaceID app admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminTeamPage,
});

function AdminTeamPage() {
  const queryClient = useQueryClient();
  const pinUnlocked = isStaffBypassUnlocked();
  const listStaff = useServerFn(listPlatformStaff);
  const addStaff = useServerFn(addPlatformStaff);
  const changeLevel = useServerFn(setPlatformStaffLevel);
  const removeStaff = useServerFn(removePlatformStaff);
  const bootstrapList = useServerFn(bootstrapListPlatformStaff);
  const bootstrapAdd = useServerFn(bootstrapAddPlatformStaff);
  const [form, setForm] = useState({
    name: "",
    email: "",
    level: "operations" as StaffLevel,
  });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  const staff = useQuery({
    queryKey: ["admin-staff", pinUnlocked],
    queryFn: async (): Promise<AdminStaffRow[]> => {
      const local = readAdminStaffVault();
      try {
        const remote = pinUnlocked
          ? await bootstrapList({ data: { pin: readStaffBypassPin() || DEFAULT_STAFF_BYPASS_PIN } })
          : await listStaff({});
        return mergeStaffLists(
          remote.map((row) => ({
            id: row.id,
            email: row.email,
            name: row.name,
            level: row.level,
            userId: row.userId,
            status: row.status,
            savedAt: row.savedAt,
          })),
          local,
        );
      } catch {
        return local;
      }
    },
  });

  const adding = useMutation({
    mutationFn: async () => {
      const payload = {
        email: form.email.trim(),
        name: form.name.trim() || undefined,
        level: form.level,
        origin: window.location.origin,
      };
      upsertAdminStaffVault({
        email: payload.email,
        name: payload.name,
        level: payload.level,
        status: "invited",
      });
      if (pinUnlocked) {
        return bootstrapAdd({
          data: { pin: readStaffBypassPin() || DEFAULT_STAFF_BYPASS_PIN, ...payload },
        });
      }
      return addStaff({ data: payload });
    },
    onSuccess: (result) => {
      upsertAdminStaffVault({
        email: result.email,
        name: result.name,
        level: result.level,
        userId: result.userId,
        status: "invited",
        id: result.id,
      });
      setForm({ name: "", email: "", level: "operations" });
      setInviteLink(result.inviteLink ?? null);
      setInviteNote(
        result.emailed?.sent
          ? "Invitation emailed. They can also use the sign-in link if it does not arrive."
          : result.emailed?.detail
            ? `Saved on the team. Email was not sent: ${result.emailed.detail}`
            : "Saved on the team. Share the sign-in link if they do not have access yet.",
      );
      void queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
    },
  });

  const updating = useMutation({
    mutationFn: async (input: { id: string; email: string; level: StaffLevel }) => {
      upsertAdminStaffVault({ email: input.email, level: input.level, id: input.id });
      if (pinUnlocked) return { ok: true };
      return changeLevel({ data: { id: input.id, level: input.level } });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-staff"] }),
  });

  const removing = useMutation({
    mutationFn: async (input: { id: string; email: string }) => {
      removeAdminStaffVault(input.id);
      removeAdminStaffVault(input.email);
      if (pinUnlocked) return { ok: true };
      return removeStaff({ data: { id: input.id } });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-staff"] }),
  });

  return (
    <AdminShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Admin team</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Add eterfaceID staff who can open App admin. Use Developer for integrations and APIs, or Operations for
        companies, live access and billing.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Staff">
          <div className="space-y-4 text-sm">
            {(staff.data ?? []).map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)]/60 pb-4 last:border-0">
                <div>
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={row.level}
                    onChange={(e) =>
                      updating.mutate({ id: row.id, email: row.email, level: e.target.value as StaffLevel })
                    }
                    className="h-9 rounded-md border border-[var(--rule)] bg-background px-2 text-sm"
                  >
                    {STAFF_LEVEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <StatusPill tone={row.status === "active" ? "approved" : "pending"}>
                    {row.status}
                  </StatusPill>
                  {row.level !== "owner" ? (
                    <button
                      type="button"
                      className={ghostButtonClass}
                      onClick={() => removing.mutate({ id: row.id, email: row.email })}
                      disabled={removing.isPending}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {(staff.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">No staff recorded yet. Add a developer or operations person.</p>
            ) : null}
          </div>
        </Panel>

        <Panel title="Add staff">
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (form.email.trim()) adding.mutate();
            }}
          >
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name"
              className={inputClass}
            />
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="work email"
              className={inputClass}
            />
            <select
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value as StaffLevel })}
              className={inputClass}
            >
              {STAFF_LEVEL_OPTIONS.filter((row) => row.value !== "owner").map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {STAFF_LEVEL_OPTIONS.find((row) => row.value === form.level)?.description}
            </p>
            <button type="submit" className={buttonClass} disabled={adding.isPending || !form.email.trim()}>
              {adding.isPending ? "Adding…" : "Add to admin team"}
            </button>
            {adding.isError ? (
              <p className="text-sm text-[var(--signal)]">{(adding.error as Error).message}</p>
            ) : null}
          </form>
          {inviteNote ? <p className="mt-3 text-sm text-muted-foreground">{inviteNote}</p> : null}
          {inviteLink ? (
            <code className="mt-2 block break-all font-mono text-xs">{inviteLink}</code>
          ) : null}
        </Panel>
      </div>
    </AdminShell>
  );
}
