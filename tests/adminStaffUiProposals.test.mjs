import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const s = readFileSync(new URL("../src/pages/AdminTeamEditors.tsx", import.meta.url), "utf8");

test("staff editor has copyable, explicit unsaved proposals for all four workflows", () => {
    for (const kind of ["terms", "drinkback", "hours", "bonus"]) {
        assert.match(s, new RegExp('copyProposal\\("'+kind+'"\\)'));
    }
    assert.match(s, /UNSAVED_PROPOSAL_ONLY/);
    assert.match(s, /employee_id: person\.id/);
    assert.match(s, /navigator\.clipboard\.writeText/);
});
test("all copy actions require validated draft input and never call financial endpoints", () => {
    for (const guard of ["readyRate", "readyDrinkback", "readyHours", "readyBonus"]) {
        assert.match(s, new RegExp('disabled=\\{!'+guard+'\\}'));
    }
    assert.doesNotMatch(s, /accountApi\.(?:updatePay|saveHours|saveBonus)/);
    assert.match(s, /Save — unavailable/);
});
test("staff editor continues to parse correctly", () => {
    const ast = ts.createSourceFile("AdminTeamEditors.tsx", s, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.deepEqual(ast.parseDiagnostics.map(d => d.messageText), []);
});
