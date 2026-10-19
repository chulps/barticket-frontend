import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const { outputText } = ts.transpileModule(readFileSync(new URL("../src/pages/analyticsDataExport.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { collectAnalyticsExport, sourcesForScope } = await import("data:text/javascript," + encodeURIComponent(outputText));
const fixtures = {
    "/tickets": [{ id: 1, status: "paid", payments: [{ voided_at: 1 }] }, { id: 2, status: "cancelled", cancelled_at: 2 }, { id: 3, status: "open", returning_from_ticket_id: 1 }],
    "/shifts": [{ id: 3, punches: [{ clock_in: 1, clock_out: null }] }],
    "/analytics/shifts": [{ id: 1, paid_total: 18300 }],
    "/menu": { coverCharge: 500, items: [{ id: 1, prices: { standard: 700 }, extra: "retained" }] },
    "/menu/archived": { items: [{ id: 2 }] },
    "/users": [{ id: 7, role: "manager" }],
    "/notices": { notices: [] },
};

test("all-time export preserves raw records across all statuses, embedded payments and punches", async () => {
    const calls = [], progress = [];
    const result = await collectAnalyticsExport(async path => { calls.push(path); return structuredClone(fixtures[path]); }, p => progress.push(p));
    assert.equal(result.all_requested_sources_exported, true);
    assert.equal(result.database_backup, false);
    assert.deepEqual(calls, Object.keys(fixtures));
    assert.deepEqual(result.data.tickets, fixtures["/tickets"]);
    assert.deepEqual(result.data.shifts, fixtures["/shifts"]);
    assert.equal(result.data.menu.items[0].extra, "retained");
    assert.equal(result.sources.find(x => x.key === "menu").record_count, 1);
    assert.deepEqual(progress.at(-1), { completed: 7, total: 7 });
    assert.ok(result.limitations.some(x => x.includes("transaction-consistent")));
});

test("partial export identifies missing data and does not leak error details", async () => {
    const result = await collectAnalyticsExport(async path => {
        if (path === "/users") throw Object.assign(new Error("SECRET CONNECTION STRING"), { status: 403 });
        if (path === "/menu/archived") throw Object.assign(new Error("SECRET"), { status: 404 });
        return fixtures[path];
    });
    assert.equal(result.all_requested_sources_exported, false);
    assert.equal(result.sources.filter(x => x.status === "failed").length, 2);
    assert.equal(result.sources.find(x => x.key === "users").http_status, 403);
    assert.equal("users" in result.data, false);
    assert.ok(!JSON.stringify(result).includes("SECRET"));
});

test("expired sessions and cancellation abort instead of producing a misleading file", async () => {
    for (const error of [Object.assign(new Error(), { status: 401 }), Object.assign(new Error(), { name: "AbortError" })]) {
        let calls = 0;
        await assert.rejects(collectAnalyticsExport(async () => { calls++; throw error; }));
        assert.equal(calls, 1);
    }
});

test("all failures stop download; invalid response envelopes are marked failed", async () => {
    await assert.rejects(collectAnalyticsExport(async () => ({ detail: "Unexpected error" })), /No data/);
    const result = await collectAnalyticsExport(async path => path === "/tickets" ? {} : fixtures[path]);
    assert.equal(result.all_requested_sources_exported, false);
    assert.equal(result.sources[0].status, "failed");
});

test("menu and admin downloads request only their own sources with explicit scope", async () => {
    for (const scope of ["menu", "admin"]) {
        const calls = [];
        const result = await collectAnalyticsExport(async path => { calls.push(path); return fixtures[path]; }, undefined, scope);
        assert.equal(result.scope, scope);
        assert.deepEqual(calls, sourcesForScope(scope).map(x => x.path));
        assert.equal("tickets" in result.data, false);
    }
    assert.deepEqual(sourcesForScope("menu").map(x => x.key), ["menu", "archived_menu"]);
    assert.deepEqual(sourcesForScope("admin").map(x => x.key), ["shifts", "closed_shift_analytics", "users"]);
});
