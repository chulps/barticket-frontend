import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const hook = readFileSync(new URL("../src/hooks/useTickets.ts", import.meta.url), "utf8");
const items = readFileSync(new URL("../src/components/TicketDetails/TicketItems.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/api/tickets.ts", import.meta.url), "utf8");

test("Saved negative integer staff-drink IDs are editable; provisional fractional IDs are not", () => {
    for (const id of [-1, -2, 1, 42]) assert.equal(Number.isInteger(id), true);
    for (const id of [-0.5, -1.5]) assert.equal(Number.isInteger(id), false);
    assert.match(hook, /nextTempId = useRef\(-0\.5\)/);
    assert.match(items, /pending=\{!Number\.isInteger\(item\.id\)\}/);
    assert.doesNotMatch(items, /pending=\{item\.id < 0\}/);
    assert.equal((hook.match(/if \(!Number\.isInteger\(itemId\)\) return;/g) ?? []).length, 3);
    assert.doesNotMatch(hook, /if \(itemId < 0\) return/);
});

test("Quantity, price and removal still use the existing PATCH/DELETE item APIs", () => {
    assert.match(hook, /ticketsApi\.updateItem\(ticketId, itemId, \{ quantity \}\)/);
    assert.match(hook, /ticketsApi\.updateItem\(ticketId, itemId, \{ unit_price: rounded \}\)/);
    assert.match(hook, /ticketsApi\.removeItem\(ticketId, itemId\)/);
    assert.match(api, /method: "PATCH"/);
    assert.match(api, /method: "DELETE"/);
    assert.match(hook, /Math\.max\(1, item\.quantity \+ change\)/);
    assert.match(hook, /itemId === COVER_ITEM_ID/);
});

test("Edited frontend files parse as TSX", () => {
    for (const [name, code] of [["useTickets", hook], ["TicketItems", items]]) {
        const parsed = ts.createSourceFile(name + ".tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        assert.deepEqual(parsed.parseDiagnostics.map(d => d.messageText), [], name);
    }
});
