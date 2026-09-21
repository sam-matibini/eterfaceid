/** Company profile that survives the live organizations schema (name/slug only). */

export type CompanyProfile = {
  id: string;
  name: string;
  legal_name: string;
  registration_number: string;
  country: string;
  address_line1: string;
  city: string;
  region: string;
  postal_code: string;
  website: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function mergeCompanyProfile(
  org: Record<string, unknown> | null | undefined,
  application: Record<string, unknown> | null | undefined,
): CompanyProfile {
  const id = text(org?.["id"] ?? application?.["org_id"]);
  const name = text(org?.["name"] || application?.["legal_name"]);
  return {
    id,
    name,
    legal_name: text(org?.["legal_name"] || application?.["legal_name"] || name),
    registration_number: text(org?.["registration_number"] || application?.["registration_number"]),
    country: text(org?.["country"] || application?.["country"]),
    address_line1: text(org?.["address_line1"] || application?.["address_line1"]),
    city: text(org?.["city"] || application?.["city"]),
    region: text(org?.["region"] || application?.["region"]),
    postal_code: text(org?.["postal_code"] || application?.["postal_code"]),
    website: text(org?.["website"] || application?.["website"]),
  };
}

export function liveOrganizationProfileUpdate(input: { name: string }) {
  return { name: input.name.trim() };
}

export function companyApplicationPayload(input: {
  orgId: string;
  userId: string;
  legalName: string;
  registrationNumber?: string | null;
  country?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  website?: string | null;
}) {
  return {
    org_id: input.orgId,
    legal_name: input.legalName,
    registration_number: input.registrationNumber || null,
    country: input.country?.toUpperCase() || null,
    address_line1: input.addressLine1 || null,
    city: input.city || null,
    region: input.region || null,
    postal_code: input.postalCode || null,
    website: input.website || null,
    submitted_by: input.userId,
    status: "draft",
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

export function canEditCompany(input: {
  isAdmin?: boolean;
  isOwner?: boolean;
  hasUsersManage?: boolean;
  pinUnlocked?: boolean;
  hasOrganization?: boolean;
}) {
  if (!input.hasOrganization) return false;
  return Boolean(input.isAdmin || input.isOwner || input.hasUsersManage || input.pinUnlocked);
}
