import { firstRow, userRestHeaders } from "./user-rest.server";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const publishable =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.publishable";
const userToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6InVzZXItMSJ9.user";

const headers = userRestHeaders(publishable, userToken);
assert(headers.apikey === publishable, "apikey stays the project publishable key");
assert(headers.Authorization === `Bearer ${userToken}`, "Authorization is the signed-in user JWT");
assert(headers.Authorization !== `Bearer ${publishable}`, "RLS would fail if the anon JWT was sent as Bearer");

assert(firstRow([{ id: "org-1" }])?.id === "org-1", "first row from array");
assert(firstRow({ id: "org-2" })?.id === "org-2", "first row from object");
assert(firstRow(null) === null, "empty rest payload");
assert(firstRow([]) === null, "empty array");

console.log("user-rest.server.test.ts passed");
