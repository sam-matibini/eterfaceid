/** Retry writes when the live PostgREST schema is behind the app migrations. */

export function missingSchemaPart(message: string) {
  const columnCache = message.match(/Could not find the '([^']+)' column of '([^']+)'/i);
  if (columnCache) return { kind: "column" as const, name: columnCache[1], table: columnCache[2] };
  const columnMissing = message.match(/column (?:[\w]+\.)?(\w+) does not exist/i);
  if (columnMissing) return { kind: "column" as const, name: columnMissing[1] };
  const table = message.match(/Could not find the table 'public\.([^']+)'/i);
  if (table) return { kind: "table" as const, name: table[1] };
  return null;
}

export function isMissingSchemaError(message: string) {
  return Boolean(missingSchemaPart(message));
}

export function isMissingRpcError(message: string) {
  return /Could not find the function /i.test(message) || /PGRST202/i.test(message);
}

export function isRlsError(message: string) {
  return /row-level security|42501|permission denied/i.test(message);
}

export function isUniqueConflict(message: string) {
  return /duplicate key|already exists|23505|unique constraint/i.test(message);
}

export function omitField<T extends Record<string, unknown>>(row: T, key: string) {
  const next = { ...row };
  delete next[key];
  return next;
}

type QueryResult<T> = { data: T | null; error: { message: string } | null };

export async function writeIgnoringUnknownColumns<T>(
  run: (payload: Record<string, unknown>) => Promise<QueryResult<T>>,
  payload: Record<string, unknown>,
): Promise<QueryResult<T> & { skipped?: boolean }> {
  let next = { ...payload };
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const result = await run(next);
    if (!result.error) return result;
    const missing = missingSchemaPart(result.error.message);
    if (!missing) return result;
    if (missing.kind === "table") return { data: null, error: null, skipped: true };
    if (!(missing.name in next)) return result;
    next = omitField(next, missing.name);
  }
  return { data: null, error: { message: "Could not write against the live database schema" } };
}
