import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canManageStaff, parseStaffLevel, staffInviteRole, type StaffLevel } from "@/lib/admin-staff";

const levelSchema = z.enum(["owner", "developer", "operations"]);

async function requireStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("platform_staff").select("id, level, email").eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("This area is for eterfaceID staff only");
  const { requireAdminUnlocked } = await import("./admin-gate.server");
  await requireAdminUnlocked(userId);
  return data as { id: string; level: string; email: string | null };
}

async function findUserByEmail(admin: any, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw listed.error;
    const found = listed.data.users.find((user: { email?: string | null }) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (listed.data.users.length < 200) return null;
  }
  return null;
}

function mapStaffRow(row: {
  id: string;
  user_id?: string | null;
  email?: string | null;
  level?: string | null;
  created_at?: string | null;
}) {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    email: (row.email ?? "").toLowerCase(),
    name: row.email ?? "Staff",
    level: parseStaffLevel(row.level),
    status: "active" as const,
    savedAt: row.created_at ?? new Date().toISOString(),
  };
}

export const listPlatformStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("platform_staff")
      .select("id, user_id, email, level, created_at")
      .order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapStaffRow);
  });

export const addPlatformStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().trim().email().max(200),
        name: z.string().trim().max(120).optional(),
        level: levelSchema.default("operations"),
        origin: z.string().trim().url().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await requireStaff(context.supabase, context.userId);
    if (!canManageStaff(actor.level) && data.level === "owner") {
      throw new Error("Only an owner can add another owner.");
    }
    if (!canManageStaff(actor.level) && actor.level !== "owner") {
      throw new Error("Only an owner can add App admin staff.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const name = data.name?.trim() || email.split("@")[0] || "Staff";
    const level = data.level as StaffLevel;

    let user = await findUserByEmail(supabaseAdmin, email);
    if (!user) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: name },
      });
      if (created.error && !/already|registered|exists/i.test(created.error.message)) {
        throw new Error(created.error.message);
      }
      user = created.data.user ?? (await findUserByEmail(supabaseAdmin, email));
    }
    if (!user) throw new Error("Could not create the staff account");

    const { error } = await supabaseAdmin.from("platform_staff").upsert(
      { user_id: user.id, email, level } as never,
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    let inviteLink: string | null = null;
    let emailed: { sent: boolean; reason?: string; detail?: string } | null = null;
    try {
      const origin = data.origin ?? "https://eterfaceid.com";
      const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (!linkError) {
        const hashed = (link.properties as { hashed_token?: string; action_link?: string } | undefined) ?? {};
        inviteLink = hashed.action_link || `${origin}/auth`;
      }
      const { sendNotification } = await import("@/lib/email.server");
      emailed = await sendNotification(supabaseAdmin, {
        event: "staff.invite",
        to: email,
        data: {
          name,
          role: staffInviteRole(level),
          org: "eterfaceID App admin",
          inviter: actor.email ?? "eterfaceID",
          link: inviteLink ?? `${origin}/auth`,
          hours: "72",
        },
      });
    } catch (err) {
      emailed = { sent: false, detail: err instanceof Error ? err.message : "Invite email could not be sent" };
    }

    return {
      id: user.id,
      email,
      name,
      level,
      userId: user.id,
      status: "invited" as const,
      inviteLink,
      emailed,
    };
  });

export const setPlatformStaffLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().min(1).max(80), level: levelSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await requireStaff(context.supabase, context.userId);
    if (!canManageStaff(actor.level)) throw new Error("Only an owner can change staff roles.");
    const { error } = await context.supabase
      .from("platform_staff")
      .update({ level: data.level } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePlatformStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await requireStaff(context.supabase, context.userId);
    if (!canManageStaff(actor.level)) throw new Error("Only an owner can remove staff.");
    if (data.id === actor.id) throw new Error("You cannot remove your own staff access.");
    const { error } = await context.supabase.from("platform_staff").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCompanyTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const members = await supabaseAdmin
      .from("organization_members")
      .select("user_id, role, created_at")
      .eq("org_id", data.orgId);
    if (members.error) throw new Error(members.error.message);
    const ids = (members.data ?? []).map((row) => row.user_id);
    const profiles = ids.length
      ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", ids)
      : { data: [], error: null };
    if (profiles.error) throw new Error(profiles.error.message);
    return (members.data ?? []).map((row) => {
      const profile = (profiles.data ?? []).find((p) => p.id === row.user_id);
      return {
        userId: row.user_id as string,
        role: row.role as string,
        email: profile?.email ?? null,
        fullName: profile?.full_name ?? null,
        createdAt: row.created_at as string,
      };
    });
  });
