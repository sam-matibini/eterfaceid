import { supabase } from "@/integrations/supabase/client";
import { STAFF_BYPASS_EMAIL } from "@/lib/staff-bypass";

async function claimStaffSeat() {
  try {
    await supabase.rpc("ensure_ops_staff" as never);
  } catch {
    /* function lands with the staff bootstrap migration */
  }
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;
  await supabase.from("platform_staff").upsert(
    { user_id: user.id, email: user.email ?? STAFF_BYPASS_EMAIL, level: "owner" },
    { onConflict: "user_id" },
  );
}

export async function completeStaffPasswordSession(pin: string) {
  const signedIn = await supabase.auth.signInWithPassword({
    email: STAFF_BYPASS_EMAIL,
    password: pin,
  });
  if (!signedIn.error && signedIn.data.session) {
    await claimStaffSeat();
    return;
  }

  const created = await supabase.auth.signUp({
    email: STAFF_BYPASS_EMAIL,
    password: pin,
    options: { data: { full_name: "eterfaceID staff" } },
  });
  if (created.error) {
    throw new Error(signedIn.error?.message ?? created.error.message);
  }
  if (!created.data.session) {
    throw new Error(
      "Staff sign-in needs the bootstrap account. Publish the latest database migration, then try the access code again.",
    );
  }
  await claimStaffSeat();
}
