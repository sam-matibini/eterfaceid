import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase
    .from("platform_staff")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("This area is for eterfaceID staff only");
}

export const adminGateStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdminUnlocked } = await import("./admin-gate.server");
    return { unlocked: await isAdminUnlocked(context.userId) };
  });

export const unlockAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);

    // Durable throttle: max 5 attempts per 10-minute window, per staff user.
    const window = Math.floor(Date.now() / (10 * 60 * 1000));
    const { data: hits } = await context.supabase.rpc("bump_rate", {
      _key: context.userId,
      _bucket: `admin-unlock-${window}`,
    });
    if (typeof hits === "number" && hits > 5) {
      return { ok: false as const, reason: "throttled" as const };
    }

    const expected = process.env["ADMIN_ACCESS_CODE"];
    if (!expected) throw new Error("ADMIN_ACCESS_CODE is not configured");

    const { codeMatches, getAdminSession } = await import("./admin-gate.server");
    if (!codeMatches(data.code.trim(), expected)) {
      return { ok: false as const, reason: "invalid" as const };
    }

    const session = await getAdminSession();
    await session.update({ unlocked: true, userId: context.userId });
    return { ok: true as const };
  });

export const lockAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getAdminSession } = await import("./admin-gate.server");
    const session = await getAdminSession();
    await session.clear();
    return { ok: true as const };
  });
