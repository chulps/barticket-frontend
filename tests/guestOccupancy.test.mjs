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

test("closed shift timeline excludes cancelled tickets from occupancy", () => {
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
            returningGuestCount: 1,
            cancelled_at: 320,
        }),
    ];
    const result = guestOccupancyTimeline(shift("closed"), rows, 500);

    assert.equal(result?.peak, 5);
    assert.equal(result?.current, 0);
    assert.equal(result?.points.some((point) => point.at === 300 || point.at === 320), false);
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
    assert.match(analytics, /\{range === "day" && selected && selected\.id !== null \? \([\s\S]*?<GuestOccupancyChart/);
});


test("does not show a zero timeline when a legacy shift only has revenue totals", () => {
    const historical = shift("closed", { paid_total: 25000 });
    assert.equal(guestOccupancyTimeline(historical, [], 500), null);
});


test("service completion removes unpaid guests and later collections never move departure", () => {
    const departed = ticket(1, "open", 120, {
        guestCount: 3, serviceStatus: "completed", serviceCompletedAt: 200,
        deferredAt: 200, updated_at: 280, settlementStatus: "outstanding",
    });
    const beforeCollection = guestOccupancyTimeline(shift(), [departed], 300);
    const afterCollection = guestOccupancyTimeline(shift(), [{ ...departed,
        status: "paid", settlementStatus: "settled", payments: [{ paid_at: 280 }],
    }], 300);
    assert.equal(beforeCollection.current, 0);
    assert.deepEqual(afterCollection, beforeCollection);
    assert.equal(beforeCollection.points.find(point => point.at === 200).total, 0);
});

test("deferred timestamp supports older payloads and reopened service overrides stale settlement", () => {
    const row = ticket(1, "open", 120, { guestCount: 2, serviceStatus: "completed", deferredAt: 200 });
    assert.equal(guestOccupancyTimeline(shift(), [row], 300).current, 0);
    assert.equal(guestOccupancyTimeline(shift(), [{ ...row, serviceStatus: "active", payment: { paid_at: 180 } }], 300).current, 2);
});

test("cancelled service is excluded and guest corrections replace counts", () => {
    const row = ticket(1, "open", 120, { guestCount: 2, serviceStatus: "active" });
    assert.equal(guestOccupancyTimeline(shift(), [{ ...row, guestCount: 4, returningGuestCount: 1 }], 300).current, 4);
    assert.equal(guestOccupancyTimeline(shift(), [{ ...row, serviceStatus: "cancelled" }], 300).peak, 0);
});

test("local clock advances a stable overnight timeline without changing counts or prior points", () => {
    const opened = Date.parse("2026-10-31T23:00:00+09:00") / 1000;
    const night = shift("open", { opened_at: opened });
    const rows = [ticket(1, "open", opened + 30, { guestCount: 2, serviceStatus: "active" })];
    const before = guestOccupancyTimeline(night, rows, opened + 3600);
    const after = guestOccupancyTimeline(night, rows, opened + 7200);
    assert.equal(after.current, 2);
    assert.deepEqual(after.points.slice(0, -1), before.points.slice(0, -1));
    assert.equal(after.end - before.end, 3600);
    const chart = readFileSync(new URL("../src/components/GuestOccupancyChart.tsx", import.meta.url), "utf8");
    assert.match(chart, /timeZone: "Asia\/Tokyo"/);
});

test("ticket adapter preserves server service completion time", () => {
    const adapter = readFileSync(new URL("../src/api/tickets.ts", import.meta.url), "utf8");
    assert.match(adapter, /serviceCompletedAt: api\.service_completed_at/);
});

test("voiding or refunding a later collection cannot reopen completed service", () => {
    const row = ticket(1, "paid", 120, {
        guestCount: 2, serviceStatus: "completed", serviceCompletedAt: 200,
        payments: [{ paid_at: 280 }],
    });
    const before = guestOccupancyTimeline(shift(), [row], 300);
    const after = guestOccupancyTimeline(shift(), [{ ...row, status: "open",
        payments: [{ paid_at: 280, voided_at: 290 }], payment: { paid_at: 280, refunded_at: 290 },
    }], 300);
    assert.deepEqual(after, before);
});

test("unknown modern service completion does not invent departure from collection or update", () => {
    const row = ticket(1, "paid", 120, {
        guestCount: 2, serviceStatus: "completed", updated_at: 280,
        payments: [{ paid_at: 280 }],
    });
    assert.equal(guestOccupancyTimeline(shift(), [row], 300), null);
});
