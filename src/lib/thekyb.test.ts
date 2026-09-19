import { compareRegistry, maskApiKey, normalizeRegistration, pickBestMatch, toTheKybCountryCode } from "./thekyb";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(toTheKybCountryCode("CA") === "ca", "CA maps to ca");
assert(toTheKybCountryCode("uk") === "gb", "uk maps to gb");
assert(toTheKybCountryCode("United Kingdom") === "gb", "United Kingdom maps to gb");
assert(toTheKybCountryCode("united_states.ohio") === "united_states_ohio", "state dots become underscores");
assert(normalizeRegistration("123-456 7") === "1234567", "registration is stripped");
assert(maskApiKey("secretkey1234") === "••••1234", "key is masked");

const pass = compareRegistry({
  claimedName: "Acme Limited",
  claimedRegistration: "1234567",
  matchedName: "Acme Limited",
  matchedRegistration: "1234567",
  registryStatus: "active",
});
assert(pass.result === "pass", `expected pass, got ${pass.result}`);

const fail = compareRegistry({
  claimedName: "Acme Limited",
  claimedRegistration: "1234567",
  matchedName: "Other Corp",
  matchedRegistration: "999",
  registryStatus: "dissolved",
});
assert(fail.result === "fail", `expected fail, got ${fail.result}`);

const picked = pickBestMatch("Acme Ltd", "ABC-99", [
  {
    kyb_response_id: "1",
    name: "Unrelated",
    registration_number: "000",
    country_code: "CA",
    type: null,
    status: "active",
    risk_level: null,
    verification_status: null,
    fetch_status: null,
  },
  {
    kyb_response_id: "2",
    name: "Acme Ltd",
    registration_number: "ABC99",
    country_code: "CA",
    type: null,
    status: "active",
    risk_level: null,
    verification_status: null,
    fetch_status: null,
  },
]);
assert(picked?.kyb_response_id === "2", "picks the registration-number match");

console.log("thekyb helpers: all checks passed");
