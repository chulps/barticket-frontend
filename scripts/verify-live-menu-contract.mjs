// Read-only release gate: no production menu, ticket, or payment writes.
const origin = (process.env.BARTICKET_API_ORIGIN ?? "https://bar-ticket-api-taupe.vercel.app").replace(/\/$/, "");
async function get(path) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}
const [health, spec, menu] = await Promise.all([get("/health"), get("/openapi.json"), get("/menu")]);
if (health.response !== "ok" || !Array.isArray(menu.items)) throw new Error("Backend health/menu unavailable");
for (const [path, method] of [
  ["/menu/items/{item_id}", "patch"],
  ["/menu/items/{item_id}/archive", "post"],
  ["/menu/items/{item_id}/restore", "post"],
  ["/menu/archived", "get"],
]) {
  if (!spec.paths?.[path]?.[method]) throw new Error(`Missing deployed ${method.toUpperCase()} ${path}`);
}
const ref = spec.paths["/menu/items/{item_id}"].patch.requestBody?.content?.["application/json"]?.schema?.$ref;
const schema = spec.components?.schemas?.[ref?.split("/").at(-1)];
for (const field of ["name", "category", "prices", "in_stock", "cocktail_ingredient"]) {
  if (!schema?.properties?.[field]) throw new Error(`Missing full menu editor field: ${field}`);
}
if (menu.items.some(item => item.archived === true)) throw new Error("Active menu includes archived rows");
console.log("Deployed menu edit/archive/restore contract and active menu verified (read-only).");
