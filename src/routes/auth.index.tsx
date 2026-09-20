import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";

import { AuthFrame, authButtonClass, authInputClass } from "@/components/auth/AuthFrame";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { sendPasswordResetEmail, sendSignupVerificationEmail } from "@/lib/auth-email.functions";
import { publicEmailFailureMessage } from "@/lib/email-copy";
import { enterStaffBypass } from "@/lib/staff-bypass.functions";
import {
  STAFF_BYPASS_FLAG,
  STAFF_BYPASS_HASH,
  STAFF_BYPASS_PATH,
  staffPinUnlocks,
  unlockStaffBypass,
} from "@/lib/staff-bypass";

export const Route = createFileRoute("/auth/")({
  head: () => ({
    meta: [
      { title: "Sign in — eterfaceID" },
      {
        name: "description",
        content: "Sign in to the eterfaceID console to work verification cases, APIs and compliance reports.",
      },
      { property: "og:title", content: "Sign in — eterfaceID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(8, "Use at least 8 characters").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, ready } = useSession();
  const sendVerify = useServerFn(sendSignupVerificationEmail);
  const sendReset = useServerFn(sendPasswordResetEmail);
  const staffBypass = useServerFn(enterStaffBypass);
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "staff">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staffPin, setStaffPin] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [hasInvite, setHasInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const token = window.sessionStorage.getItem("eid_invite_token");
    if (token) {
      setHasInvite(true);
      setMode("signup");
    }
  }, []);

  useEffect(() => {
    if (!ready || !session) return;
    if (window.sessionStorage.getItem(STAFF_BYPASS_FLAG) === "1") {
      window.sessionStorage.removeItem(STAFF_BYPASS_FLAG);
      void navigate({ to: STAFF_BYPASS_PATH, hash: STAFF_BYPASS_HASH, replace: true });
      return;
    }
    void (async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") {
        void navigate({ to: "/auth/mfa", replace: true });
        return;
      }
      void navigate({ to: "/console", replace: true });
    })();
  }, [ready, session, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === "staff") {
      const pin = staffPin.trim();
      if (!pin) {
        setError("Enter the staff access code");
        return;
      }
      setBusy(true);
      try {
        if (!staffPinUnlocks(pin)) {
          await staffBypass({ data: { pin } });
        }
        unlockStaffBypass(pin);
        void navigate({ to: STAFF_BYPASS_PATH, hash: STAFF_BYPASS_HASH, replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "That access code is not valid.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === "reset") {
      if (!email.trim()) {
        setError("Enter your work email");
        return;
      }
      setBusy(true);
      try {
        const result = await sendReset({ data: { email: email.trim(), origin: window.location.origin } });
        if (result.sent || result.reason === "rate_limited") {
          setNotice("If that address has an account, we sent a reset link.");
        } else {
          setError(publicEmailFailureMessage(result) ?? "The reset email could not be sent. Try again shortly.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
      return;
    }
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }
    if (mode === "signup" && !hasInvite && (firstName.trim().length < 1 || lastName.trim().length < 1)) {
      setError("Enter your first and last name");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        window.sessionStorage.setItem("eid_admin_name", `${firstName.trim()} ${lastName.trim()}`.trim());
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: `${firstName.trim()} ${lastName.trim()}`.trim() },
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          const mailed = await sendVerify({
            data: { email: parsed.data.email, origin: window.location.origin },
          });
          if (mailed.sent || mailed.reason === "rate_limited") {
            setNotice("We've sent a verification email. Confirm the address, then continue.");
          } else {
            setError(
              publicEmailFailureMessage(mailed) ??
                "The account was created, but the verification email could not be sent. Try signing in after a minute, or use Forgot Password.",
            );
          }
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (signInError) throw signInError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "signup"
      ? hasInvite
        ? "Create your account"
        : "Create a company account"
      : mode === "reset"
        ? "Reset your password"
        : mode === "staff"
          ? "App admin access"
          : "eterfaceID Login";

  return (
    <AuthFrame
      title={title}
      subtitle={
        hasInvite
          ? "You've been invited to an organization. Create your account to accept the invitation."
          : mode === "signup"
            ? "The primary administrator creates the company workspace, then invites employees and developers."
            : mode === "reset"
              ? "We will email a reset link if this address has an account."
              : mode === "staff"
                ? "Enter the staff access code to open Integrations and paste API keys."
                : "Sign in with your work email, then complete MFA if your role requires it."
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="text-sm font-medium">
                First name
              </label>
              <input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={authInputClass}
              />
            </div>
            <div>
              <label htmlFor="lastName" className="text-sm font-medium">
                Last name
              </label>
              <input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={authInputClass}
              />
            </div>
          </div>
        ) : null}
        {mode === "staff" ? (
          <div>
            <label htmlFor="staffPin" className="text-sm font-medium">
              Staff access code
            </label>
            <input
              id="staffPin"
              type="password"
              value={staffPin}
              autoComplete="off"
              onChange={(e) => setStaffPin(e.target.value)}
              className={authInputClass}
            />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                className={authInputClass}
              />
            </div>
            {mode !== "reset" ? (
              <div>
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  onChange={(e) => setPassword(e.target.value)}
                  className={authInputClass}
                />
              </div>
            ) : null}
          </>
        )}

        {error ? <p className="text-sm text-[var(--signal)]">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        <button type="submit" disabled={busy} className={authButtonClass}>
          {busy
            ? "Working…"
            : mode === "signin"
              ? "Sign In"
              : mode === "reset"
                ? "Send reset link"
                : mode === "staff"
                  ? "Open Integrations"
                  : "Create Account"}
        </button>
      </form>

      {mode === "signin" ? (
        <button
          type="button"
          onClick={() => {
            setMode("reset");
            setError(null);
            setNotice(null);
          }}
          className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Forgot Password?
        </button>
      ) : null}

      {mode === "signin" ? (
        <button
          type="button"
          onClick={() => {
            setMode("staff");
            setError(null);
            setNotice(null);
          }}
          className="mt-4 block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          App admin access
        </button>
      ) : null}

      {mode === "staff" ? (
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError(null);
            setNotice(null);
          }}
          className="mt-6 block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Back to sign in
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
          className="mt-6 block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {mode === "signin" ? "No account yet? Create a company account" : "Already have an account? Sign in"}
        </button>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        {mode === "staff"
          ? "This opens App admin → Integrations so Resend and other API keys can be saved. Set STAFF_BYPASS_PIN to replace the bootstrap code, or off to disable it."
          : "Creating a company account makes you the Organization Owner. Live access for other users is granted separately. Privileged roles require MFA."}
      </p>
    </AuthFrame>
  );
}
