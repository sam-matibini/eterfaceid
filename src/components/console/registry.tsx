import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Panel, StatusPill } from "@/components/console/shell";
import { supabase } from "@/integrations/supabase/client";
import { runTheKybLookup, searchTheKyb, thekybStatus, verifyTheKybCompany } from "@/lib/thekyb.functions";
import type { RegistryComparison, RegistryMatch } from "@/lib/thekyb";

async function fetchLookups(caseId: string) {
  const { data, error } = await supabase
    .from("thekyb_lookups")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function RegistryPanel({
  caseId,
  canWrite,
  subjectName,
  country,
}: {
  caseId: string;
  canWrite: boolean;
  subjectName: string;
  country: string | null;
}) {
  const queryClient = useQueryClient();
  const statusFn = useServerFn(thekybStatus);
  const searchFn = useServerFn(searchTheKyb);
  const verifyFn = useServerFn(verifyTheKybCompany);
  const runFn = useServerFn(runTheKybLookup);

  const settings = useQuery({ queryKey: ["thekyb-status"], queryFn: () => statusFn({}) });
  const lookups = useQuery({ queryKey: ["thekyb", caseId], queryFn: () => fetchLookups(caseId) });

  const [name, setName] = useState(subjectName);
  const [registration, setRegistration] = useState("");
  const [matches, setMatches] = useState<RegistryMatch[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["thekyb", caseId] });
    void queryClient.invalidateQueries({ queryKey: ["case", caseId] });
    void queryClient.invalidateQueries({ queryKey: ["cases"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
  };

  const search = useMutation({
    mutationFn: () =>
      searchFn({
        data: {
          caseId,
          name: name.trim() || undefined,
          registrationNumber: registration.trim() || undefined,
          country: country ?? undefined,
        },
      }),
    onSuccess: (result) => {
      setMatches(result.matches);
      setRequestId(result.kyb_request_id);
    },
  });

  const verify = useMutation({
    mutationFn: (kybResponseId: string) =>
      verifyFn({
        data: {
          caseId,
          kybResponseId,
          kybRequestId: requestId ?? undefined,
          claimedRegistration: registration.trim() || undefined,
        },
      }),
    onSuccess: () => {
      setMatches([]);
      refresh();
    },
  });

  const run = useMutation({
    mutationFn: () =>
      runFn({
        data: {
          caseId,
          name: name.trim() || undefined,
          registrationNumber: registration.trim() || undefined,
          country: country ?? undefined,
        },
      }),
    onSuccess: () => {
      setMatches([]);
      refresh();
    },
  });

  if (settings.data && !settings.data.enabled) return null;

  return (
    <Panel title="Registry lookup — The KYB">
      {settings.data && !settings.data.configured ? (
        <p className="mb-4 text-sm text-[var(--signal)]">
          The KYB is switched on but the API key has not been added yet. Paste it in App admin →
          Integrations.
        </p>
      ) : null}

      {canWrite ? (
        <form
          className="mb-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            search.mutate();
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Registered name"
            className="h-10 rounded-md border border-[var(--rule)] bg-background px-3 text-sm outline-none focus-visible:border-[var(--signal)]"
          />
          <input
            value={registration}
            onChange={(e) => setRegistration(e.target.value)}
            placeholder="Registration number (optional)"
            className="h-10 rounded-md border border-[var(--rule)] bg-background px-3 text-sm outline-none focus-visible:border-[var(--signal)]"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={search.isPending || run.isPending}
              className="h-10 rounded-md border border-[var(--rule)] px-3 text-xs hover:bg-[var(--paper-deep)] disabled:opacity-50"
            >
              {search.isPending ? "Searching…" : "Search registry"}
            </button>
            <button
              type="button"
              disabled={run.isPending || search.isPending}
              onClick={() => run.mutate()}
              className="h-10 rounded-md bg-[var(--ink)] px-3 text-xs text-background hover:opacity-90 disabled:opacity-50"
            >
              {run.isPending ? "Looking up…" : "Look up best match"}
            </button>
          </div>
        </form>
      ) : null}

      {search.isError ? (
        <p className="mb-4 text-sm text-[var(--signal)]">{(search.error as Error).message}</p>
      ) : null}
      {run.isError ? <p className="mb-4 text-sm text-[var(--signal)]">{(run.error as Error).message}</p> : null}
      {verify.isError ? (
        <p className="mb-4 text-sm text-[var(--signal)]">{(verify.error as Error).message}</p>
      ) : null}

      {matches.length ? (
        <div className="mb-5 space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {matches.length} compan{matches.length === 1 ? "y" : "ies"} from the official registry
          </p>
          {matches.map((row) => (
            <div key={row.kyb_response_id} className="flex flex-wrap items-center justify-between gap-3 border border-[var(--rule)] px-4 py-3">
              <div>
                <div className="font-medium">{row.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[row.registration_number, row.type, row.status, row.country_code].filter(Boolean).join(" · ")}
                </div>
              </div>
              {canWrite ? (
                <button
                  type="button"
                  disabled={verify.isPending}
                  onClick={() => verify.mutate(row.kyb_response_id)}
                  className="rounded-md border border-[var(--rule)] px-3 py-1 text-xs hover:bg-[var(--paper-deep)] disabled:opacity-50"
                >
                  {verify.isPending ? "Saving…" : "Use this record"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-4">
        {(lookups.data ?? []).map((row) => (
          <div key={row.id} className="border border-[var(--rule)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{row.matched_name ?? "Registry record"}</div>
                <div className="text-xs text-muted-foreground">
                  {[row.registration_number, row.company_type, row.registry_status, row.country_code]
                    .filter(Boolean)
                    .join(" · ")}
                  {row.created_at ? ` · ${new Date(row.created_at).toLocaleString()}` : ""}
                </div>
              </div>
              <StatusPill tone={row.result}>{String(row.result).replace("_", " ")}</StatusPill>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {((row.comparisons ?? []) as unknown as RegistryComparison[]).map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span
                    className={
                      c.status === "match"
                        ? "text-[var(--verify)]"
                        : c.status === "close"
                          ? "text-muted-foreground"
                          : "text-[var(--signal)]"
                    }
                  >
                    {c.status === "match" ? "✓" : c.status === "close" ? "~" : "✗"}
                  </span>
                  <span>
                    {c.field} — claimed “{c.claimed}”, registry holds “{c.registry}”
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {lookups.data && lookups.data.length === 0 && matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No registry lookup on this case yet. Search the official register, then attach the matching
            company.
          </p>
        ) : null}
      </div>

      <p className="mt-5 border-t border-[var(--rule)] pt-4 text-xs text-muted-foreground">
        Data comes from official corporate registries through The KYB. The API key is held in the
        secure store and is never shown here.
      </p>
    </Panel>
  );
}
