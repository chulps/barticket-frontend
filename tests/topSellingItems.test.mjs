import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/topSellingItems.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { topSellingItems } = await import("data:text/javascript," + encodeURIComponent(outputText));

const line = (id, name, quantity, unitPrice, extra = {}) =>
  ({ id, type: "menu", menu_item_id: id, name, quantity, unit_price: unitPrice,
     subtotal: quantity * unitPrice, ...extra });
const ticket = (id, shiftId, status, items) =>
  ({ id, shiftId, status, items });

test("ranks top three by units sold, not total revenue", () => {
  const tickets = [
    ticket(1, 10, "paid", [line(1, "Highball", 7, 700), line(2, "Expensive Whisky", 2, 5000),
      line(3, "Beer", 5, 900), line(4, "Gin & Tonic", 1, 800)]),
  ];
  assert.deepEqual(topSellingItems(tickets, new Set([10])).map(x => x.name), ["Highball", "Beer", "Expensive Whisky"]);
});

test("combines the same menu item across tickets and serving sizes", () => {
  const rows = topSellingItems([
    ticket(1, 10, "paid", [line(25, "Whisky 15ml", 2, 1000)]),
    ticket(2, 10, "paid", [line(25, "Whisky 30ml", 3, 1800)]),
  ], new Set([10]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 5);
  assert.equal(rows[0].revenue, 7400);
});

test("night/month/year/all-time selections use only the selected shift IDs", () => {
  const tickets = [
    ticket(1, 10, "paid", [line(1, "Highball", 2, 700)]),
    ticket(2, 11, "paid", [line(2, "Beer", 3, 900)]),
    ticket(3, 20, "paid", [line(3, "Whisky", 4, 1200)]),
  ];
  assert.deepEqual(topSellingItems(tickets, new Set([10])).map(r => r.name), ["Highball"]);
  assert.deepEqual(topSellingItems(tickets, new Set([10, 11])).map(r => r.name), ["Beer", "Highball"]);
  assert.deepEqual(topSellingItems(tickets, new Set([10, 11, 20])).map(r => r.name), ["Whisky", "Beer", "Highball"]);
});

test("ignores open and cancelled tickets, cover charges and staff drinks", () => {
  const tickets = [
    ticket(1, 1, "paid", [
      line(1, "Highball", 3, 700),
      { id: 0, type: "cover", name: "Cover Charge", quantity: 99, subtotal: 49500 },
      line(2, "Staff Drink", 50, 500, { staff_drink: true }),
    ]),
    ticket(2, 1, "cancelled", [line(3, "Beer", 99, 900)]),
    ticket(3, 1, "open", [line(4, "Wine", 99, 1000)]),
    ticket(4, null, "paid", [line(5, "No Shift", 99, 700)]),
  ];
  assert.deepEqual(topSellingItems(tickets, new Set([1])).map(r => [r.name, r.quantity]), [["Highball", 3]]);
});

test("ignores invalid quantities and returns stable tie order", () => {
  const tickets = [ticket(1, 1, "paid", [
    line(3, "C", 2, 900), line(2, "B", 2, 700), line(1, "A", 2, 700),
    line(4, "Bad", 0, 700), line(5, "NaN", Number.NaN, 700),
  ])];
  assert.deepEqual(topSellingItems(tickets, new Set([1])).map(r => r.name), ["C", "A", "B"]);
  assert.deepEqual(topSellingItems(tickets, new Set([])), []);
});

test("groups legacy items without menu ID by recorded item name", () => {
  const rows = topSellingItems([
    ticket(1, 1, "paid", [line(8, "Zangi", 1, 700, { menu_item_id: null })]),
    ticket(2, 1, "paid", [line(9, "zangi", 2, 700, { menu_item_id: null })]),
  ], new Set([1]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 3);
});
