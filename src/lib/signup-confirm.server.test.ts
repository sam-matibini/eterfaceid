import { signSignupConfirm, verifySignupConfirm } from "./signup-confirm.server";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const token = await signSignupConfirm({
  email: "Sam@efin.money",
  purpose: "verify",
  next: "/console",
});
assert(token.includes("."), "token has a signature");
assert(!token.includes("Sam@efin.money"), "raw email is not in the token");

const payload = await verifySignupConfirm(token);
assert(payload?.email === "sam@efin.money", "email is normalized");
assert(payload?.purpose === "verify", "purpose is kept");
assert(payload?.next === "/console", "next is kept");

assert((await verifySignupConfirm("not-a-token")) === null, "junk token is rejected");
assert((await verifySignupConfirm(`${token}x`)) === null, "tampered token is rejected");

const expired = await signSignupConfirm({
  email: "sam@efin.money",
  purpose: "verify",
  ttlMs: -1000,
});
assert((await verifySignupConfirm(expired)) === null, "expired token is rejected");

console.log("signup-confirm.server.test.ts passed");
