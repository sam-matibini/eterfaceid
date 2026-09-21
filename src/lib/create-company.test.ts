import {
  companyCreateErrorMessage,
  isRlsError,
  isUniqueConflict,
  liveMemberInsert,
  liveOrganizationInsert,
  resolveInsertedCompany,
  restAcceptedWrite,
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

console.log("create-company.test.ts passed");
