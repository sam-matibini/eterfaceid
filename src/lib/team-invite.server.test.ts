import { signTeamInvite, verifyTeamInvite } from "./team-invite.server";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const token = await signTeamInvite({
  email: "Sam@efin.money",
  orgId: "11111111-1111-4111-8111-111111111111",
  orgName: "eFinTax Advisors",
  firstName: "Sam",
  lastName: "Matibini",
  jobTitle: "Developer",
  accessRole: "developer",
  userType: "employee",
  sandboxAccess: true,
  liveAccess: false,
});
assert(token.includes("."), "token is signed");
assert(!token.toLowerCase().includes("sam@efin.money"), "raw email is not in the token");

const payload = await verifyTeamInvite(token);
assert(payload?.email === "sam@efin.money", "email is normalized");
assert(payload?.orgName === "eFinTax Advisors", "company name is kept");
assert(payload?.role === "viewer", "developer maps to viewer for RLS");
assert(payload?.accessRole === "developer", "named role is kept");

assert((await verifyTeamInvite("not-a-token")) === null, "junk is rejected");
assert((await verifyTeamInvite(`${token}x`)) === null, "tamper is rejected");

const expired = await signTeamInvite({
  email: "sam@efin.money",
  orgId: "11111111-1111-4111-8111-111111111111",
  orgName: "eFinTax",
  firstName: "Sam",
  lastName: "Matibini",
  jobTitle: null,
  accessRole: "viewer",
  userType: "employee",
  sandboxAccess: true,
  liveAccess: false,
  ttlMs: -1000,
});
assert((await verifyTeamInvite(expired)) === null, "expired invite is rejected");

console.log("team-invite.server.test.ts passed");
