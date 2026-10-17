import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");
const api = read("api/tickets.ts");
const hook = read("hooks/useTickets.ts");
const item = read("components/TicketDetails/TicketItem.tsx");
const picker = read("components/TicketDetails/TicketItems.tsx");
const modal = read("components/TicketDetails/CoverChargeModal.tsx");
const payment = read("components/PaymentModal.tsx");
const reopen = read("components/TicketDetails/ReopenTicketModal.tsx");
const actions = read("components/TicketDetails/TicketActions.tsx");

test("waive cover uses merged backend #91, recording an audit reason and preserving guest count", () => {
    assert.ok(api.includes("/tickets/" + "$" + "{ticketId}/cover"));
    assert.ok(!api.includes("/tickets/" + "$" + "{ticketId}/cover-waivers"));
    assert.match(api, /body: adjustment/);
    assert.match(hook, /ticketsApi\.adjustCover\(ticketId, adjustment\)/);
    assert.match(modal, /"Complimentary cover"/);
    assert.match(modal, /reason: reason\.trim\(\)/);
    assert.doesNotMatch(modal, /setGuests\(/);
});
test("returning customers require valid same-shift paid source and prevent cover double claims", () => {
    assert.match(modal, /candidate\.status !== "paid"/);
    assert.match(modal, /candidate\.shiftId !== ticket\.shiftId/);
    assert.match(modal, /other\.returningFromTicketId === candidate\.id/);
    assert.match(modal, /availableOnSource >= returning/);
    assert.match(picker, /openCoverAdjustment\("returning"\)/);
    assert.match(item, /Returning customer/);
});
test("cover guest attendance and net cover money are independent", () => {
    assert.match(api, /quantity: api\.guest_count/);
    assert.match(api, /subtotal: api\.cover_charge_total/);
    assert.match(item, /lineSubtotal \?\? unitPrice \* quantity/);
    assert.match(hook, /ticket\.waivedCoverCount \?\? 0/);
    assert.match(hook, /ticket\.returningGuestCount \?\? 0/);
});
test("waiver flow defaults to one, pre-fills reason, guards double submits and errors", () => {
    assert.match(modal, /mode === "waiver" && !\(ticket\.waivedCoverCount \?\? 0\) && guests > 0 \? 1/);
    assert.match(modal, /Change reason \(optional\)/);
    assert.match(modal, /pending\.current/);
    assert.match(modal, /Number\.isSafeInteger\(waived\)/);
    assert.match(modal, /ticket\.status !== "open"/);
});
test("reopen distinguishes returns from manager-only mistaken-payment POS void; payment collects balance", () => {
    assert.match(api, /"customer_returned" \| "closed_by_mistake"/);
    assert.match(actions, /canCorrectPayment=\{canCorrectPayment\}/);
    assert.match(reopen, /canCorrectPayment &&/);
    assert.match(reopen, /DOES NOT refund/);
    assert.match(payment, /ticket\.balanceDue \?\?/);
    assert.match(payment, /Previously paid/);
});
test("all new ticket UI TSX parses without syntax errors", () => {
    for (const path of ["components/TicketDetails/CoverChargeModal.tsx",
        "components/TicketDetails/TicketItems.tsx", "components/TicketDetails/TicketItem.tsx",
        "components/TicketDetails/ReopenTicketModal.tsx", "components/TicketDetails/TicketFooter.tsx",
        "components/TicketDetails/TicketActions.tsx"]) {
        const ast = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        assert.deepEqual(ast.parseDiagnostics.map(d => d.messageText), [], path);
    }
});
