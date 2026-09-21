import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { fieldClass, inkButtonClass, Panel, StatusPill } from "@/components/console/shell";
import { useRoles } from "@/hooks/useSession";
import {
  PURPOSE_LABEL,
  classifyCase,
  matchesPurpose,
  type CasePurpose,
} from "@/lib/case-purpose";
import {
  fetchCases,
  riskLabel,
  statusLabel,
  type CaseStatus,
  type RiskLevel,
} from "@/lib/console";
import { createInquiry } from "@/lib/inquiries.functions";
import { isStaffBypassUnlocked } from "@/lib/staff-bypass";

type WorkspacePurpose = CasePurpose | "all";

const PURPOSE_COPY: Record<
  WorkspacePurpose,
  { title: string; lede: string; product?: "customer_kyc" | "business_kyb" | "aml_screening" | "employee_onboarding" }
> = {
  all: {
    title: "Inquiries",
    lede: "People, businesses and employees in review. Open a row for verification, screening and the audit trail.",
  },
  kyc: {
    title: "KYC",
    lede: "Individual identity checks: documents, liveness, address and bank-confirmed identity.",
    product: "customer_kyc",
  },
  kyb: {
    title: "KYB",
    lede: "Business verification, registry lookups and beneficial ownership under FATF R.24/R.25.",
    product: "business_kyb",
  },
  aml: {
    title: "AML screening",
    lede: "Sanctions, PEP and watchlist screening across every subject, plus transaction monitoring.",
    product: "aml_screening",
  },
  employee: {
    title: "Employee onboarding",
    lede: "Verify staff before they get production access. Stored as person cases with an EMP- reference.",
    product: "employee_onboarding",
  },
};

export function CasesWorkspace({
  purpose,
  title,
  lede,
  showCreate = true,
}: {
  purpose: WorkspacePurpose;
  title?: string;
  lede?: string;
  showCreate?: boolean;
}) {
  const copy = PURPOSE_COPY[purpose];
  const [status, setStatus] = useState<"all" | CaseStatus>("all");
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["cases"], queryFn: fetchCases });

  const rows = useMemo(() => {
    const all = (data ?? []).filter((row) => matchesPurpose(row, purpose));
    return all.filter((row) => {
      const statusOk = status === "all" || row.status === status;
      const term = search.trim().toLowerCase();
      const searchOk =
        !term ||
        row.subject_name.toLowerCase().includes(term) ||
        row.reference.toLowerCase().includes(term);
      return statusOk && searchOk;
    });
  }, [data, status, search, purpose]);

  const counts = useMemo(() => {
    const all = (data ?? []).filter((row) => matchesPurpose(row, purpose));
    return {
      open: all.filter((c) => c.status === "pending" || c.status === "in_review").length,
      high: all.filter((c) => c.risk_level === "high").length,
      approved: all.filter((c) => c.status === "approved").length,
      total: all.length,
    };
  }, [data, purpose]);

  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight">{title ?? copy.title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{lede ?? copy.lede}</p>

      <div className="mt-8 grid gap-px border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-4">
        {[
          { label: "Open for review", value: counts.open },
          { label: "High risk", value: counts.high },
          { label: "Approved", value: counts.approved },
          { label: "Total", value: counts.total },
        ].map((stat) => (
          <div key={stat.label} className="bg-background px-5 py-4">
            <div className="font-display text-2xl font-bold">{stat.value}</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>

      {showCreate && purpose !== "all" && purpose !== "aml" ? (
        <div className="mt-8">
          <StartInquiryForm purpose={purpose} product={copy.product} />
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or reference"
          className="h-10 w-64 rounded-md border border-[var(--rule)] bg-background px-3 text-sm outline-none focus-visible:border-[var(--signal)]"
        />
        {(["all", "pending", "in_review", "approved", "rejected"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              status === value
                ? "border-[var(--ink)] text-[var(--ink)]"
                : "border-[var(--rule)] text-muted-foreground hover:text-foreground"
            }`}
          >
            {value === "all" ? "All" : statusLabel[value]}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <Panel title={purpose === "all" ? "Inquiry queue" : `${copy.title} queue`}>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {error ? (
            <p className="text-sm text-[var(--signal)]">
              These records could not be loaded. Your account may not have a role yet — ask an administrator
              to grant one.
            </p>
          ) : null}
          {!isLoading && !error && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inquiries match this filter.</p>
          ) : null}
          {rows.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="pb-3 font-medium">Reference</th>
                  <th className="pb-3 font-medium">Subject</th>
                  <th className="pb-3 font-medium">Solution</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Risk</th>
                  <th className="pb-3 font-medium">Opened</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const lens = classifyCase(row);
                  return (
                    <tr key={row.id} className="border-t border-[var(--rule)]">
                      <td className="py-3 font-mono text-xs">
                        <Link
                          to="/console/cases/$caseId"
                          params={{ caseId: row.id }}
                          className="underline underline-offset-4 hover:text-[var(--signal)]"
                        >
                          {row.reference}
                        </Link>
                      </td>
                      <td className="py-3">{row.subject_name}</td>
                      <td className="py-3 text-muted-foreground">{PURPOSE_LABEL[lens]}</td>
                      <td className="py-3">
                        <StatusPill tone={row.status}>{statusLabel[row.status as CaseStatus]}</StatusPill>
                      </td>
                      <td className="py-3">
                        <StatusPill tone={row.risk_level}>
                          {riskLabel[row.risk_level as RiskLevel]} · {row.risk_score}
                        </StatusPill>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </Panel>
      </div>
    </>
  );
}

function StartInquiryForm({
  purpose,
  product,
}: {
  purpose: CasePurpose;
  product?: "customer_kyc" | "business_kyb" | "aml_screening" | "employee_onboarding";
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canWrite, isAdmin } = useRoles();
  const allowed = isAdmin || canWrite || isStaffBypassUnlocked();
  const create = useServerFn(createInquiry);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("CA");
  const [reference, setReference] = useState("");

  const mutation = useMutation({
    mutationFn: async () =>
      create({
        data: {
          subjectName: name,
          country: country.trim().toUpperCase() || undefined,
          reference: reference.trim() || undefined,
          purpose,
          product,
          industry: "fintech",
        },
      }),
    onSuccess: (result) => {
      setName("");
      setReference("");
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      void navigate({ to: "/console/cases/$caseId", params: { caseId: result.id } });
    },
  });

  if (!allowed) return null;

  const subjectLabel =
    purpose === "kyb" ? "Legal business name" : purpose === "employee" ? "Employee name" : "Full legal name";

  return (
    <Panel title={purpose === "employee" ? "Start employee onboarding" : `Start ${PURPOSE_LABEL[purpose]} inquiry`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) mutation.mutate();
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={subjectLabel}
          className={`${fieldClass} max-w-xs flex-1`}
        />
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Country"
          maxLength={2}
          className={`${fieldClass} w-20 uppercase`}
        />
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={purpose === "employee" ? "HR / employee ID" : "Your reference"}
          className={`${fieldClass} max-w-[12rem]`}
        />
        <button type="submit" disabled={mutation.isPending} className={inkButtonClass}>
          {mutation.isPending ? "Creating…" : "Create"}
        </button>
      </form>
      {mutation.isError ? (
        <p className="mt-3 text-sm text-[var(--signal)]">{(mutation.error as Error).message}</p>
      ) : null}
    </Panel>
  );
}
