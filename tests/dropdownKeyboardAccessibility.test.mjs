import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const text = path => readFileSync(new URL("../src/components/" + path, import.meta.url), "utf8");
const popup = text("DropdownMenu.tsx");
const option = text("DropdownMenuItem.tsx");
const ticket = text("TicketDetails/TicketItem.tsx");
const menu = text("MenuItemRow.tsx");

test("icon-only triggers are named and expose menu relationship and expanded state", () => {
  assert.match(popup, /aria-label=\{label\}/);
  assert.match(popup, /aria-haspopup="menu"/);
  assert.match(popup, /aria-expanded=\{isOpen\}/);
  assert.match(popup, /aria-controls=\{isOpen \? menuId : undefined\}/);
  assert.match(popup, /role="menu"/);
  assert.match(option, /role="menuitem"/);
  assert.match(ticket, /"Actions for " \+ name/);
  assert.match(menu, /"Actions for " \+ menuLabel\(locale, item\.name\)/);
});
test("opens focused and supports Escape, arrows, Home and End", () => {
  assert.match(popup, /choice\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(popup, /event\.key === "Escape"/);
  assert.match(popup, /event\.key === "ArrowDown"/);
  assert.match(popup, /event\.key === "ArrowUp"/);
  assert.match(popup, /event\.key === "Home"/);
  assert.match(popup, /event\.key === "End"/);
  assert.match(popup, /triggerRef\.current\?\.focus\(\)/);
});
test("outside click, scroll and resize dismiss without leaving a visible portal", () => {
  assert.match(popup, /closeMenu\(false\)/);
  assert.match(popup, /skipFocusReturn\.current = !restore/);
  assert.match(popup, /!skipFocusReturn\.current && popup\.contains\(document\.activeElement\)/);
  assert.match(popup, /window\.addEventListener\("scroll"/);
  assert.match(popup, /window\.addEventListener\("resize"/);
  assert.match(popup, /const availableBelow =/);
  assert.match(popup, /popup\.contains\(document\.activeElement\)/);
  assert.match(popup, /top: \$\{\(\{ \$top \}\) =>/);
  assert.match(popup, /right: \$\{\(\{ \$right \}\) =>/);
  assert.match(popup, /const openAbove =/);
});
test("components parse", () => {
  for (const [path,code] of [["DropdownMenu.tsx",popup],["DropdownMenuItem.tsx",option],
   ["TicketItem.tsx",ticket],["MenuItemRow.tsx",menu]]) {
    const f=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    assert.deepEqual(f.parseDiagnostics.map(d=>d.messageText),[],path);
  }
});
