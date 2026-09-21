import { mergeStaffLists, readAdminStaffVault, upsertAdminStaffVault } from "./admin-staff-vault";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    },
  },
  configurable: true,
});

assert(readAdminStaffVault().length === 0, "vault starts empty");
upsertAdminStaffVault({ email: "dev@eterfaceid.com", name: "Dev", level: "developer" });
upsertAdminStaffVault({ email: "ops@eterfaceid.com", name: "Ops", level: "operations" });
const rows = readAdminStaffVault();
assert(rows.some((row) => row.level === "developer" && row.email === "dev@eterfaceid.com"), "developer is stored");
assert(rows.some((row) => row.level === "operations"), "operations is stored");

const merged = mergeStaffLists(
  [{ id: "db-1", email: "owner@eterfaceid.com", name: "Owner", level: "owner", userId: "u1", status: "active", savedAt: "" }],
  rows,
);
assert(merged.some((row) => row.email === "owner@eterfaceid.com"), "remote owner is kept");
assert(merged.some((row) => row.email === "dev@eterfaceid.com"), "local developer is kept");

console.log("admin-staff-vault.test.ts passed");
