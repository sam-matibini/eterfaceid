/** eterfaceID App admin staff roles (not company membership roles). */

export const STAFF_LEVELS = ["owner", "developer", "operations"] as const;
export type StaffLevel = (typeof STAFF_LEVELS)[number];

export const STAFF_LEVEL_OPTIONS: { value: StaffLevel; label: string; description: string }[] = [
  {
    value: "developer",
    label: "Developer",
    description: "Integrations, APIs and technical work in App admin.",
  },
  {
    value: "operations",
    label: "Operations",
    description: "Customer companies, live access, billing and day-to-day ops.",
  },
  {
    value: "owner",
    label: "Owner",
    description: "Full App admin, including adding and removing staff.",
  },
];

export function isStaffLevel(value: string): value is StaffLevel {
  return (STAFF_LEVELS as readonly string[]).includes(value);
}

export function parseStaffLevel(value: string | null | undefined): StaffLevel {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (isStaffLevel(trimmed)) return trimmed;
  if (trimmed === "ops" || trimmed === "operator") return "operations";
  if (trimmed === "admin" || trimmed === "administrator") return "owner";
  return "operations";
}

export function displayStaffLevel(value: string | null | undefined) {
  const level = parseStaffLevel(value);
  return STAFF_LEVEL_OPTIONS.find((row) => row.value === level)?.label ?? level;
}

export function canManageStaff(level: string | null | undefined) {
  return parseStaffLevel(level) === "owner";
}

export function staffInviteRole(level: StaffLevel) {
  if (level === "developer") return "Developer";
  if (level === "owner") return "Owner";
  return "Operations";
}
