/** Local store so PIN-unlocked App admin can keep the staff roster. */

import { parseStaffLevel, type StaffLevel } from "./admin-staff";

export const ADMIN_STAFF_VAULT_KEY = "eid_admin_staff";

export type AdminStaffRow = {
  id: string;
  email: string;
  name: string;
  level: StaffLevel;
  userId: string | null;
  status: "active" | "invited";
  savedAt: string;
};

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readAdminStaffVault(): AdminStaffRow[] {
  const raw = storage()?.getItem(ADMIN_STAFF_VAULT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const item = row as Partial<AdminStaffRow>;
        const email = String(item.email ?? "")
          .trim()
          .toLowerCase();
        if (!email) return null;
        return {
          id: String(item.id ?? `vault-${email}`),
          email,
          name: String(item.name ?? email),
          level: parseStaffLevel(item.level),
          userId: item.userId ?? null,
          status: item.status === "active" ? "active" : "invited",
          savedAt: String(item.savedAt ?? new Date().toISOString()),
        } satisfies AdminStaffRow;
      })
      .filter((row): row is AdminStaffRow => Boolean(row));
  } catch {
    return [];
  }
}

export function writeAdminStaffVault(rows: AdminStaffRow[]) {
  storage()?.setItem(ADMIN_STAFF_VAULT_KEY, JSON.stringify(rows));
  return rows;
}

export function upsertAdminStaffVault(input: {
  email: string;
  name?: string;
  level: StaffLevel;
  userId?: string | null;
  status?: "active" | "invited";
  id?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const now = new Date().toISOString();
  const next: AdminStaffRow = {
    id: input.id || `vault-${email}`,
    email,
    name: input.name?.trim() || email,
    level: input.level,
    userId: input.userId ?? null,
    status: input.status ?? "invited",
    savedAt: now,
  };
  const rows = readAdminStaffVault().filter((row) => row.email !== email && row.id !== next.id);
  rows.unshift(next);
  return writeAdminStaffVault(rows);
}

export function removeAdminStaffVault(idOrEmail: string) {
  const key = idOrEmail.trim().toLowerCase();
  return writeAdminStaffVault(
    readAdminStaffVault().filter((row) => row.id !== idOrEmail && row.email !== key),
  );
}

export function mergeStaffLists(remote: AdminStaffRow[], local: AdminStaffRow[]) {
  const byEmail = new Map<string, AdminStaffRow>();
  for (const row of remote) byEmail.set(row.email, row);
  for (const row of local) {
    const existing = byEmail.get(row.email);
    if (!existing) byEmail.set(row.email, row);
  }
  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
}
