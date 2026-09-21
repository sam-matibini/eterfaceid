import {
  alreadyOnTeamMessage,
  dedupeByUserId,
  isIgnorableSideWrite,
  isMissingColumnError,
  isRlsError,
  isUniqueConflict,
  liveInviteInsert,
  liveMemberInsert,
  liveOrganizationProfileUpdate,
} from "./schema-fallback";
import { withCreatorOnTeam } from "./team-view";
import { normalizeCountry } from "./company-country";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(isUniqueConflict('duplicate key value violates unique constraint "organization_members_org_id_user_id_key"'), "unique members");
assert(isUniqueConflict("already exists"), "already exists");
assert(!isUniqueConflict("permission denied"), "not unique");
assert(isMissingColumnError("Could not find the 'legal_name' column of 'organizations' in the schema cache"), "missing column");
assert(isMissingColumnError('column "access_role" of relation "organization_members" does not exist'), "pg missing");
assert(!isMissingColumnError("new row violates row-level security"), "rls is not missing column");
assert(
  isRlsError('new row violates row-level security policy for table "org_applications"'),
  "org_applications rls",
);
assert(isIgnorableSideWrite('new row violates row-level security policy for table "org_applications"'), "ignore rls");
assert(!isRlsError("permission denied for table organizations"), "permission denied is not rls");

assert(alreadyOnTeamMessage("sam@efin.money") === "sam@efin.money is already on this team.", "email message");

const members = dedupeByUserId([
  { userId: "a", name: "One" },
  { userId: "a", name: "Dup" },
  { userId: "b", name: "Two" },
]);
assert(members.length === 2, "dedupes user ids");
assert(members[0]?.name === "One", "keeps the first row");

const listed = withCreatorOnTeam([], { userId: "owner-1", email: "sam@efin.money", fullName: "Sam" });
assert(listed.length === 1 && listed[0]?.isOwner === true, "creator appears on an empty team");
assert(listed[0]?.email === "sam@efin.money", "creator email is shown");
assert(withCreatorOnTeam(listed, { userId: "owner-1" }).length === 1, "creator is not duplicated");

assert(normalizeCountry("Canada") === "CA", "canada maps");
assert(normalizeCountry("ca") === "CA", "iso is uppercased");
assert(normalizeCountry("Winnipeg") === "Winnipeg", "unknown names are kept");
assert(normalizeCountry("  ") === null, "blank is null");

assert(liveOrganizationProfileUpdate({ name: " eFinMoney " }).name === "eFinMoney", "trim display name");
assert(Object.keys(liveOrganizationProfileUpdate({ name: "x" })).join(",") === "name", "name-only fallback");

const member = liveMemberInsert({ orgId: "org-1", userId: "user-1" });
assert(member.role === "admin", "creator joins as admin");
assert(!("access_role" in member), "minimal member insert has no extra columns");

const invite = liveInviteInsert({
  orgId: "org-1",
  email: "Sam@efin.money",
  role: "viewer",
  tokenHash: "abc",
  invitedBy: "user-1",
  expiresAt: "2026-09-24T00:00:00.000Z",
});
assert(invite.email === "sam@efin.money", "invite email is normalized");
assert(!("first_name" in invite), "minimal invite has no extra columns");

console.log("schema-fallback.test.ts passed");
