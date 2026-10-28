import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const admin = readFileSync(new URL("../src/pages/Admin.tsx", import.meta.url), "utf8");
const reconciliation = readFileSync(new URL("../src/pages/Reconciliation.tsx", import.meta.url), "utf8");
const csv = readFileSync(new URL("../src/pages/reconciliationCsv.ts", import.meta.url), "utf8");

test("historical-hour reconciliation is reachable from the manager-only Admin area", () => {
    assert.match(admin, /from "\.\/Reconciliation"/);
    assert.match(admin, /<Reconciliation shifts=\{historicalShifts\} users=\{team\}/);
    assert.match(admin, /me\?\.role !== "manager"/);
    assert.match(admin, /id: "historicalHours"/);
});

test("Reconciliation prototypes and CSV helper parse as TypeScript", () => {
    for (const [name, source, kind] of [
        ["Reconciliation", reconciliation, ts.ScriptKind.TSX],
        ["reconciliationCsv", csv, ts.ScriptKind.TS],
    ]) {
        const parsed = ts.createSourceFile(name + ".tsx", source, ts.ScriptTarget.Latest, true, kind);
        assert.equal(parsed.parseDiagnostics.length, 0, parsed.parseDiagnostics.map(d => d.messageText).join(", "));
    }
});

test("history preview remains read-only until a manager explicitly imports selected cells", () => {
    assert.match(reconciliation, /disabled title=/);
    assert.match(reconciliation, /importPreview\(/);
    assert.match(reconciliation, /historicalHoursApi\.reconcile/);
    assert.match(reconciliation, /historicalHoursApi\.import/);
    assert.match(reconciliation, /window\.confirm\(confirmText\)/);
    assert.match(reconciliation, /row\.state === "new" \|\| row\.state === "conflict"/);
    assert.match(csv, /duplicate date/);
});
