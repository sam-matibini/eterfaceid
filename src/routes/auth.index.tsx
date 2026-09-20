import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { AuthFrame, authButtonClass, authInputClass } from "@/components/auth/AuthFrame";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/hooks/useSession";

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
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    if (mode === "reset") {
      if (!email.trim()) {
        setError("Enter your work email");
        return;
      }
      setBusy(true);
      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (resetError) throw resetError;
        setNotice("If that address has an account, we sent a reset link.");
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
          setNotice("We've sent a verification email. Confirm the address, then continue.");
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

  async function google() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("Google sign-in could not be started. Try again or use your email address.");
    }
  }

  const title =
    mode === "signup" ? (hasInvite ? "Create your account" : "Create a company account") : mode === "reset" ? "Reset your password" : "eterfaceID Login";

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
              : "Sign in with your work email, then complete MFA if your role requires it."
      }
    >
      {mode !== "reset" ? (
        <>
          <button
            type="button"
            onClick={google}
            className="inline-flex h-11 w-full items-center justify-center rounded-md border border-[var(--rule)] bg-background px-4 text-sm font-medium transition-colors hover:bg-[var(--paper-deep)]"
          >
            Continue with Google
          </button>
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-[var(--rule)]" />
            or
            <span className="h-px flex-1 bg-[var(--rule)]" />
          </div>
        </>
      ) : null}

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

        {error ? <p className="text-sm text-[var(--signal)]">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        <button type="submit" disabled={busy} className={authButtonClass}>
          {busy ? "Working…" : mode === "signin" ? "Sign In" : mode === "reset" ? "Send reset link" : "Create Account"}
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

      <p className="mt-8 text-xs text-muted-foreground">
        Creating a company account makes you the Organization Owner. Live access for other users is granted
        separately. Privileged roles require MFA.
      </p>
    </AuthFrame>
  );
}
