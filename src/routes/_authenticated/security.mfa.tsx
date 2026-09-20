import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthFrame, authButtonClass } from "@/components/auth/AuthFrame";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/security/mfa")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Secure your account — eterfaceID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MfaEnrollPage,
});

function MfaEnrollPage() {
  const navigate = useNavigate();
  const { mfaRequired } = useRoles();
  const [method, setMethod] = useState<"totp" | "passkey" | "security_key">("totp");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      if (method !== "totp") {
        setError("Passkeys and security keys use the authenticator app flow for now. Choose Authenticator App.");
        return;
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
      });
      if (enrollError) throw enrollError;
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFA could not be started");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge) throw challengeError ?? new Error("Could not challenge");
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;
      void navigate({ to: "/console", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code could not be verified");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title="Secure Your Account"
      subtitle={
        mfaRequired
          ? "MFA is mandatory for Organization Owners, Administrators, Compliance Administrators, and developers with Live access."
          : "Choose a multi-factor method to protect KYC, KYB, AML data and API credentials."
      }
    >
      {!factorId ? (
        <div className="space-y-4">
          <p className="text-sm font-medium">Choose MFA Method</p>
          {(
            [
              ["totp", "Authenticator App"],
              ["passkey", "Passkey"],
              ["security_key", "Security Key"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="mfa" checked={method === value} onChange={() => setMethod(value)} />
              {label}
            </label>
          ))}
          {error ? <p className="text-sm text-[var(--signal)]">{error}</p> : null}
          <button type="button" disabled={busy} onClick={() => void start()} className={authButtonClass}>
            Continue
          </button>
          {!mfaRequired ? (
            <button type="button" className="w-full text-sm text-muted-foreground underline" onClick={() => navigate({ to: "/console" })}>
              Skip for now
            </button>
          ) : null}
        </div>
      ) : (
        <form onSubmit={confirm} className="space-y-4">
          {qr ? <img src={qr} alt="Authenticator QR code" className="mx-auto h-40 w-40" /> : null}
          {secret ? <p className="break-all font-mono text-xs text-muted-foreground">{secret}</p> : null}
          <input
            className="h-11 w-full rounded-md border border-[var(--rule)] bg-background px-3 text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter the 6-digit code"
          />
          {error ? <p className="text-sm text-[var(--signal)]">{error}</p> : null}
          <button type="submit" disabled={busy} className={authButtonClass}>
            Enable MFA
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
