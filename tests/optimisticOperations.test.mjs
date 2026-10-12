import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/hooks/optimisticOperations.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const {
  replaceMenuItem, optimisticStock, optimisticPrices, reconcileMenuSnapshot,
  dismissRestockNotice, provisionalTicket, resolveProvisionalTicket, removeProvisionalTicket,
} = await import("data:text/javascript," + encodeURIComponent(outputText));

const drink = (id, inStock = true, standard = 700) => ({
  id, name: "Highball", category: "Whisky", inStock, prices: { standard },
});
const menu = () => ({ coverCharge: 500, items: [drink(1), drink(2, false, 800)] });

test("Phase 3: stock toggles instantly without mutating confirmed state", () => {
  const original = menu();
  const pending = replaceMenuItem(original, optimisticStock(original.items[0]));
  assert.equal(pending.items[0].inStock, false);
  assert.equal(original.items[0].inStock, true);
  assert.equal(pending.items[1].inStock, false);
  assert.deepEqual(replaceMenuItem(pending, original.items[0]), original);
});

test("Phase 3: pending menu prices display immediately and roll back on failure", () => {
  const original = menu();
  const optimistic = replaceMenuItem(original, optimisticPrices(original.items[0], { standard: 950, "15ml": 600 }));
  assert.deepEqual(optimistic.items[0].prices, { standard: 950, "15ml": 600 });
  assert.deepEqual(original.items[0].prices, { standard: 700 });
  assert.deepEqual(replaceMenuItem(optimistic, original.items[0]), original);
});

test("Phase 3: pending item survives stale server refresh without freezing unrelated items", () => {
  const initial = menu();
  const optimistic = replaceMenuItem(initial, optimisticStock(initial.items[0]));
  const incoming = { ...initial, items: [initial.items[0], { ...initial.items[1], prices: { standard: 900 } }] };
  const merged = reconcileMenuSnapshot(incoming, optimistic, new Set([1]));
  assert.equal(merged.items[0].inStock, false);
  assert.equal(merged.items[1].prices.standard, 900);
  assert.deepEqual(reconcileMenuSnapshot(incoming, optimistic, new Set()), incoming);
});

test("Phase 3: successful server response replaces optimistic price and stock", () => {
  const initial = menu();
  let visible = replaceMenuItem(initial, optimisticStock(initial.items[0]));
  visible = replaceMenuItem(visible, { ...initial.items[0], inStock: false, prices: { standard: 750 } });
  assert.equal(visible.items[0].inStock, false);
  assert.equal(visible.items[0].prices.standard, 750);
});

test("Phase 3: restock notice disappears immediately, and original remains for rollback", () => {
  const original = {
    business_date: "2026-10-12", status: "open",
    notices: [
      { id: 5, menu_item_id: 1, item: "Highball", at: 1, by: "Staff A" },
      { id: 6, menu_item_id: 2, item: "Beer", at: 2, by: "Staff B" },
    ],
  };
  const pending = dismissRestockNotice(original, 5);
  assert.deepEqual(pending.notices.map(row => row.id), [6]);
  assert.deepEqual(original.notices.map(row => row.id), [5, 6]);
  assert.deepEqual(dismissRestockNotice(original, 999), original);
});

test("Phase 2: provisional creation uses client-only ID and no financial transactions", () => {
  const provisional = provisionalTicket(-3, 12345);
  assert.equal(provisional.id, -3);
  assert.equal(provisional.status, "open");
  assert.deepEqual(provisional.items, []);
  assert.equal(provisional.payment, null);
  assert.equal(provisional.created_at, 12345);
});

test("Phase 2: server confirmation replaces temporary ticket without duplicates", () => {
  const temp = provisionalTicket(-1, 10);
  const confirmed = { ...temp, id: 27, name: "Ticket #27" };
  const existing = { ...temp, id: 12, name: "Ticket #12" };
  const resolved = resolveProvisionalTicket([temp, existing], -1, confirmed);
  assert.deepEqual(resolved.map(ticket => ticket.id), [27, 12]);
  assert.equal(resolved.filter(ticket => ticket.id === 27).length, 1);
  assert.deepEqual(resolveProvisionalTicket([existing], -1, confirmed), [existing]);
});

test("Phase 2: failed creation removes only the temporary ticket", () => {
  const temp = provisionalTicket(-9, 10);
  const existing = { ...temp, id: 12 };
  assert.deepEqual(removeProvisionalTicket([temp, existing], -9), [existing]);
  assert.deepEqual(removeProvisionalTicket([existing], -9), [existing]);
});
