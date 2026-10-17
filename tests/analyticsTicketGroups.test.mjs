import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/analyticsTicketGroups.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { groupAnalyticsTickets } = await import("data:text/javascript," + encodeURIComponent(outputText));

const row = (id, shiftId, status) => ({ id, shiftId, status, items: [] });

test("Analytics groups paid tickets before cancelled tickets without mixing statuses", () => {
    const dates = new Map([[3, "2026-10-14"], [4, "2026-10-15"]]);
    const tickets = [
        row(8, 4, "cancelled"),
        row(7, 4, "paid"),
        row(2, 3, "cancelled"),
        row(1, 3, "paid"),
        row(3, 3, "paid"),
    ];
    const grouped = groupAnalyticsTickets(tickets, dates);
    assert.deepEqual(grouped.paid.map(x => x.id), [1, 3, 7]);
    assert.deepEqual(grouped.cancelled.map(x => x.id), [2, 8]);
    assert.deepEqual(tickets.map(x => x.id), [8, 7, 2, 1, 3], "Must not mutate source ticket order");
});

test("Only completed tickets belonging to selected shifts appear in the groups", () => {
    const dates = new Map([[9, "2026-10-15"]]);
    const grouped = groupAnalyticsTickets([
        row(1, 9, "open"),
        row(2, 9, "paid"),
        row(3, 8, "cancelled"),
        row(4, null, "paid"),
        row(5, 9, "cancelled"),
    ], dates);
    assert.deepEqual(grouped.paid.map(x => x.id), [2]);
    assert.deepEqual(grouped.cancelled.map(x => x.id), [5]);
    assert.deepEqual(groupAnalyticsTickets([], dates), { paid: [], cancelled: [] });
});

test("Ticket history provides labelled status sections and preserves expandable ticket details", () => {
    const analytics = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");
    const ast = ts.createSourceFile("Analytics.tsx", analytics, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.deepEqual(ast.parseDiagnostics.map(d => d.messageText), []);
    assert.match(analytics, /groupAnalyticsTickets\(tickets, dates\)/);
    assert.match(analytics, /title: t\("paid"\), rows: groups\.paid/);
    assert.match(analytics, /title: t\("cancelled"\), rows: groups\.cancelled/);
    assert.match(analytics, /<TicketStatusGroup[\s\S]*?<TicketRow[\s\S]*?<ItemList>/);
});
