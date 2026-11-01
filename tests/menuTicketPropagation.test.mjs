import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");

test("ticket rendering uses saved names and refreshes immediately after committed menu repricing", () => {
  const items = read("components/TicketDetails/TicketItems.tsx");
  const api = read("api/tickets.ts");
  const app = read("App.tsx");
  const tickets = read("hooks/useTickets.ts");
  assert.match(api, /name:\s*item\.name/);
  assert.doesNotMatch(items, /menu\?\.items\.find\(row\s*=>\s*row\.id\s*===\s*item\.menu_item_id\)/);
  assert.match(app, /window\.dispatchEvent\(new Event\("barticket-push"\)\)/);
  assert.match(app, /notifyMutation\("info", t\("menuTicketsMayHaveChanged"\)\)/);
  assert.match(tickets, /window\.addEventListener\("barticket-push", onPush\)/);
});

test("backend price provenance is carried into open and historical ticket rows", () => {
  const api = read("api/tickets.ts");
  const type = read("types/Ticket.ts");
  const items = read("components/TicketDetails/TicketItems.tsx");
  const row = read("components/TicketDetails/TicketItem.tsx");
  assert.match(api, /price_override\?: boolean/);
  assert.match(api, /price_override:\s*item\.price_override\s*\?\?\s*false/);
  assert.match(type, /price_override\?: boolean/);
  assert.match(items, /priceOverride=\{item\.price_override === true\}/);
  assert.match(row, /<PriceOverride[^>]*>\{t\("customPrice"\)\}<\/PriceOverride>/);
  assert.match(row, /priceInput/); // the unsaved inline draft remains local to the editor
});

