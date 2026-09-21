import {
  classifyCase,
  ensureReference,
  isEmployeeReference,
  matchesPurpose,
  purposeFromProduct,
  resolveCaseCreate,
} from "./case-purpose";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(isEmployeeReference("EMP-1044"), "EMP- prefix is employee");
assert(isEmployeeReference("employee-9"), "EMPLOYEE- prefix is employee");
assert(isEmployeeReference("HR-12"), "HR- prefix is employee");
assert(!isEmployeeReference("KYC-12"), "KYC is not employee");

assert(purposeFromProduct("employee_onboarding") === "employee", "product maps to employee");
assert(purposeFromProduct("business_kyb") === "kyb", "product maps to kyb");

assert(resolveCaseCreate({ purpose: "employee" }).case_type === "person", "employees are person cases");
assert(resolveCaseCreate({ purpose: "kyb" }).case_type === "business", "kyb is business");
assert(resolveCaseCreate({ product: "customer_kyc" }).purpose === "kyc", "kyc product");
assert(resolveCaseCreate({ case_type: "business" }).purpose === "kyb", "business implies kyb");
assert(resolveCaseCreate({ purpose: "aml", case_type: "business" }).case_type === "business", "aml keeps type");

assert(ensureReference("employee", "1044").startsWith("EMP-"), "employee refs are prefixed");
assert(ensureReference("employee", "EMP-1044") === "EMP-1044", "existing EMP- is kept");
assert(ensureReference("kyc", "EFIN-1") === "EFIN-1", "custom kyc refs are kept");
assert(ensureReference("kyb").startsWith("KYB-"), "generated kyb ref");

assert(classifyCase({ case_type: "person", reference: "EMP-1" }) === "employee", "classify employee");
assert(classifyCase({ case_type: "business", reference: "BIZ-1" }) === "kyb", "classify kyb");
assert(classifyCase({ case_type: "person", reference: "CUST-1" }) === "kyc", "classify kyc");

assert(matchesPurpose({ case_type: "person", reference: "EMP-1" }, "employee"), "filter employee");
assert(!matchesPurpose({ case_type: "person", reference: "EMP-1" }, "kyc"), "employees are not customer kyc");
assert(matchesPurpose({ case_type: "person", reference: "EMP-1" }, "aml"), "aml includes everyone");
assert(matchesPurpose({ case_type: "business", reference: "BIZ" }, "all"), "all includes kyb");

console.log("case-purpose.test.ts passed");
