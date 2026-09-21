import { efinMoneyRecipes, publicApiOrigin } from "./api-recipes";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(publicApiOrigin("https://eterfaceid.com/") === "https://eterfaceid.com", "origin has no trailing slash");

const recipes = efinMoneyRecipes({
  secret: "ef_test_secret_abc",
  origin: "https://eterfaceid.com",
  environment: "sandbox",
});

assert(recipes.length >= 6, "eFinMoney recipes are complete");
assert(
  recipes.every((r) => r.code.includes("ef_test_secret_abc") || r.code.includes("ETERFACEID_SECRET")),
  "recipes use the generated secret or the env var",
);
assert(
  recipes.some((r) => r.code.includes('"purpose": "employee"') || r.code.includes("purpose: \"employee\"")),
  "employee onboarding recipe exists",
);
assert(
  recipes.some((r) => r.code.includes('"industry": "fintech"') || r.code.includes("industry: \"fintech\"")),
  "fintech localization is in the recipe",
);
assert(
  recipes.some((r) => r.code.includes("/api/public/v1/cases")),
  "recipes hit the public API",
);
assert(
  !recipes.some((r) => r.code.includes("eid_live_") || r.code.includes("eid_test_")),
  "recipes use ef_ secret prefixes, not legacy eid_",
);

const placeholder = efinMoneyRecipes({ environment: "live" });
assert(placeholder[0]!.code.includes("ef_live_secret_YOUR_SECRET"), "live placeholder uses live secret prefix");

console.log("api-recipes.test.ts passed");
