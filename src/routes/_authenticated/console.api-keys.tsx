import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { ConsoleShell, fieldClass, inkButtonClass, Panel, StatusPill } from "@/components/console/shell";
import { useEnvironment } from "@/hooks/useEnvironment";
import { useRoles, useSession } from "@/hooks/useSession";
import { createApiKey, defaultKeyScopes, KEY_SCOPES, revokeApiKey, type KeyScope } from "@/lib/api-keys.functions";
import { efinMoneyRecipes } from "@/lib/api-recipes";
import { fetchApiKeys } from "@/lib/console";

export const Route = createFileRoute("/_authenticated/console/api-keys")({
  head: () => ({
    meta: [{ title: "API — eterfaceID" }, { name: "robots", content: "noindex" }],
  }),
  component: ApiKeysPage,
});

const SCOPE_LABEL: Record<KeyScope, string> = {
  "sandbox.api": "Sandbox API",
  "live.api": "Live API",
  "kyc.reports.view": "KYC",
  "kyb.reports.view": "KYB",
  "aml.results.view": "AML",
  "api_logs.view": "API logs",
};

function ApiKeysPage() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { has, isAdmin } = useRoles();
  const { environment, setEnvironment, canUseLive } = useEnvironment();
  const createKey = useServerFn(createApiKey);
  const revokeKey = useServerFn(revokeApiKey);
  const canManage = isAdmin || has("api_keys.create");

  const [keyName, setKeyName] = useState("");
  const [kind, setKind] = useState<"secret" | "publishable">("secret");
  const [scopes, setScopes] = useState<KeyScope[]>(defaultKeyScopes("sandbox"));
  const [freshSecret, setFreshSecret] = useState<string | null>(null);

  const keys = useQuery({ queryKey: ["api-keys"], queryFn: fetchApiKeys });
  const visible = (keys.data ?? []).filter((k) => k.environment === environment);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://eterfaceid.com";
  const recipes = useMemo(
    () => efinMoneyRecipes({ secret: freshSecret, origin, environment }),
    [freshSecret, origin, environment],
  );

  const addKey = useMutation({
    mutationFn: async () =>
      createKey({
        data: {
          name: keyName,
          environment,
          kind,
          scopes,
          aal: (session as { aal?: string } | null)?.aal,
        },
      }),
    onSuccess: (result) => {
      setFreshSecret(result.secret);
      setKeyName("");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const killKey = useMutation({
    mutationFn: async (id: string) => revokeKey({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  function toggleScope(code: KeyScope) {
    setScopes((current) => (current.includes(code) ? current.filter((s) => s !== code) : [...current, code]));
  }

  const envScopes = KEY_SCOPES.filter((code) => {
    if (code === "sandbox.api") return environment === "sandbox";
    if (code === "live.api") return environment === "live";
    return true;
  });

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">API</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Generate a secret for eFinMoney or any partner. Sandbox keys start{" "}
        <code className="font-mono text-xs">ef_test_secret_</code>, live keys{" "}
        <code className="font-mono text-xs">ef_live_secret_</code>. Copy the recipes into your app immediately.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel
          title={environment === "live" ? "Live API" : "Sandbox API"}
          action={
            <select
              value={environment}
              onChange={(e) => {
                const next = e.target.value as "sandbox" | "live";
                setEnvironment(next);
                setScopes(defaultKeyScopes(next));
              }}
              className="h-9 rounded-md border border-[var(--rule)] bg-background px-2 text-sm"
            >
              <option value="sandbox">Sandbox</option>
              <option value="live" disabled={!canUseLive}>
                Production
              </option>
            </select>
          }
        >
          {canManage ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (keyName.trim()) addKey.mutate();
              }}
              className="space-y-3"
            >
              <div className="flex flex-wrap gap-2">
                <input
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder='Name key, e.g. "eFinMoney production"'
                  maxLength={60}
                  className={`${fieldClass} flex-1`}
                />
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "secret" | "publishable")}
                  className="h-10 rounded-md border border-[var(--rule)] bg-background px-2 text-sm"
                >
                  <option value="secret">Secret key</option>
                  <option value="publishable">Publishable key</option>
                </select>
                <button type="submit" disabled={addKey.isPending} className={inkButtonClass}>
                  Generate
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {envScopes.map((code) => (
                  <label key={code} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={scopes.includes(code)}
                      onChange={() => toggleScope(code)}
                    />
                    {SCOPE_LABEL[code]}
                  </label>
                ))}
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">You do not have permission to create keys.</p>
          )}

          {environment === "live" ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Live keys require MFA re-authentication, Live authorization on your user, and an approved organization.
            </p>
          ) : null}

          {addKey.isError ? (
            <p className="mt-3 text-sm text-[var(--signal)]">{(addKey.error as Error).message}</p>
          ) : null}

          {freshSecret ? (
            <div className="mt-4 border border-[var(--signal)] bg-[var(--paper-deep)] p-3">
              <p className="text-xs uppercase tracking-widest text-[var(--signal)]">
                Copy this now — it is not shown again
              </p>
              <code className="mt-2 block break-all font-mono text-xs">{freshSecret}</code>
            </div>
          ) : null}

          <div className="mt-5 space-y-3 text-sm">
            {visible.map((key) => (
              <div key={key.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{key.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {key.key_prefix}******** · {key.key_kind ?? "secret"} · {key.environment}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={key.revoked_at ? "rejected" : "approved"}>
                    {key.revoked_at ? "revoked" : "active"}
                  </StatusPill>
                  {canManage && !key.revoked_at ? (
                    <button
                      type="button"
                      onClick={() => killKey.mutate(key.id)}
                      className="rounded-md border border-[var(--rule)] px-3 py-1.5 text-xs hover:bg-[var(--paper-deep)]"
                    >
                      Revoke
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {visible.length === 0 ? <p className="text-muted-foreground">No keys in this environment yet.</p> : null}
          </div>
        </Panel>

        <Panel title="eFinMoney recipes">
          <p className="text-sm text-muted-foreground">
            Paste into eFinMoney as <code className="font-mono text-xs">ETERFACEID_SECRET_KEY</code>. Recipes use this
            origin and the secret you just generated (or a placeholder).
          </p>
          <div className="mt-4 space-y-4">
            {recipes.map((recipe) => (
              <div key={recipe.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{recipe.title}</p>
                  <button
                    type="button"
                    className="text-xs text-[var(--verify)] underline-offset-4 hover:underline"
                    onClick={() => void navigator.clipboard.writeText(recipe.code)}
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{recipe.description}</p>
                <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--rule)] bg-[var(--paper)] p-3 text-[11px] leading-relaxed">
                  <code>{recipe.code}</code>
                </pre>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </ConsoleShell>
  );
}
