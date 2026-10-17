import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function source(path) { return readFileSync(new URL("../src/" + path, import.meta.url), "utf8"); }
const header = source("components/TicketDetails/TicketHeader.tsx");
const picker = source("components/AddItemPicker.tsx");
const menu = source("pages/Menu.tsx");
const actions = source("components/TicketDetails/TicketActions.tsx");
const ticket = source("components/TicketDetails/Ticket.tsx");
const footer = source("components/TicketDetails/TicketFooter.tsx");

test("Editing ticket name prepopulates current value for keyboard users", () => {
    assert.ok(header.includes("setNameDraft(ticket.name)"));
    assert.match(header, /<NameTrigger/);
});
test("Ticket name save requires nonblank trimmed text, and cancel cannot submit", () => {
    assert.match(header, /const next = nameDraft\.trim\(\)/);
    assert.match(header, /if \(next && next !== ticket\.name\) onUpdateName/);
    assert.match(header, /onSubmit=\{saveEditingName\}/);
    assert.match(header, /onClick=\{cancelEditingName\}/);
    assert.doesNotMatch(header, /onBlur=\{finishEditingName\}/);
});
test("Add-item search clears on selection and stays above its scrollable results", () => {
    assert.match(picker, /addSelection\(previous, item, priceKey\)/);
    assert.ok(picker.includes('setSearch("")'));
    assert.match(picker, /position: sticky; top: 0; z-index: 5/);
    assert.match(picker, /flex: 1 1 0; overflow-y: auto/);
});
test("Drink menu search stays beneath app header and portals", () => {
    assert.match(menu, /<StickySearch>/);
    assert.match(menu, /position: sticky/);
    assert.match(menu, /z-index: 90/);
});
test("Close ticket uses a reversible second stage before existing payment or cancellation", () => {
    assert.match(actions, /onEnterClose/);
    assert.match(actions, /onBackToItems/);
    assert.match(actions, /Close ticket/);
    assert.match(actions, /confirmCancellation/);
    assert.match(actions, /<PaymentModal/);
    assert.match(ticket, /closingTicketId === ticket\.id/);
    assert.match(ticket, /closing \? \(/);
    assert.match(footer, /closing=\{closing\}/);
});
test("Changed components parse cleanly as TSX", () => {
    for (const [name, code] of [["TicketHeader", header], ["AddItemPicker", picker], ["Menu", menu], ["TicketActions", actions], ["Ticket", ticket], ["TicketFooter", footer]]) {
        const parsed = ts.createSourceFile(name + ".tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        assert.deepEqual(parsed.parseDiagnostics.map(d => d.messageText), [], name);
    }
});
