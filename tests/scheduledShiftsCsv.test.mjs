import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/scheduledShiftsCsv.ts", import.meta.url), "utf8");
const transpiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const module = { exports: {} };
new Function("require", "module", "exports", transpiled)(createRequire(import.meta.url), module, module.exports);
const { buildScheduleBatch, defaultScheduleMapping } = module.exports;

const users = [
    { id: 1, name: "Chuck", role: "manager" },
    { id: 2, name: "Haruka", role: "staff" },
];

test("schedule mapping uses assigned staff columns without turning values into hours", () => {
    const csv = { headers: ["DATE", "Manager", "Haruka", "Guest", "Event", "Staff Hours"], rows: [
        ["2026-11-03", "Chuck", "5.5", "", "Closed · maintenance", "5.5"],
        ["2026-11-04", "", "", "1", "Open", ""],
    ] };
    const result = buildScheduleBatch(csv, {
        date: "DATE", manager: "Manager", staffNames: "", staffColumns: ["Haruka", "Guest"], event: "Event", uncertainty: "",
    }, users, "November 2026 Daily Reports.csv");

    assert.deepEqual(result.rows.map(row => [row.business_date, row.manager, row.staff, row.event_value, row.source_row]), [
        ["2026-11-03", { name: "Chuck", user_id: 1 }, [{ name: "Haruka", user_id: 2 }], "Closed · maintenance", 2],
        ["2026-11-04", null, [{ name: "Guest", user_id: null }], "Open", 3],
    ]);
    assert.equal(Object.hasOwn(result.rows[0], "hours"), false);
    assert.equal(result.rows.length, 2);
});

test("schedule mapping keeps unmatched typed names and ignores empty assignments", () => {
    const csv = { headers: ["Date", "Manager", "Staff", "Event"], rows: [
        ["2026-11-03", "", "Unknown bartender; Haruka", "Special"],
        ["2026-11-04", "", "", ""],
    ] };
    const mapping = defaultScheduleMapping(csv.headers, users);
    const result = buildScheduleBatch(csv, mapping, users, "November.csv");
    assert.deepEqual(result.rows[0].staff, [
        { name: "Unknown bartender", user_id: null },
        { name: "Haruka", user_id: 2 },
    ]);
    assert.equal(result.rows.length, 1);
});

test("schedule CSV accepts one month and rejects invalid dates, duplicate manager assignments, or mixed months", () => {
    const mapping = { date: "Date", manager: "Manager", staffNames: "Staff", staffColumns: [], event: "", uncertainty: "" };
    const csv = rows => ({ headers: ["Date", "Manager", "Staff"], rows });
    assert.throws(() => buildScheduleBatch(csv([["2026-02-30", "Chuck", ""]]), mapping, users, "bad.csv"), /YYYY-MM-DD/);
    assert.throws(() => buildScheduleBatch(csv([["2026-11-03", "Chuck", "Chuck"]]), mapping, users, "bad.csv"), /manager is also listed/);
    assert.throws(() => buildScheduleBatch(csv([["2026-10-31", "Chuck", ""], ["2026-11-01", "Chuck", ""]]), mapping, users, "mixed.csv"), /one source month/);
});

test("schedule CSV helper parses as TypeScript", () => {
    const parsed = ts.createSourceFile("scheduledShiftsCsv.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    assert.deepEqual(parsed.parseDiagnostics.map(issue => issue.messageText), []);
});
