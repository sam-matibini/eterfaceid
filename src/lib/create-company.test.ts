import {
  addCreatedCompanyMemberArgs,
  companyCreateErrorMessage,
  creatorJoinTargets,
  creatorRpcAccepted,
  creatorRpcMissing,
  dashboardFromCreatedCompany,
  inviteToCreatedCompanyArgs,
  isCreatorDeniedError,
  isRlsError,
  isUniqueConflict,
  joinCreatedCompanyArgs,
  liveMemberInsert,
  liveOrganizationInsert,
  resolveCreatorAdminOrgId,
  resolveInsertedCompany,
  restAcceptedWrite,
  updateCreatedCompanyArgs,
} from "./create-company";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const org = liveOrganizationInsert({
  id: "11111111-1111-4111-8111-111111111111",
  name: "eFinTax Advisors",
  slug: "efintax-ab12c",
  createdBy: "user-1",
});
assert(org.id === "11111111-1111-4111-8111-111111111111", "generated company id is sent");
assert(!("address_line1" in org), "live org insert has no profile columns");
assert(!("legal_name" in org), "live org insert has no legal_name");
assert(Object.keys(org).join(",") === "id,name,slug,created_by", "only live org columns");

const member = liveMemberInsert({ orgId: org.id, userId: "user-1" });
assert(member.role === "admin", "creator is first admin");
assert(!("access_role" in member), "live member insert has no RBAC columns");
assert(Object.keys(member).join(",") === "org_id,user_id,role", "only live member columns");

assert(isRlsError('new row violates row-level security policy for table "organizations"'), "org rls");
assert(isRlsError('new row violates row-level security policy for table "organization_members"'), "member rls");
assert(isUniqueConflict("duplicate key value violates unique constraint"), "unique");
assert(restAcceptedWrite({ error: null, status: 201 }), "empty 201 is success");
assert(restAcceptedWrite({ error: null, status: 204 }), "204 is success");
assert(restAcceptedWrite({ error: "duplicate key value violates unique constraint", status: 409 }), "already joined");
assert(!restAcceptedWrite({ error: "new row violates row-level security policy", status: 401 }), "rls is not success");

const hidden = resolveInsertedCompany(
  { id: org.id, name: org.name },
  { data: null, error: null, status: 201 },
);
assert(hidden.org?.id === org.id, "empty representation still keeps the generated id");
assert(!hidden.error, "201 without a body is not an error");

const emptyArray = resolveInsertedCompany(
  { id: org.id, name: org.name },
  { data: [], error: null, status: 201 },
);
assert(emptyArray.org?.id === org.id, "select rls hiding the new org is still success");

const represented = resolveInsertedCompany(
  { id: org.id, name: org.name },
  { data: [{ id: "live-id", name: "From API" }], error: null, status: 201 },
);
assert(represented.org?.id === "live-id" && represented.org.name === "From API", "uses returned row when present");

const rls = resolveInsertedCompany(
  { id: org.id, name: org.name },
  { data: null, error: 'new row violates row-level security policy for table "organizations"', status: 401 },
);
assert(!rls.org && rls.error?.includes("row-level security"), "real rls stays an error");

assert(
  companyCreateErrorMessage('new row violates row-level security policy for table "organizations"').includes(
    "confirming your email",
  ),
  "org rls tells the user to sign in after confirm",
);
assert(
  companyCreateErrorMessage('new row violates row-level security policy for table "organization_members"').includes(
    "Create company dashboard",
  ),
  "member rls is retryable",
);

const opened = dashboardFromCreatedCompany({
  org: { id: org.id, name: org.name },
  membership: null,
});
assert(opened?.orgId === org.id, "dashboard opens from the saved company");
assert(opened?.role === "admin", "creator is admin even when membership cannot be read");
assert(dashboardFromCreatedCompany({ org: null, membership: null }) === null, "no org means no dashboard");

assert(
  joinCreatedCompanyArgs("org-1")._org_id === "org-1",
  "join rpc takes the saved company id",
);
assert(
  resolveCreatorAdminOrgId({ membershipOrgId: null, createdOrgId: "org-saved", joinedOrgId: "org-saved" }) ===
    "org-saved",
  "creator can admin without a readable membership row",
);
assert(
  resolveCreatorAdminOrgId({ membershipOrgId: "org-m", membershipIsAdmin: true }) === "org-m",
  "readable admin membership wins",
);
assert(
  resolveCreatorAdminOrgId({
    membershipOrgId: null,
    createdOrgId: null,
    joinedOrgId: null,
    claimedOrgId: "org-open",
  }) === "org-open",
  "open workspace can save and invite before membership select works",
);
assert(updateCreatedCompanyArgs("org-1", "eFinMoney")._name === "eFinMoney", "update rpc takes the display name");
assert(addCreatedCompanyMemberArgs("org-1", "user-2", "admin")._role === "admin", "add member rpc takes role");
assert(
  inviteToCreatedCompanyArgs({
    orgId: "org-1",
    email: "sam@efin.money",
    role: "admin",
    tokenHash: "hash",
    expiresAt: "2026-09-24T00:00:00.000Z",
  })._email === "sam@efin.money",
  "invite rpc takes live invite columns",
);
assert(creatorRpcAccepted(null), "rpc with no error is success");
assert(creatorRpcAccepted("duplicate key value violates unique constraint"), "already a member is success");
assert(!creatorRpcAccepted('new row violates row-level security policy'), "rls is not rpc success");
assert(isCreatorDeniedError("Not the company creator"), "creator check is recognized");
assert(creatorRpcMissing("Could not find the function public.update_created_company(_org_id, _name) in the schema cache"), "missing update rpc");
assert(creatorRpcMissing("HTTP 404"), "empty 404 is a missing rpc");
assert(
  JSON.stringify(
    creatorJoinTargets({
      membershipOrgIds: [],
      ownedOrgIds: [],
      persistedOrgId: "org-open",
    }),
  ) === JSON.stringify(["org-open"]),
  "persisted workspace is joined when membership select is empty",
);
assert(
  creatorJoinTargets({ membershipOrgIds: ["org-open"], persistedOrgId: "org-open" }).length === 0,
  "already a member is not joined again",
);

console.log("create-company.test.ts passed");
