import {
  asAdminMembership,
  publicWorkspaceError,
  resolveWorkspace,
  resolveWorkspaceAfterAuth,
  toWorkspaceMembership,
} from "./workspace";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function tableResult(data: unknown, error: { message: string } | null = null) {
  return { data, error };
}

function makeDb(input: {
  members?: Array<{ org_id: string; role: "admin" | "analyst" | "viewer"; status?: string }>;
  memberError?: string;
  created?: Array<{ id: string; name?: string }>;
  rpcIds?: string[];
  callerId?: string | null;
}) {
  return {
    from(table: string) {
      return {
        select() {
          const query = {
            eq() {
              return query;
            },
            in() {
              return query;
            },
            order() {
              return query;
            },
            then(resolve: (value: { data: unknown; error: { message: string } | null }) => unknown) {
              if (table === "organization_members") {
                if (input.memberError) return resolve(tableResult(null, { message: input.memberError }));
                return resolve(tableResult(input.members ?? []));
              }
              if (table === "organizations") {
                return resolve(tableResult(input.created ?? []));
              }
              return resolve(tableResult([]));
            },
          };
          return query;
        },
        insert() {
          return tableResult({ user_id: "user-1" });
        },
      };
    },
    async rpc(name: string) {
      if (name === "current_org_ids") return tableResult(input.rpcIds ?? []);
      if (name === "caller_org_id") return tableResult(input.callerId ?? null);
      if (name === "join_created_company") return tableResult(input.callerId ?? input.rpcIds?.[0] ?? null);
      if (name === "find_my_company") return tableResult(input.callerId ?? input.rpcIds?.[0] ?? null);
      return tableResult(null, { message: "unknown rpc" });
    },
  };
}

const fromMembers = await resolveWorkspace(
  makeDb({
    members: [{ org_id: "org-members", role: "admin", status: "active" }],
    created: [{ id: "org-members", name: "eFinMoney" }],
  }),
  "user-1",
);
assert(fromMembers.hasOrganization, "membership rows open the dashboard");
assert(fromMembers.orgId === "org-members", "membership org is selected");
assert(fromMembers.memberships[0]?.name === "eFinMoney", "org name is loaded");

const fromCreated = await resolveWorkspace(
  makeDb({
    members: [],
    created: [{ id: "org-created", name: "Created Co" }],
  }),
  "user-1",
);
assert(fromCreated.hasOrganization, "a company the user created opens the dashboard");
assert(fromCreated.orgId === "org-created", "created org is selected");
assert(fromCreated.memberships[0]?.isOwner === true, "creator is treated as owner");

const fromRpc = await resolveWorkspace(
  makeDb({
    members: [],
    created: [],
    rpcIds: ["org-rpc"],
  }),
  "user-1",
);
assert(fromRpc.hasOrganization, "current_org_ids opens the dashboard when members are hidden");
assert(fromRpc.orgId === "org-rpc", "rpc org is selected");

const fromCaller = await resolveWorkspace(
  makeDb({
    members: [],
    created: [],
    callerId: "org-caller",
  }),
  "user-1",
);
assert(fromCaller.hasOrganization, "caller_org_id opens the dashboard");
assert(fromCaller.orgId === "org-caller", "caller org is selected");

const none = await resolveWorkspace(makeDb({ members: [], created: [] }), "user-1");
assert(!none.hasOrganization, "a brand-new account has no company");
assert(!none.lookupFailed, "empty is not a failed lookup");

const serverWins = await resolveWorkspaceAfterAuth(async () => ({
  memberships: [toWorkspaceMembership(asAdminMembership("org-server"))],
  orgId: "org-server",
  hasOrganization: true,
}));
assert(serverWins.orgId === "org-server", "server membership is used when present");

const failedOnly = await resolveWorkspaceAfterAuth(async () => {
  throw new Error("Unauthorized");
}, null);
assert(failedOnly.lookupFailed, "a failed server lookup without a client session is not treated as a new company");

const confirmedEmpty = await resolveWorkspaceAfterAuth(async () => ({
  memberships: [],
  orgId: null,
  hasOrganization: false,
}), null);
assert(!confirmedEmpty.hasOrganization && !confirmedEmpty.lookupFailed, "an empty successful lookup is a new company");

assert(
  publicWorkspaceError(new Error('[{"code":"too_small","message":"Enter your company name","path":["name"]}]')) ===
    "Enter your company name",
  "zod payload is shown as a short message",
);

console.log("workspace.test.ts passed");
