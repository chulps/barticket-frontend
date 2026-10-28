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

test("maps staff columns to source cells and keeps explicit zero-hour rows", () => {
    const result = buildHistoricalHoursBatch(
        { headers: ["date", "Haruka total", "Kanata total"], rows: [["2026-09-05", "5.5", "0"]] },
        { date: "date", "hours:Haruka": "Haruka total", "hours:Kanata": "Kanata total" },
        ["Haruka", "Kanata"], users, "hours.csv",
    );
    assert.equal(result.sourceFile, "hours.csv (2026-09)");
    assert.deepEqual(result.rows.map(row => [row.user_id, row.hours, row.source_row, row.source_column]), [
        [1, 5.5, 2, "Haruka total"],
        [2, 0, 2, "Kanata total"],
    ]);
});

test("leaves guest identities unmapped and rejects mixed months or invalid hours", () => {
    const guest = buildHistoricalHoursBatch(
        { headers: ["date", "Guest"], rows: [["2026-09-05", "4"]] },
        { date: "date", "hours:Guest bartender": "Guest" },
        ["Guest bartender"], users, "hours.csv",
    );
    assert.equal(guest.rows[0].user_id, null);
    assert.throws(() => buildHistoricalHoursBatch(
        { headers: ["date", "Haruka"], rows: [["2026-09-05", "4"], ["2026-10-01", "3"]] },
        { date: "date", "hours:Haruka": "Haruka" }, ["Haruka"], users, "hours.csv",
    ), /one source month/);
    assert.throws(() => buildHistoricalHoursBatch(
        { headers: ["date", "Haruka"], rows: [["2026-09-05", "25"]] },
        { date: "date", "hours:Haruka": "Haruka" }, ["Haruka"], users, "hours.csv",
    ), /between 0 and 24/);
});

test("helper source parses as TypeScript", () => {
    const parsed = ts.createSourceFile("historicalHoursCsv.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    assert.deepEqual(parsed.parseDiagnostics.map(issue => issue.messageText), []);
});
