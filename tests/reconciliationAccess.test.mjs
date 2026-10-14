import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const admin = readFileSync(new URL("../src/pages/Admin.tsx", import.meta.url), "utf8");
const reconciliation = readFileSync(new URL("../src/pages/Reconciliation.tsx", import.meta.url), "utf8");
const csv = readFileSync(new URL("../src/pages/reconciliationCsv.ts", import.meta.url), "utf8");

test("Reconciliation prototypes remain available for later phases but are not mounted in Phase 1", () => {
    assert.doesNotMatch(admin, /from "\.\/Reconciliation"/);
    assert.doesNotMatch(admin, /<Reconciliation/);
    assert.doesNotMatch(admin, /section === "history"/);
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

test("Future CSV/draft prototypes have no database write or API request side effects", () => {
    assert.match(reconciliation, /disabled title=/);
    assert.match(reconciliation, /importPreview\(/);
    assert.doesNotMatch(reconciliation, /apiRequest\(|fetch\(|accountApi\.createUser\(/);
    assert.match(csv, /duplicate date/);
});
