import { isMembershipQueryError, mapMembershipRows, fetchMembershipRows, membershipFromCreate, mergeOwnedOrganizations, shouldRedirectToOnboarding } from "./organization-memberships";

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

const created = membershipFromCreate({ orgId: "org-9", name: "eFinTax Advisors Ltd" });
assert(created.isOwner && created.role === "admin", "create snapshot is owner");
assert(created.orgId === "org-9", "create snapshot keeps org id");

const mergedOwned = mergeOwnedOrganizations(mapped, [
  { id: "org-1", name: "Already a member" },
  { id: "org-owned", name: "eFinMoney" },
]);
assert(mergedOwned.some((row) => row.orgId === "org-owned" && row.isOwner), "created_by company is attached as owner");
assert(mergedOwned.filter((row) => row.orgId === "org-1").length === 1, "does not duplicate memberships");

assert(shouldRedirectToOnboarding({ ready: true, loaded: true, organization: null }) === true, "empty membership goes to onboarding");
assert(
  shouldRedirectToOnboarding({ ready: true, loaded: true, fetching: true, organization: null }) === false,
  "do not bounce while membership is refetching",
);
assert(
  shouldRedirectToOnboarding({ ready: true, loaded: true, organization: null, openingCompany: true }) === false,
  "do not bounce while opening a just-created company",
);
assert(shouldRedirectToOnboarding({ ready: true, loaded: true, organization: created }) === false, "stay on console when membership exists");

const calls: Array<{ select: string; order: boolean }> = [];
const recovered = await fetchMembershipRows(async (select, order) => {
  calls.push({ select, order });
  if (order || select.includes("access_role") || select.includes("organizations(")) {
    return { data: null, error: { message: "Could not find the 'created_at' column of 'organization_members' in the schema cache" } };
  }
  return { data: [{ org_id: "org-2", role: "admin", organizations: { name: "Live Co" } }], error: null };
});
assert(recovered.error === null, "recovers after dropping created_at and extra columns");
assert((recovered.data[0] as { org_id: string }).org_id === "org-2", "returns live rows");
assert(calls.length === 5, "tries full, live embed, then org_id/role only");

console.log("organization-memberships.test.ts passed");
