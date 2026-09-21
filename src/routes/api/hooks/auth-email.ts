import { createFileRoute } from "@tanstack/react-router";

/**
 * Supabase Auth Send Email Hook.
 * Point Authentication → Hooks → Send Email at this URL so signup, invite
 * and password-reset messages go through Resend instead of Auth SMTP.
 */
export const Route = createFileRoute("/api/hooks/auth-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { deliverAuthHookEmail } = await import("@/lib/auth-email-hook.server");
        const result = await deliverAuthHookEmail(request);
        return new Response(JSON.stringify(result.ok ? { ok: true } : { error: { message: result.error } }), {
          status: result.status,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
