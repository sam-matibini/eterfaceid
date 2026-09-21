import {
  isMissingRpcError,
  isMissingSchemaError,
  isRlsError,
  isUniqueConflict,
  missingSchemaPart,
  omitField,
  writeIgnoringUnknownColumns,
} from "./schema-compat";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(
  missingSchemaPart("Could not find the 'address_line1' column of 'organizations' in the schema cache")?.name ===
    "address_line1",
  "postgrest schema cache column",
);
assert(missingSchemaPart("column organizations.legal_name does not exist")?.name === "legal_name", "postgres column");
assert(missingSchemaPart("Could not find the table 'public.org_environments' in the schema cache")?.kind === "table", "missing table");
assert(isMissingSchemaError("Could not find the 'access_role' column of 'organization_members'"), "members extra cols");
assert(
  isMissingRpcError("Could not find the function public.create_company_workspace(_name, _slug) in the schema cache"),
  "missing rpc",
);
assert(!isMissingRpcError("new row violates row-level security policy for table \"organizations\""), "rls is not missing rpc");
assert(isRlsError("new row violates row-level security policy for table \"organizations\""), "org rls");
assert(isUniqueConflict("duplicate key value violates unique constraint \"organizations_slug_key\""), "slug conflict");
assert(omitField({ a: 1, b: 2 }, "a").b === 2 && !("a" in omitField({ a: 1, b: 2 }, "a")), "omit field");

const attempts: Array<Record<string, unknown>> = [];
const written = await writeIgnoringUnknownColumns(async (payload) => {
  attempts.push({ ...payload });
  if ("address_line1" in payload) {
    return { data: null, error: { message: "Could not find the 'address_line1' column of 'organizations' in the schema cache" } };
  }
  if ("legal_name" in payload) {
    return { data: null, error: { message: "column organizations.legal_name does not exist" } };
  }
  return { data: { id: "org-1", name: payload["name"] }, error: null };
}, { name: "eFinMoney", legal_name: "eFinTax Advisors", address_line1: "1778 BROOKFIELD CRESCENT", slug: "efin" });

assert(written.data && (written.data as { id: string }).id === "org-1", "retries until live columns remain");
assert(attempts.length === 3, "strips one missing column per retry");
assert(!("address_line1" in (attempts.at(-1) ?? {})), "address is dropped on the live schema");
assert(!("legal_name" in (attempts.at(-1) ?? {})), "legal_name is dropped on the live schema");

const skipped = await writeIgnoringUnknownColumns(async () => {
  return { data: null, error: { message: "Could not find the table 'public.org_environments' in the schema cache" } };
}, { org_id: "x" });
assert(skipped.skipped === true, "missing tables are skipped");

const companyPayload = {
  name: "eFinTax Advisors Ltd dba eFinMoney",
  slug: "efintax",
  created_by: "user-1",
  primary_admin_user_id: "user-1",
  legal_name: "eFinTax Advisors Ltd dba eFinMoney",
  registration_number: "761893627MC0001",
  country: "CA",
  address_line1: "1778 BROOKFIELD CRESCENT",
  city: "WINNIPEG",
  region: "Manitoba",
  postal_code: "R3Y0L7",
  website: "https://www.efin.money",
};
const liveOrgColumns = new Set(["name", "slug", "created_by", "live_access", "live_approved_at"]);
const company = await writeIgnoringUnknownColumns(async (payload) => {
  const unknown = Object.keys(payload).find((key) => !liveOrgColumns.has(key));
  if (unknown) {
    return {
      data: null,
      error: { message: `Could not find the '${unknown}' column of 'organizations' in the schema cache` },
    };
  }
  return { data: { id: "live-org", name: payload["name"] }, error: null };
}, companyPayload);
assert(company.data && (company.data as { id: string }).id === "live-org", "company create works on the live organizations table");

console.log("schema-compat.test.ts passed");
