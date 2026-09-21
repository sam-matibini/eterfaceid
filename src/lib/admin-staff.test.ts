import {
  canManageStaff,
  displayStaffLevel,
  parseStaffLevel,
  staffInviteRole,
} from "./admin-staff";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(parseStaffLevel("developer") === "developer", "developer level");
assert(parseStaffLevel("Operations") === "operations", "operations is case-insensitive");
assert(parseStaffLevel("ops") === "operations", "ops alias");
assert(parseStaffLevel("admin") === "owner", "admin alias is owner");
assert(displayStaffLevel("developer") === "Developer", "developer label");
assert(displayStaffLevel("operations") === "Operations", "operations label");
assert(canManageStaff("owner"), "owner can add staff");
assert(!canManageStaff("developer"), "developer cannot add staff");
assert(!canManageStaff("operations"), "operations cannot add staff");
assert(staffInviteRole("developer") === "Developer", "invite role copy");

console.log("admin-staff.test.ts passed");
