import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/components/TicketDetails/TicketItems.tsx", import.meta.url), "utf8");

test("closed tickets use the saved historical item name, not the current menu label", () => {
  assert.match(source, /activeTab === "open"[\s\S]*?menu\?\.items\.find[\s\S]*?: item\.name/);
  assert.match(source, /item\.staff_drink/);
  assert.match(source, /item\.type === "cover"/);
  assert.match(source, /unitPrice=\{item\.unit_price\}/);
});

test("ticket list component remains valid TSX", () => {
  const parsed=ts.createSourceFile("TicketItems.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics.map(d=>d.messageText),[]);
});
