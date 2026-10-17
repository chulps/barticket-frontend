import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = path => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");
const api = source("api/tickets.ts");
const hook = source("hooks/useTickets.ts");
const line = source("components/TicketDetails/TicketItem.tsx");
const dialog = source("components/TicketDetails/CoverChargeModal.tsx");
const items = source("components/TicketDetails/TicketItems.tsx");
const menu = source("components/DropdownMenuItem.tsx");

test("staff waiver changes use backend #92 but do not alter attendance", () => {
    assert.match(api, /\/tickets\/\$\{ticketId\}\/cover-waivers/);
    assert.match(api, /body: \{ waived_cover_count: waivedCoverCount \}/);
    assert.match(hook, /ticketsApi\.setCoverWaivers\(ticketId, count\)/);
    assert.doesNotMatch(dialog, /ticketsApi\.setGuests/);
    assert.match(dialog, /Waiving a cover does not remove the guest/);
});
test("guest count remains full while displayed cover subtotal is net of waivers", () => {
    assert.match(api, /quantity: api\.guest_count/);
    assert.match(api, /subtotal: api\.cover_charge_total/);
    assert.match(line, /lineSubtotal \?\? unitPrice \* quantity/);
    assert.match(hook, /Math\.min\(quantity, ticket\.waivedCoverCount \?\? 0\)/);
});
test("waivers require confirmed open ticket, valid counts and no double submit", () => {
    assert.match(dialog, /Number\.isSafeInteger\(waived\)/);
    assert.match(dialog, /waived <= guests/);
    assert.match(dialog, /pending\.current/);
    assert.match(hook, /current\.status !== "open"/);
    assert.match(items, /onSetCoverWaivers\(ticket\.id, count\)/);
});
test("returning-customer linking is not sent to unsupported endpoints", () => {
    assert.match(dialog, /Returning-customer linking and payment history are pending/);
    assert.match(line, /Returning customer \(API pending\)/);
    assert.match(menu, /disabled=\{disabled\}/);
    assert.doesNotMatch(api, /\/tickets\/\$\{ticketId\}\/cover\`/);
});
test("new UI parses", () => {
    for (const path of ["components/TicketDetails/CoverChargeModal.tsx",
        "components/TicketDetails/TicketItems.tsx","components/TicketDetails/TicketItem.tsx"]) {
        const ast = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        assert.deepEqual(ast.parseDiagnostics.map(d => d.messageText), [], path);
    }
});
