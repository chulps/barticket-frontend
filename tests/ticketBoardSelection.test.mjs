import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/ticketBoardSelection.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
runInNewContext(output, { module: mod, exports: mod.exports });
const { resolveVisibleSelection } = mod.exports;
const rows = [{id:11}, {id:12}];

test("tab changes restore only a still-visible remembered row", () => {
  assert.equal(resolveVisibleSelection(rows, 12), 12);
  assert.equal(resolveVisibleSelection(rows, 33), 11);
});

test("reopened paid ticket is not restored into the paid tab", () => {
  const remainingPaid = [{id: 33}];
  assert.equal(resolveVisibleSelection(remainingPaid, 12), 33);
});

test("new shift and refresh remove stale selection without exposing other nights", () => {
  assert.equal(resolveVisibleSelection([{id:90}], 11), 90);
  assert.equal(resolveVisibleSelection([], 11), null);
  assert.equal(resolveVisibleSelection([], undefined), null);
});

test("mobile detail selection never returns an invisible row", () => {
  assert.equal(resolveVisibleSelection(rows, 200), 11);
  assert.equal(resolveVisibleSelection(rows, 12), 12);
});

test("sidebar resolves tab selection against filtered tickets, not all tickets", () => {
  const sidebar = readFileSync(new URL("../src/components/TicketSidebar.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../src/pages/Dashboard.tsx", import.meta.url), "utf8");
  assert.match(sidebar, /resolveVisibleSelection\(ticketsForTab\(tab\), lastSelectedTicket\[tab\]\)/);
  assert.match(dashboard, /ticketVisibleOnBoard\(ticket, tab, shiftLookup\)/);
  assert.match(dashboard, /showCurrentDetails = showTicketDetails && visibleSelectedTicketId === selectedTicketId/);
});
