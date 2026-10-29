import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const s = readFileSync(new URL("../src/pages/AdminTeamEditors.tsx", import.meta.url), "utf8");

test("staff editor keeps unsupported time and bonus proposals explicitly unsaved", () => {
    for (const kind of ["drinkback", "bonus"]) {
        assert.match(s, new RegExp('copyProposal\\("'+kind+'"\\)'));
    }
    assert.match(s, /UNSAVED_PROPOSAL_ONLY/);
    assert.match(s, /employee_id: person\.id/);
    assert.match(s, /navigator\.clipboard\.writeText/);
});
test("hourly rates require a current preview and an explicit save confirmation", () => {
    assert.match(s, /disabled=\{!readyRate \|\| rateLoading \|\| !!rateError \|\| !previewMatchesRate \|\| savingRate\}/);
    assert.match(s, /window\.confirm/);
    assert.match(s, /Confirm and save/);
    assert.doesNotMatch(s, /accountApi\.(?:updatePay|saveHours|saveBonus)/);
    assert.match(s, /Save — unavailable/);
});
test("staff editor continues to parse correctly", () => {
    const ast = ts.createSourceFile("AdminTeamEditors.tsx", s, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.deepEqual(ast.parseDiagnostics.map(d => d.messageText), []);
});
