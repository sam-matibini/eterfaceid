import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { STAFF_BYPASS_EMAIL } from "@/lib/staff-bypass";

const pinInput = z.object({
  pin: z.string().min(1, "Enter the staff access code").max(72),
});

async function attemptKey() {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded || request.headers.get("x-real-ip") || "local";
  } catch {
    return "local";
  }
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function findUserByEmail(admin: SupabaseClient<Database>, email: string): Promise<User | null> {
  for (let page = 1; page <= 20; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw listed.error;
    const found = listed.data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (listed.data.users.length < 200) return null;
  }
  return null;
}

async function ensureStaffUser(admin: SupabaseClient<Database>): Promise<User> {
  const created = await admin.auth.admin.createUser({
    email: STAFF_BYPASS_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: "eterfaceID staff" },
  });
  if (!created.error && created.data.user) return created.data.user;

  const already = /already|registered|exists/i.test(created.error?.message ?? "");
  if (!already && created.error) throw created.error;

  const existing = await findUserByEmail(admin, STAFF_BYPASS_EMAIL);
  if (!existing) throw new Error("Could not create the staff account");
  return existing;
}

async function dropMfaFactors(admin: SupabaseClient<Database>, userId: string) {
  try {
    const listed = await admin.auth.admin.mfa.listFactors({ userId });
    const factors = listed.data?.factors ?? [];
    for (const factor of factors) {
      await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    }
  } catch {
    /* MFA admin APIs are optional; a fresh ops user has no factors */
  }
}

export const enterStaffBypass = createServerFn({ method: "POST" })
  .inputValidator((input) => pinInput.parse(input))
  .handler(async ({ data }) => {
    const {
      clearPinAttempts,
      configuredStaffBypassPin,
      consumePinAttempt,
      extractStaffSessionToken,
      pinsMatch,
    } = await import("@/lib/staff-bypass.server");

    const key = await attemptKey();
    const gate = consumePinAttempt(key);
    if (!gate.allowed) {
      throw new Error("Too many attempts. Wait a few minutes and try again.");
    }

    const expected = configuredStaffBypassPin();
    if (!expected) {
      throw new Error("Staff bootstrap is disabled on this deployment.");
    }
    if (!pinsMatch(data.pin.trim(), expected)) {
      throw new Error("That access code is not valid.");
    }

    let admin: SupabaseClient<Database>;
    try {
      admin = await adminClient();
    } catch (err) {
      throw new Error(
        err instanceof Error
          ? err.message
          : "Staff bootstrap needs SUPABASE_SERVICE_ROLE_KEY. Connect Supabase in Lovable Cloud.",
      );
    }

    const user = await ensureStaffUser(admin);
    const { error: staffError } = await admin.from("platform_staff").upsert(
      { user_id: user.id, email: STAFF_BYPASS_EMAIL, level: "owner" },
      { onConflict: "user_id" },
    );
    if (staffError) throw new Error(staffError.message);

    await dropMfaFactors(admin, user.id);

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: STAFF_BYPASS_EMAIL,
    });
    if (linkError) throw new Error(linkError.message);

    const tokenHash = extractStaffSessionToken(link.properties);
    if (!tokenHash) throw new Error("Could not start a staff session.");

    clearPinAttempts(key);
    return { tokenHash, email: STAFF_BYPASS_EMAIL };
  });
