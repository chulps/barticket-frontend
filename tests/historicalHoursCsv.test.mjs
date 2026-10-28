import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/historicalHoursCsv.ts", import.meta.url), "utf8");
const transpiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const module = { exports: {} };
new Function("require", "module", "exports", transpiled)(createRequire(import.meta.url), module, module.exports);
const { buildHistoricalHoursBatch } = module.exports;

const users = [
    { id: 1, name: "Haruka", role: "staff" },
    { id: 2, name: "Kanata", role: "staff" },
];

test("maps original sheet rows to staff and skips blank scheduled-hour cells", () => {
    const result = buildHistoricalHoursBatch(
        { headers: ["DATE", "Staff", "Staff Hours"], rows: [
            ["2026-10-02", "Haruka", "5.5"],
            ["2026-10-03", "Haruka", ""],
            ["2026-10-26", "Haruka", "2.5"],
            ["2026-10-29", "Haruka", ""],
        ] },
        { date: "DATE", staff: "Staff", hours: "Staff Hours" },
        users, "October 2026 Daily Reports.csv",
    );
    assert.equal(result.sourceFile, "October 2026 Daily Reports.csv (2026-10)");
    assert.deepEqual(result.rows.map(row => [row.user_id, row.hours, row.source_row, row.source_column]), [
        [1, 5.5, 2, "Staff Hours"],
        [1, 2.5, 4, "Staff Hours"],
    ]);
});

test("leaves unknown names unmapped and rejects mixed months or invalid hours", () => {
    const unknown = buildHistoricalHoursBatch(
        { headers: ["DATE", "Staff", "Staff Hours"], rows: [["2026-09-05", "Guest bartender", "4"]] },
        { date: "DATE", staff: "Staff", hours: "Staff Hours" }, users, "hours.csv",
    );
    assert.equal(unknown.rows[0].user_id, null);
    assert.throws(() => buildHistoricalHoursBatch(
        { headers: ["DATE", "Staff", "Staff Hours"], rows: [["2026-09-05", "Haruka", "4"], ["2026-10-01", "Haruka", "3"]] },
        { date: "DATE", staff: "Staff", hours: "Staff Hours" }, users, "hours.csv",
    ), /one source month/);
    assert.throws(() => buildHistoricalHoursBatch(
        { headers: ["DATE", "Staff", "Staff Hours"], rows: [["2026-09-05", "Haruka", "25"]] },
        { date: "DATE", staff: "Staff", hours: "Staff Hours" }, users, "hours.csv",
    ), /between 0 and 24/);
});

test("helper source parses as TypeScript", () => {
    const parsed = ts.createSourceFile("historicalHoursCsv.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    assert.deepEqual(parsed.parseDiagnostics.map(issue => issue.messageText), []);
});
