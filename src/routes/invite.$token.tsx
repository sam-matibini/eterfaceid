import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { AuthFrame, authButtonClass, authInputClass } from "@/components/auth/AuthFrame";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { acceptInvite, peekInvite } from "@/lib/teams.functions";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Accept invitation — eterfaceID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const { session, ready } = useSession();
  const peek = useServerFn(peekInvite);
  const join = useServerFn(acceptInvite);

  const [info, setInfo] = useState<{
    email: string;
    firstName: string;
    lastName: string;
    orgName: string;
    inviterName: string;
    roleLabel: string;
    liveAccess: boolean;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);

  useEffect(() => {
    window.sessionStorage.setItem("eid_invite_token", token);
    void peek({ data: { token } })
      .then((result) => {
        setInfo(result);
        setFirstName(result.firstName);
        setLastName(result.lastName);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "This invitation is not valid"));
    // peek is a stable server fn wrapper; token is the invitation secret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!info) return;
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!terms || !privacy) {
      setError("Accept the Terms of Service and Privacy Policy to continue");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: info.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/invite/${token}`,
          data: { full_name: `${firstName} ${lastName}`.trim() },
        },
      });
      if (signUpError) throw signUpError;
      if (!data.session) {
        setNotice(`We've sent a verification email to ${info.email}. Confirm it, then return here.`);
        return;
      }
      await join({
        data: { token, firstName, lastName, origin: window.location.origin },
      });
      window.sessionStorage.removeItem("eid_invite_token");
      void navigate({ to: "/security/mfa", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function acceptExisting() {
    setBusy(true);
    setError(null);
    try {
      await join({ data: { token, firstName, lastName, origin: window.location.origin } });
      window.sessionStorage.removeItem("eid_invite_token");
      void navigate({ to: "/console", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (error && !info) {
    return (
      <AuthFrame title="Invitation unavailable" subtitle={error}>
        <Link to="/auth" className={authButtonClass}>
          Go to login
        </Link>
      </AuthFrame>
    );
  }

  if (!info) {
    return (
      <AuthFrame title="Opening your invitation">
        <p className="text-sm text-muted-foreground">Checking this invitation…</p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Welcome to eterfaceID" subtitle="You've been invited to join a secure KYC / KYB / AML workspace.">
      <div className="mb-6 border border-[var(--rule)] bg-[var(--paper-deep)] p-4 text-sm">
        <p>
          You've been invited to join: <strong>{info.orgName}</strong>
        </p>
        <p className="mt-2 text-muted-foreground">
          Invited by: {info.inviterName}
          <br />
          Your role: {info.roleLabel}
          <br />
          Environment: {info.liveAccess ? "Sandbox and Live" : "Sandbox"}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Expires {new Date(info.expiresAt).toLocaleString()}
        </p>
      </div>

      {ready && session ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Signed in as {session.user.email}. Accept to join {info.orgName}.
          </p>
          <button type="button" disabled={busy} onClick={() => void acceptExisting()} className={authButtonClass}>
            Accept Invitation
          </button>
        </div>
      ) : (
        <form onSubmit={createAccount} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              First Name
              <input className={authInputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </label>
            <label className="text-sm font-medium">
              Last Name
              <input className={authInputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </label>
          </div>
          <label className="text-sm font-medium">
            Email
            <input className={authInputClass} value={info.email} readOnly disabled />
          </label>
          <label className="text-sm font-medium">
            Password
            <input
              className={authInputClass}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Confirm Password
            <input
              className={authInputClass}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            I agree to the Terms of Service
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
            I acknowledge the Privacy Policy
          </label>
          <button type="submit" disabled={busy} className={authButtonClass}>
            Create Account
          </button>
        </form>
      )}

      {notice ? (
        <div className="mt-4 border border-[var(--rule)] p-3 text-sm">
          <p>Account Created</p>
          <p className="text-muted-foreground">{notice}</p>
        </div>
      ) : null}
      {error ? <p className="mt-4 text-sm text-[var(--signal)]">{error}</p> : null}
    </AuthFrame>
  );
}
