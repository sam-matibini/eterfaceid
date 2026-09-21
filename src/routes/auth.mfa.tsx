import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthFrame, authButtonClass, authInputClass } from "@/components/auth/AuthFrame";
import { supabase } from "@/integrations/supabase/client";
import { continueSignedIn } from "@/lib/after-auth";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/auth/mfa")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "MFA verification — eterfaceID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MfaChallengePage,
});

function MfaChallengePage() {
  const navigate = useNavigate();
  const { session, ready } = useSession();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !session) void navigate({ to: "/auth", replace: true });
  }, [ready, session, navigate]);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const totp = factors?.totp?.[0];
      if (!totp) {
        void navigate({ to: "/security/mfa", replace: true });
        return;
      }
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (challengeError || !challenge) throw challengeError ?? new Error("Could not start MFA");
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;
      const next = await continueSignedIn({ skipMfa: true });
      void navigate({ to: next, replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code could not be verified");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="MFA Verification" subtitle="Enter the authentication code from your authenticator app, passkey or security key.">
      <form onSubmit={verify} className="space-y-4">
        <label className="text-sm font-medium">
          Authentication code
          <input
            className={authInputClass}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="______"
          />
        </label>
        {error ? <p className="text-sm text-[var(--signal)]">{error}</p> : null}
        <button type="submit" disabled={busy || code.trim().length < 6} className={authButtonClass}>
          Verify
        </button>
      </form>
    </AuthFrame>
  );
}
