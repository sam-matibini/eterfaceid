import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";

import { AuthFrame } from "@/components/auth/AuthFrame";
import { supabase } from "@/integrations/supabase/client";
import { completeSignupVerification } from "@/lib/auth-email.functions";

export const Route = createFileRoute("/auth/confirm")({
  head: () => ({
    meta: [
      { title: "Confirm email — eterfaceID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthConfirmPage,
});

function AuthConfirmPage() {
  const navigate = useNavigate();
  const completeSigned = useServerFn(completeSignupVerification);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const url = new URL(window.location.href);
      const next = url.searchParams.get("next") || "/onboarding";
      const code = url.searchParams.get("code");
      const eid = url.searchParams.get("eid");
      const tokenHash = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
      const type = (url.searchParams.get("type") ?? "signup") as EmailOtpType;

      try {
        if (eid) {
          const result = await completeSigned({ data: { eid } });
          if (result.tokenHash) {
            const { error: verifyError } = await supabase.auth.verifyOtp({
              token_hash: result.tokenHash,
              type: "magiclink",
            });
            if (verifyError) throw verifyError;
          } else if (!result.confirmed) {
            throw new Error(
              result.reason === "invalid"
                ? "This confirmation link is invalid or has expired. Request a new one from Create account."
                : "This confirmation link reached eterfaceID. Sign in after a minute, or request a new verification email.",
            );
          }
          if (!active) return;
          void navigate({ to: (result.next || next).startsWith("/") ? result.next || next : "/console", replace: true });
          return;
        }
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (tokenHash) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (verifyError) throw verifyError;
        } else {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            throw new Error("This confirmation link is invalid or has expired. Request a new one from Create account.");
          }
        }
        if (!active) return;
        void navigate({ to: next.startsWith("/") ? next : "/console", replace: true });
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "This confirmation link could not be used.");
      }
    })();
    return () => {
      active = false;
    };
  }, [navigate, completeSigned]);

  return (
    <AuthFrame title="Confirm your email" subtitle="Finishing account setup.">
      {error ? (
        <p className="text-sm text-[var(--signal)]">{error}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Confirming your email…</p>
      )}
    </AuthFrame>
  );
}
