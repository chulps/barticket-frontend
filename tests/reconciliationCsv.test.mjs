import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/reconciliationCsv.ts", import.meta.url), "utf8");
const transpiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const module = { exports: {} };
new Function("require", "module", "exports", transpiled)(createRequire(import.meta.url), module, module.exports);
const { importPreview } = module.exports;
const mapping = { date: "DATE", manager: "Manager", revenue: "Revenue", guests: "Guests", event: "Event" };

test("manager disagreements identify differing records without merging managers", () => {
    const data = {
        headers: ["DATE", "Revenue", "Guests", "Manager", "Staff", "Event", "Staff Hours"],
        rows: [["2026-10-16", "18700", "7", "Nori", "Haruka", "Open", "5.75"]],
    };
    const existing = [{ business_date: "2026-10-16", opened_by: "Chuck", paid_total: 18700, guest_count: 7 }];
    const result = importPreview(data, mapping, existing);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.preview[0].differences, ["manager"]);
    assert.equal(result.preview[0].state, "conflict");
    assert.equal(result.preview[0].imported.manager, "Nori");
    assert.equal(result.preview[0].existing.opened_by, "Chuck");
});

test("closed days with blank sales and guest cells remain valid for read-only comparison", () => {
    const data = {
        headers: ["DATE", "Revenue", "Guests", "Manager", "Staff", "Event", "Staff Hours"],
        rows: [["2026-10-26", "", "", "Nori", "Haruka", "Closed", "2.5"]],
    };
    const result = importPreview(data, mapping, []);
    assert.deepEqual(result.errors, []);
    assert.equal(result.preview[0].state, "new");
    assert.equal(result.preview[0].imported.event, "Closed");
    assert.equal(result.preview[0].imported.revenue, 0);
    assert.equal(result.preview[0].imported.guests, 0);
});

test("event and staff-hour values do not create false conflicts in the report comparison", () => {
    const data = {
        headers: ["DATE", "Revenue", "Guests", "Manager", "Staff", "Event", "Staff Hours"],
        rows: [["2026-10-02", "41900", "10", "Nori", "Haruka", "Open", "5.5"]],
    };
    const existing = [{ business_date: "2026-10-02", opened_by: "Nori", paid_total: 41900, guest_count: 10 }];
    const result = importPreview(data, mapping, existing);
    assert.deepEqual(result.errors, []);
    assert.equal(result.preview[0].state, "match");
    assert.deepEqual(result.preview[0].differences, []);
});
