import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const admin = readFileSync(new URL("../src/pages/Admin.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/pages/Reconciliation.tsx", import.meta.url), "utf8");
const csv = readFileSync(new URL("../src/pages/reconciliationCsv.ts", import.meta.url), "utf8");

test("Reconciliation and CSV helper are valid TypeScript", () => {
    for (const [name, source, kind] of [["Reconciliation", editor, ts.ScriptKind.TSX], ["reconciliationCsv", csv, ts.ScriptKind.TS]]) {
        const parsed = ts.createSourceFile(name + ".tsx", source, ts.ScriptTarget.Latest, true, kind);
        assert.equal(parsed.parseDiagnostics.length, 0, parsed.parseDiagnostics.map(d => d.messageText).join(", "));
    }
});
test("Reconciliation stays inside manager-only Admin", () => {
    assert.match(admin, /me\?\.role !== "manager"/);
    assert.match(admin, /section === "history" \? <Reconciliation/);
});
test("Draft and CSV preview never submit or change real records", () => {
    assert.match(editor, /disabled title=/);
    assert.match(editor, /importPreview\(/);
    assert.doesNotMatch(editor, /apiRequest\(|fetch\(|accountApi\.createUser\(/);
    assert.match(csv, /duplicate date/);
    assert.match(csv, /state: !existing \? "new"/);
});
