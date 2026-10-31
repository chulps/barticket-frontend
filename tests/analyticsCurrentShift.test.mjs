import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/analyticsCurrentShift.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { initialAnalyticsShift, analyticsShiftOnDate, liveAnalyticsShift, clockedInTeam } =
    await import("data:text/javascript," + encodeURIComponent(outputText));

function shift(id, date, status = "closed", fields = {}) {
    return {
        id, business_date: date, status, opened_at: 100,
        opened_by: "Chuck", closed_by: null,
        paid_total: 0, cash_total: 0, card_total: 0, other_total: 0,
        cover_total: 0, guest_count: 0, paid_count: 0, cancelled_count: 0,
        staff_hours: [], staff_drinks: [], punches: [], stockouts: [],
        ...fields,
    };
}
function ticket(id, shiftId, status, method, items = []) {
    return {
        id, shiftId, status, payment: method ? { type: method, paid_at: 0 } : null,
        items: items.map(([type, quantity, subtotal]) => ({ type, quantity, subtotal })),
    };
}

test("Analytics opens on active business night, not the monthly tab's last closed shift", () => {
    const current = shift(99, "2026-10-12", "open");
    const closed = [shift(3, "2026-10-01"), shift(2, "2026-10-13"), shift(1, "2026-09-29")];
    assert.equal(initialAnalyticsShift(current, closed)?.id, 99);
    assert.equal(analyticsShiftOnDate("2026-10-12", current, closed)?.id, 99);
});

test("With no open shift, the most recent closed night becomes the Daily selection", () => {
    const closed = [shift(3, "2026-10-01"), shift(1, "2026-09-30"), shift(2, "2026-10-11")];
    assert.equal(initialAnalyticsShift(null, closed)?.id, 2);
    assert.equal(analyticsShiftOnDate("2026-09-30", null, closed)?.id, 1);
    assert.equal(initialAnalyticsShift(null, []), null);
    assert.equal(analyticsShiftOnDate("2026-10-04", null, closed), null);
});

test("Paid tickets drive open-shift revenue, payments and guest counts", () => {
    const current = shift(42, "2026-10-12", "open");
    const rows = [
        ticket(1, 42, "paid", "cash", [["cover", 2, 1000], ["menu", 1, 2400]]),
        ticket(2, 42, "paid", "card", [["cover", 1, 500], ["menu", 2, 3000]]),
        ticket(3, 42, "paid", "other", [["cover", 3, 1500], ["menu", 1, 2000]]),
        ticket(4, 42, "paid", null, [["menu", 1, 700]]),
    ];
    const report = liveAnalyticsShift(current, rows);
    assert.equal(report?.paid_total, 11100);
    assert.equal(report?.cash_total, 3400);
    assert.equal(report?.card_total, 3500);
    assert.equal(report?.other_total, 4200);
    assert.equal(report?.cover_total, 3000);
    assert.equal(report?.guest_count, 6);
    assert.equal(report?.paid_count, 4);
    assert.equal(report?.cancelled_count, 0);
    assert.equal(report?.status, "open");
    assert.equal(current.paid_total, 0, "the original backend report is never mutated");
});

test("Unpaid, cancelled and other-shift tickets cannot inflate live revenue", () => {
    const current = shift(42, "2026-10-12", "open", { paid_total: 9000, paid_count: 9 });
    const rows = [
        ticket(1, 42, "open", null, [["menu", 1, 20000]]),
        ticket(2, 42, "cancelled", "cash", [["menu", 1, 5000]]),
        ticket(3, 43, "paid", "cash", [["menu", 1, 9000]]),
        ticket(4, 42, "paid", "cash", [["cover", 2, 0], ["menu", 1, 1500]]),
    ];
    const report = liveAnalyticsShift(current, rows);
    assert.equal(report?.paid_total, 1500);
    assert.equal(report?.cash_total, 1500);
    assert.equal(report?.paid_count, 1);
    assert.equal(report?.cancelled_count, 1);
    assert.equal(report?.guest_count, 2, "free cover charges still count toward paid guests");
    assert.equal(report?.cover_total, 0);
});

test("Live shift uses each active payment, excludes POS voids and counts returning visitors once", () => {
    const current = shift(42, "2026-10-12", "open");
    const old = ticket(10, 42, "paid", "cash", [["cover", 2, 1000], ["menu", 1, 700]]);
    old.guestCount = 2;
    old.payments = [{ type: "cash", amount: 1700, paid_at: 1, voided_at: null }];
    const returned = ticket(11, 42, "paid", "card", [["cover", 1, 0], ["menu", 1, 550]]);
    returned.guestCount = 1;
    returned.returningGuestCount = 1;
    returned.payments = [
        { type: "cash", amount: 100, paid_at: 2, voided_at: 3 },
        { type: "card", amount: 550, paid_at: 4, voided_at: null },
    ];
    const reopened = ticket(12, 42, "open", "cash", [["menu", 1, 2200]]);
    reopened.guestCount = 0;
    reopened.payments = [{ type: "cash", amount: 1200, paid_at: 1, voided_at: null }];
    const result = liveAnalyticsShift(current, [old, returned, reopened]);
    assert.equal(result?.paid_total, 3450, "active payment records, including previously paid reopened tab");
    assert.equal(result?.cash_total, 2900);
    assert.equal(result?.card_total, 550);
    assert.equal(result?.other_total, 0);
    assert.equal(result?.guest_count, 2, "returning visitor must not be counted again");
    assert.equal(result?.cover_total, 1000, "returning and waived covers are not billed");
    assert.equal(result?.paid_count, 2);
});

