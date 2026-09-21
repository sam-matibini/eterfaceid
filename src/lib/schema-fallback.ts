/** Detect PostgREST / Postgres errors that mean we should retry with a slimmer payload. */

export function isMissingColumnError(message: string | null | undefined) {
  if (!message) return false;
  return /does not exist|schema cache|could not find the .+ column|column .+ of relation/i.test(message);
}

export function isUniqueConflict(message: string | null | undefined) {
  if (!message) return false;
  return /duplicate key|unique constraint|already exists/i.test(message);
}

export function isRlsError(message: string | null | undefined) {
  if (!message) return false;
  return /row-level security|rls policy|violates row-level security/i.test(message);
}

/** Side writes (go-live drafts, audit) must never fail company or team saves. */
export function isIgnorableSideWrite(message: string | null | undefined) {
  return isMissingColumnError(message) || isUniqueConflict(message) || isRlsError(message);
}

export function alreadyOnTeamMessage(email?: string) {
  return email
    ? `${email} is already on this team.`
    : "That person is already on this team.";
}

export async function writeWithFallback<R>(
  write: (payload: Record<string, unknown>) => Promise<{ data: R | null; error: { message: string } | null }>,
  payload: Record<string, unknown>,
  fallback: Record<string, unknown>,
) {
  const first = await write(payload);
  if (!first.error || isUniqueConflict(first.error.message)) return first;
  if (!isMissingColumnError(first.error.message)) return first;
  return write(fallback);
}

export function liveMemberInsert(input: { orgId: string; userId: string; role?: "admin" | "analyst" | "viewer" }) {
  return {
    org_id: input.orgId,
    user_id: input.userId,
    role: input.role ?? "admin",
  };
}

export function liveInviteInsert(input: {
  orgId: string;
  email: string;
  role: "admin" | "analyst" | "viewer";
  tokenHash: string;
  invitedBy: string;
  expiresAt: string;
}) {
  return {
    org_id: input.orgId,
    email: input.email.toLowerCase(),
    role: input.role,
    token_hash: input.tokenHash,
    invited_by: input.invitedBy,
    expires_at: input.expiresAt,
  };
}

export function liveOrganizationProfileUpdate(input: { name: string }) {
  return { name: input.name.trim() };
}

export function dedupeByUserId<T extends { userId: string }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.userId || seen.has(row.userId)) return false;
    seen.add(row.userId);
    return true;
  });
}
