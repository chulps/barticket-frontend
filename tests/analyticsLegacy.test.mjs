import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/analyticsLegacy.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { paymentAllocation, ticketCountsUnavailable } =
  await import("data:text/javascript," + encodeURIComponent(outputText));

const night = (props = {}) => ({
  paid_total: 0,
  cash_total: 0,
  card_total: 0,
  other_total: 0,
  guest_count: 0,
  paid_count: 0,
  cancelled_count: 0,
  ...props,
});
const allocationTotal = row => Object.values(paymentAllocation(row)).reduce((a, b) => a + b, 0);

test("September Google Sheets import displays its revenue in the nightly bar with unknown method", () => {
  const imported = night({ paid_total: 37600, guest_count: 11 });
  assert.deepEqual(paymentAllocation(imported),
    { cash: 0, card: 0, other: 0, unknown: 37600 });
  assert.equal(allocationTotal(imported), imported.paid_total);
  assert.equal(ticketCountsUnavailable(imported), true);
});

test("partial payment tracking keeps known methods and shows only the unallocated amount as unknown", () => {
  const row = night({ paid_total: 50000, cash_total: 12000, card_total: 25000, guest_count: 8, paid_count: 4 });
  assert.deepEqual(paymentAllocation(row), {
    cash: 12000, card: 25000, other: 0, unknown: 13000,
  });
  assert.equal(allocationTotal(row), 50000);
  assert.equal(ticketCountsUnavailable(row), false);
});

test("fully recorded current nights remain unchanged, including explicitly recorded Other", () => {
  const row = night({ paid_total: 24000, cash_total: 10000, card_total: 8000, other_total: 6000,
    paid_count: 4, cancelled_count: 1, guest_count: 7 });
  assert.deepEqual(paymentAllocation(row),
    { cash: 10000, card: 8000, other: 6000, unknown: 0 });
  assert.equal(ticketCountsUnavailable(row), false);
});

test("mixed months and all-time totals always reconcile to the sum of recorded nightly revenue", () => {
  const shifts = [
    night({ paid_total: 17500, guest_count: 4 }), // imported Sep 1
    night({ paid_total: 37600, guest_count: 11 }), // imported Sep 2
    night({ paid_total: 32000, cash_total: 18000, card_total: 14000, paid_count: 9 }),
  ];
  const total = shifts.reduce((s, row) => s + row.paid_total, 0);
  const grouped = shifts.map(paymentAllocation).reduce((s, row) => s + Object.values(row).reduce((a, b) => a + b, 0), 0);
  assert.equal(total, 87100);
  assert.equal(grouped, total);
  assert.equal(shifts.filter(ticketCountsUnavailable).length, 2);
});

test("a zero-revenue zero-guest night is not automatically marked as untracked", () => {
  const empty = night();
  assert.deepEqual(paymentAllocation(empty),
    { cash: 0, card: 0, other: 0, unknown: 0 });
  assert.equal(ticketCountsUnavailable(empty), false);
  assert.equal(ticketCountsUnavailable(night({ paid_total: 0, guest_count: 3 })), true);
});

test("recorded ticket status counts are never inferred from the number of guests", () => {
  const counted = night({ paid_total: 9500, guest_count: 20, paid_count: 2, cancelled_count: 1 });
  assert.equal(ticketCountsUnavailable(counted), false);
  assert.equal(counted.paid_count, 2);
  assert.equal(counted.cancelled_count, 1);
  const notCounted = night({ paid_total: 9500, guest_count: 20 });
  assert.equal(ticketCountsUnavailable(notCounted), true);
  assert.equal(notCounted.paid_count, 0); // stored zero means not recorded, not twenty paid tickets
});

test("inconsistent historical methods never inflate the visualized revenue", () => {
  const inconsistent = night({ paid_total: 10000, cash_total: 9000, card_total: 9000 });
  assert.deepEqual(paymentAllocation(inconsistent),
    { cash: 0, card: 0, other: 0, unknown: 10000 });
  assert.equal(allocationTotal(inconsistent), inconsistent.paid_total);
});
