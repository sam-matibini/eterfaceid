/**
 * Shared The KYB helpers. Safe to import from client or server.
 * No secrets live here — only country mapping and registry comparison.
 */

import { scoreMatch } from "@/lib/name-match";

export const THEKYB_PROVIDER = "thekyb";
export const THEKYB_BACKOFFICE_URL = "https://backoffice.thekyb.com/";
export const THEKYB_DOCS_URL = "https://developers.thekyb.com/docs/services/kyb_check_v2";

const COUNTRY_ALIASES: Record<string, string> = {
  uk: "gb",
  "united kingdom": "gb",
  "great britain": "gb",
  "united states": "us",
  usa: "us",
  canada: "ca",
};

/** Maps an ISO-2 or country name to The KYB v2 country_codes value. */
export function toTheKybCountryCode(input: string | null | undefined): string {
  const raw = (input ?? "CA").trim().toLowerCase().replace(/\s+/g, " ");
  if (COUNTRY_ALIASES[raw]) return COUNTRY_ALIASES[raw]!;
  if (raw.includes(".")) return raw.replace(/\./g, "_");
  if (raw.length === 2) return raw;
  return raw.replace(/\s+/g, "_");
}

export function normalizeRegistration(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[\s\-./]/g, "");
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

export type RegistryComparison = {
  field: string;
  claimed: string;
  registry: string;
  status: "match" | "close" | "different";
};

export type RegistryMatch = {
  kyb_response_id: string;
  name: string;
  registration_number: string | null;
  country_code: string | null;
  type: string | null;
  status: string | null;
  risk_level: string | null;
  verification_status: string | null;
  fetch_status: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "live", "registered", "good standing", "in business"]);
const DEAD_STATUSES = new Set(["dissolved", "inactive", "struck off", "struck-off", "closed", "liquidated", "removed"]);

export function compareRegistry(input: {
  claimedName: string;
  claimedRegistration?: string | null | undefined;
  matchedName: string;
  matchedRegistration?: string | null | undefined;
  registryStatus?: string | null | undefined;
}): { comparisons: RegistryComparison[]; result: "pass" | "review" | "fail" } {
  const comparisons: RegistryComparison[] = [];

  const name = scoreMatch({ query: input.claimedName, candidate: input.matchedName, kind: "business" });
  comparisons.push({
    field: "Legal name",
    claimed: input.claimedName,
    registry: input.matchedName || "not provided",
    status: name.score >= 0.9 ? "match" : name.score >= 0.7 ? "close" : "different",
  });

  if (input.claimedRegistration) {
    const claimed = normalizeRegistration(input.claimedRegistration);
    const registry = normalizeRegistration(input.matchedRegistration);
    comparisons.push({
      field: "Registration number",
      claimed: input.claimedRegistration,
      registry: input.matchedRegistration || "not provided",
      status: claimed && registry && claimed === registry ? "match" : registry ? "different" : "close",
    });
  }

  const status = (input.registryStatus ?? "").trim().toLowerCase();
  if (status) {
    const tone = DEAD_STATUSES.has(status) ? "different" : ACTIVE_STATUSES.has(status) ? "match" : "close";
    comparisons.push({
      field: "Registry status",
      claimed: "active / in good standing",
      registry: input.registryStatus ?? "unknown",
      status: tone,
    });
  }

  const different = comparisons.filter((c) => c.status === "different").length;
  const close = comparisons.filter((c) => c.status === "close").length;
  const result: "pass" | "review" | "fail" = different ? "fail" : close ? "review" : "pass";
  return { comparisons, result };
}

/** Prefers an exact registration-number hit, otherwise the closest name. */
export function pickBestMatch(
  claimedName: string,
  claimedRegistration: string | null | undefined,
  matches: RegistryMatch[],
): RegistryMatch | null {
  if (!matches.length) return null;
  const claimedReg = normalizeRegistration(claimedRegistration);
  if (claimedReg) {
    const exact = matches.find((m) => normalizeRegistration(m.registration_number) === claimedReg);
    if (exact) return exact;
  }
  let best: { match: RegistryMatch; score: number } | null = null;
  for (const row of matches) {
    const outcome = scoreMatch({ query: claimedName, candidate: row.name, kind: "business" });
    if (!best || outcome.score > best.score) best = { match: row, score: outcome.score };
  }
  return best?.match ?? matches[0] ?? null;
}
