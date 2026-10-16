import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");

test("inline ticket price editor exposes Save and Cancel with pending state", () => {
  const item = read("components/TicketDetails/TicketItem.tsx");
  assert.match(item, /<PriceEditForm onSubmit=/);
  assert.match(item, /type="submit"/);
  assert.match(item, /onClick=\{onCancelPrice\}/);
  assert.match(item, /onCancelPrice\(\)/);
  assert.match(item, /event\.stopPropagation\(\)/);
  assert.match(item, /aria-label=\{locale === "ja"/);
  assert.match(item, /disabled=\{savingPrice/);
  assert.doesNotMatch(item, /onSavePrice\(unitPrice\)/);
  assert.deepEqual(ts.createSourceFile("TicketItem.tsx", item, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics, []);
});

test("inline edited price validates and awaits confirmation before leaving", () => {
  const item = read("components/TicketDetails/TicketItem.tsx");
  const items = read("components/TicketDetails/TicketItems.tsx");
  const hook = read("hooks/useTickets.ts");
  assert.match(item, /Number\.isSafeInteger\(Number\(priceInput\)\)/);
  assert.match(item, /if \(priceSavingRef\.current \|\| pending\) return/);
  assert.match(item, /const saved = await onSavePrice\(next\)/);
  assert.match(items, /const saved = await onUpdatePrice\(ticket\.id, item\.id, price\)/);
  assert.match(items, /if \(saved\) setEditingPriceItemId\(null\)/);
  assert.match(hook, /const saved = await enqueue\(ticketId/);
  assert.match(hook, /return saved !== null/);
});
