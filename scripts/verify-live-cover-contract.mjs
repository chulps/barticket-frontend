// Read-only production contract check. Never send ticket writes from CI.
// Guard frontend release against a deployed backend that lacks PR #91.
const origin = (process.env.BARTICKET_API_ORIGIN ?? "https://bar-ticket-api-taupe.vercel.app").replace(/\/$/, "");

async function get(path) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Backend " + path + " returned HTTP " + response.status);
  return response.json();
}

const [health, spec] = await Promise.all([get("/health"), get("/openapi.json")]);
if (health.response !== "ok") throw new Error("Unexpected production health response");
const cover = spec.paths?.["/tickets/{ticket_id}/cover"]?.patch;
const reopen = spec.paths?.["/tickets/{ticket_id}/reopen"]?.post;
const pay = spec.paths?.["/tickets/{ticket_id}/pay"]?.post;
if (!cover || !reopen || !pay) {
  throw new Error("Production backend is missing cover, reopen, or payment routes from PR #91");
}
const requestRef = cover.requestBody?.content?.["application/json"]?.schema?.$ref;
const requestName = requestRef?.split("/").at(-1);
const schema = spec.components?.schemas?.[requestName];
const fields = ["returning_guest_count", "waived_cover_count", "returning_from_ticket_id", "reason"];
if (!schema || fields.some(name => !schema.properties?.[name]) ||
  !schema.required?.includes("reason")) {
  throw new Error("Deployed cover adjustment body schema differs from PR #91");
}
console.log("Production health OK; cover, reopen and payment endpoints found; audited cover payload fields match #91.");
