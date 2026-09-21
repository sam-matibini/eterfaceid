import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { ConsoleShell, fieldClass, inkButtonClass, Panel } from "@/components/console/shell";
import { useOrganization, useRoles } from "@/hooks/useSession";
import { fetchOrganizationProfile } from "@/lib/console";
import { updateOrganizationProfile } from "@/lib/teams.functions";

export const Route = createFileRoute("/_authenticated/console/organization")({
  head: () => ({
    meta: [{ title: "Company profile — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: OrganizationPage,
});

type ProfileForm = {
  name: string;
  legalName: string;
  registrationNumber: string;
  country: string;
  addressLine1: string;
  city: string;
  region: string;
  postalCode: string;
  website: string;
};

function OrganizationPage() {
  const { organization } = useOrganization();
  const { isAdmin } = useRoles();
  const queryClient = useQueryClient();
  const save = useServerFn(updateOrganizationProfile);
  const orgId = organization?.orgId ?? "";
  const profile = useQuery({
    queryKey: ["org-profile", orgId],
    enabled: Boolean(orgId),
    queryFn: () => fetchOrganizationProfile(orgId),
  });
  const row = profile.data;
  const [form, setForm] = useState<ProfileForm | null>(null);
  const current: ProfileForm = form ?? {
    name: row?.name ?? "",
    legalName: row?.legal_name ?? row?.name ?? "",
    registrationNumber: row?.registration_number ?? "",
    country: row?.country ?? "",
    addressLine1: row?.address_line1 ?? "",
    city: row?.city ?? "",
    region: row?.region ?? "",
    postalCode: row?.postal_code ?? "",
    website: row?.website ?? "",
  };

  const mutation = useMutation({
    mutationFn: async () =>
      save({
        data: {
          orgId,
          name: current.name || current.legalName,
          legalName: current.legalName,
          registrationNumber: current.registrationNumber || undefined,
          country: current.country || undefined,
          addressLine1: current.addressLine1 || undefined,
          city: current.city || undefined,
          region: current.region || undefined,
          postalCode: current.postalCode || undefined,
          website: current.website || undefined,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["org-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["my-org"] });
    },
  });

  function set(key: keyof ProfileForm, value: string) {
    setForm({ ...current, [key]: value });
  }

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Company Profile</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Legal identity for this eterfaceID organization. Used for KYB, Live access and invoices.
      </p>
      <div className="mt-8 max-w-3xl">
        <Panel title="Company Information">
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            {[
              ["legalName", "Legal Company Name"],
              ["registrationNumber", "Registration Number"],
              ["country", "Country"],
              ["addressLine1", "Business Address"],
              ["city", "City"],
              ["region", "Prov/state"],
              ["postalCode", "Zip/Postal code"],
              ["website", "Website"],
            ].map(([key, label]) => (
              <label key={key} className="text-xs uppercase tracking-widest text-muted-foreground">
                {label}
                <input
                  className={`${fieldClass} mt-1 normal-case tracking-normal text-foreground`}
                    value={current[key as keyof ProfileForm]}
                    disabled={!isAdmin}
                    onChange={(e) => set(key as keyof ProfileForm, e.target.value)}
                />
              </label>
            ))}
            {isAdmin ? (
              <div className="sm:col-span-2">
                <button type="submit" className={inkButtonClass} disabled={mutation.isPending}>
                  Save profile
                </button>
                {mutation.isError ? (
                  <p className="mt-2 text-sm text-[var(--signal)]">{(mutation.error as Error).message}</p>
                ) : null}
              </div>
            ) : (
              <p className="sm:col-span-2 text-sm text-muted-foreground">Only administrators can edit company details.</p>
            )}
          </form>
        </Panel>
      </div>
    </ConsoleShell>
  );
}
