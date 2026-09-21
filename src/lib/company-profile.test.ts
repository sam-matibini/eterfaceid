import { canEditCompany, liveInviteInsert, liveOrganizationProfileUpdate, mergeCompanyProfile } from "./company-profile";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const merged = mergeCompanyProfile(
  { id: "org-1", name: "eFinTax" },
  {
    org_id: "org-1",
    legal_name: "eFinTax Advisors Ltd",
    address_line1: "1778 Brookfield Crescent",
    city: "Winnipeg",
    region: "MB",
    postal_code: "R3Y 0B4",
    country: "CA",
  },
);
assert(merged.id === "org-1", "keeps org id");
assert(merged.name === "eFinTax", "display name stays on organizations");
assert(merged.legal_name === "eFinTax Advisors Ltd", "legal name comes from the application");
assert(merged.postal_code === "R3Y 0B4", "postal code is kept");

const orgOnly = mergeCompanyProfile({ id: "org-2", name: "Acme" }, null);
assert(orgOnly.legal_name === "Acme", "legal name falls back to org name");

assert(liveOrganizationProfileUpdate({ name: " eFinMoney " }).name === "eFinMoney", "live update is name only");
assert(Object.keys(liveOrganizationProfileUpdate({ name: "x" })).join(",") === "name", "no extra org columns");

const invite = liveInviteInsert({
  orgId: "org-1",
  email: "Sam@efin.money",
  role: "viewer",
  tokenHash: "abc",
  invitedBy: "user-1",
  expiresAt: "2026-09-24T00:00:00.000Z",
});
assert(invite.email === "sam@efin.money", "invite email is normalized");
assert(!("access_role" in invite), "live invite insert has no extra RBAC columns");

assert(
  canEditCompany({ isAdmin: true, hasOrganization: true }),
  "admins can edit",
);
assert(
  !canEditCompany({ isAdmin: true, hasOrganization: false }),
  "no company means the form is not active",
);
assert(
  canEditCompany({ pinUnlocked: true, hasOrganization: true }),
  "PIN staff can edit when a company is open",
);

console.log("company-profile.test.ts passed");
