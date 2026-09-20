import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";

import { AuthFrame } from "@/components/auth/AuthFrame";
import { supabase } from "@/integrations/supabase/client";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const url = new URL(window.location.href);
      const next = url.searchParams.get("next") || "/console";
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
      const type = (url.searchParams.get("type") ?? "signup") as EmailOtpType;

      try {
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
  }, [navigate]);

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
