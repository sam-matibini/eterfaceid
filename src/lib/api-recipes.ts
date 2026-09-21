import { API_BASE_PATH } from "@/lib/api-spec";
import { secretKeyPrefix, type EnvironmentCode } from "@/lib/access";

export const DEFAULT_API_ORIGIN = "https://eterfaceid.com";

export type IntegrationRecipe = {
  id: string;
  title: string;
  description: string;
  language: "bash" | "javascript";
  code: string;
};

export function publicApiOrigin(origin?: string) {
  const value = (origin ?? DEFAULT_API_ORIGIN).replace(/\/$/, "");
  return value;
}

export function efinMoneyRecipes(input: {
  secret?: string | null;
  origin?: string;
  environment?: EnvironmentCode;
}): IntegrationRecipe[] {
  const origin = publicApiOrigin(input.origin);
  const env = input.environment ?? "sandbox";
  const secret = input.secret?.trim() || `${secretKeyPrefix(env)}YOUR_SECRET`;
  const base = `${origin}${API_BASE_PATH}`;

  const ping = `curl ${base}/ping \\
  -H "Authorization: Bearer ${secret}"`;

  const kyc = `curl ${base}/cases \\
  -H "Authorization: Bearer ${secret}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: efin-kyc-customer_8842" \\
  -d '{
    "purpose": "kyc",
    "product": "customer_kyc",
    "industry": "fintech",
    "subject_name": "Amelia Okonkwo",
    "country": "CA",
    "reference": "EFIN-CUST-8842"
  }'`;

  const kyb = `curl ${base}/cases \\
  -H "Authorization: Bearer ${secret}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: efin-kyb-biz_102" \\
  -d '{
    "purpose": "kyb",
    "product": "business_kyb",
    "industry": "fintech",
    "case_type": "business",
    "subject_name": "eFinMoney Inc",
    "country": "CA",
    "reference": "EFIN-BIZ-102"
  }'`;

  const employee = `curl ${base}/cases \\
  -H "Authorization: Bearer ${secret}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: efin-emp-1044" \\
  -d '{
    "purpose": "employee",
    "product": "employee_onboarding",
    "industry": "fintech",
    "subject_name": "Samson Matibini",
    "country": "CA",
    "reference": "HR-1044"
  }'`;

  const hosted = `curl ${base}/cases/CASE_ID/verification-sessions \\
  -H "Authorization: Bearer ${secret}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "expires_in_minutes": 1440,
    "redirect_url": "https://app.efin.money/kyc/done"
  }'`;

  const js = `const ETERFACEID_SECRET = process.env.ETERFACEID_SECRET_KEY;
const BASE = "${base}";

export async function startEfinMoneyKyc({ name, country, customerId }) {
  const res = await fetch(\`\${BASE}/cases\`, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${ETERFACEID_SECRET}\`,
      "Content-Type": "application/json",
      "Idempotency-Key": \`efin-kyc-\${customerId}\`,
    },
    body: JSON.stringify({
      purpose: "kyc",
      product: "customer_kyc",
      industry: "fintech",
      subject_name: name,
      country,
      reference: customerId,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startEmployeeOnboarding({ name, country, employeeId }) {
  const res = await fetch(\`\${BASE}/cases\`, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${ETERFACEID_SECRET}\`,
      "Content-Type": "application/json",
      "Idempotency-Key": \`efin-emp-\${employeeId}\`,
    },
    body: JSON.stringify({
      purpose: "employee",
      product: "employee_onboarding",
      industry: "fintech",
      subject_name: name,
      country,
      reference: employeeId,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}`;

  return [
    { id: "ping", title: "1. Check the key", description: "Confirms the secret, company and environment.", language: "bash", code: ping },
    { id: "kyc", title: "2. Start customer KYC", description: "Create a person case for an eFinMoney customer.", language: "bash", code: kyc },
    { id: "kyb", title: "3. Start business KYB", description: "Create a business case for merchant onboarding.", language: "bash", code: kyb },
    { id: "employee", title: "4. Onboard an employee", description: "Person case tagged EMP- for HR / staff KYC.", language: "bash", code: employee },
    { id: "hosted", title: "5. Hosted verification link", description: "Hand the customer or employee a one-time ID capture URL.", language: "bash", code: hosted },
    { id: "js", title: "eFinMoney Node helper", description: "Drop into eFinMoney as ETERFACEID_SECRET_KEY.", language: "javascript", code: js },
  ];
}
