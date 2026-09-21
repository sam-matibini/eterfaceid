import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { AuthFrame, authButtonClass, authInputClass } from "@/components/auth/AuthFrame";
import { setActiveOrganization, useOrganization, useSession } from "@/hooks/useSession";
import { membershipFromCreate, OPENING_COMPANY_KEY } from "@/lib/organization-memberships";
import { acceptInvite, createOrganization } from "@/lib/teams.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Create company account — eterfaceID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organization, memberships, ready } = useOrganization();
  const { user } = useSession();
  const create = useServerFn(createOrganization);
  const join = useServerFn(acceptInvite);

  const [form, setForm] = useState({
    name: "",
    legalName: "",
    registrationNumber: "",
    country: "CA",
    addressLine1: "",
    city: "",
    region: "",
    postalCode: "",
    website: "",
  });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && organization) void navigate({ to: "/console", replace: true });
  }, [ready, organization, navigate]);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("eid_invite_token");
    if (stored) setToken(stored);
    const storedCompany = window.sessionStorage.getItem("eid_company");
    if (storedCompany) setForm((f) => ({ ...f, name: storedCompany, legalName: storedCompany }));
  }, []);

  async function finish(run: () => Promise<{ orgId?: string; name?: string; role?: string } | unknown>) {
    setBusy(true);
    setError(null);
    try {
      const result = await run();
      const payload = result && typeof result === "object" ? (result as { orgId?: string; name?: string; role?: "admin" | "analyst" | "viewer" }) : {};
      const orgId = String(payload.orgId ?? "");
      if (!orgId) throw new Error("The company dashboard could not be opened. Try Create company dashboard again.");
      const companyName = payload.name || form.legalName || form.name;
      const snapshot = membershipFromCreate({ orgId, name: companyName, role: payload.role ?? "admin" });
      setActiveOrganization(orgId);
      window.sessionStorage.setItem(OPENING_COMPANY_KEY, orgId);
      window.sessionStorage.removeItem("eid_invite_token");
      window.sessionStorage.removeItem("eid_company");
      queryClient.setQueryData(["my-org", user?.id], { memberships: [snapshot], current: snapshot });
      try {
        await queryClient.refetchQueries({ queryKey: ["my-org", user?.id] });
      } catch {
        queryClient.setQueryData(["my-org", user?.id], { memberships: [snapshot], current: snapshot });
      }
      const after = queryClient.getQueryData(["my-org", user?.id]) as { current?: { orgId?: string } } | undefined;
      if (!after?.current?.orgId) {
        queryClient.setQueryData(["my-org", user?.id], { memberships: [snapshot], current: snapshot });
      }
      void navigate({ to: "/console", replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "The company dashboard could not be created. Try again.";
      setError(
        /Unauthorized|authorization header/i.test(message)
          ? "Sign in with your confirmed company account to create the workspace, then you can update details and add team members."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title={token ? "Accept your invitation" : "Create Company Account"}
      subtitle={
        token
          ? "Join the organization you were invited to. You can belong to more than one company."
          : "Company information is used for KYB, billing and Live access review. You will be the Organization Owner."
      }
    >
      {!token ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.name.trim().length >= 2)
              void finish(() =>
                create({
                  data: {
                    name: form.name,
                    legalName: form.legalName || form.name,
                    registrationNumber: form.registrationNumber || undefined,
                    country: form.country || undefined,
                    addressLine1: form.addressLine1 || undefined,
                    city: form.city || undefined,
                    region: form.region || undefined,
                    postalCode: form.postalCode || undefined,
                    website: form.website || undefined,
                    origin: window.location.origin,
                  },
                }),
              );
          }}
          className="space-y-3"
        >
          <Field label="Legal Company Name" value={form.legalName || form.name} onChange={(v) => setForm({ ...form, legalName: v, name: v || form.name })} required />
          <Field label="Registration Number" value={form.registrationNumber} onChange={(v) => setForm({ ...form, registrationNumber: v })} />
          <Field label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v.toUpperCase() })} />
          <Field label="Business Address" value={form.addressLine1} onChange={(v) => setForm({ ...form, addressLine1: v })} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            <Field label="Prov/state" value={form.region} onChange={(v) => setForm({ ...form, region: v })} />
            <Field label="Zip/Postal code" value={form.postalCode} onChange={(v) => setForm({ ...form, postalCode: v })} />
          </div>
          <Field label="Website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} />
          <button type="submit" disabled={busy} className={authButtonClass}>
            Create company dashboard
          </button>
        </form>
      ) : null}

      {token || memberships.length ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) void finish(() => join({ data: { token: token.trim(), origin: window.location.origin } }));
          }}
          className={token ? "space-y-3" : "mt-8 space-y-3"}
        >
          {!token ? (
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Or join with an invitation</p>
          ) : null}
          <label className="text-sm font-medium">
            Invitation code
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className={authInputClass}
              placeholder="From your invitation email"
            />
          </label>
          <button type="submit" disabled={busy} className={token ? authButtonClass : `${authButtonClass} bg-background text-foreground border border-[var(--rule)]`}>
            Accept invitation
          </button>
        </form>
      ) : null}

      {error ? <p className="mt-5 text-sm text-[var(--signal)]">{error}</p> : null}
    </AuthFrame>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className={authInputClass} required={required} />
    </label>
  );
}
