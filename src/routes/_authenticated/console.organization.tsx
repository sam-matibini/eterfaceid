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
  const { isAdmin, isOwner } = useRoles();
  const queryClient = useQueryClient();
  const save = useServerFn(updateOrganizationProfile);
  const orgId = organization?.orgId ?? "";
  const canEdit = isAdmin || isOwner;
  const profile = useQuery({
    queryKey: ["org-profile", orgId],
    enabled: Boolean(orgId),
    queryFn: () => fetchOrganizationProfile(orgId),
  });
  const row = profile.data;
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [saved, setSaved] = useState(false);
  const current: ProfileForm = form ?? {
    name: row?.name ?? organization?.name ?? "",
    legalName: row?.legal_name ?? organization?.legalName ?? row?.name ?? "",
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
          legalName: current.legalName || current.name,
          registrationNumber: current.registrationNumber || undefined,
          country: current.country || undefined,
          addressLine1: current.addressLine1 || undefined,
          city: current.city || undefined,
          region: current.region || undefined,
          postalCode: current.postalCode || undefined,
          website: current.website || undefined,
        },
      }),
    onSuccess: (result) => {
      setSaved(true);
      setForm({
        name: result.name,
        legalName: result.legal_name,
        registrationNumber: result.registration_number,
        country: result.country,
        addressLine1: result.address_line1,
        city: result.city,
        region: result.region,
        postalCode: result.postal_code,
        website: result.website,
      });
      void queryClient.invalidateQueries({ queryKey: ["org-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["my-org"] });
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  function set(key: keyof ProfileForm, value: string) {
    setSaved(false);
    setForm({ ...current, [key]: value });
  }

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">Company Profile</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Legal identity for this eterfaceID organization. Used for KYB, Live access, invoices, teammate invites and
        API keys.
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
            {(
              [
                ["name", "Display name"],
                ["legalName", "Legal Company Name"],
                ["registrationNumber", "Registration Number"],
                ["country", "Country"],
                ["addressLine1", "Business Address"],
                ["city", "City"],
                ["region", "Prov/state"],
                ["postalCode", "Zip/Postal code"],
                ["website", "Website"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs uppercase tracking-widest text-muted-foreground">
                {label}
                {key === "name" || key === "legalName" ? " *" : ""}
                <input
                  required={key === "name" || key === "legalName"}
                  className={`${fieldClass} mt-1 normal-case tracking-normal text-foreground`}
                  value={current[key]}
                  disabled={!canEdit}
                  onChange={(e) => set(key, e.target.value)}
                />
              </label>
            ))}
            {canEdit ? (
              <div className="sm:col-span-2">
                <button type="submit" className={inkButtonClass} disabled={mutation.isPending || !orgId}>
                  {mutation.isPending ? "Saving…" : "Save company details"}
                </button>
                {saved && !mutation.isError ? (
                  <p className="mt-2 text-sm text-[var(--verify)]">
                    Company details saved. You can create API keys from Developers.
                  </p>
                ) : null}
                {mutation.isError ? (
                  <p className="mt-2 text-sm text-[var(--signal)]">{(mutation.error as Error).message}</p>
                ) : null}
              </div>
            ) : (
              <p className="sm:col-span-2 text-sm text-muted-foreground">
                Only administrators can edit company details.
              </p>
            )}
          </form>
        </Panel>
      </div>
    </ConsoleShell>
  );
}
