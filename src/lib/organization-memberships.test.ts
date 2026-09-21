import { isMembershipQueryError, mapMembershipRows, fetchMembershipRows } from "./organization-memberships";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(isMembershipQueryError("Could not find the 'created_at' column of 'organization_members'"), "missing created_at");
assert(isMembershipQueryError("column organization_members.access_role does not exist"), "missing access_role");
assert(!isMembershipQueryError("new row violates row-level security policy"), "rls is not a schema miss");

const mapped = mapMembershipRows([
  {
    org_id: "org-1",
    role: "admin",
    organizations: { name: "eFinTax Advisors Ltd", live_access: "locked" },
  },
]);
assert(mapped[0]?.orgId === "org-1", "maps org id");
assert(mapped[0]?.isOwner === true, "admin is owner on the live schema");
assert(mapped[0]?.legalName === "eFinTax Advisors Ltd", "uses org name when legal_name is absent");

const calls: Array<{ select: string; order: boolean }> = [];
const recovered = await fetchMembershipRows(async (select, order) => {
  calls.push({ select, order });
  if (order || select.includes("access_role")) {
    return { data: null, error: { message: "Could not find the 'created_at' column of 'organization_members' in the schema cache" } };
  }
  return { data: [{ org_id: "org-2", role: "admin", organizations: { name: "Live Co" } }], error: null };
});
assert(recovered.error === null, "recovers after dropping created_at and extra columns");
assert(calls.length === 4, "tries full then live columns, with and without order");
assert((recovered.data[0] as { org_id: string }).org_id === "org-2", "returns live rows");

console.log("organization-memberships.test.ts passed");
