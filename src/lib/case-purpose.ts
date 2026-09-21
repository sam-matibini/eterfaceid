/** Purpose is a product lens on cases. Live `case_type` is only person | business. */

export const CASE_PURPOSES = ["kyc", "kyb", "aml", "employee"] as const;
export type CasePurpose = (typeof CASE_PURPOSES)[number];

export const CASE_PRODUCTS = ["customer_kyc", "business_kyb", "aml_screening", "employee_onboarding"] as const;
export type CaseProduct = (typeof CASE_PRODUCTS)[number];

export const INDUSTRIES = [
  "fintech",
  "msb",
  "payments",
  "lending",
  "digital_assets",
  "marketplace",
  "real_estate",
  "insurance",
] as const;
export type IndustryCode = (typeof INDUSTRIES)[number];

export const PRODUCT_TO_PURPOSE: Record<CaseProduct, CasePurpose> = {
  customer_kyc: "kyc",
  business_kyb: "kyb",
  aml_screening: "aml",
  employee_onboarding: "employee",
};

export const EMPLOYEE_REFERENCE_PREFIX = "EMP-";
export const EMPLOYEE_REFERENCE_PREFIXES = ["EMP-", "EMPLOYEE-", "HR-"] as const;

export const PURPOSE_LABEL: Record<CasePurpose, string> = {
  kyc: "KYC",
  kyb: "KYB",
  aml: "AML",
  employee: "Employee",
};

export function isEmployeeReference(reference: string | null | undefined) {
  const ref = (reference ?? "").trim().toUpperCase();
  return EMPLOYEE_REFERENCE_PREFIXES.some((prefix) => ref.startsWith(prefix));
}

export function purposeFromProduct(product: string | null | undefined): CasePurpose | null {
  if (!product) return null;
  return PRODUCT_TO_PURPOSE[product as CaseProduct] ?? null;
}

export function classifyCase(row: { case_type: string; reference: string }): CasePurpose {
  if (isEmployeeReference(row.reference)) return "employee";
  if (row.case_type === "business") return "kyb";
  return "kyc";
}

export function matchesPurpose(
  row: { case_type: string; reference: string },
  purpose: CasePurpose | "all",
) {
  if (purpose === "all" || purpose === "aml") return true;
  return classifyCase(row) === purpose;
}

export function resolveCaseCreate(input: {
  case_type?: "person" | "business" | null;
  purpose?: CasePurpose | null;
  product?: string | null;
}) {
  const purpose =
    input.purpose ??
    purposeFromProduct(input.product) ??
    (input.case_type === "business" ? "kyb" : "kyc");
  const caseType =
    purpose === "kyb" ? "business" : purpose === "aml" ? (input.case_type ?? "person") : "person";
  return { purpose, case_type: caseType as "person" | "business" };
}

export function ensureReference(purpose: CasePurpose, reference?: string | null) {
  const stamp = Date.now().toString(36).toUpperCase();
  const generated =
    purpose === "employee"
      ? `${EMPLOYEE_REFERENCE_PREFIX}${stamp}`
      : `${purpose.toUpperCase()}-${stamp}`;
  const trimmed = reference?.trim();
  if (!trimmed) return generated;
  if (purpose === "employee" && !isEmployeeReference(trimmed)) {
    return `${EMPLOYEE_REFERENCE_PREFIX}${trimmed}`.slice(0, 60);
  }
  return trimmed.slice(0, 60);
}

export const REGULATORY_PACKS: Record<
  IndustryCode,
  { label: string; jurisdictions: string[]; authorities: string[]; obligations: string[] }
> = {
  fintech: {
    label: "Fintech",
    jurisdictions: ["CA", "US", "EU", "UK"],
    authorities: ["FINTRAC", "FinCEN", "EBA", "FCA"],
    obligations: ["KYC", "KYB", "AML screening", "STR/SAR", "travel rule"],
  },
  msb: {
    label: "Money services business",
    jurisdictions: ["CA", "US"],
    authorities: ["FINTRAC", "FinCEN"],
    obligations: ["KYC", "KYB", "AML screening", "LCTR/CTR", "EFTR"],
  },
  payments: {
    label: "Payments",
    jurisdictions: ["CA", "US", "EU"],
    authorities: ["Bank of Canada", "FinCEN", "EBA"],
    obligations: ["end-user identification", "KYB", "AML monitoring"],
  },
  lending: {
    label: "Lending & credit",
    jurisdictions: ["CA", "US", "EU"],
    authorities: ["FINTRAC", "CFPB", "EBA"],
    obligations: ["applicant KYC", "KYB", "synthetic identity", "adverse media"],
  },
  digital_assets: {
    label: "Digital assets",
    jurisdictions: ["CA", "US", "EU"],
    authorities: ["FINTRAC", "FinCEN", "FATF"],
    obligations: ["KYC", "KYB", "sanctions", "travel rule", "continuous rescreening"],
  },
  marketplace: {
    label: "Marketplaces & gig",
    jurisdictions: ["CA", "US", "EU"],
    authorities: ["FINTRAC", "FinCEN"],
    obligations: ["seller KYC", "contractor onboarding", "AML screening"],
  },
  real_estate: {
    label: "Real estate & legal",
    jurisdictions: ["CA", "US", "EU"],
    authorities: ["FINTRAC", "FinCEN"],
    obligations: ["KYB", "beneficial ownership", "source of funds"],
  },
  insurance: {
    label: "Insurance",
    jurisdictions: ["CA", "US", "EU"],
    authorities: ["FINTRAC", "FinCEN"],
    obligations: ["applicant KYC", "fraud signals", "AML screening"],
  },
};
