import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/ticketDataExport.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { ticketDataForClipboard, ticketListDataForClipboard } = await import("data:text/javascript," + encodeURIComponent(outputText));

function ticket(id, fields = {}) {
    return {
        id,
        name: "Guest",
        status: "paid",
        items: [{
            id: 0,
            type: "cover",
            name: "Cover Charge",
            unit_price: 500,
            quantity: 2,
            subtotal: 1000,
        }],
        created_at: 100,
        updated_at: 200,
        cancelled_at: null,
        created_by: "Manager",
        shiftId: 7,
        payment: { type: "cash", paid_at: 200 },
        guestCount: 2,
        returningGuestCount: 1,
        returningFromTicketId: 3,
        ...fields,
    };
}

test("individual ticket export includes returning guest audit fields and cover details", () => {
    const result = ticketDataForClipboard(ticket(11), "2026-10-17");

    assert.equal(result.ticket_id, 11);
    assert.equal(result.business_date, "2026-10-17");
    assert.equal(result.guest_count, 2);
    assert.equal(result.returning_guest_count, 1);
    assert.equal(result.returning_from_ticket_id, 3);
    assert.equal(result.cover_charge_total, 1000);
    assert.equal(result.paid_at, 200);
});

test("ticket export defaults missing returning data to zero and does not mutate ticket input", () => {
    const row = ticket(12, {
        returningGuestCount: undefined,
        returningFromTicketId: undefined,
        guestCount: undefined,
    });
    const before = structuredClone(row);
    const result = ticketDataForClipboard(row, null);

    assert.equal(result.guest_count, 2);
    assert.equal(result.returning_guest_count, 0);
    assert.equal(result.returning_from_ticket_id, null);
    assert.deepEqual(row, before);
});

test("paid ticket batch export returns every supplied ticket with shift date context", () => {
    const rows = [ticket(21), ticket(22, { shiftId: 8, returningGuestCount: 0 })];
    const result = ticketListDataForClipboard(rows, new Map([[7, "2026-10-17"], [8, "2026-10-18"]]));

    assert.equal(result.ticket_count, 2);
    assert.deepEqual(result.tickets.map(row => row.ticket_id), [21, 22]);
    assert.deepEqual(result.tickets.map(row => row.business_date), ["2026-10-17", "2026-10-18"]);
    assert.equal(result.tickets[1].returning_guest_count, 0);
});