test("A newly opened shift with no tickets has zero collected sales and stays selected", () => {
    const current = shift(52, "2026-10-12", "open");
    assert.equal(initialAnalyticsShift(current, [])?.id, 52);
    const report = liveAnalyticsShift(current, []);
    assert.equal(report?.paid_total, 0);
    assert.equal(report?.paid_count, 0);
    assert.equal(report?.guest_count, 0);
});

test("Closed shift data remains authoritative and is not recalculated from tickets", () => {
    const closed = shift(42, "2026-10-12", "closed", {
        paid_total: 62000, paid_count: 6, cash_total: 22000, card_total: 40000,
    });
    assert.equal(liveAnalyticsShift(closed, [ticket(1, 42, "paid", "cash", [["menu", 1, 1000]])]), closed);
    assert.equal(liveAnalyticsShift(null, []), null);
});

test("Clocked-in roster separates managers and staff without fabricating unknown roles", () => {
    const opened = shift(55, "2026-10-12", "open", {
        punches: [
            { user_id: 5, name: "Haruka", clock_in: 1000, clock_out: 1100 },
            { user_id: 1, name: "Chuck", clock_in: 1010, clock_out: null },
            { user_id: 5, name: "Haruka", clock_in: 1120, clock_out: null },
            { user_id: 9, name: "Guest", clock_in: 1200, clock_out: null },
            { user_id: 7, name: "Kanata", clock_in: 1005, clock_out: 1210 },
        ],
    });
    const users = [
        { id: 5, name: "Haruka", role: "staff" },
        { id: 1, name: "Chuck", role: "manager" },
    ];
    assert.deepEqual(clockedInTeam(opened, users), [
        { id: 1, name: "Chuck", role: "manager" },
        { id: 5, name: "Haruka", role: "staff" },
        { id: 9, name: "Guest", role: null },
    ]);
    assert.equal(clockedInTeam(opened, null).every((p) => p.role === null), true);
});

test("Live dashboard displays only when selected Daily shift is open; archived layout stays unchanged", () => {
    const analytics = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");
    const dashboard = readFileSync(new URL("../src/pages/OpenShiftOverview.tsx", import.meta.url), "utf8");
    for (const [name, sourceFile] of [["Analytics.tsx", analytics], ["OpenShiftOverview.tsx", dashboard]]) {
        const syntax = ts.createSourceFile(name, sourceFile, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        assert.equal(syntax.parseDiagnostics.length, 0, `${name} JSX parses`);
    }
    assert.match(analytics, /useState<Range>\("day"\)/);
    assert.match(analytics, /const initial = current\.shift \?\? ordered\[0\]/);
    assert.match(analytics, /range === "day" && selected\?\.status === "open"/);
    assert.match(analytics, /<OpenShiftOverview[\s\S]*?shift=\{selected as ShiftReport\}[\s\S]*?notices=\{notices\}/);
    assert.match(analytics, /\) : \(\s*<>[\s\S]*?<Summary totals=\{totals\}/);
    assert.match(analytics, /startBackgroundRefresh\(\{/);
    assert.match(analytics, /shouldPoll,/);
    assert.match(analytics, /events: \["barticket-analytics-updated", "barticket-push"/);
    assert.match(analytics, /const selected = useMemo\(\(\) => currentReport\?\.id === dayId && currentReport\.business_date === pickedDate/);
    assert.match(dashboard, /const activeStockouts = notices\?\.status === "open"/);
    assert.match(dashboard, /clockedInTeam\(shift, members\)/);
    assert.match(dashboard, /Shift IN PROGRESS|SHIFT IN PROGRESS/);
});


test("collections follow payment collection shift, never original service ownership", () => {
    const current = shift(515, "2026-10-31", "open");
    const old = {...ticket(1,514,"paid",null), payments:[
        {type:"cash",amount:1000,collection_shift_id:515},
        {type:"card",amount:2000,collection_shift_id:514},
        {type:"cash",amount:3000,collection_shift_id:515,voided_at:100},
    ]};
    const today = {...ticket(2,515,"paid",null), payments:[
        {type:"card",amount:4000,collection_shift_id:515},
        {type:"other",amount:5000,collection_shift_id:null},
        {type:"cash",amount:6000,collection_shift_id:514},
    ]};
    const actual = liveAnalyticsShift(current,[old,today]);
    assert.equal(actual.paid_total,5000);
    assert.equal(actual.cash_total,1000);
    assert.equal(actual.card_total,4000);
    assert.equal(actual.other_total,0);
    assert.equal(actual.paid_count,1);
});
