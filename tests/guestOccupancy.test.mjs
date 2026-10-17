import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/guestOccupancy.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { guestOccupancyTimeline } = await import("data:text/javascript," + encodeURIComponent(outputText));

function shift(status = "open", fields = {}) {
    return {
        id: 42,
        status,
        opened_at: 100,
        closed_at: status === "closed" ? 400 : null,
        guest_count: 0,
        paid_total: 0,
        paid_count: 0,
        cancelled_count: 0,
        ...fields,
    };
}

function ticket(id, status, created_at, fields = {}) {
    return {
        id,
        shiftId: 42,
        status,
        created_at,
        updated_at: created_at,
        cancelled_at: null,
        guestCount: 0,
        returningGuestCount: 0,
        items: [],
        payment: null,
        ...fields,
    };
}

test("current shift timeline splits first-time and returning guests and keeps open tickets in the current count", () => {
    const rows = [
        ticket(1, "paid", 150, {
            guestCount: 2,
            payment: { type: "cash", paid_at: 240 },
        }),
        ticket(2, "open", 210, { guestCount: 3, returningGuestCount: 1 }),
        ticket(3, "open", 220, { shiftId: 99, guestCount: 10 }),
    ];
    const result = guestOccupancyTimeline(shift(), rows, 300);

    assert.equal(result?.peak, 5);
    assert.equal(result?.firstTime, 2);
    assert.equal(result?.returning, 1);
    assert.equal(result?.current, 3);
    assert.equal(result?.points.at(-1)?.at, 300);
});

test("closed shift timeline subtracts paid and cancelled guests and ends at zero", () => {
    const rows = [
        ticket(1, "paid", 120, {
            guestCount: 2,
            payment: { type: "cash", paid_at: 260 },
        }),
        ticket(2, "paid", 200, {
            guestCount: 3,
            returningGuestCount: 2,
            payment: { type: "card", paid_at: 260 },
        }),
        ticket(3, "cancelled", 300, {
            guestCount: 1,
            cancelled_at: 320,
        }),
    ];
    const result = guestOccupancyTimeline(shift("closed"), rows, 500);

    assert.equal(result?.peak, 5);
    assert.equal(result?.current, 0);
    assert.deepEqual(result?.points.at(-1), {
        at: 400,
        firstTime: 0,
        returning: 0,
        total: 0,
    });
});

test("falls back to cover-line quantity for ticket records without guestCount", () => {
    const row = ticket(1, "open", 120, {
        guestCount: undefined,
        items: [{ type: "cover", quantity: 4 }],
    });
    const result = guestOccupancyTimeline(shift(), [row], 200);

    assert.equal(result?.current, 4);
    assert.equal(result?.peak, 4);
});

test("does not invent a timeline when a historical shift has totals but no ticket-level history", () => {
    const historical = shift("closed", { guest_count: 6, paid_count: 4 });
    assert.equal(guestOccupancyTimeline(historical, [], 500), null);
});

test("Analytics renders the occupancy chart only for the Daily selection", () => {
    const analytics = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");
    const syntax = ts.createSourceFile("Analytics.tsx", analytics, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.equal(syntax.parseDiagnostics.length, 0);
    assert.match(analytics, /range === "day" && selected\?\.status === "open"[\s\S]*?<GuestOccupancyChart/);
    assert.match(analytics, /\{range === "day" && selected \? \([\s\S]*?<GuestOccupancyChart/);
});


test("does not show a zero timeline when a legacy shift only has revenue totals", () => {
    const historical = shift("closed", { paid_total: 25000 });
    assert.equal(guestOccupancyTimeline(historical, [], 500), null);
});
